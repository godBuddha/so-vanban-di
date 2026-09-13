// ===== Trợ lý AI: Hỏi đáp (chat streaming) + Tìm kiếm ngữ nghĩa =====
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import { EmptyState, Spinner } from '@/components/ui'
import { DocumentDetail } from '@/components/DocumentDetail'
import { formatDate } from '@/lib/format'
import {
  aiChatStream,
  aiSearch,
  errorMessage,
  getDocument,
  type AiChatMessage,
  type AiChatSource,
  type AiSearchResult,
} from '@/lib/api'
import type { DocumentDTO } from '@/lib/types'

type Tab = 'chat' | 'search'

interface ChatMsg extends AiChatMessage {
  /** Nguồn tham chiếu đi kèm câu trả lời của trợ lý */
  sources?: AiChatSource[]
  /** Lỗi gặp phải trong lượt trả lời này */
  error?: string
}

const SUGGESTIONS = [
  'Tìm công văn mời họp tháng 3',
  'Văn bản nào về công tác phòng chống dịch?',
  'Thời hạn báo cáo theo quy định của Sở Nội vụ',
]

export function TroLyAiPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  const [tab, setTab] = useState<Tab>('chat')

  // Trạng thái "Chưa cấu hình AI" (lỗi 400 từ API)
  const [notConfigured, setNotConfigured] = useState<string | null>(null)

  // ===== Modal chi tiết văn bản (dùng chung cho cả 2 tab) =====
  const [detailDoc, setDetailDoc] = useState<DocumentDTO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openDetail(documentId: number) {
    setDetailLoading(true)
    try {
      const doc = await getDocument(documentId)
      setDetailDoc(doc)
    } catch (e) {
      const msg = errorMessage(e)
      if (msg.includes('Chưa cấu hình AI')) setNotConfigured(msg)
      else toast.error(msg)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">🤖 Trợ lý AI</h1>
      </div>

      {notConfigured && <NotConfiguredBox message={notConfigured} isAdmin={isAdmin} />}

      {/* ===== Tabs ===== */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
          💬 Hỏi đáp
        </TabButton>
        <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
          🔎 Tìm kiếm ngữ nghĩa
        </TabButton>
      </div>

      {tab === 'chat' ? (
        <ChatTab
          onNotConfigured={(m) => setNotConfigured(m)}
          onClearWarning={() => setNotConfigured(null)}
          onOpenDetail={openDetail}
        />
      ) : (
        <SearchTab
          onNotConfigured={(m) => setNotConfigured(m)}
          onClearWarning={() => setNotConfigured(null)}
          onOpenDetail={openDetail}
        />
      )}

      {detailLoading && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-5 py-4 shadow-xl">
            <Spinner label="Đang mở chi tiết văn bản…" />
          </div>
        </div>
      )}

      {detailDoc && (
        <DocumentDetail
          doc={detailDoc}
          onClose={() => setDetailDoc(null)}
          onChanged={() => {
            /* chi tiết tự quản file đính kèm, không cần tải lại danh sách */
          }}
          onEdit={() => {
            setDetailDoc(null)
            // Chuyển về sổ văn bản để sửa tại đó (trang AI không có form nhập)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}

// ===== Khối cảnh báo "Chưa cấu hình AI" =====
function NotConfiguredBox({ message, isAdmin }: { message: string; isAdmin: boolean }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{message || 'Chưa cấu hình AI.'}</p>
          {isAdmin ? (
            <p className="mt-1">
              <Link to="/admin/ai" className="font-medium text-amber-900 underline hover:no-underline">
                Đến trang Cấu hình AI
              </Link>{' '}
              để thiết lập trợ lý hội thoại và lập chỉ mục cho sổ văn bản.
            </p>
          ) : (
            <p className="mt-1">Vui lòng liên hệ quản trị viên để cấu hình AI cho hệ thống.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Nút tab =====
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none ${
        active ? 'bg-primary-800 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// =====================================================================
// Tab Hỏi đáp — chat streaming kiểu Cherry Studio thu nhỏ
// =====================================================================
function ChatTab({
  onNotConfigured,
  onClearWarning,
  onOpenDetail,
}: {
  onNotConfigured: (message: string) => void
  onClearWarning: () => void
  onOpenDetail: (documentId: number) => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tự cuộn xuống đáy khi có tin nhắn / token mới
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || streaming) return
      onClearWarning()

      const history: ChatMsg[] = [...messages, { role: 'user', content: question }]
      const apiMessages: AiChatMessage[] = history.map((m) => ({ role: m.role, content: m.content }))
      setMessages([...history, { role: 'assistant', content: '' }])
      setInput('')
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const patchLast = (patch: (m: ChatMsg) => ChatMsg) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const next = [...prev]
          next[next.length - 1] = patch(next[next.length - 1])
          return next
        })
      }

      try {
        await aiChatStream(
          apiMessages,
          (delta) => patchLast((m) => ({ ...m, content: m.content + delta })),
          (sources) => patchLast((m) => ({ ...m, sources })),
          () => {
            setStreaming(false)
            abortRef.current = null
          },
          (message) => {
            if (message.includes('Chưa cấu hình AI')) onNotConfigured(message)
            patchLast((m) => ({ ...m, error: message }))
            setStreaming(false)
            abortRef.current = null
          },
          controller.signal,
        )
      } catch (e) {
        patchLast((m) => ({ ...m, error: errorMessage(e) }))
        setStreaming(false)
        abortRef.current = null
      } finally {
        // Luôn dọn trạng thái streaming khi luồng kết thúc (dù server không gửi "done")
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming, onClearWarning, onNotConfigured],
  )

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  function clear() {
    if (streaming) stop()
    setMessages([])
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Thanh công cụ */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-600">Hỏi đáp về văn bản trong sổ</span>
        {messages.length > 0 && (
          <button className="text-xs text-slate-500 hover:text-red-600" onClick={clear} disabled={streaming}>
            🗑 Xoá hội thoại
          </button>
        )}
      </div>

      {/* Vùng tin nhắn */}
      <div ref={scrollRef} className="min-h-[45vh] flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-4 lg:h-[52vh]">
        {messages.length === 0 ? (
          <EmptyState
            icon="🤖"
            title="Trợ lý AI sẵn sàng"
            hint="Hỏi về văn bản trong sổ, VD: “tìm công văn mời họp tháng 3”. Trợ lý sẽ trả lời kèm nguồn tham chiếu."
          />
        ) : (
          messages.map((m, i) => <MessageBubble key={i} msg={m} onOpenDetail={onOpenDetail} />)
        )}
      </div>

      {/* Ô nhập */}
      <div className="border-t border-slate-100 px-3 py-3">
        {messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
                onClick={() => void send(s)}
                disabled={streaming}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-11 flex-1 resize-none"
            rows={2}
            placeholder="Nhập câu hỏi… (Enter để gửi, Shift+Enter để xuống dòng)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            disabled={streaming}
          />
          {streaming ? (
            <button className="btn-secondary shrink-0" onClick={stop} title="Dừng tạo phản hồi">
              ⏹ Dừng
            </button>
          ) : (
            <button className="btn-primary shrink-0" onClick={() => void send(input)} disabled={!input.trim()}>
              ➤ Gửi
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Câu trả lời do AI tạo ra dựa trên dữ liệu trong sổ — vui lòng đối chiếu văn bản gốc trước khi sử dụng.
        </p>
      </div>
    </div>
  )
}

/** Bong bóng tin nhắn: user bên phải, trợ lý bên trái + nguồn tham chiếu */
function MessageBubble({ msg, onOpenDetail }: { msg: ChatMsg; onOpenDetail: (id: number) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-800 px-3.5 py-2.5 text-sm text-white shadow-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  const empty = !msg.content && !msg.error
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs">🤖</span>
          <span className="text-xs font-medium text-slate-500">Trợ lý AI</span>
        </div>
        {!empty && (
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
            {msg.content}
            {msg.error && (
              <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-xs text-red-600">⚠️ {msg.error}</p>
            )}
          </div>
        )}
        {empty && !msg.error && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            Đang soạn câu trả lời…
          </div>
        )}
        {msg.sources && msg.sources.length > 0 && (
          <div className="space-y-1.5">
            <span className="badge bg-amber-100 text-amber-800">📚 Nguồn tham chiếu ({msg.sources.length})</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {msg.sources.map((s) => (
                <button
                  key={s.documentId}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs shadow-sm transition hover:border-primary-300 hover:bg-primary-50"
                  onClick={() => onOpenDetail(s.documentId)}
                  title="Bấm để xem chi tiết văn bản"
                >
                  <span className="font-semibold text-primary-900">№ {s.soVaoSo}</span>{' '}
                  <span className="text-slate-500">· {s.soKyHieu}</span>
                  <div className="mt-0.5 line-clamp-2 text-slate-700">{s.trichYeu}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// Tab Tìm kiếm ngữ nghĩa
// =====================================================================
function SearchTab({
  onNotConfigured,
  onClearWarning,
  onOpenDetail,
}: {
  onNotConfigured: (message: string) => void
  onClearWarning: () => void
  onOpenDetail: (documentId: number) => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AiSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function run() {
    const query = q.trim()
    if (!query) {
      toast.info('Nhập nội dung cần tìm (ý nghĩa, không cần đúng từng từ).')
      return
    }
    onClearWarning()
    setLoading(true)
    try {
      const res = await aiSearch(query, 10)
      setResults(res)
      setSearched(true)
    } catch (e) {
      const msg = errorMessage(e)
      if (msg.includes('Chưa cấu hình AI')) {
        onNotConfigured(msg)
      } else {
        toast.error(msg)
      }
      setResults([])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  const terms = q.trim().split(/\s+/).filter((t) => t.length > 0)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="label">Tìm theo ý nghĩa trong toàn bộ sổ văn bản</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="VD: quy định về nhiệm vụ phòng chống dịch…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run()
            }}
          />
          <button className="btn-primary shrink-0" onClick={() => void run()} disabled={loading}>
            {loading ? 'Đang tìm…' : '🔎 Tìm kiếm'}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">
          Tìm kiếm ngữ nghĩa giúp tìm được cả văn bản không chứa đúng từ khoá (điểm % càng cao càng khớp).
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <Spinner label="Đang tìm kiếm ngữ nghĩa…" />
        ) : !searched ? (
          <EmptyState
            icon="🔎"
            title="Tìm kiếm ngữ nghĩa"
            hint="Nhập ý nghĩa cần tìm rồi bấm “Tìm kiếm” — kết quả trả về các văn bản liên quan nhất kèm đoạn nội dung trích dẫn."
          />
        ) : results.length === 0 ? (
          <EmptyState icon="🔍" title="Không tìm thấy kết quả phù hợp" hint="Hãy thử diễn đạt lại bằng ý khác." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-ledger">
              <thead>
                <tr>
                  <th className="w-16 text-center">Số vào sổ</th>
                  <th className="w-40">Số &amp; ký hiệu</th>
                  <th className="w-24">Ngày ban hành</th>
                  <th>Trích yếu</th>
                  <th className="w-20 text-center">Điểm khớp</th>
                  <th className="w-80">Nội dung liên quan</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.documentId}
                    className="cursor-pointer hover:bg-primary-50/60"
                    onClick={() => onOpenDetail(r.documentId)}
                    title="Bấm để xem chi tiết văn bản"
                  >
                    <td className="text-center font-semibold text-primary-900">{r.soVaoSo}</td>
                    <td className="whitespace-nowrap">{r.soKyHieu}</td>
                    <td className="whitespace-nowrap">{formatDate(r.ngayBanHanh)}</td>
                    <td className="min-w-64">{r.trichYeu}</td>
                    <td className="text-center">
                      <span className="badge bg-emerald-100 text-emerald-800">
                        {Math.round((r.score ?? 0) * 100)}%
                      </span>
                    </td>
                    <td>
                      <div className="line-clamp-3 text-slate-600">
                        <Highlight text={r.snippet ?? ''} terms={terms} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Bôi vàng từ khoá tìm kiếm trong đoạn trích dẫn */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const cleaned = terms.filter((t) => t.length > 0)
  if (cleaned.length === 0 || !text) return <>{text}</>
  const escaped = cleaned
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
  let re: RegExp
  try {
    re = new RegExp(`(${escaped.join('|')})`, 'gi')
  } catch {
    return <>{text}</>
  }
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-yellow-200 px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
