// Routes file đính kèm: upload (POST /documents/:id/attachments),
// download (GET /attachments/:id/download), xoá (DELETE /attachments/:id)
import { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import prisma from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../plugins/auth.js';
import { writeAudit } from '../services/audit.service.js';
import { ensureUploadDir, makeStoredName } from '../utils/helpers.js';

// Chỉ nhận các đuôi file này
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.jpg', '.png']);
const MAX_FILES_PER_REQUEST = 5;

export default async function attachmentRoutes(app: FastifyInstance) {
  // POST /documents/:id/attachments — multipart, field "files" (≤5 file)
  app.post('/documents/:id/attachments', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID văn bản không hợp lệ' });
    }
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return reply.code(404).send({ error: 'Không tìm thấy văn bản' });

    const dir = ensureUploadDir();
    const files: { fileName: string; storedName: string; size: number; mime: string }[] = [];
    try {
      for await (const part of req.files({ limits: { fileSize: config.uploadMaxMb * 1024 * 1024 } })) {
        if (part.fieldname !== 'files') continue; // bỏ qua các field khác
        if (files.length >= MAX_FILES_PER_REQUEST) {
          return reply.code(400).send({ error: `Tối đa ${MAX_FILES_PER_REQUEST} file mỗi lần tải lên` });
        }
        const ext = path.extname(part.filename || '').toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
          return reply.code(400).send({
            error: `File "${part.filename}" không đúng định dạng cho phép (PDF, DOC, DOCX, JPG, PNG)`,
          });
        }
        const storedName = makeStoredName(part.filename);
        const buffer = await part.toBuffer();
        await fs.promises.writeFile(path.join(dir, storedName), buffer);
        files.push({ fileName: part.filename, storedName, size: buffer.length, mime: part.mimetype || 'application/octet-stream' });
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_PART_FILE_LIMIT' || code === 'FST_PART_FILE_TOO_LARGE') {
        return reply.code(400).send({ error: `Dung lượng file vượt quá giới hạn ${config.uploadMaxMb}MB` });
      }
      throw err;
    }

    if (files.length === 0) {
      return reply.code(400).send({ error: 'Vui lòng gửi ít nhất một file trong field "files"' });
    }
    const created = await prisma.$transaction(
      files.map((f) => prisma.attachment.create({ data: { ...f, documentId: id } })),
    );
    await writeAudit({
      userId: req.user!.id,
      action: 'UPLOAD',
      entity: 'Attachment',
      entityId: created[0].id,
      documentId: id,
      detail: `Tải lên ${files.length} file đính kèm cho VB ${doc.soKyHieu}`,
    });
    return reply.code(201).send(created.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size })));
  });

  // GET /attachments/:id/download — stream file về, giữ tên gốc tiếng Việt
  app.get('/attachments/:id/download', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID file đính kèm không hợp lệ' });
    }
    const att = await prisma.attachment.findUnique({ where: { id } });
    if (!att) return reply.code(404).send({ error: 'Không tìm thấy file đính kèm' });
    const filePath = path.join(ensureUploadDir(), att.storedName);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'File không còn tồn tại trên máy chủ' });
    }
    // Content-Disposition: ASCII fallback + filename* UTF-8 để tên tiếng Việt không lỗi
    const asciiName = att.fileName.replace(/[^\x20-\x7E]/g, '_');
    reply
      .header('Content-Type', att.mime || 'application/octet-stream')
      .header(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      );
    return reply.send(fs.createReadStream(filePath));
  });

  // DELETE /attachments/:id — xoá bản ghi + file trên đĩa (VANTHU, ADMIN)
  app.delete('/attachments/:id', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID file đính kèm không hợp lệ' });
    }
    const att = await prisma.attachment.findUnique({ where: { id }, include: { document: true } });
    if (!att) return reply.code(404).send({ error: 'Không tìm thấy file đính kèm' });
    try {
      await unlink(path.join(ensureUploadDir(), att.storedName));
    } catch {
      // File có thể đã mất — vẫn xoá bản ghi
    }
    await prisma.attachment.delete({ where: { id } });
    await writeAudit({
      userId: req.user!.id,
      action: 'ATTACHMENT_DELETE',
      entity: 'Attachment',
      entityId: id,
      documentId: att.documentId,
      detail: `Xoá file "${att.fileName}" khỏi VB ${att.document.soKyHieu}`,
    });
    return { ok: true };
  });
}
