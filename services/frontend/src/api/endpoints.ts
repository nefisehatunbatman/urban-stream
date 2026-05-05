import { api, authApi } from './axios'

// --- Auth ---
export const login = (email: string, password: string) =>
  authApi.post('/login', { email, password })

export const getMe = (token: string) =>
  authApi.get('/me', { headers: { Authorization: `Bearer ${token}` } })

export const getUsers = () => api.get('/users')

export const assignRole = (userId: string, roleId: number) =>
  api.put(`/users/${userId}/role`, { role_id: roleId })

// --- Data ---
export const getDensity = (days = 30) =>
  api.get(`/density?days=${days}`)

export const getHourlyDensity = (days = 30) =>
  api.get(`/density/hourly?days=${days}`)

export const getTrafficLights = (days = 30) =>
  api.get(`/traffic-lights?days=${days}`)

export const getSpeedViolations = (days = 30) =>
  api.get(`/speed-violations?days=${days}`)

export const getPredictions = (channel: string) =>
  api.get(`/predictions?channel=${channel}`)

export const getAnalysis = (channel: string) =>
  api.get(`/analysis?channel=${channel}`)

// --- Stream Kontrol ---
export const pauseStream  = (channel?: string) =>
  api.post(`/stream/pause${channel ? `?channel=${channel}` : ''}`)
export const resumeStream = (channel?: string) =>
  api.post(`/stream/resume${channel ? `?channel=${channel}` : ''}`)
export const getStreamStatus = () => api.get('/stream/status')