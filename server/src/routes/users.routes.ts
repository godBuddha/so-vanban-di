// Routes quản trị người dùng — chỉ ADMIN
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../db.js';
import { requireRole } from '../plugins/auth.js';
import { writeAudit } from '../services/audit.service.js';

const roleEnum = z.enum(['ADMIN', 'VANTHU', 'TRACUU']);

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(150),
  role: roleEnum.default('TRACUU'),
  active: z.boolean().default(true),
});

const patchUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(150).optional(),
  role: roleEnum.optional(),
  active: z.boolean().optional(),
});

const patchPasswordSchema = z.object({
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
});

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('ADMIN')); // mọi route dưới đây chỉ ADMIN

  // GET /users — danh sách (không có cột password)
  app.get('/', async () => {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, active: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    return { data: users };
  });

  // POST /users — tạo người dùng mới
  app.post('/', async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const { username, password, fullName, role, active } = parsed.data;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return reply.code(409).send({ error: 'Tên đăng nhập đã tồn tại' });
    const user = await prisma.user.create({
      data: { username, password: bcrypt.hashSync(password, 10), fullName, role, active },
      select: { id: true, username: true, fullName: true, role: true, active: true },
    });
    await writeAudit({
      userId: req.user!.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      detail: `Thêm người dùng ${user.username} (${user.fullName})`,
    });
    return reply.code(201).send(user);
  });

  // PATCH /users/:id — sửa (không tự vô hiệu hoá chính mình)
  app.patch('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID người dùng không hợp lệ' });
    }
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    if (id === req.user!.id && parsed.data.active === false) {
      return reply.code(400).send({ error: 'Không thể tự vô hiệu hoá tài khoản của chính mình' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'Không tìm thấy người dùng' });
    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: { id: true, username: true, fullName: true, role: true, active: true },
    });
    await writeAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      detail: `Sửa người dùng ${updated.username}`,
    });
    return updated;
  });

  // PATCH /users/:id/password — đổi mật khẩu (tối thiểu 8 ký tự)
  app.patch('/:id/password', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID người dùng không hợp lệ' });
    }
    const parsed = patchPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'Không tìm thấy người dùng' });
    await prisma.user.update({
      where: { id },
      data: { password: bcrypt.hashSync(parsed.data.password, 10) },
    });
    await writeAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      detail: `Đổi mật khẩu cho ${user.username}`,
    });
    return { ok: true };
  });

  // DELETE /users/:id — đã có văn bản thì báo lỗi, chỉ vô hiệu hoá
  app.delete('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID người dùng không hợp lệ' });
    }
    if (id === req.user!.id) {
      return reply.code(400).send({ error: 'Không thể xoá tài khoản của chính mình' });
    }
    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!user) return reply.code(404).send({ error: 'Không tìm thấy người dùng' });
    if (user._count.documents > 0) {
      return reply.code(409).send({
        error: 'Người dùng đã tạo văn bản, không thể xoá — hãy vô hiệu hoá tài khoản thay vì xoá',
      });
    }
    await prisma.user.delete({ where: { id } });
    await writeAudit({
      userId: req.user!.id,
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      detail: `Xoá người dùng ${user.username}`,
    });
    return { ok: true };
  });
}
