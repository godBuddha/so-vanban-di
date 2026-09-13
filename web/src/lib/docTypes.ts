// ===== Nhãn tiếng Việt cho enum =====

export type DocType =
  | 'CONG_VAN'
  | 'CONG_DIEN'
  | 'QUYET_DINH'
  | 'CHI_THI'
  | 'BAO_CAO'
  | 'THONG_BAO'
  | 'HO_NGHI'
  | 'GIOI_THIEU'
  | 'KHAC'

export type Role = 'ADMIN' | 'VANTHU' | 'TRACUU'

/** Nhãn hiển thị của loại văn bản */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CONG_VAN: 'Công văn',
  CONG_DIEN: 'Công điện',
  QUYET_DINH: 'Quyết định',
  CHI_THI: 'Chỉ thị',
  BAO_CAO: 'Báo cáo',
  THONG_BAO: 'Thông báo',
  HO_NGHI: 'Hỏng nghị',
  GIOI_THIEU: 'Giới thiệu',
  KHAC: 'Khác',
}

/** Màu badge theo loại văn bản (Tailwind class) */
export const DOC_TYPE_BADGE: Record<DocType, string> = {
  CONG_VAN: 'bg-blue-100 text-blue-800',
  CONG_DIEN: 'bg-orange-100 text-orange-800',
  QUYET_DINH: 'bg-red-100 text-red-800',
  CHI_THI: 'bg-rose-100 text-rose-800',
  BAO_CAO: 'bg-emerald-100 text-emerald-800',
  THONG_BAO: 'bg-amber-100 text-amber-800',
  HO_NGHI: 'bg-violet-100 text-violet-800',
  GIOI_THIEU: 'bg-cyan-100 text-cyan-800',
  KHAC: 'bg-slate-100 text-slate-700',
}

/** Nhãn vai trò */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  VANTHU: 'Văn thư',
  TRACUU: 'Tra cứu',
}

export const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  VANTHU: 'bg-blue-100 text-blue-800',
  TRACUU: 'bg-emerald-100 text-emerald-800',
}

/** Ký hiệu loại dùng trong số ký hiệu (CV, QĐ…) — chỉ để tham khảo hiển thị */
export const DOC_TYPE_ABBR: Record<DocType, string> = {
  CONG_VAN: 'CV',
  CONG_DIEN: 'CĐ',
  QUYET_DINH: 'QĐ',
  CHI_THI: 'CT',
  BAO_CAO: 'BC',
  THONG_BAO: 'TB',
  HO_NGHI: 'HN',
  GIOI_THIEU: 'GT',
  KHAC: 'VB',
}

export const ALL_DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[]
export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[]

export function docTypeLabel(t: string): string {
  return (DOC_TYPE_LABELS as Record<string, string>)[t] ?? t
}

export function docTypeBadge(t: string): string {
  return (DOC_TYPE_BADGE as Record<string, string>)[t] ?? 'bg-slate-100 text-slate-700'
}

export function roleLabel(r: string): string {
  return (ROLE_LABELS as Record<string, string>)[r] ?? r
}

export function roleBadge(r: string): string {
  return (ROLE_BADGE as Record<string, string>)[r] ?? 'bg-slate-100 text-slate-700'
}
