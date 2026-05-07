import { useEffect, useState } from 'react'
import { listUsers, listRoles, assignRole, register } from '../api/endpoints'
import { useAuthStore } from '../store/authStore'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

interface Role {
  id: number
  name: string
  permissions: string
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary/10 text-primary border-primary/40',
  operator: 'bg-success/10 text-success border-success/40',
  viewer: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  operator: 'Operatör',
  viewer: 'Görüntüleyici',
}

export default function UsersPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('manage_users')

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Yeni kullanıcı modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // Rol atama modal
  const [assignTarget, setAssignTarget] = useState<User | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<number>(0)
  const [assignLoading, setAssignLoading] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [usersRes, rolesRes] = await Promise.all([listUsers(), listRoles()])
      setUsers(usersRes.data.data || [])
      setRoles(rolesRes.data.data || [])
    } catch {
      setError('Veriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAssignRole = async () => {
    if (!assignTarget || !selectedRoleId) return
    setAssignLoading(true)
    try {
      await assignRole(assignTarget.id, selectedRoleId)
      setAssignTarget(null)
      await fetchData()
    } catch {
      alert('Rol atanamadı')
    } finally {
      setAssignLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      await register(newEmail, newPassword, newFullName)
      setShowAddModal(false)
      setNewEmail('')
      setNewPassword('')
      setNewFullName('')
      await fetchData()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setAddError(axiosErr.response?.data?.error || 'Kullanıcı oluşturulamadı')
    } finally {
      setAddLoading(false)
    }
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h1>
          <p className="text-slate-400 mt-1">
            {users.length} kayıtlı kullanıcı
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white px-5 py-2.5 rounded-md font-medium transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Yeni Kullanıcı
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Email veya isim ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded-md px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Yükleniyor...</div>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400">
          {error}
        </div>
      ) : (
        <div className="bg-dark-800 rounded-md border border-dark-600 overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider">
                  Kullanıcı
                </th>
                <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider">
                  Rol
                </th>
                <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider">
                  Durum
                </th>
                <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider">
                  Kayıt Tarihi
                </th>
                {canManage && (
                  <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider">
                    İşlem
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 py-12">
                    Kullanıcı bulunamadı
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-700/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white text-sm">
                        {user.full_name || '—'}
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border capitalize ${
                          ROLE_COLORS[user.role] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          user.is_active ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            user.is_active ? 'bg-green-400' : 'bg-red-400'
                          }`}
                        />
                        {user.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {user.created_at ? user.created_at.slice(0, 10) : '—'}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setAssignTarget(user)
                            const currentRole = roles.find((r) => r.name === user.role)
                            setSelectedRoleId(currentRole?.id || 0)
                          }}
                          className="text-xs text-primary hover:text-accent font-medium transition-colors"
                        >
                          Rol Değiştir
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Yeni Kullanıcı Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-md border border-dark-600 w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Yeni Kullanıcı Ekle</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Ad Soyad</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-sm"
                  placeholder="Ali Veli"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-sm"
                  placeholder="ornek@mail.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Şifre</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-primary text-sm"
                  placeholder="En az 6 karakter"
                  required
                  minLength={6}
                />
              </div>
              <p className="text-xs text-slate-500">
                * Yeni kullanıcılar varsayılan olarak <strong className="text-slate-400">Viewer</strong> rolüyle oluşturulur.
              </p>

              {addError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                  {addError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddError('') }}
                  className="flex-1 bg-dark-700 hover:bg-dark-600 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {addLoading ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rol Atama Modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-md border border-dark-600 w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Rol Değiştir</h2>
            <p className="text-sm text-slate-400 mb-6">
              {assignTarget.full_name || assignTarget.email}
            </p>

            <div className="space-y-2 mb-6">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors ${
                    selectedRoleId === role.id
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-dark-600 bg-dark-700 text-slate-300 hover:border-dark-500'
                  }`}
                >
                  <span className="font-medium capitalize">
                    {ROLE_LABELS[role.name] || role.name}
                  </span>
                  {selectedRoleId === role.id && (
                    <span className="text-primary text-xs">Secili</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAssignTarget(null)}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAssignRole}
                disabled={assignLoading || !selectedRoleId}
                className="flex-1 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {assignLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
