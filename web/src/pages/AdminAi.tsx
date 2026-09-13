// ===== Cấu hình AI (ADMIN): chat / embedding / rerank / OCR + kiểm tra kết nối + lập chỉ mục =====
import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { ConfirmDialog, Spinner } from '@/components/ui'
import {
  adminAiReindex,
  adminAiStatus,
  adminGetAiConfig,
  adminPutAiConfig,
  errorMessage,
  type AiConfig,
  type AiProvider,
  type AiStatus,
} from '@/lib/api'

/** Form state — key để trống nghĩa là giữ nguyên giá trị đã lưu trên server */
interface FormState {
  chatProvider: AiProvider
  ollamaBaseUrl: string
  openaiBaseUrl: string
  chatModel: string
  openaiApiKey: string
  embedProvider: AiProvider
  embedModel: string
  rerankProvider: 'none' | 'openai'
  rerankBaseUrl: string
  rerankModel: string
  rerankApiKey: string
  ocrUrl: string
}

const EMPTY_FORM: FormState = {
  chatProvider: 'none',
  ollamaBaseUrl: '',
  openaiBaseUrl: '',
  chatModel: '',
  openaiApiKey: '',
  embedProvider: 'none',
  embedModel: '',
  rerankProvider: 'none',
  rerankBaseUrl: '',
  rerankModel: '',
  rerankApiKey: '',
  ocrUrl: '',
}

