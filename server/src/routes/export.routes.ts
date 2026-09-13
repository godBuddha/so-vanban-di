// Routes xuất Excel (GET /export/excel) — định dạng giống sổ giấy
import { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import prisma from '../db.js';
import { requireAuth } from '../plugins/auth.js';
import { writeAudit } from '../services/audit.service.js';
import { buildWhere } from '../services/documents.service.js';
import { DOC_TYPE_INFO } from '../utils/docTypes.js';
import { listQuerySchema } from './documents.routes.js';

// Schema lọc cho export — không phân trang, xuất toàn bộ kết quả
const exportQuerySchema = listQuerySchema
  .omit({ page: true, pageSize: true, sort: true, order: true });

export default async function exportRoutes(app: FastifyInstance) {
  // GET /api/export/excel?<cùng bộ lọc GET /documents>
  app.get('/excel', { preHandler: requireAuth }, async (req, reply) => {
    // Bỏ page/pageSize — xuất toàn bộ kết quả lọc, sắp theo số vào sổ tăng dần
    const f = exportQuerySchema.parse((req.query as Record<string, unknown>) ?? {});
    const where = buildWhere(f);
    const rows = await prisma.document.findMany({
      where,
      orderBy: [{ soVaoSo: 'asc' }, { id: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sổ Văn Bản Đi';
    const ws = wb.addWorksheet('Sổ văn bản đi');

    // Tiêu đề dòng 1 (merge toàn bảng) — "SỔ VĂN BẢN ĐI NĂM <nam>" khi lọc theo năm
    ws.columns = [
      { key: 'stt', width: 6 },
      { key: 'soVaoSo', width: 10 },
      { key: 'ngayThang', width: 12 },
      { key: 'loaiVB', width: 14 },
      { key: 'soKyHieu', width: 22 },
      { key: 'ngayBanHanh', width: 14 },
      { key: 'nguoiKy', width: 24 },
      { key: 'trichYeu', width: 55 },
      { key: 'noiNhan', width: 30 },
      { key: 'soBan', width: 8 },
    ];
    const titleText = f.nam ? `SỔ VĂN BẢN ĐI NĂM ${f.nam}` : 'SỔ VĂN BẢN ĐI';
    const titleRow = ws.addRow([titleText]);
    ws.mergeCells(1, 1, 1, 10);
    titleRow.height = 24;
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Header cột dòng 2 — in đậm
    const header = ws.addRow([
      'STT', 'Số vào sổ', 'Ngày tháng', 'Loại văn bản', 'Số & ký hiệu',
      'Ngày ban hành', 'Người ký', 'Trích yếu', 'Nơi nhận', 'Số bản',
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    // Dữ liệu — ngày tháng cột "Ngày tháng" lấy ngày vào sổ (createdAt)
    rows.forEach((d, i) => {
      const row = ws.addRow([
        i + 1,
        d.soVaoSo,
        d.createdAt.toISOString().slice(0, 10),
        DOC_TYPE_INFO[d.loaiVB].label,
        d.soKyHieu,
        d.ngayBanHanh.toISOString().slice(0, 10),
        d.nguoiKy,
        d.trichYeu,
        d.noiNhan,
        d.soBan,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    });

    await writeAudit({
      userId: req.user!.id,
      action: 'EXPORT',
      entity: 'Export',
      detail: `Xuất Excel sổ văn bản đi (${rows.length} văn bản)`,
    });

    const fileName = `so-van-ban-di-${f.nam ?? 'all'}.xlsx`;
    reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(await wb.xlsx.writeBuffer());
  });
}
