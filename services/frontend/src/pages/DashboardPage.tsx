import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import StatCard from '../components/ui/StatCard'
import {
  getDensity, getTrafficLights, getSpeedViolations, getPredictions
} from '../api/endpoints'

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
        setPredictions(p.data.data || [])
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400 text-lg animate-pulse">Veriler yükleniyor...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Son 30 günlük kentsel veri analizi</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Ort. Araç Yoğunluğu" value={avgVehicles} subtitle="Son 30 gün" icon="🚗" />
        <StatCard title="Arıza Oranı" value={`%${avgMalfunction}`} subtitle="Trafik lambaları" icon="🚦" color="text-yellow-400" />
        <StatCard title="Toplam İhlal" value={totalViolations.toLocaleString()} subtitle="Hız ihlalleri" icon="⚠️" color="text-red-400" />
        <StatCard title="En Yüksek Hız" value={`${maxSpeed} km/h`} subtitle="Kaydedilen max" icon="💨" color="text-orange-400" />
      </div>

      <div className="flex gap-2">
        {(['density', 'traffic', 'violations'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-primary text-white' : 'bg-dark-700 text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'density' ? '🚗 Yoğunluk' : tab === 'traffic' ? '🚦 Trafik Lambası' : '⚠️ Hız İhlali'}
          </button>
        ))}
      </div>

      <div className="bg-dark-800 rounded-xl p-5 border border-dark-600">
        {activeTab === 'density' && (
          <>
            <h3 className="text-white font-medium mb-4">Günlük Araç Yoğunluğu</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={density}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2f3347" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2f3347', borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="avg_vehicles" stroke="#6366f1" name="Ort. Araç" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg_pedestrians" stroke="#22d3ee" name="Ort. Yaya" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {activeTab === 'traffic' && (
          <>
            <h3 className="text-white font-medium mb-4">Trafik Lambası Arıza Oranı</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={traffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2f3347" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `%${(v * 100).toFixed(0)}`} />
                <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2f3347', borderRadius: 8 }} formatter={(v: any) => [`%${(v * 100).toFixed(2)}`, 'Arıza Oranı']} />
                <Bar dataKey="malfunction_rate" fill="#f59e0b" name="Arıza Oranı" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
        {activeTab === 'violations' && (
          <>
            <h3 className="text-white font-medium mb-4">Günlük Hız İhlalleri</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={violations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2f3347" />
                <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2f3347', borderRadius: 8 }} />
                <Bar dataKey="violation_count" fill="#ef4444" name="İhlal Sayısı" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {predictions.length > 0 && (
        <div className="bg-dark-800 rounded-xl p-5 border border-dark-600">
          <h3 className="text-white font-medium mb-1">🤖 AI Tahminleri — Araç Yoğunluğu</h3>
          <p className="text-slate-500 text-xs mb-4">Prophet modeli ile üretilen 14 günlük projeksiyon</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={predictions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3347" />
              <XAxis dataKey="ds" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2f3347', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="yhat" stroke="#6366f1" name="Tahmin" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="yhat_upper" stroke="#6366f188" name="Üst Sınır" dot={false} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="yhat_lower" stroke="#6366f188" name="Alt Sınır" dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
