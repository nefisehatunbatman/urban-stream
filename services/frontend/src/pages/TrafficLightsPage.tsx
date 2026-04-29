// TrafficLightsPage.tsx
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'

const KONYA_CENTER: [number, number] = [32.492, 37.871]
const LAMP_DIRECTIONS = ['N', 'S', 'E', 'W']

type IntersectionType = 'fixed' | 'semi_smart'
type LightStatus = 'red' | 'yellow' | 'green'
type Page = 'traffic-lights' | 'density' | 'violations'

const INTERSECTIONS = [
  { id: 'INT-001', name: 'Alaaddin Meydanı',   lat: 37.8714, lng: 32.4846, type: 'semi_smart' as IntersectionType },
  { id: 'INT-002', name: 'Musalla Bağları',     lat: 37.8780, lng: 32.4920, type: 'fixed'      as IntersectionType },
  { id: 'INT-003', name: 'Karatay Meydanı',     lat: 37.8690, lng: 32.4970, type: 'fixed'      as IntersectionType },
  { id: 'INT-004', name: 'Meram Kavşağı',       lat: 37.8620, lng: 32.4780, type: 'semi_smart' as IntersectionType },
  { id: 'INT-005', name: 'Selçuklu Merkez',     lat: 37.8810, lng: 32.4820, type: 'fixed'      as IntersectionType },
  { id: 'INT-006', name: 'Hocacihan Kavşağı',   lat: 37.8750, lng: 32.4650, type: 'fixed'      as IntersectionType },
  { id: 'INT-007', name: 'Otogar Kavşağı',      lat: 37.9150, lng: 32.5050, type: 'semi_smart' as IntersectionType },
  { id: 'INT-008', name: 'Eski Sanayi',         lat: 37.8850, lng: 32.4980, type: 'fixed'      as IntersectionType },
  { id: 'INT-009', name: 'Kule Site Kavşağı',   lat: 37.8880, lng: 32.4920, type: 'semi_smart' as IntersectionType },
  { id: 'INT-010', name: 'Belediye Kavşağı',    lat: 37.8745, lng: 32.4890, type: 'fixed'      as IntersectionType },
]

const ALL_LAMPS = INTERSECTIONS.flatMap(inter =>
  LAMP_DIRECTIONS.map(dir => ({
    lampId: `TL-${inter.id.slice(4)}-${dir}`,
    intersectionId: inter.id,
    intersectionName: inter.name,
    intersectionType: inter.type,
    lat: inter.lat,
    lng: inter.lng,
    dir,
  }))
)

interface HistoryEntry { status: LightStatus; enteredAt: string; duration: string }
interface LampState {
  status: LightStatus; isMalfunctioning: boolean
  source: 'sensor' | 'local'; history: HistoryEntry[]
}
type LampStateMap = Record<string, LampState>

const STATUS_COLOR: Record<LightStatus, string> = {
  red: '#ef4444', yellow: '#f59e0b', green: '#22c55e',
}
const STATUS_LABEL: Record<LightStatus, string> = {
  red: 'Kırmızı', green: 'Yeşil', yellow: 'Sarı',
}

function timeStrToMs(timeStr: string, ref: Date): number {
  const [h, m, s] = timeStr.split(':').map(Number)
  const d = new Date(ref)
  d.setHours(h, m, s, 0)
  if (d.getTime() > ref.getTime()) d.setDate(d.getDate() - 1)
  return d.getTime()
}

function createLampElement(): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `width:16px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;`
  const inner = document.createElement('div')
  inner.className = 'lamp-inner lamp-marker'
  inner.style.cssText = `background:#111;padding:4px 3px;border-radius:5px;display:flex;flex-direction:column;gap:3px;border:1px solid #333;position:relative;transition:transform 0.15s ease;transform-origin:center center;`
  ;(['red', 'yellow', 'green'] as LightStatus[]).forEach(color => {
    const bulb = document.createElement('div')
    bulb.className = `bulb bulb-${color}`
    bulb.style.cssText = `width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[color]};opacity:0.12;transition:opacity 0.3s,box-shadow 0.3s;`
    inner.appendChild(bulb)
  })
  const badge = document.createElement('div')
  badge.className = 'malfunction-badge'
  badge.style.cssText = `display:none;position:absolute;top:-5px;right:-5px;width:8px;height:8px;border-radius:50%;background:#f59e0b;border:1px solid #000;`
  inner.appendChild(badge)
  const srcDot = document.createElement('div')
  srcDot.className = 'source-dot'
  srcDot.style.cssText = `display:none;position:absolute;bottom:-5px;right:-5px;width:6px;height:6px;border-radius:50%;background:#6366f1;border:1px solid #000;`
  inner.appendChild(srcDot)
  wrapper.appendChild(inner)
  return wrapper
}

