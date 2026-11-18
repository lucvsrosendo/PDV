import { db, addAudit, getOpenCashSession, getSettings, nextDailyNumber } from '../db/db'
import type {
  DiscountType,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentLine,
  PaymentMethod,
} from '../types'
import { calcLineTotal, calcOrderTotals, roundMoney } from '../utils/money'
import { assertAmount, clip } from '../utils/security'
import { uid } from '../utils/format'
import { decreaseStockForOrder, restoreStockForOrder } from './stock'

const KITCHEN_NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  aberto: ['enviado_cozinha'],
  enviado_cozinha: ['preparando'],
  preparando: ['pronto'],
  pronto: ['saiu_entrega', 'entregue'],
  saiu_entrega: ['entregue'],
}

async function canonicalItems(items: OrderItem[]): Promise<OrderItem[]> {
  if (!Array.isArray(items) || items.length === 0) return []
  if (items.length > 40) throw new Error('Máximo de 40 itens por pedido')

  const result: OrderItem[] = []
  for (const raw of items) {
    const product = await db.products.get(raw.productId)
    if (!product?.active) throw new Error('Há um produto indisponível no pedido')
    const qty = Math.floor(Number(raw.qty))
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new Error('Quantidade inválida')

    const extras: OrderItem['extras'] = []
    if (product.allowExtras) {
      for (const extra of (raw.extras || []).slice(0, 8)) {
        const row = await db.extras.get(extra.extraId)
        if (!row?.active || !row.id) continue
        extras.push({
          extraId: row.id,
          name: clip(row.name, 40),
          price: assertAmount(row.price, 'Adicional', 500),
        })
      }
    }

    const options: OrderItem['options'] = []
    for (const group of product.optionGroups || []) {
      const picked = (raw.options || []).find((option) => option.groupId === group.id)
      const choice =
        group.choices.find((item) => item.id === picked?.choiceId) ||
        (group.required ? group.choices[0] : undefined)
      if (group.required && !choice) throw new Error(`Escolha ${group.name}`)
      if (!choice) continue
      options.push({
        groupId: clip(group.id, 40),
        groupName: clip(group.name, 40),
        choiceId: clip(choice.id, 40),
        choiceName: clip(choice.name, 40),
        priceDelta: roundMoney(
          Math.min(500, Math.max(-500, Number(choice.priceDelta) || 0)),
        ),
      })
    }

    const catalogPrice = assertAmount(product.price, 'Preço', 10_000)
    const unitPrice =
      raw.priceOverride == null
        ? catalogPrice
        : assertAmount(raw.priceOverride, 'Preço do item', 10_000)
    result.push({
      id: clip(raw.id, 48) || uid('item'),
      productId: product.id!,
      name: clip(product.name, 80),
      code: clip(product.code, 20),
      unitPrice,
      priceOverride: raw.priceOverride == null ? undefined : unitPrice,
      qty,
      notes: clip(raw.notes, 140),
      extras,
      options,
      station: product.station,
      lineTotal: calcLineTotal(unitPrice, qty, extras, options),
    })
  }
  return result
}

function safePayments(payments: PaymentLine[], total: number): PaymentLine[] {
  if (!Array.isArray(payments) || payments.length === 0 || payments.length > 6) {
    throw new Error('Informe de 1 a 6 pagamentos')
  }
  const allowed = new Set<PaymentMethod>(ALL_PAYMENT_METHODS)
  const lines = payments.map((payment) => {
    if (!allowed.has(payment.method)) throw new Error('Forma de pagamento inválida')
    return { method: payment.method, amount: assertAmount(payment.amount, 'Pagamento', 100_000) }
  })
  const nonCash = roundMoney(
    lines.filter((line) => line.method !== 'dinheiro').reduce((sum, line) => sum + line.amount, 0),
  )
  if (nonCash > total + 0.001) {
    throw new Error('Cartão, PIX ou vale não pode passar do total')
  }
  return lines
}

