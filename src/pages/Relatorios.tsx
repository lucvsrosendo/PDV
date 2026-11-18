import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { money, roundMoney } from '../utils/money'
import { PAYMENT_LABELS, type PaymentMethod } from '../types'
import { downloadCsv, toCsv } from '../utils/csv'
import { formatDateTime } from '../utils/format'

function startOfDayIso(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toISOString()
}

function endOfDayIso(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59.999`)
  return d.toISOString()
}

function todayInput() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function RelatoriosPage() {
  const [from, setFrom] = useState(todayInput())
  const [to, setTo] = useState(todayInput())
  const orders = useLiveQuery(() => db.orders.toArray()) || []
  const movements = useLiveQuery(() => db.cashMovements.toArray()) || []
  const categories = useLiveQuery(() => db.categories.toArray()) || []
  const products = useLiveQuery(() => db.products.toArray()) || []

  const filtered = useMemo(() => {
    const start = startOfDayIso(from)
    const end = endOfDayIso(to)
    return orders.filter((o) => o.createdAt >= start && o.createdAt <= end)
  }, [orders, from, to])

  const paid = filtered.filter((o) => o.status === 'pago')
  const canceled = filtered.filter((o) => o.status === 'cancelado')

  const salesTotal = roundMoney(paid.reduce((s, o) => s + o.total, 0))
  const discounts = roundMoney(paid.reduce((s, o) => s + o.discountAmount, 0))
  const ticket = paid.length ? roundMoney(salesTotal / paid.length) : 0

  const byPayment = useMemo(() => {
    const map = new Map<PaymentMethod, number>()
    for (const order of paid) {
      for (const pay of order.payments) {
        map.set(pay.method, roundMoney((map.get(pay.method) || 0) + pay.amount))
      }
    }
    return [...map.entries()]
  }, [paid])

  const byProduct = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>()
    for (const order of paid) {
      for (const item of order.items) {
        const current = map.get(item.name) || { qty: 0, total: 0 }
        map.set(item.name, {
          qty: current.qty + item.qty,
          total: roundMoney(current.total + item.lineTotal),
        })
      }
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [paid])

  const byCategory = useMemo(() => {
    const productCat = new Map(products.map((p) => [p.id!, p.categoryId]))
    const catName = new Map(categories.map((c) => [c.id!, c.name]))
    const map = new Map<string, number>()
    for (const order of paid) {
      for (const item of order.items) {
        const catId = productCat.get(item.productId)
        const name = catName.get(catId || 0) || 'Outros'
        map.set(name, roundMoney((map.get(name) || 0) + item.lineTotal))
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [paid, products, categories])

  const byHour = useMemo(() => {
    const map = new Map<number, number>()
    for (const order of paid) {
      const hour = new Date(order.paidAt || order.createdAt).getHours()
      map.set(hour, roundMoney((map.get(hour) || 0) + order.total))
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [paid])

  const cashMoves = useMemo(() => {
    const start = startOfDayIso(from)
    const end = endOfDayIso(to)
    return movements.filter((m) => m.createdAt >= start && m.createdAt <= end)
  }, [movements, from, to])

  function exportSales() {
    const rows = paid.map((o) => ({
      numero: o.dailyNumber,
      data: formatDateTime(o.paidAt || o.createdAt),
      tipo: o.type,
      cliente: o.customerName,
      subtotal: o.subtotal,
      desconto: o.discountAmount,
      total: o.total,
      status: o.status,
    }))
    downloadCsv(`vendas-${from}-${to}.csv`, toCsv(rows))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold">Relatórios</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <button type="button" onClick={exportSales} className="touch-btn bg-slate-900 px-4 text-white">
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card title="Faturamento" value={money(salesTotal)} />
        <Card title="Ticket médio" value={money(ticket)} />
        <Card title="Descontos" value={money(discounts)} />
        <Card title="Vendas / Cancelamentos" value={`${paid.length} / ${canceled.length}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Por forma de pagamento">
          {byPayment.map(([method, total]) => (
            <Row key={method} label={PAYMENT_LABELS[method]} value={money(total)} />
          ))}
        </Panel>
        <Panel title="Por categoria">
          {byCategory.map(([name, total]) => (
            <Row key={name} label={name} value={money(total)} />
          ))}
        </Panel>
        <Panel title="Produtos mais vendidos">
          {byProduct.slice(0, 12).map(([name, data]) => (
            <Row key={name} label={`${name} (${data.qty}x)`} value={money(data.total)} />
          ))}
        </Panel>
        <Panel title="Por hora">
          {byHour.map(([hour, total]) => (
            <Row key={hour} label={`${String(hour).padStart(2, '0')}:00`} value={money(total)} />
          ))}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Cancelamentos">
          {canceled.map((o) => (
            <div key={o.id} className="rounded-xl bg-rose-50 px-3 py-2 text-sm">
              <div className="font-semibold">
                #{o.dailyNumber} · {money(o.total)}
              </div>
              <div className="text-rose-700">{o.cancelReason || 'Sem motivo'}</div>
              <div className="text-slate-500">{formatDateTime(o.updatedAt)}</div>
            </div>
          ))}
          {canceled.length === 0 && <div className="text-sm text-slate-500">Nenhum cancelamento</div>}
        </Panel>
        <Panel title="Movimento de caixa">
          {cashMoves.map((m) => (
            <Row
              key={m.id}
              label={`${m.type} · ${m.reason}`}
              value={money(m.amount)}
            />
          ))}
          {cashMoves.length === 0 && <div className="text-sm text-slate-500">Sem movimentos</div>}
        </Panel>
      </div>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
