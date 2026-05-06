import { useEffect, useState } from 'react'
import { listRoles } from '../api/endpoints'

interface Role {
  id: number
  name: string
  permissions: string // "{perm1,perm2,...}" formatında gelir
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  admin: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-300',
    border: 'border-violet-500/30',
    dot: 'bg-violet-400',
  },
  operator: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
  },
  viewer: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
  },
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  operator: 'Operatör',
  viewer: 'Görüntüleyici',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Sisteme tam erişim. Kullanıcı yönetimi, rol atama ve tüm raporlara erişim.',
  operator: 'Rapor oluşturabilir, istatistik ve harita sayfalarını görüntüleyebilir.',
  viewer: 'Yalnızca istatistik ve harita sayfalarını görüntüleyebilir.',
}

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  manage_users: { label: 'Kullanıcı Yönetimi', desc: 'Kullanıcı oluşturma, silme, düzenleme' },
  assign_roles: { label: 'Rol Atama', desc: 'Kullanıcılara rol atama' },
  create_report: { label: 'Rapor Oluşturma', desc: 'Analiz raporu oluşturma' },
  view_stats: { label: 'İstatistik Görüntüleme', desc: 'İstatistik sayfalarını görüntüleme' },
  view_map: { label: 'Harita Görüntüleme', desc: 'Harita sayfasını görüntüleme' },
}

function parsePermissions(raw: string): string[] {
  // PostgreSQL ARRAY_AGG sonucu "{perm1,perm2}" formatında gelir
  if (!raw || raw === 'NULL' || raw === '{NULL}') return []
  return raw.replace(/[{}]/g, '').split(',').filter(Boolean)
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listRoles()
      .then((res) => setRoles(res.data.data || []))
      .catch(() => setError('Roller yüklenemedi'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Rol Yönetimi</h1>
        <p className="text-slate-400 mt-1">
          Sistem rolleri ve izin matrisi
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Yükleniyor...</div>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400">
          {error}
        </div>
      ) : (
        <>
          {/* Rol Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {roles.map((role) => {
              const colors = ROLE_COLORS[role.name] || ROLE_COLORS.viewer
              const perms = parsePermissions(role.permissions)
              return (
                <div
                  key={role.id}
                  className={`rounded-xl border p-6 ${colors.bg} ${colors.border}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                    <h3 className={`font-semibold text-base ${colors.text}`}>
                      {ROLE_LABELS[role.name] || role.name}
                    </h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                    {ROLE_DESCRIPTIONS[role.name] || '—'}
                  </p>
                  <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">
                    İzinler ({perms.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.length === 0 ? (
                      <span className="text-slate-500 text-xs">İzin yok</span>
                    ) : (
                      perms.map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-1 rounded-md bg-dark-700 text-slate-300 border border-dark-600"
                        >
                          {PERMISSION_LABELS[p]?.label || p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* İzin Matrisi */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">İzin Matrisi</h2>
            <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider w-64">
                      İzin
                    </th>
                    {roles.map((role) => {
                      const colors = ROLE_COLORS[role.name] || ROLE_COLORS.viewer
                      return (
                        <th
                          key={role.id}
                          className={`text-center text-xs font-medium px-6 py-4 uppercase tracking-wider ${colors.text}`}
                        >
                          {ROLE_LABELS[role.name] || role.name}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {Object.entries(PERMISSION_LABELS).map(([perm, info]) => (
                    <tr key={perm} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm text-white font-medium">{info.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{info.desc}</div>
                      </td>
                      {roles.map((role) => {
                        const perms = parsePermissions(role.permissions)
                        const has = perms.includes(perm)
                        return (
                          <td key={role.id} className="px-6 py-4 text-center">
                            {has ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-dark-700 text-slate-600 text-xs">
                                —
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
