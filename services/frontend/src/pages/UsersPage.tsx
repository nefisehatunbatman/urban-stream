import { useEffect, useState } from 'react'
import { getUsers, assignRole, deleteUser, getMe } from '../api/endpoints'

const ROLES = [
  {
    id: 1,
    name: 'admin',
    label: 'Admin',
    color: 'text-danger bg-danger/10',
    permissions: ['manage_users', 'assign_roles', 'create_report', 'view_stats', 'view_map'],
  },
  {
    id: 2,
    name: 'operator',
    label: 'Operatör',
    color: 'text-warning bg-warning/10',
    permissions: ['create_report', 'view_stats', 'view_map'],
  },
  {
    id: 3,
    name: 'viewer',
    label: 'Görüntüleyici',
    color: 'text-primary bg-primary/10',
    permissions: ['view_stats', 'view_map'],
  },
]

// İzin adı → Turkce label
const PERM_LABELS: Record<string, string> = {
  manage_users: 'Kullanıcı Yönetimi',
  assign_roles: 'Rol Atama',
  create_report: 'Rapor Oluşturma',
  view_stats: 'İstatistik',
  view_map: 'Harita',
}

interface User {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

interface CreateUserPayload {
  email: string
  password: string
  full_name: string
  role_id: number
}

const INITIAL_FORM: CreateUserPayload = {
  email: '',
  password: '',
  full_name: '',
  role_id: 3,
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = [
  'bg-primary/20 text-primary',
  'bg-warning/20 text-warning',
  'bg-danger/20 text-danger',
  'bg-success/20 text-success',
]

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

export default function UsersPage() {
  const [users, setUsers]           = useState<User[]>([])
  const [loading, setLoading]       = useState(true)
  const [updating, setUpdating]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState<CreateUserPayload>(INITIAL_FORM)
  const [formError, setFormError]   = useState('')
  const [creating, setCreating]     = useState(false)
  const [currentRole, setCurrentRole] = useState<string>('')

  useEffect(() => {
    fetchUsers()
    fetchCurrentUser()
  }, [])

  const fetchCurrentUser = async () => {
    try {
      const res = await getMe()
      setCurrentRole(res.data?.data?.role || res.data?.role || '')
    } catch (e) {
      console.error(e)
    }
  }

  const isAdmin = currentRole === 'admin'

  const fetchUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, roleId: number) => {
    if (!isAdmin) return
    setUpdating(userId)
    try {
      await assignRole(userId, roleId)
      await fetchUsers()
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(null)
    }
  }

  const handleDelete = async (userId: string) => {
    if (!isAdmin) return
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return
    setDeleting(userId)
    try {
      await deleteUser(userId)
      await fetchUsers()
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(null)
    }
  }

  const handleCreate = async () => {
    setFormError('')
    if (!form.email || !form.password || !form.full_name) {
      setFormError('Tüm alanlar zorunludur.')
      return
    }
    setCreating(true)
    try {
      const { register } = await import('../api/endpoints')
      // Backend: admin token'ıyla çağrıldığında role_id dikkate alınır
      const res = await register(form.email, form.password, form.full_name, form.role_id)
      const newUserId: string = res.data?.data?.id || res.data?.id
      // Backend role_id'yi doğrudan işleyemezse yedek olarak assignRole
      if (newUserId && form.role_id !== 3) {
        try { await assignRole(newUserId, form.role_id) } catch { /* yedek zaten çalışmıştır */ }
      }
      setShowModal(false)
      setForm(INITIAL_FORM)
      await fetchUsers()
    } catch (e: any) {
      setFormError(e?.response?.data?.message || 'Kullanıcı oluşturulamadı.')
    } finally {
      setCreating(false)
    }
  }

  const getRoleStyle = (role: string) =>
    ROLES.find((r) => r.name === role)?.color || 'text-slate-400 bg-slate-500/10'

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    const matchSearch =
      u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter ? u.role === roleFilter : true
    return matchSearch && matchRole
  })

  const stats = {
    total:  users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === 'admin').length,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6 space-y-4">
        <div className="h-8 w-56 rounded skeleton" />
        <div className="h-72 rounded-xl skeleton" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-black min-h-screen">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h1>
        <p className="text-slate-400 text-sm mt-1">Toplam {users.length} kullanıcı</p>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#050505] border border-primary/20 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400">Toplam</p>
          <p className="text-2xl font-bold text-white mt-0.5">{stats.total}</p>
        </div>
        <div className="bg-[#050505] border border-primary/20 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400">Aktif</p>
          <p className="text-2xl font-bold text-primary mt-0.5">{stats.active}</p>
        </div>
        <div className="bg-[#050505] border border-primary/20 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400">Admin</p>
          <p className="text-2xl font-bold text-danger mt-0.5">{stats.admins}</p>
        </div>
      </div>

      {/* Arama + Filtre + Yeni Kullanıcı */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="İsim veya e-posta ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary w-56 placeholder:text-slate-600"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
        >
          <option value="">Tüm Roller</option>
          {ROLES.map((r) => (
            <option key={r.id} value={r.name}>{r.label}</option>
          ))}
        </select>

        {/* Yeni Kullanıcı butonu — yetkisizse silik */}
        <button
          onClick={() => { if (isAdmin) { setShowModal(true); setFormError('') } }}
          disabled={!isAdmin}
          title={!isAdmin ? 'Bu işlem için admin yetkisi gereklidir' : ''}
          className={`ml-auto text-sm font-semibold px-4 py-2 rounded-lg transition-colors
            ${isAdmin
              ? 'bg-primary text-black hover:bg-primary/90 cursor-pointer'
              : 'bg-primary/20 text-primary/30 cursor-not-allowed opacity-40'
            }`}
        >
          + Yeni Kullanıcı
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-[#050505] rounded-xl border border-primary/30 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-primary/20">
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Kullanıcı</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Rol</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Durum</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Kayıt Tarihi</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Rol Değiştir</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-10 text-sm">
                  Kullanıcı bulunamadı.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-primary/10 hover:bg-[#0a0a0a] transition-all duration-150"
                >
                  {/* Kullanıcı */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor(user.full_name || user.email)}`}>
                        {initials(user.full_name || user.email)}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{user.full_name || '—'}</p>
                        <p className="text-slate-400 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Rol Rozeti */}
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleStyle(user.role)}`}>
                      {ROLES.find((r) => r.name === user.role)?.label || user.role}
                    </span>
                  </td>

                  {/* Durum */}
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'text-primary bg-primary/10' : 'text-danger bg-danger/10'}`}>
                      {user.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>

                  {/* Tarih */}
                  <td className="px-5 py-4 text-slate-400 text-xs">
                    {user.created_at?.slice(0, 10)}
                  </td>

                  {/* Rol Select — yetkisizse silik */}
                  <td className="px-5 py-4">
                    <select
                      disabled={!isAdmin || updating === user.id}
                      value={ROLES.find((r) => r.name === user.role)?.id ?? ''}
                      onChange={(e) => handleRoleChange(user.id, Number(e.target.value))}
                      title={!isAdmin ? 'Bu işlem için admin yetkisi gereklidir' : ''}
                      className={`bg-[#0a0a0a] border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none transition-all duration-150
                        ${isAdmin
                          ? 'border-warning/30 focus:border-primary cursor-pointer'
                          : 'border-slate-700 opacity-30 cursor-not-allowed'
                        }`}
                    >
                      {ROLES.map((role) => (
                        <option key={role.id} value={role.id}>{role.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Sil Butonu — yetkisizse silik */}
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={!isAdmin || deleting === user.id}
                      title={!isAdmin ? 'Bu işlem için admin yetkisi gereklidir' : 'Kullanıcıyı sil'}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium
                        ${isAdmin
                          ? 'bg-danger/10 text-danger hover:bg-danger/20 cursor-pointer'
                          : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-30'
                        }`}
                    >
                      {deleting === user.id ? '...' : 'Sil'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal — aynı kalıyor, sadece admin açabilir */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#050505] border border-primary/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-white text-lg font-semibold mb-5">Yeni Kullanıcı Oluştur</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ad Soyad</label>
                <input type="text" placeholder="Ahmet Yılmaz" value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary placeholder:text-slate-600" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">E-posta</label>
                <input type="email" placeholder="ornek@sirket.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary placeholder:text-slate-600" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Şifre</label>
                <input type="password" placeholder="••••••••" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary placeholder:text-slate-600" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Rol</label>
                <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}
                  className="w-full bg-[#0a0a0a] border border-primary/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary">
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                {/* Seçilen rolün izinleri */}
                {(() => {
                  const selectedRole = ROLES.find((r) => r.id === form.role_id)
                  if (!selectedRole) return null
                  return (
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Bu rolün izinleri</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRole.permissions.map((p) => (
                          <span
                            key={p}
                            className="text-[11px] px-2 py-0.5 rounded bg-[#0a0a0a] border border-primary/20 text-slate-300"
                          >
                            {PERM_LABELS[p] || p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
            {formError && <p className="text-danger text-xs mt-3">{formError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setForm(INITIAL_FORM) }}
                className="flex-1 bg-[#0a0a0a] border border-primary/20 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg hover:border-primary/40 transition-colors">
                İptal
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="flex-1 bg-primary text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {creating ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}