import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWebSocket } from '../hooks/useWebSocket'

// ─── Sabit Veriler ─────────────────────────────────────────────────────────────
const KONYA_CENTER: [number, number] = [32.492, 37.871]
const LAMP_DIRECTIONS = ['N', 'S', 'E', 'W']

type IntersectionType = 'fixed' | 'semi_smart'

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
    lampId:           `TL-${inter.id.slice(4)}-${dir}`,
    intersectionId:   inter.id,
    intersectionName: inter.name,
    intersectionType: inter.type,
    lat: inter.lat,
    lng: inter.lng,
    dir,
  }))
)

// lampId → intersectionType hızlı erişim
const LAMP_TYPE_MAP: Record<string, IntersectionType> = {}
ALL_LAMPS.forEach(l => { LAMP_TYPE_MAP[l.lampId] = l.intersectionType })

// ─── Tipler ────────────────────────────────────────────────────────────────────
type LightStatus = 'red' | 'yellow' | 'green'

interface LampState {
  status:           LightStatus
  timeRemains:      number
  isMalfunctioning: boolean
  /** Verinin kaynağı: 'sensor' = backend push, 'local' = yerel fallback timer */
  source:           'sensor' | 'local'
  history:          Array<{ status: LightStatus; at: string }>
}

type LampStateMap = Record<string, LampState>

type ActiveChannels = {
  'city.density':          boolean
  'city.traffic_lights':   boolean
  'city.speed_violations': boolean
}

const STATUS_COLOR: Record<LightStatus, string> = {
  red:    '#ef4444',
  yellow: '#f59e0b',
  green:  '#22c55e',
}

// NEXT_STATUS ve FALLBACK_DURATION kaldırıldı.
// Durum geçişleri yalnızca backend sensör verisiyle tetiklenir;
// frontend hiçbir zaman kendi başına renk değiştirmez.

// ─── Marker DOM ────────────────────────────────────────────────────────────────
function createLampElement(): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'lamp-wrapper'
  wrapper.style.cssText = `
    width: 16px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
  `
  const inner = document.createElement('div')
  inner.className = 'lamp-inner lamp-marker'
  inner.style.cssText = `
    background: #111; padding: 4px 3px; border-radius: 5px;
    display: flex; flex-direction: column; gap: 3px;
    border: 1px solid #333; position: relative;
    transition: transform 0.15s ease;
    transform-origin: center center;
  `
  ;(['red', 'yellow', 'green'] as LightStatus[]).forEach(color => {
    const bulb = document.createElement('div')
    bulb.className = `bulb bulb-${color}`
    bulb.style.cssText = `
      width: 8px; height: 8px; border-radius: 50%;
      background: ${STATUS_COLOR[color]}; opacity: 0.12;
      transition: opacity 0.3s, box-shadow 0.3s;
    `
    inner.appendChild(bulb)
  })
  const badge = document.createElement('div')
  badge.className = 'malfunction-badge'
  badge.style.cssText = `
    display: none; position: absolute; top: -5px; right: -5px;
    width: 8px; height: 8px; border-radius: 50%;
    background: #f59e0b; border: 1px solid #000;
  `
  inner.appendChild(badge)

  // Sensor kaynak göstergesi (mavi nokta = canlı sensör verisi)
  const srcDot = document.createElement('div')
  srcDot.className = 'source-dot'
  srcDot.style.cssText = `
    display: none; position: absolute; bottom: -5px; right: -5px;
    width: 6px; height: 6px; border-radius: 50%;
    background: #6366f1; border: 1px solid #000;
  `
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
  if (target) {
    target.style.opacity = '1'
    target.style.boxShadow = `0 0 10px ${STATUS_COLOR[state.status]}`
  }

  const badge = inner.querySelector<HTMLDivElement>('.malfunction-badge')
  if (badge) badge.style.display = state.isMalfunctioning ? 'block' : 'none'

  // Akıllı kavşak → sensor'dan gelen veri: mavi nokta göster
  const srcDot = inner.querySelector<HTMLDivElement>('.source-dot')
  if (srcDot) srcDot.style.display = state.source === 'sensor' ? 'block' : 'none'

  if (state.isMalfunctioning) {
    inner.style.borderColor = '#f59e0b'
    inner.classList.add('malfunctioning')
  } else {
    inner.style.borderColor = '#333'
    inner.classList.remove('malfunctioning')
  }
}

