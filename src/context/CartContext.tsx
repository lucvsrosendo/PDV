import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type {
  CartItemExtra,
  CartItemOption,
  DiscountType,
  OrderItem,
  OrderType,
  Product,
} from '../types'
import { calcLineTotal, calcOrderTotals } from '../utils/money'
import { uid } from '../utils/format'

export interface CartState {
  orderId?: number
  type: OrderType
  items: OrderItem[]
  customerName: string
  customerId?: number
  tableId?: number
  tableName?: string
  deliveryAddress: string
  deliveryFee: number
  applyServiceFee: boolean
  serviceFeePercent: number
  discountType: DiscountType
  discountValue: number
  notes: string
}

interface CartContextValue {
  cart: CartState
  totals: ReturnType<typeof calcOrderTotals>
  setMeta: (partial: Partial<CartState>) => void
  addProduct: (
    product: Product,
    qty: number,
    extras: CartItemExtra[],
    options: CartItemOption[],
    notes: string,
  ) => void
  updateQty: (itemId: string, qty: number) => void
  updateItem: (itemId: string, patch: { notes?: string; unitPrice?: number }) => void
  removeItem: (itemId: string) => void
  clear: () => void
  loadFromOrder: (state: CartState) => void
}

const emptyCart = (): CartState => ({
  type: 'balcao',
  items: [],
  customerName: '',
  deliveryAddress: '',
  deliveryFee: 0,
  applyServiceFee: false,
  serviceFeePercent: 10,
  discountType: 'none',
  discountValue: 0,
  notes: '',
})

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(emptyCart)

  const totals = useMemo(() => {
    const base = calcOrderTotals({
      items: cart.items,
      discountType: cart.discountType,
      discountValue: cart.discountValue,
    })
    const serviceFee = cart.applyServiceFee
      ? (base.subtotal * cart.serviceFeePercent) / 100
      : 0
    return calcOrderTotals({
      items: cart.items,
      discountType: cart.discountType,
      discountValue: cart.discountValue,
      deliveryFee: cart.deliveryFee,
      serviceFee,
    })
  }, [cart])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      totals,
      setMeta(partial) {
        setCart((prev) => ({ ...prev, ...partial }))
      },
      addProduct(product, qty, extras, options, notes) {
        const lineTotal = calcLineTotal(product.price, qty, extras, options)
        const item: OrderItem = {
          id: uid('item'),
          productId: product.id!,
          name: product.name,
          code: product.code,
          unitPrice: product.price,
          qty,
          notes,
          extras,
          options,
          station: product.station,
          lineTotal,
        }
        setCart((prev) => ({ ...prev, items: [...prev.items, item] }))
      },
      updateQty(itemId, qty) {
        setCart((prev) => ({
          ...prev,
          items: prev.items
            .map((item) => {
              if (item.id !== itemId) return item
              const nextQty = Math.max(1, qty)
              return {
                ...item,
                qty: nextQty,
                lineTotal: calcLineTotal(item.unitPrice, nextQty, item.extras, item.options),
              }
            })
            .filter((item) => item.qty > 0),
        }))
      },
      updateItem(itemId, patch) {
        setCart((prev) => ({
          ...prev,
          items: prev.items.map((item) => {
            if (item.id !== itemId) return item
            const unitPrice =
              patch.unitPrice == null || !Number.isFinite(patch.unitPrice) || patch.unitPrice < 0
                ? item.unitPrice
                : Math.min(10_000, patch.unitPrice)
            const notes = patch.notes == null ? item.notes : patch.notes
            return {
              ...item,
              notes,
              unitPrice,
              priceOverride: patch.unitPrice == null ? item.priceOverride : unitPrice,
              lineTotal: calcLineTotal(unitPrice, item.qty, item.extras, item.options),
            }
          }),
        }))
      },
      removeItem(itemId) {
        setCart((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }))
      },
      clear() {
        setCart(emptyCart())
      },
      loadFromOrder(state) {
        setCart(state)
      },
    }),
    [cart, totals],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart fora do provider')
  return ctx
}
