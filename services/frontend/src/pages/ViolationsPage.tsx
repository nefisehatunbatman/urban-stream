// ViolationsPage.tsx — 300 msg/s, yaş tabanlı solma, RAF yok
import { useEffect, useRef, useReducer, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'

const KONYA_CENTER: [number, number] = [32.492, 37.871]

const MAP_FLUSH_MS  = 60     // ~16fps harita güncellemesi
const UI_FLUSH_MS   = 700    // sidebar render aralığı
const MAX_DOTS      = 600    // haritada eş zamanlı max nokta
const MAX_LIST      = 60     // sidebar satır
const DOT_LIFETIME  = 8000   // ms — bu süreden sonra nokta tamamen solar

type Page = 'traffic-lights' | 'density' | 'violations'

interface Violation {
  vehicle_id: string
  speed:      number
  direction?: string
  location:   { lat: number; lng: number }
  timestamp:  string
}

// ── Reducer ────────────────────────────────────────────────────────────────
interface UIState {
  violations: Violation[]
  total:      number
  critical:   number
  maxSpeed:   number
  lastUpdate: Date | null
}
type UIAction = { type: 'FLUSH'; batch: Violation[] }

const initialUI: UIState = { violations: [], total: 0, critical: 0, maxSpeed: 0, lastUpdate: null }

function uiReducer(state: UIState, action: UIAction): UIState {
  const { batch } = action
  if (!batch.length) return state
  let { total, critical, maxSpeed } = state
  for (const v of batch) {
    total++
    if (v.speed > 120) critical++
    if (v.speed > maxSpeed) maxSpeed = v.speed
  }
  return {
    violations: [...batch, ...state.violations].slice(0, MAX_LIST),
    total, critical, maxSpeed,
    lastUpdate: new Date(),
  }
}

// ── Dot entry — koordinat + hız + doğum zamanı ────────────────────────────
interface DotEntry {
  lng:   number
  lat:   number
  speed: number
  born:  number
}

export function hexPath(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ') + ' Z'
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
  const sev = v.speed > 120 ? 'critical' : v.speed > 90 ? 'high' : 'medium'
  const s = {
    critical: { bg: 'bg-red-500/10',    border: 'border-red-500/30',    color: '#ef4444', label: 'KRİTİK' },
    high:     { bg: 'bg-orange-500/10', border: 'border-orange-500/25', color: '#f97316', label: 'YÜKSEK' },
    medium:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', color: '#f59e0b', label: 'ORTA'   },
  }[sev]
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

interface ViolationsPageProps { onNavigate: (page: Page) => void }

export default function ViolationsPage({ onNavigate }: ViolationsPageProps) {
  const mapContainer  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef  = useRef(false)
  const mapTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uiTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sabit boyutlu ring buffer
  const dotsArr       = useRef<DotEntry[]>(new Array(MAX_DOTS))
  const cursorRef     = useRef(0)   // sıradaki yazma yeri (mod MAX_DOTS)
  const countRef      = useRef(0)   // buffer'da geçerli eleman sayısı

  const uiPendingRef  = useRef<Violation[]>([])

  const { connected, setOnMessage } = useMqtt(['city/konya/speed_violations'])
  const [ui, dispatch] = useReducer(uiReducer, initialUI)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  const handleToggle = useCallback(() => {
    setPaused(p => { pausedRef.current = !p; return !p })
  }, [])

  const flushMap = useCallback(() => {
    mapTimerRef.current = null
    const src = mapRef.current?.getSource('violations') as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const now     = performance.now()
    const count   = countRef.current
    const features: GeoJSON.Feature[] = []

    for (let i = 0; i < count; i++) {
      const dot = dotsArr.current[i]
      if (!dot) continue
      const age = now - dot.born
      if (age > DOT_LIFETIME) continue
      // 0→1: yeni doğmuş=1, süresi dolmak üzere=0
      const opacity = 1 - age / DOT_LIFETIME
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [dot.lng, dot.lat] },
        properties: { speed: dot.speed, opacity },
      })
    }

    src.setData({ type: 'FeatureCollection', features })
  }, [])

  const flushUI = useCallback(() => {
    uiTimerRef.current = null
    const batch = uiPendingRef.current.splice(0)
    if (batch.length) dispatch({ type: 'FLUSH', batch })
  }, [])

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container:        mapContainer.current,
      style:            'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center:           KONYA_CENTER,
      zoom:             12.5,
      antialias:        false,
      maxTileCacheSize: 100,
      fadeDuration:     0,
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource('violations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: false,
        buffer: 32,
      })

      // Halo — büyüklük ve opaklık, opacity property'den
      map.addLayer({
        id: 'v-halo',
        type: 'circle',
        source: 'violations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'opacity'], 0, 5, 1, 16],
          'circle-color': ['step', ['get', 'speed'], '#f59e0b', 90, '#f97316', 120, '#ef4444'],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'opacity'], 0, 0, 1, 0.15],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['step', ['get', 'speed'], '#f59e0b', 90, '#f97316', 120, '#ef4444'],
          'circle-stroke-opacity': ['get', 'opacity'],
          'circle-pitch-alignment': 'map',
        },
      })

      // Nokta
      map.addLayer({
        id: 'v-dot',
        type: 'circle',
        source: 'violations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'opacity'], 0, 1.5, 1, 5],
          'circle-color': ['step', ['get', 'speed'], '#f59e0b', 90, '#f97316', 120, '#ef4444'],
          'circle-opacity': ['get', 'opacity'],
          'circle-pitch-alignment': 'map',
        },
      })

      mapLoadedRef.current = true
    })

    return () => {
      if (mapTimerRef.current) clearTimeout(mapTimerRef.current)
      if (uiTimerRef.current)  clearTimeout(uiTimerRef.current)
      map.remove()
      mapRef.current       = null
      mapLoadedRef.current = false
    }
  }, [])

  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current)                   return
      if (msg.channel !== 'city.speed_violations') return
      if (pausedRef.current)                       return

      const d = msg.data as any

      // Ring buffer — O(1), sıfır allocation
      const pos = cursorRef.current % MAX_DOTS
      dotsArr.current[pos] = {
        lng:   d.location.lng,
        lat:   d.location.lat,
        speed: d.speed,
        born:  performance.now(),
      }
      cursorRef.current++
      if (countRef.current < MAX_DOTS) countRef.current++

      if (!mapTimerRef.current) mapTimerRef.current = setTimeout(flushMap, MAP_FLUSH_MS)

      uiPendingRef.current.push({
        vehicle_id: d.vehicle_id,
        speed:      d.speed,
        direction:  d.direction,
        location:   d.location,
        timestamp:  new Date().toLocaleTimeString('tr-TR'),
      })
      if (!uiTimerRef.current) uiTimerRef.current = setTimeout(flushUI, UI_FLUSH_MS)
    })
  }, [setOnMessage, flushMap, flushUI])

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
            <span className="text-[9px] text-slate-500 font-mono">{ui.total} toplam ihlal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
            <span className="text-[9px] text-slate-600 font-mono">
              {ui.lastUpdate ? `Son: ${ui.lastUpdate.toLocaleTimeString('tr-TR')}` : 'Bekleniyor…'}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Veri Akışı</p>
          <StreamToggle paused={paused} onToggle={handleToggle} />
          {paused && (
            <p className="text-[9px] text-yellow-500/70 mt-2 flex items-center gap-1.5">
              <span>⏸</span> Duraklatıldı
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { val: ui.total,    color: 'text-red-400',    label: 'Toplam'   },
            { val: ui.critical, color: 'text-orange-400', label: 'Kritik'   },
            { val: ui.maxSpeed, color: 'text-yellow-400', label: 'Max km/h' },
          ].map(s => (
            <div key={s.label} className="bg-white/3 rounded-xl p-2 border border-white/5 text-center">
              <p className={`text-[16px] font-black leading-none tabular-nums ${s.color}`}>{s.val}</p>
              <p className="text-[7px] text-slate-600 uppercase mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 shrink-0">Son İhlaller</p>
          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {ui.violations.length === 0
              ? <p className="text-[10px] text-slate-600 italic">Henüz ihlal yok…</p>
              : ui.violations.map(v => (
                  <ViolationCard key={`${v.vehicle_id}-${v.timestamp}`} v={v} />
                ))
            }
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-white/5">
          <p className="text-[8px] text-slate-600 uppercase mb-2">Ağırlık Sınıfları</p>
          <div className="space-y-1.5">
            {([
              ['Kritik  >120 km/h', '#ef4444'],
              ['Yüksek  90–120',    '#f97316'],
              ['Orta    <90 km/h',  '#f59e0b'],
            ] as const).map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="7" cy="7" r="5" fill={`${color}25`} stroke={color} strokeWidth="1.5"/>
                  <circle cx="7" cy="7" r="2.5" fill={color}/>
                </svg>
                <span className="text-[9px] text-slate-400">{label}</span>
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
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2d313d; border-radius: 10px; }
      `}</style>
    </div>
  )
}
