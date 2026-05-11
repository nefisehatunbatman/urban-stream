import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'DB', permission: 'view_stats' },
  { path: '/live', label: 'Canlı Akış', icon: 'LV', permission: 'view_stats' },
  { path: '/map', label: 'Harita', icon: 'MP', permission: 'view_map' },
  { path: '/reports', label: 'Raporlar', icon: 'RP', permission: 'create_report' },
  { path: '/users', label: 'Kullanıcılar', icon: 'US', permission: 'manage_users' },
  { path: '/roles', label: 'Roller & Yetkiler', icon: 'RL', permission: 'assign_roles' },
]

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-64 min-h-screen bg-black border-r border-dark-600 flex flex-col shadow-[8px_0_24px_rgba(0,0,0,0.25)]">
      <div className="p-6 border-b border-dark-600">
        <h1 className="text-xl font-bold text-white tracking-tight">UrbanStream</h1>
        <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Kentsel Veri Analitiği</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          if (!hasPermission(item.permission)) return null
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md text-sm transition-all duration-150 border ${
                  isActive
                    ? 'bg-primary/10 border-primary/40 text-white shadow-[inset_3px_0_0_#22c55e]'
                    : 'border-transparent text-slate-400 hover:bg-dark-700 hover:text-white'
                }`
              }
            >
              <span className="flex h-6 w-8 items-center justify-center rounded bg-dark-700 text-[10px] font-bold tracking-wide text-accent">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="p-4 border-t border-dark-600">
        <div className="px-4 py-3 rounded-md bg-dark-700 border border-dark-600">
          <p className="text-sm text-white font-medium truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => navigate('/account')}
            className="flex-1 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-dark-700 rounded-md transition-all duration-150 text-center border border-dark-600 hover:border-slate-600"
          >
            Hesabım
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-md transition-all duration-150 text-center border border-dark-600 hover:border-danger/30"
          >
            Çıkış
          </button>
        </div>
      </div>
    </aside>
  )
}
