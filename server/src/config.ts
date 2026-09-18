// Cấu hình trung tâm — đọc biến môi trường từ .env (server/.env)
import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

// Giá trị giữ chỗ/mặc định dev — KHÔNG bao giờ dùng được ở production (fail-fast bên dưới)
const DEV_FALLBACK_SECRETS = new Set([
  'dev_secret_change_me',
  'dev_refresh_secret_change_me',
  'chuoi_ngau_nhien_64_ky_tu',
]);

/** Đọc secret JWT: production bắt buộc đặt trong .env — thiếu thì thoát ngay, không chạy bằng giá trị mặc định */
function jwtSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const v = process.env[name]?.trim() || '';
  if (!v || DEV_FALLBACK_SECRETS.has(v)) {
    if (isProd) {
      // Vô hiệu hoá fallback secret nằm trong code: mã nguồn công khai, ai cũng đọc được
      // giá trị mặc định — nếu hệ thống lặng lẽ chạy với nó, kẻ xấu tự ký token ADMIN.
      console.error(`[config] Thiếu ${name} trong file .env — từ chối khởi động ở production.`);
      console.error('         Tạo secret ngẫu nhiên: openssl rand -hex 32');
      process.exit(1);
    }
    return devFallback;
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  jwtSecret: jwtSecret('JWT_SECRET', 'dev_secret_change_me'),
  jwtRefreshSecret: jwtSecret('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
  // Viết tắt đơn vị ghép vào số ký hiệu, VD 145/2026/CV-UBND
  unitAbbr: process.env.UNIT_ABBR || 'UBND',
  // Giới hạn dung lượng file đính kèm (MB)
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB || 20),
  // Thư mục lưu file: prod mặc định /data/uploads, dev là server/uploads
  uploadDir: process.env.UPLOAD_DIR || (isProd ? '/data/uploads' : 'uploads'),
} as const;

// Production: hai secret phải khác nhau (rò rỉ 1 secret không được phép kéo theo secret kia)
if (isProd && config.jwtSecret === config.jwtRefreshSecret) {
  console.error('[config] JWT_SECRET và JWT_REFRESH_SECRET không được trùng nhau — từ chối khởi động.');
  process.exit(1);
}
