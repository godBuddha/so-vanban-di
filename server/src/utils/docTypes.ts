// Map DocType ↔ nhãn tiếng Việt ↔ ký hiệu viết tắt dùng trong số ký hiệu
// VD: CONG_VAN → "Công văn" → "CV" → 145/2026/CV-UBND
import { DocType } from '@prisma/client';

export interface DocTypeInfo {
  label: string; // Nhãn hiển thị tiếng Việt
  abbr: string;  // Ký hiệu viết tắt trong số ký hiệu
}

export const DOC_TYPE_INFO: Record<DocType, DocTypeInfo> = {
  CONG_VAN:   { label: 'Công văn',    abbr: 'CV' },
  CONG_DIEN:  { label: 'Công điện',   abbr: 'CĐ' },
  QUYET_DINH: { label: 'Quyết định',  abbr: 'QĐ' },
  CHI_THI:    { label: 'Chỉ thị',     abbr: 'CT' },
  BAO_CAO:    { label: 'Báo cáo',     abbr: 'BC' },
  THONG_BAO:  { label: 'Thông báo',   abbr: 'TB' },
  HO_NGHI:    { label: 'Hội nghị',    abbr: 'HN' },
  GIOI_THIEU: { label: 'Giới thiệu',  abbr: 'GT' },
  KHAC:       { label: 'Văn bản khác', abbr: 'VB' },
};

// Ghép số ký hiệu theo mẫu {soVaoSo}/{nam}/{KY_HIEU_LOAI}-{VIET_TAT_DON_VI}
export function makeSoKyHieu(soVaoSo: number, nam: number, loaiVB: DocType, unitAbbr: string): string {
  return `${soVaoSo}/${nam}/${DOC_TYPE_INFO[loaiVB].abbr}-${unitAbbr}`;
}

// Đoán DocType từ chuỗi nhập tay (nhãn tiếng Việt hoặc viết tắt) — dùng cho import Excel
export function parseDocType(text: string): DocType | null {
  if (!text) return null;
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [type, info] of Object.entries(DOC_TYPE_INFO) as [DocType, DocTypeInfo][]) {
    if (s === info.label.toLowerCase() || s === info.abbr.toLowerCase()) return type;
  }
  // Khớp một phần: "công văn số..." / "quyết định về..."
  if (s.includes('công văn')) return DocType.CONG_VAN;
  if (s.includes('công điện')) return DocType.CONG_DIEN;
  if (s.includes('quyết định')) return DocType.QUYET_DINH;
  if (s.includes('chỉ thị')) return DocType.CHI_THI;
  if (s.includes('báo cáo')) return DocType.BAO_CAO;
  if (s.includes('thông báo')) return DocType.THONG_BAO;
  if (s.includes('hội nghị') || s.includes('họp nghị')) return DocType.HO_NGHI;
  if (s.includes('giới thiệu')) return DocType.GIOI_THIEU;
  return null;
}
