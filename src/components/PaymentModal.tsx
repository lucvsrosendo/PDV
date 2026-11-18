import { useEffect, useMemo, useState } from 'react'
import { Delete } from 'lucide-react'
import { Modal } from './Modal'
import type { PaymentLine, PaymentMethod } from '../types'
import { ALL_PAYMENT_METHODS } from '../services/orders'
import { PAYMENT_LABELS } from '../types'
import { money, roundMoney } from '../utils/money'

export function PaymentModal({
  open,
  total,
  onClose,
  onConfirm,
}: {
  open: boolean
  total: number
  onClose: () => void
  onConfirm: (payments: PaymentLine[]) => Promise<void> | void
}) {
  const [method, setMethod] = useState<PaymentMethod>('dinheiro')
  const [amount, setAmount] = useState('')
  const [payments, setPayments] = useState<PaymentLine[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPayments([])
      setMethod('dinheiro')
      setAmount(total.toFixed(2).replace('.', ''))
      setError('')
      setBusy(false)
    }
  }, [open, total])

  const typed = useMemo(() => centsToNumber(amount), [amount])
  const paid = useMemo(() => roundMoney(payments.reduce((s, p) => s + p.amount, 0)), [payments])
  const remaining = roundMoney(Math.max(0, total - paid))
  const cashPaid = roundMoney(
    payments.filter((p) => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0),
  )
  const nonCash = roundMoney(paid - cashPaid)
  const neededFromCash = Math.max(0, roundMoney(total - nonCash))
  const change = roundMoney(Math.max(0, cashPaid - neededFromCash))

  function pushDigit(digit: string) {
    setAmount((current) => {
      const next = (current + digit).replace(/^0+(?=\d)/, '')
      return next.length > 8 ? current : next
    })
  }

  function addPayment(value = typed) {
    const rounded = roundMoney(value)
    if (!Number.isFinite(rounded) || rounded <= 0) {
      setError('Informe um valor válido')
      return
    }
    if (payments.length >= 6) {
      setError('No máximo 6 formas de pagamento')
      return
    }
    if (method !== 'dinheiro' && rounded > remaining + 0.001) {
      setError('Essa forma não pode passar do restante')
      return
    }
    setPayments((prev) => [...prev, { method, amount: rounded }])
    setAmount('')
    setError('')
  }

  async function finish() {
    if (paid + 0.001 < total) {
      setError('Ainda falta pagar')
      return
    }
    try {
      setBusy(true)
      await onConfirm(payments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no pagamento')
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Receber pagamento" onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-950 p-4 text-white">
            <div className="text-sm text-slate-300">Total</div>
            <div className="text-4xl font-black tracking-tight">{money(total)}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-white/10 px-2 py-2">Pago<br /><strong>{money(paid)}</strong></div>
              <div className="rounded-xl bg-white/10 px-2 py-2">Falta<br /><strong>{money(remaining)}</strong></div>
              <div className="rounded-xl bg-emerald-400/20 px-2 py-2">Troco<br /><strong>{money(change)}</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_PAYMENT_METHODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMethod(item)
                  if (!amount) setAmount(toCents(remaining || total))
                }}
                className={`touch-btn px-3 text-sm ${
                  method === item ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {PAYMENT_LABELS[item]}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-orange-50 px-4 py-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Valor</div>
            <div className="text-4xl font-black text-slate-900">{money(typed)}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[remaining, 10, 20, 50, 100]
              .filter((value, index, list) => value > 0 && list.indexOf(value) === index)
              .map((value) => (
                <button
                  key={value}
                  type="button"
                  className="min-h-12 rounded-xl bg-slate-100 px-3 text-sm font-bold"
                  onClick={() => addPayment(value)}
                >
                  {money(value)}
                </button>
              ))}
          </div>

          {payments.length > 0 && (
            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div
                  key={`${payment.method}-${index}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"
                >
                  <span className="font-semibold">
                    {PAYMENT_LABELS[payment.method]} · {money(payment.amount)}
                  </span>
                  <button
                    type="button"
                    className="text-sm font-semibold text-rose-600"
                    onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <button
            type="button"
            disabled={busy || paid + 0.001 < total}
            onClick={() => void finish()}
            className="touch-btn w-full bg-orange-500 text-lg text-white disabled:opacity-50"
          >
            {busy ? 'Processando...' : change > 0 ? `Confirmar · troco ${money(change)}` : 'Confirmar pagamento'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'c'].map((key) => (
            <button
              key={key}
              type="button"
              className="touch-btn bg-slate-100 text-xl"
              onClick={() => {
                if (key === 'c') setAmount('')
                else pushDigit(key)
              }}
            >
              {key === 'c' ? <Delete className="mx-auto" /> : key}
            </button>
          ))}
          <button
            type="button"
            className="touch-btn col-span-3 bg-emerald-600 text-white"
            onClick={() => addPayment()}
          >
            Lançar valor
          </button>
        </div>
      </div>
    </Modal>
  )
}

function toCents(value: number) {
  return Math.round(value * 100).toString()
}

function centsToNumber(digits: string) {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return 0
  return roundMoney(Number(clean) / 100)
}
