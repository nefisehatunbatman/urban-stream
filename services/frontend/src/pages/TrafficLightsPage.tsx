// TrafficLightsPage.tsx
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'

const KONYA_CENTER: [number, number] = [32.492, 37.871]

type IntersectionType = 'fixed' | 'semi_smart'
type LightStatus = 'red' | 'yellow' | 'green'
type Page = 'traffic-lights' | 'density' | 'violations'

// generator.go'daki koordinat sınırları[cite: 1]
const MIN_LAT = 37.8300, MAX_LAT = 37.9200;
const MIN_LNG = 32.4400, MAX_LNG = 32.5400;

// Rastgele konum üretme fonksiyonu (Işıkları haritaya yayar)[cite: 1, 2]
const getRandomCoords = (): [number, number] => {
  const lat = Math.random() * (MAX_LAT - MIN_LAT) + MIN_LAT;
  const lng = Math.random() * (MAX_LNG - MIN_LNG) + MIN_LNG;
  return [lng, lat];
};

const LAMP_DIRECTIONS = ['N', 'S', 'E', 'W']
const INTERSECTIONS = [
  { id: 'INT-001', name: 'Alaaddin Meydanı', type: 'semi_smart' as IntersectionType },
  { id: 'INT-002', name: 'Musalla Bağları', type: 'fixed' as IntersectionType },
  { id: 'INT-003', name: 'Karatay Meydanı', type: 'fixed' as IntersectionType },
  { id: 'INT-004', name: 'Meram Kavşağı', type: 'semi_smart' as IntersectionType },
  { id: 'INT-005', name: 'Selçuklu Merkez', type: 'fixed' as IntersectionType },
  { id: 'INT-006', name: 'Hocacihan Kavşağı', type: 'fixed' as IntersectionType },
  { id: 'INT-007', name: 'Otogar Kavşağı', type: 'semi_smart' as IntersectionType },
  { id: 'INT-008', name: 'Eski Sanayi', type: 'fixed' as IntersectionType },
  { id: 'INT-009', name: 'Kule Site Kavşağı', type: 'semi_smart' as IntersectionType },
  { id: 'INT-010', name: 'Belediye Kavşağı', type: 'fixed' as IntersectionType },
]

// 40 Lamba, her biri harita üzerinde rastgele bir noktada[cite: 1, 2]
const ALL_LAMPS = INTERSECTIONS.flatMap(inter =>
  LAMP_DIRECTIONS.map(dir => {
    const [lng, lat] = getRandomCoords();
    return {
      lampId: `TL-${inter.id.slice(4)}-${dir}`,
      intersectionId: inter.id,
      intersectionName: inter.name,
      intersectionType: inter.type,
      lat,
      lng,
      dir,
    };
  })
)

interface HistoryEntry { status: LightStatus; enteredAt: string; duration: string }
interface LampState {
  status: LightStatus; isMalfunctioning: boolean
  source: 'sensor' | 'local'; history: HistoryEntry[]
}
type LampStateMap = Record<string, LampState>

const STATUS_COLOR: Record<LightStatus, string> = { red: '#ef4444', yellow: '#f59e0b', green: '#22c55e' }
const STATUS_LABEL: Record<LightStatus, string> = { red: 'Kırmızı', green: 'Yeşil', yellow: 'Sarı' }

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

function updateLampElement(wrapper: HTMLDivElement, state: { status: LightStatus; isMalfunctioning: boolean; source: string }) {
  const inner = wrapper.querySelector<HTMLDivElement>('.lamp-inner')
  if (!inner) return
  const bulbs = inner.querySelectorAll<HTMLDivElement>('.bulb')
  bulbs.forEach(b => { b.style.opacity = '0.12'; b.style.boxShadow = 'none' })
  const target = inner.querySelector<HTMLDivElement>(`.bulb-${state.status}`)
  if (target) { target.style.opacity = '1'; target.style.boxShadow = `0 0 10px ${STATUS_COLOR[state.status]}` }
  const badge = inner.querySelector<HTMLDivElement>(`.malfunction-badge`)
  if (badge) badge.style.display = state.isMalfunctioning ? 'block' : 'none'
  const srcDot = inner.querySelector<HTMLDivElement>('.source-dot')
  if (srcDot) srcDot.style.display = state.source === 'sensor' ? 'block' : 'none'
  inner.style.borderColor = state.isMalfunctioning ? '#f59e0b' : '#333'
  if (state.isMalfunctioning) inner.classList.add('malfunctioning')
  else inner.classList.remove('malfunctioning')
}

