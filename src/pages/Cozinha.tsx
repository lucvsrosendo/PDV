import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell } from 'lucide-react'
import { db } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type KitchenStation, type Order } from '../types'
import { elapsedLabel, formatTime } from '../utils/format'
import { updateKitchenStatus } from '../services/orders'

const columns: { key: Order['status']; title: string }[] = [
  { key: 'enviado_cozinha', title: 'Novo' },
  { key: 'preparando', title: 'Preparando' },
  { key: 'pronto', title: 'Pronto' },
]

export function CozinhaPage() {
  const { user } = useAuth()
  const settings = useLiveQuery(() => db.settings.toCollection().first())
  const orders =
    useLiveQuery(() =>
      db.orders
        .filter((o) =>
          ['enviado_cozinha', 'preparando', 'pronto', 'saiu_entrega'].includes(o.status),
        )
        .toArray(),
    ) || []

  const [station, setStation] = useState<KitchenStation | 'todas'>('todas')
  const [now, setNow] = useState(new Date())
  const [alertIds, setAlertIds] = useState<number[]>([])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const newest = orders
      .filter((o) => o.status === 'enviado_cozinha' && o.id)
      .map((o) => o.id!)
    setAlertIds((prev) => {
      const fresh = newest.filter((id) => !prev.includes(id))
      if (fresh.length) {
        const seconds = (settings?.kitchenAlertSeconds || 8) * 1000
        setTimeout(() => {
          setAlertIds((current) => current.filter((id) => !fresh.includes(id)))
        }, seconds)
        return [...prev, ...fresh]
      }
      return prev
    })
  }, [orders, settings?.kitchenAlertSeconds])

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (station === 'todas') return true
      return order.items.some(
        (item) => item.station === station || item.station === 'ambos',
      )
    })
  }, [orders, station])

  async function advance(order: Order) {
    if (!user || !order.id) return
    let next: Order['status'] | null = null
    if (order.status === 'enviado_cozinha') next = 'preparando'
    else if (order.status === 'preparando') next = 'pronto'
    else if (order.status === 'pronto' && order.type === 'delivery') next = 'saiu_entrega'
    else if (order.status === 'saiu_entrega') next = 'entregue'
    if (!next) return
    await updateKitchenStatus(order.id, next, user.name)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Fila da Cozinha</h1>
        <div className="flex gap-2">
          {(['todas', 'cozinha', 'copa'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStation(s)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize ${
                station === s ? 'bg-orange-500 text-white' : 'bg-white text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {alertIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 font-bold text-white animate-pulse">
          <Bell /> Novo pedido na fila!
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.key} className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{col.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                {filtered.filter((o) => o.status === col.key).length}
              </span>
            </div>
            <div className="space-y-3">
              {filtered
                .filter((o) => o.status === col.key)
                .sort((a, b) => (a.kitchenSentAt || a.createdAt).localeCompare(b.kitchenSentAt || b.createdAt))
                .map((order) => {
                  const started = order.kitchenSentAt || order.createdAt
                  const ageMin =
                    (now.getTime() - new Date(started).getTime()) / 60000
                  const urgent = ageMin >= 15
                  const warn = ageMin >= 8
                  return (
                    <div
                      key={order.id}
                      className={`rounded-2xl border p-3 ${
                        urgent
                          ? 'border-rose-400 bg-rose-50'
                          : warn
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-slate-100 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-2xl font-black">#{order.dailyNumber}</div>
                          <div className="text-sm font-semibold">
                            {ORDER_TYPE_LABELS[order.type]}
                            {order.tableName ? ` · ${order.tableName}` : ''}
                            {order.customerName ? ` · ${order.customerName}` : ''}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatTime(started)} · {elapsedLabel(started, now)}
                          </div>
                        </div>
                        <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold">
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {order.items
                          .filter(
                            (item) =>
                              station === 'todas' ||
                              item.station === station ||
                              item.station === 'ambos',
                          )
                          .map((item) => (
                            <div key={item.id} className="rounded-xl bg-white px-2 py-2 text-sm">
                              <div className="font-bold">
                                {item.qty}x {item.name}
                              </div>
                              {item.options.length > 0 && (
                                <div className="text-slate-600">
                                  {item.options.map((o) => o.choiceName).join(', ')}
                                </div>
                              )}
                              {item.extras.length > 0 && (
                                <div className="text-orange-700">
                                  + {item.extras.map((e) => e.name).join(', ')}
                                </div>
                              )}
                              {item.notes && <div className="text-rose-600">Obs: {item.notes}</div>}
                            </div>
                          ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => void advance(order)}
                        className="touch-btn mt-3 w-full bg-slate-900 text-white"
                      >
                        {order.status === 'enviado_cozinha' && 'Iniciar preparo'}
                        {order.status === 'preparando' && 'Marcar pronto'}
                        {order.status === 'pronto' &&
                          (order.type === 'delivery' ? 'Saiu para entrega' : 'Manter pronto')}
                      </button>
                      {order.status === 'pronto' && order.type !== 'delivery' && (
                        <button
                          type="button"
                          className="touch-btn mt-2 w-full bg-emerald-600 text-white"
                          onClick={() => order.id && user && updateKitchenStatus(order.id, 'entregue', user.name)}
                        >
                          Entregue ao cliente
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>

      {filtered.some((o) => o.status === 'saiu_entrega') && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Em entrega</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered
              .filter((o) => o.status === 'saiu_entrega')
              .map((order) => (
                <div key={order.id} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <div className="font-bold">#{order.dailyNumber} · {order.customerName}</div>
                  <div className="text-sm">{order.deliveryAddress}</div>
                  <button
                    type="button"
                    className="touch-btn mt-3 w-full bg-sky-600 text-white"
                    onClick={() => order.id && user && updateKitchenStatus(order.id, 'entregue', user.name)}
                  >
                    Marcar entregue
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
