// ===== Trang Quản trị: tab Người dùng + tab Nhật ký =====
import { useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/Toast'
import { ConfirmDialog, EmptyState, Modal, Spinner, TableSkeleton } from '@/components/ui'
import { ALL_ROLES, roleBadge, roleLabel } from '@/lib/docTypes'
import {
  changeUserPassword,
  createUser,
  deleteUser,
  errorMessage,
  listUsers,
  updateUser,
} from '@/lib/api'
import type { UserRow } from '@/lib/types'
import type { Role } from '@/lib/docTypes'

export function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-slate-800 md:text-xl">⚙️ Quản trị hệ thống</h1>

      {/* Tab điều hướng */}
      <div className="flex gap-1.5 border-b border-slate-200">
        <TabLink to="/admin/users" label="👥 Người dùng" />
        <TabLink to="/admin/audit" label="📜 Nhật ký" />
      </div>

      <UsersTab />
    </div>
  )
}

export { TabLink }

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
          isActive ? 'border-primary-700 text-primary-800' : 'border-transparent text-slate-500 hover:text-slate-700'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

/** Danh sách + quản lý người dùng */
function UsersTab() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [pwdFor, setPwdFor] = useState<UserRow | null>(null)
  const [deactivating, setDeactivating] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listUsers())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleToggleActive(u: UserRow) {
    setBusy(true)
    try {
      await updateUser(u.id, { active: !u.active })
      toast.success(u.active ? `Đã vô hiệu hoá tài khoản "${u.username}".` : `Đã kích hoạt lại "${u.username}".`)
      setDeactivating(null)
      void load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteUser(deleting.id)
      toast.success(`Đã xoá tài khoản "${deleting.username}".`)
      setDeleting(null)
      void load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">
          👥 Người dùng {loading ? '' : `(${rows.length})`}
        </h2>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          + Thêm người dùng
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : error ? (
        <div className="p-8 text-center">
          <div className="mb-2 text-3xl">🔌</div>
          <p className="text-sm text-slate-500">{error}</p>
          <button className="btn-primary mt-3" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="👥" title="Chưa có người dùng nào" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-ledger">
            <thead>
              <tr>
                <th className="w-32">Tên đăng nhập</th>
                <th className="w-56">Họ tên</th>
                <th className="w-36">Vai trò</th>
                <th className="w-28 text-center">Trạng thái</th>
                <th className="w-72 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">@{u.username}</td>
                  <td>
                    {u.fullName}
                    {me?.id === u.id ? <span className="ml-1 text-xs text-slate-400">(bạn)</span> : null}
                  </td>
                  <td>
                    <span className={`badge ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="text-center">
                    <span className={`badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {u.active ? 'Đang hoạt động' : 'Bị vô hiệu'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      <button
                        className="rounded px-1.5 py-0.5 text-primary-700 hover:bg-primary-50"
                        onClick={() => {
                          setEditing(u)
                          setFormOpen(true)
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-100"
                        onClick={() => setPwdFor(u)}
                      >
                        Đổi MK
                      </button>
                      {me?.id !== u.id && (
                        <>
                          <button
                            className="rounded px-1.5 py-0.5 text-amber-700 hover:bg-amber-50"
                            onClick={() => setDeactivating(u)}
                          >
                            {u.active ? 'Vô hiệu' : 'Kích hoạt'}
                          </button>
                          <button
                            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(u)}
                          >
                            Xoá
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal thêm / sửa */}
      {formOpen && (
        <UserFormModal
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            void load()
          }}
        />
      )}

      {/* Modal đổi / cấp lại mật khẩu */}
      {pwdFor && (
        <ResetPasswordModal
          target={pwdFor}
          onClose={() => setPwdFor(null)}
        />
      )}

      {/* Xác nhận vô hiệu / kích hoạt */}
      <ConfirmDialog
        open={!!deactivating}
        title={deactivating?.active ? 'Vô hiệu hoá tài khoản' : 'Kích hoạt lại tài khoản'}
        message={
          deactivating?.active
            ? `Tài khoản "${deactivating?.username}" sẽ không thể đăng nhập. Bạn chắc chắn chứ?`
            : `Kích hoạt lại tài khoản "${deactivating?.username}"?`
        }
        confirmLabel={deactivating?.active ? 'Vô hiệu hoá' : 'Kích hoạt'}
        danger={!!deactivating?.active}
        loading={busy}
        onConfirm={() => void handleToggleActive(deactivating!)}
        onCancel={() => setDeactivating(null)}
      />

      {/* Xác nhận xoá */}
      <ConfirmDialog
        open={!!deleting}
        title="Xoá tài khoản"
        message={`Xoá tài khoản "${deleting?.username}"? Nếu người này đã tạo văn bản, hệ thống sẽ báo lỗi và bạn nên vô hiệu hoá thay vì xoá.`}
        confirmLabel="Xoá"
        danger
        loading={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

/** Form thêm / sửa người dùng */
function UserFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: UserRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [username, setUsername] = useState(editing?.username ?? '')
  const [fullName, setFullName] = useState(editing?.fullName ?? '')
  const [role, setRole] = useState<Role>(editing?.role ?? 'TRACUU')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(editing?.active ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submit() {
    const e: Record<string, string> = {}
    if (!editing && !username.trim()) e.username = 'Nhập tên đăng nhập.'
    if (!fullName.trim()) e.fullName = 'Nhập họ tên.'
    if (!editing && password.length < 8) e.password = 'Mật khẩu tối thiểu 8 ký tự.'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      if (editing) {
        await updateUser(editing.id, { fullName: fullName.trim(), role, active })
        toast.success(`Đã cập nhật "${editing.username}".`)
      } else {
        await createUser({ username: username.trim(), password, fullName: fullName.trim(), role, active })
        toast.success(`Đã tạo tài khoản "${username.trim()}".`)
      }
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? `Sửa người dùng — @${editing.username}` : 'Thêm người dùng'}>
      <div className="space-y-3">
        {!editing && (
          <div>
            <label className="label">Tên đăng nhập *</label>
            <input
              className={`input ${errors.username ? 'border-red-400' : ''}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="VD: vanthu2"
              autoComplete="off"
            />
            {errors.username ? <p className="mt-1 text-xs text-red-600">{errors.username}</p> : null}
          </div>
        )}
        <div>
          <label className="label">Họ tên *</label>
          <input
            className={`input ${errors.fullName ? 'border-red-400' : ''}`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="VD: Nguyễn Thị B"
          />
          {errors.fullName ? <p className="mt-1 text-xs text-red-600">{errors.fullName}</p> : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Vai trò *</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              {role === 'ADMIN'
                ? 'Toàn quyền, quản trị người dùng.'
                : role === 'VANTHU'
                  ? 'Nhập / sửa văn bản, import Excel.'
                  : 'Chỉ tra cứu, không sửa.'}
            </p>
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Đang hoạt động
            </label>
          </div>
        </div>
        {!editing && (
          <div>
            <label className="label">Mật khẩu *</label>
            <input
              className={`input ${errors.password ? 'border-red-400' : ''}`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
            />
            {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password}</p> : null}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Cấp lại mật khẩu cho người dùng khác */
function ResetPasswordModal({ target, onClose }: { target: UserRow; onClose: () => void }) {
  const toast = useToast()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setErr('')
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
      await changeUserPassword(target.id, pwd)
      toast.success(`Đã cấp lại mật khẩu cho "${target.username}".`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Cấp lại mật khẩu — @${target.username}`}>
      {saving ? (
        <Spinner label="Đang lưu…" />
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Mật khẩu mới</label>
            <input
              className="input"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Xác nhận mật khẩu</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Huỷ
            </button>
            <button className="btn-primary" onClick={() => void submit()}>
              Lưu mật khẩu
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
