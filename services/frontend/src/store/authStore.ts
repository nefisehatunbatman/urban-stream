import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  permissions: string[]
}

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
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

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        return user.permissions.includes(permission)
      },

      hasRole: (role) => {
        const { user } = get()
        if (!user) return false
        return user.role === role
      },
    }),
    {
      name: 'auth-storage',
      partialify: (state) => ({ token: state.token, user: state.user }),
    } as Parameters<typeof persist>[1]
  )
)