// ─── Alt Bileşenler ────────────────────────────────────────────────────────────
const LayerToggle = memo(({
  active, onClick, color, icon, label,
}: {
  active: boolean; onClick: () => void
  color: string; icon: string; label: string
}) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 w-full text-left"
    style={{
      background:  active ? `${color}15` : 'transparent',
      borderColor: active ? `${color}40` : '#ffffff0d',
      opacity:     active ? 1 : 0.45,
    }}
  >
    <span className="text-[13px]">{icon}</span>
    <span className="text-[10px] font-semibold tracking-wide" style={{ color: active ? color : '#64748b' }}>
      {label}
    </span>
    <span
      className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: active ? color : '#334155', boxShadow: active ? `0 0 6px ${color}` : 'none' }}
    />
  </button>
))

const MalfunctionAlerts = memo(({ lampStates }: { lampStates: LampStateMap }) => {
  const faults = ALL_LAMPS.filter(l => lampStates[l.lampId]?.isMalfunctioning)
  if (faults.length === 0) return null
  return (
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
  )
})

const ViolationSidebar = memo(({ logs }: { logs: any[] }) => (
  <section className="flex-1 flex flex-col overflow-hidden min-h-0">
    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 shrink-0">
      Anlık Hız İhlalleri
    </h3>
    <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
      {logs.length === 0 && (
        <p className="text-[10px] text-slate-600 italic">Henüz ihlal yok…</p>
      )}
      {logs.map((v, i) => (
        <div
          key={`${v.vehicle_id}-${i}`}
          className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl flex justify-between items-center"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-slate-300">{v.vehicle_id}</span>
            <span className="text-[8px] text-slate-500 uppercase">{v.direction ?? '—'}</span>
          </div>
          <span className="text-[13px] font-black text-red-400 italic">{v.speed} km/h</span>
        </div>
      ))}
    </div>
  </section>
))