const LampPopup = memo(({ info, state, onClose }: { info: any; state: LampState | undefined; onClose: () => void }) => {
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
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_COLOR[state.status], boxShadow: `0 0 8px ${STATUS_COLOR[state.status]}` }} />
        <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: STATUS_COLOR[state.status] }}>{STATUS_LABEL[state.status]}</span>
        {state.isMalfunctioning && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full animate-pulse ml-1">ARIZALI</span>}
        {activeEntry && <span className="ml-auto text-[9px] font-mono text-slate-500">{activeEntry.enteredAt}</span>}
      </div>
      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Son Geçişler</p>
      <div className="space-y-1.5">
        {completedHistory.length === 0 && <p className="text-[9px] text-slate-700 italic">Henüz veri yok</p>}
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

export default function TrafficLightsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
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
  const [popupInfo, setPopupInfo]   = useState<any | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [paused, setPaused]         = useState(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: KONYA_CENTER,
      zoom: 12.0,
      antialias: true,
    })
    mapRef.current = map

    map.on('load', () => {
      ALL_LAMPS.forEach(lamp => {
        const el = createLampElement()
        updateLampElement(el, { status: 'red', isMalfunctioning: false, source: 'local' })
        el.onclick = (e) => {
          const point = map.project([lamp.lng, lamp.lat])
          setPopupInfo({ ...lamp, x: point.x, y: point.y })
          e.stopPropagation()
        }
        const marker = new maplibregl.Marker({ element: el }).setLngLat([lamp.lng, lamp.lat]).addTo(map)
        lampMarkersRef.current.set(lamp.lampId, { el, marker })
      })
      mapLoadedRef.current = true
    })

    map.on('click', () => setPopupInfo(null))
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current || pausedRef.current || msg.channel !== 'city.traffic_lights') return
      const d = msg.data as any
      if (!d.lamp_id) return
      setLastUpdate(new Date())

      const markerObj = lampMarkersRef.current.get(d.lamp_id)
      if (markerObj) updateLampElement(markerObj.el, { status: d.status, isMalfunctioning: d.is_malfunctioning, source: 'sensor' })

      setLampStates(prev => {
        const existing = prev[d.lamp_id]
        if (!existing || (existing.status === d.status && existing.isMalfunctioning === d.is_malfunctioning)) return prev
        const now = new Date()
        let newHistory = existing.history
        if (existing.status !== d.status) {
          let updated = [...existing.history]
          const lastIdx = updated.findIndex(h => h.duration === 'aktif')
          if (lastIdx !== -1) {
            const elapsed = Math.round((now.getTime() - timeStrToMs(updated[lastIdx].enteredAt, now)) / 1000)
            updated[lastIdx] = { ...updated[lastIdx], duration: `${elapsed}s` }
          }
          newHistory = [...updated, { status: d.status, enteredAt: now.toLocaleTimeString('tr-TR'), duration: 'aktif' }].slice(-6)
        }
        return { ...prev, [d.lamp_id]: { status: d.status, isMalfunctioning: d.is_malfunctioning ?? false, source: 'sensor', history: newHistory } }
      })
    })
  }, [setOnMessage])

  // Popup senkronizasyonu
  useEffect(() => {
    if (!popupInfo || !mapRef.current) return
    const updatePos = () => {
      const lamp = ALL_LAMPS.find(l => l.lampId === popupInfo.lampId)
      if (lamp && mapRef.current) {
        const point = mapRef.current.project([lamp.lng, lamp.lat])
        setPopupInfo(p => p ? { ...p, x: point.x, y: point.y } : null)
      }
    }
    mapRef.current.on('move', updatePos)
    return () => { mapRef.current?.off('move', updatePos) }
  }, [popupInfo])

  const counts = { green: Object.values(lampStates).filter(l => l.status === 'green').length, yellow: Object.values(lampStates).filter(l => l.status === 'yellow').length, red: Object.values(lampStates).filter(l => l.status === 'red').length }
  const faults = ALL_LAMPS.filter(l => lampStates[l.lampId]?.isMalfunctioning)

  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-xl font-black text-indigo-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Trafik Işıkları · Canlı İzleme</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">{connected ? 'Bağlı' : 'Bağlantı Yok'}</span>
          </div>
          <div className="text-[9px] text-slate-500 font-mono">AKTİF: {Object.values(lampStates).filter(l => l.source === 'sensor').length} / {ALL_LAMPS.length}</div>
        </div>

        <div>
          <button onClick={() => { pausedRef.current = !paused; setPaused(!paused) }}
            className={`w-full py-2 rounded-xl border font-bold text-[11px] transition-all ${paused ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {paused ? '▶ Başlat' : '⏸ Durdur'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['green', 'yellow', 'red'] as LightStatus[]).map(s => (
            <div key={s} className="bg-white/3 rounded-xl p-2 text-center border border-white/5">
              <p className="text-[20px] font-black leading-none" style={{ color: STATUS_COLOR[s] }}>{counts[s]}</p>
              <p className="text-[7px] text-slate-600 uppercase mt-1">{STATUS_LABEL[s]}</p>
            </div>
          ))}
        </div>

        {faults.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-bold text-yellow-500/80 uppercase tracking-widest flex items-center gap-1.5"><span className="animate-pulse">⚠</span> Arıza ({faults.length})</h3>
            <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 pr-1">
              {faults.map(l => (
                <div key={l.lampId} className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-2.5 py-1.5">
                  <p className="text-[9px] font-mono text-yellow-400">{l.lampId}</p>
                  <p className="text-[8px] text-slate-500">{l.intersectionName}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="relative flex-1 bg-black">
        <NavBar currentPage="traffic-lights" onNavigate={onNavigate} />
        <div ref={mapContainer} className="w-full h-full" />
        {popupInfo && <LampPopup info={popupInfo} state={lampStates[popupInfo.lampId]} onClose={() => setPopupInfo(null)} />}
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