import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', permission: 'view_stats' },
  { path: '/live', label: 'Canlı Akış', icon: '📡', permission: 'view_stats' },
  { path: '/map', label: 'Harita', icon: '🗺️', permission: 'view_map' },
  { path: '/users', label: 'Kullanıcılar', icon: '👥', permission: 'manage_users' },
]

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 min-h-screen bg-dark-800 border-r border-dark-600 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-600">
        <h1 className="text-xl font-bold text-white">🏙️ UrbanStream</h1>
        <p className="text-xs text-slate-400 mt-1">Kentsel Veri Analitiği</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          if (!hasPermission(item.permission)) return null
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-slate-400 hover:bg-dark-700 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-dark-600">
        <div className="px-4 py-3 rounded-lg bg-dark-700">
          <p className="text-sm text-white font-medium truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full mt-2 px-4 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors text-left"
        >
          🚪 Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