function updateLampElement(wrapper: HTMLDivElement, state: LampState) {
  const inner = wrapper.querySelector<HTMLDivElement>('.lamp-inner')
  if (!inner) return
  const bulbs = inner.querySelectorAll<HTMLDivElement>('.bulb')
  bulbs.forEach(b => { b.style.opacity = '0.12'; b.style.boxShadow = 'none' })
  const target = inner.querySelector<HTMLDivElement>(`.bulb-${state.status}`)
  if (target) { target.style.opacity = '1'; target.style.boxShadow = `0 0 10px ${STATUS_COLOR[state.status]}` }
  const badge = inner.querySelector<HTMLDivElement>('.malfunction-badge')
  if (badge) badge.style.display = state.isMalfunctioning ? 'block' : 'none'
  const srcDot = inner.querySelector<HTMLDivElement>('.source-dot')
  if (srcDot) srcDot.style.display = state.source === 'sensor' ? 'block' : 'none'
  inner.style.borderColor = state.isMalfunctioning ? '#f59e0b' : '#333'
  if (state.isMalfunctioning) inner.classList.add('malfunctioning')
  else inner.classList.remove('malfunctioning')
}

// ── Popup ────────────────────────────────────────────────────────────────────
interface PopupInfo {
  lampId: string; intersectionName: string; intersectionType: IntersectionType
  dir: string; x: number; y: number
}

