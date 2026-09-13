// Cấu hình trung tâm — đọc biến môi trường từ .env (server/.env)
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
  // Viết tắt đơn vị ghép vào số ký hiệu, VD 145/2026/CV-UBND
  unitAbbr: process.env.UNIT_ABBR || 'UBND',
  // Giới hạn dung lượng file đính kèm (MB)
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB || 20),
  // Thư mục lưu file: prod mặc định /data/uploads, dev là server/uploads
  uploadDir: process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/data/uploads' : 'uploads'),
} as const;
