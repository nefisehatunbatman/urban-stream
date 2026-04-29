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

export function useMqtt(topics: string[]) {
  const token = useAuthStore((s) => s.token)

  const [connected, setConnected] = useState(false)
  const clientRef       = useRef<MqttClient | null>(null)
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef      = useRef(true)
  const onMessageRef    = useRef<((msg: LiveMessage) => void) | null>(null)

  // topics dizisini ref'te tut — bağlantı kurulduktan sonra
  // subscribe/unsubscribe ile güncellenir, yeniden connect olmaz
  const topicsRef = useRef<string[]>(topics)

  const setOnMessage = useCallback((fn: (msg: LiveMessage) => void) => {
    onMessageRef.current = fn
  }, [])

  // ── Bağlantı kur (sadece token değişince yeniden çalışır) ────────────────
  useEffect(() => {
    mountedRef.current = true

    if (!token) return

    const connect = () => {
      if (!mountedRef.current) return

      // Önceki client varsa temizle
      if (clientRef.current) {
        clientRef.current.removeAllListeners()
        clientRef.current.end(true)
        clientRef.current = null
      }

      const client = mqtt.connect('ws://localhost:8083/mqtt', {
        username:        token,
        password:        '',
        clientId:        `urban_${Math.random().toString(16).slice(2, 8)}`,
        clean:           true,
        reconnectPeriod: 0,      // otomatik reconnect kapalı — kendimiz yönetiyoruz
        connectTimeout:  8000,
        keepalive:       30,
      })

      clientRef.current = client

      client.on('connect', () => {
        if (!mountedRef.current) { client.end(true); return }

        // Timer varsa iptal et
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }

        setConnected(true)

        // Mevcut topic listesine subscribe ol
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
        } catch {
          // malformed JSON — geç
        }
      })

      client.on('close', () => {
        if (!mountedRef.current) return
        setConnected(false)

        // Zaten bir timer varsa yeni timer açma
        if (reconnectTimer.current) return
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null
          if (mountedRef.current) connect()
        }, 3000)
      })

      client.on('error', (err) => {
        console.error('[useMqtt] error:', err)
        // 'close' eventi zaten tetiklenecek — oradan reconnect
        client.end(false)
      })

      client.on('offline', () => {
        if (!mountedRef.current) return
        setConnected(false)
      })
    }

    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (clientRef.current) {
        clientRef.current.removeAllListeners()
        clientRef.current.end(true)
        clientRef.current = null
      }
      setConnected(false)
    }
  }, [token]) // ← sadece token değişince yeniden bağlan

  // ── Topic değişimini subscribe/unsubscribe ile yönet ─────────────────────
  // Bağlantıyı kesmeden sadece topic listesini günceller
  useEffect(() => {
    const prev = topicsRef.current
    const next = topics

    const toAdd    = next.filter(t => !prev.includes(t))
    const toRemove = prev.filter(t => !next.includes(t))

    topicsRef.current = next

    const client = clientRef.current
    if (!client?.connected) return   // bağlı değilse connect olunca zaten doğru listeyi kullanır

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
  }, [topics]) // topics dizisi referans karşılaştırması — sayfa bileşenlerinde sabit literal kullan

  return { connected, setOnMessage }
}