export function AdminAiPage() {
  const toast = useToast()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const [reindexConfirm, setReindexConfirm] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [reindexResult, setReindexResult] = useState<string | null>(null)

  // Nạp cấu hình hiện có khi vào trang
  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    adminGetAiConfig()
      .then((cfg) => {
        setForm({
          chatProvider: cfg.chatProvider ?? 'none',
          ollamaBaseUrl: cfg.ollamaBaseUrl ?? '',
          openaiBaseUrl: cfg.openaiBaseUrl ?? '',
          chatModel: cfg.chatModel ?? '',
          openaiApiKey: '', // key bị server che — để trống = giữ nguyên
          embedProvider: cfg.embedProvider ?? 'none',
          embedModel: cfg.embedModel ?? '',
          rerankProvider: cfg.rerankProvider ?? 'none',
          rerankBaseUrl: cfg.rerankBaseUrl ?? '',
          rerankModel: cfg.rerankModel ?? '',
          rerankApiKey: '',
          ocrUrl: cfg.ocrUrl ?? '',
        })
      })
      .catch((e) => setLoadError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      // Chỉ gửi các trường có giá trị; key để trống nghĩa là giữ nguyên trên server
      const body: Partial<AiConfig> = {
        chatProvider: form.chatProvider,
        ollamaBaseUrl: form.ollamaBaseUrl,
        openaiBaseUrl: form.openaiBaseUrl,
        chatModel: form.chatModel,
        embedProvider: form.embedProvider,
        embedModel: form.embedModel,
        rerankProvider: form.rerankProvider,
        rerankBaseUrl: form.rerankBaseUrl,
        rerankModel: form.rerankModel,
        ocrUrl: form.ocrUrl,
      }
      if (form.openaiApiKey.trim()) body.openaiApiKey = form.openaiApiKey.trim()
      if (form.rerankApiKey.trim()) body.rerankApiKey = form.rerankApiKey.trim()
      await adminPutAiConfig(body)
      toast.success('Đã lưu cấu hình AI.')
      setForm((f) => ({ ...f, openaiApiKey: '', rerankApiKey: '' }))
      void checkStatus(true)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  /** Kiểm tra kết nối: lấy trạng thái mới nhất từ server */
  async function checkStatus(afterSave = false) {
    if (!afterSave) setReindexResult(null)
    setChecking(true)
    try {
      const st = await adminAiStatus()
      setStatus(st)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  async function reindexAll() {
    setReindexConfirm(false)
    setReindexing(true)
    setReindexResult(null)
    try {
      const r = await adminAiReindex()
      setReindexResult(`Đã lập chỉ mục ${r.indexed} văn bản — tổng cộng ${r.chunks} đoạn nội dung.`)
      toast.success('Hoàn tất lập chỉ mục lại toàn bộ.')
      void checkStatus(true)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setReindexing(false)
    }
  }

  if (loading) {
    return <Spinner label="Đang tải cấu hình AI…" />
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="mb-2 text-3xl">🔌</div>
        <p className="font-medium text-red-800">Không tải được cấu hình AI</p>
        <p className="mt-1 text-sm text-red-600">{loadError}</p>
        <button className="btn-primary mt-3" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">⚙️ Cấu hình AI</h1>
        <button className="btn-secondary" onClick={() => void checkStatus()} disabled={checking}>
          {checking ? 'Đang kiểm tra…' : '🔌 Kiểm tra kết nối'}
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Thiết lập kết nối các dịch vụ AI cho Trợ lý AI: trợ lý hội thoại, embedding (dùng cho tìm kiếm ngữ nghĩa),
        rerank (xếp lại kết quả) và dịch vụ OCR nhận dạng văn bản.
      </p>

      {/* ===== Form cấu hình ===== */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* --- Trợ lý hội thoại --- */}
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1.5 text-sm font-semibold text-slate-700">💬 Trợ lý hội thoại</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nhà cung cấp</label>
              <select
                className="input"
                value={form.chatProvider}
                onChange={(e) => set('chatProvider', e.target.value as AiProvider)}
              >
                <option value="none">Chưa bật (none)</option>
                <option value="ollama">Ollama (chạy tại chỗ)</option>
                <option value="openai">API tương thích OpenAI</option>
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input
                className="input"
                value={form.chatModel}
                onChange={(e) => set('chatModel', e.target.value)}
                placeholder="VD: llama3.1:8b hoặc gpt-4o-mini"
              />
            </div>
          </div>
          {form.chatProvider === 'ollama' && (
            <div>
              <label className="label">URL Ollama</label>
              <input
                className="input"
                value={form.ollamaBaseUrl}
                onChange={(e) => set('ollamaBaseUrl', e.target.value)}
                placeholder="VD: http://ollama:11434"
              />
            </div>
          )}
          {form.chatProvider === 'openai' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">URL API (tương thích OpenAI)</label>
                <input
                  className="input"
                  value={form.openaiBaseUrl}
                  onChange={(e) => set('openaiBaseUrl', e.target.value)}
                  placeholder="VD: https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="label">API key</label>
                <input
                  className="input"
                  type="password"
                  value={form.openaiApiKey}
                  onChange={(e) => set('openaiApiKey', e.target.value)}
                  placeholder="Bỏ trống để giữ key đã lưu"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* --- Embedding --- */}
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1.5 text-sm font-semibold text-slate-700">🧮 Embedding (tìm kiếm ngữ nghĩa)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nhà cung cấp</label>
              <select
                className="input"
                value={form.embedProvider}
                onChange={(e) => set('embedProvider', e.target.value as AiProvider)}
              >
                <option value="none">Chưa bật (none)</option>
                <option value="ollama">Ollama (chạy tại chỗ)</option>
                <option value="openai">API tương thích OpenAI</option>
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input
                className="input"
                value={form.embedModel}
                onChange={(e) => set('embedModel', e.target.value)}
                placeholder="VD: nomic-embed-text hoặc text-embedding-3-small"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Embedding dùng chung URL/API key với Trợ lý hội thoại (URL Ollama / URL OpenAI + key phía trên).
          </p>
        </fieldset>

        {/* --- Rerank --- */}
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1.5 text-sm font-semibold text-slate-700">📊 Rerank (xếp lại kết quả)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nhà cung cấp</label>
              <select
                className="input"
                value={form.rerankProvider}
                onChange={(e) => set('rerankProvider', e.target.value as 'none' | 'openai')}
              >
                <option value="none">Chưa bật (none)</option>
                <option value="openai">API tương thích OpenAI</option>
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input
                className="input"
                value={form.rerankModel}
                onChange={(e) => set('rerankModel', e.target.value)}
                placeholder="VD: rerank-2 hoặc gpt-4o-mini"
              />
            </div>
          </div>
          {form.rerankProvider === 'openai' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">URL API rerank</label>
                <input
                  className="input"
                  value={form.rerankBaseUrl}
                  onChange={(e) => set('rerankBaseUrl', e.target.value)}
                  placeholder="VD: https://api.cohere.com/compatibility/v1"
                />
              </div>
              <div>
                <label className="label">API key rerank</label>
                <input
                  className="input"
                  type="password"
                  value={form.rerankApiKey}
                  onChange={(e) => set('rerankApiKey', e.target.value)}
                  placeholder="Bỏ trống để giữ key đã lưu"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* --- OCR --- */}
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1.5 text-sm font-semibold text-slate-700">📷 OCR (nhận dạng văn bản)</legend>
          <div>
            <label className="label">URL dịch vụ OCR</label>
            <input
              className="input"
              value={form.ocrUrl}
              onChange={(e) => set('ocrUrl', e.target.value)}
              placeholder="http://ocr:8000"
            />
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Đang lưu…' : '💾 Lưu cấu hình'}
          </button>
        </div>
      </div>

      {/* ===== Kết quả kiểm tra kết nối ===== */}
      {status && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Trạng thái dịch vụ</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatusRow
              ok={status.ocr.ok}
              label="OCR"
              detail={`${status.ocr.url}${status.ocr.message ? ` — ${status.ocr.message}` : ''}`}
            />
            <StatusRow
              ok={status.chat.provider !== 'none'}
              label="Trợ lý hội thoại"
              detail={
                status.chat.provider === 'none'
                  ? 'Chưa cấu hình'
                  : `${providerLabel(status.chat.provider)} · ${status.chat.model || '(chưa có model)'}`
              }
            />
            <StatusRow
              ok={status.embed.provider !== 'none'}
              label="Embedding"
              detail={
                status.embed.provider === 'none'
                  ? 'Chưa cấu hình'
                  : `${providerLabel(status.embed.provider)} · ${status.embed.model || '(chưa có model)'}`
              }
            />
            <StatusRow
              ok={status.rerank.provider !== 'none'}
              label="Rerank"
              detail={
                status.rerank.provider === 'none'
                  ? 'Chưa cấu hình (tuỳ chọn)'
                  : `${providerLabel(status.rerank.provider)} · ${status.rerank.model || '(chưa có model)'}`
              }
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <StatBox label="Văn bản" value={status.documents} />
            <StatBox label="Đã lập chỉ mục" value={status.indexedDocs} />
            <StatBox label="Đoạn nội dung (chunk)" value={status.chunks} />
          </div>
        </div>
      )}

      {/* ===== Lập chỉ mục lại ===== */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Lập chỉ mục lại</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sau khi đổi embedding/model hoặc thêm nhiều văn bản bằng Excel, hãy lập chỉ mục lại để tìm kiếm ngữ nghĩa
          cập nhật. Quá trình chạy nền và có thể mất vài phút với sổ lớn.
        </p>
        {reindexResult ? (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ {reindexResult}</p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button className="btn-secondary" onClick={() => setReindexConfirm(true)} disabled={reindexing}>
            {reindexing ? '⏳ Đang lập chỉ mục…' : '🔄 Lập chỉ mục lại toàn bộ'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={reindexConfirm}
        title="Lập chỉ mục lại toàn bộ"
        message="Toàn bộ văn bản trong sổ sẽ được đọc lại và chia đoạn để lập chỉ mục tìm kiếm. Tiếp tục?"
        confirmLabel="Lập chỉ mục"
        loading={reindexing}
        onConfirm={() => void reindexAll()}
        onCancel={() => setReindexConfirm(false)}
      />
    </div>
  )
}

function providerLabel(p: string): string {
  if (p === 'ollama') return 'Ollama'
  if (p === 'openai') return 'OpenAI-tương-thích'
  return 'Chưa bật'
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <span className={`mt-0.5 font-bold ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>{ok ? '✓' : '✗'}</span>
      <div className="min-w-0">
        <div className={`font-medium ${ok ? 'text-emerald-900' : 'text-slate-600'}`}>{label}</div>
        <div className="break-words text-xs text-slate-500">{detail}</div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2.5">
      <div className="text-lg font-bold text-primary-800">{value ?? '—'}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
