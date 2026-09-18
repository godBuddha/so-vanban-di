// Routes CRUD văn bản đi + xem trước số vào sổ
import { FastifyInstance } from 'fastify';
import { DocType } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../plugins/auth.js';
import {
  buildWhere,
  createDocument,
  previewNextNumber,
  toDTO,
  includeDTO,
} from '../services/documents.service.js';
import { writeAudit } from '../services/audit.service.js';
import { indexDocument } from '../services/ai.service.js';

// ---- Zod schemas ----
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày ban hành phải theo định dạng YYYY-MM-DD');

const createDocSchema = z.object({
  // soVaoSo bỏ trống → server tự cấp (bảng Quyền trong docs/API.md)
  soVaoSo: z.number().int().positive().optional(),
  nam: z.number().int().min(2000).max(2100),
  loaiVB: z.nativeEnum(DocType),
  soKyHieu: z.string().max(100).optional(),
  ngayBanHanh: ymd,
  nguoiKy: z.string().trim().min(1, 'Vui lòng nhập người ký').max(150),
  trichYeu: z.string().trim().min(1, 'Vui lòng nhập trích yếu').max(1000),
  noiNhan: z.string().trim().min(1, 'Vui lòng nhập nơi nhận').max(500),
  soBan: z.number().int().min(1).max(999).default(1),
  ghiChu: z.string().max(1000).nullable().optional(),
});

const patchDocSchema = z.object({
  loaiVB: z.nativeEnum(DocType).optional(),
  soKyHieu: z.string().max(100).optional(),
  ngayBanHanh: ymd.optional(),
  nguoiKy: z.string().trim().min(1).max(150).optional(),
  trichYeu: z.string().trim().min(1).max(1000).optional(),
  noiNhan: z.string().trim().min(1).max(500).optional(),
  soBan: z.number().int().min(1).max(999).optional(),
  ghiChu: z.string().max(1000).nullable().optional(),
});

// Bộ lọc GET /documents — dùng chung với GET /export/excel
export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  nam: z.coerce.number().int().min(2000).max(2100).optional(),
  loaiVB: z.nativeEnum(DocType).optional(),
  noiNhan: z.string().trim().max(200).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['soVaoSo', 'ngayBanHanh']).default('soVaoSo'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export default async function documentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth); // toàn bộ route dưới đây cần đăng nhập

  // GET /documents — danh sách có lọc + phân trang
  app.get('/', async (req) => {
    const f = listQuerySchema.parse(req.query);
    const where = buildWhere(f);
    const [total, rows] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        include: {
          nguoiTao: { select: { id: true, fullName: true } },
          attachments: { select: { id: true, fileName: true, size: true } },
        },
        orderBy: [{ [f.sort]: f.order }, { id: f.order }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ]);
    // Kết quả để sẵn dạng DTO cho handler bên dưới (trả qua reply)
    return { data: rows.map((r) => ({ ...r, ngayBanHanh: r.ngayBanHanh.toISOString().slice(0, 10), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })), total, page: f.page, pageSize: f.pageSize };
  });

  // GET /documents/next-number?nam=2026 — xem trước số kế tiếp (đăng ký TRƯỚC /:id)
  app.get('/next-number', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req) => {
    const { nam } = z
      .object({ nam: z.coerce.number().int().min(2000).max(2100) })
      .parse(req.query);
    return previewNextNumber(nam);
  });

  // GET /documents/:id — chi tiết + attachments
  app.get('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID văn bản không hợp lệ' });
    }
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        nguoiTao: { select: { id: true, fullName: true } },
        attachments: { select: { id: true, fileName: true, size: true, mime: true, createdAt: true } },
      },
    });
    if (!doc) return reply.code(404).send({ error: 'Không tìm thấy văn bản' });
    return {
      ...doc,
      ngayBanHanh: doc.ngayBanHanh.toISOString().slice(0, 10),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  });

  // POST /documents — tạo mới (VANTHU, ADMIN)
  app.post('/', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    const parsed = createDocSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const input = parsed.data;
    const doc = await createDocument(req.user!.id, {
      nam: input.nam,
      loaiVB: input.loaiVB,
      ngayBanHanh: input.ngayBanHanh,
      nguoiKy: input.nguoiKy,
      trichYeu: input.trichYeu,
      noiNhan: input.noiNhan,
      soBan: input.soBan,
      ghiChu: input.ghiChu ?? null,
      soKyHieu: input.soKyHieu ?? null,
    });
    await writeAudit({
      userId: req.user!.id,
      action: 'CREATE',
      entity: 'Document',
      entityId: doc.id,
      documentId: doc.id,
      detail: `Thêm VB ${doc.soKyHieu} - V/v ${doc.trichYeu}`,
    });
    // Đánh chỉ mục AI bất đồng bộ — lỗi AI không được làm hỏng việc nhập sổ
    void indexDocument(doc.id);
    return reply.code(201).send(toDTO(doc));
  });

  // PATCH /documents/:id — sửa (không cho đổi soVaoSo/nam sau khi cấp)
  app.patch('/:id', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID văn bản không hợp lệ' });
    }
    const body = req.body as Record<string, unknown> | null;
    if (body && ('soVaoSo' in body || 'nam' in body)) {
      return reply.code(400).send({ error: 'Không được đổi số vào sổ hoặc năm sau khi văn bản đã được cấp số' });
    }
    const parsed = patchDocSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Không tìm thấy văn bản' });

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.ngayBanHanh) {
      data.ngayBanHanh = new Date(parsed.data.ngayBanHanh + 'T00:00:00.000Z');
    }
    const doc = await prisma.document.update({ where: { id }, data, include: {
      nguoiTao: { select: { id: true, fullName: true } },
      attachments: { select: { id: true, fileName: true, size: true } },
    } });
    await writeAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      entity: 'Document',
      entityId: doc.id,
      documentId: doc.id,
      detail: `Sửa VB ${doc.soKyHieu}`,
    });
    // Cập nhật lại chỉ mục AI bất đồng bộ sau khi sửa nội dung
    void indexDocument(doc.id);
    return {
      ...doc,
      ngayBanHanh: doc.ngayBanHanh.toISOString().slice(0, 10),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  });

  // DELETE /documents/:id — xoá kèm attachments (ADMIN)
  app.delete('/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID văn bản không hợp lệ' });
    }
    const existing = await prisma.document.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!existing) return reply.code(404).send({ error: 'Không tìm thấy văn bản' });

    // Xoá file trên đĩa trước (schema đã onDelete: Cascade cho DB)
    const { unlink } = await import('node:fs/promises');
    const path = await import('node:path');
    const uploadDir = path.resolve(config.uploadDir); // 1 nguồn duy nhất trong config.ts
    await prisma.$transaction(async (tx) => {
      for (const att of existing.attachments) {
        try {
          await unlink(path.join(uploadDir, att.storedName));
        } catch {
          // File có thể đã mất trên đĩa — vẫn tiếp tục xoá bản ghi
        }
        await tx.attachment.delete({ where: { id: att.id } });
      }
      await tx.document.delete({ where: { id } });
    });
    await writeAudit({
      userId: req.user!.id,
      action: 'DELETE',
      entity: 'Document',
      entityId: id,
      detail: `Xoá VB ${existing.soKyHieu} - V/v ${existing.trichYeu}`,
    });
    return { ok: true };
  });
}
