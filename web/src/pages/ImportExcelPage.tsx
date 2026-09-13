// ===== Trang "Nhập Excel" — import hàng loạt văn bản =====
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { importExcel, errorMessage } from '@/lib/api'
import type { ImportResult } from '@/lib/types'
import { EmptyState, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'

export function ImportExcelPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const nam = searchParams.get('nam') || ''
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | undefined | null) {
    if (!f) return
    if (!/\.(xlsx)$/i.test(f.name)) {
      toast.error('Chỉ chấp nhận file .xlsx. Vui lòng chọn đúng định dạng.')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
  }

  async function submit() {
    if (!file) {
      toast.error('Vui lòng chọn file Excel trước khi nhập.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await importExcel(file)
      setResult(res)
      if (res.errors.length === 0) {
        toast.success(`Nhập thành công ${res.created} văn bản.`)
      } else {
        toast.info(`Nhập ${res.created} văn bản; ${res.skipped} dòng bỏ qua, ${res.errors.length} lỗi.`)
      }
    } catch (e) {
      setError(errorMessage(e))
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">⬆ Nhập Excel vào sổ {nam ? `năm ${nam}` : ''}</h1>
        <Link to="/" className="btn-secondary">
          ‹ Về sổ
        </Link>
      </div>

      {/* Khu vực kéo-thả */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-slate-50'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            pick(e.dataTransfer.files?.[0] ?? null)
          }}
        >
          <div className="text-4xl">📄</div>
          <p className="text-sm text-slate-600">
            Kéo-thả file <b>.xlsx</b> vào đây, hoặc
          </p>
          <button className="btn-primary" onClick={() => inputRef.current?.click()}>
            Chọn file Excel
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          {file ? (
            <p className="mt-1 rounded-md bg-primary-50 px-3 py-1.5 text-sm text-primary-900">
              Đã chọn: <b>{file.name}</b> ({(file.size / 1024).toFixed(0)} KB)
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Cột bắt buộc trong file: <b>ngày ban hành</b>, <b>người ký</b>, <b>trích yếu</b>, <b>nơi nhận</b>. Số vào
            sổ sẽ được cấp tự động theo năm.
          </p>
          <button className="btn-primary" onClick={() => void submit()} disabled={busy || !file}>
            {busy ? 'Đang nhập…' : 'Bắt đầu nhập'}
          </button>
        </div>

        {/* Link tải file mẫu — chưa sinh file, hướng dẫn liên hệ quản trị */}
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          💡 Chưa có file mẫu tại đây — vui lòng <b>liên hệ quản trị viên</b> để nhận file mẫu .xlsx (định dạng cột
          chuẩn của cơ quan).
        </p>
      </div>

      {/* Lỗi */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Không nhập được file</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {/* Kết quả */}
      {busy ? <Spinner label="Đang đọc file và nhập dữ liệu…" /> : null}

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800">Kết quả nhập</h2>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 px-3 py-3">
              <div className="text-2xl font-bold text-emerald-700">{result.created}</div>
              <div className="text-xs text-emerald-700">Đã nhập</div>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-3">
              <div className="text-2xl font-bold text-slate-600">{result.skipped}</div>
              <div className="text-xs text-slate-500">Bỏ qua</div>
            </div>
            <div className="rounded-lg bg-red-50 px-3 py-3">
              <div className="text-2xl font-bold text-red-600">{result.errors.length}</div>
              <div className="text-xs text-red-600">Lỗi</div>
            </div>
          </div>

          {result.errors.length === 0 ? (
            <EmptyState icon="✅" title="Không có lỗi nào" hint="Toàn bộ dòng hợp lệ đã được nhập vào sổ." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-ledger">
                <thead>
                  <tr>
                    <th className="w-16 text-center">Dòng</th>
                    <th>Nguyên nhân lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="text-center">{e.row}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Link to="/" className="btn-primary">
              Xem sổ văn bản
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
