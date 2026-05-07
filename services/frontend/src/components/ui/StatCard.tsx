interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  color?: string
}

export default function StatCard({ title, value, subtitle, icon, color = 'text-primary' }: StatCardProps) {
  return (
    <div className="bg-dark-800 rounded-md p-5 border border-dark-600 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <span className="text-xs font-bold text-slate-500">{icon}</span>}
      </div>
    </div>
  )
}
