import { useEffect, useRef, useState } from 'react'
import { listRoles, updateRolePermissions } from '../api/endpoints'

interface Role {
  id: number
  name: string
  permissions: string // PostgreSQL ARRAY_AGG: "{perm1,perm2,...}"
}

// Sistemdeki tüm izinler, kısa açıklamaları ve tooltip detayları
const ALL_PERMISSIONS: Record<string, { label: string; desc: string; tooltip: string }> = {
  manage_users: {
    label: 'Kullanıcı Yönetimi',
    desc: 'Kullanıcı oluşturma, silme, düzenleme',
    tooltip: 'Sistemdeki tüm kullanıcıları görüntüleme, yeni kullanıcı oluşturma, mevcut kullanıcıları düzenleme ve silme yetkisi verir.',
  },
  assign_roles: {
    label: 'Rol Atama',
    desc: 'Kullanıcılara rol atama',
    tooltip: 'Bir kullanıcıya Admin, Operatör veya Görüntüleyici rolü atama yetkisi verir. Bu izin olmadan rol değiştirilemez.',
  },
  create_report: {
    label: 'Rapor Oluşturma',
    desc: 'Analiz raporu oluşturma',
    tooltip: 'Yoğunluk, hız ihlali ve trafik ışığı verilerinden analiz raporu oluşturma ve dışa aktarma yetkisi verir.',
  },
  view_stats: {
    label: 'İstatistik',
    desc: 'İstatistik sayfalarını görüntüleme',
    tooltip: 'Anlık ve geçmiş istatistik panellerini, grafikleri ve özet verileri görüntüleme yetkisi verir.',
  },
  view_map: {
    label: 'Harita',
    desc: 'Harita sayfasını görüntüleme',
    tooltip: 'Canlı ve geçmiş trafik yoğunluğu haritasını, konum bazlı verileri görüntüleme yetkisi verir.',
  },
}

const ROLE_META: Record<string, { label: string; desc: string; card: string; dot: string; badge: string }> = {
  admin: {
    label: 'Admin',
    desc: 'Sisteme tam erişim. Kullanıcı yönetimi, rol atama ve tüm raporlara erişim.',
    card: 'border-danger/30 bg-danger/5',
    dot:  'bg-danger',
    badge: 'text-danger bg-danger/10',
  },
  operator: {
    label: 'Operatör',
    desc: 'Rapor oluşturabilir, istatistik ve harita sayfalarını görüntüleyebilir.',
    card: 'border-warning/30 bg-warning/5',
    dot:  'bg-warning',
    badge: 'text-warning bg-warning/10',
  },
  viewer: {
    label: 'Görüntüleyici',
    desc: 'Yalnızca istatistik ve harita sayfalarını görüntüleyebilir.',
    card: 'border-primary/30 bg-primary/5',
    dot:  'bg-primary',
    badge: 'text-primary bg-primary/10',
  },
}

function parsePermissions(raw: string): string[] {
  if (!raw || raw === 'NULL' || raw === '{NULL}') return []
  return raw.replace(/[{}]/g, '').split(',').filter(Boolean)
}

