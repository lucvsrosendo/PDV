import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Send, CreditCard, Trash2 } from 'lucide-react'
import { db, getOpenCashSession, getSettings } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { useCart, type CartState } from '../context/CartContext'
import { ProductModal } from '../components/ProductModal'
import { PaymentModal } from '../components/PaymentModal'
import type { OrderType, Product } from '../types'
import { ORDER_TYPE_LABELS } from '../types'
import { money } from '../utils/money'
import { createOrUpdateOpenOrder, payOrder } from '../services/orders'
import { checkStockWarnings } from '../services/stock'
import { buildKitchenHtml, buildReceiptHtml, printHtml } from '../utils/print'
import { AuthorizeModal } from '../components/AuthorizeModal'
import { verifyAdminPin } from '../utils/security'

export function PDVPage() {
  const { user, locked } = useAuth()
  const location = useLocation()
  const { cart, totals, setMeta, addProduct, updateQty, updateItem, removeItem, clear, loadFromOrder } = useCart()
  const categories = useLiveQuery(() =>
    db.categories.filter((c) => c.active).sortBy('sortOrder'),
  ) || []
  const products = useLiveQuery(() => db.products.filter((p) => p.active).toArray()) || []
  const customers = useLiveQuery(() => db.customers.toArray()) || []
  const tables = useLiveQuery(() => db.diningTables.toArray()) || []
  const settings = useLiveQuery(() => db.settings.toCollection().first())
  const session = useLiveQuery(() => getOpenCashSession())

  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const [working, setWorking] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const pendingRef = useRef<(() => Promise<void>) | null>(null)
  const actionsRef = useRef({
    pay: async () => {},
    kitchen: async () => {},
    locked: false,
  })

  useEffect(() => {
    const fromNav = (location.state as { loadOrder?: CartState } | null)?.loadOrder
    const fromStorage = sessionStorage.getItem('pdv_load_order')
    const payload = fromNav || (fromStorage ? (JSON.parse(fromStorage) as CartState) : null)
    if (payload) {
      loadFromOrder(payload)
      sessionStorage.removeItem('pdv_load_order')
      window.history.replaceState({}, '')
    }
  }, [location.state, loadFromOrder])

  useEffect(() => {
    if (settings) {
      setMeta({
        serviceFeePercent: settings.serviceFeePercent,
        deliveryFee:
          cart.type === 'delivery' && cart.deliveryFee === 0
            ? settings.defaultDeliveryFee
            : cart.deliveryFee,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.serviceFeePercent, settings?.defaultDeliveryFee])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (actionsRef.current.locked || document.querySelector('[role="dialog"]')) return
      if (e.key === 'F2') {
        e.preventDefault()
        setSearchFocus(true)
        document.getElementById('pdv-search')?.focus()
      }
      if (e.key === 'F4') {
        e.preventDefault()
        void actionsRef.current.pay()
      }
      if (e.key === 'F8') {
        e.preventDefault()
        void actionsRef.current.kitchen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const catOk = categoryId === 'all' || p.categoryId === categoryId
      const qOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
      return catOk && qOk
    })
  }, [products, categoryId, query])

  async function ensureCanSell() {
    if (!user) throw new Error('Faça login')
    const cfg = settings || (await getSettings())
    if (cfg.requireOpenCash && !session) throw new Error('Abra o caixa antes de vender')
  }

  function needsManagerDiscount() {
    if (user?.role === 'admin') return false
    if (!settings?.discountApproval) return false
    const percentLimit = settings.discountApprovalPercent ?? 20
    const amountLimit = settings.discountApprovalAmount ?? 0
    const base = totals.subtotal
    const amount =
      cart.discountType === 'percentual' ? (base * cart.discountValue) / 100 : cart.discountValue
    if (cart.discountType === 'none' || amount <= 0) return false
    const percent = base > 0 ? (amount / base) * 100 : 0
    if (percent > percentLimit) return true
    return amountLimit > 0 && amount > amountLimit
  }

  async function runGuarded(action: () => Promise<void>) {
    if (working) return
    if (needsManagerDiscount()) {
      pendingRef.current = action
      setAuthOpen(true)
      return
    }
    setWorking(true)
    try {
      await action()
    } finally {
      setWorking(false)
    }
  }

  async function persist(sendToKitchen = false) {
    await ensureCanSell()
    if (cart.items.length === 0) throw new Error('Carrinho vazio')

    const warnings = await checkStockWarnings(
      cart.items.map((i) => ({ productId: i.productId, qty: i.qty, name: i.name })),
    )
    if (warnings.warnings.length && !warnings.allowNegative) {
      throw new Error(warnings.warnings.join('\n'))
    }
    if (warnings.warnings.length) {
      const ok = window.confirm(`Atenção de estoque:\n${warnings.warnings.join('\n')}\nContinuar?`)
      if (!ok) throw new Error('Operação cancelada')
    }

    const id = await createOrUpdateOpenOrder({
      orderId: cart.orderId,
      type: cart.type,
      items: cart.items,
      customerName: cart.customerName,
      customerId: cart.customerId,
      tableId: cart.tableId,
      tableName: cart.tableName,
      deliveryAddress: cart.deliveryAddress,
      deliveryFee: cart.type === 'delivery' ? cart.deliveryFee : 0,
      applyServiceFee: cart.applyServiceFee,
      discountType: cart.discountType,
      discountValue: cart.discountValue,
      notes: cart.notes,
      userName: user!.name,
      sendToKitchen,
    })

    setMeta({ orderId: id })
    return id
  }

  async function handleSendKitchen() {
    try {
      setMessage('')
      const id = await persist(true)
      const order = await db.orders.get(id)
      const cfg = settings || (await getSettings())
      if (order && cfg) printHtml(buildKitchenHtml(order, cfg))
      setMessage(`Pedido #${order?.dailyNumber} enviado à cozinha`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro')
    }
  }

  async function handlePay() {
    try {
      setMessage('')
      await persist(false)
      setPayOpen(true)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro')
    }
  }

  actionsRef.current = { pay: handlePay, kitchen: handleSendKitchen, locked }

  async function confirmPay(payments: Parameters<typeof payOrder>[0]['payments']) {
    if (!cart.orderId) throw new Error('Pedido não salvo')
    const paid = await payOrder({
      orderId: cart.orderId,
      payments,
      userName: user!.name,
    })
    const cfg = settings || (await getSettings())
    if (paid && cfg) {
      printHtml(buildReceiptHtml(paid, cfg))
      localStorage.setItem('pdv_last_order_id', String(paid.id))
    }
    setPayOpen(false)
    clear()
    setMessage(`Venda #${paid?.dailyNumber} finalizada`)
  }

  function pickCustomer(id: number) {
    const customer = customers.find((c) => c.id === id)
    if (!customer) return
    setMeta({
      customerId: customer.id,
      customerName: customer.name,
      deliveryAddress: [customer.address, customer.neighborhood].filter(Boolean).join(' - '),
      type: customer.address ? 'delivery' : cart.type,
      deliveryFee:
        customer.address && settings ? settings.defaultDeliveryFee : cart.deliveryFee,
    })
  }

  function pickTable(id: number) {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    if (table.status !== 'livre' && table.currentOrderId !== cart.orderId) {
      setMessage('Mesa ocupada. Use a tela Mesas para abrir a comanda.')
      return
    }
    setMeta({
      type: 'mesa',
      tableId: table.id,
      tableName: table.name,
      applyServiceFee: true,
    })
  }

  return (
        <div className="grid h-[calc(100dvh-7.4rem)] grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
      <section className="flex min-h-0 flex-col rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                setMeta({
                  type,
                  applyServiceFee: type === 'mesa',
                  deliveryFee:
                    type === 'delivery' ? settings?.defaultDeliveryFee || 5 : 0,
                  tableId: type === 'mesa' ? cart.tableId : undefined,
                  tableName: type === 'mesa' ? cart.tableName : undefined,
                })
              }
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                cart.type === type ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {ORDER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
            <input
              id="pdv-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              placeholder="Buscar produto ou código (F2)"
              className={`w-full rounded-xl border py-3 pl-10 pr-3 ${
                searchFocus ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'
              }`}
            />
          </div>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId('all')}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${
              categoryId === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryId(cat.id!)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-white ${
                categoryId === cat.id ? cat.color : 'bg-slate-400'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-auto sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                const needsDetail = product.allowExtras || (product.optionGroups?.length ?? 0) > 0
                if (needsDetail) setSelectedProduct(product)
                else addProduct(product, 1, [], [], '')
              }}
              className="min-h-28 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-400 hover:bg-orange-50"
            >
              <div className="text-xs font-semibold text-slate-400">{product.code}</div>
              <div className="mt-1 line-clamp-2 min-h-12 text-base font-bold text-slate-800">{product.name}</div>
              <div className="mt-2 text-xl font-black text-orange-600">{money(product.price)}</div>
              {product.trackStock && (
                <div className="mt-1 text-xs text-slate-500">Estoque: {product.stockQty}</div>
              )}
            </button>
          ))}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-2 space-y-2">
          <input
            value={cart.customerName}
            onChange={(e) => setMeta({ customerName: e.target.value })}
            placeholder="Nome para chamar"
            maxLength={60}
            className="min-h-12 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            value={cart.customerId || ''}
            onChange={(e) => e.target.value && pickCustomer(Number(e.target.value))}
          >
            <option value="">Cliente cadastrado...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `· ${c.phone}` : ''}
              </option>
            ))}
          </select>
          {cart.type === 'mesa' && (
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={cart.tableId || ''}
              onChange={(e) => e.target.value && pickTable(Number(e.target.value))}
            >
              <option value="">Selecionar mesa...</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
          )}
          {cart.type === 'delivery' && (
            <>
              <input
                value={cart.deliveryAddress}
                onChange={(e) => setMeta({ deliveryAddress: e.target.value })}
                placeholder="Endereço de entrega"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
              <input
                type="number"
                value={cart.deliveryFee}
                onChange={(e) => setMeta({ deliveryFee: Number(e.target.value) || 0 })}
                placeholder="Taxa de entrega"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </>
          )}
          <div className="flex gap-2">
            <select
              value={cart.discountType}
              onChange={(e) =>
                setMeta({ discountType: e.target.value as typeof cart.discountType })
              }
              className="rounded-xl border border-slate-200 px-2 py-2"
            >
              <option value="none">Sem desconto</option>
              <option value="valor">R$</option>
              <option value="percentual">%</option>
            </select>
            <input
              type="number"
              value={cart.discountValue}
              onChange={(e) => setMeta({ discountValue: Number(e.target.value) || 0 })}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
              disabled={cart.discountType === 'none'}
            />
          </div>
          <textarea
            value={cart.notes}
            onChange={(e) => setMeta({ notes: e.target.value.slice(0, 180) })}
            placeholder="Observação do pedido"
            rows={2}
            maxLength={180}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
          {cart.type === 'mesa' && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={cart.applyServiceFee}
                onChange={(e) => setMeta({ applyServiceFee: e.target.checked })}
              />
              Taxa de serviço ({settings?.serviceFeePercent || 10}%)
            </label>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {cart.items.length === 0 && (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Carrinho vazio
            </div>
          )}
          {cart.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    {item.extras.map((e) => e.name).join(', ')}
                    {item.options.map((o) => ` · ${o.choiceName}`).join('')}
                  </div>
                  <input
                    value={item.notes}
                    onChange={(e) => updateItem(item.id, { notes: e.target.value.slice(0, 140) })}
                    placeholder="Obs. do item"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <button type="button" onClick={() => removeItem(item.id)} className="text-rose-500">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-11 w-11 rounded-xl bg-slate-100 text-xl font-bold"
                    onClick={() => updateQty(item.id, item.qty - 1)}
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-lg font-bold">{item.qty}</span>
                  <button
                    type="button"
                    className="h-11 w-11 rounded-xl bg-orange-100 text-xl font-bold text-orange-700"
                    onClick={() => updateQty(item.id, item.qty + 1)}
                  >
                    +
                  </button>
                </div>
                <label className="text-right text-xs font-semibold text-slate-500">
                  Preço un.
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (!Number.isFinite(next) || next < 0 || next > 10000) return
                      updateItem(item.id, { unitPrice: next })
                    }}
                    className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-bold text-slate-900"
                  />
                  <div className="mt-1 text-sm font-bold text-slate-900">{money(item.lineTotal)}</div>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto</span><span>-{money(totals.discountAmount)}</span>
            </div>
          )}
          {totals.serviceFee > 0 && (
            <div className="flex justify-between"><span>Serviço</span><span>{money(totals.serviceFee)}</span></div>
          )}
          {totals.deliveryFee > 0 && (
            <div className="flex justify-between"><span>Entrega</span><span>{money(totals.deliveryFee)}</span></div>
          )}
          <div className="mt-2 flex items-end justify-between rounded-2xl bg-orange-500 px-4 py-3 text-white">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-3xl font-black leading-none">{money(totals.total)}</span>
          </div>
        </div>

        {message && (
          <div
            className={`mt-2 rounded-xl px-3 py-2 text-sm text-white ${
              message.includes('finalizada') || message.includes('enviado') ? 'bg-emerald-600' : 'bg-slate-900'
            }`}
          >
            {message}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => void runGuarded(handleSendKitchen)}
            className="touch-btn inline-flex items-center justify-center gap-2 bg-sky-600 text-white disabled:opacity-50"
          >
            <Send size={18} /> Cozinha
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void runGuarded(handlePay)}
            className="touch-btn inline-flex items-center justify-center gap-2 bg-orange-600 text-lg text-white disabled:opacity-50"
          >
            <CreditCard size={18} /> Pagar
          </button>
          <button
            type="button"
            onClick={() => clear()}
            className="touch-btn col-span-2 bg-slate-100 text-slate-700"
          >
            Limpar carrinho
          </button>
        </div>
      </aside>

      <ProductModal
        product={selectedProduct}
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onConfirm={(qty, extras, options, notes) => {
          if (!selectedProduct) return
          addProduct(selectedProduct, qty, extras, options, notes)
          setSelectedProduct(null)
        }}
      />

      <PaymentModal
        open={payOpen}
        total={totals.total}
        onClose={() => setPayOpen(false)}
        onConfirm={confirmPay}
      />

      <AuthorizeModal
        open={authOpen}
        title="Autorizar desconto"
        hint="Este desconto passa do limite definido em Ajustes. Peça o PIN do administrador."
        requirePin
        onClose={() => setAuthOpen(false)}
        onConfirm={async (reason, pin) => {
          await verifyAdminPin(pin)
          const action = pendingRef.current
          pendingRef.current = null
          setAuthOpen(false)
          setMessage(`Desconto autorizado: ${reason}`)
          if (!action) return
          setWorking(true)
          try {
            await action()
          } finally {
            setWorking(false)
          }
        }}
      />
    </div>
  )
}
