import axios from 'axios'
import { useAuthStore } from '../store/authStore'

export const authApi = axios.create({
  baseURL: '/auth',
})

export const api = axios.create({
  baseURL: '/api',
})

// Her istekte token ekle
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 gelirse logout
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)