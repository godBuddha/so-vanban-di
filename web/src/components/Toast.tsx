// ===== Toast thông báo tiếng Việt =====
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast phải dùng bên trong ToastProvider')
  return ctx
}

const KIND_STYLE: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
}

const KIND_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, kind, message }])
    // Tự ẩn sau 4.5 giây
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const value: ToastCtx = {
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error'),
    info: (m) => toast(m, 'info'),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Vùng hiển thị toast — góc phải trên, trên cùng của màn hình */}
      <div className="no-print pointer-events-none fixed right-4 top-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm shadow-lg ${KIND_STYLE[t.kind]}`}
          >
            <span className="mt-0.5 font-bold">{KIND_ICON[t.kind]}</span>
            <span className="flex-1 break-words">{t.message}</span>
            <button
              className="ml-1 shrink-0 opacity-70 hover:opacity-100"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
