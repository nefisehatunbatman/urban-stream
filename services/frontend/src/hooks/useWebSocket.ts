import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

export interface LiveMessage {
  channel: string
  data: Record<string, unknown>
}

export function useWebSocket() {
  const token = useAuthStore((s) => s.token)

  // messages state'i biriktirme → her mesajı callback ile anlık ilet
  // Böylece 200 mesajlık buffer'ı her render'da yeniden işlemiyoruz
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Consumer'lar bu callback'i register eder; her gelen mesajda bir kez çağrılır
  const onMessageRef = useRef<((msg: LiveMessage) => void) | null>(null)

  const setOnMessage = useCallback((fn: (msg: LiveMessage) => void) => {
    onMessageRef.current = fn
  }, [])

  const connect = () => {
    if (!token || !mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`ws://localhost:8082/ws/live?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg: LiveMessage = JSON.parse(event.data)
        // Her mesajı anında ilet — biriktirme yok, gereksiz re-render yok
        onMessageRef.current?.(msg)
      } catch {
        // malformed JSON — sessizce geç
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return { connected, setOnMessage }
}