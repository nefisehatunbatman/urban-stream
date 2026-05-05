// DensityPage.tsx — Optimized
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { useMqtt } from '../hooks/useMqtt'
import { NavBar } from './NavBar'
import { pauseStream, resumeStream } from '../api/endpoints'

const KONYA_CENTER: [number, number] = [32.492, 37.871]
const HEATMAP_UPDATE_MS = 500
const UI_UPDATE_MS      = 800

type Page = 'traffic-lights' | 'density' | 'violations'

interface DensityPoint {
  position: [number, number]
  weight:   number
}

interface ZoneStat {
  zone_id:       string
  vehicle_count: number
  lat:           number
  lng:           number
  updatedAt:     string
}

// Sabit renk dizisi — her render'da yeni array yaratılmaz
const HEATMAP_COLORS: [number, number, number, number][] = [
  [59,  130, 246, 80 ],
  [253, 224, 71,  160],
  [249, 115, 22,  200],
  [239, 68,  68,  255],
]

// getPosition / getWeight accessor'ları sabit ref olarak dışarıda tanımla.
// deck.gl bunları her setProps'ta karşılaştırır; inline arrow → her seferinde
// yeni referans → katman tam yeniden build edilir.
const getPosition = (d: DensityPoint) => d.position
const getWeight   = (d: DensityPoint) => d.weight

