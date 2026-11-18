import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, getSettings } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { money } from '../utils/money'
import { PaymentModal } from '../components/PaymentModal'
import { Modal } from '../components/Modal'
import { AuthorizeModal } from '../components/AuthorizeModal'
import {
  cancelOrder,
  createOrUpdateOpenOrder,
  payOrder,
  setTableBill,
  transferTable,
} from '../services/orders'
import type { CartState } from '../context/CartContext'
import { buildReceiptHtml, printHtml } from '../utils/print'

export function MesasPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const tables = useLiveQuery(() => db.diningTables.orderBy('number').toArray()) || []
  const orders = useLiveQuery(() =>
    db.orders.filter((o) => o.type === 'mesa' && !['pago', 'cancelado'].includes(o.status)).toArray(),
  ) || []
  const settings = useLiveQuery(() => db.settings.toCollection().first())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [toTableId, setToTableId] = useState<number | ''>('')
  const [message, setMessage] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)

  const orderByTable = useMemo(() => {
    const map = new Map<number, (typeof orders)[number]>()
    for (const order of orders) {
      if (order.tableId) map.set(order.tableId, order)
    }
    return map
  }, [orders])

  const selectedTable = tables.find((t) => t.id === selectedId)
  const selectedOrder = selectedTable ? orderByTable.get(selectedTable.id!) : undefined

  async function openTable(tableId: number) {
    const table = tables.find((t) => t.id === tableId)
    if (!table || !user) return

    if (table.currentOrderId) {
      const order = await db.orders.get(table.currentOrderId)
      if (order) {
        goToPdv(order)
        return
      }
    }

    const id = await createOrUpdateOpenOrder({
      type: 'mesa',
      items: [],
      customerName: table.name,
      tableId: table.id,
      tableName: table.name,
      deliveryFee: 0,
      applyServiceFee: true,
      discountType: 'none',
      discountValue: 0,
      notes: '',
      userName: user.name,
    })
    const order = await db.orders.get(id)
    if (order) goToPdv(order)
  }

  function goToPdv(order: NonNullable<typeof selectedOrder>) {
    const state: CartState = {
      orderId: order.id,
      type: 'mesa',
      items: order.items,
      customerName: order.customerName,
      customerId: order.customerId,
      tableId: order.tableId,
      tableName: order.tableName,
      deliveryAddress: order.deliveryAddress || '',
      deliveryFee: order.deliveryFee,
      applyServiceFee: order.serviceFee > 0 || order.type === 'mesa',
      serviceFeePercent: settings?.serviceFeePercent || 10,
      discountType: order.discountType,
      discountValue: order.discountValue,
      notes: order.notes,
    }
    sessionStorage.setItem('pdv_load_order', JSON.stringify(state))
    navigate('/', { state: { loadOrder: state } })
  }

  async function handlePay(payments: Parameters<typeof payOrder>[0]['payments']) {
    if (!selectedOrder?.id || !user) return
    const paid = await payOrder({
      orderId: selectedOrder.id,
      payments,
      userName: user.name,
    })
    const cfg = settings || (await getSettings())
    if (paid && cfg) printHtml(buildReceiptHtml(paid, cfg))
    setPayOpen(false)
    setMessage(`Conta da ${selectedTable?.name} paga`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mesas</h1>
        {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tables.map((table) => {
          const order = orderByTable.get(table.id!)
          const color =
            table.status === 'livre'
              ? 'bg-emerald-500'
              : table.status === 'conta'
                ? 'bg-amber-500'
                : 'bg-rose-500'
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => setSelectedId(table.id!)}
              className={`rounded-2xl p-4 text-left text-white shadow-sm ${color} ${
                selectedId === table.id ? 'ring-4 ring-slate-900/30' : ''
              }`}
            >
              <div className="text-lg font-bold">{table.name}</div>
              <div className="text-sm opacity-90">{table.seats} lugares · {table.status}</div>
              {order && (
                <div className="mt-3 rounded-xl bg-black/20 p-2 text-sm">
                  <div>#{order.dailyNumber}</div>
                  <div className="text-lg font-bold">{money(order.total)}</div>
                  <div>{order.items.length} itens</div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedTable && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-bold">{selectedTable.name}</div>
              <div className="text-sm text-slate-500">
                {selectedOrder
                  ? `Pedido #${selectedOrder.dailyNumber} · ${money(selectedOrder.total)}`
                  : 'Mesa livre'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="touch-btn bg-orange-500 px-4 text-white"
                onClick={() => void openTable(selectedTable.id!)}
              >
                {selectedOrder ? 'Lançar itens' : 'Abrir comanda'}
              </button>
              {selectedOrder && (
                <>
                  <button
                    type="button"
                    className="touch-btn bg-amber-500 px-4 text-white"
                    onClick={() => void setTableBill(selectedTable.id!)}
                  >
                    Pedir conta
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-sky-600 px-4 text-white"
                    onClick={() => setTransferOpen(true)}
                  >
                    Transferir
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-emerald-600 px-4 text-white"
                    onClick={() => setPayOpen(true)}
                  >
                    Fechar conta
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-rose-100 px-4 text-rose-700"
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedOrder && (
            <div className="space-y-2">
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <span className="font-semibold">{money(item.lineTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PaymentModal
        open={payOpen}
        total={selectedOrder?.total || 0}
        onClose={() => setPayOpen(false)}
        onConfirm={handlePay}
      />

      <AuthorizeModal
        open={cancelOpen}
        title="Cancelar comanda"
        hint="A comanda sai do salão e fica no histórico."
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          if (!selectedOrder?.id || !user) return
          await cancelOrder(selectedOrder.id, reason, user.name)
          setCancelOpen(false)
          setMessage('Comanda cancelada')
        }}
      />

      <Modal open={transferOpen} title="Transferir mesa" onClose={() => setTransferOpen(false)}>
        <div className="space-y-3">
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            value={toTableId}
            onChange={(e) => setToTableId(Number(e.target.value))}
          >
            <option value="">Mesa destino</option>
            {tables
              .filter((t) => t.status === 'livre')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="touch-btn w-full bg-sky-600 text-white"
            onClick={async () => {
              if (!selectedOrder?.id || !toTableId || !user) return
              await transferTable(selectedOrder.id, toTableId, user.name)
              setTransferOpen(false)
              setMessage('Mesa transferida')
            }}
          >
            Confirmar transferência
          </button>
        </div>
      </Modal>
    </div>
  )
}
