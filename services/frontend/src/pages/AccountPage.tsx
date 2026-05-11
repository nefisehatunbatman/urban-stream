import { useState, useEffect } from 'react'
import { getMe, updateMe } from '../api/endpoints'
import { useAuthStore } from '../store/authStore'

export default function AccountPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [form, setForm] = useState({
    full_name: '',
    password: '',
  })
  const [message, setMessage] = useState({ text: '', type: '' })

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await getMe()
      setForm((prev) => ({
        ...prev,
        full_name: res.data?.data?.full_name || res.data?.full_name || '',
      }))
    } catch (error) {
      console.error(error)
      setMessage({ text: 'Profil bilgileri alınamadı.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setMessage({ text: '', type: '' })
    if (!form.full_name) {
      setMessage({ text: 'Ad Soyad zorunludur.', type: 'error' })
      return
    }

    setSaving(true)
    try {
      await updateMe(form.full_name, form.password)
      setMessage({ text: 'Profiliniz başarıyla güncellendi.', type: 'success' })
      setForm((prev) => ({ ...prev, password: '' })) // Şifre alanını temizle
    } catch (e: any) {
      setMessage({ text: e?.response?.data?.message || 'Güncelleme başarısız oldu.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 bg-black min-h-screen flex items-center justify-center">
        <div className="w-full max-w-lg">
          <div className="h-8 w-48 rounded skeleton mx-auto mb-6" />
          <div className="h-64 rounded-xl skeleton w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-black min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Hesabım</h1>
          <p className="text-slate-400 text-sm mt-1">Kişisel bilgilerinizi ve şifrenizi güncelleyebilirsiniz.</p>
        </div>

        <div className="bg-[#050505] border border-primary/20 rounded-2xl p-8 shadow-xl">
          <div className="space-y-5">
            {/* Email (Disabled) */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">E-posta Adresi (Değiştirilemez)</label>
            <input
              type="text"
              disabled
              value={user?.email || ''}
              className="w-full bg-[#0a0a0a] border border-slate-800 text-slate-500 text-sm rounded-lg px-3 py-2.5 cursor-not-allowed"
            />
          </div>

          {/* Ad Soyad */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Ad Soyad</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-[#0d0d0d] border border-primary/30 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Şifre */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Yeni Şifre</label>
            <input
              type="password"
              placeholder="Şifrenizi değiştirmek istemiyorsanız boş bırakın"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-[#0d0d0d] border border-primary/30 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary placeholder:text-slate-600 transition-colors"
            />
          </div>

          {/* Mesaj */}
          {message.text && (
            <div className={`text-xs px-3 py-2 rounded-lg ${message.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
              {message.text}
            </div>
          )}

          {/* Kaydet Butonu */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-black text-sm font-semibold px-4 py-3 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
