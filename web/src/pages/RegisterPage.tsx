// ===== Trang chính: Sổ văn bản đi (mô phỏng sổ giấy) =====
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import { ConfirmDialog, EmptyState, Pagination, TableSkeleton } from '@/components/ui'
import { DocumentForm } from '@/components/DocumentForm'
import { DocumentDetail } from '@/components/DocumentDetail'
import { docTypeBadge, docTypeLabel, DOC_TYPE_LABELS, ALL_DOC_TYPES } from '@/lib/docTypes'
import { formatDate } from '@/lib/format'
import {
  deleteDocument,
  errorMessage,
  listDocuments,
  downloadExcel,
  type DocumentFilters as ApiFilters,
} from '@/lib/api'
import type { DocumentDTO } from '@/lib/types'
import { currentYear } from '@/lib/format'

const PAGE_SIZE = 20

interface Filters {
  q: string
  nam: string
  loaiVB: string
  noiNhan: string
  from: string
  to: string
  sort: 'soVaoSo' | 'ngayBanHanh'
  order: 'asc' | 'desc'
}

const EMPTY_FILTERS: Filters = {
  q: '',
  nam: String(currentYear()),
  loaiVB: '',
  noiNhan: '',
  from: '',
  to: '',
  sort: 'soVaoSo',
  order: 'asc',
}

/** Bộ lọc → query string để chia sẻ sang trang In sổ */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.nam) p.set('nam', f.nam)
  if (f.loaiVB) p.set('loaiVB', f.loaiVB)
  if (f.noiNhan) p.set('noiNhan', f.noiNhan)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.sort) p.set('sort', f.sort)
  if (f.order) p.set('order', f.order)
  return p.toString()
}

export function parseQueryToFilters(qs: URLSearchParams): Filters {
  return {
    q: qs.get('q') ?? '',
    nam: qs.get('nam') ?? String(currentYear()),
    loaiVB: qs.get('loaiVB') ?? '',
    noiNhan: qs.get('noiNhan') ?? '',
    from: qs.get('from') ?? '',
    to: qs.get('to') ?? '',
    sort: (qs.get('sort') as Filters['sort']) ?? 'soVaoSo',
    order: (qs.get('order') as Filters['order']) ?? 'asc',
  }
}

