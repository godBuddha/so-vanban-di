// ===== Các thành phần UI dùng chung =====
import { useEffect, type ReactNode } from 'react'

/** Hộp thoại modal phủ giữa màn hình */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  // Đóng bằng phím Esc
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${
          wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Hộp thoại xác nhận (xoá, vô hiệu hoá…) */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onCancel} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="mb-1.5 text-base font-semibold text-slate-800">{title}</h3>
        <p className="mb-4 whitespace-pre-line text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            Huỷ
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Vòng xoay loading */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-500">
      <svg className="h-7 w-7 animate-spin text-primary-700" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
      </svg>
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  )
}

/** Khung xám nhấp nháy khi chờ dữ liệu */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

export function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-ledger">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="min-w-24">
                <Skeleton className="h-4 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Trạng thái rỗng thân thiện */
export function EmptyState({
  icon = '📄',
  title,
  hint,
  action,
}: {
  icon?: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="text-base font-medium text-slate-700">{title}</div>
      {hint ? <div className="max-w-md text-sm text-slate-500">{hint}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** Phân trang: trước / thông tin / sau */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 text-sm text-slate-600">
      <span>
        Hiển thị <b>{(page - 1) * pageSize + 1}</b>–<b>{Math.min(page * pageSize, total)}</b> trong tổng số{' '}
        <b>{total}</b> văn bản
      </span>
      <div className="flex items-center gap-1.5">
        <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Trước
        </button>
        <span className="px-1">
          Trang <b>{page}</b>/{totalPages}
        </span>
        <button className="btn-secondary px-2 py-1" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Sau ›
        </button>
      </div>
    </div>
  )
}
