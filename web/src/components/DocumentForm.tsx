// ===== Form nhập / sửa văn bản đi (modal) =====
import { useEffect, useState } from 'react'
import { createDocument, errorMessage, nextNumber, updateDocument, uploadAttachments, type DocumentInput } from '@/lib/api'
import { ALL_DOC_TYPES, DOC_TYPE_LABELS } from '@/lib/docTypes'
import type { DocumentDTO } from '@/lib/types'
import { Modal } from '@/components/ui'
import { useToast } from '@/components/Toast'

const MAX_FILE_MB = 20
const MAX_FILES = 5
const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'

interface Props {
  open: boolean
  onClose: () => void
  /** Văn bản cần sửa (undefined = tạo mới) */
  editing?: DocumentDTO | null
  defaultNam: number
  onSaved: () => void
}

interface FormState {
  soVaoSo: string
  loaiVB: string
  soKyHieu: string
  ngayBanHanh: string
  nguoiKy: string
  trichYeu: string
  noiNhan: string
  soBan: string
  ghiChu: string
}

function emptyForm(defaultNam: number): FormState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    soVaoSo: '',
    loaiVB: 'CONG_VAN',
    soKyHieu: '',
    ngayBanHanh: today,
    nguoiKy: '',
    trichYeu: '',
    noiNhan: '',
    soBan: '1',
    ghiChu: '',
  }
}

