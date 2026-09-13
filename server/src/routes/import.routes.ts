// Routes nhập Excel (POST /import/excel) — đọc sổ .xlsx xuất từ hệ thống
import { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import prisma from '../db.js';
import { requireRole } from '../plugins/auth.js';
import { writeAudit } from '../services/audit.service.js';
import { createDocument } from '../services/documents.service.js';
import { parseDocType } from '../utils/docTypes.js';
import { excelCellToString, parseDateInput } from '../utils/helpers.js';

// Map header Excel → key nội bộ (so khớp "mờ": bỏ dấu, lowercase)
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEADER_MAP: Record<string, string> = {
  'stt': 'stt',
  'so vao so': 'soVaoSo',
  'ngay thang': 'ngayThang',
  'loai van ban': 'loaiVB',
  'so & ky hieu': 'soKyHieu',
  'so ky hieu': 'soKyHieu',
  'ngay ban hanh': 'ngayBanHanh',
  'nguoi ky': 'nguoiKy',
  'trich yeu': 'trichYeu',
  'noi nhan': 'noiNhan',
  'so ban': 'soBan',
};

export default async function importRoutes(app: FastifyInstance) {
  app.post('/excel', { preHandler: requireRole('VANTHU', 'ADMIN') }, async (req, reply) => {
    let filePart;
    try {
      filePart = await req.file({ limits: { fileSize: 30 * 1024 * 1024 } });
    } catch {
      return reply.code(400).send({ error: 'File gửi lên không hợp lệ' });
    }
    if (!filePart) {
      return reply.code(400).send({ error: 'Vui lòng gửi file .xlsx trong field "file"' });
    }
    if (!/\.xlsx$/i.test(filePart.filename || '')) {
      return reply.code(400).send({ error: 'Chỉ nhận file .xlsx' });
    }
    const buffer = await filePart.toBuffer();
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    } catch {
      return reply.code(400).send({ error: 'Không đọc được file Excel, vui lòng kiểm tra lại' });
    }
    const ws = wb.worksheets[0];
    if (!ws) return reply.code(400).send({ error: 'File Excel không có dữ liệu' });

    // Xác định dòng header (dòng đầu có ≥3 ô khớp tên cột quen thuộc) và map cột
    let headerRowNum = 0;
    let colMap: Record<string, number> = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
      const row = ws.getRow(r);
      const map: Record<string, number> = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const key = HEADER_MAP[norm(excelCellToString(cell.value))];
        if (key && map[key] === undefined) map[key] = col;
      });
      const matched = Object.keys(map).length;
      if (matched >= 3) {
        headerRowNum = r;
        colMap = map;
        break;
      }
    }
    if (!headerRowNum) {
      return reply.code(400).send({ error: 'Không nhận dạng được dòng tiêu đề cột trong file Excel' });
    }
    // Cột bắt buộc
    for (const key of ['ngayBanHanh', 'nguoiKy', 'trichYeu', 'noiNhan'] as const) {
      if (!colMap[key]) {
        const vn = { ngayBanHanh: 'Ngày ban hành', nguoiKy: 'Người ký', trichYeu: 'Trích yếu', noiNhan: 'Nơi nhận' }[key];
        return reply.code(400).send({ error: `Thiếu cột bắt buộc "${vn}" trong file Excel` });
      }
    }

    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (key: string) => (colMap[key] ? row.getCell(colMap[key]).value : null);
      const str = (key: string) => excelCellToString(get(key));

      // Dòng trống hoàn toàn → bỏ qua (không đếm lỗi)
      const required = { ngayBanHanh: get('ngayBanHanh'), nguoiKy: get('nguoiKy'), trichYeu: get('trichYeu'), noiNhan: get('noiNhan') };
      const allEmpty =
        Object.values(required).every((v) => v == null || excelCellToString(v) === '');
      if (allEmpty) {
        skipped++;
        continue;
      }

      try {
        // Ngày ban hành: hỗ trợ Excel serial, Date object, dd/mm/yyyy, yyyy-mm-dd
        const rawDate = get('ngayBanHanh');
        const ngayBanHanh =
          rawDate instanceof Date
            ? rawDate.toISOString().slice(0, 10)
            : parseDateInput(typeof rawDate === 'object' && rawDate ? (rawDate as { result?: unknown }).result ?? excelCellToString(rawDate) : excelCellToString(rawDate));
        if (!ngayBanHanh) throw new Error('Ngày ban hành không đọc được (cần dd/mm/yyyy hoặc yyyy-mm-dd)');

        const nguoiKy = str('nguoiKy');
        const trichYeu = str('trichYeu');
        const noiNhan = str('noiNhan');
        if (!nguoiKy) throw new Error('Thiếu người ký');
        if (!trichYeu) throw new Error('Thiếu trích yếu');
        if (!noiNhan) throw new Error('Thiếu nơi nhận');

        // Loại văn bản: nếu thiếu/không nhận ra → CONG_VAN
        const loaiText = str('loaiVB');
        const loaiVB = parseDocType(loaiText) ?? 'CONG_VAN';

        // Số bản (mặc định 1)
        const soBanRaw = str('soBan');
        const soBan = soBanRaw && /^\d+$/.test(soBanRaw) ? Number(soBanRaw) : 1;

        // Tự cấp soVaoSo + sinh soKyHieu (nếu cột Số & ký hiệu có giá trị thì dùng đè)
        const soKyHieu = str('soKyHieu') || null;
        const nam = Number(ngayBanHanh.slice(0, 4));
        const doc = await createDocument(req.user!.id, {
          nam,
          loaiVB,
          ngayBanHanh,
          nguoiKy,
          trichYeu,
          noiNhan,
          soBan,
          ghiChu: null,
          soKyHieu,
        });
        created++;
      } catch (err) {
        errors.push({ row: r, message: err instanceof Error ? err.message : 'Lỗi không xác định' });
      }
    }

    await writeAudit({
      userId: req.user!.id,
      action: 'IMPORT',
      entity: 'Document',
      detail: `Nhập Excel: tạo ${created}, bỏ qua ${skipped}, lỗi ${errors.length}`,
    });
    return reply.send({ created, skipped, errors });
  });
}
