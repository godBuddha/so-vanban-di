// Dựng ứng dụng Fastify: plugins, error handler, static (prod), routes /api
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth.js';
import { config } from './config.js';
import { ensureUploadDir } from './utils/helpers.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/documents.routes.js';
import attachmentRoutes from './routes/attachments.routes.js';
import importRoutes from './routes/import.routes.js';
import exportRoutes from './routes/export.routes.js';
import userRoutes from './routes/users.routes.js';
import auditLogRoutes from './routes/audit-logs.routes.js';
import aiRoutes from './routes/ai.routes.js';
import adminAiRoutes from './routes/admin-ai.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }, level: 'warn' },
    // bodyLimit đủ lớn cho import Excel (~30MB)
    bodyLimit: 32 * 1024 * 1024,
  });

  // CORS — dev cho phép mọi origin; prod frontend served cùng origin
  await app.register(cors, { origin: config.isProd ? false : true });

  // multipart — cấu hình chung, giới hạn từng file theo UPLOAD_MAX_MB
  await app.register(multipart, {
    limits: {
      fileSize: config.uploadMaxMb * 1024 * 1024,
      files: 6, // ≤5 file đính kèm + 1 file import
    },
  });

  // Auth JWT (gán request.user)
  await app.register(authPlugin);

  // Đảm bảo thư mục upload tồn tại ngay khi khởi động
  ensureUploadDir();

  // ===== Error handler tập trung: mọi lỗi trả { error: "tiếng Việt" } =====
  app.setErrorHandler((rawErr, _req, reply) => {
    const err = rawErr as Error & { code?: string; statusCode?: number };
    // Zod validation → 400
    if (rawErr instanceof ZodError) {
      return reply.code(400).send({ error: rawErr.issues[0]?.message ?? 'Dữ liệu không hợp lệ' });
    }
    // Prisma vi phạm unique (số vào sổ, username...) → 409
    if (rawErr instanceof Prisma.PrismaClientKnownRequestError && rawErr.code === 'P2002') {
      return reply.code(409).send({ error: 'Dữ liệu đã tồn tại (số vào sổ hoặc tên đăng nhập bị trùng)' });
    }
    // Lỗi multipart của @fastify/multipart
    const code = err.code;
    if (code === 'FST_PART_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT' || code === 'FST_PART_FILE_LIMIT') {
      return reply.code(400).send({ error: `File vượt quá giới hạn ${config.uploadMaxMb}MB hoặc quá số file cho phép` });
    }
    if (err.statusCode === 413) {
      return reply.code(400).send({ error: 'Dữ liệu gửi lên quá lớn' });
    }
    app.log.error(err, 'Unhandled error');
    return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({
      error: err.statusCode && err.statusCode < 500 && err.message ? err.message : 'Lỗi hệ thống, vui lòng thử lại sau',
    });
  });

  // Không trả lỗi dạng HTML mặc định của Fastify.
  // Prod: phục vụ frontend build — Docker đặt tại /app/public (WEB_DIST_DIR);
  // chạy local từ repo: server/dist/src → ../../../web/dist. Non-API không khớp → SPA index.html.
  if (config.isProd) {
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const webDist = process.env.WEB_DIST_DIR
      ? path.resolve(process.env.WEB_DIST_DIR)
      : path.resolve(__dirname, '../../../web/dist');
    const fastifyStatic = (await import('@fastify/static')).default;
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Không tìm thấy tài nguyên API' });
      }
      return reply.sendFile('index.html', webDist);
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Không tìm thấy tài nguyên API' });
      }
      return reply.code(404).send({ error: 'Không tìm thấy tài nguyên' });
    });
  }

  // ===== Routes dưới prefix /api =====
  // GET /api/health — healthcheck Docker/Uptime Kuma (không cần đăng nhập)
  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime() }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(documentRoutes, { prefix: '/api/documents' });
  await app.register(attachmentRoutes, { prefix: '/api' });
  await app.register(importRoutes, { prefix: '/api/import' });
  await app.register(exportRoutes, { prefix: '/api/export' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(auditLogRoutes, { prefix: '/api/audit-logs' });
  await app.register(aiRoutes, { prefix: '/api' });
  await app.register(adminAiRoutes, { prefix: '/api/admin/ai' });

  return app;
}
