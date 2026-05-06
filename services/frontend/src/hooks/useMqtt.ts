import { useEffect, useRef, useState, useCallback } from 'react'
import mqtt, { MqttClient } from 'mqtt'
import { useAuthStore } from '../store/authStore'

export interface LiveMessage {
  channel: string
  data: Record<string, unknown>
}

const TOPIC_TO_CHANNEL: Record<string, string> = {
  'city/konya/traffic_lights':   'city.traffic_lights',
  'city/konya/density':          'city.density',
  'city/konya/speed_violations': 'city.speed_violations',
}

const destroyClient = (c: MqttClient) => {
  try {
    c.removeAllListeners()
    const ws = (c as any).stream
    if (ws) {
      ws.onopen = null
      ws.onerror = null
      ws.onclose = null
      ws.onmessage = null
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
    c.end(true)
  } catch {
    // sessizce yut
  }
}

export function useMqtt(topics: string[]) {
  const token = useAuthStore((s) => s.token)

  const [connected, setConnected] = useState(false)
  const clientRef      = useRef<MqttClient | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef     = useRef(false)
  const onMessageRef   = useRef<((msg: LiveMessage) => void) | null>(null)
  const topicsRef      = useRef<string[]>(topics)

  const setOnMessage = useCallback((fn: (msg: LiveMessage) => void) => {
    onMessageRef.current = fn
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (!token) return

    // ── Strict Mode fix: küçük delay ile bağlan ──────────────────────────────
    // Strict Mode unmount→mount döngüsünde ilk connect iptal edilir,
    // gerçek mount'ta delay geçtikten sonra bağlantı kurulur.
    const initTimer = setTimeout(() => {
      if (!mountedRef.current) return
      connect()
    }, 50)

    const connect = () => {
      if (!mountedRef.current) return
      if (clientRef.current) {
        destroyClient(clientRef.current)
        clientRef.current = null
      }

      const client = mqtt.connect('ws://localhost:8083/mqtt', {
       // username:                 ,
       // password:        '',
        clientId:        `urban_${Math.random().toString(16).slice(2, 8)}`,
        clean:           true,
        reconnectPeriod: 0,
        connectTimeout:  8000,
        keepalive:       30,
      })
      clientRef.current = client

      client.on('connect', () => {
        if (!mountedRef.current) { destroyClient(client); return }
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }
        setConnected(true)
        if (topicsRef.current.length > 0) {
          client.subscribe(topicsRef.current, { qos: 0 }, (err) => {
            if (err) console.error('[useMqtt] subscribe error:', err)
          })
        }
      })

      client.on('message', (topic, payload) => {
        if (!mountedRef.current) return
        try {
          const channel = TOPIC_TO_CHANNEL[topic] ?? topic
          const data    = JSON.parse(payload.toString()) as Record<string, unknown>
          onMessageRef.current?.({ channel, data })
        } catch { /* malformed JSON */ }
      })

      client.on('close', () => {
        if (!mountedRef.current) return
        setConnected(false)
        if (reconnectTimer.current) return
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null
          if (mountedRef.current) connect()
        }, 3000)
      })

      client.on('error', (err) => {
        console.error('[useMqtt] error:', err)
        try { client.end(false) } catch { /* yut */ }
      })

      client.on('offline', () => {
        if (!mountedRef.current) return
        setConnected(false)
      })
    }

    return () => {
      mountedRef.current = false
      clearTimeout(initTimer)                    // ← henüz connect() çağrılmadıysa iptal et
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (clientRef.current) {
        destroyClient(clientRef.current)
        clientRef.current = null
      }
    }
  }, [token])

  const topicsKey = topics.join(',')

  useEffect(() => {
    const prev = topicsRef.current
    const next = topics

    const toAdd    = next.filter(t => !prev.includes(t))
    const toRemove = prev.filter(t => !next.includes(t))

    topicsRef.current = next

    const client = clientRef.current
    if (!client?.connected) return

    if (toRemove.length > 0) {
      client.unsubscribe(toRemove, (err) => {
        if (err) console.error('[useMqtt] unsubscribe error:', err)
      })
    }
    if (toAdd.length > 0) {
      client.subscribe(toAdd, { qos: 0 }, (err) => {
        if (err) console.error('[useMqtt] subscribe error:', err)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey])

  return { connected, setOnMessage }
}