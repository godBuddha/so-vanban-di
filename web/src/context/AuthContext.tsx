// ===== Ngữ cảnh xác thực — giữ thông tin user hiện tại =====
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, getStoredUser, getAccessToken, login as apiLogin, logout as apiLogout, type AuthUser } from '@/lib/api'

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth phải dùng bên trong AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null)
      return
    }
    setLoading(true)
    try {
      const u = await fetchMe()
      setUser(u)
    } catch {
      // Lỗi đã được xử lý trong api client (refresh/redirect); giữ nguyên user cũ nếu có
    } finally {
      setLoading(false)
    }
  }, [])

  // Đăng nhập: gọi API và cập nhật state để RequireAuth thấy được user ngay
  const login = useCallback(async (username: string, password: string) => {
    const u = await apiLogin(username, password)
    setUser(u)
    return u
  }, [])

  const signOut = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  // Lấy thông tin user mới nhất khi mở app (nếu đã có token)
  useEffect(() => {
    if (getAccessToken() && !user) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Ctx.Provider value={{ user, loading, login, refresh, signOut }}>{children}</Ctx.Provider>
}
