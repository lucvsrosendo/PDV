import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from './Modal'
import { db } from '../db/db'
import type { CartItemExtra, CartItemOption, Product } from '../types'
import { money } from '../utils/money'
import { calcLineTotal } from '../utils/money'

export function ProductModal({
  product,
  open,
  onClose,
  onConfirm,
}: {
  product: Product | null
  open: boolean
  onClose: () => void
  onConfirm: (
    qty: number,
    extras: CartItemExtra[],
    options: CartItemOption[],
    notes: string,
  ) => void
}) {
  const extras = useLiveQuery(() => db.extras.filter((e) => e.active).toArray(), []) || []
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const [selectedExtras, setSelectedExtras] = useState<number[]>([])
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !product) return
    setQty(1)
    setNotes('')
    setSelectedExtras([])
    const defaults: Record<string, string> = {}
    for (const group of product.optionGroups || []) {
      if (group.choices[0]) defaults[group.id] = group.choices[0].id
    }
    setSelectedOptions(defaults)
  }, [open, product])

  const extrasPayload = useMemo(
    () =>
      extras
        .filter((e) => selectedExtras.includes(e.id!))
        .map((e) => ({ extraId: e.id!, name: e.name, price: e.price })),
    [extras, selectedExtras],
  )

  const optionsPayload = useMemo(() => {
    if (!product) return [] as CartItemOption[]
    return product.optionGroups
      .map((group) => {
        const choiceId = selectedOptions[group.id]
        const choice = group.choices.find((c) => c.id === choiceId)
        if (!choice) return null
        return {
          groupId: group.id,
          groupName: group.name,
          choiceId: choice.id,
          choiceName: choice.name,
          priceDelta: choice.priceDelta,
        }
      })
      .filter(Boolean) as CartItemOption[]
  }, [product, selectedOptions])

  const preview = product
    ? calcLineTotal(product.price, qty, extrasPayload, optionsPayload)
    : 0

  if (!product) return null

  const missingRequired = product.optionGroups.some(
    (g) => g.required && !selectedOptions[g.id],
  )

  return (
    <Modal open={open} title={product.name} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <div>
            <div className="text-sm text-slate-500">Código {product.code}</div>
            <div className="text-xl font-bold">{money(product.price)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="touch-btn h-12 w-12 bg-slate-200"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              -
            </button>
            <span className="w-10 text-center text-xl font-bold">{qty}</span>
            <button
              type="button"
              className="touch-btn h-12 w-12 bg-orange-500 text-white"
              onClick={() => setQty((q) => q + 1)}
            >
              +
            </button>
          </div>
        </div>

        {product.optionGroups.map((group) => (
          <div key={group.id}>
            <div className="mb-2 font-semibold">
              {group.name} {group.required ? '*' : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() =>
                    setSelectedOptions((prev) => ({ ...prev, [group.id]: choice.id }))
                  }
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${
                    selectedOptions[group.id] === choice.id
                      ? 'bg-orange-500 text-white ring-orange-500'
                      : 'bg-white text-slate-700 ring-slate-200'
                  }`}
                >
                  {choice.name}
                  {choice.priceDelta ? ` (+${money(choice.priceDelta)})` : ''}
                </button>
              ))}
            </div>
          </div>
        ))}

        {product.allowExtras && (
          <div>
            <div className="mb-2 font-semibold">Adicionais</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {extras.map((extra) => {
                const active = selectedExtras.includes(extra.id!)
                return (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() =>
                      setSelectedExtras((prev) =>
                        active ? prev.filter((id) => id !== extra.id) : [...prev, extra.id!],
                      )
                    }
                    className={`rounded-xl px-3 py-3 text-left text-sm font-semibold ring-1 ${
                      active
                        ? 'bg-emerald-500 text-white ring-emerald-500'
                        : 'bg-white text-slate-700 ring-slate-200'
                    }`}
                  >
                    <div>{extra.name}</div>
                    <div className="opacity-80">+{money(extra.price)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-semibold">Observação</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            rows={2}
            placeholder="Sem cebola, ponto, etc."
          />
        </div>

        <button
          type="button"
          disabled={missingRequired}
          onClick={() => onConfirm(qty, extrasPayload, optionsPayload, notes)}
          className="touch-btn w-full bg-orange-500 text-white disabled:opacity-50"
        >
          Adicionar · {money(preview)}
        </button>
      </div>
    </Modal>
  )
}
