// Service nghiệp vụ Sổ Văn Bản Đi: đánh số tự động, lọc, DTO
import { DocType, Prisma } from '@prisma/client';
import prisma from '../db.js';
import { config } from '../config.js';
import { DOC_TYPE_INFO, makeSoKyHieu } from '../utils/docTypes.js';

// ============ Đánh số vào sổ (chống trùng khi nhập song song) ============
/**
 * Cấp số vào sổ tiếp theo cho năm `nam` — nguyên tố (atomic) bằng một câu
 * INSERT ... ON CONFLICT ... UPDATE ... RETURNING. Nhiều request song song
 * vẫn chắc chắn nhận số khác nhau nhờ khoá dòng trong transaction.
 */
export async function allocateSoVaoSo(
  tx: Prisma.TransactionClient,
  nam: number,
): Promise<number> {
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "year_counters" ("nam", "last")
    VALUES (${nam}, 1)
    ON CONFLICT ("nam") DO UPDATE SET "last" = "year_counters"."last" + 1
    RETURNING "last"`;
  return rows[0].last;
}

/** Xem trước số vào sổ + số ký hiệu kế tiếp (không cấp phát) */
export async function previewNextNumber(nam: number) {
  const counter = await prisma.yearCounter.findUnique({ where: { nam } });
  const soVaoSo = (counter?.last ?? 0) + 1;
  return { soVaoSo, soKyHieu: makeSoKyHieu(soVaoSo, nam, DocType.CONG_VAN, config.unitAbbr) };
}

// ============ Tạo / sửa / xoá ============
export interface CreateDocumentInput {
  nam: number;
  loaiVB: DocType;
  ngayBanHanh: string; // YYYY-MM-DD
  nguoiKy: string;
  trichYeu: string;
  noiNhan: string;
  soBan: number;
  ghiChu?: string | null;
  soKyHieu?: string | null; // nếu client gửi đè thì dùng của client
}

/** Tạo văn bản: cấp số vào sổ trong transaction, tự ghép soKyHieu nếu không gửi đè */
export async function createDocument(nguoiTaoId: number, input: CreateDocumentInput) {
  return prisma.$transaction(async (tx) => {
    const soVaoSo = await allocateSoVaoSo(tx, input.nam);
    const soKyHieu =
      input.soKyHieu && input.soKyHieu.trim()
        ? input.soKyHieu.trim()
        : makeSoKyHieu(soVaoSo, input.nam, input.loaiVB, config.unitAbbr);
    return tx.document.create({
      data: {
        soVaoSo,
        nam: input.nam,
        loaiVB: input.loaiVB,
        soKyHieu,
        ngayBanHanh: new Date(input.ngayBanHanh + 'T00:00:00.000Z'),
        nguoiKy: input.nguoiKy,
        trichYeu: input.trichYeu,
        noiNhan: input.noiNhan,
        soBan: input.soBan,
        ghiChu: input.ghiChu ?? null,
        nguoiTaoId,
      },
      include: includeDTO,
    });
  });
}

// ============ Bộ lọc dùng chung cho GET /documents và GET /export/excel ============
export interface DocumentFilters {
  q?: string | null;
  nam?: number | null;
  loaiVB?: DocType | null;
  noiNhan?: string | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
}

export function buildWhere(f: DocumentFilters): Prisma.DocumentWhereInput {
  const where: Prisma.DocumentWhereInput = {};
  if (f.nam) where.nam = f.nam;
  if (f.loaiVB) where.loaiVB = f.loaiVB;
  if (f.noiNhan) where.noiNhan = { contains: f.noiNhan, mode: 'insensitive' };
  if (f.from || f.to) {
    where.ngayBanHanh = {};
    if (f.from) where.ngayBanHanh.gte = new Date(f.from + 'T00:00:00.000Z');
    if (f.to) where.ngayBanHanh.lte = new Date(f.to + 'T00:00:00.000Z');
  }
  if (f.q) {
    const q = f.q;
    where.OR = [
      { trichYeu: { contains: q, mode: 'insensitive' } },
      { soKyHieu: { contains: q, mode: 'insensitive' } },
      { nguoiKy: { contains: q, mode: 'insensitive' } },
      { noiNhan: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// ============ DTO theo docs/API.md ============
const includeDTO = {
  nguoiTao: { select: { id: true, fullName: true } },
  attachments: { select: { id: true, fileName: true, size: true }, orderBy: { id: 'asc' as const } },
} satisfies Prisma.DocumentInclude;

export type DocumentWithRelations = Prisma.DocumentGetPayload<{ include: typeof includeDTO }>;

/** Chuyển document sang DocumentDTO (ngày theo YYYY-MM-DD) */
export function toDTO(d: DocumentWithRelations) {
  return {
    id: d.id,
    soVaoSo: d.soVaoSo,
    nam: d.nam,
    loaiVB: d.loaiVB,
    soKyHieu: d.soKyHieu,
    ngayBanHanh: d.ngayBanHanh.toISOString().slice(0, 10),
    nguoiKy: d.nguoiKy,
    trichYeu: d.trichYeu,
    noiNhan: d.noiNhan,
    soBan: d.soBan,
    ghiChu: d.ghiChu,
    nguoiTao: d.nguoiTao,
    attachments: d.attachments,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export { includeDTO, DOC_TYPE_INFO };
