// ===== Modal chi tiết văn bản: đầy đủ trường + file đính kèm =====
import { useState } from 'react'
import type { DocumentDTO } from '@/lib/types'
import { docTypeBadge, docTypeLabel } from '@/lib/docTypes'
import { formatBytes, formatDate, formatDateTime } from '@/lib/format'
import { deleteAttachment, downloadAttachment, errorMessage, uploadAttachments } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Modal, ConfirmDialog } from '@/components/ui'
import { useToast } from '@/components/Toast'

const MAX_FILE_MB = 20
const MAX_FILES = 5
const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 sm:grid-cols-[160px_1fr]">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="min-w-0 break-words text-sm text-slate-800">{children}</div>
    </div>
  )
}

export function DocumentDetail({
  doc,
  onClose,
  onChanged,
  onEdit,
}: {
  doc: DocumentDTO
  onClose: () => void
  onChanged: () => void
  onEdit: (d: DocumentDTO) => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const canWrite = user?.role === 'VANTHU' || user?.role === 'ADMIN'

  const [busy, setBusy] = useState(false)
  const [delAtt, setDelAtt] = useState<{ id: number; name: string } | null>(null)
  const [adding, setAdding] = useState(false)

  async function handleDownload(att: { id: number; fileName: string }) {
    setBusy(true)
    try {
      await downloadAttachment(att.id, att.fileName)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAttachment() {
    if (!delAtt) return
    setBusy(true)
    try {
      await deleteAttachment(delAtt.id)
      toast.success(`Đã xoá file "${delAtt.name}".`)
      setDelAtt(null)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const picked = Array.from(list).slice(0, MAX_FILES)
    for (const f of picked) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`File "${f.name}" vượt quá ${MAX_FILE_MB}MB.`)
        return
      }
    }
    setAdding(true)
    try {
      await uploadAttachments(doc.id, picked)
      toast.success(`Đã thêm ${picked.length} file đính kèm.`)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Chi tiết văn bản — Số ${doc.soVaoSo}/${doc.nam}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${docTypeBadge(doc.loaiVB)}`}>{docTypeLabel(doc.loaiVB)}</span>
          <span className="badge bg-slate-100 text-slate-700">Số &amp; ký hiệu: {doc.soKyHieu}</span>
        </div>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-3.5">
          <Row label="Số vào sổ">
            {doc.soVaoSo}/{doc.nam}
          </Row>
          <Row label="Ngày ban hành">{formatDate(doc.ngayBanHanh)}</Row>
          <Row label="Số &amp; ký hiệu">{doc.soKyHieu}</Row>
          <Row label="Người ký">{doc.nguoiKy}</Row>
          <Row label="Trích yếu">{doc.trichYeu}</Row>
          <Row label="Nơi nhận">{doc.noiNhan}</Row>
          <Row label="Số bản">{doc.soBan}</Row>
          <Row label="Ghi chú">{doc.ghiChu || '—'}</Row>
          <Row label="Người nhập">
            {doc.nguoiTao?.fullName ?? '—'} · {formatDateTime(doc.createdAt)}
          </Row>
          {doc.updatedAt !== doc.createdAt ? <Row label="Cập nhật">{formatDateTime(doc.updatedAt)}</Row> : null}
        </div>

        {/* File đính kèm */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              📎 File đính kèm {doc.attachments.length > 0 ? `(${doc.attachments.length})` : ''}
            </h3>
            {canWrite && (
              <label className="btn-secondary cursor-pointer text-xs">
                {adding ? 'Đang tải…' : '+ Thêm file'}
                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    void handleAddFiles(e.target.files)
                    e.target.value = ''
                  }}
                  disabled={adding}
                />
              </label>
            )}
          </div>
          {doc.attachments.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-center text-sm text-slate-400">
              Chưa có file đính kèm.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {doc.attachments.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">📄 {att.fileName}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatBytes(att.size)}</span>
                  <button
                    className="shrink-0 text-xs text-primary-700 hover:underline"
                    onClick={() => void handleDownload(att)}
                    disabled={busy}
                  >
                    ⬇ Tải về
                  </button>
                  {canWrite && (
                    <button
                      className="shrink-0 text-xs text-red-600 hover:underline"
                      onClick={() => setDelAtt({ id: att.id, name: att.fileName })}
                      disabled={busy}
                    >
                      🗑 Xoá
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          {canWrite && (
            <button className="btn-secondary" onClick={() => onEdit(doc)}>
              ✏️ Sửa
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!delAtt}
        title="Xoá file đính kèm"
        message={`Bạn chắc chắn muốn xoá file "${delAtt?.name ?? ''}"?`}
        confirmLabel="Xoá file"
        danger
        loading={busy}
        onConfirm={() => void handleDeleteAttachment()}
        onCancel={() => setDelAtt(null)}
      />
    </Modal>
  )
}