export async function createOrUpdateOpenOrder(input: {
  orderId?: number
  type: OrderType
  items: OrderItem[]
  customerName: string
  customerId?: number
  tableId?: number
  tableName?: string
  deliveryAddress?: string
  deliveryFee: number
  applyServiceFee: boolean
  discountType: DiscountType
  discountValue: number
  notes: string
  userName: string
  sendToKitchen?: boolean
}): Promise<number> {
  const settings = await getSettings()
  if (settings.requireOpenCash) {
    const session = await getOpenCashSession()
    if (!session) throw new Error('Abra o caixa antes de lançar pedidos')
  }

  if (!['balcao', 'mesa', 'retirada', 'delivery'].includes(input.type)) {
    throw new Error('Tipo de pedido inválido')
  }
  if (!Number.isFinite(input.discountValue) || input.discountValue < 0) {
    throw new Error('Desconto inválido')
  }
  if (input.discountType === 'percentual' && input.discountValue > 100) {
    throw new Error('Desconto máximo é 100%')
  }
  if (input.discountType === 'valor' && input.discountValue > 10_000) {
    throw new Error('Desconto acima do limite')
  }

  const items = await canonicalItems(input.items)
  const deliveryFee =
    input.type === 'delivery' ? assertAmount(input.deliveryFee, 'Taxa de entrega', 500) : 0

  const feePercent = Math.min(100, Math.max(0, Number(settings.serviceFeePercent) || 0))
  const serviceFee = input.applyServiceFee
    ? roundMoney(
        calcOrderTotals({
          items,
          discountType: input.discountType,
          discountValue: input.discountValue,
        }).subtotal *
          (feePercent / 100),
      )
    : 0

  const totals = calcOrderTotals({
    items,
    discountType: input.discountType,
    discountValue: input.discountValue,
    deliveryFee,
    serviceFee,
  })

  const now = new Date().toISOString()
  const session = await getOpenCashSession()

  if (input.orderId) {
    const existing = await db.orders.get(input.orderId)
    if (!existing) throw new Error('Pedido não encontrado')
    if (existing.status === 'pago' || existing.status === 'cancelado') {
      throw new Error('Pedido já finalizado')
    }

    const status = input.sendToKitchen
      ? existing.status === 'aberto'
        ? 'enviado_cozinha'
        : existing.status
      : existing.status

    await db.orders.update(input.orderId, {
      type: input.type,
      items,
      customerName: clip(input.customerName, 60),
      customerId: input.customerId,
      tableId: input.tableId,
      tableName: input.tableName ? clip(input.tableName, 40) : undefined,
      deliveryAddress: input.deliveryAddress ? clip(input.deliveryAddress, 160) : undefined,
      deliveryFee: totals.deliveryFee,
      serviceFee: totals.serviceFee,
      discountType: input.discountType,
      discountValue: input.discountValue,
      discountAmount: totals.discountAmount,
      subtotal: totals.subtotal,
      total: totals.total,
      notes: clip(input.notes, 180),
      status,
      kitchenSentAt: input.sendToKitchen ? existing.kitchenSentAt || now : existing.kitchenSentAt,
      updatedAt: now,
    })

    if (input.tableId) {
      await db.diningTables.update(input.tableId, {
        status: 'ocupada',
        currentOrderId: input.orderId,
      })
    }

    if (input.sendToKitchen) {
      await addAudit('cozinha', `Pedido #${existing.dailyNumber} enviado à cozinha`, input.userName)
    }
    return input.orderId
  }

  const dailyNumber = await nextDailyNumber()
  const order: Order = {
    dailyNumber,
    type: input.type,
    status: input.sendToKitchen ? 'enviado_cozinha' : 'aberto',
    items,
    customerName: clip(input.customerName, 60),
    customerId: input.customerId,
    tableId: input.tableId,
    tableName: input.tableName ? clip(input.tableName, 40) : undefined,
    deliveryAddress: input.deliveryAddress ? clip(input.deliveryAddress, 160) : undefined,
    deliveryFee: totals.deliveryFee,
    serviceFee: totals.serviceFee,
    discountType: input.discountType,
    discountValue: input.discountValue,
    discountAmount: totals.discountAmount,
    subtotal: totals.subtotal,
    total: totals.total,
    payments: [],
    changeAmount: 0,
    notes: clip(input.notes, 180),
    cashSessionId: session?.id,
    createdBy: input.userName,
    createdAt: now,
    updatedAt: now,
    kitchenSentAt: input.sendToKitchen ? now : undefined,
  }

  const id = Number(await db.orders.add(order))

  if (input.tableId) {
    await db.diningTables.update(input.tableId, {
      status: 'ocupada',
      currentOrderId: id,
    })
  }

  await addAudit('pedido', `Pedido #${dailyNumber} criado (${input.type})`, input.userName)
  if (input.sendToKitchen) {
    await addAudit('cozinha', `Pedido #${dailyNumber} enviado à cozinha`, input.userName)
  }

  return id
}

