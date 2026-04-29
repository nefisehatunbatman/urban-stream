// ViolationsPage.tsx
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'

const KONYA_CENTER: [number, number] = [32.492, 37.871]
const UI_UPDATE_MS    = 600    // sidebar max ~1.6/sn güncellenir
const MAX_VIOLATIONS  = 50     // listede tutulacak max ihlal sayısı
const MAX_DOT_MARKERS = 200    // haritada max kalıcı nokta (DOM patlamasını önler)

type Page = 'traffic-lights' | 'density' | 'violations'

interface Violation {
  vehicle_id: string
  speed:      number
  direction?: string
  location:   { lat: number; lng: number }
  timestamp:  string
}

const StreamToggle = memo(({ paused, onToggle }: { paused: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-[11px] tracking-wide transition-all duration-200"
    style={{
      background:  paused ? '#22c55e15' : '#ef444415',
      borderColor: paused ? '#22c55e40' : '#ef444440',
      color:       paused ? '#22c55e'   : '#ef4444',
    }}
  >
    <span>{paused ? '▶' : '⏸'}</span>
    <span>{paused ? 'Başlat' : 'Durdur'}</span>
  </button>
))

const ViolationCard = memo(({ v }: { v: Violation }) => {
  const severity = v.speed > 120 ? 'critical' : v.speed > 90 ? 'high' : 'medium'
  const s = {
    critical: { bg: 'bg-red-500/10',    border: 'border-red-500/30',    color: '#ef4444', label: 'KRİTİK' },
    high:     { bg: 'bg-orange-500/10', border: 'border-orange-500/25', color: '#f97316', label: 'YÜKSEK' },
    medium:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', color: '#f59e0b', label: 'ORTA'   },
  }[severity]

  return (
    <div className={`${s.bg} border ${s.border} p-3 rounded-xl`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-mono text-slate-300">{v.vehicle_id}</p>
          <p className="text-[8px] text-slate-500 mt-0.5">{v.direction ?? '—'} · {v.timestamp}</p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-black leading-none italic" style={{ color: s.color }}>{v.speed}</p>
          <p className="text-[7px] text-slate-600">km/h</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: `${s.color}25`, color: s.color }}>{s.label}</span>
        <span className="text-[7px] font-mono text-slate-600">
          {v.location.lat.toFixed(4)}, {v.location.lng.toFixed(4)}
        </span>
      </div>
    </div>
  )
})

interface ViolationsPageProps {
  onNavigate: (page: Page) => void
}

