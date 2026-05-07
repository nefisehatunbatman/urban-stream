// live/DensityLivePage.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useMqtt } from '../../hooks/useMqtt'

const FLUSH_MS   = 250
const MAX_POINTS = 60   // sliding window

interface TimePoint {
  t:        string
  vehicles: number
  peds:     number
  speed:    number
}

interface ZoneBucket {
  zone: string
  count: number
}

interface Stats {
  vehicles: number
  peds:     number
  speed:    number
  zones:    number
}

const GRID  = '#1c1c1c'
const AXIS  = '#5f6368'

export default function DensityLivePage() {
  const { connected, setOnMessage } = useMqtt(['city/konya/density'])

  // Buffers — never trigger re-render
  const pendingRef = useRef<{ vehicles: number; peds: number; speed: number; zone: string }[]>([])
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoneMapRef = useRef<Map<string, number>>(new Map())

  const [series,  setSeries ] = useState<TimePoint[]>([])
  const [zones,   setZones  ] = useState<ZoneBucket[]>([])
  const [stats,   setStats  ] = useState<Stats>({ vehicles: 0, peds: 0, speed: 0, zones: 0 })
  const [msgCount, setMsgCount] = useState(0)
  const countRef = useRef(0)

  const flush = useCallback(() => {
    timerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (!batch.length) return

    countRef.current += batch.length
    setMsgCount(countRef.current)

    const avgV = Math.round(batch.reduce((s, d) => s + d.vehicles, 0) / batch.length)
    const avgP = Math.round(batch.reduce((s, d) => s + d.peds,     0) / batch.length)
    const avgS = parseFloat((batch.reduce((s, d) => s + d.speed,   0) / batch.length).toFixed(1))

    batch.forEach(d => {
      zoneMapRef.current.set(d.zone, (zoneMapRef.current.get(d.zone) ?? 0) + d.vehicles)
    })

    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    setSeries(prev => {
      const next = [...prev, { t: now, vehicles: avgV, peds: avgP, speed: avgS }]
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
    })

    const topZones = [...zoneMapRef.current.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([zone, count]) => ({ zone: zone.replace('Z-', ''), count }))
    setZones(topZones)

    setStats({ vehicles: avgV, peds: avgP, speed: avgS, zones: zoneMapRef.current.size })
  }, [])

  useEffect(() => {
    setOnMessage(msg => {
      if (msg.channel !== 'city.density') return
      const d = msg.data as any
      pendingRef.current.push({
        vehicles: d.vehicle_count   ?? 0,
        peds:     d.pedestrian_count ?? 0,
        speed:    d.avg_speed        ?? 0,
        zone:     d.zone_id          ?? '?',
      })
      if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_MS)
    })
  }, [setOnMessage, flush])

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-5"
      style={{ background: 'linear-gradient(160deg,#000000 0%,#050505 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-primary">Araç Yoğunluğu</h2>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-0.5">Anlık · {MAX_POINTS}s pencere</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-slate-600">{msgCount.toLocaleString()} mesaj</span>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest
            ${connected ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-primary animate-pulse' : 'bg-danger'}`} />
            {connected ? 'Canlı' : 'Bağlantı Yok'}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Ort. Araç',   value: stats.vehicles, unit: 'araç',   color: '#22c55e' },
          { label: 'Ort. Yaya',   value: stats.peds,     unit: 'yaya',   color: '#14b8a6' },
          { label: 'Ort. Hız',    value: stats.speed,    unit: 'km/h',   color: '#f97316' },
          { label: 'Aktif Bölge', value: stats.zones,    unit: 'bölge',  color: '#84cc16' },
        ].map(s => (
          <div key={s.label}
            className="rounded-2xl p-4 border"
            style={{ background: `${s.color}08`, borderColor: `${s.color}20` }}>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-3xl font-black leading-none tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[8px] text-slate-700 mt-1">{s.unit}</p>
          </div>
        ))}
      </div>

      {/* Area chart - araç + yaya */}
      <div className="rounded-2xl border border-white/5 p-5"
        style={{ background: '#090909' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Araç & Yaya Yoğunluğu</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="t" tick={{ fill: AXIS, fontSize: 9 }} interval={9} />
            <YAxis tick={{ fill: AXIS, fontSize: 9 }} />
            <Tooltip
              contentStyle={{ background: '#0b0b0b', border: '1px solid #1f1f1f', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#64748b' }}
            />
            <Area type="monotone" dataKey="vehicles" stroke="#22c55e" fill="url(#gV)" strokeWidth={2} dot={false} name="Araç" isAnimationActive={false} />
            <Area type="monotone" dataKey="peds"     stroke="#14b8a6" fill="url(#gP)" strokeWidth={1.5} dot={false} name="Yaya" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Speed line + Zone bar yan yana */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#090909' }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Ortalama Hız</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="t" tick={{ fill: AXIS, fontSize: 9 }} interval={9} />
              <YAxis tick={{ fill: AXIS, fontSize: 9 }} unit=" km/h" />
              <Tooltip contentStyle={{ background: '#0b0b0b', border: '1px solid #1f1f1f', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="speed" stroke="#f97316" strokeWidth={2} dot={false} name="Hız" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#090909' }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Top 10 Bölge</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={zones} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS, fontSize: 9 }} />
              <YAxis type="category" dataKey="zone" tick={{ fill: AXIS, fontSize: 9 }} width={32} />
              <Tooltip contentStyle={{ background: '#0b0b0b', border: '1px solid #1f1f1f', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} name="Araç" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
