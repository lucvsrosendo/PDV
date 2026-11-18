import { db, addAudit, getSettings } from '../db/db'
import type { Order, StockMovementType } from '../types'
import { assertAmount, clip } from '../utils/security'

export async function adjustStock(input: {
  productId: number
  type: StockMovementType
  qty: number
  reason: string
  userName: string
  orderId?: number
}) {
  const product = await db.products.get(input.productId)
  if (!product) throw new Error('Produto não encontrado')
  const qty = assertAmount(Math.abs(input.qty), 'Quantidade', 100_000)

  let newQty = product.stockQty
  if (input.type === 'entrada') newQty = product.stockQty + qty
  else if (input.type === 'ajuste') newQty = qty
  else newQty = product.stockQty - qty

  const settings = await getSettings()
  if (!settings.allowNegativeStock && newQty < 0) {
    throw new Error(`Estoque insuficiente para ${product.name}`)
  }

  await db.products.update(input.productId, { stockQty: newQty })
  await db.stockMovements.add({
    productId: input.productId,
    productName: product.name,
    type: input.type,
    qty: Math.abs(input.type === 'ajuste' ? qty - product.stockQty : qty),
    previousQty: product.stockQty,
    newQty,
    reason: clip(input.reason, 160),
    createdBy: input.userName,
    createdAt: new Date().toISOString(),
    orderId: input.orderId,
  })

  await addAudit('estoque', `${input.type} ${product.name}: ${product.stockQty} → ${newQty}`, input.userName)
}

export async function restoreStockForOrder(order: Order, userName: string) {
  for (const item of order.items) {
    const product = await db.products.get(item.productId)
    if (!product?.trackStock) continue
    await adjustStock({
      productId: item.productId,
      type: 'entrada',
      qty: item.qty,
      reason: `Estorno #${order.dailyNumber}`,
      userName,
      orderId: order.id,
    })
  }
}

export async function decreaseStockForOrder(order: Order, userName: string) {
  for (const item of order.items) {
    const product = await db.products.get(item.productId)
    if (!product?.trackStock) continue
    await adjustStock({
      productId: item.productId,
      type: 'venda',
      qty: item.qty,
      reason: `Venda #${order.dailyNumber}`,
      userName,
      orderId: order.id,
    })
  }
}

export async function checkStockWarnings(items: { productId: number; qty: number; name: string }[]) {
  const settings = await getSettings()
  const warnings: string[] = []
  for (const item of items) {
    const product = await db.products.get(item.productId)
    if (!product?.trackStock) continue
    if (product.stockQty < item.qty) {
      warnings.push(`${item.name}: estoque ${product.stockQty}, pedido ${item.qty}`)
    } else if (product.stockQty - item.qty < product.stockMin) {
      warnings.push(`${item.name}: ficará abaixo do mínimo (${product.stockMin})`)
    }
  }
  return { allowNegative: settings.allowNegativeStock, warnings }
}
