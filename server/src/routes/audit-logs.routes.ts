// Routes xem lịch sử thao tác (audit logs) — chỉ ADMIN
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { requireRole } from '../plugins/auth.js';

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function auditLogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('ADMIN'));

  // GET /audit-logs?page=&pageSize=&q=
  app.get('/', async (req) => {
    const f = querySchema.parse(req.query);
    const where: Prisma.AuditLogWhereInput = f.q
      ? {
          OR: [
            { detail: { contains: f.q, mode: 'insensitive' } },
            { action: { contains: f.q, mode: 'insensitive' } },
            { entity: { contains: f.q, mode: 'insensitive' } },
            { user: { is: { OR: [{ fullName: { contains: f.q, mode: 'insensitive' } }, { username: { contains: f.q, mode: 'insensitive' } }] } } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        select: {
          id: true, action: true, entity: true, entityId: true, detail: true, createdAt: true,
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}
