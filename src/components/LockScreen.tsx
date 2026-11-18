import { useState } from 'react'
import { Lock } from 'lucide-react'
import { PinPad } from './PinPad'
import { useAuth } from '../context/AuthContext'

export function LockScreen() {
  const { user, loginWithPin, logout } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    try {
      setError('')
      await loginWithPin(pin)
      setPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN inválido')
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Lock />
          </div>
          <h2 className="text-xl font-bold">Caixa bloqueado</h2>
          <p className="mt-1 text-sm text-slate-500">
            {user?.name}, digite o PIN para continuar. O pedido em tela é mantido.
          </p>
        </div>
        <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} />
        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</div>
        )}
        <button type="button" onClick={logout} className="mt-4 w-full text-sm font-semibold text-slate-500">
          Trocar operador
        </button>
      </div>
    </div>
  )
}
