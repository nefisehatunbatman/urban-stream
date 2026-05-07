import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../api/endpoints'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(email, password, fullName)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error || 'Kayıt başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">UrbanStream</h1>
          <p className="text-slate-400 mt-2">Kentsel Veri Analitiği Platformu</p>
        </div>

        <div className="bg-dark-800 rounded-md p-8 border border-dark-600 shadow-[0_18px_38px_rgba(0,0,0,0.3)]">
          <h2 className="text-xl font-semibold text-white mb-6">Hesap Oluştur</h2>

          {success ? (
            <div className="bg-success/10 border border-success/30 rounded-md px-4 py-4 text-success text-sm text-center">
              Kayıt başarılı. Giriş sayfasına yönlendiriliyorsunuz...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ad Soyad</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-md px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                  placeholder="Ali Veli"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-md px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                  placeholder="ornek@mail.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-md px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                  placeholder="En az 6 karakter"
                  required
                  minLength={6}
                />
              </div>

              <p className="text-xs text-slate-500">
                * Yeni hesaplar varsayılan olarak <span className="text-slate-400 font-medium">Viewer</span> rolüyle oluşturulur. Yetki değişikliği için yöneticinize başvurun.
              </p>

              {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-md px-4 py-3 text-danger text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white font-medium py-3 rounded-md transition-colors disabled:opacity-50"
              >
                {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            Zaten hesabın var mı?{' '}
            <Link to="/login" className="text-primary hover:text-accent transition-colors">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
