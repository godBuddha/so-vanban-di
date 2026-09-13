// Service AI: cấu hình singleton, đánh chỉ mục vector (RAG), truy vấn ngữ nghĩa
// Lỗi AI phải "mềm" — không bao giờ làm hỏng nghiệp vụ nhập sổ (im lặng + console.warn)
import { AiConfig, Document } from '@prisma/client';
import prisma from '../db.js';
import { embed, rerank } from '../lib/ai.js';
import { DOC_TYPE_INFO } from '../utils/docTypes.js';

// Thông báo chung khi chưa cấu hình AI (UI tiếng Việt)
export const AI_NOT_CONFIGURED =
  'Chưa cấu hình AI: hãy yêu cầu quản trị viên cấu hình trong Quản trị → Trợ lý AI';

// Kích thước chunk ký tự khi đánh chỉ mục
const CHUNK_SIZE = 800;
// Số văn bản nhúng mỗi lô khi reindex
const EMBED_BATCH = 16;

/** Đọc cấu hình AI — tự tạo dòng mặc định id=1 nếu chưa có */
export async function getAiConfig(): Promise<AiConfig> {
  const cfg = await prisma.aiConfig.findUnique({ where: { id: 1 } });
  if (cfg) return cfg;
  return prisma.aiConfig.create({ data: { id: 1 } });
}

// ============ Đánh chỉ mục vector ============

/** Ghép văn bản Document thành đoạn text dùng cho embedding */
export function buildDocumentText(d: Document): string {
  const parts = [
    `Số vào sổ: ${d.soVaoSo}/${d.nam}`,
    `Số ký hiệu: ${d.soKyHieu}`,
    `Loại văn bản: ${DOC_TYPE_INFO[d.loaiVB].label}`,
    `Ngày ban hành: ${d.ngayBanHanh.toISOString().slice(0, 10)}`,
    `Người ký: ${d.nguoiKy}`,
    `Nơi nhận: ${d.noiNhan}`,
    `Trích yếu: ${d.trichYeu}`,
  ];
  if (d.ghiChu) parts.push(`Ghi chú: ${d.ghiChu}`);
  return parts.filter(Boolean).join('\n');
}

/** Cắt text thành các đoạn ≤ maxLen ký tự (tách theo từ, không cắt giữa chữ) */
export function chunkText(text: string, maxLen = CHUNK_SIZE): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > maxLen) {
      chunks.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Đóng gói vector thành chuỗi literal cho pgvector: [0.1,0.2,...] */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Đánh chỉ mục một văn bản: xoá chunk cũ, nhúng và ghi chunk mới trong transaction.
 * - embedProvider=none → bỏ qua im lặng (trả null)
 * - Lỗi AI → console.warn, không ném (an toàn khi gọi fire-and-forget)
 */
export async function indexDocument(documentId: number): Promise<{ chunks: number } | null> {
  try {
    const cfg = await getAiConfig();
    if (cfg.embedProvider === 'none') return null; // chưa bật AI — bỏ qua im lặng
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return null;

    const parts = chunkText(buildDocumentText(doc));
    // Nhúng hàng loạt theo lô (giới hạn số input mỗi request)
    const vectors: number[][] = [];
    for (let i = 0; i < parts.length; i += EMBED_BATCH) {
      const batch = parts.slice(i, i + EMBED_BATCH);
      vectors.push(...(await embed(cfg, batch)));
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId } });
      for (let i = 0; i < parts.length; i++) {
        await tx.$executeRaw`INSERT INTO "DocumentChunk" ("documentId", "content", "embedding")
          VALUES (${documentId}, ${parts[i]}, ${toVectorLiteral(vectors[i])}::vector)`;
      }
    });
    return { chunks: parts.length };
  } catch (err) {
    console.warn(`Đánh chỉ mục AI cho văn bản #${documentId} thất bại (bỏ qua):`, err);
    return null;
  }
}

// ============ Truy vấn ngữ nghĩa (RAG retrieval) ============

export interface RetrievalHit {
  documentId: number;
  soVaoSo: number;
  soKyHieu: string;
  trichYeu: string;
  ngayBanHanh: string; // YYYY-MM-DD
  score: number;       // độ tương đồng cosine 0..1
  snippet: string;     // đoạn nội dung để hiển thị
}

const SNIPPET_LEN = 220;

/**
 * Truy vấn pgvector: topK*3 kết quả gần nhất, có rerank (nếu cấu hình) rồi cắt topK.
 * Ném lỗi khi embed/rerank thất bại — nơi gọi tự quyết định trả lỗi hay bỏ qua.
 */
export async function retrieve(cfg: AiConfig, query: string, topK: number): Promise<RetrievalHit[]> {
  const [queryVec] = await embed(cfg, [query]);
  const vecLiteral = toVectorLiteral(queryVec);

  const rows = await prisma.$queryRaw<
    {
      id: number;
      documentId: number;
      content: string;
      score: number;
      soVaoSo: number;
      soKyHieu: string;
      trichYeu: string;
      ngayBanHanh: Date | string;
    }[]
  >`
    SELECT c.id, c."documentId", c.content,
           1 - (c.embedding <=> ${vecLiteral}::vector) AS score,
           d."soVaoSo", d."soKyHieu", d."trichYeu", d."ngayBanHanh"
    FROM "DocumentChunk" c
    JOIN "documents" d ON d.id = c."documentId"
    ORDER BY c.embedding <=> ${vecLiteral}::vector
    LIMIT ${topK * 3}`;

  const hits = rows.map((r) => ({
    documentId: r.documentId,
    soVaoSo: r.soVaoSo,
    soKyHieu: r.soKyHieu,
    trichYeu: r.trichYeu,
    ngayBanHanh:
      typeof r.ngayBanHanh === 'string'
        ? r.ngayBanHanh.slice(0, 10)
        : r.ngayBanHanh.toISOString().slice(0, 10),
    score: Number(r.score),
    content: r.content,
  }));

  // Rerank theo nội dung nếu cấu hình — lỗi rerank thì fallback thứ tự vector
  let ordered = hits;
  if (cfg.rerankProvider !== 'none') {
    try {
      const idx = await rerank(cfg, query, hits.map((h) => h.content));
      ordered = idx.map((i) => hits[i]).filter(Boolean);
    } catch (err) {
      console.warn('Rerank thất bại, dùng thứ tự vector:', err);
    }
  }

  return ordered.slice(0, topK).map(({ content, ...rest }) => ({
    ...rest,
    snippet: content.length > SNIPPET_LEN ? `${content.slice(0, SNIPPET_LEN)}…` : content,
  }));
}