const MapLegend = memo(() => (
  <div className="absolute bottom-6 right-4 z-20 bg-[#0f1117]/90 backdrop-blur-sm border border-white/8
                  rounded-2xl p-3.5 w-52 shadow-xl">
    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">Gösterge</p>

    <p className="text-[8px] text-slate-600 uppercase mb-1.5">Trafik Işığı</p>
    <div className="space-y-1 mb-3">
      {(['green', 'yellow', 'red'] as LightStatus[]).map(s => (
        <div key={s} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: STATUS_COLOR[s], boxShadow: `0 0 5px ${STATUS_COLOR[s]}` }} />
          <span className="text-[9px] text-slate-400">
            {s === 'red' ? 'Kırmızı' : s === 'green' ? 'Yeşil' : 'Sarı'}
          </span>
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

    <p className="text-[8px] text-slate-600 uppercase mb-1.5">Kavşak Türü</p>
    <div className="space-y-1 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-indigo-400 font-mono">AI</span>
        <span className="text-[9px] text-slate-400">Akıllı Kavşak</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-500 font-mono">FX</span>
        <span className="text-[9px] text-slate-400">Sabit Zamanlı</span>
      </div>
    </div>

    <p className="text-[8px] text-slate-600 uppercase mb-1.5">Araç Yoğunluğu</p>
    <div className="h-2 rounded-full overflow-hidden mb-1"
      style={{ background: 'linear-gradient(to right, #3b82f6, #fde047, #f97316, #ef4444)' }} />
    <div className="flex justify-between mb-3">
      <span className="text-[8px] text-slate-600">Düşük</span>
      <span className="text-[8px] text-slate-600">Yüksek</span>
    </div>

    <div className="pt-2.5 border-t border-white/5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-red-500 shrink-0 opacity-80" />
        <span className="text-[9px] text-slate-400">Hız İhlali</span>
      </div>
    </div>
  </div>
))

// ─── Popup ─────────────────────────────────────────────────────────────────────
interface PopupInfo {
  lampId: string; intersectionName: string; intersectionType: IntersectionType
  dir: string; x: number; y: number
}

const LampPopup = memo(({
  info, state, onClose,
}: { info: PopupInfo; state: LampState | undefined; onClose: () => void }) => {
  if (!state) return null
  const isSmartSource = info.intersectionType === 'semi_smart' && state.source === 'sensor'
  return (
    <div
      style={{ left: info.x + 14, top: Math.max(10, info.y - 10) }}
      className="absolute z-50 bg-[#0f1117] border border-white/10 rounded-2xl p-4 w-64 shadow-2xl pointer-events-auto"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-mono text-indigo-400">{info.lampId}</p>
            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${
              info.intersectionType === 'semi_smart'
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-slate-700/50 text-slate-500'
            }`}>
              {info.intersectionType === 'semi_smart' ? 'AKILLI' : 'SABİT'}
            </span>
          </div>
          <p className="text-[9px] text-slate-500 mt-0.5">{info.intersectionName} · Yön: {info.dir}</p>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-white text-xs ml-3 shrink-0">✕</button>
      </div>

      {/* Mevcut Durum */}
      <div className="flex items-center gap-2 mb-3 bg-white/3 rounded-xl px-3 py-2">
        <span className="w-3 h-3 rounded-full shrink-0"
          style={{ background: STATUS_COLOR[state.status], boxShadow: `0 0 8px ${STATUS_COLOR[state.status]}` }} />
        <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: STATUS_COLOR[state.status] }}>
          {state.status === 'red' ? 'KIRMIZI' : state.status === 'green' ? 'YEŞİL' : 'SARI'}
        </span>
        {state.isMalfunctioning && (
          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full animate-pulse">
            ARIZALI
          </span>
        )}
        <span className="ml-auto text-[13px] font-mono font-bold text-slate-300">{state.timeRemains}s</span>
      </div>

      {/* Kaynak Bilgisi */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-1.5 h-1.5 rounded-full ${state.source === 'sensor' ? 'bg-indigo-400' : 'bg-slate-600'}`} />
        <span className="text-[9px] text-slate-500">
          {state.source === 'sensor'
            ? isSmartSource ? 'Akıllı sensör verisi (dinamik süre)' : 'Sensör verisi'
            : 'Yerel fallback timer'}
        </span>
      </div>

      {/* Geçmiş */}
      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Son 3 Değişim</p>
      <div className="space-y-1.5">
        {state.history.length === 0 && (
          <p className="text-[9px] text-slate-700 italic">Henüz değişim yok</p>
        )}
        {[...state.history].reverse().slice(0, 3).map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0"
              style={{ background: STATUS_COLOR[h.status], opacity: 1 - i * 0.3 }} />
            <span className="text-[9px] font-mono text-slate-400 uppercase">
              {h.status === 'red' ? 'Kırmızı' : h.status === 'green' ? 'Yeşil' : 'Sarı'}
            </span>
            <span className="ml-auto text-[8px] text-slate-600 font-mono">{h.at}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

// ─── Ana Bileşen ───────────────────────────────────────────────────────────────
export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef = useRef(false)

  const lampMarkersRef   = useRef<Map<string, { el: HTMLDivElement; marker: maplibregl.Marker }>>(new Map())
  const densityPointsRef = useRef<Map<string, any>>(new Map())

  const [lampStates, setLampStates] = useState<LampStateMap>(() => {
    const init: LampStateMap = {}
    ALL_LAMPS.forEach(lamp => {
      const type = lamp.intersectionType
      init[lamp.lampId] = {
        status:           'red',
        timeRemains:      Math.floor(Math.random() * 30) + 10,
        isMalfunctioning: false,
        source:           'local',
        history:          [],
      }
    })
    return init
  })
  const lampStatesRef = useRef<LampStateMap>(lampStates)
  useEffect(() => { lampStatesRef.current = lampStates }, [lampStates])

  const { messages, connected } = useWebSocket()
  const [violationLogs, setViolationLogs] = useState<any[]>([])
  const [popupInfo, setPopupInfo]         = useState<PopupInfo | null>(null)
  const [lastUpdate, setLastUpdate]       = useState<Date | null>(null)

  const [activeChannels, setActiveChannels] = useState<ActiveChannels>({
    'city.density':          true,
    'city.traffic_lights':   true,
    'city.speed_violations': true,
  })
  const activeChannelsRef = useRef(activeChannels)
  useEffect(() => { activeChannelsRef.current = activeChannels }, [activeChannels])

  const toggleChannel = useCallback((ch: keyof ActiveChannels) => {
    setActiveChannels(prev => {
      const next = { ...prev, [ch]: !prev[ch] }
      if (ch === 'city.traffic_lights') {
        lampMarkersRef.current.forEach(({ el }) => {
          el.style.visibility = next['city.traffic_lights'] ? 'visible' : 'hidden'
        })
      }
      if (ch === 'city.density' && mapRef.current?.isStyleLoaded()) {
        mapRef.current.setLayoutProperty(
          'density-heatmap', 'visibility',
          next['city.density'] ? 'visible' : 'none'
        )
      }
      return next
    })
  }, [])

  // ─── Harita Başlatma ──────────────────────────────────────────────────────────
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
      map.addSource('density-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'density-heatmap', type: 'heatmap', source: 'density-source',
        paint: {
          'heatmap-weight':    ['interpolate', ['linear'], ['get', 'vehicle_count'], 0, 0, 250, 1],
          'heatmap-intensity': 1.5,
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 10, 15, 14, 35],
          'heatmap-opacity':   0.6,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(59,130,246,0)',
            0.3, '#3b82f6',
            0.5, '#fde047',
            0.8, '#f97316',
            1,   '#ef4444',
          ],
        },
      })

      ALL_LAMPS.forEach(lamp => {
        const el    = createLampElement()
        const state = lampStatesRef.current[lamp.lampId]
        updateLampElement(el, state)

        el.addEventListener('click', e => {
          const point = mapRef.current!.project([lamp.lng, lamp.lat])
          setPopupInfo({
            lampId:           lamp.lampId,
            intersectionName: lamp.intersectionName,
            intersectionType: lamp.intersectionType,
            dir:              lamp.dir,
            x:                point.x,
            y:                point.y,
          })
          e.stopPropagation()
        })

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lamp.lng, lamp.lat])
          .addTo(map)

        lampMarkersRef.current.set(lamp.lampId, { el, marker })
      })

      const scaleMarkers = () => {
        const zoom  = map.getZoom()
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

  // ─── Countdown Timer (sadece görsel geri sayım) ───────────────────────────────
  // Bu timer ASLA renk/durum değiştirmez.
  // Tek görevi: sensörden gelen timeRemains'i her saniye 1 azaltmak (UI geri sayımı).
  // Sensör bağlantısı kesilirse sayaç 0'da durur, ışık son bilinen renkte DONAR.
  useEffect(() => {
    const interval = setInterval(() => {
      setLampStates(prev => {
        const next = { ...prev }
        let changed = false

        Object.keys(next).forEach(id => {
          const s = next[id]
          // Sadece timeRemains > 0 olan lamplarda sayacı azalt
          if (s.timeRemains > 0) {
            next[id] = { ...s, timeRemains: s.timeRemains - 1 }
            changed = true
            // Marker DOM'una dokunmaya gerek yok — sadece timeRemains değişti,
            // renk/durum aynı kaldı
          }
        })

        return changed ? next : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // ─── WebSocket: Sensör Verisi (tek otorite) ───────────────────────────────────
  // messages her flush'ta taze batch — önceki mesajları biriktirmiyor.
  // useEffect her yeni batch'te tetiklenir, tüm mesajları işler.
  useEffect(() => {
    if (messages.length === 0 || !mapLoadedRef.current) return

    setLastUpdate(new Date())

    // Trafik ışığı güncellemelerini tek bir state geçişinde toplu uygula
    const lampUpdates: Record<string, LampState> = {}
    const violations: any[] = []
    let densityChanged = false

    for (const msg of messages) {
      const d = msg.data as any

      // ── Trafik Işığı ──
      if (msg.channel === 'city.traffic_lights' && d.lamp_id) {
        // En güncel state: önce önceki lampUpdates'e bak, yoksa mevcut state'e
        const existing = lampUpdates[d.lamp_id] ?? lampStatesRef.current[d.lamp_id]
        if (!existing) continue

        const incomingStatus = d.status as LightStatus
        const statusChanged  = existing.status !== incomingStatus

        const updated: LampState = {
          status:           incomingStatus,
          timeRemains:      d.timing_remains ?? 30,
          isMalfunctioning: d.is_malfunctioning ?? false,
          source:           'sensor',
          history: statusChanged
            ? [...existing.history, { status: existing.status, at: new Date().toLocaleTimeString('tr-TR') }].slice(-10)
            : existing.history,
        }
        lampUpdates[d.lamp_id] = updated

        // Marker DOM'u anında güncelle (state batch'i beklemeden görsel hız)
        const marker = lampMarkersRef.current.get(d.lamp_id)
        if (marker) updateLampElement(marker.el, updated)
      }

      // ── Hız İhlali ──
      if (msg.channel === 'city.speed_violations' && activeChannelsRef.current['city.speed_violations']) {
        violations.push(d)
        const el = document.createElement('div')
        el.className = 'radar-effect'
        el.innerHTML = `<div class="p-ring"></div><div class="p-tag">${d.speed}</div>`
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([d.location.lng, d.location.lat])
          .addTo(mapRef.current!)
        setTimeout(() => m.remove(), 4000)
      }

      // ── Yoğunluk Heatmap ──
      if (msg.channel === 'city.density' && activeChannelsRef.current['city.density']) {
        densityPointsRef.current.set(d.zone_id, d)
        densityChanged = true
      }
    }

    // Tüm lamp güncellemelerini tek setState ile uygula
    if (Object.keys(lampUpdates).length > 0) {
      setLampStates(prev => ({ ...prev, ...lampUpdates }))
    }

    // İhlalleri toplu ekle
    if (violations.length > 0) {
      setViolationLogs(prev => [...violations, ...prev].slice(0, 10))
    }

    // Heatmap'i bir kez güncelle
    if (densityChanged) {
      const source = mapRef.current?.getSource('density-source') as maplibregl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: Array.from(densityPointsRef.current.values()).map(z => ({
            type:       'Feature',
            geometry:   { type: 'Point', coordinates: [z.location.lng, z.location.lat] },
            properties: { vehicle_count: z.vehicle_count },
          })) as any,
        })
      }
    }
  }, [messages])

  // ─── Popup Konum Takibi ───────────────────────────────────────────────────────
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

  // ─── Özet ─────────────────────────────────────────────────────────────────────
  const lightCounts = {
    green:  Object.values(lampStates).filter(l => l.status === 'green').length,
    yellow: Object.values(lampStates).filter(l => l.status === 'yellow').length,
    red:    Object.values(lampStates).filter(l => l.status === 'red').length,
  }
  const sensorCount = Object.values(lampStates).filter(l => l.source === 'sensor').length

  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">

      {/* ── Sidebar ── */}
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">

        <div>
          <h1 className="text-xl font-black text-indigo-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Konya · Canlı İzleme</p>
        </div>

        {/* Bağlantı Durumu */}
        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500'
            }`} />
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">
              {connected ? 'WebSocket Bağlı' : 'Bağlantı Yok'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span className="text-[9px] text-slate-500 font-mono">
              {sensorCount} / {ALL_LAMPS.length} sensör aktif
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
            <span className="text-[9px] text-slate-600 font-mono">
              {lastUpdate ? `Son veri: ${lastUpdate.toLocaleTimeString('tr-TR')}` : 'Veri bekleniyor…'}
            </span>
          </div>
        </div>

        {/* Katman Kontrolleri */}
        <div>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Katmanlar</p>
          <div className="space-y-1.5">
            <LayerToggle
              active={activeChannels['city.traffic_lights']}
              onClick={() => toggleChannel('city.traffic_lights')}
              color="#6366f1" icon="🚦" label="Trafik Işıkları"
            />
            <LayerToggle
              active={activeChannels['city.density']}
              onClick={() => toggleChannel('city.density')}
              color="#f97316" icon="🔥" label="Araç Yoğunluğu"
            />
            <LayerToggle
              active={activeChannels['city.speed_violations']}
              onClick={() => toggleChannel('city.speed_violations')}
              color="#ef4444" icon="🚨" label="Hız İhlalleri"
            />
          </div>
        </div>

        {/* Işık Özeti */}
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

        <MalfunctionAlerts lampStates={lampStates} />
        <ViolationSidebar logs={violationLogs} />
      </aside>

      {/* ── Harita ── */}
      <main className="relative flex-1 bg-black">
        <div ref={mapContainer} className="w-full h-full" />

        {popupInfo && (
          <LampPopup
            info={popupInfo}
            state={lampStates[popupInfo.lampId]}
            onClose={() => setPopupInfo(null)}
          />
        )}

        <MapLegend />
      </main>

      <style>{`
        @keyframes malfunction-flicker {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        .malfunctioning { animation: malfunction-flicker 0.8s ease-in-out infinite; }

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

        .custom-scrollbar::-webkit-scrollbar       { width:3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:#2d313d; border-radius:10px; }
      `}</style>
    </div>
  )
}