export default function ViolationsPage({ onNavigate }: ViolationsPageProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)

  // Biriktiriciler — React state değil
  const pendingRef    = useRef<Violation[]>([])
  const uiTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Kalıcı dot marker'ları sınırlamak için
  const dotMarkersRef = useRef<maplibregl.Marker[]>([])

  const { connected, setOnMessage } = useMqtt(['city/konya/speed_violations'])
  const [violations, setViolations] = useState<Violation[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [paused, setPaused]         = useState(false)
  const pausedRef                   = useRef(false)
  const [stats, setStats]           = useState({ total: 0, critical: 0, maxSpeed: 0 })

  const handleToggle = useCallback(() => {
    setPaused(prev => { pausedRef.current = !prev; return !prev })
  }, [])

  // Timer patladığında — toplu state güncellemesi (tek seferde)
  const flushUI = useCallback(() => {
    uiTimerRef.current = null
    const incoming = pendingRef.current.splice(0) // al ve temizle
    if (incoming.length === 0) return

    setLastUpdate(new Date())
    setViolations(prev => {
      const updated = [...incoming, ...prev].slice(0, MAX_VIOLATIONS)
      setStats({
        total:    updated.length,
        critical: updated.filter(v => v.speed > 120).length,
        maxSpeed: updated.length > 0 ? Math.max(...updated.map(v => v.speed)) : 0,
      })
      return updated
    })
  }, [])

  // ── Harita ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style:     'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center:    KONYA_CENTER,
      zoom:      12.5,
      antialias: true,
    })
    mapRef.current = map
    map.on('load', () => { mapLoadedRef.current = true })

    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
      // Tüm kalıcı marker'ları temizle
      dotMarkersRef.current.forEach(m => m.remove())
      dotMarkersRef.current = []
      map.remove()
      mapRef.current   = null
      mapLoadedRef.current = false
    }
  }, [])

  // ── MQTT ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current)                    return
      if (msg.channel !== 'city.speed_violations')  return
      if (pausedRef.current)                        return

      const d = msg.data as any

      // 1. Radar animasyon marker (geçici, 4sn sonra silinir)
      if (mapRef.current) {
        const el = document.createElement('div')
        el.className = 'radar-effect'
        el.innerHTML = `<div class="p-ring"></div><div class="p-tag">${d.speed}</div>`
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([d.location.lng, d.location.lat])
          .addTo(mapRef.current)
        setTimeout(() => m.remove(), 4000)
      }

      // 2. Kalıcı nokta marker — DOM patlamasını önlemek için cap uygula
      if (mapRef.current && dotMarkersRef.current.length < MAX_DOT_MARKERS) {
        const dot = document.createElement('div')
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:#ef4444;opacity:0.6;`
        const marker = new maplibregl.Marker({ element: dot })
          .setLngLat([d.location.lng, d.location.lat])
          .addTo(mapRef.current)
        dotMarkersRef.current.push(marker)
      } else if (dotMarkersRef.current.length >= MAX_DOT_MARKERS) {
        // En eski marker'ı kaldır, yenisini ekle (sliding window)
        const oldest = dotMarkersRef.current.shift()!
        oldest.remove()
        const dot = document.createElement('div')
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:#ef4444;opacity:0.6;`
        const marker = new maplibregl.Marker({ element: dot })
          .setLngLat([d.location.lng, d.location.lat])
          .addTo(mapRef.current!)
        dotMarkersRef.current.push(marker)
      }

      // 3. Listeye ekle (ref'e — state değil)
      pendingRef.current.push({
        vehicle_id: d.vehicle_id,
        speed:      d.speed,
        direction:  d.direction,
        location:   d.location,
        timestamp:  new Date().toLocaleTimeString('tr-TR'),
      })

      // 4. UI timer yoksa aç
      if (!uiTimerRef.current)
        uiTimerRef.current = setTimeout(flushUI, UI_UPDATE_MS)
    })
  }, [setOnMessage, flushUI])

  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-xl font-black text-red-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Hız İhlalleri · Anlık İzleme</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500'}`} />
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">
              {connected ? 'WebSocket Bağlı' : 'Bağlantı Yok'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-[9px] text-slate-500 font-mono">{stats.total} toplam ihlal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
            <span className="text-[9px] text-slate-600 font-mono">
              {lastUpdate ? `Son ihlal: ${lastUpdate.toLocaleTimeString('tr-TR')}` : 'Bekleniyor…'}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Veri Akışı</p>
          <StreamToggle paused={paused} onToggle={handleToggle} />
          {paused && (
            <p className="text-[9px] text-yellow-500/70 mt-2 flex items-center gap-1.5">
              <span className="animate-pulse">⏸</span> Veri akışı duraklatıldı
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/3 rounded-xl p-2 border border-white/5 text-center">
            <p className="text-[16px] font-black text-red-400 leading-none">{stats.total}</p>
            <p className="text-[7px] text-slate-600 uppercase mt-1">Toplam</p>
          </div>
          <div className="bg-white/3 rounded-xl p-2 border border-white/5 text-center">
            <p className="text-[16px] font-black text-orange-400 leading-none">{stats.critical}</p>
            <p className="text-[7px] text-slate-600 uppercase mt-1">Kritik</p>
          </div>
          <div className="bg-white/3 rounded-xl p-2 border border-white/5 text-center">
            <p className="text-[16px] font-black text-yellow-400 leading-none">{stats.maxSpeed}</p>
            <p className="text-[7px] text-slate-600 uppercase mt-1">Max km/h</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 shrink-0">Son İhlaller</p>
          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {violations.length === 0 && <p className="text-[10px] text-slate-600 italic">Henüz ihlal yok…</p>}
            {violations.map((v, i) => (
              <ViolationCard key={`${v.vehicle_id}-${i}`} v={v} />
            ))}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-white/5">
          <p className="text-[8px] text-slate-600 uppercase mb-2">Ağırlık Sınıfları</p>
          <div className="space-y-1">
            {[
              { label: 'Kritik (>120 km/h)',  color: '#ef4444' },
              { label: 'Yüksek (90-120 km/h)', color: '#f97316' },
              { label: 'Orta (<90 km/h)',      color: '#f59e0b' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }} />
                <span className="text-[9px] text-slate-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="relative flex-1 bg-black">
        <NavBar currentPage="violations" onNavigate={onNavigate} />
        <div ref={mapContainer} className="w-full h-full" />
      </main>

      <style>{`
        .radar-effect { display:flex; align-items:center; justify-content:center; }
        .p-ring {
          position:absolute; width:32px; height:32px;
          border:2px solid #ef4444; border-radius:50%;
          animation: pulse-out 4s forwards;
        }
        .p-tag {
          background:#ef4444; color:white; font-size:8px;
          font-weight:900; padding:2px 5px; border-radius:4px; z-index:2;
        }
        @keyframes pulse-out {
          0%   { transform:scale(0.5); opacity:1; }
          100% { transform:scale(4.5); opacity:0; }
        }
        .custom-scrollbar::-webkit-scrollbar { width:3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:#2d313d; border-radius:10px; }
      `}</style>
    </div>
  )
}
