import axios from 'axios'

const AUTH_BASE = import.meta.env.VITE_AUTH_URL || 'http://localhost:8081'
const ANALYTICS_BASE = import.meta.env.VITE_ANALYTICS_URL || 'http://localhost:8082'

const api = axios.create({ baseURL: AUTH_BASE })
const analyticsApi = axios.create({ baseURL: ANALYTICS_BASE })

// Token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

analyticsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auth
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const register = (
  email: string,
  password: string,
  full_name: string,
  role_id?: number,
  permissions?: string[],
) =>
  api.post('/auth/register', {
    email,
    password,
    full_name,
    ...(role_id     ? { role_id }     : {}),
    ...(permissions ? { permissions } : {}),
  })

export const refreshToken = (refresh_token: string) =>
  api.post('/auth/refresh', { refresh_token })

export const logout = (refresh_token: string) =>
  api.post('/auth/logout', { refresh_token })

export const getMe = (token?: string) =>
  api.get('/auth/me', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

export const updateMe = (full_name: string, password?: string) =>
  api.put('/auth/me', { full_name, ...(password ? { password } : {}) })
export const deleteUser = (userId: string) =>
  api.delete(`/users/${userId}`)

// Users
export const listUsers = () => api.get('/users')
export const getUsers = listUsers // alias

export const assignRole = (userId: string, roleId: number) =>
  api.put(`/users/${userId}/role`, { role_id: roleId })

export const updateUser = (userId: string, full_name: string, password?: string) =>
  api.put(`/users/${userId}`, { full_name, ...(password ? { password } : {}) })

// Roles
export const listRoles = () => api.get('/roles')

export const updateRolePermissions = (roleId: number, permissions: string[]) =>
  api.put(`/roles/${roleId}`, { permissions })

// Analytics (ClickHouse servisi)
export const getDensity = (days = 30) =>
  analyticsApi.get(`/api/density?days=${days}`)

export const getHourlyDensity = (days = 30) =>
  analyticsApi.get(`/api/density/hourly?days=${days}`)

export const getTrafficLights = (days = 30) =>
  analyticsApi.get(`/api/traffic-lights?days=${days}`)

export const getSpeedViolations = (days = 30) =>
  analyticsApi.get(`/api/speed-violations?days=${days}`)

export const getAirQuality = (days = 30) =>
  analyticsApi.get(`/api/density?days=${days}`) // air-quality ayrı endpoint yok

// AI Projeksiyonlar — channel: 'density' | 'speed_violations' | 'traffic_lights'
export const getPredictions = (channel = 'density') =>
  analyticsApi.get(`/api/predictions?channel=${channel}`)

// Analiz raporları
export const getAnalysis = (channel = 'density') =>
  analyticsApi.get(`/api/analysis?channel=${channel}`)

// Stream kontrol — channel query param ile veya tüm kanallar
export const pauseStream = (channel?: string) =>
  analyticsApi.post(`/api/stream/pause${channel ? `?channel=${channel}` : ''}`)

export const resumeStream = (channel?: string) =>
  analyticsApi.post(`/api/stream/resume${channel ? `?channel=${channel}` : ''}`)

export const streamStatus = () =>
  analyticsApi.get('/api/stream/status')