function makeHeatmapLayer(data: DensityPoint[]) {
  return new HeatmapLayer<DensityPoint>({
    id:           'density-heatmap',   // id sabit → deck.gl diff yapar
    data,
    getPosition,                       // sabit ref
    getWeight,                         // sabit ref
    colorRange:   HEATMAP_COLORS,      // sabit ref
    radiusPixels: 40,
    intensity:    1.5,
    threshold:    0.05,
    pickable:     false,
    // updateTriggers kaldırıldı — data referansı değişince deck.gl zaten diff yapar.
    // Sahte trigger eklemek her seferinde GPU buffer'ı yeniden yükletir.
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const StreamToggle = memo(({ paused, onToggle }: { paused: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-[11px] tracking-wide transition-all duration-200"
    style={{
      background:  paused ? '#22c55e15' : '#f9731615',
      borderColor: paused ? '#22c55e40' : '#f9731640',
      color:       paused ? '#22c55e'   : '#f97316',
    }}
  >
    <span>{paused ? '▶' : '⏸'}</span>
    <span>{paused ? 'Başlat' : 'Durdur'}</span>
  </button>
))

const ZoneCard = memo(({ z, color, label }: { z: ZoneStat; color: string; label: string }) => (
  <div className="bg-white/3 border border-white/5 rounded-xl px-2.5 py-2">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[9px] font-mono text-slate-400">{z.zone_id}</span>
      <span
        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
        style={{ background: `${color}20`, color }}
      >
        {label}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, z.vehicle_count / 2.5)}%`, background: color }}
        />
      </div>
      <span className="text-[9px] font-black shrink-0" style={{ color }}>{z.vehicle_count}</span>
    </div>
    <p className="text-[7px] text-slate-700 mt-1">{z.updatedAt}</p>
  </div>
))

function getDensityLevel(count: number) {
  if (count < 30)  return { label: 'Düşük',  color: '#3b82f6' }
  if (count < 80)  return { label: 'Orta',   color: '#fde047' }
  if (count < 150) return { label: 'Yüksek', color: '#f97316' }
  return                  { label: 'Kritik', color: '#ef4444' }
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface DensityPageProps { onNavigate: (page: Page) => void }

export default function DensityPage({ onNavigate }: DensityPageProps) {
  const mapContainer   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<maplibregl.Map | null>(null)
  const mapLoadedRef   = useRef(false)
  const deckOverlayRef = useRef<MapboxOverlay | null>(null)

  const densityPointsRef = useRef<Map<string, DensityPoint>>(new Map())
  const pendingZonesRef  = useRef<Map<string, ZoneStat>>(new Map())
  const heatmapDirtyRef  = useRef(false)
  const heatmapTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uiTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Önceki points array'ini ref'de sakla — değişmediyse aynı referansı ver
  const prevPointsRef = useRef<DensityPoint[]>([])

  const { connected, setOnMessage } = useMqtt(['city/konya/density'])
  const [zoneStats,     setZoneStats    ] = useState<ZoneStat[]>([])
  const [lastUpdate,    setLastUpdate   ] = useState<Date | null>(null)
  const [paused,        setPaused       ] = useState(false)
  const pausedRef                         = useRef(false)
  const [totalVehicles, setTotalVehicles] = useState(0)

  const handleToggle = useCallback(async () => {
    try {
      if (pausedRef.current) {
        await resumeStream('city.density')
      } else {
        await pauseStream('city.density')
        // Heatmap ve zone listesini temizle
        densityPointsRef.current.clear()
        pendingZonesRef.current.clear()
        if (deckOverlayRef.current) {
          deckOverlayRef.current.setProps({ layers: [makeHeatmapLayer([])] })
        }
        setZoneStats([])
        setTotalVehicles(0)
      }
      setPaused(prev => { pausedRef.current = !prev; return !prev })
    } catch (e) {
      console.error('Stream toggle hatası:', e)
    }
  }, [])

  const flushHeatmap = useCallback(() => {
    heatmapTimerRef.current = null
    if (!deckOverlayRef.current || !heatmapDirtyRef.current) return
    heatmapDirtyRef.current = false

    // Array.from — yeni ref → deck.gl diff tetiklenir
    const points = Array.from(densityPointsRef.current.values())
    prevPointsRef.current = points
    deckOverlayRef.current.setProps({ layers: [makeHeatmapLayer(points)] })
  }, [])

  const flushUI = useCallback(() => {
    uiTimerRef.current = null
    const zones = Array.from(pendingZonesRef.current.values())
    if (!zones.length) return

    // pending temizle önce — yeni mesajlar birikmeden silinir
    pendingZonesRef.current.clear()

    setZoneStats(prev => {
      const map = new Map(prev.map(z => [z.zone_id, z]))
      for (const z of zones) map.set(z.zone_id, z)
      const sorted = Array.from(map.values()).sort((a, b) => b.vehicle_count - a.vehicle_count)
      // totalVehicles hesabını ayrı state güncellemesine bölme —
      // tek render içinde yap (callback içinden setState çağrısı batch'lenir)
      setTotalVehicles(sorted.reduce((s, z) => s + z.vehicle_count, 0))
      return sorted
    })
    setLastUpdate(new Date())
  }, [])

  // ── Harita ─────────────────────────────────────────────────────────────────
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
      const overlay = new MapboxOverlay({
        interleaved: false,
        layers:      [makeHeatmapLayer([])],
      })
      deckOverlayRef.current = overlay
      map.addControl(overlay as any)
      mapLoadedRef.current = true
    })

    return () => {
      if (heatmapTimerRef.current) clearTimeout(heatmapTimerRef.current)
      if (uiTimerRef.current)      clearTimeout(uiTimerRef.current)
      if (deckOverlayRef.current) {
        map.removeControl(deckOverlayRef.current as any)
        deckOverlayRef.current = null
      }
      map.remove()
      mapRef.current       = null
      mapLoadedRef.current = false
    }
  }, [])

  // ── MQTT ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    setOnMessage(msg => {
      if (!mapLoadedRef.current)          return
      if (msg.channel !== 'city.density') return
      if (pausedRef.current)              return

      const d = msg.data as any

      densityPointsRef.current.set(d.zone_id, {
        position: [d.location.lng, d.location.lat],
        weight:   Math.min(1, d.vehicle_count / 250),
      })
      pendingZonesRef.current.set(d.zone_id, {
        zone_id:       d.zone_id,
        vehicle_count: d.vehicle_count,
        lat:           d.location.lat,
        lng:           d.location.lng,
        updatedAt:     new Date().toLocaleTimeString('tr-TR'),
      })

      heatmapDirtyRef.current = true

      if (!heatmapTimerRef.current)
        heatmapTimerRef.current = setTimeout(flushHeatmap, HEATMAP_UPDATE_MS)
      if (!uiTimerRef.current)
        uiTimerRef.current = setTimeout(flushUI, UI_UPDATE_MS)
    })
  }, [setOnMessage, flushHeatmap, flushUI])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0a0b0e] overflow-hidden select-none text-white">
      <aside className="w-72 bg-[#111318] border-r border-white/5 p-5 z-20 flex flex-col shrink-0 gap-4 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-xl font-black text-orange-400 italic tracking-tighter">TWINUP CITY</h1>
          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-0.5">Araç Yoğunluğu · Isı Haritası</p>
        </div>

        <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500'}`} />
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">
              {connected ? 'WebSocket Bağlı' : 'Bağlantı Yok'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            <span className="text-[9px] text-slate-500 font-mono">{zoneStats.length} aktif bölge</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
            <span className="text-[9px] text-slate-600 font-mono">
              {lastUpdate ? `Son veri: ${lastUpdate.toLocaleTimeString('tr-TR')}` : 'Veri bekleniyor…'}
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

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/3 rounded-xl p-3 border border-white/5">
            <p className="text-[18px] font-black text-orange-400 leading-none">{totalVehicles.toLocaleString('tr-TR')}</p>
            <p className="text-[7px] text-slate-600 uppercase mt-1">Toplam Araç</p>
          </div>
          <div className="bg-white/3 rounded-xl p-3 border border-white/5">
            <p className="text-[18px] font-black text-slate-300 leading-none">{zoneStats.length}</p>
            <p className="text-[7px] text-slate-600 uppercase mt-1">İzlenen Bölge</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 shrink-0">Bölge Yoğunlukları</p>
          <div className="space-y-1.5 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {zoneStats.length === 0 && <p className="text-[10px] text-slate-600 italic">Henüz veri yok…</p>}
            {zoneStats.map(z => {
              const { color, label } = getDensityLevel(z.vehicle_count)
              return <ZoneCard key={z.zone_id} z={z} color={color} label={label} />
            })}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-white/5">
          <p className="text-[8px] text-slate-600 uppercase mb-2">Yoğunluk Skalası</p>
          <div
            className="h-2 rounded-full overflow-hidden mb-1"
            style={{ background: 'linear-gradient(to right, #3b82f6, #fde047, #f97316, #ef4444)' }}
          />
          <div className="flex justify-between">
            <span className="text-[7px] text-slate-600">Düşük</span>
            <span className="text-[7px] text-slate-600">Yüksek</span>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 bg-black">
        <NavBar currentPage="density" onNavigate={onNavigate} />
        <div ref={mapContainer} className="w-full h-full" />
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2d313d; border-radius: 10px; }
      `}</style>
    </div>
  )
}
