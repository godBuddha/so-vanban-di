// Plugin xác thực JWT: verify access token, gán request.user
// Cung cấp preHandler requireAuth / requireRole cho các route
import fastifyPlugin from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'VANTHU' | 'TRACUU';
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** Verify + gán request.user cho mọi request có header Authorization */
export default fastifyPlugin(async function authPlugin(app) {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const token = header.slice(7).trim();
    try {
      req.user = jwt.verify(token, config.jwtSecret) as AuthUser;
    } catch {
      // Token sai/hết hạn: không gán user — requireAuth sẽ trả 401 khi route cần
      req.user = null;
    }
  });
});

/** Bắt buộc đăng nhập — trả 401 nếu thiếu/sai token */
export async function requireAuth(req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
  if (!req.user) {
    return reply.code(401).send({ error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });
  }
}

/** Bắt buộc thuộc các vai trò cho phép — trả 403 nếu không đủ quyền */
export function requireRole(...roles: AuthUser['role'][]) {
  return async function (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
    if (!req.user) {
      return reply.code(401).send({ error: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn' });
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Bạn không có quyền thực hiện thao tác này' });
    }
  };
}

/** Ký access token (15 phút) và refresh token (7 ngày) — secret riêng */
export function signTokens(user: AuthUser) {
  const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user.id, username: user.username }, config.jwtRefreshSecret, {
    expiresIn: '7d',
  });
  return { accessToken, refreshToken };
}
