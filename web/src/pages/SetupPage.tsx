// ===== Trang cài đặt ban đầu — tự đăng ký tài khoản quản trị khi hệ thống còn trống =====
// Luồng self-host (kiểu Gitea/WordPress): lần đầu truy cập web → tạo tài khoản admin ngay trên web.
// Sau khi tạo xong, hệ thống đã có người dùng nên trang này tự đóng (backend trả 403).
// Không có mật khẩu admin mặc định nào nằm trong mã nguồn.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { errorMessage, getSetupStatus, setupAdmin, type AuthUser } from '@/lib/api'
import { useToast } from '@/components/Toast'

const UNIT_NAME = (import.meta.env.VITE_UNIT_NAME as string | undefined) || 'Sổ Văn Bản Đi'
const UNIT_SUBNAME = (import.meta.env.VITE_UNIT_SUBNAME as string | undefined) || ''

type Status = 'checking' | 'needed' | 'done'

export function SetupPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState<Status>('checking')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Hỏi server: hệ thống còn trống không? Trống → hiện form; đã cài → về trang đăng nhập.
  useEffect(() => {
    getSetupStatus()
      .then((r) => setStatus(r.needed ? 'needed' : 'done'))
      .catch(() => {
        // Server lỗi (CSDL chưa sẵn sàng...) — giữ "checking" và báo lỗi mạng để người dùng thử lại
        setStatus('checking')
      })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!fullName.trim()) {
      setErr('Vui lòng nhập họ tên quản trị.')
      return
    }
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username.trim())) {
      setErr('Tên đăng nhập tối thiểu 3 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới.')
      return
    }
    if (password.length < 8) {
      setErr('Mật khẩu tối thiểu 8 ký tự.')
      return
    }
    if (password !== confirm) {
      setErr('Xác nhận mật khẩu không khớp.')
      return
    }
    setBusy(true)
    try {
      const user: AuthUser = (await setupAdmin({ username: username.trim(), password, fullName: fullName.trim() })).user
      toast.success(`Đã tạo tài khoản quản trị ${user.username} — vui lòng đăng nhập.`)
      navigate('/login', { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (status === 'done') return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-primary-800 to-primary-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-4xl">
            🛠️
          </div>
          <h1 className="text-2xl font-bold tracking-wide">{UNIT_NAME}</h1>
          {UNIT_SUBNAME ? <p className="mt-1 text-sm text-primary-200">{UNIT_SUBNAME}</p> : null}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          {status === 'checking' ? (
            <div className="text-center text-sm text-slate-500">
              Đang kiểm tra trạng thái hệ thống…
              <p className="mt-2 text-xs text-slate-400">
                Không kết nối được máy chủ? Kiểm tra CSDL đã chạy và tải lại trang.
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-center text-lg font-semibold text-slate-800">Cài đặt ban đầu</h2>
              <p className="mb-4 text-center text-sm text-slate-500">
                Hệ thống chưa có người dùng nào. Hãy tạo tài khoản quản trị để bắt đầu —
                tài khoản này có toàn quyền.
              </p>

              <form className="space-y-3.5" onSubmit={(e) => void submit(e)}>
                <div>
                  <label className="label">Họ và tên quản trị</label>
                  <input
                    className="input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                    placeholder="VD: Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className="label">Tên đăng nhập</label>
                  <input
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="VD: admin"
                  />
                </div>
                <div>
                  <label className="label">Mật khẩu (tối thiểu 8 ký tự)</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
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
                <div>
                  <label className="label">Xác nhận mật khẩu</label>
                  <input
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>

                {err ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p> : null}

                <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
                  {busy ? 'Đang tạo…' : 'Tạo tài khoản quản trị'}
                </button>
              </form>

              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                Sau khi hệ thống đã có tài khoản, trang này tự đóng và không thể tạo thêm quản trị từ ngoài —
                người dùng mới do quản trị viên thêm trong mục <b>Quản trị → Người dùng</b>.
              </p>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-primary-200">Phần mềm quản lý sổ văn bản đi — văn thư cơ quan</p>
      </div>
    </div>
  )
}
