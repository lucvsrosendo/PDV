import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { PinPad } from '../components/PinPad'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const { user, locked, loginWithPin } = useAuth()
  const navigate = useNavigate()

  if (user && !locked) {
    return <Navigate to={user.role === 'cozinha' ? '/cozinha' : '/'} replace />
  }
  if (user && locked) return null

  async function submit() {
    try {
      setError('')
      const user = await loginWithPin(pin)
      navigate(user.role === 'cozinha' ? '/cozinha' : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
      setPin('')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <UtensilsCrossed size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">PDV Lanchonete</h1>
          <p className="mt-1 text-sm text-slate-500">Digite seu PIN. O teclado numérico também funciona.</p>
        </div>

        <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} />

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</div>
        )}
      </div>
    </div>
  )
}
