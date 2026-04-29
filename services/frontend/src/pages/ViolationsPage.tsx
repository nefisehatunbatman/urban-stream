// ViolationsPage.tsx — Canvas-based rendering (sıfır DOM marker)
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'

const KONYA_CENTER: [number, number] = [32.492, 37.871]
const UI_UPDATE_MS    = 600
const MAX_VIOLATIONS  = 50
const MAX_DOTS        = 300   // GeoJSON source'da tutulacak max nokta
// Radar pulse: her pulse kendi "doğum zamanını" taşır, rAF loop bunu okur
const RADAR_DURATION  = 2200  // ms — pulse genişleme süresi
const RADAR_MAX_SCALE = 4.0

type Page = 'traffic-lights' | 'density' | 'violations'

interface Violation {
  vehicle_id: string
  speed:      number
  direction?: string
  location:   { lat: number; lng: number }
  timestamp:  string
}

interface Stats { total: number; critical: number; maxSpeed: number }

interface RadarPulse {
  id:        number
  lngLat:    [number, number]
  speed:     number
  createdAt: number   // performance.now()
}

function computeStats(list: Violation[]): Stats {
  return list.reduce<Stats>(
    (a, v) => ({ total: a.total+1, critical: v.speed>120?a.critical+1:a.critical, maxSpeed: v.speed>a.maxSpeed?v.speed:a.maxSpeed }),
    { total: 0, critical: 0, maxSpeed: 0 }
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StreamToggle = memo(({ paused, onToggle }: { paused: boolean; onToggle: () => void }) => (
  <button onClick={onToggle}
    className="flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-[11px] tracking-wide transition-all duration-200"
    style={{ background: paused?'#22c55e15':'#ef444415', borderColor: paused?'#22c55e40':'#ef444440', color: paused?'#22c55e':'#ef4444' }}>
    <span>{paused?'▶':'⏸'}</span><span>{paused?'Başlat':'Durdur'}</span>
  </button>
))

const ViolationCard = memo(({ v }: { v: Violation }) => {
  const sev = v.speed>120?'critical':v.speed>90?'high':'medium'
  const s = {
    critical: { bg:'bg-red-500/10',    border:'border-red-500/30',    color:'#ef4444', label:'KRİTİK' },
    high:     { bg:'bg-orange-500/10', border:'border-orange-500/25', color:'#f97316', label:'YÜKSEK' },
    medium:   { bg:'bg-yellow-500/10', border:'border-yellow-500/20', color:'#f59e0b', label:'ORTA'   },
  }[sev]
  return (
    <div className={`${s.bg} border ${s.border} p-3 rounded-xl`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-mono text-slate-300">{v.vehicle_id}</p>
          <p className="text-[8px] text-slate-500 mt-0.5">{v.direction??'—'} · {v.timestamp}</p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-black leading-none italic" style={{ color: s.color }}>{v.speed}</p>
          <p className="text-[7px] text-slate-600">km/h</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full" style={{ background:`${s.color}25`, color:s.color }}>{s.label}</span>
        <span className="text-[7px] font-mono text-slate-600">{v.location.lat.toFixed(4)}, {v.location.lng.toFixed(4)}</span>
      </div>
    </div>
  )
})

// ── Canvas radar overlay ──────────────────────────────────────────────────────
// MapLibre custom layer: her frame'de tüm pulse'ları tek canvas draw call'uyla çizer.
// DOM elementi yok, CSS animation yok → GPU yükü minimumdur.

function createRadarLayer(getPulses: () => RadarPulse[], map: maplibregl.Map) {
  // Bir kere oluşturulan offscreen canvas (speed label için)
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 60; labelCanvas.height = 24
  const lctx = labelCanvas.getContext('2d')!

  return {
    id: 'radar-pulses',
    type: 'custom' as const,
    renderingMode: '2d' as const,

    render(gl: WebGLRenderingContext, matrix: number[]) {
      const canvas = map.getCanvas()
      const ctx = (canvas as any).__radarCtx as CanvasRenderingContext2D | undefined
      if (!ctx) return

      const now    = performance.now()
      const pulses = getPulses()

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of pulses) {
        const elapsed  = now - p.createdAt
        if (elapsed > RADAR_DURATION) continue

        const t        = elapsed / RADAR_DURATION         // 0→1
        const scale    = 1 + t * (RADAR_MAX_SCALE - 1)   // 1→4
        const opacity  = 1 - t                            // 1→0

        // Koordinat → pixel
        const pt       = map.project(p.lngLat)
        const cx       = pt.x * devicePixelRatio
        const cy       = pt.y * devicePixelRatio

        const radius   = 18 * scale * devicePixelRatio

        // Halka
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(239,68,68,${opacity * 0.9})`
        ctx.lineWidth   = 2 * devicePixelRatio
        ctx.stroke()

        // İç kırmızı nokta (sadece ilk 300ms)
        if (elapsed < 300) {
          ctx.beginPath()
          ctx.arc(cx, cy, 5 * devicePixelRatio, 0, Math.PI * 2)
          ctx.fillStyle = '#ef4444'
          ctx.fill()
        }

        // Hız etiketi (sadece ilk 500ms)
        if (elapsed < 500) {
          lctx.clearRect(0, 0, 60, 24)
          lctx.fillStyle = '#ef4444'
          lctx.beginPath()
          lctx.roundRect(0, 0, 46, 18, 4)
          lctx.fill()
          lctx.fillStyle = '#fff'
          lctx.font      = `900 11px monospace`
          lctx.textAlign = 'center'
          lctx.textBaseline = 'middle'
          lctx.fillText(String(p.speed), 23, 9)
          ctx.drawImage(labelCanvas, cx + 6*devicePixelRatio, cy - 14*devicePixelRatio, 46*devicePixelRatio, 18*devicePixelRatio)
        }
      }
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ViolationsPageProps { onNavigate: (page: Page) => void }

let pulseId = 0

export default function ViolationsPage({ onNavigate }: ViolationsPageProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const rafRef       = useRef<number>(0)

  const pendingRef   = useRef<Violation[]>([])
  const uiTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pulse listesi — ref (state değil, rAF içinden okunuyor)
  const pulsesRef    = useRef<RadarPulse[]>([])
  // Dot listesi — GeoJSON features
  const dotsRef      = useRef<GeoJSON.Feature[]>([])

  const { connected, setOnMessage } = useMqtt(['city/konya/speed_violations'])
  const [violations, setViolations] = useState<Violation[]>([])
  const [stats,      setStats     ] = useState<Stats>({ total:0, critical:0, maxSpeed:0 })
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)
  const [paused,     setPaused    ] = useState(false)
  const pausedRef                   = useRef(false)

  const handleToggle = useCallback(() => {
    setPaused(p => { pausedRef.current = !p; return !p })
  }, [])

  const flushUI = useCallback(() => {
    uiTimerRef.current = null
    const inc = pendingRef.current.splice(0)
    if (!inc.length) return
    setLastUpdate(new Date())
    setViolations(prev => {
      const updated = [...inc, ...prev].slice(0, MAX_VIOLATIONS)
      setStats(computeStats(updated))
      return updated
    })
  }, [])

  // ── Harita + Canvas overlay ───────────────────────────────────────────────
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

    map.on('load', () => {
      // ── GeoJSON dot layer (WebGL, sıfır DOM) ────────────────────────────
      map.addSource('dots', {
        type: 'geojson',
        data: { type:'FeatureCollection', features:[] },
      })
      map.addLayer({
        id:     'dots-layer',
        type:   'circle',
        source: 'dots',
        paint: {
          'circle-radius': 4,
          'circle-color':  '#ef4444',
          'circle-opacity': 0.65,
        },
      })

      // ── Canvas overlay ───────────────────────────────────────────────────
      // MapLibre'nin WebGL canvas'ının üstüne transparan 2D canvas ekle
      const glCanvas  = map.getCanvas()
      const overlay   = document.createElement('canvas')
      overlay.width   = glCanvas.width
      overlay.height  = glCanvas.height
      overlay.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none`
      glCanvas.parentElement!.appendChild(overlay)
      const ctx = overlay.getContext('2d')!

      // map resize → canvas'ı da yeniden boyutlandır
      const resizeObs = new ResizeObserver(() => {
        overlay.width  = glCanvas.width
        overlay.height = glCanvas.height
      })
      resizeObs.observe(glCanvas)

      // Custom layer bağlantısı için ctx'i sakla
      ;(glCanvas as any).__radarCtx = ctx

      // rAF loop — sadece canvas temizle + pulse çiz
      const radarLayer = createRadarLayer(() => pulsesRef.current, map)

      const tick = () => {
        const now = performance.now()
        // Süresi dolmuş pulse'ları çıkar
        pulsesRef.current = pulsesRef.current.filter(p => now - p.createdAt < RADAR_DURATION)

        // Canvas'ı temizle ve pulse'ları çiz
        ctx.clearRect(0, 0, overlay.width, overlay.height)

        const labelCanvas = document.createElement('canvas')
        labelCanvas.width = 60; labelCanvas.height = 24
        const lctx = labelCanvas.getContext('2d')!

        for (const p of pulsesRef.current) {
          const elapsed = now - p.createdAt
          const t       = elapsed / RADAR_DURATION
          const scale   = 1 + t * (RADAR_MAX_SCALE - 1)
          const opacity = 1 - t
          const pt      = map.project(p.lngLat)
          const cx      = pt.x * devicePixelRatio
          const cy      = pt.y * devicePixelRatio
          const radius  = 18 * scale * devicePixelRatio

          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI*2)
          ctx.strokeStyle = `rgba(239,68,68,${(opacity*0.9).toFixed(3)})`
          ctx.lineWidth   = 2 * devicePixelRatio
          ctx.stroke()

          if (elapsed < 400) {
            ctx.beginPath()
            ctx.arc(cx, cy, 5*devicePixelRatio, 0, Math.PI*2)
            ctx.fillStyle = '#ef4444'
            ctx.fill()
          }

          if (elapsed < 600) {
            lctx.clearRect(0,0,60,24)
            lctx.fillStyle = '#ef4444'
            lctx.beginPath()
            lctx.roundRect(0,0,46,18,4)
            lctx.fill()
            lctx.fillStyle = '#fff'
            lctx.font = '900 11px monospace'
            lctx.textAlign = 'center'
            lctx.textBaseline = 'middle'
            lctx.fillText(String(p.speed),23,9)
            ctx.drawImage(labelCanvas, cx+6*devicePixelRatio, cy-14*devicePixelRatio, 46*devicePixelRatio, 18*devicePixelRatio)
          }
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      mapLoadedRef.current = true

      return () => { resizeObs.disconnect() }
    })

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
      map.remove()
      mapRef.current    = null
      mapLoadedRef.current = false
    }
  }, [])

  // ── MQTT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current)                   return
      if (msg.channel !== 'city.speed_violations') return
      if (pausedRef.current)                       return

      const d      = msg.data as any
      const lngLat: [number,number] = [d.location.lng, d.location.lat]

      // 1. Pulse ekle (DOM yok, sadece ref'e yaz)
      pulsesRef.current.push({ id: ++pulseId, lngLat, speed: d.speed, createdAt: performance.now() })

      // 2. GeoJSON dot — sliding window
      const feat: GeoJSON.Feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: lngLat },
        properties: {},
      }
      dotsRef.current.push(feat)
      if (dotsRef.current.length > MAX_DOTS) dotsRef.current.shift()

      // GeoJSON source'u güncelle (MapLibre diff yapar, DOM dokunmaz)
      const src = mapRef.current?.getSource('dots') as maplibregl.GeoJSONSource | undefined
      src?.setData({ type:'FeatureCollection', features: dotsRef.current })

      // 3. Pending list → UI timer
      pendingRef.current.push({
        vehicle_id: d.vehicle_id, speed: d.speed, direction: d.direction,
        location: d.location, timestamp: new Date().toLocaleTimeString('tr-TR'),
      })
      if (!uiTimerRef.current)
        uiTimerRef.current = setTimeout(flushUI, UI_UPDATE_MS)
    })
  }, [setOnMessage, flushUI])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-xl font-black text-red-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Hız İhlalleri · Anlık İzleme</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected?'bg-green-400 shadow-[0_0_6px_#4ade80]':'bg-red-500'}`}/>
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">{connected?'WebSocket Bağlı':'Bağlantı Yok'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"/>
            <span className="text-[9px] text-slate-500 font-mono">{stats.total} toplam ihlal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0"/>
            <span className="text-[9px] text-slate-600 font-mono">
              {lastUpdate?`Son: ${lastUpdate.toLocaleTimeString('tr-TR')}`:'Bekleniyor…'}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Veri Akışı</p>
          <StreamToggle paused={paused} onToggle={handleToggle}/>
          {paused && <p className="text-[9px] text-yellow-500/70 mt-2 flex items-center gap-1.5"><span className="animate-pulse">⏸</span> Duraklatıldı</p>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { val: stats.total,    color: 'text-red-400',    label: 'Toplam' },
            { val: stats.critical, color: 'text-orange-400', label: 'Kritik' },
            { val: stats.maxSpeed, color: 'text-yellow-400', label: 'Max km/h' },
          ].map(s => (
            <div key={s.label} className="bg-white/3 rounded-xl p-2 border border-white/5 text-center">
              <p className={`text-[16px] font-black leading-none ${s.color}`}>{s.val}</p>
              <p className="text-[7px] text-slate-600 uppercase mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 shrink-0">Son İhlaller</p>
          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {violations.length===0 && <p className="text-[10px] text-slate-600 italic">Henüz ihlal yok…</p>}
            {violations.map(v => <ViolationCard key={`${v.vehicle_id}-${v.timestamp}`} v={v}/>)}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-white/5">
          <p className="text-[8px] text-slate-600 uppercase mb-2">Ağırlık Sınıfları</p>
          <div className="space-y-1">
            {[['Kritik (>120)','#ef4444'],['Yüksek (90-120)','#f97316'],['Orta (<90)','#f59e0b']].map(([l,c])=>(
              <div key={l} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background:c, boxShadow:`0 0 4px ${c}` }}/>
                <span className="text-[9px] text-slate-400">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="relative flex-1 bg-black">
        <NavBar currentPage="violations" onNavigate={onNavigate}/>
        <div ref={mapContainer} className="w-full h-full"/>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width:3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:#2d313d; border-radius:10px; }
      `}</style>
    </div>
  )
}