import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  role_id: number
  permissions: string[]
}

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
  hasRoleID: (maxRoleID: number) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => {
        localStorage.setItem('access_token', token)
        set({ token, user })
      },

      logout: () => {
        localStorage.removeItem('access_token')
        set({ token: null, user: null })
      },

      // role_id tabanlı erişim: kullanıcının role_id'si maxRoleID'den ≤ olmalı
      // 1=admin (en yetkili), 2=operator, 3=viewer (en az yetkili)
      hasRoleID: (maxRoleID) => {
        const { user } = get()
        if (!user) return false
        
        // Geriye dönük uyumluluk: eski session'da role_id yoksa isimden bul
        let currentRoleID = user.role_id
        if (!currentRoleID) {
          if (user.role === 'admin') currentRoleID = 1
          else if (user.role === 'operator') currentRoleID = 2
          else currentRoleID = 3
        }

        return currentRoleID <= maxRoleID
      },

      hasRole: (role) => {
        const { user } = get()
        if (!user) return false
        return user.role === role
      },

      // İzin adını role_id eşlemesine çevirerek role_id üzerinden kontrol yapar
      // Sidebar ve diğer bileşenler bu fonksiyonu kullanmaya devam edebilir
      hasPermission: (permission) => {
        const { user } = get()
        if (!user || !user.role_id) return false
        // Her izin için gerekli maksimum role_id eşlemesi
        const permRoleMap: Record<string, number> = {
          manage_users:  1, // sadece admin (role_id=1)
          assign_roles:  1, // sadece admin (role_id=1)
          create_report: 2, // operator ve üstü (role_id ≤ 2)
          view_stats:    3, // herkes (role_id ≤ 3)
          view_map:      3, // herkes (role_id ≤ 3)
        }
        const required = permRoleMap[permission] ?? 1
        return user.role_id <= required
      },
    }),
    {
      name: 'auth-storage',
      partialify: (state) => ({ token: state.token, user: state.user }),
    } as Parameters<typeof persist>[1]
  )
)