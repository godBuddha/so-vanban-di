// ===== Hàm định dạng dùng chung =====

/** Định dạng ngày ISO/Date → dd/mm/yyyy */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value.length === 10 ? value + 'T00:00:00' : value) : value
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** Định dạng ngày-giờ → dd/mm/yyyy HH:mm */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)} ${hh}:${mi}`
}

/** Kích thước file dễ đọc: 1.2 MB, 350 KB… */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Giờ hiện tại dạng "…, ngày 13 tháng 9 năm 2026" (dùng ở trang in) */
export function vietnameseLongDate(d: Date = new Date()): string {
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`
}

/** Năm hiện tại */
export function currentYear(): number {
  return new Date().getFullYear()
}
