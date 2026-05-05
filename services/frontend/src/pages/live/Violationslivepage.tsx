// live/ViolationsLivePage.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useMqtt } from '../../hooks/useMqtt'

const FLUSH_MS   = 250
const MAX_POINTS = 60

interface SpeedPoint { t: string; speed: number; avg: number }
interface BucketData { label: string; count: number; color: string }

const BUCKETS: { label: string; min: number; max: number; color: string }[] = [
  { label: '50–70',  min: 50,  max: 70,  color: '#f59e0b' },
  { label: '70–90',  min: 70,  max: 90,  color: '#f97316' },
  { label: '90–120', min: 90,  max: 120, color: '#ef4444' },
  { label: '>120',   min: 120, max: Infinity, color: '#dc2626' },
]

const GRID = '#1a1d2e'
const AXIS = '#3f4460'

export default function ViolationsLivePage() {
  const { connected, setOnMessage } = useMqtt(['city/konya/speed_violations'])

  const pendingRef  = useRef<{ speed: number }[]>([])
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bucketsRef  = useRef<number[]>([0, 0, 0, 0])
  const totalRef    = useRef(0)
  const criticalRef = useRef(0)
  const maxRef      = useRef(0)
  const sumRef      = useRef(0)
  const countRef    = useRef(0)

  const [series,   setSeries  ] = useState<SpeedPoint[]>([])
  const [buckets,  setBuckets ] = useState<BucketData[]>(BUCKETS.map(b => ({ label: b.label, count: 0, color: b.color })))
  const [stats,    setStats   ] = useState({ total: 0, critical: 0, max: 0, avg: 0 })
  const [msgCount, setMsgCount] = useState(0)

  const flush = useCallback(() => {
    timerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (!batch.length) return

    countRef.current += batch.length
    setMsgCount(countRef.current)

    let batchMax = 0
    batch.forEach(({ speed }) => {
      totalRef.current++
      sumRef.current += speed
      if (speed > 120) criticalRef.current++
      if (speed > maxRef.current) maxRef.current = speed
      if (speed > batchMax) batchMax = speed

      const bi = BUCKETS.findIndex(b => speed >= b.min && speed < b.max)
      if (bi >= 0) bucketsRef.current[bi]++
    })

    const avgSpeed = parseFloat((sumRef.current / totalRef.current).toFixed(1))
    const batchAvg = parseFloat((batch.reduce((s, d) => s + d.speed, 0) / batch.length).toFixed(1))
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    setSeries(prev => {
      const next = [...prev, { t: now, speed: batchMax, avg: batchAvg }]
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
    })

    setBuckets(BUCKETS.map((b, i) => ({ label: b.label, count: bucketsRef.current[i], color: b.color })))

    setStats({
      total:    totalRef.current,
      critical: criticalRef.current,
      max:      maxRef.current,
      avg:      avgSpeed,
    })
  }, [])

  useEffect(() => {
    setOnMessage(msg => {
      if (msg.channel !== 'city.speed_violations') return
      const d = msg.data as any
      pendingRef.current.push({ speed: d.speed ?? 0 })
      if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_MS)
    })
  }, [setOnMessage, flush])

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-5"
      style={{ background: 'linear-gradient(160deg,#080a0f 0%,#100808 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-red-400">Hız İhlalleri</h2>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-0.5">Anlık · Radar Verisi</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest
          ${connected ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-red-400 animate-pulse' : 'bg-slate-400'}`} />
          {connected ? 'Canlı' : 'Bağlantı Yok'}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Toplam İhlal', value: stats.total.toLocaleString('tr-TR'), color: '#ef4444', unit: 'ihlal' },
          { label: 'Kritik >120', value: stats.critical.toLocaleString('tr-TR'), color: '#dc2626', unit: 'araç' },
          { label: 'Max Hız',     value: stats.max,  color: '#f97316', unit: 'km/h' },
          { label: 'Ort. Hız',    value: stats.avg,  color: '#f59e0b', unit: 'km/h' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 border"
            style={{ background: `${s.color}08`, borderColor: `${s.color}20` }}>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-3xl font-black leading-none tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[8px] text-slate-700 mt-1">{s.unit}</p>
          </div>
        ))}
      </div>

      {/* Speed area chart */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#0d0f1a' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Anlık Hız (max & ortalama)</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="gMax" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="t" tick={{ fill: AXIS, fontSize: 9 }} interval={9} />
            <YAxis tick={{ fill: AXIS, fontSize: 9 }} unit=" km/h" />
            <Tooltip
              contentStyle={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#64748b' }}
            />
            <Area type="monotone" dataKey="speed" stroke="#ef4444" fill="url(#gMax)" strokeWidth={2} dot={false} name="Max" isAnimationActive={false} />
            <Area type="monotone" dataKey="avg"   stroke="#f59e0b" fill="url(#gAvg)" strokeWidth={1.5} dot={false} name="Ort." isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Histogram */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#0d0f1a' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Hız Dağılımı (km/h)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} />
            <YAxis tick={{ fill: AXIS, fontSize: 9 }} />
            <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2235', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="count" name="İhlal" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {buckets.map((b, i) => (
                <Cell key={i} fill={b.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
