import { useEffect, useState } from 'react'
import { getUsers, assignRole, deleteUser, getMe } from '../api/endpoints'

/* ─── Sabitler ─────────────────────────────────────────────────────────── */

const ROLES = [
  {
    id: 1,
    name: 'admin',
    label: 'Admin',
    color: 'text-danger bg-danger/10',
    dot: 'bg-danger',
    permissions: ['manage_users', 'assign_roles', 'create_report', 'view_stats', 'view_map'],
  },
  {
    id: 2,
    name: 'operator',
    label: 'Operatör',
    color: 'text-warning bg-warning/10',
    dot: 'bg-warning',
    permissions: ['create_report', 'view_stats', 'view_map'],
  },
  {
    id: 3,
    name: 'viewer',
    label: 'Görüntüleyici',
    color: 'text-primary bg-primary/10',
    dot: 'bg-primary',
    permissions: ['view_stats', 'view_map'],
  },
]

// Tüm izinler — sıralı
const ALL_PERMISSIONS: Record<string, { label: string; desc: string }> = {
  manage_users:  { label: 'Kullanıcı Yönetimi',  desc: 'Kullanıcı oluşturma, silme ve düzenleme' },
  assign_roles:  { label: 'Rol Atama',            desc: 'Kullanıcılara rol ve yetki atama' },
  create_report: { label: 'Rapor Oluşturma',      desc: 'Analiz raporu oluşturma ve dışa aktarma' },
  view_stats:    { label: 'İstatistik Görüntüle', desc: 'İstatistik panellerini ve grafikleri görme' },
  view_map:      { label: 'Harita Görüntüle',     desc: 'Canlı ve geçmiş trafik haritasını görme' },
}

/* Seçili izin kümesine en iyi uyan rolü bul */
function detectRole(selectedPerms: string[]): number {
  const set = new Set(selectedPerms)
  // Tam eşleşme önce
  for (const r of ROLES) {
    if (r.permissions.length === set.size && r.permissions.every((p) => set.has(p))) return r.id
  }
  // En yakın üst küme (en az izinli eşleşen)
  for (const r of [...ROLES].sort((a, b) => a.permissions.length - b.permissions.length)) {
    if (selectedPerms.every((p) => r.permissions.includes(p))) return r.id
  }
  return ROLES[0].id // admin — en kapsamlı
}

/* ─── Tipler ────────────────────────────────────────────────────────────── */

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

const INITIAL_FORM: CreateUserPayload = { email: '', password: '', full_name: '', role_id: 3 }