export async function payOrder(input: {
  orderId: number
  payments: PaymentLine[]
  userName: string
}) {
  const order = await db.orders.get(input.orderId)
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status === 'pago') throw new Error('Pedido já pago')
  if (order.status === 'cancelado') throw new Error('Pedido cancelado')
  if (order.items.length === 0) throw new Error('Pedido sem itens')

  const settings = await getSettings()
  if (settings.requireOpenCash) {
    const session = await getOpenCashSession()
    if (!session) throw new Error('Abra o caixa antes de receber pagamentos')
  }

  const payments = safePayments(input.payments, order.total)
  const paid = roundMoney(payments.reduce((s, p) => s + p.amount, 0))
  if (paid + 0.001 < order.total) {
    throw new Error('Valor pago insuficiente')
  }

  const cashPaid = roundMoney(
    payments.filter((p) => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0),
  )
  const nonCash = roundMoney(paid - cashPaid)
  const neededFromCash = Math.max(0, roundMoney(order.total - nonCash))
  const changeAmount = roundMoney(Math.max(0, cashPaid - neededFromCash))

  const now = new Date().toISOString()
  const session = await getOpenCashSession()

  await db.transaction('rw', [db.orders, db.diningTables, db.cashMovements, db.cashSessions, db.products, db.stockMovements, db.auditLogs, db.settings], async () => {
    const current = await db.orders.get(input.orderId)
    if (!current || current.status === 'pago' || current.status === 'cancelado') {
      throw new Error('Pedido já finalizado')
    }
    await db.orders.update(input.orderId, {
      payments,
      changeAmount,
      status: 'pago',
      paidAt: now,
      updatedAt: now,
      cashSessionId: session?.id ?? order.cashSessionId,
    })

    if (order.tableId) {
      await db.diningTables.update(order.tableId, {
        status: 'livre',
        currentOrderId: undefined,
      })
    }

    if (session?.id && cashPaid > 0) {
      const openSession = await db.cashSessions.get(session.id)
      const netCash = roundMoney(cashPaid - changeAmount)
      if (openSession?.status === 'aberto' && netCash > 0) {
        await db.cashMovements.add({
          sessionId: openSession.id!,
          type: 'venda',
          amount: netCash,
          reason: `Venda #${order.dailyNumber}`,
          createdBy: input.userName,
          createdAt: now,
          orderId: input.orderId,
        })
        await db.cashSessions.update(openSession.id!, {
          expectedCash: roundMoney(openSession.expectedCash + netCash),
        })
      }
    }

    await decreaseStockForOrder(current, input.userName)
    await addAudit('pagamento', `Pedido #${order.dailyNumber} pago (${moneyList(payments)})`, input.userName)
  })

  return db.orders.get(input.orderId)
}

function moneyList(payments: PaymentLine[]) {
  return payments.map((p) => `${p.method}:${p.amount}`).join(', ')
}