export default function RolesPage() {
  const [roles, setRoles]         = useState<Role[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  // Düzenleme modalındaki geçici izin durumu
  const [draftPerms, setDraftPerms]   = useState<Record<string, boolean>>({})
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [tooltip, setTooltip]         = useState<{ perm: string; x: number; y: number } | null>(null)
  const tooltipTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    listRoles()
      .then((res) => setRoles(res.data.data || []))
      .catch(() => setError('Roller yüklenemedi'))
      .finally(() => setLoading(false))
  }, [])

  const openEdit = (role: Role) => {
    const perms = parsePermissions(role.permissions)
    const draft: Record<string, boolean> = {}
    Object.keys(ALL_PERMISSIONS).forEach((p) => {
      draft[p] = perms.includes(p)
    })
    setDraftPerms(draft)
    setEditingRole(role)
    setSaveError('')
  }

  const handlePermMouseEnter = (perm: string, e: React.MouseEvent) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const modalEl = document.getElementById('perm-modal')
    const modalRect = modalEl?.getBoundingClientRect()
    tooltipTimer.current = setTimeout(() => {
      setTooltip({
        perm,
        x: rect.left - (modalRect?.left ?? 0),
        y: rect.top - (modalRect?.top ?? 0) - 8,
      })
    }, 180)
  }

  const handlePermMouseLeave = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }
  // PUT /roles/:id ile izinler guncelleniyor
  const handleSave = async () => {
    if (!editingRole) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    const newPerms = Object.entries(draftPerms)
      .filter(([, v]) => v)
      .map(([k]) => k)

    try {
      await updateRolePermissions(editingRole.id, newPerms)
      setSaveSuccess(true)
      // Local state'i guncelle
      setRoles((prev) =>
        prev.map((r) =>
          r.id === editingRole.id
            ? { ...r, permissions: `{${newPerms.join(',')}}` }
            : r,
        ),
      )
      // 1.5 sn sonra modali kapat
      setTimeout(() => {
        setEditingRole(null)
        setSaveSuccess(false)
      }, 1500)
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Izinler kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-black min-h-screen space-y-4">
        <div className="h-8 w-40 rounded skeleton" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-44 rounded-md skeleton" />
          <div className="h-44 rounded-md skeleton" />
          <div className="h-44 rounded-md skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-black min-h-screen">
      {/* Başlık */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Rol Yönetimi</h1>
        <p className="text-slate-400 mt-1">Sistem rolleri ve izinler</p>
      </div>

      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-danger text-sm">
          {error}
        </div>
      ) : (
        <>
          {/* Rol Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {roles.map((role) => {
              const meta  = ROLE_META[role.name] || ROLE_META.viewer
              const perms = parsePermissions(role.permissions)
              return (
                <div
                  key={role.id}
                  className={`rounded-xl border p-5 transition-all duration-150 hover:-translate-y-0.5 ${meta.card}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                      <span className={`text-sm font-semibold px-2 py-0.5 rounded ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </div>
                    <button
                      onClick={() => openEdit(role)}
                      className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-primary/40 px-2 py-1 rounded-lg transition-all"
                    >
                      Düzenle
                    </button>
                  </div>

                  <p className="text-slate-400 text-xs leading-relaxed mb-4">{meta.desc}</p>

                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-2">
                    İzinler ({perms.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.length === 0 ? (
                      <span className="text-slate-500 text-xs">İzin yok</span>
                    ) : (
                      perms.map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-0.5 rounded bg-[#050505] text-slate-300 border border-warning/20"
                        >
                          {ALL_PERMISSIONS[p]?.label || p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </>
      )}

      {/* İzin Düzenleme Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            id="perm-modal"
            className="relative bg-[#050505] border border-primary/30 rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white text-lg font-semibold">
                  {ROLE_META[editingRole.name]?.label || editingRole.name}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">İzinleri düzenle</p>
              </div>
              <button
                onClick={() => { setEditingRole(null); setTooltip(null) }}
                className="text-slate-500 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-1">
              {Object.entries(ALL_PERMISSIONS).map(([perm, info]) => (
                <div
                  key={perm}
                  onMouseEnter={(e) => handlePermMouseEnter(perm, e)}
                  onMouseLeave={handlePermMouseLeave}
                  className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-[#0a0a0a] transition-colors cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{info.label}</p>
                    {/* soru işareti ikonu */}
                    <span className="w-4 h-4 rounded-full border border-slate-600 text-slate-500 text-[10px] flex items-center justify-center leading-none select-none">
                      ?
                    </span>
                  </div>
                  {/* Toggle */}
                  <button
                    role="switch"
                    aria-checked={draftPerms[perm]}
                    onClick={() =>
                      setDraftPerms((prev) => ({ ...prev, [perm]: !prev[perm] }))
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
                      draftPerms[perm] ? 'bg-primary' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                        draftPerms[perm] ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Tooltip */}
            {tooltip && ALL_PERMISSIONS[tooltip.perm] && (
              <div
                className="absolute z-10 pointer-events-none"
                style={{ left: 16, right: 16, top: tooltip.y }}
              >
                <div className="bg-[#141414] border border-primary/20 rounded-lg px-3 py-2.5 shadow-xl -translate-y-full">
                  <p className="text-xs font-semibold text-white mb-0.5">
                    {ALL_PERMISSIONS[tooltip.perm].label}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {ALL_PERMISSIONS[tooltip.perm].tooltip}
                  </p>
                  {/* ok */}
                  <span className="absolute left-6 bottom-0 translate-y-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#141414]" />
                </div>
              </div>
            )}

            {saveError && (
              <p className="text-danger text-xs mt-3">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-primary text-xs mt-3 flex items-center gap-1">
                <span>✓</span> İzinler başarıyla kaydedildi.
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setEditingRole(null); setTooltip(null) }}
                className="flex-1 bg-[#0a0a0a] border border-primary/20 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg hover:border-primary/40 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
