import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import {
  getDensity, getTrafficLights, getSpeedViolations, getPredictions
} from '../api/endpoints'

// ClickHouse "2026-05-07 08:00:00" veya "2026-05-07T08:00:00" gönderir
// Tarayıcı T'li string'i LOCAL time olarak parse eder → UTC+3'te 00:00 → 03:00 görünür
// Bu yüzden Date objesine çevirmeden string'i parse ediyoruz

const parseDs = (v: string) => {
  // "2026-05-07 03:00:00" veya "2026-05-07T03:00:00" → { month, day, hour, minute }
  const s = v.replace('T', ' ')
  const [datePart, timePart = '00:00:00'] = s.split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  return { year, month, day, hour, minute }
}

// X ekseni — 00:00'da "05-07 00:00", diğerlerinde "06:00" / "12:00" / "18:00"
const formatHourlyTick = (v: string) => {
  const { month, day, hour } = parseDs(v)
  const hh = String(hour).padStart(2, '0')
  if (hour === 0) {
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return `${hh}:00`
}

// Tooltip — "07/05 03:00"
const formatHourlyTooltip = (v: string) => {
  const { month, day, hour, minute } = parseDs(v)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// filterTo3Hour için saat bilgisi
const getDsHour = (v: string) => parseDs(v).hour

const getPredictionAxisTicks = (data: any[]) =>
  data
    .filter((d: any) => [0, 12].includes(getDsHour(d.ds)))
    .map((d: any) => d.ds)

const PredictionAxisTick = ({ x, y, payload }: any) => {
  const { month, day, hour } = parseDs(payload.value)
  const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
  const time = `${String(hour).padStart(2, '0')}:00`

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#9aa4ad" fontSize={10}>
        <tspan x="0" dy="0">{date}</tspan>
        <tspan x="0" dy="13" fill="#66717c">{time}</tspan>
      </text>
    </g>
  )
}

/**
 * Tahmin verisini 3 saatlik periyotlara filtreler:
 * Her gün için yalnızca 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 noktaları kalır.
 * Duplicate ds değerlerini de temizler.
 */
const filterTo3Hour = (data: any[]): any[] => {
  const seen = new Set<string>()
  return data.filter((d: any) => {
    const hour = getDsHour(d.ds)
    if (hour % 3 !== 0) return false
    if (seen.has(d.ds)) return false
    seen.add(d.ds)
    return true
  })
}

export default function DashboardPage() {
  const [density, setDensity] = useState<any[]>([])
  const [traffic, setTraffic] = useState<any[]>([])
  const [violations, setViolations] = useState<any[]>([])
  const [predictions, setPredictions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'density' | 'traffic' | 'violations'>('density')

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [d, t, v, p] = await Promise.all([
          getDensity(30),
          getTrafficLights(30),
          getSpeedViolations(30),
          getPredictions('density'),
        ])
        setDensity(d.data.data?.slice().reverse() || [])
        setTraffic(t.data.data?.slice().reverse() || [])
        setViolations(v.data.data?.slice().reverse() || [])
        // ← Burada filtrele: backend 3h yazsa da yazmasa da garantili
        setPredictions(filterTo3Hour(p.data.data || []))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const avgVehicles = density.length
    ? (density.reduce((s: number, d: any) => s + d.avg_vehicles, 0) / density.length).toFixed(0)
    : '-'
  const avgMalfunction = traffic.length
    ? (traffic.reduce((s: number, t: any) => s + t.malfunction_rate, 0) / traffic.length * 100).toFixed(1)
    : '-'
  const totalViolations = violations.reduce((s: number, v: any) => s + (v.violation_count || 0), 0)
  const maxSpeed = violations.length
    ? Math.max(...violations.map((v: any) => v.max_speed || 0)).toFixed(0)
    : '-'

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6 space-y-6">
        <div className="h-8 w-64 rounded skeleton" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="h-24 rounded-md skeleton" />
          <div className="h-24 rounded-md skeleton" />
          <div className="h-24 rounded-md skeleton" />
          <div className="h-24 rounded-md skeleton" />
        </div>
        <div className="h-80 rounded-md skeleton" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-black min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Son 30 günlük kentsel veri analizi</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Ort. Araç Yoğunluğu" value={avgVehicles} subtitle="Son 30 gün" />
        <StatCard title="Arıza Oranı" value={`%${avgMalfunction}`} subtitle="Trafik lambaları" color="text-warning" />
        <StatCard title="Toplam İhlal" value={totalViolations.toLocaleString()} subtitle="Hız ihlalleri" color="text-danger" />
        <StatCard title="En Yüksek Hız" value={`${maxSpeed} km/h`} subtitle="Kaydedilen max" color="text-accent" />
      </div>

      <div className="flex gap-2">
        {(['density', 'traffic', 'violations'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 border ${
              activeTab === tab
                ? 'bg-primary/10 border-primary/40 text-white'
                : 'bg-[#050505] border border-primary/25 text-slate-400 hover:text-white hover:bg-[#0a0a0a]'
            }`}
          >
            {tab === 'density' ? 'Yoğunluk' : tab === 'traffic' ? ' Trafik Lambası' : ' Hız İhlali'}
          </button>
        ))}
      </div>

      <div className="bg-[#050505] rounded-md p-5 border border-primary/30 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
        {activeTab === 'density' && (
          <>
            <h3 className="text-white font-medium mb-4">Günlük Araç Yoğunluğu</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={density}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252b31" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111418', border: '1px solid #252b31', borderRadius: 6 }} />
                <Legend />
                <Line type="monotone" dataKey="avg_vehicles" stroke="#22c55e" name="Ort. Araç" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg_pedestrians" stroke="#1fb981" name="Ort. Yaya" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {activeTab === 'traffic' && (
          <>
            <h3 className="text-white font-medium mb-4">Trafik Lambası Arıza Oranı</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={traffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252b31" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `%${(v * 100).toFixed(0)}`} />
                <Tooltip contentStyle={{ background: '#111418', border: '1px solid #252b31', borderRadius: 6 }} formatter={(v: any) => [`%${(v * 100).toFixed(2)}`, 'Arıza Oranı']} />
                <Bar dataKey="malfunction_rate" fill="#c8a73a" name="Arıza Oranı" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
        {activeTab === 'violations' && (
          <>
            <h3 className="text-white font-medium mb-4">Günlük Hız İhlalleri</h3>
          <ResponsiveContainer width="100%" height={300}>
              <BarChart data={violations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252b31" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111418', border: '1px solid #252b31', borderRadius: 6 }} />
                <Bar dataKey="violation_count" fill="#d95757" name="İhlal Sayısı" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {predictions.length > 0 && (
        <div className="bg-[#050505] rounded-md p-5 border border-primary/30 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
          <h3 className="text-white font-medium mb-1">Tahmin Paneli — Araç Yoğunluğu</h3>
          <p className="text-slate-500 text-xs mb-4">
            Gelen verilere göre üretilen 14 günlük projeksiyon — 3 saatlik periyotlar
            (00:00 · 03:00 · 06:00 · 09:00 · 12:00 · 15:00 · 18:00 · 21:00)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={predictions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#252b31" />
              <XAxis
                dataKey="ds"
                ticks={getPredictionAxisTicks(predictions)}
                tick={<PredictionAxisTick />}
                axisLine={{ stroke: '#252b31' }}
                tickLine={false}
                interval={0}
                height={38}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111418', border: '1px solid #252b31', borderRadius: 6 }}
                labelFormatter={formatHourlyTooltip}
              />
              <Legend />
              <Line type="monotone" dataKey="yhat" stroke="#22c55e" name="Tahmin" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="yhat_upper" stroke="#78b90099" name="Üst Sınır" dot={false} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="yhat_lower" stroke="#78b90099" name="Alt Sınır" dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
