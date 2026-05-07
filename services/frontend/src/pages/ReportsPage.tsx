import { useEffect, useRef, useState } from 'react'
import { getDensity, getTrafficLights, getSpeedViolations, getAirQuality } from '../api/endpoints'

type ReportType = 'density' | 'traffic' | 'violations' | 'air_quality'

const REPORT_CONFIG = {
  density: {
    label: 'Arac Yogunlugu',
    code: 'DEN',
    color: 'text-primary',
    border: 'border-primary/40',
    bg: 'bg-primary/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'avg_vehicles', label: 'Ort. Arac' },
      { key: 'avg_pedestrians', label: 'Ort. Yaya' },
      { key: 'avg_speed', label: 'Ort. Hiz (km/h)' },
    ],
  },
  traffic: {
    label: 'Trafik Lambasi',
    code: 'TRF',
    color: 'text-warning',
    border: 'border-warning/40',
    bg: 'bg-warning/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'total_lamps', label: 'Toplam Lamba' },
      { key: 'malfunction_count', label: 'Ariza Sayisi' },
      { key: 'malfunction_rate', label: 'Ariza Orani' },
    ],
  },
  violations: {
    label: 'Hiz Ihlalleri',
    code: 'SPD',
    color: 'text-danger',
    border: 'border-danger/40',
    bg: 'bg-danger/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'violation_count', label: 'Ihlal Sayisi' },
      { key: 'avg_speed', label: 'Ort. Hiz (km/h)' },
      { key: 'max_speed', label: 'Max Hiz (km/h)' },
    ],
  },
  air_quality: {
    label: 'Hava Kalitesi',
    code: 'AIR',
    color: 'text-success',
    border: 'border-success/40',
    bg: 'bg-success/10',
    columns: [
      { key: 'ds', label: 'Tarih' },
      { key: 'avg_co2', label: 'Ort. CO2' },
      { key: 'avg_no2', label: 'Ort. NO2' },
      { key: 'avg_aqi', label: 'Ort. AQI' },
      { key: 'avg_temp', label: 'Ort. Sicaklik (C)' },
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
      setError('Veriler yuklenemedi. Analytics servisi calisiyor mu?')
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
        return val ?? '-'
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
          body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          p { font-size: 12px; color: #666; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #111418; color: white; padding: 10px 12px; text-align: left; }
          td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) td { background: #f9fafb; }
          .footer { margin-top: 24px; font-size: 10px; color: #777; }
        </style>
      </head>
      <body>
        <h1>${config.label} Raporu</h1>
        <p>Son ${days} gun - UrbanStream Kentsel Veri Analitigi - ${new Date().toLocaleDateString('tr-TR')}</p>
        <table>
          <thead>
            <tr>${config.columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map((row) => `
              <tr>${config.columns.map((c) => {
                const val = row[c.key]
                return `<td>${typeof val === 'number' ? val.toFixed(2) : (val ?? '-')}</td>`
              }).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">Toplam ${data.length} kayit - Olusturulma: ${new Date().toLocaleString('tr-TR')}</div>
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
    <div className="p-8 bg-dark-900 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Raporlar</h1>
          <p className="text-slate-500 mt-1">ClickHouse verilerinden analitik raporlar</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="bg-dark-700 hover:bg-dark-600 border border-dark-600 text-slate-300 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
          >
            CSV Indir
          </button>
          <button
            onClick={handleExportPDF}
            disabled={data.length === 0}
            className="bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
          >
            PDF / Yazdir
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(Object.keys(REPORT_CONFIG) as ReportType[]).map((type) => {
          const c = REPORT_CONFIG[type]
          return (
            <button
              key={type}
              onClick={() => setActiveReport(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                activeReport === type
                  ? `${c.bg} ${c.border} ${c.color}`
                  : 'bg-dark-800 border-dark-600 text-slate-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <span className="text-[10px] font-bold tracking-wider">{c.code}</span>
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm text-slate-400">Zaman Araligi:</span>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                days === d
                  ? 'bg-primary/10 border-primary/40 text-white'
                  : 'bg-dark-800 border-dark-600 text-slate-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              {d} gun
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {data.length} kayit
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 animate-pulse">Yukleniyor...</div>
        </div>
      ) : error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-md px-4 py-4 text-danger text-sm">
          {error}
        </div>
      ) : (
        <div ref={tableRef} className="bg-dark-800 rounded-md border border-dark-600 overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600 bg-dark-700/60">
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
                      Veri bulunamadi
                    </td>
                  </tr>
                ) : (
                  data.map((row, i) => (
                    <tr key={i} className="hover:bg-dark-700/45 transition-colors">
                      {config.columns.map((col) => {
                        const val = row[col.key]
                        return (
                          <td key={col.key} className="px-6 py-3 text-sm text-slate-300">
                            {col.key === 'ds'
                              ? String(val ?? '-').slice(0, 10)
                              : col.key.includes('rate')
                              ? `%${(Number(val) * 100).toFixed(2)}`
                              : typeof val === 'number'
                              ? val.toFixed(2)
                              : val ?? '-'}
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
