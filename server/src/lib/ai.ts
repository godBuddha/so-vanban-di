// Thư viện client AI — chuẩn hoá 2 loại provider (Ollama local / OpenAI-compatible)
// Cung cấp: chatStream (streaming), embed, rerank (chuẩn Jina/SiliconFlow), OCR proxy.
// Mọi lỗi đều ném ra thông điệp tiếng Việt có ngữ cảnh để route trả về client.
import { AiConfig } from '@prisma/client';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// Timeout mỗi loại call (ms)
const CHAT_TIMEOUT_MS = 120_000;
const CALL_TIMEOUT_MS = 60_000; // embed / rerank / ocr

/** Bọc lỗi fetch thành thông điệp tiếng Việt có ngữ cảnh */
function wrapErr(context: string, err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new Error(`${context}: hết thời gian chờ phản hồi`);
    }
    // fetch ECONNREFUSED / ENOTFOUND... thường không có message hữu ích
    const detail = (err as { cause?: { code?: string } }).cause?.code ?? err.message;
    return new Error(`${context}: ${detail}`);
  }
  return new Error(`${context}: lỗi không xác định`);
}

/** Đọc HTTP body thành các dòng (hỗ trợ NDJSON của Ollama và SSE của OpenAI) */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

/**
 * Streaming chat. Trả async generator từng đoạn text (delta).
 * - Ollama: POST {ollamaBaseUrl}/api/chat — NDJSON, delta ở message.content
 * - OpenAI-compatible: POST {openaiBaseUrl}/v1/chat/completions — SSE, delta ở choices[0].delta.content
 */
export async function* chatStream(
  cfg: AiConfig,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const base = (cfg.chatProvider === 'ollama' ? cfg.ollamaBaseUrl : cfg.openaiBaseUrl)?.replace(/\/+$/, '');
  if (!base) throw new Error('Cấu hình AI chat chưa đúng: thiếu địa chỉ máy chủ (baseUrl)');

  let url: string;
  let payload: unknown;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.chatProvider === 'ollama') {
    url = `${base}/api/chat`;
    payload = { model: cfg.chatModel, messages, stream: true };
  } else {
    url = `${base}/v1/chat/completions`;
    payload = { model: cfg.chatModel, messages, stream: true };
    if (cfg.openaiApiKey) headers.Authorization = `Bearer ${cfg.openaiApiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    throw wrapErr(
      `Không kết nối được máy AI chat (${cfg.chatProvider}) tại ${url}`,
      err,
    );
  }
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Máy AI chat trả lỗi ${res.status}: ${detail || 'không có chi tiết'}`);
  }

  const provider = cfg.chatProvider;
  for await (const line of readLines(res.body)) {
    if (!line) continue;
    // OpenAI-compatible SSE: "data: {...}" / "data: [DONE]"
    const dataLine = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (dataLine === '[DONE]') return;
    let json: {
      message?: { content?: string };
      choices?: { delta?: { content?: string } }[];
      error?: { message?: string };
    };
    try {
      json = JSON.parse(dataLine);
    } catch {
      continue; // dòng rác (comment/keep-alive) — bỏ qua
    }
    if (json.error?.message) throw new Error(`Máy AI chat trả lỗi: ${json.error.message}`);
    const delta = provider === 'ollama' ? json.message?.content : json.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/** Chat không stream — gom toàn bộ stream thành chuỗi (dùng cho trích xuất OCR) */
export async function chatOnce(cfg: AiConfig, messages: ChatMessage[]): Promise<string> {
  let out = '';
  for await (const delta of chatStream(cfg, messages)) out += delta;
  return out;
}

/**
 * Nhúng văn bản thành vector.
 * - Ollama: POST /api/embed {model, input:[...]} → embeddings[][]
 * - OpenAI: POST /v1/embeddings {model, input} → data[].embedding (sắp theo index)
 */
export async function embed(cfg: AiConfig, texts: string[]): Promise<number[][]> {
  const isOllama = cfg.embedProvider === 'ollama';
  const base = (isOllama ? cfg.ollamaBaseUrl : cfg.openaiBaseUrl)?.replace(/\/+$/, '');
  if (!base) throw new Error('Cấu hình AI embed chưa đúng: thiếu địa chỉ máy chủ (baseUrl)');

  const url = isOllama ? `${base}/api/embed` : `${base}/v1/embeddings`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isOllama && cfg.openaiApiKey) headers.Authorization = `Bearer ${cfg.openaiApiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.embedModel, input: texts }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    throw wrapErr(`Không kết nối được máy AI embed (${cfg.embedProvider}) tại ${url}`, err);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Máy AI embed trả lỗi ${res.status}: ${detail || 'không có chi tiết'}`);
  }
  const json = (await res.json()) as {
    embeddings?: number[][];
    data?: { index?: number; embedding: number[] }[];
  };
  if (isOllama) {
    if (!Array.isArray(json.embeddings)) throw new Error('Máy AI embed trả dữ liệu không đúng khuôn dạng');
    return json.embeddings;
  }
  if (!Array.isArray(json.data)) throw new Error('Máy AI embed trả dữ liệu không đúng khuôn dạng');
  return [...json.data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
}

/**
 * Rerank chuẩn Jina/SiliconFlow: POST {rerankBaseUrl}/rerank {model, query, documents, top_n}
 * Trả về chỉ số tài nguyên theo thứ tự điểm giảm dần.
 */
export async function rerank(cfg: AiConfig, query: string, documents: string[]): Promise<number[]> {
  const base = cfg.rerankBaseUrl?.replace(/\/+$/, '');
  if (!base) throw new Error('Cấu hình AI rerank chưa đúng: thiếu địa chỉ máy chủ (baseUrl)');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.rerankApiKey) headers.Authorization = `Bearer ${cfg.rerankApiKey}`;

  let res: Response;
  try {
    res = await fetch(`${base}/rerank`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.rerankModel, query, documents, top_n: documents.length }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    throw wrapErr(`Không kết nối được máy AI rerank tại ${base}/rerank`, err);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Máy AI rerank trả lỗi ${res.status}: ${detail || 'không có chi tiết'}`);
  }
  const json = (await res.json()) as { results?: { index: number; relevance_score?: number }[] };
  if (!Array.isArray(json.results)) throw new Error('Máy AI rerank trả dữ liệu không đúng khuôn dạng');
  return [...json.results]
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .map((r) => r.index);
}

/** Gọi dịch vụ OCR (PaddleOCR): POST {ocrUrl}/ocr với multipart file → text */
export async function ocrText(ocrUrl: string, buffer: Buffer, filename: string, mime: string): Promise<string> {
  const base = ocrUrl.replace(/\/+$/, '');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime || 'application/octet-stream' }), filename);

  let res: Response;
  try {
    res = await fetch(`${base}/ocr`, { method: 'POST', body: form, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } catch (err) {
    throw wrapErr(`Dịch vụ OCR không phản hồi (${base}/ocr)`, err);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Dịch vụ OCR trả lỗi ${res.status}: ${detail || 'không có chi tiết'}`);
  }
  const json = (await res.json().catch(() => null)) as
    | { text?: string; result?: { texts?: string[] }; results?: { text?: string }[] }
    | null;
  if (typeof json?.text === 'string') return json.text;
  if (Array.isArray(json?.result?.texts)) return json.result.texts.join('\n');
  if (Array.isArray(json?.results)) return json.results.map((r) => r.text ?? '').join('\n');
  throw new Error('Dịch vụ OCR trả dữ liệu không đúng khuôn dạng');
}
