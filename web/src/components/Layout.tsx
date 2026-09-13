// ===== Layout chính: sidebar trái (desktop) / drawer (mobile) + header =====
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { roleBadge, roleLabel } from '@/lib/docTypes'
import { changeMyPassword, errorMessage } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/ui'

const UNIT_NAME = (import.meta.env.VITE_UNIT_NAME as string | undefined) || 'Sổ Văn Bản Đi'

interface MenuItem {
  to: string
  icon: string
  label: string
  roles?: string[]
}

const MENU: MenuItem[] = [
  { to: '/', icon: '📒', label: 'Sổ văn bản đi' },
  { to: '/tracuu', icon: '🔍', label: 'Tra cứu', roles: ['TRACUU'] },
  { to: '/admin/users', icon: '⚙️', label: 'Quản trị', roles: ['ADMIN'] },
  { to: '/admin/audit', icon: '📜', label: 'Nhật ký', roles: ['ADMIN'] },
]

export function Layout({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)

  const visibleMenu = MENU.filter((m) => !m.roles || (user && m.roles.includes(user.role)))

  async function handleLogout() {
    try {
      await signOut()
      navigate('/login', { replace: true })
      toast.success('Đã đăng xuất.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex min-h-full">
      {/* ===== Sidebar (desktop) ===== */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-primary-900/20 bg-primary-800 text-white md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-xl">📒</span>
          <div className="leading-tight">
            <div className="text-sm font-bold">Sổ Văn Bản Đi</div>
            <div className="text-[11px] text-primary-200">Quản lý văn thư cơ quan</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-2">
          {visibleMenu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-white text-primary-800 font-semibold' : 'text-primary-100 hover:bg-white/10'
                }`
              }
            >
              <span className="text-base">{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-primary-200">
          {UNIT_NAME}
        </div>
      </aside>

      {/* ===== Drawer (mobile) ===== */}
      {drawerOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-primary-800 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📒</span>
                <span className="font-bold">Sổ Văn Bản Đi</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1 text-white/70" aria-label="Đóng menu">
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-2 py-2">
              {visibleMenu.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  end={m.to === '/'}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                      isActive ? 'bg-white text-primary-800 font-semibold' : 'text-primary-100 hover:bg-white/10'
                    }`
                  }
                >
                  <span>{m.icon}</span>
                  {m.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* ===== Vùng nội dung ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:px-5">
          <button
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Mở menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800 md:text-base">{UNIT_NAME}</div>
          </div>

          {/* Khu vực người dùng */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2.5 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-800 text-xs font-bold text-white">
                  {(user.fullName || user.username).charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-40 truncate text-sm text-slate-700 sm:block">{user.fullName}</span>
                <span className="text-xs text-slate-400">▾</span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
                    <div className="border-b border-slate-100 px-3.5 py-2">
                      <div className="truncate text-sm font-medium text-slate-800">{user.fullName}</div>
                      <div className="text-xs text-slate-500">@{user.username}</div>
                      <span className={`badge mt-1 ${roleBadge(user.role)}`}>{roleLabel(user.role)}</span>
                    </div>
                    <button
                      className="block w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false)
                        setPwdOpen(true)
                      }}
                    >
                      🔑 Đổi mật khẩu
                    </button>
                    <button
                      className="block w-full px-3.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setMenuOpen(false)
                        void handleLogout()
                      }}
                    >
                      ↩ Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </header>

        <main className="flex-1 px-3 py-4 md:px-5 md:py-5">{children ?? <Outlet />}</main>
      </div>

      {pwdOpen && user && (
        <ChangePasswordModal
          onClose={() => setPwdOpen(false)}
        />
      )}
    </div>
  )
}

/** Hộp thoại đổi mật khẩu cho chính mình */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setErr('')
    if (!current) {
      setErr('Vui lòng nhập mật khẩu hiện tại.')
      return
    }
    if (pwd.length < 8) {
      setErr('Mật khẩu tối thiểu 8 ký tự.')
      return
    }
    if (pwd !== confirm) {
      setErr('Xác nhận mật khẩu không khớp.')
      return
    }
    setSaving(true)
    try {
      await changeMyPassword(current, pwd)
      toast.success('Đổi mật khẩu thành công.')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Đổi mật khẩu">
      <div className="space-y-3">
        <div>
          <label className="label">Mật khẩu hiện tại</label>
          <input
            className="input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label">Mật khẩu mới</label>
          <input
            className="input"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Tối thiểu 8 ký tự"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label">Xác nhận mật khẩu</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu mật khẩu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
