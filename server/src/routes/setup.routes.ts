// Routes cài đặt ban đầu: tự đăng ký tài khoản quản trị khi hệ thống còn trống.
// Luồng kiểu self-host (Gitea/WordPress): lần đầu truy cập → trang "Cài đặt ban đầu"
// → người quản trị tự đặt tên đăng nhập + mật khẩu. Sau đó route này tự khoá vĩnh viễn.
// Không có mật khẩu admin mặc định nào nằm trong mã nguồn.
import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../db.js';

// Giới hạn tách riêng: GET status nhẹ và frontend gọi 2 lần/mỗi lần mở trang → nới 30/phút;
// POST tạo admin là hành động nhạy cảm → chặt 5/phút. Chống dò quét endpoint công khai.
const statusAttempts = new Map<string, number[]>();
const STATUS_LIMIT = 30;
const setupAttempts = new Map<string, number[]>();
const SETUP_LIMIT = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(map: Map<string, number[]>, limit: number, ip: string): boolean {
  const now = Date.now();
  const hits = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    map.set(ip, hits);
    return false;
  }
  hits.push(now);
  map.set(ip, hits);
  return true;
}

// Cùng chuẩn tên đăng nhập/mật khẩu với trang Quản trị người dùng
const setupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100),
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(150),
});

/** Hệ thống cần cài đặt ban đầu khi chưa có bất kỳ người dùng nào */
export async function setupNeeded(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

export default async function setupRoutes(app: FastifyInstance) {
  // GET /setup/status — công khai: frontend hỏi xem có cần cài đặt lần đầu không
  app.get('/status', async (req, reply) => {
    if (!checkRateLimit(statusAttempts, STATUS_LIMIT, req.ip)) {
      return reply.code(429).send({ error: 'Truy vấn quá nhiều lần, thử lại sau 1 phút' });
    }
    return { needed: await setupNeeded() };
  });

  // POST /setup — công khai nhưng CHỈ được gọi khi DB chưa có người dùng nào.
  // Ngay khi user đầu tiên được tạo, mọi lần gọi sau đều trả 403 (trang tự đóng).
  app.post('/', async (req, reply) => {
    if (!checkRateLimit(setupAttempts, SETUP_LIMIT, req.ip)) {
      return reply.code(429).send({ error: 'Thao tác quá nhiều lần, thử lại sau 1 phút' });
    }
    if (!(await setupNeeded())) {
      return reply.code(403).send({
        error: 'Hệ thống đã được cài đặt trước đó. Vui lòng đăng nhập hoặc liên hệ quản trị viên.',
      });
    }
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const { username, password, fullName } = parsed.data;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return reply.code(409).send({ error: 'Tên đăng nhập đã tồn tại, vui lòng chọn tên khác' });
    }
    const user = await prisma.user.create({
      data: { username, password: bcrypt.hashSync(password, 10), fullName, role: 'ADMIN', active: true },
      select: { id: true, username: true, fullName: true, role: true, active: true, createdAt: true },
    });
    return reply.code(201).send({ user });
  });
}
