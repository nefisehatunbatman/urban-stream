// live/ViolationsLivePage.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useMqtt } from '../../hooks/useMqtt'

const FLUSH_MS   = 250
const MAX_POINTS = 60

interface SpeedPoint {
  t: string
  speed: number
  avg: number
  criticalRate: number
  violations: number
  criticalCount: number
}
interface BucketData { label: string; count: number; color: string }

const BUCKETS: { label: string; min: number; max: number; color: string }[] = [
  { label: '50–70',  min: 50,  max: 70,  color: '#f59e0b' },
  { label: '70–90',  min: 70,  max: 90,  color: '#f97316' },
  { label: '90–120', min: 90,  max: 120, color: '#ef4444' },
  { label: '>120',   min: 120, max: Infinity, color: '#dc2626' },
]

const GRID = '#1c1c1c'
const AXIS = '#5f6368'
const MIN_GAUGE = 50
const MAX_GAUGE = 140

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = (Math.PI / 180) * startDeg
  const e = (Math.PI / 180) * endDeg
  const x1 = cx + r * Math.cos(s)
  const y1 = cy - r * Math.sin(s)
  const x2 = cx + r * Math.cos(e)
  const y2 = cy - r * Math.sin(e)
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
}

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
  const [lastViolationSpeed, setLastViolationSpeed] = useState(0)
  const [displayedSpeed, setDisplayedSpeed] = useState(MIN_GAUGE)
  const gaugeValue = Math.max(MIN_GAUGE, Math.min(MAX_GAUGE, displayedSpeed))
  const gaugeRatio = Math.max(0, Math.min(1, (gaugeValue - MIN_GAUGE) / (MAX_GAUGE - MIN_GAUGE)))
  const needleDeg = 180 - gaugeRatio * 180
  const needleRad = (Math.PI / 180) * needleDeg
  const needleX = 120 + 76 * Math.cos(needleRad)
  const needleY = 120 - 76 * Math.sin(needleRad)

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayedSpeed(prev => {
        const target = Math.max(MIN_GAUGE, Math.min(MAX_GAUGE, lastViolationSpeed || MIN_GAUGE))
        const next = prev + (target - prev) * 0.18
        return Math.abs(target - next) < 0.2 ? target : next
      })
    }, 60)
    return () => clearInterval(id)
  }, [lastViolationSpeed])

  const flush = useCallback(() => {
    timerRef.current = null
    const batch = pendingRef.current.splice(0)
    if (!batch.length) return

    countRef.current += batch.length
    setMsgCount(countRef.current)

    let batchMax = 0
    let batchCritical = 0
    batch.forEach(({ speed }) => {
      totalRef.current++
      sumRef.current += speed
      if (speed > 120) {
        criticalRef.current++
        batchCritical++
      }
      if (speed > maxRef.current) maxRef.current = speed
      if (speed > batchMax) batchMax = speed

      const bi = BUCKETS.findIndex(b => speed >= b.min && speed < b.max)
      if (bi >= 0) bucketsRef.current[bi]++
    })

    const avgSpeed = parseFloat((sumRef.current / totalRef.current).toFixed(1))
    const batchAvg = parseFloat((batch.reduce((s, d) => s + d.speed, 0) / batch.length).toFixed(1))
    const batchCriticalRate = batchCritical / batch.length
    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    setSeries(prev => {
      const next = [...prev, {
        t: now,
        speed: batchMax,
        avg: batchAvg,
        criticalRate: batchCriticalRate,
        violations: batch.length,
        criticalCount: batchCritical,
      }]
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
      const incomingSpeed = d.speed ?? 0
      setLastViolationSpeed(incomingSpeed)
      pendingRef.current.push({ speed: incomingSpeed })
      if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_MS)
    })
  }, [setOnMessage, flush])

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-5"
      style={{ background: 'linear-gradient(160deg,#000000 0%,#050505 100%)' }}>

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

      {/* Speed trend chart */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#090909' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Anlık Hız Trendi (Maks & Ortalama)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="t" tick={{ fill: AXIS, fontSize: 9 }} interval={9} />
            <YAxis tick={{ fill: AXIS, fontSize: 9 }} unit=" km/h" />
            <Tooltip
              contentStyle={{ background: '#0b0b0b', border: '1px solid #1f1f1f', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#64748b' }}
            />
            <Line
              type="stepAfter"
              dataKey="speed"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              name="Maksimum"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 2, fill: '#f59e0b', stroke: '#0b0b0b', strokeWidth: 1 }}
              name="Ortalama"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* İbre göstergesi */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: '#090909' }}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Son Gelen İhlal Hızı</p>
        <div className="flex items-center justify-center">
          <svg viewBox="0 0 240 140" className="w-full max-w-[280px]">
            <path d={arcPath(120, 120, 84, 180, 120)} stroke="#22c55e" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d={arcPath(120, 120, 84, 120, 60)} stroke="#f59e0b" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d={arcPath(120, 120, 84, 60, 0)} stroke="#ef4444" strokeWidth="12" fill="none" strokeLinecap="round" />
            <line x1="120" y1="120" x2={needleX} y2={needleY} stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
            <circle cx="120" cy="120" r="5" fill="#f8fafc" />
            <text x="120" y="102" textAnchor="middle" fill="#f59e0b" fontSize="16" fontWeight="700">
              {displayedSpeed.toFixed(1)} km/h
            </text>
            <text x="36" y="126" textAnchor="middle" fill="#6b7280" fontSize="9">{MIN_GAUGE}</text>
            <text x="120" y="34" textAnchor="middle" fill="#6b7280" fontSize="9">95</text>
            <text x="204" y="126" textAnchor="middle" fill="#6b7280" fontSize="9">{MAX_GAUGE}</text>
          </svg>
        </div>
        <div className="mt-1 text-center text-[10px] text-slate-500">
          Son veri: {lastViolationSpeed.toFixed(1)} km/h · İbre akıcı geçişle güncellenir.
        </div>
      </div>
    </div>
  )
}
