// ===== API client — fetch gói gọn, tự gắn Bearer, tự refresh khi 401 =====
import type {
  AuditLogRow,
  DocumentDTO,
  DocumentFilters,
  ImportResult,
  NextNumberInfo,
  PagedResponse,
  UserRow,
} from './types'

export type { DocumentFilters } from './types'
import type { Role } from './docTypes'

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export const TOKEN_KEY = 'svd_access_token'
export const REFRESH_KEY = 'svd_refresh_token'
export const USER_KEY = 'svd_user'

export interface AuthUser {
  id: number
  username: string
  fullName: string
  role: Role
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}
export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}
export function setStoredUser(user: AuthUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

/** Lỗi API có thông báo tiếng Việt từ server */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError)
    return 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.'
  if (err instanceof Error) return err.message
  return 'Đã xảy ra lỗi không xác định.'
}

// --- Chống refresh song song: các request 401 cùng lúc dùng chung 1 lần refresh ---
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { accessToken?: string; refreshToken?: string }
    if (!json.accessToken) return null
    setTokens(json.accessToken, json.refreshToken ?? refreshToken)
    return json.accessToken
  } catch {
    return null
  }
}

/** Chuyển hướng về trang đăng nhập và xoá phiên (tránh vòng lặp: chỉ khi chưa ở /login) */
function forceLogin() {
  clearTokens()
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  formData?: FormData
  retry?: boolean
  signal?: AbortSignal
}

