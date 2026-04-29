// NavBar.tsx
import { memo } from 'react'

type Page = 'traffic-lights' | 'density' | 'violations'

interface NavBarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const PAGES: { id: Page; icon: string; label: string; color: string; dot: string }[] = [
  { id: 'traffic-lights', icon: '🚦', label: 'Trafik Işıkları',  color: '#6366f1', dot: 'bg-indigo-500' },
  { id: 'density',        icon: '🌡',  label: 'Araç Yoğunluğu', color: '#f97316', dot: 'bg-orange-500' },
  { id: 'violations',     icon: '⚡',  label: 'Hız İhlalleri',  color: '#ef4444', dot: 'bg-red-500'    },
]

export const NavBar = memo(({ currentPage, onNavigate }: NavBarProps) => (
  <nav className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1
                  bg-[#111318]/95 backdrop-blur-md border border-white/8 rounded-2xl p-1.5 shadow-2xl">
    {PAGES.map(p => (
      <button
        key={p.id}
        onClick={() => onNavigate(p.id)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 text-left"
        style={{
          background:  currentPage === p.id ? `${p.color}20` : 'transparent',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: currentPage === p.id ? `${p.color}50` : 'transparent',
        }}
      >
        <span className="text-[13px]">{p.icon}</span>
        <span
          className="text-[10px] font-bold tracking-wide whitespace-nowrap"
          style={{ color: currentPage === p.id ? p.color : '#64748b' }}
        >
          {p.label}
        </span>
        {currentPage === p.id && (
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
          />
        )}
      </button>
    ))}
  </nav>
))
