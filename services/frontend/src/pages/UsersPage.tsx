import { useEffect, useState } from 'react'
import { getUsers, assignRole } from '../api/endpoints'

const ROLES = [
  { id: 1, name: 'admin', label: 'Admin', color: 'text-red-400 bg-red-500/10' },
  { id: 2, name: 'operator', label: 'Operator', color: 'text-yellow-400 bg-yellow-500/10' },
  { id: 3, name: 'viewer', label: 'Viewer', color: 'text-green-400 bg-green-500/10' },
]

interface User {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

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

  const getRoleStyle = (role: string) => {
    return ROLES.find(r => r.name === role)?.color || 'text-slate-400 bg-slate-500/10'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400 animate-pulse">Kullanıcılar yükleniyor...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h1>
        <p className="text-slate-400 text-sm mt-1">{users.length} kullanıcı</p>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-600">
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Kullanıcı</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Rol</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Durum</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Kayıt Tarihi</th>
              <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Rol Değiştir</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-dark-600 hover:bg-dark-700 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-white text-sm font-medium">{user.full_name || '—'}</p>
                  <p className="text-slate-400 text-xs">{user.email}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleStyle(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.is_active ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                  }`}>
                    {user.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-400 text-xs">
                  {user.created_at?.slice(0, 10)}
                </td>
                <td className="px-5 py-4">
                  <select
                    disabled={updating === user.id}
                    defaultValue={ROLES.find(r => r.name === user.role)?.id}
                    onChange={(e) => handleRoleChange(user.id, Number(e.target.value))}
                    className="bg-dark-600 border border-dark-500 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    {ROLES.map(role => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
