// MapPage.tsx  ←  Artık sadece sayfa yönlendirici (router shell)
// Her kanal için ayrı sayfa bileşeni kullanılır:
//   /traffic-lights  →  TrafficLightsPage
//   /density         →  DensityPage
//   /violations      →  ViolationsPage

import { useState } from 'react'
import TrafficLightsPage from './TrafficLightsPage'
import DensityPage       from './DensityPage'
import ViolationsPage    from './ViolationsPage'

type Page = 'traffic-lights' | 'density' | 'violations'

export default function MapPage() {
  // Varsayılan sayfa: trafik ışıkları
  const [currentPage, setCurrentPage] = useState<Page>('traffic-lights')

  switch (currentPage) {
    case 'traffic-lights':
      return <TrafficLightsPage onNavigate={setCurrentPage} />
    case 'density':
      return <DensityPage onNavigate={setCurrentPage} />
    case 'violations':
      return <ViolationsPage onNavigate={setCurrentPage} />
    default:
      return <TrafficLightsPage onNavigate={setCurrentPage} />
  }
}