export async function cancelOrder(orderId: number, reason: string, userName: string) {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status === 'pago') throw new Error('Cancele vendas pagas pelo histórico com motivo')
  if (order.status === 'cancelado') return

  const cleanReason = clip(reason, 180)
  if (cleanReason.length < 3) throw new Error('Informe o motivo do cancelamento')

  await db.orders.update(orderId, {
    status: 'cancelado',
    cancelReason: cleanReason,
    updatedAt: new Date().toISOString(),
  })

  if (order.tableId) {
    await db.diningTables.update(order.tableId, {
      status: 'livre',
      currentOrderId: undefined,
    })
  }

  await addAudit('cancelamento', `Pedido #${order.dailyNumber} cancelado: ${reason}`, userName)
}

export async function cancelPaidOrder(orderId: number, reason: string, userName: string) {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status !== 'pago') throw new Error('Pedido não está pago')
  const cleanReason = clip(reason, 180)
  if (cleanReason.length < 3) throw new Error('Informe o motivo do cancelamento')

  const now = new Date().toISOString()
  await db.transaction('rw', [db.orders, db.cashMovements, db.cashSessions, db.auditLogs, db.products, db.stockMovements, db.settings], async () => {
    await db.orders.update(orderId, {
      status: 'cancelado',
      cancelReason: cleanReason,
      updatedAt: now,
    })

    const cashPart = roundMoney(
      order.payments.filter((p) => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0) -
        order.changeAmount,
    )

    if (order.cashSessionId && cashPart > 0) {
      const session = await db.cashSessions.get(order.cashSessionId)
      if (session && session.status === 'aberto') {
        await db.cashMovements.add({
          sessionId: session.id!,
          type: 'sangria',
          amount: cashPart,
          reason: `Estorno venda #${order.dailyNumber}`,
          createdBy: userName,
          createdAt: now,
          orderId,
        })
        await db.cashSessions.update(session.id!, {
          expectedCash: roundMoney(session.expectedCash - cashPart),
        })
      }
    }

    await restoreStockForOrder(order, userName)
    await addAudit('cancelamento', `Venda paga #${order.dailyNumber} cancelada: ${cleanReason}`, userName)
  })
}

export async function updateKitchenStatus(
  orderId: number,
  status: Order['status'],
  userName: string,
) {
  const order = await db.orders.get(orderId)
  if (!order) throw new Error('Pedido não encontrado')
  if (!KITCHEN_NEXT[order.status]?.includes(status)) {
    throw new Error('Este pedido não pode mudar para esse status')
  }

  const now = new Date().toISOString()
  const patch: Partial<Order> = { status, updatedAt: now }
  if (status === 'pronto') patch.readyAt = now

  await db.orders.update(orderId, patch)
  await addAudit('cozinha', `Pedido #${order.dailyNumber} → ${status}`, userName)
}

export async function transferTable(orderId: number, toTableId: number, userName: string) {
  const order = await db.orders.get(orderId)
  const toTable = await db.diningTables.get(toTableId)
  if (!order || !toTable) throw new Error('Mesa/pedido inválido')
  if (toTable.status !== 'livre') throw new Error('Mesa destino ocupada')

  if (order.tableId) {
    await db.diningTables.update(order.tableId, { status: 'livre', currentOrderId: undefined })
  }

  await db.diningTables.update(toTableId, { status: 'ocupada', currentOrderId: orderId })
  await db.orders.update(orderId, {
    tableId: toTableId,
    tableName: toTable.name,
    type: 'mesa',
    updatedAt: new Date().toISOString(),
  })

  await addAudit('mesa', `Pedido #${order.dailyNumber} transferido para ${toTable.name}`, userName)
}

export async function setTableBill(tableId: number) {
  await db.diningTables.update(tableId, { status: 'conta' })
}

export const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  'dinheiro',
  'pix',
  'credito',
  'debito',
  'vale_refeicao',
  'vale_alimentacao',
]
