// Routes AI cho người dùng: OCR, trích xuất thông tin, tra cứu ngữ nghĩa (RAG), chat SSE
import { FastifyInstance } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth, requireRole } from '../plugins/auth.js';
import { chatStream, chatOnce, ocrText, type ChatMessage } from '../lib/ai.js';
import { AI_NOT_CONFIGURED, getAiConfig, retrieve } from '../services/ai.service.js';

// OCR chỉ nhận jpg/png/pdf, ≤20MB
const OCR_MAX_MB = 20;
const OCR_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

// Thông báo lỗi OCR chung
const ocrErr = (msg: string) => msg || 'Dịch vụ OCR không khả dụng, vui lòng thử lại sau';

// ---- Zod schemas ----
const searchSchema = z.object({
  q: z.string().trim().min(1, 'Vui lòng nhập từ khoá tìm kiếm').max(500),
  topK: z.coerce.number().int().min(1).max(50).default(10),
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1, 'Nội dung tin nhắn không được để trống').max(8000),
      }),
    )
    .min(1, 'Vui lòng gửi ít nhất một tin nhắn')
    .max(30),
});

// Khuôn dạng thông tin trích xuất từ văn bản (LLM trả JSON thuần)
const FIELDS_LOAI_VB = ['CV', 'BC', 'QD', 'TT', 'CT', 'KH', 'DT', 'TC', 'TB', 'HD', 'VB'] as const;
type ExtractedFields = {
  soKyHieu: string;
  ngayBanHanh: string;
  nguoiKy: string;
  trichYeu: string;
  noiNhan: string;
  loaiVB: string;
};

/** Nhận multipart file (field "file"), kiểm tra đuôi + trả buffer — lỗi trả { error } */
async function readUpload(req: import('fastify').FastifyRequest): Promise<{
  buffer: Buffer;
  filename: string;
  mime: string;
} | { error: string }> {
  let part;
  try {
    part = await req.file({ limits: { fileSize: OCR_MAX_MB * 1024 * 1024 } });
  } catch {
    return { error: `File vượt quá giới hạn ${OCR_MAX_MB}MB hoặc không hợp lệ` };
  }
  if (!part) return { error: 'Vui lòng gửi file trong field "file"' };
  const ext = path.extname(part.filename || '').toLowerCase();
  if (!OCR_ALLOWED_EXT.has(ext)) {
    return { error: 'Chỉ nhận file JPG, PNG hoặc PDF' };
  }
  const buffer = await part.toBuffer();
  return { buffer, filename: part.filename, mime: part.mimetype || 'application/octet-stream' };
}

