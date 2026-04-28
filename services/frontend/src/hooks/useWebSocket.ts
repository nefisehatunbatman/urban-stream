import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'

export interface LiveMessage {
  channel: string
  data: Record<string, unknown>
}

export function useWebSocket() {
  const token = useAuthStore((s) => s.token)
  const [messages, setMessages] = useState<LiveMessage[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = () => {
    if (!token || !mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`ws://localhost:8082/ws/live?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      // Önceki reconnect timer'ı temizle
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg: LiveMessage = JSON.parse(event.data)
        setMessages((prev) => [msg, ...prev].slice(0, 200))
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      // 3 saniye sonra yeniden bağlan
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [token])

  return { messages, connected }
}