function buildDraft(roleId: number): Record<string, boolean> {
  const role = ROLES.find((r) => r.id === roleId)
  const draft: Record<string, boolean> = {}
  Object.keys(ALL_PERMISSIONS).forEach((p) => {
    draft[p] = role?.permissions.includes(p) ?? false
  })
  return draft
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

/* ─── Bileşen ───────────────────────────────────────────────────────────── */

export default function UsersPage() {
  const [users, setUsers]             = useState<User[]>([])
  const [loading, setLoading]         = useState(true)
  const [updating, setUpdating]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState<CreateUserPayload>(INITIAL_FORM)
  const [draftPerms, setDraftPerms]   = useState<Record<string, boolean>>(buildDraft(3))
  const [formError, setFormError]     = useState('')
  const [creating, setCreating]       = useState(false)

  const [currentRole, setCurrentRole] = useState<string>('')

  useEffect(() => {
    fetchUsers()
    fetchCurrentUser()
  }, [])

  const fetchCurrentUser = async () => {
    try {
      const res = await getMe()
      setCurrentRole(res.data?.data?.role || res.data?.role || '')
    } catch (e) { console.error(e) }
  }

  const isAdmin = currentRole === 'admin'

  const fetchUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  /* Modal aç — formu ve izinleri sıfırla */
  const openModal = () => {
    setForm(INITIAL_FORM)
    setDraftPerms(buildDraft(3))
    setFormError('')
    setShowModal(true)
  }

  /* Rol şablonu seçince izinleri güncelle */
  const handleRoleSelect = (roleId: number) => {
    setForm((f) => ({ ...f, role_id: roleId }))
    setDraftPerms(buildDraft(roleId))
  }

  /* İzin toggle edilince rol şablonunu değiştirme, sadece izni güncelle */
  const togglePerm = (perm: string) => {
    setDraftPerms((prev) => ({ ...prev, [perm]: !prev[perm] }))
  }

  const handleRoleChange = async (userId: string, roleId: number) => {
    if (!isAdmin) return
    setUpdating(userId)
    try {
      await assignRole(userId, roleId)
      await fetchUsers()
    } catch (e) { console.error(e) }
    finally { setUpdating(null) }
  }

  const handleDelete = async (userId: string) => {
    if (!isAdmin) return
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return
    setDeleting(userId)
    try {
      await deleteUser(userId)
      await fetchUsers()
    } catch (e) { console.error(e) }
    finally { setDeleting(null) }
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
      // Sadece seçili olan izinleri dizi haline getir
      const selectedPerms = Object.entries(draftPerms)
        .filter(([, isSelected]) => isSelected)
        .map(([permName]) => permName)

      // register fonksiyonuna permissions dizisini de ekliyoruz
      const res = await register(
        form.email, 
        form.password, 
        form.full_name, 
        form.role_id, 
        selectedPerms
      )
      
      const newUserId: string = res.data?.data?.id || res.data?.id
      if (newUserId && form.role_id !== 3) {
        try { await assignRole(newUserId, form.role_id) } catch { /* yedek */ }
      }
      setShowModal(false)
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
    const matchSearch = u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter ? u.role === roleFilter : true
    return matchSearch && matchRole
  })

  const stats = {
    total:  users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === 'admin').length,
  }

  const selectedPermsCount = Object.values(draftPerms).filter(Boolean).length
  const matchedRole = ROLES.find((r) => r.id === form.role_id)

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

        <button
          onClick={() => { if (isAdmin) openModal() }}
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

                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleStyle(user.role)}`}>
                      {ROLES.find((r) => r.name === user.role)?.label || user.role}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${user.is_active ? 'text-primary bg-primary/10' : 'text-danger bg-danger/10'}`}>
                      {user.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-slate-400 text-xs">
                    {user.created_at?.slice(0, 10)}
                  </td>

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

      {/* ─── Yeni Kullanıcı Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#050505] border border-primary/30 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

            {/* Modal Başlık */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-primary/10">
              <div>
                <h2 className="text-white text-lg font-semibold">Yeni Kullanıcı Oluştur</h2>
                <p className="text-slate-500 text-xs mt-0.5">Bilgileri doldurun ve izinleri belirleyin</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-500 hover:text-white text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal İçerik — kaydırılabilir */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">

              {/* Ad Soyad */}
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Ad Soyad</label>
                <input
                  type="text"
                  placeholder="Ahmet Yılmaz"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-[#0d0d0d] border border-primary/20 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* E-posta */}
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">E-posta</label>
                <input
                  type="email"
                  placeholder="ornek@sirket.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[#0d0d0d] border border-primary/20 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* Şifre */}
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Şifre</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-[#0d0d0d] border border-primary/20 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* Hızlı Rol Şablonu */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Rol Şablonu</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => {
                    const isActive = form.role_id === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleRoleSelect(r.id)}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all duration-150
                          ${isActive
                            ? 'border-primary/50 bg-primary/10 text-white shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.15)]'
                            : 'border-slate-700/50 bg-[#0d0d0d] text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                        <span>{r.label}</span>
                        <span className="text-[10px] text-slate-500 font-normal">{r.permissions.length} yetki</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Yetki Seçimi */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-slate-400">Yetkiler</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${matchedRole?.color || 'text-slate-400 bg-slate-700/40'}`}>
                      {matchedRole?.label}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {selectedPermsCount}/{Object.keys(ALL_PERMISSIONS).length} seçili
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-primary/15 overflow-hidden">
                  {Object.entries(ALL_PERMISSIONS).map(([perm, info], idx, arr) => (
                    <div
                      key={perm}
                      onClick={() => togglePerm(perm)}
                      className={`flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-colors duration-150
                        hover:bg-white/[0.025]
                        ${idx < arr.length - 1 ? 'border-b border-white/[0.05]' : ''}
                        ${draftPerms[perm] ? 'bg-primary/5' : 'bg-[#0a0a0a]'}
                      `}
                    >
                      {/* İzin adı + açıklama */}
                      <div className="flex-1 min-w-0 pr-4">
                        <p className={`text-sm font-medium transition-colors duration-150 ${draftPerms[perm] ? 'text-white' : 'text-slate-400'}`}>
                          {info.label}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{info.desc}</p>
                      </div>

                      {/* Toggle Switch */}
                      <div
                        role="switch"
                        aria-checked={draftPerms[perm]}
                        onClick={(e) => { e.stopPropagation(); togglePerm(perm) }}
                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 cursor-pointer
                          ${draftPerms[perm] ? 'bg-primary' : 'bg-slate-700'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                            ${draftPerms[perm] ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-danger text-xs">{formError}</p>
              )}
            </div>

            {/* Modal Alt Butonlar */}
            <div className="flex gap-3 px-6 py-4 border-t border-primary/10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#0d0d0d] border border-primary/20 text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:border-primary/40 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 bg-primary text-black text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}