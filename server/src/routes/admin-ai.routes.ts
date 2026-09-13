// Routes quản trị AI (chỉ ADMIN): cấu hình provider, trạng thái dịch vụ, reindex
import { FastifyInstance } from 'fastify';
import { AiConfig } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db.js';
import { requireRole } from '../plugins/auth.js';
import { AI_NOT_CONFIGURED, getAiConfig, indexDocument } from '../services/ai.service.js';

// Mask apiKey khi trả về client — không bao giờ lộ key qua API
const MASK = '••••';

function maskConfig(c: AiConfig) {
  return {
    ...c,
    openaiApiKey: c.openaiApiKey ? MASK : null,
    rerankApiKey: c.rerankApiKey ? MASK : null,
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ---- Zod schema PUT /config — mọi trường optional; '' nghĩa là xoá giá trị ----
const configSchema = z.object({
  chatProvider: z.enum(['none', 'ollama', 'openai']).optional(),
  ollamaBaseUrl: z.string().trim().max(300).optional(),
  openaiBaseUrl: z.string().trim().max(300).optional(),
  openaiApiKey: z.string().max(300).optional(), // gửi lại MASK "••••" → giữ nguyên key cũ
  chatModel: z.string().trim().max(120).optional(),
  embedProvider: z.enum(['none', 'ollama', 'openai']).optional(),
  embedModel: z.string().trim().max(120).optional(),
  rerankProvider: z.enum(['none', 'openai']).optional(),
  rerankBaseUrl: z.string().trim().max(300).optional(),
  rerankApiKey: z.string().max(300).optional(),
  rerankModel: z.string().trim().max(120).optional(),
  ocrUrl: z.string().trim().max(300).optional(),
});

// Cập nhật trạng thái dịch vụ OCR (health check timeout 5s)
async function checkOcr(url: string): Promise<{ status: 'ok' | 'error'; url: string }> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
    return { status: res.ok ? 'ok' : 'error', url };
  } catch {
    return { status: 'error', url };
  }
}

export default async function adminAiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('ADMIN')); // mọi route dưới đây chỉ ADMIN

  // GET /admin/ai/config — cấu hình hiện tại (apiKey được mask)
  app.get('/config', async () => {
    const cfg = await getAiConfig();
    return { data: maskConfig(cfg) };
  });

  // PUT /admin/ai/config — cập nhật (upsert singleton id=1); KHÔNG ghi apiKey ra audit
  app.put('/config', async (req) => {
    const parsed = configSchema.parse(req.body);
    const data: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(parsed)) {
      // Giữ nguyên key cũ khi client gửi lại giá trị mask
      if ((key === 'openaiApiKey' || key === 'rerankApiKey') && value === MASK) continue;
      data[key] = value === '' ? null : (value as string);
    }
    const cfg = await prisma.aiConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    return { data: maskConfig(cfg) };
  });

  // GET /admin/ai/status — trạng thái OCR + các provider AI + số liệu chỉ mục
  app.get('/status', async () => {
    const cfg = await getAiConfig();
    const [chunks, documents, grouped] = await Promise.all([
      prisma.documentChunk.count(),
      prisma.document.count(),
      prisma.documentChunk.groupBy({ by: ['documentId'] }),
    ]);
    return {
      ocr: await checkOcr(cfg.ocrUrl),
      chat: { provider: cfg.chatProvider, model: cfg.chatModel },
      embed: { provider: cfg.embedProvider, model: cfg.embedModel },
      rerank: { provider: cfg.rerankProvider, model: cfg.rerankModel },
      chunks,
      documents,
      indexedDocs: grouped.length,
    };
  });

  // POST /admin/ai/reindex — đánh chỉ mục lại (1 văn bản hoặc toàn bộ)
  app.post('/reindex', async (req, reply) => {
    const { documentId } = z
      .object({ documentId: z.number().int().positive().optional() })
      .parse(req.body ?? {});
    const cfg = await getAiConfig();
    if (cfg.embedProvider === 'none') {
      return reply.code(400).send({ error: AI_NOT_CONFIGURED });
    }
    if (documentId !== undefined) {
      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      if (!doc) return reply.code(404).send({ error: 'Không tìm thấy văn bản' });
    }
    const docs = await prisma.document.findMany({
      where: documentId !== undefined ? { id: documentId } : undefined,
      orderBy: { id: 'asc' },
    });
    let chunks = 0;
    for (const doc of docs) {
      // indexDocument tự lo xoá cũ/ghi mới — chạy tuần tự để không quá tải máy embed
      const r = await indexDocument(doc.id);
      chunks += r?.chunks ?? 0;
    }
    return { indexed: docs.length, chunks };
  });
}
