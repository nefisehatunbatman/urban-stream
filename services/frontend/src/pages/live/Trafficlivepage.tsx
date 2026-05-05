// live/TrafficLivePage.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useMqtt } from '../../hooks/useMqtt'

const FLUSH_MS   = 250
const MAX_EVENTS = 80  // timeline için

interface TrafficEvent {
  id:     string
  status: 'red' | 'yellow' | 'green'
  fault:  boolean
  t:      string
}

interface StatusCounts { red: number; yellow: number; green: number }
interface FaultPoint   { t: string; faults: number; total: number }

const STATUS_COLOR = { red: '#ef4444', yellow: '#f59e0b', green: '#22c55e' }
const GRID = '#1a1d2e'
const AXIS = '#3f4460'

export default function TrafficLivePage() {
  const { connected, setOnMessage } = useMqtt(['city/konya/traffic_lights'])

  const pendingRef = useRef<{ status: string; fault: boolean; lamp: string }[]>([])
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countsRef  = useRef<StatusCounts>({ red: 0, yellow: 0, green: 0 })
  const faultRef   = useRef(0)
  const totalRef   = useRef(0)
  const countRef   = useRef(0)

  const [events,    setEvents   ] = useState<TrafficEvent[]>([])
  const [pie,       setPie      ] = useState<{ name: string; value: number; color: string }[]>([])
  const [faultSeries, setFaultSeries] = useState<FaultPoint[]>([])
  const [stats,     setStats    ] = useState({ red: 0, yellow: 0, green: 0, faultRate: 0 })
  const [msgCount,  setMsgCount ] = useState(0)

  const flush = useCallback(() => {
    timerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (!batch.length) return

    countRef.current += batch.length
    setMsgCount(countRef.current)

    let faultsInBatch = 0
    batch.forEach(d => {
      const s = d.status as keyof StatusCounts
      if (s in countsRef.current) countsRef.current[s]++
      if (d.fault) { faultRef.current++; faultsInBatch++ }
      totalRef.current++
    })

    const { red, yellow, green } = countsRef.current
    const total = red + yellow + green
    const faultRate = total > 0 ? parseFloat(((faultRef.current / totalRef.current) * 100).toFixed(1)) : 0

    setPie([
      { name: 'Kırmızı', value: red,    color: '#ef4444' },
      { name: 'Sarı',    value: yellow, color: '#f59e0b' },
      { name: 'Yeşil',   value: green,  color: '#22c55e' },
    ])

    setStats({ red, yellow, green, faultRate })

    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    setFaultSeries(prev => {
      const next = [...prev, { t: now, faults: faultsInBatch, total: batch.length }]
      return next.length > 40 ? next.slice(-40) : next
    })

    const newEvents: TrafficEvent[] = batch.slice(-20).map((d, i) => ({
      id:     `${Date.now()}-${i}`,
      status: d.status as TrafficEvent['status'],
      fault:  d.fault,
      t:      now,
    }))

    setEvents(prev => {
      const next = [...newEvents, ...prev]
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
    })
  }, [])

  useEffect(() => {
    setOnMessage(msg => {
      if (msg.channel !== 'city.traffic_lights') return
      const d = msg.data as any
      pendingRef.current.push({
        status: d.status         ?? 'red',
        fault:  d.is_malfunctioning ?? false,
        lamp:   d.lamp_id        ?? '',
      })
      if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_MS)
    })
  }, [setOnMessage, flush])

  const greenPct = stats.red + stats.yellow + stats.green > 0
    ? Math.round(stats.green / (stats.red + stats.yellow + stats.green) * 100)
    : 0

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-5"
      style={{ background: 'linear-gradient(160deg,#080a0f 0%,#0f0d0a 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-amber-300">Trafik Işıkları</h2>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-0.5">Anlık · Canlı Durum</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest
          ${connected ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Canlı' : 'Bağlantı Yok'}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Yeşil',      value: stats.green,    color: '#22c55e', unit: 'lamba'  },
          { label: 'Kırmızı',   value: stats.red,      color: '#ef4444', unit: 'lamba'  },
          { label: 'Sarı',       value: stats.yellow,   color: '#f59e0b', unit: 'lamba'  },
          { label: 'Arıza Oranı', value: `%${stats.faultRate}`, color: '#f97316', unit: 'oran' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 border"
            style={{ background: `${s.color}08`, borderColor: `${s.color}20` }}>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-3xl font-black leading-none tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[8px] text-slate-700 mt-1">{s.unit}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="rounded-2xl border border-white/5 p-5 flex flex-col" style={{ background: '#0d0f1a' }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Durum Dağılımı</p>
          <div className="flex-1 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pie}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {pie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} opacity={0.9} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, fontSize: 11 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: '#64748b', fontSize: 10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
            {/* Merkez yazı */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: 28 }}>
              <div className="text-center">
                <p className="text-2xl font-black text-green-400 leading-none">{greenPct}%</p>
                <p className="text-[8px] text-slate-600 uppercase">yeşil</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fault bar chart */}
        <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#0d0f1a' }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Anlık Arıza Sayısı</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={faultSeries} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="t" tick={{ fill: AXIS, fontSize: 9 }} interval={7} />
              <YAxis tick={{ fill: AXIS, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="faults" fill="#f97316" radius={[3, 3, 0, 0]} name="Arıza" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Event timeline */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#0d0f1a' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Son Olaylar</p>
          <span className="text-[9px] font-mono text-slate-700">{msgCount.toLocaleString()} toplam</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {events.slice(0, 60).map(e => (
            <div
              key={e.id}
              title={`${e.status} · ${e.t}${e.fault ? ' · ARIZALI' : ''}`}
              className="w-4 h-4 rounded-sm transition-all"
              style={{
                background: STATUS_COLOR[e.status] ?? '#334155',
                opacity:    e.fault ? 1 : 0.7,
                boxShadow:  e.fault ? `0 0 6px ${STATUS_COLOR[e.status]}` : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
