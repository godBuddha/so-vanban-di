// ===== Trang Nhật ký hệ thống (audit log) — ADMIN =====
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listAuditLogs, errorMessage } from '@/lib/api'
import type { AuditLogRow } from '@/lib/types'
import { formatDateTime } from '@/lib/format'
import { EmptyState, Pagination, TableSkeleton } from '@/components/ui'
import { TabLink } from './AdminPage'

const PAGE_SIZE = 20

/** Nhãn tiếng Việt cho action */
const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  LOGOUT: 'Đăng xuất',
  CREATE: 'Tạo mới',
  UPDATE: 'Sửa',
  DELETE: 'Xoá',
  IMPORT: 'Nhập Excel',
  EXPORT: 'Xuất Excel',
  UPLOAD: 'Tải file đính kèm',
  ATTACHMENT_DELETE: 'Xoá file đính kèm',
}

const ACTION_BADGES: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-slate-100 text-slate-700',
  LOGOUT: 'bg-slate-100 text-slate-700',
  IMPORT: 'bg-violet-100 text-violet-800',
  EXPORT: 'bg-cyan-100 text-cyan-800',
  UPLOAD: 'bg-amber-100 text-amber-800',
  ATTACHMENT_DELETE: 'bg-rose-100 text-rose-800',
}

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a
}
function actionBadge(a: string): string {
  return ACTION_BADGES[a] ?? 'bg-slate-100 text-slate-700'
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (p: number, keyword: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await listAuditLogs(p, PAGE_SIZE, keyword || undefined)
        setRows(res.data)
        setTotal(res.total)
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load(page, q)
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    setSearchParams(p, { replace: true })
  }, [load, page, q, setSearchParams])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800 md:text-xl">📜 Nhật ký hệ thống</h1>

      <div className="flex gap-1.5 border-b border-slate-200">
        <TabLink to="/admin/users" label="👥 Người dùng" />
        <TabLink to="/admin/audit" label="📜 Nhật ký" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Tìm theo tên người thực hiện, hành động, mô tả…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
          {q ? (
            <button
              className="btn-secondary"
              onClick={() => {
                setQ('')
                setPage(1)
              }}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : error ? (
          <div className="p-8 text-center">
            <div className="mb-2 text-3xl">🔌</div>
            <p className="text-sm text-slate-500">{error}</p>
            <button className="btn-primary mt-3" onClick={() => void load(page, q)}>
              Thử lại
            </button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="📜" title="Chưa có nhật ký nào" hint="Các thao tác trong hệ thống sẽ được ghi lại tại đây." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-ledger">
              <thead>
                <tr>
                  <th className="w-40">Thời gian</th>
                  <th className="w-40">Người thực hiện</th>
                  <th className="w-36">Hành động</th>
                  <th className="w-28">Đối tượng</th>
                  <th>Mô tả</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td>{r.user?.fullName ?? '—'}</td>
                    <td>
                      <span className={`badge ${actionBadge(r.action)}`}>{actionLabel(r.action)}</span>
                    </td>
                    <td>
                      {r.entity}
                      {r.entityId ? ` #${r.entityId}` : ''}
                    </td>
                    <td>{r.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  )
}
