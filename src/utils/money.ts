export function money(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calcLineTotal(
  unitPrice: number,
  qty: number,
  extras: { price: number }[],
  options: { priceDelta: number }[],
): number {
  const extrasTotal = extras.reduce((sum, e) => sum + e.price, 0)
  const optionsTotal = options.reduce((sum, o) => sum + o.priceDelta, 0)
  return roundMoney((unitPrice + extrasTotal + optionsTotal) * qty)
}

export function calcDiscountAmount(
  subtotal: number,
  type: 'none' | 'valor' | 'percentual',
  value: number,
): number {
  if (type === 'none' || value <= 0) return 0
  if (type === 'valor') return roundMoney(Math.min(value, subtotal))
  return roundMoney(Math.min(subtotal * (value / 100), subtotal))
}

export function calcOrderTotals(input: {
  items: { lineTotal: number }[]
  discountType: 'none' | 'valor' | 'percentual'
  discountValue: number
  deliveryFee?: number
  serviceFee?: number
}) {
  const subtotal = roundMoney(input.items.reduce((s, i) => s + i.lineTotal, 0))
  const discountAmount = calcDiscountAmount(subtotal, input.discountType, input.discountValue)
  const deliveryFee = roundMoney(input.deliveryFee ?? 0)
  const serviceFee = roundMoney(input.serviceFee ?? 0)
  const total = roundMoney(Math.max(0, subtotal - discountAmount + deliveryFee + serviceFee))
  return { subtotal, discountAmount, deliveryFee, serviceFee, total }
}
