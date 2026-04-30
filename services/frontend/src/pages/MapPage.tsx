// MapPage.tsx — mount-once pattern
// Her sayfa ilk ziyarette bir kez mount edilir, sonra CSS ile gizlenir.
// WebGL context sayısı sabit kalır (3 adet) → context leak olmaz.

import { useState } from 'react'
import TrafficLightsPage from './TrafficLightsPage'
import DensityPage       from './DensityPage'
import ViolationsPage    from './ViolationsPage'

type Page = 'traffic-lights' | 'density' | 'violations'

const ALL_PAGES: Page[] = ['traffic-lights', 'density', 'violations']

export default function MapPage() {
  const [currentPage, setCurrentPage] = useState<Page>('traffic-lights')
  // Ziyaret edilen sayfaları takip et — mount edilmemiş sayfayı DOM'a ekleme
  const [visited, setVisited] = useState<Set<Page>>(new Set(['traffic-lights']))

  const handleNavigate = (page: Page) => {
    setVisited(prev => {
      if (prev.has(page)) return prev          // zaten mount edilmiş, set değişmesin
      return new Set([...prev, page])
    })
    setCurrentPage(page)
  }

  return (
    <>
      {ALL_PAGES.map(page => (
        <div
          key={page}
          style={{
            display:  currentPage === page ? 'contents' : 'none',
            // 'contents' → wrapper div layout'u bozmaz, sayfa kendi flex/h-screen'ini korur
          }}
        >
          {visited.has(page) && (
            page === 'traffic-lights' ? <TrafficLightsPage onNavigate={handleNavigate} /> :
            page === 'density'        ? <DensityPage       onNavigate={handleNavigate} /> :
                                        <ViolationsPage    onNavigate={handleNavigate} />
          )}
        </div>
      ))}
    </>
  )
}
