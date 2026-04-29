import { useEffect, useRef, useState, useCallback } from 'react'
import mqtt, { MqttClient } from 'mqtt'
import { useAuthStore } from '../store/authStore'

export interface LiveMessage {
  channel: string
  data: Record<string, unknown>
}

// Topic → channel eşlemesi (MapPage.tsx'teki msg.channel kontrolü değişmeden çalışsın)
const TOPIC_TO_CHANNEL: Record<string, string> = {
  'city/konya/traffic_lights':   'city.traffic_lights',
  'city/konya/density':          'city.density',
  'city/konya/speed_violations': 'city.speed_violations',
}

// Her sayfanın subscribe olacağı topic'ler buradan yönetilir.
// İleride sayfa ayırma yapılınca her sayfa kendi listesini geçer.
const DEFAULT_TOPICS = [
  'city/konya/traffic_lights',
  'city/konya/density',
  'city/konya/speed_violations',
]

export function useMqtt(topics: string[] = DEFAULT_TOPICS) {
  const token = useAuthStore((s) => s.token)

  const [connected, setConnected] = useState(false)
  const clientRef      = useRef<MqttClient | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef     = useRef(true)

  // useWebSocket ile aynı interface — MapPage.tsx'e dokunmaya gerek yok
  const onMessageRef = useRef<((msg: LiveMessage) => void) | null>(null)
  const setOnMessage = useCallback((fn: (msg: LiveMessage) => void) => {
    onMessageRef.current = fn
  }, [])

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return
    if (clientRef.current?.connected) return

    // EMQX'in MQTT over WebSocket portu (docker-compose: 8083)
    // Token'ı username olarak geçiyoruz — EMQX auth plugin bunu doğrular.
    // Backend JWT doğrulaması yoksa username/password kaldırılabilir.
    const client = mqtt.connect('ws://localhost:8083/mqtt', {
      username: token,
      password: '',                  // gerekirse doldur
      clientId: `urban_${Math.random().toString(16).slice(2, 8)}`,
      clean:    true,
      reconnectPeriod: 0,            // otomatik reconnect'i kendimiz yönetiyoruz
      connectTimeout: 5000,
      // QoS 0: fire-and-forget, en düşük overhead — 900 msg/s için ideal
    })

    clientRef.current = client

    client.on('connect', () => {
      if (!mountedRef.current) return
      setConnected(true)
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      // Broker'a topic listesini bildir; broker sadece bunları gönderir
      client.subscribe(topics, { qos: 0 }, (err) => {
        if (err) console.error('[useMqtt] subscribe error:', err)
      })
    })

    client.on('message', (topic, payload) => {
      if (!mountedRef.current) return
      try {
        const channel = TOPIC_TO_CHANNEL[topic] ?? topic
        const data    = JSON.parse(payload.toString()) as Record<string, unknown>
        // useWebSocket ile aynı shape → MapPage.tsx değişmez
        onMessageRef.current?.({ channel, data })
      } catch {
        // malformed JSON — sessizce geç
      }
    })

    client.on('close', () => {
      if (!mountedRef.current) return
      setConnected(false)
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 3000)
    })

    client.on('error', (err) => {
      console.error('[useMqtt] error:', err)
      client.end()
    })
  }, [token, topics])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      clientRef.current?.end(true)   // force:true → bağlantıyı hemen kapat
    }
  }, [connect])

  return { connected, setOnMessage }
}