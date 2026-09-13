// ===== Trang đăng nhập =====
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'

const UNIT_NAME = (import.meta.env.VITE_UNIT_NAME as string | undefined) || 'Sổ Văn Bản Đi'
const UNIT_SUBNAME = (import.meta.env.VITE_UNIT_SUBNAME as string | undefined) || ''
const IS_DEV = import.meta.env.DEV

export function LoginPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!username.trim()) {
      setErr('Vui lòng nhập tên đăng nhập.')
      return
    }
    if (!password) {
      setErr('Vui lòng nhập mật khẩu.')
      return
    }
    setBusy(true)
    try {
      const user = await login(username.trim(), password)
      toast.success(`Xin chào ${user.fullName}!`)
      navigate('/', { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-primary-800 to-primary-900 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo sách / nhà nước */}
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-4xl">
            📒
          </div>
          <h1 className="text-2xl font-bold tracking-wide">{UNIT_NAME}</h1>
          {UNIT_SUBNAME ? <p className="mt-1 text-sm text-primary-200">{UNIT_SUBNAME}</p> : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-4 text-center text-lg font-semibold text-slate-800">Đăng nhập hệ thống</h2>

          <form className="space-y-3.5" onSubmit={(e) => void submit(e)}>
            <div>
              <label className="label">Tên đăng nhập</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="VD: vanthu"
              />
            </div>
            <div>
              <label className="label">Mật khẩu</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p> : null}

            <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          {IS_DEV && (
            <div className="mt-5 rounded-lg bg-primary-50 px-3.5 py-3 text-xs text-primary-900">
              <p className="mb-1 font-semibold">Tài khoản mẫu (môi trường phát triển)</p>
              <ul className="space-y-0.5 text-primary-800">
                <li>
                  Quản trị viên: <code className="font-mono">admin / Admin@123</code>
                </li>
                <li>
                  Văn thư: <code className="font-mono">vanthu / VanThu@123</code>
                </li>
                <li>
                  Tra cứu: <code className="font-mono">tracuu / TraCuu@123</code>
                </li>
              </ul>
              <p className="mt-1.5 text-primary-600">
                Lưu ý: cần backend đang chạy tại cùng tên miền (/api). Nếu chưa có backend, đăng nhập sẽ báo lỗi mạng.
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-primary-200">
          Phần mềm quản lý sổ văn bản đi — văn thư cơ quan
        </p>
      </div>
    </div>
  )
}
