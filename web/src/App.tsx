// ===== Định tuyến ứng dụng =====
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PrintPage } from '@/pages/PrintPage'
import { ImportExcelPage } from '@/pages/ImportExcelPage'
import { AdminPage } from '@/pages/AdminPage'
import { AuditPage } from '@/pages/AuditPage'
import { TroLyAiPage } from '@/pages/TroLyAi'
import { AdminAiPage } from '@/pages/AdminAi'
import type { Role } from '@/lib/docTypes'
import type { ReactNode } from 'react'

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
