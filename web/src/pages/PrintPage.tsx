// ===== Trang "In sổ" — khổ A4 ngang, in/lưu PDF phía trình duyệt =====
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listDocuments, errorMessage } from '@/lib/api'
import { docTypeLabel } from '@/lib/docTypes'
import { formatDate, currentYear } from '@/lib/format'
import type { DocumentDTO } from '@/lib/types'
import { Spinner, EmptyState } from '@/components/ui'
import { parseQueryToFilters } from '@/pages/RegisterPage'

const UNIT_NAME = (import.meta.env.VITE_UNIT_NAME as string | undefined) || 'ỦY BAN NHÂN DÂN'
const MAX_ROWS_PER_PAGE = 30
/** Giới hạn an toàn tổng số dòng in (tránh treo trình duyệt) */
const MAX_ROWS_TOTAL = 600

export function PrintPage() {
  const [searchParams] = useSearchParams()
  const filters = useMemo(() => parseQueryToFilters(searchParams), [searchParams])
  const [rows, setRows] = useState<DocumentDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const nam = filters.nam ? Number(filters.nam) : currentYear()

  // Tải toàn bộ dữ liệu theo bộ lọc (lần lượt từng trang, tối đa MAX_ROWS_TOTAL dòng)
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const collected: DocumentDTO[] = []
      const pageSize = 100
      let page = 1
      let total = Infinity
      while (collected.length < Math.min(total, MAX_ROWS_TOTAL)) {
        const res = await listDocuments({
          q: filters.q || undefined,
          nam: filters.nam ? Number(filters.nam) : undefined,
          loaiVB: (filters.loaiVB || undefined) as never,
          noiNhan: filters.noiNhan || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          sort: filters.sort,
          order: filters.order,
          page,
          pageSize,
        })
        collected.push(...res.data)
        total = res.total
        if (res.data.length < pageSize) break
        page += 1
      }
      if (collected.length > MAX_ROWS_TOTAL) collected.length = MAX_ROWS_TOTAL
      setTruncated(collected.length >= MAX_ROWS_TOTAL && total > MAX_ROWS_TOTAL)
      setRows(collected)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // Chia thành các trang in, mỗi trang tối đa 30 dòng
  const chunks: DocumentDTO[][] = []
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + MAX_ROWS_PER_PAGE))
  }

  const now = new Date()

  return (
    <div className="mx-auto max-w-full">
      {/* ===== Thanh hành động (không in) ===== */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">🖨 In sổ văn bản đi năm {nam}</h1>
          <p className="text-sm text-slate-500">
            Sử dụng đúng bộ lọc từ trang sổ · khổ giấy A4 ngang · tối đa {MAX_ROWS_PER_PAGE} dòng/trang
            {truncated ? ` · chỉ in ${MAX_ROWS_TOTAL} dòng đầu` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/" className="btn-secondary">
            ‹ Về sổ
          </Link>
          <button className="btn-primary" onClick={() => window.print()} disabled={loading}>
            🖨 In / Lưu PDF
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner label="Đang chuẩn bị dữ liệu để in…" />
      ) : error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mb-2 text-3xl">🔌</div>
          <p className="font-medium text-slate-700">Không tải được dữ liệu để in</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{error}</p>
          <button className="btn-primary mt-3" onClick={() => void fetchAll()}>
            Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="🖨" title="Không có văn bản nào để in" hint="Bộ lọc hiện tại không có kết quả." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:shadow-none">
          <div className="print-area">
            {chunks.map((chunk, ci) => (
              <div key={ci} className={ci < chunks.length - 1 ? 'print-page-break' : ''}>
                {/* ===== Tiêu đề trang (lặp mỗi trang in) ===== */}
                <div className="mb-4 text-center">
                  <div className="text-base font-bold uppercase tracking-wide">{UNIT_NAME.toUpperCase()}</div>
                  <div className="mt-1 text-xl font-bold uppercase">SỔ VĂN BẢN ĐI NĂM {nam}</div>
                  <div className="mt-1 text-sm">
                    Trang {ci + 1}/{chunks.length}
                  </div>
                </div>
                <div className="mb-2 text-right text-sm">
                  <div>
                    …, ngày {now.getDate()} tháng {now.getMonth() + 1} năm {now.getFullYear()}
                  </div>
                  <div className="mt-10 font-semibold">TRƯỞNG ĐƠN VỊ</div>
                  <div className="italic text-xs text-slate-400">(Ký, ghi rõ họ tên, chức vụ)</div>
                </div>

                {/* ===== Bảng sổ ===== */}
                <table className="print-table">
                  <thead>
                    <tr>
                      <th className="w-10">STT</th>
                      <th className="w-14">Số vào sổ</th>
                      <th className="w-20">Ngày tháng</th>
                      <th className="w-16">Loại</th>
                      <th className="w-32">Số &amp; ký hiệu</th>
                      <th className="w-20">Ngày ban hành</th>
                      <th className="w-28">Người ký</th>
                      <th>Trích yếu</th>
                      <th className="w-36">Nơi nhận</th>
                      <th className="w-10">Số bản</th>
                      <th className="w-10">Đ/k</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((d, i) => (
                      <tr key={d.id}>
                        <td className="text-center">{ci * MAX_ROWS_PER_PAGE + i + 1}</td>
                        <td className="text-center">{d.soVaoSo}</td>
                        <td>{formatDate(d.createdAt)}</td>
                        <td>{docTypeLabel(d.loaiVB)}</td>
                        <td>{d.soKyHieu}</td>
                        <td>{formatDate(d.ngayBanHanh)}</td>
                        <td>{d.nguoiKy}</td>
                        <td>{d.trichYeu}</td>
                        <td>{d.noiNhan}</td>
                        <td className="text-center">{d.soBan}</td>
                        <td className="text-center">{d.attachments.length > 0 ? d.attachments.length : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Chân trang — nơi ghi chú số trang */}
                <div className="mt-2 text-right text-xs">— Hết trang {ci + 1} —</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
