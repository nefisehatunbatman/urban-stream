interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  color?: string
}

export default function StatCard({ title, value, subtitle, icon, color = 'text-primary' }: StatCardProps) {
  return (
    <div className="bg-dark-800 rounded-xl p-5 border border-dark-600">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  )
}