/** Gọi API chung — tự gắn token, tự refresh một lần khi 401 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, retry = true, signal } = opts
  const headers: Record<string, string> = {}
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let payload: BodyInit | undefined
  if (formData) {
    payload = formData // để trình duyệt tự đặt Content-Type multipart
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng.', 0)
  }

  if (res.status === 401 && retry) {
    // Hết hạn access token → thử refresh (một lần duy nhất)
    if (!refreshPromise) refreshPromise = doRefresh()
    const newToken = await refreshPromise
    refreshPromise = null
    if (newToken) {
      return request<T>(path, { ...opts, retry: false })
    }
    forceLogin()
    throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let json: unknown = undefined
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
  }

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'error' in json && typeof (json as { error: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `Lỗi máy chủ (${res.status}). Vui lòng thử lại.`
    throw new ApiError(msg, res.status)
  }

  return json as T
}

export const apiGet = <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal })
export const apiPost = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body })
export const apiPut = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body })
export const apiPatch = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body })
export const apiDelete = <T,>(path: string) => request<T>(path, { method: 'DELETE' })
export const apiUpload = <T,>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData })

// ===== Auth =====

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await apiPost<{ accessToken: string; refreshToken: string; user: AuthUser }>('/api/auth/login', {
    username,
    password,
  })
  setTokens(res.accessToken, res.refreshToken)
  setStoredUser(res.user)
  return res.user
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  try {
    if (refreshToken) await apiPost('/api/auth/logout', { refreshToken })
  } catch {
    // Bỏ qua lỗi đăng xuất phía server — luôn xoá phiên cục bộ
  }
  clearTokens()
}

export async function fetchMe(): Promise<AuthUser> {
  const user = await apiGet<AuthUser>('/api/auth/me')
  setStoredUser(user)
  return user
}

// ===== Documents =====

export function buildDocQuery(f: DocumentFilters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.nam) p.set('nam', String(f.nam))
  if (f.loaiVB) p.set('loaiVB', String(f.loaiVB))
  if (f.noiNhan) p.set('noiNhan', f.noiNhan)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.sort) p.set('sort', f.sort)
  if (f.order) p.set('order', f.order)
  p.set('page', String(f.page ?? 1))
  p.set('pageSize', String(f.pageSize ?? 20))
  return p.toString()
}

export function listDocuments(f: DocumentFilters, signal?: AbortSignal) {
  return apiGet<PagedResponse<DocumentDTO>>(`/api/documents?${buildDocQuery(f)}`, signal)
}

export function getDocument(id: number, signal?: AbortSignal) {
  return apiGet<DocumentDTO>(`/api/documents/${id}`, signal)
}

export function nextNumber(nam: number, signal?: AbortSignal) {
  return apiGet<NextNumberInfo>(`/api/documents/next-number?nam=${nam}`, signal)
}

export interface DocumentInput {
  nam: number
  loaiVB: string
  soKyHieu: string
  ngayBanHanh: string
  nguoiKy: string
  trichYeu: string
  noiNhan: string
  soBan: number
  ghiChu?: string | null
  soVaoSo?: number | null
}

export function createDocument(input: DocumentInput) {
  return apiPost<DocumentDTO>('/api/documents', input)
}

export function updateDocument(id: number, input: Partial<DocumentInput>) {
  return apiPatch<DocumentDTO>(`/api/documents/${id}`, input)
}

export function deleteDocument(id: number) {
  return apiDelete<{ ok?: boolean }>(`/api/documents/${id}`)
}

// ===== Attachments =====

export function uploadAttachments(docId: number, files: File[]) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  return apiUpload<{ attachments?: DocumentDTO['attachments'] }>(`/api/documents/${docId}/attachments`, fd)
}

export function deleteAttachment(id: number) {
  return apiDelete<{ ok?: boolean }>(`/api/attachments/${id}`)
}

/** URL tải file đính kèm (kèm token trong URL không an toàn → dùng link + fetch blob) */
export async function downloadAttachment(id: number, fileName: string) {
  const res = await fetch(`${API_BASE}/api/attachments/${id}/download`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  })
  if (!res.ok) {
    throw new ApiError('Không tải được file đính kèm.', res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ===== Xuất / nhập Excel =====

export function exportExcelUrl(f: DocumentFilters): string {
  return `${API_BASE}/api/export/excel?${buildDocQuery({ ...f, page: 1, pageSize: 100 })}`
}

/** Tải file Excel xuất ra — kèm Bearer token qua fetch rồi lưu về máy */
export async function downloadExcel(f: DocumentFilters) {
  const res = await fetch(exportExcelUrl(f), {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  })
  if (!res.ok) {
    let msg = 'Không xuất được Excel.'
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* bỏ qua */
    }
    throw new ApiError(msg, res.status)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `so-van-ban-di-${f.nam || currentYearOf()}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function currentYearOf(): number {
  return new Date().getFullYear()
}

export function importExcel(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiUpload<ImportResult>('/api/import/excel', fd)
}

// ===== Users (ADMIN) =====

export function listUsers(signal?: AbortSignal) {
  // Backend trả {data:[...]} — bóc ra để trả mảng
  return apiGet<{ data: UserRow[] }>('/api/users', signal).then((r) => r.data)
}

export function createUser(input: { username: string; password: string; fullName: string; role: Role; active: boolean }) {
  return apiPost<UserRow>('/api/users', input)
}

export function updateUser(id: number, input: { fullName?: string; role?: Role; active?: boolean }) {
  return apiPatch<UserRow>(`/api/users/${id}`, input)
}

export function changeUserPassword(id: number, password: string) {
  return apiPatch<{ ok?: boolean }>(`/api/users/${id}/password`, { password })
}

/** Đổi mật khẩu cho chính mình (backend yêu cầu xác minh mật khẩu hiện tại) */
export function changeMyPassword(currentPassword: string, password: string) {
  return apiPatch<{ ok?: boolean }>('/api/auth/password', { currentPassword, password })
}

export function deleteUser(id: number) {
  return apiDelete<{ ok?: boolean }>(`/api/users/${id}`)
}

// ===== Audit logs (ADMIN) =====

export function listAuditLogs(page: number, pageSize: number, q?: string, signal?: AbortSignal) {
  const p = new URLSearchParams()
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  if (q) p.set('q', q)
  return apiGet<PagedResponse<AuditLogRow>>(`/api/audit-logs?${p.toString()}`, signal)
}

// ===== AI: OCR / tìm kiếm ngữ nghĩa / hội thoại / cấu hình =====

/** Nhà cung cấp AI: tắt / Ollama tại chỗ / API tương thích OpenAI */
export type AiProvider = 'none' | 'ollama' | 'openai'

/** Các trường bóc tách được từ ảnh/PDF văn bản (tất cả đều có thể thiếu) */
export interface OcrExtractFields {
  soKyHieu?: string
  ngayBanHanh?: string
  nguoiKy?: string
  trichYeu?: string
  noiNhan?: string
  loaiVb?: string
}

export interface OcrExtractResult {
  text?: string
  fields: OcrExtractFields | null
}

/** Một kết quả tìm kiếm ngữ nghĩa */
export interface AiSearchResult {
  documentId: number
  soVaoSo: number
  soKyHieu: string
  trichYeu: string
  ngayBanHanh: string
  score: number
  snippet: string
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Văn bản được trích làm nguồn tham chiếu khi trả lời */
export interface AiChatSource {
  documentId: number
  soVaoSo: number
  soKyHieu: string
  trichYeu: string
}

/** Cấu hình AI (key bị server che — chỉ gửi lên khi người dùng nhập key mới) */
export interface AiConfig {
  chatProvider: AiProvider
  ollamaBaseUrl: string
  openaiBaseUrl: string
  chatModel: string
  embedProvider: AiProvider
  embedModel: string
  rerankProvider: 'none' | 'openai'
  rerankBaseUrl: string
  rerankModel: string
  ocrUrl: string
  openaiApiKey?: string
  rerankApiKey?: string
}

/** Trạng thái kiểm tra kết nối các dịch vụ AI */
export interface AiStatus {
  ocr: { ok: boolean; url: string; message?: string }
  chat: { provider: AiProvider; model: string }
  embed: { provider: AiProvider; model: string }
  rerank: { provider: 'none' | 'openai'; model: string }
  chunks: number
  documents: number
  indexedDocs: number
}

/** OCR bóc tách trường thông tin từ ảnh/PDF (VANTHU/ADMIN) */
export function aiOcrExtract(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiUpload<OcrExtractResult>('/api/ai/ocr-extract', fd)
}

/** OCR chỉ lấy text (dành cho tiện ích khác, không điền form) */
export function aiOcr(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiUpload<{ text: string }>('/api/ai/ocr', fd)
}

/** Tìm kiếm ngữ nghĩa trong sổ văn bản */
export function aiSearch(q: string, topK?: number, signal?: AbortSignal) {
  const body: Record<string, unknown> = { q }
  if (topK) body.topK = topK
  return apiPost<{ results: AiSearchResult[] }>('/api/ai/search', body).then((r) => r.results ?? [])
}

export function adminGetAiConfig() {
  // server bọc trong {data} — bóc ra (key bị mask "••••")
  return apiGet<{ data: AiConfig }>('/api/admin/ai/config').then((r) => r.data)
}

/** Lưu cấu hình AI — các trường khoá chỉ gửi lên khi người dùng nhập giá trị mới */
export function adminPutAiConfig(input: Partial<AiConfig> & { openaiApiKey?: string; rerankApiKey?: string }) {
  return apiPut<{ data: AiConfig }>('/api/admin/ai/config', input).then((r) => r.data)
}

export function adminAiStatus() {
  return apiGet<AiStatus>('/api/admin/ai/status')
}

export function adminAiReindex(documentId?: number) {
  return apiPost<{ indexed: number; chunks: number }>('/api/admin/ai/reindex', documentId ? { documentId } : {})
}

/**
 * Chat AI theo luồng SSE qua POST /api/ai/chat.
 * KHÔNG dùng EventSource (chỉ hỗ trợ GET) — đọc fetch stream bằng ReadableStream + TextDecoder,
 * buffer tách theo "\n\n", mỗi sự kiện là dòng "data: {json}".
 * onDelta nhận từng đoạn text, onSources nhận nguồn tham chiếu (trước delta),
 * onDone khi kết thúc, onError khi gặp {"type":"error"} hoặc lỗi HTTP.
 */
export async function aiChatStream(
  messages: AiChatMessage[],
  onDelta: (text: string) => void,
  onSources: (sources: AiChatSource[]) => void,
  onDone: () => void,
  onError: (message: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const post = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
      signal,
    })
  }

  const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

  let res: Response
  try {
    res = await post(getAccessToken())
  } catch (e) {
    if (isAbort(e)) return
    onError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng.')
    return
  }

  // 401 → thử refresh token một lần rồi gọi lại (giống request())
  if (res.status === 401) {
    const fresh = await doRefresh()
    if (fresh) {
      try {
        res = await post(fresh)
      } catch (e) {
        if (isAbort(e)) return
        onError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng.')
        return
      }
    }
  }

  if (!res.ok) {
    let msg = `Lỗi máy chủ (${res.status}). Vui lòng thử lại.`
    try {
      const j = (await res.json()) as { error?: unknown; message?: unknown }
      if (typeof j.error === 'string') msg = j.error
      else if (typeof j.message === 'string') msg = j.message
    } catch {
      /* giữ thông báo mặc định */
    }
    if (res.status === 401) forceLogin()
    onError(msg)
    return
  }
  if (!res.body) {
    onError('Không nhận được dữ liệu phản hồi từ máy chủ.')
    return
  }

  let finished = false

  function handleEvent(raw: string) {
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let ev: { type?: string; text?: unknown; sources?: unknown; message?: unknown }
      try {
        ev = JSON.parse(payload) as typeof ev
      } catch {
        continue
      }
      switch (ev.type) {
        case 'sources':
          if (Array.isArray(ev.sources)) onSources(ev.sources as AiChatSource[])
          break
        case 'delta':
          if (typeof ev.text === 'string' && ev.text) onDelta(ev.text)
          break
        case 'done':
          finished = true
          onDone()
          break
        case 'error':
          finished = true
          onError(typeof ev.message === 'string' && ev.message ? ev.message : 'Đã xảy ra lỗi khi xử lý AI.')
          break
        default:
          break
      }
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        handleEvent(raw)
        sep = buffer.indexOf('\n\n')
      }
    }
    // Sự kiện cuối có thể không kết thúc bằng "\n\n"
    if (buffer.trim()) handleEvent(buffer)
  } catch (e) {
    if (isAbort(e)) return // người dùng bấm dừng — không báo lỗi
    onError('Mất kết nối khi nhận phản hồi từ AI.')
    return
  }
  if (!finished) onDone()
}
