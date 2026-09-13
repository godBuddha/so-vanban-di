// Tự tạo tài khoản ADMIN mặc định nếu hệ thống chưa có người dùng nào.
// Chạy một lần khi container khởi động (sau prisma migrate deploy).
// Đăng nhập: admin / Admin@123 — người dùng PHẢI đổi mật khẩu ngay sau lần đăng nhập đầu.
import prisma from './db.js';
import bcrypt from 'bcryptjs';

async function ensureAdmin(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log('[ensure-admin] Đã có người dùng — bỏ qua.');
    return;
  }
  await prisma.user.create({
    data: {
      username: 'admin',
      password: bcrypt.hashSync('Admin@123', 10),
      fullName: 'Quản trị hệ thống',
      role: 'ADMIN',
      active: true,
    },
  });
  console.log('[ensure-admin] Đã tạo tài khoản admin mặc định (Admin@123) — VUI LÒNG ĐỔI MẬT KHẨU NGAY.');
}

ensureAdmin()
  .catch((e) => {
    console.error('[ensure-admin] Lỗi:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