/** Gọi OCR service — map lỗi thành thông điệp sạch tiếng Việt */
async function runOcr(
  ocrUrl: string,
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<{ text?: string; error?: string }> {
  try {
    return { text: await ocrText(ocrUrl, buffer, filename, mime) };
  } catch (err) {
    return { error: ocrErr(err instanceof Error ? err.message : '') };
  }
}

/** Tách JSON thuần từ câu trả lời LLM (chịu được markdown fence / text thừa) */
function parseJsonLoose(raw: string): unknown | null {
  let s = raw.trim();
  s = s.replace(/```(?:json)?/gi, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Trích xuất thông tin văn bản bằng LLM — fail an toàn → null */
async function extractFields(cfg: Awaited<ReturnType<typeof getAiConfig>>, text: string): Promise<ExtractedFields | null> {
  if (cfg.chatProvider === 'none') return null;
  const prompt =
    'Bạn là bộ trích xuất thông tin văn bản hành chính. Dưới đây là nội dung OCR của một văn bản đi. ' +
    'Hãy trích xuất thông tin và CHỈ trả về JSON thuần (không giải thích, không markdown) đúng khuôn dạng:\n' +
    '{"soKyHieu":"","ngayBanHanh":"","nguoiKy":"","trichYeu":"","noiNhan":"","loaiVB":""}\n' +
    '- ngayBanHanh: dạng YYYY-MM-DD; nếu không rõ thì để chuỗi rỗng\n' +
    '- loaiVB: một trong CV|BC|QD|TT|CT|KH|DT|TC|TB|HD|VB, đoán từ nội dung\n' +
    '- Thông tin không có trong văn bản thì để chuỗi rỗng\n\n' +
    `NỘI DUNG OCR:\n"""\n${text.slice(0, 12000)}\n"""`;
  try {
    const raw = await chatOnce(cfg, [{ role: 'user', content: prompt }]);
    const json = parseJsonLoose(raw);
    if (!json || typeof json !== 'object') return null;
    const o = json as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    const loaiVB = str('loaiVB').toUpperCase();
    return {
      soKyHieu: str('soKyHieu'),
      ngayBanHanh: str('ngayBanHanh'),
      nguoiKy: str('nguoiKy'),
      trichYeu: str('trichYeu'),
      noiNhan: str('noiNhan'),
      loaiVB: (FIELDS_LOAI_VB as readonly string[]).includes(loaiVB) ? loaiVB : '',
    };
  } catch (err) {
    console.warn('Trích xuất thông tin bằng AI thất bại:', err);
    return null;
  }
}

export default async function aiRoutes(app: FastifyInstance) {
  // POST /ai/ocr — nhận diện chữ (mọi vai trò, chỉ cần OCR service chạy, không phụ thuộc AI chat/embed)
  app.post('/ai/ocr', { preHandler: requireAuth }, async (req, reply) => {
    const up = await readUpload(req);
    if ('error' in up) return reply.code(400).send({ error: up.error });
    const cfg = await getAiConfig();
    const r = await runOcr(cfg.ocrUrl, up.buffer, up.filename, up.mime);
    if (r.error) return reply.code(502).send({ error: r.error });
    return { text: r.text };
  });

  // POST /ai/ocr-extract — OCR + LLM trích xuất thông tin (VANTHU, ADMIN)
  app.post('/ai/ocr-extract', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    const up = await readUpload(req);
    if ('error' in up) return reply.code(400).send({ error: up.error });
    const cfg = await getAiConfig();
    const r = await runOcr(cfg.ocrUrl, up.buffer, up.filename, up.mime);
    if (r.error) return reply.code(502).send({ error: r.error, text: null, fields: null });
    // LLM trích xuất — lỗi an toàn: vẫn trả text, fields = null
    const fields = await extractFields(cfg, r.text ?? '');
    return { text: r.text ?? null, fields };
  });

  // POST /ai/search — tra cứu ngữ nghĩa trên đoạn vector (mọi vai trò)
  app.post('/ai/search', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = searchSchema.parse(req.body);
    const cfg = await getAiConfig();
    if (cfg.embedProvider === 'none') {
      return reply.code(400).send({ error: AI_NOT_CONFIGURED });
    }
    try {
      const results = await retrieve(cfg, parsed.q, parsed.topK);
      return { results };
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Tra cứu AI thất bại, vui lòng thử lại sau',
      });
    }
  });

  // POST /ai/chat — chat RAG, trả SSE: sources → delta... → done
  app.post('/ai/chat', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = chatSchema.parse(req.body);
    const cfg = await getAiConfig();
    if (cfg.chatProvider === 'none') {
      return reply.code(400).send({ error: AI_NOT_CONFIGURED });
    }
    const lastUser = [...parsed.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      return reply.code(400).send({ error: 'Vui lòng gửi nội dung câu hỏi' });
    }

    // RAG: truy vấn dữ liệu văn bản theo câu hỏi mới nhất
    let sources: Awaited<ReturnType<typeof retrieve>> = [];
    let dataBlock = '(Không có dữ liệu văn bản nào trong hệ thống)';
    if (cfg.embedProvider !== 'none') {
      try {
        sources = await retrieve(cfg, lastUser.content, 6);
        if (sources.length > 0) {
          dataBlock = sources
            .map(
              (s, i) =>
                `[${i + 1}] Số vào sổ: ${s.soVaoSo} | Số ký hiệu: ${s.soKyHieu} | Ngày ban hành: ${s.ngayBanHanh}\nTrích yếu: ${s.trichYeu}\nNội dung: ${s.snippet}`,
            )
            .join('\n\n');
        }
      } catch (err) {
        console.warn('RAG retrieval cho chat thất bại, chat không kèm dữ liệu:', err);
      }
    }

    const systemPrompt =
      'Bạn là trợ lý tra cứu sổ văn bản đi của cơ quan. Chỉ trả lời dựa trên dữ liệu văn bản dưới đây; ' +
      'nếu không đủ dữ liệu hãy nói rõ không tìm thấy. Trích dẫn số vào sổ + số ký hiệu khi trả lời.\n\n' +
      `DỮ LIỆU VĂN BẢN:\n${dataBlock}`;

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...parsed.messages,
    ];

    // SSE thủ công — hijack reply, ghi thẳng vào socket
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);

    send({ type: 'sources', sources: sources.map(({ snippet, ...s }) => ({ ...s, snippet })) });
    try {
      for await (const delta of chatStream(cfg, llmMessages)) {
        send({ type: 'delta', text: delta });
      }
    } catch (err) {
      // Lỗi giữa stream → báo client rồi vẫn kết thúc gọn
      send({
        type: 'error',
        message: err instanceof Error ? err.message : 'Lỗi máy AI, vui lòng thử lại sau',
      });
    } finally {
      send({ type: 'done' });
      raw.end();
    }
    return reply;
  });
}