export function DocumentForm({ open, onClose, editing, defaultNam, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<FormState>(emptyForm(defaultNam))
  const [files, setFiles] = useState<File[]>([])
  const [nextNo, setNextNo] = useState<number | null>(null)
  const [nextSymbol, setNextSymbol] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Nạp dữ liệu khi mở modal
  useEffect(() => {
    if (!open) return
    setErrors({})
    setFiles([])
    if (editing) {
      setForm({
        soVaoSo: String(editing.soVaoSo),
        loaiVB: editing.loaiVB,
        soKyHieu: editing.soKyHieu,
        ngayBanHanh: editing.ngayBanHanh,
        nguoiKy: editing.nguoiKy,
        trichYeu: editing.trichYeu,
        noiNhan: editing.noiNhan,
        soBan: String(editing.soBan),
        ghiChu: editing.ghiChu ?? '',
      })
    } else {
      setForm(emptyForm(defaultNam))
      // Xem trước số vào sổ kế tiếp
      nextNumber(defaultNam)
        .then((r) => {
          setNextNo(r.soVaoSo)
          setNextSymbol(r.soKyHieu)
        })
        .catch(() => {
          setNextNo(null)
          setNextSymbol('')
        })
    }
  }, [open, editing, defaultNam])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.loaiVB) e.loaiVB = 'Chọn loại văn bản.'
    if (!form.ngayBanHanh) e.ngayBanHanh = 'Chọn ngày ban hành.'
    if (!form.nguoiKy.trim()) e.nguoiKy = 'Nhập người ký.'
    if (!form.trichYeu.trim()) e.trichYeu = 'Nhập trích yếu.'
    else if (form.trichYeu.trim().length > 500) e.trichYeu = 'Trích yếu tối đa 500 ký tự.'
    if (!form.noiNhan.trim()) e.noiNhan = 'Nhập nơi nhận.'
    const soBan = Number(form.soBan)
    if (!Number.isInteger(soBan) || soBan < 1) e.soBan = 'Số bản phải là số nguyên ≥ 1.'
    if (form.soVaoSo.trim()) {
      const n = Number(form.soVaoSo)
      if (!Number.isInteger(n) || n < 1) e.soVaoSo = 'Số vào sổ phải là số nguyên dương (hoặc bỏ trống để tự cấp).'
    }
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        e.files = `File "${f.name}" vượt quá ${MAX_FILE_MB}MB.`
        break
      }
    }
    if (files.length > MAX_FILES) e.files = `Tối đa ${MAX_FILES} file mỗi lần tải.`
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    setErrors((e) => ({ ...e, files: '' }))
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_FILES))
  }

  async function submit() {
    if (!validate()) return
    setSaving(true)
    try {
      const input: DocumentInput = {
        nam: editing?.nam ?? defaultNam,
        loaiVB: form.loaiVB,
        soKyHieu: form.soKyHieu.trim(),
        ngayBanHanh: form.ngayBanHanh,
        nguoiKy: form.nguoiKy.trim(),
        trichYeu: form.trichYeu.trim(),
        noiNhan: form.noiNhan.trim(),
        soBan: Number(form.soBan),
        ghiChu: form.ghiChu.trim() || null,
      }
      if (editing) {
        await updateDocument(editing.id, input)
        toast.success('Đã lưu thay đổi văn bản.')
      } else {
        if (form.soVaoSo.trim()) input.soVaoSo = Number(form.soVaoSo)
        const created = await createDocument(input)
        // Hợp đồng API: đính kèm file qua endpoint riêng sau khi tạo
        if (files.length > 0) {
          try {
            await uploadAttachments(created.id, files)
            toast.success(`Đã đính kèm ${files.length} file.`)
          } catch (e2) {
            toast.error(`Đã tạo văn bản nhưng không tải được file: ${errorMessage(e2)}`)
          }
        }
        toast.success(`Đã nhập văn bản số ${created.soVaoSo}/${created.nam} vào sổ.`)
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Khi sửa: upload file bổ sung sau khi lưu
  async function saveExtraFiles() {
    if (!editing || files.length === 0) return
    try {
      await uploadAttachments(editing.id, files)
      toast.success(`Đã đính kèm ${files.length} file.`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Sửa văn bản đi' : 'Nhập văn bản đi'} wide>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (editing) {
            void submit().then(() => void saveExtraFiles())
          } else {
            void submit()
          }
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Số vào sổ</label>
            <input
              className={`input ${errors.soVaoSo ? 'border-red-400' : ''}`}
              value={form.soVaoSo}
              onChange={(e) => set('soVaoSo', e.target.value)}
              inputMode="numeric"
              disabled={!!editing}
              placeholder={
                editing
                  ? String(editing.soVaoSo)
                  : nextNo
                    ? `Bỏ trống = ${nextNo} (tự động)${nextSymbol ? ` · ${nextSymbol}` : ''}`
                    : 'Bỏ trống để tự cấp số'
              }
            />
            {errors.soVaoSo ? <p className="mt-1 text-xs text-red-600">{errors.soVaoSo}</p> : null}
            {editing ? <p className="mt-1 text-xs text-slate-400">Không thể thay đổi số đã cấp.</p> : null}
          </div>
          <div>
            <label className="label">Loại văn bản *</label>
            <select
              className={`input ${errors.loaiVB ? 'border-red-400' : ''}`}
              value={form.loaiVB}
              onChange={(e) => {
                set('loaiVB', e.target.value)
                // Gợi ý số ký hiệu theo mẫu khi tạo mới và chưa điền
                if (!editing && !form.soKyHieu.trim()) set('soKyHieu', '')
              }}
            >
              {ALL_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {errors.loaiVB ? <p className="mt-1 text-xs text-red-600">{errors.loaiVB}</p> : null}
          </div>
          <div>
            <label className="label">Ngày ban hành *</label>
            <input
              type="date"
              className={`input ${errors.ngayBanHanh ? 'border-red-400' : ''}`}
              value={form.ngayBanHanh}
              onChange={(e) => set('ngayBanHanh', e.target.value)}
            />
            {errors.ngayBanHanh ? <p className="mt-1 text-xs text-red-600">{errors.ngayBanHanh}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Số & ký hiệu</label>
            <input
              className="input"
              value={form.soKyHieu}
              onChange={(e) => set('soKyHieu', e.target.value)}
              placeholder="VD: 145/2026/CV-UBND (bỏ trống để server sinh theo mẫu)"
            />
            <p className="mt-1 text-xs text-slate-400">Có thể sửa tay trước khi lưu.</p>
          </div>
          <div>
            <label className="label">Người ký *</label>
            <input
              className={`input ${errors.nguoiKy ? 'border-red-400' : ''}`}
              value={form.nguoiKy}
              onChange={(e) => set('nguoiKy', e.target.value)}
              placeholder="VD: Nguyễn Văn A — Chủ tịch"
            />
            {errors.nguoiKy ? <p className="mt-1 text-xs text-red-600">{errors.nguoiKy}</p> : null}
          </div>
        </div>

        <div>
          <label className="label">Trích yếu *</label>
          <textarea
            className={`input min-h-20 ${errors.trichYeu ? 'border-red-400' : ''}`}
            value={form.trichYeu}
            onChange={(e) => set('trichYeu', e.target.value)}
            placeholder="Nội dung chính của văn bản…"
          />
          {errors.trichYeu ? <p className="mt-1 text-xs text-red-600">{errors.trichYeu}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">Nơi nhận *</label>
            <input
              className={`input ${errors.noiNhan ? 'border-red-400' : ''}`}
              value={form.noiNhan}
              onChange={(e) => set('noiNhan', e.target.value)}
              placeholder="VD: UBND các xã, phường thuộc huyện…"
            />
            {errors.noiNhan ? <p className="mt-1 text-xs text-red-600">{errors.noiNhan}</p> : null}
          </div>
          <div>
            <label className="label">Số bản *</label>
            <input
              className={`input ${errors.soBan ? 'border-red-400' : ''}`}
              value={form.soBan}
              onChange={(e) => set('soBan', e.target.value)}
              inputMode="numeric"
            />
            {errors.soBan ? <p className="mt-1 text-xs text-red-600">{errors.soBan}</p> : null}
          </div>
        </div>

        <div>
          <label className="label">Ghi chú</label>
          <input
            className="input"
            value={form.ghiChu}
            onChange={(e) => set('ghiChu', e.target.value)}
            placeholder="Ghi chú thêm (không bắt buộc)"
          />
        </div>

        <div>
          <label className="label">File đính kèm (PDF/DOC/DOCX/JPG/PNG, ≤{MAX_FILE_MB}MB, tối đa {MAX_FILES} file)</label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-700">
            <span>📎</span>
            <span>Bấm để chọn file…</span>
            <input
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 text-sm">
                  <span className="truncate">
                    📄 {f.name} <span className="text-slate-400">({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Bỏ file ${f.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.files ? <p className="mt-1 text-xs text-red-600">{errors.files}</p> : null}
          {editing ? <p className="mt-1 text-xs text-slate-400">File sẽ được đính thêm vào văn bản hiện có.</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu vào sổ'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
