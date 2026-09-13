// Tiện ích chung: parse ngày, chuẩn hoá chuỗi, cấp phát file upload
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/** Đảm bảo thư mục upload tồn tại (tạo khi khởi động) */
export function ensureUploadDir(): string {
  const dir = path.resolve(config.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Tạo tên file lưu trên đĩa: uuid + đuôi gốc (chỉ giữ ký tự an toàn) */
export function makeStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '') || '';
  return randomUUID() + ext;
}

/**
 * Chuẩn hoá ngày về chuỗi YYYY-MM-DD (input: Date hoặc chuỗi dd/mm/yyyy | yyyy-mm-dd)
 * Trả về null nếu không parse được — nơi gọi tự báo lỗi tiếng Việt.
 */
export function parseDateInput(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // Excel serial date: mốc 1899-12-30 (có tính ngày 29/2/1900 của Excel)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);          // yyyy-mm-dd
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s);     // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Đọc giá trị cell Excel về chuỗi (hỗ trợ rich text / công thức) */
export function excelCellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.result === 'number' || typeof v.result === 'string') return String(v.result);
    if (typeof v.text === 'string') return v.text;
    if (typeof v.richText === 'object') {
      const parts = (v.richText as { text: string }[]) ?? [];
      return parts.map((p) => p.text).join('');
    }
    if (value instanceof Date) return '';
    return '';
  }
  return String(value).trim();
}
