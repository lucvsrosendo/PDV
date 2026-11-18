import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { adjustStock } from '../services/stock'
import type { StockMovementType } from '../types'
import { formatDateTime } from '../utils/format'

export function EstoquePage() {
  const { user } = useAuth()
  const products = useLiveQuery(() => db.products.filter((p) => p.trackStock).toArray()) || []
  const movements =
    useLiveQuery(() => db.stockMovements.orderBy('createdAt').reverse().limit(50).toArray()) || []

  const [modal, setModal] = useState(false)
  const [productId, setProductId] = useState<number | ''>('')
  const [type, setType] = useState<StockMovementType>('entrada')
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  const lowStock = useMemo(
    () => products.filter((p) => p.stockQty <= p.stockMin),
    [products],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Estoque</h1>
        <button
          type="button"
          className="touch-btn bg-orange-500 px-4 text-white"
          onClick={() => {
            setProductId(products[0]?.id || '')
            setType('entrada')
            setQty('1')
            setReason('')
            setModal(true)
          }}
        >
          Movimentar
        </button>
      </div>

      {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}

      {lowStock.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 font-bold text-amber-800">Abaixo do mínimo</div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <span key={p.id} className="rounded-lg bg-white px-3 py-1 text-sm font-semibold">
                {p.name}: {p.stockQty}/{p.stockMin}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Atual</th>
              <th className="px-3 py-2">Mínimo</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2">{p.stockQty}</td>
                <td className="px-3 py-2">{p.stockMin}</td>
                <td className="px-3 py-2">
                  {p.stockQty <= p.stockMin ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                      Baixo
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                      OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Últimas movimentações</h2>
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div>
                <div className="font-semibold">
                  {m.productName} · {m.type}
                </div>
                <div className="text-slate-500">
                  {m.reason} · {formatDateTime(m.createdAt)}
                </div>
              </div>
              <div className="font-bold">
                {m.previousQty} → {m.newQty}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={modal} title="Movimentar estoque" onClose={() => setModal(false)}>
        <div className="space-y-3">
          <select
            value={productId}
            onChange={(e) => setProductId(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stockQty})
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as StockMovementType)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="entrada">Entrada</option>
            <option value="perda">Perda</option>
            <option value="ajuste">Ajuste (definir quantidade)</option>
            <option value="saida">Saída</option>
          </select>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Quantidade"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Motivo"
          />
          <button
            type="button"
            className="touch-btn w-full bg-orange-500 text-white"
            onClick={async () => {
              try {
                if (!productId || !user) return
                await adjustStock({
                  productId,
                  type,
                  qty: Number(qty),
                  reason: reason || type,
                  userName: user.name,
                })
                setModal(false)
                setMessage('Estoque atualizado')
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Erro')
              }
            }}
          >
            Confirmar
          </button>
        </div>
      </Modal>
    </div>
  )
}
