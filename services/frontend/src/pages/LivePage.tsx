import { useWebSocket } from '../hooks/useWebSocket'

const channelColors: Record<string, string> = {
  'city.density': 'text-indigo-400',
  'city.traffic_lights': 'text-yellow-400',
  'city.speed_violations': 'text-red-400',
}

const channelLabels: Record<string, string> = {
  'city.density': '🚗 Yoğunluk',
  'city.traffic_lights': '🚦 Trafik Lambası',
  'city.speed_violations': '⚠️ Hız İhlali',
}

export default function LivePage() {
  const { messages, connected } = useWebSocket()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Canlı Akış</h1>
          <p className="text-slate-400 text-sm mt-1">Kafka'dan gelen gerçek zamanlı veriler</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'Bağlı' : 'Bağlantı Kesildi'}
        </div>
      </div>

      {/* Kanal sayaçları */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(channelLabels).map(([channel, label]) => {
          const count = messages.filter(m => m.channel === channel).length
          return (
            <div key={channel} className="bg-dark-800 rounded-xl p-4 border border-dark-600">
              <p className="text-slate-400 text-sm">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${channelColors[channel]}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-1">son 100 mesajda</p>
            </div>
          )
        })}
      </div>

      {/* Mesaj akışı */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
          <h3 className="text-white font-medium">Veri Akışı</h3>
          <span className="text-slate-500 text-xs">{messages.length} mesaj</span>
        </div>
        <div className="overflow-auto max-h-[60vh] p-4 space-y-2 font-mono text-xs">
          {messages.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              {connected ? 'Veri bekleniyor...' : 'WebSocket bağlantısı kuruluyor...'}
            </p>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
              >
                <span className={`shrink-0 font-semibold ${channelColors[msg.channel] || 'text-slate-400'}`}>
                  {channelLabels[msg.channel] || msg.channel}
                </span>
                <span className="text-slate-300 break-all">
                  {JSON.stringify(msg.data)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
