// ===== Định tuyến ứng dụng =====
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/LoginPage'
import { SetupPage } from '@/pages/SetupPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PrintPage } from '@/pages/PrintPage'
import { ImportExcelPage } from '@/pages/ImportExcelPage'
import { AdminPage } from '@/pages/AdminPage'
import { AuditPage } from '@/pages/AuditPage'
import { TroLyAiPage } from '@/pages/TroLyAi'
import { AdminAiPage } from '@/pages/AdminAi'
import { getSetupStatus } from '@/lib/api'
import type { Role } from '@/lib/docTypes'

/** Bắt buộc đăng nhập */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/** Giới hạn theo vai trò */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

/** Cổng cài đặt ban đầu: hệ thống còn trống → dẫn về trang /setup MỘT LẦN duy nhất.
 * Sau khi người dùng đã tới /setup (hoặc cài xong), không điều hướng lại nữa —
 * nếu không sẽ bị vòng lặp /setup ↔ /login ngay sau khi tạo xong tài khoản.
 * Server không trả lời được (CSDL đang khởi động…) → vào app như bình thường, không treo. */
function SetupGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'pass' | 'gotoSetup'>('loading')
  const location = useLocation()
  const onSetupPage = location.pathname === '/setup'

  useEffect(() => {
    let alive = true
    getSetupStatus()
      .then((r) => alive && setPhase(r.needed && !window.location.pathname.startsWith('/setup') ? 'gotoSetup' : 'pass'))
      .catch(() => alive && setPhase('pass'))
    return () => {
      alive = false
    }
  }, [])

  // Đã đứng ở trang /setup → dừng điều hướng, mọi đường tiếp theo được đi tự do
  useEffect(() => {
    if (phase === 'gotoSetup' && onSetupPage) setPhase('pass')
  }, [phase, onSetupPage])

  if (onSetupPage) return <>{children}</>
  if (phase === 'loading') return <div className="flex min-h-screen items-center justify-center text-slate-400">Đang tải…</div>
  if (phase === 'gotoSetup') return <Navigate to="/setup" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RegisterPage />} />
        <Route path="/tracuu" element={<RegisterPage readonly />} />
        <Route path="/in-so" element={<PrintPage />} />
        <Route path="/ai-tro-ly" element={<TroLyAiPage />} />
        <Route
          path="/nhap-excel"
          element={
            <RequireRole roles={['VANTHU', 'ADMIN']}>
              <ImportExcelPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireRole roles={['ADMIN']}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/ai"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminAiPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <SetupGate>
      <AppRoutes />
    </SetupGate>
  )
}
