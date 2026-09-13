// Routes xác thực: login / refresh / logout / me
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../db.js';
import { config } from '../config.js';
import { signTokens, requireAuth } from '../plugins/auth.js';
import { writeAudit } from '../services/audit.service.js';

// Rate limit đơn giản cho /auth/login: tối đa 10 lần/phút/IP
const loginAttempts = new Map<string, number[]>();
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (loginAttempts.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (hits.length >= LOGIN_LIMIT) {
    loginAttempts.set(ip, hits);
    return false;
  }
  hits.push(now);
  loginAttempts.set(ip, hits);
  return true;
}

const loginSchema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Thiếu refresh token'),
});

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login — công khai
  app.post('/login', async (req, reply) => {
    if (!checkRateLimit(req.ip)) {
      return reply.code(429).send({ error: 'Bạn đã đăng nhập sai quá nhiều lần, thử lại sau 1 phút' });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (!user || !user.active || !bcrypt.compareSync(password, user.password)) {
      return reply.code(401).send({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
    const authUser = { id: user.id, username: user.username, role: user.role };
    const tokens = signTokens(authUser);
    await writeAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'Auth',
      entityId: user.id,
      detail: `Đăng nhập hệ thống (tài khoản ${user.username})`,
    });
    return reply.send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    });
  });

  // POST /api/auth/refresh — đổi cặp token mới (stateless)
  app.post('/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    let payload: { id: number; username: string };
    try {
      payload = jwt.verify(parsed.data.refreshToken, config.jwtRefreshSecret) as typeof payload;
    } catch {
      return reply.code(401).send({ error: 'Refresh token không hợp lệ hoặc đã hết hạn' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hoá' });
    }
    const tokens = signTokens({ id: user.id, username: user.username, role: user.role });
    return reply.send(tokens);
  });

  // POST /api/auth/logout — stateless: client tự xoá token, server chỉ xác nhận
  app.post('/logout', { preHandler: requireAuth }, async () => ({ ok: true }));

  // GET /api/auth/me — thông tin người dùng đang đăng nhập
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, fullName: true, role: true, active: true },
    });
    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hoá' });
    }
    return reply.send(user);
  });

  // PATCH /api/auth/password — đổi mật khẩu cho chính mình (yêu cầu mật khẩu hiện tại)
  app.patch('/password', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z
      .object({
        currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
        password: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự').max(100),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!me || !me.active) {
      return reply.code(401).send({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hoá' });
    }
    if (!bcrypt.compareSync(parsed.data.currentPassword, me.password)) {
      return reply.code(400).send({ error: 'Mật khẩu hiện tại không đúng' });
    }
    await prisma.user.update({
      where: { id: me.id },
      data: { password: bcrypt.hashSync(parsed.data.password, 10) },
    });
    await writeAudit({
      userId: me.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: me.id,
      detail: `Tự đổi mật khẩu (${me.username})`,
    });
    return { ok: true };
  });
}
