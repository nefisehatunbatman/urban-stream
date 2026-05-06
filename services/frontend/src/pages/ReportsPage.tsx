import { useEffect, useRef, useState } from 'react'
import { getDensity, getTrafficLights, getSpeedViolations, getAirQuality } from '../api/endpoints'

type ReportType = 'density' | 'traffic' | 'violations' | 'air_quality'

const REPORT_CONFIG = {
  density: {
    label: 'Araç Yoğunluğu',
    icon: '🚗',
    color: 'text-indigo-400',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'avg_vehicles', label: 'Ort. Araç' },
      { key: 'avg_pedestrians', label: 'Ort. Yaya' },
      { key: 'avg_speed', label: 'Ort. Hız (km/h)' },
    ],
  },
  traffic: {
    label: 'Trafik Lambası',
    icon: '🚦',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'total_lamps', label: 'Toplam Lamba' },
      { key: 'malfunction_count', label: 'Arıza Sayısı' },
      { key: 'malfunction_rate', label: 'Arıza Oranı' },
    ],
  },
  violations: {
    label: 'Hız İhlalleri',
    icon: '⚡',
    color: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'violation_count', label: 'İhlal Sayısı' },
      { key: 'avg_speed', label: 'Ort. Hız (km/h)' },
      { key: 'max_speed', label: 'Max Hız (km/h)' },
    ],
  },
  air_quality: {
    label: 'Hava Kalitesi',
    icon: '🌿',
    color: 'text-green-400',
    border: 'border-green-500/30',
    bg: 'bg-green-500/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'avg_co2', label: 'Ort. CO₂' },
      { key: 'avg_no2', label: 'Ort. NO₂' },
      { key: 'avg_aqi', label: 'Ort. AQI' },
      { key: 'avg_temp', label: 'Ort. Sıcaklık (°C)' },
    ],
  },
}

const DAY_OPTIONS = [7, 14, 30, 60, 90]

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('density')
  const [days, setDays] = useState(30)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLDivElement>(null)

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    try {
      let res
      if (activeReport === 'density') res = await getDensity(days)
      else if (activeReport === 'traffic') res = await getTrafficLights(days)
      else if (activeReport === 'violations') res = await getSpeedViolations(days)
      else res = await getAirQuality(days)
      setData(res.data.data || [])
    } catch {
      setError('Veriler yüklenemedi. Analytics servisi çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
  }, [activeReport, days])

  const handleExportCSV = () => {
    const config = REPORT_CONFIG[activeReport]
    const headers = config.columns.map((c) => c.label).join(',')
    const rows = data.map((row) =>
      config.columns.map((c) => {
        const val = row[c.key]
        if (typeof val === 'number') return val.toFixed(2)
        return val ?? '—'
      }).join(',')
    )
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeReport}_${days}gun_raporu.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => {
    const config = REPORT_CONFIG[activeReport]
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${config.label} Raporu</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a2e; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p { font-size: 12px; color: #666; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1a1a2e; color: white; padding: 10px 12px; text-align: left; }
          td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) td { background: #f9fafb; }
          .footer { margin-top: 24px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>${config.icon} ${config.label} Raporu</h1>
        <p>Son ${days} gün · UrbanStream Kentsel Veri Analitiği · ${new Date().toLocaleDateString('tr-TR')}</p>
        <table>
          <thead>
            <tr>${config.columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map((row) => `
              <tr>${config.columns.map((c) => {
                const val = row[c.key]
                return `<td>${typeof val === 'number' ? val.toFixed(2) : (val ?? '—')}</td>`
              }).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">Toplam ${data.length} kayıt · Oluşturulma: ${new Date().toLocaleString('tr-TR')}</div>
      </body>
      </html>
    `
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(printContent)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const config = REPORT_CONFIG[activeReport]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Raporlar</h1>
          <p className="text-slate-400 mt-1">ClickHouse verilerinden analitik raporlar</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            📥 CSV İndir
          </button>
          <button
            onClick={handleExportPDF}
            disabled={data.length === 0}
            className="flex items-center gap-2 bg-primary hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            🖨️ PDF / Yazdır
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(Object.keys(REPORT_CONFIG) as ReportType[]).map((type) => {
          const c = REPORT_CONFIG[type]
          return (
            <button
              key={type}
              onClick={() => setActiveReport(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                activeReport === type
                  ? `${c.bg} ${c.border} ${c.color}`
                  : 'bg-dark-700 border-dark-600 text-slate-400 hover:text-white'
              }`}
            >
              <span>{c.icon}</span>
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm text-slate-400">Zaman Aralığı:</span>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                days === d
                  ? 'bg-primary text-white'
                  : 'bg-dark-700 text-slate-400 hover:text-white'
              }`}
            >
              {d} gün
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {data.length} kayıt
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 animate-pulse">Yükleniyor...</div>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-4 text-red-400 text-sm">
          {error}
        </div>
      ) : (
        <div ref={tableRef} className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  {config.columns.map((col) => (
                    <th
                      key={col.key}
                      className="text-left text-xs text-slate-400 font-medium px-6 py-4 uppercase tracking-wider"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={config.columns.length}
                      className="text-center text-slate-500 py-16"
                    >
                      Veri bulunamadı
                    </td>
                  </tr>
                ) : (
                  data.map((row, i) => (
                    <tr key={i} className="hover:bg-dark-700/40 transition-colors">
                      {config.columns.map((col) => {
                        const val = row[col.key]
                        return (
                          <td key={col.key} className="px-6 py-3 text-sm text-slate-300">
                            {col.key === 'ds'
                              ? String(val ?? '—').slice(0, 10)
                              : col.key.includes('rate')
                              ? `%${(Number(val) * 100).toFixed(2)}`
                              : typeof val === 'number'
                              ? val.toFixed(2)
                              : val ?? '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