const LampPopup = memo(({ info, state, onClose }: { info: PopupInfo; state: LampState | undefined; onClose: () => void }) => {
  if (!state) return null
  const completedHistory = state.history.filter(h => h.duration !== 'aktif').slice(-3).reverse()
  const activeEntry = state.history.find(h => h.duration === 'aktif')
  return (
    <div style={{ left: info.x + 14, top: Math.max(10, info.y - 10) }}
      className="absolute z-50 bg-[#0f1117] border border-white/10 rounded-2xl p-4 w-64 shadow-2xl pointer-events-auto">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-mono text-indigo-400">{info.lampId}</p>
            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${
              info.intersectionType === 'semi_smart' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700/50 text-slate-500'
            }`}>{info.intersectionType === 'semi_smart' ? 'AKILLI' : 'SABİT'}</span>
          </div>
          <p className="text-[9px] text-slate-500 mt-0.5">{info.intersectionName} · Yön: {info.dir}</p>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-white text-xs ml-3 shrink-0">✕</button>
      </div>
      <div className="flex items-center gap-2 mb-3 bg-white/3 rounded-xl px-3 py-2">
        <span className="w-3 h-3 rounded-full shrink-0"
          style={{ background: STATUS_COLOR[state.status], boxShadow: `0 0 8px ${STATUS_COLOR[state.status]}` }} />
        <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: STATUS_COLOR[state.status] }}>
          {STATUS_LABEL[state.status]}
        </span>
        {state.isMalfunctioning && (
          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full animate-pulse ml-1">ARIZALI</span>
        )}
        {activeEntry && <span className="ml-auto text-[9px] font-mono text-slate-500">{activeEntry.enteredAt}</span>}
      </div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-1.5 h-1.5 rounded-full ${state.source === 'sensor' ? 'bg-indigo-400' : 'bg-slate-600'}`} />
        <span className="text-[9px] text-slate-500">
          {state.source === 'sensor' ? 'Canlı sensör verisi' : 'Veri bekleniyor…'}
        </span>
      </div>
      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Son Geçişler</p>
      <div className="space-y-1.5">
        {completedHistory.length === 0 && <p className="text-[9px] text-slate-700 italic">Henüz tamamlanan geçiş yok</p>}
        {completedHistory.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[h.status], opacity: 1 - i * 0.25 }} />
            <span className="text-[9px] font-mono text-slate-400">{STATUS_LABEL[h.status]}</span>
            <span className="text-[8px] text-slate-600 font-mono">{h.enteredAt}</span>
            <span className="ml-auto text-[8px] font-mono text-indigo-400/80">{h.duration}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

// ── Durdur/Başlat Butonu ─────────────────────────────────────────────────────
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

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
interface TrafficLightsPageProps {
  onNavigate: (page: Page) => void
}

export default function TrafficLightsPage({ onNavigate }: TrafficLightsPageProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const lampMarkersRef = useRef<Map<string, { el: HTMLDivElement; marker: maplibregl.Marker }>>(new Map())

  const [lampStates, setLampStates] = useState<LampStateMap>(() => {
    const init: LampStateMap = {}
    ALL_LAMPS.forEach(lamp => {
      init[lamp.lampId] = { status: 'red', isMalfunctioning: false, source: 'local', history: [] }
    })
    return init
  })

  const { connected, setOnMessage } = useMqtt(['city/konya/traffic_lights'])
  const [popupInfo, setPopupInfo]   = useState<PopupInfo | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [paused, setPaused]         = useState(false)
  const pausedRef = useRef(false)

  const handleToggle = useCallback(() => {
    setPaused(prev => {
      pausedRef.current = !prev
      return !prev
    })
  }, [])

  // ── Harita ──
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: KONYA_CENTER,
      zoom: 12.5,
      antialias: true,
    })
    mapRef.current = map

    map.on('load', () => {
      ALL_LAMPS.forEach(lamp => {
        const el = createLampElement()
        updateLampElement(el, { status: 'red', isMalfunctioning: false, source: 'local', history: [] })
        el.addEventListener('click', e => {
          const point = map.project([lamp.lng, lamp.lat])
          setPopupInfo({ lampId: lamp.lampId, intersectionName: lamp.intersectionName, intersectionType: lamp.intersectionType, dir: lamp.dir, x: point.x, y: point.y })
          e.stopPropagation()
        })
        const marker = new maplibregl.Marker({ element: el }).setLngLat([lamp.lng, lamp.lat]).addTo(map)
        lampMarkersRef.current.set(lamp.lampId, { el, marker })
      })

      const scaleMarkers = () => {
        const zoom = map.getZoom()
        const scale = Math.max(0.5, Math.min(1.8, (zoom - 10) / 3.5))
        lampMarkersRef.current.forEach(({ el }) => {
          const inner = el.querySelector<HTMLDivElement>('.lamp-inner')
          if (inner) inner.style.transform = `scale(${scale})`
        })
      }
      map.on('zoom', scaleMarkers)
      scaleMarkers()
      mapLoadedRef.current = true
    })

    map.on('click', () => setPopupInfo(null))
    return () => { map.remove(); mapRef.current = null; mapLoadedRef.current = false }
  }, [])

  // ── MQTT ──
  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current) return
      if (msg.channel !== 'city.traffic_lights') return
      if (pausedRef.current) return

      const d = msg.data as any
      if (!d.lamp_id) return

      setLastUpdate(new Date())
      setLampStates(prev => {
        const existing = prev[d.lamp_id]
        if (!existing) return prev
        const incomingStatus = d.status as LightStatus
        const statusChanged  = existing.status !== incomingStatus
        const now = new Date()
        const nowStr = now.toLocaleTimeString('tr-TR')
        let newHistory = existing.history

        if (statusChanged) {
          let updated = [...existing.history]
          const lastIdx = updated.findIndex(h => h.duration === 'aktif')
          if (lastIdx !== -1) {
            const enteredMs = timeStrToMs(updated[lastIdx].enteredAt, now)
            const elapsedSec = Math.round((now.getTime() - enteredMs) / 1000)
            updated[lastIdx] = { ...updated[lastIdx], duration: `${elapsedSec}s` }
          }
          newHistory = [...updated, { status: incomingStatus, enteredAt: nowStr, duration: 'aktif' }].slice(-6)
        }

        const updatedState: LampState = {
          status: incomingStatus, isMalfunctioning: d.is_malfunctioning ?? false, source: 'sensor', history: newHistory,
        }
        const marker = lampMarkersRef.current.get(d.lamp_id)
        if (marker) updateLampElement(marker.el, updatedState)
        return { ...prev, [d.lamp_id]: updatedState }
      })
    })
  }, [setOnMessage])

  // ── Popup move ──
  const handleMapMove = useCallback(() => {
    if (!popupInfo || !mapRef.current) return
    const lamp = ALL_LAMPS.find(l => l.lampId === popupInfo.lampId)
    if (!lamp) return
    const point = mapRef.current.project([lamp.lng, lamp.lat])
    setPopupInfo(p => p ? { ...p, x: point.x, y: point.y } : null)
  }, [popupInfo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.on('move', handleMapMove)
    return () => { map.off('move', handleMapMove) }
  }, [handleMapMove])

  const lightCounts = {
    green:  Object.values(lampStates).filter(l => l.status === 'green').length,
    yellow: Object.values(lampStates).filter(l => l.status === 'yellow').length,
    red:    Object.values(lampStates).filter(l => l.status === 'red').length,
  }
  const faults = ALL_LAMPS.filter(l => lampStates[l.lampId]?.isMalfunctioning)
  const sensorCount = Object.values(lampStates).filter(l => l.source === 'sensor').length

  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">
      {/* Sidebar */}
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-xl font-black text-indigo-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Trafik Işıkları · Canlı İzleme</p>
        </div>

        {/* Bağlantı Durumu */}
        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500'}`} />
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">
              {connected ? 'WebSocket Bağlı' : 'Bağlantı Yok'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span className="text-[9px] text-slate-500 font-mono">{sensorCount} / {ALL_LAMPS.length} sensör aktif</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
            <span className="text-[9px] text-slate-600 font-mono">
              {lastUpdate ? `Son veri: ${lastUpdate.toLocaleTimeString('tr-TR')}` : 'Veri bekleniyor…'}
            </span>
          </div>
        </div>

        {/* Durdur/Başlat */}
        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Veri Akışı</p>
          <StreamToggle paused={paused} onToggle={handleToggle} />
          {paused && (
            <p className="text-[9px] text-yellow-500/70 mt-2 flex items-center gap-1.5">
              <span className="animate-pulse">⏸</span> Veri akışı duraklatıldı
            </p>
          )}
        </div>

        {/* Işık Sayaçları */}
        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Işık Durumu</p>
          <div className="grid grid-cols-3 gap-2">
            {(['green', 'yellow', 'red'] as LightStatus[]).map(s => (
              <div key={s} className="bg-white/3 rounded-xl p-2 text-center border border-white/5">
                <p className="text-[20px] font-black leading-none" style={{ color: STATUS_COLOR[s] }}>
                  {lightCounts[s]}
                </p>
                <p className="text-[7px] text-slate-600 uppercase mt-1">
                  {s === 'green' ? 'Yeşil' : s === 'yellow' ? 'Sarı' : 'Kırmızı'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Arızalar */}
        {faults.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold text-yellow-500/80 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <span className="animate-pulse">⚠</span> Arıza ({faults.length})
            </h3>
            <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
              {faults.map(l => (
                <div key={l.lampId} className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-2.5 py-1.5">
                  <p className="text-[9px] font-mono text-yellow-400">{l.lampId}</p>
                  <p className="text-[8px] text-slate-500 mt-0.5">{l.intersectionName}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legent */}
        <div className="mt-auto pt-4 border-t border-white/5">
          <p className="text-[8px] text-slate-600 uppercase mb-2">Legent</p>
          <div className="space-y-1">
            {(['green', 'yellow', 'red'] as LightStatus[]).map(s => (
              <div key={s} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s], boxShadow: `0 0 5px ${STATUS_COLOR[s]}` }} />
                <span className="text-[9px] text-slate-400">{STATUS_LABEL[s]}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-yellow-400 border border-black animate-pulse" />
              <span className="text-[9px] text-slate-400">Arızalı</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-500" />
              <span className="text-[9px] text-slate-400">Canlı Sensör</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Harita */}
      <main className="relative flex-1 bg-black">
        <NavBar currentPage="traffic-lights" onNavigate={onNavigate} />
        <div ref={mapContainer} className="w-full h-full" />
        {popupInfo && (
          <LampPopup info={popupInfo} state={lampStates[popupInfo.lampId]} onClose={() => setPopupInfo(null)} />
        )}
      </main>

      <style>{`
        @keyframes malfunction-flicker { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .malfunctioning { animation: malfunction-flicker 0.8s ease-in-out infinite; }
        .custom-scrollbar::-webkit-scrollbar { width:3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:#2d313d; border-radius:10px; }
      `}</style>
    </div>
  )
}
