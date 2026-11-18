import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { PinPad } from './PinPad'

export function AuthorizeModal({
  open,
  title,
  hint,
  requirePin,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  hint?: string
  requirePin?: boolean
  onClose: () => void
  onConfirm: (reason: string, pin: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason('')
    setPin('')
    setError('')
    setBusy(false)
  }, [open])

  async function submit() {
    if (reason.trim().length < 3) {
      setError('Descreva o motivo com pelo menos 3 letras')
      return
    }
    if (requirePin && pin.length < 4) {
      setError('Informe o PIN do administrador')
      return
    }
    try {
      setBusy(true)
      setError('')
      await onConfirm(reason.trim(), pin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não autorizado')
      setPin('')
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        {hint && <p className="text-sm text-slate-600">{hint}</p>}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 180))}
          className="w-full rounded-xl border border-slate-200 px-3 py-3"
          rows={2}
          placeholder="Motivo"
          maxLength={180}
        />
        {requirePin && <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} />}
        {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="touch-btn w-full bg-slate-900 text-white disabled:opacity-50"
        >
          {busy ? 'Verificando...' : 'Confirmar'}
        </button>
      </div>
    </Modal>
  )
}