export function RegisterPage({ readonly = false }: { readonly?: boolean }) {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const canWrite = user?.role === 'VANTHU' || user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'

  const [filters, setFilters] = useState<Filters>(() => parseQueryToFilters(searchParams))
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<DocumentDTO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentDTO | null>(null)
  const [detail, setDetail] = useState<DocumentDTO | null>(null)
  const [deleting, setDeleting] = useState<DocumentDTO | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const firstRun = useRef(true)

  const years = useMemo(() => {
    const y = currentYear()
    return Array.from({ length: y - 2019 + 2 }, (_, i) => 2020 + i)
  }, [])

  // Tải danh sách khi đổi bộ lọc / trang
  const load = useCallback(
    async (f: Filters, p: number) => {
      setLoading(true)
      setLoadError(null)
      try {
        const apiFilters: ApiFilters = {
          q: f.q || undefined,
          nam: f.nam ? Number(f.nam) : undefined,
          loaiVB: (f.loaiVB || undefined) as ApiFilters['loaiVB'],
          noiNhan: f.noiNhan || undefined,
          from: f.from || undefined,
          to: f.to || undefined,
          sort: f.sort,
          order: f.order,
          page: p,
          pageSize: PAGE_SIZE,
        }
        const res = await listDocuments(apiFilters)
        setRows(res.data)
        setTotal(res.total)
        // Nếu server trả về page khác (VD quá trang cuối) thì đồng bộ
        if (res.page && res.page !== p) setPage(res.page)
      } catch (e) {
        setLoadError(errorMessage(e))
        setRows([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Đồng bộ bộ lọc lên URL (chỉ khi là lần chạy đầu hoặc người dùng đổi)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
    }
    const qs = filtersToQuery(filters)
    setSearchParams(qs, { replace: true })
  }, [filters, setSearchParams])

  useEffect(() => {
    void load(filters, page)
  }, [load, filters, page])

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deleteDocument(deleting.id)
      toast.success(`Đã xoá văn bản số ${deleting.soVaoSo}/${deleting.nam}.`)
      setDeleting(null)
      void load(filters, page)
    } catch (e) {
      const msg = errorMessage(e)
      // 403 → chỉ quản trị viên được xoá
      toast.error(msg.includes('403') ? 'Chỉ quản trị viên được xoá văn bản.' : msg)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await downloadExcel({
        q: filters.q || undefined,
        nam: filters.nam ? Number(filters.nam) : undefined,
        loaiVB: (filters.loaiVB || undefined) as ApiFilters['loaiVB'],
        noiNhan: filters.noiNhan || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        sort: filters.sort,
        order: filters.order,
      })
      toast.success('Đã xuất file Excel theo bộ lọc hiện tại.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ===== Thanh tiêu đề + hành động ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">
          📒 {readonly ? 'Tra cứu văn bản đi' : 'Sổ văn bản đi'}{' '}
          <span className="text-sm font-normal text-slate-500">năm {filters.nam || '…'}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && !readonly && (
            <>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                + Nhập văn bản
              </button>
              <Link to={`/nhap-excel?${filtersToQuery(filters)}`} className="btn-secondary">
                ⬆ Nhập Excel
              </Link>
            </>
          )}
          <button className="btn-secondary" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? 'Đang xuất…' : '📊 Xuất Excel'}
          </button>
          <Link to={`/in-so?${filtersToQuery(filters)}`} className="btn-secondary">
            🖨 In sổ
          </Link>
        </div>
      </div>

      {/* ===== Thanh lọc ===== */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Tìm kiếm</label>
            <input
              className="input"
              placeholder="Trích yếu, số ký hiệu, người ký, nơi nhận…"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Năm</label>
            <select className="input" value={filters.nam} onChange={(e) => update('nam', e.target.value)}>
              <option value="">Tất cả</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Loại văn bản</label>
            <select className="input" value={filters.loaiVB} onChange={(e) => update('loaiVB', e.target.value)}>
              <option value="">Tất cả</option>
              {ALL_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nơi nhận</label>
            <input
              className="input"
              placeholder="Đơn vị nhận…"
              value={filters.noiNhan}
              onChange={(e) => update('noiNhan', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Ngày ban hành từ</label>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(e) => update('from', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Đến ngày</label>
            <input type="date" className="input" value={filters.to} onChange={(e) => update('to', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Sắp xếp</label>
              <select
                className="input"
                value={filters.sort}
                onChange={(e) => update('sort', e.target.value as Filters['sort'])}
              >
                <option value="soVaoSo">Số vào sổ</option>
                <option value="ngayBanHanh">Ngày ban hành</option>
              </select>
            </div>
            <div>
              <label className="label">Chiều</label>
              <select
                className="input"
                value={filters.order}
                onChange={(e) => update('order', e.target.value as Filters['order'])}
              >
                <option value="asc">Tăng dần</option>
                <option value="desc">Giảm dần</option>
              </select>
            </div>
          </div>
        </div>
        {(filters.q || filters.loaiVB || filters.noiNhan || filters.from || filters.to || filters.nam) && (
          <div className="mt-2.5 flex justify-end">
            <button
              className="text-xs text-primary-700 hover:underline"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS })
                setPage(1)
              }}
            >
              ✕ Xoá bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* ===== Bảng sổ ===== */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton />
        ) : loadError ? (
          <div className="p-8 text-center">
            <div className="mb-2 text-3xl">🔌</div>
            <p className="font-medium text-slate-700">Không tải được dữ liệu</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{loadError}</p>
            <button className="btn-primary mt-3" onClick={() => void load(filters, page)}>
              Thử lại
            </button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="📒"
            title="Chưa có văn bản nào"
            hint={
              canWrite && !readonly
                ? 'Sổ đang trống (hoặc bộ lọc không khớp). Bấm "+ Nhập văn bản" để bắt đầu ghi sổ.'
                : 'Sổ đang trống hoặc bộ lọc không khớp. Vui lòng điều chỉnh bộ lọc.'
            }
            action={
              canWrite && !readonly ? (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  + Nhập văn bản
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-ledger">
              <thead>
                <tr>
                  <th className="w-16 text-center">Số vào sổ</th>
                  <th className="w-24">Ngày tháng</th>
                  <th className="w-28">Loại</th>
                  <th className="w-40">Số &amp; ký hiệu</th>
                  <th className="w-24">Ngày ban hành</th>
                  <th className="w-36">Người ký</th>
                  <th>Trích yếu</th>
                  <th className="w-44">Nơi nhận</th>
                  <th className="w-14 text-center">Số bản</th>
                  <th className="w-16 text-center">Đính kèm</th>
                  <th className="w-32 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer hover:bg-primary-50/60"
                    onClick={() => setDetail(d)}
                    title="Bấm để xem chi tiết"
                  >
                    <td className="text-center font-semibold text-primary-900">{d.soVaoSo}</td>
                    <td className="whitespace-nowrap">{formatDate(d.createdAt)}</td>
                    <td>
                      <span className={`badge ${docTypeBadge(d.loaiVB)}`}>{docTypeLabel(d.loaiVB)}</span>
                    </td>
                    <td className="whitespace-nowrap">{d.soKyHieu}</td>
                    <td className="whitespace-nowrap">{formatDate(d.ngayBanHanh)}</td>
                    <td>{d.nguoiKy}</td>
                    <td className="min-w-64">{d.trichYeu}</td>
                    <td>{d.noiNhan}</td>
                    <td className="text-center">{d.soBan}</td>
                    <td className="text-center" title={d.attachments.map((a) => a.fileName).join(', ')}>
                      {d.attachments.length > 0 ? `📎 ${d.attachments.length}` : '—'}
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="rounded px-1.5 py-0.5 text-primary-700 hover:bg-primary-50"
                          onClick={() => setDetail(d)}
                        >
                          Xem
                        </button>
                        {canWrite && (
                          <button
                            className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-100"
                            onClick={() => {
                              setEditing(d)
                              setFormOpen(true)
                            }}
                          >
                            Sửa
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(d)}
                          >
                            Xoá
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </div>

      {/* ===== Modal nhập / sửa ===== */}
      {formOpen && (
        <DocumentForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editing={editing}
          defaultNam={filters.nam ? Number(filters.nam) : currentYear()}
          onSaved={() => void load(filters, page)}
        />
      )}

      {/* ===== Modal chi tiết ===== */}
      {detail && (
        <DocumentDetail
          doc={detail}
          onClose={() => setDetail(null)}
          onChanged={() => void load(filters, page)}
          onEdit={(d) => {
            setDetail(null)
            setEditing(d)
            setFormOpen(true)
          }}
        />
      )}

      {/* ===== Xác nhận xoá ===== */}
      <ConfirmDialog
        open={!!deleting}
        title="Xoá văn bản"
        message={
          deleting
            ? `Xoá văn bản số ${deleting.soVaoSo}/${deleting.nam} — "${deleting.trichYeu.slice(0, 80)}"?\nHành động này không thể hoàn tác.`
            : ''
        }
        confirmLabel="Xoá"
        danger
        loading={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />

      {/* Cảnh báo vai trò chỉ tra cứu — dùng navigate để tránh unused */}
      {!canWrite && !readonly && user ? (
        <p className="text-center text-xs text-slate-400">
          Bạn đang ở chế độ tra cứu chỉ đọc.
          <button className="ml-1 text-primary-700 hover:underline" onClick={() => navigate('/tracuu')}>
            Đến trang tra cứu
          </button>
        </p>
      ) : null}
    </div>
  )
}
