// LivePage.tsx — mount-once container, MapPage pattern
import { useState } from 'react'
import DensityLivePage    from './live/DensityLivePage'
import TrafficLivePage    from './live/TrafficLivePage'
import ViolationsLivePage from './live/ViolationsLivePage'

type Tab = 'density' | 'traffic' | 'violations'
const ALL_TABS: Tab[] = ['density', 'traffic', 'violations']

const TAB_META: Record<Tab, { label: string; color: string; accent: string }> = {
  density:    { label: 'Araç Yoğunluğu',  color: '#6366f1', accent: '#818cf8' },
  traffic:    { label: 'Trafik Işıkları', color: '#f59e0b', accent: '#fcd34d' },
  violations: { label: 'Hız İhlalleri',   color: '#ef4444', accent: '#f87171' },
}

export default function LivePage() {
  const [active, setActive]   = useState<Tab>('density')
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['density']))

  const navigate = (tab: Tab) => {
    setVisited(prev => prev.has(tab) ? prev : new Set([...prev, tab]))
    setActive(tab)
  }

  return (
    <div className="flex flex-col h-full bg-[#080a0f] text-white overflow-hidden">
      {/* Top nav */}
      <div className="shrink-0 flex items-center gap-1 px-6 pt-5 pb-0">
        {ALL_TABS.map(tab => {
          const m = TAB_META[tab]
          const isActive = active === tab
          return (
            <button
              key={tab}
              onClick={() => navigate(tab)}
              className="relative px-5 py-2.5 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all duration-200"
              style={{
                background:  isActive ? `${m.color}18` : 'transparent',
                color:       isActive ? m.accent : '#475569',
                border:      `1px solid ${isActive ? `${m.color}40` : 'transparent'}`,
              }}
            >
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
                />
              )}
              {tab === 'density' ? '◈' : tab === 'traffic' ? '◉' : '◆'}&nbsp;&nbsp;{m.label}
            </button>
          )
        })}
      </div>

      {/* Pages */}
      <div className="flex-1 overflow-hidden relative">
        {ALL_TABS.map(tab => (
          <div
            key={tab}
            className="absolute inset-0"
            style={{ display: active === tab ? 'block' : 'none' }}
          >
            {visited.has(tab) && (
              tab === 'density'    ? <DensityLivePage /> :
              tab === 'traffic'   ? <TrafficLivePage /> :
                                    <ViolationsLivePage />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
