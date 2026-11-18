export type UserRole = 'admin' | 'caixa' | 'cozinha'

export type OrderType = 'balcao' | 'mesa' | 'retirada' | 'delivery'

export type OrderStatus =
  | 'aberto'
  | 'enviado_cozinha'
  | 'preparando'
  | 'pronto'
  | 'saiu_entrega'
  | 'entregue'
  | 'pago'
  | 'cancelado'

export type KitchenStation = 'cozinha' | 'copa' | 'ambos'

export type PaymentMethod =
  | 'dinheiro'
  | 'pix'
  | 'credito'
  | 'debito'
  | 'vale_refeicao'
  | 'vale_alimentacao'

export type CashMovementType = 'abertura' | 'suprimento' | 'sangria' | 'fechamento' | 'venda'

export type StockMovementType = 'entrada' | 'saida' | 'perda' | 'ajuste' | 'venda'

export type DiscountType = 'none' | 'valor' | 'percentual'

export type TableStatus = 'livre' | 'ocupada' | 'conta'

export interface User {
  id?: number
  name: string
  pin?: string
  pinHash?: string
  pinSalt?: string
  role: UserRole
  active: boolean
}

export interface Category {
  id?: number
  name: string
  sortOrder: number
  active: boolean
  color: string
}

export interface ProductOptionChoice {
  id: string
  name: string
  priceDelta: number
}

export interface ProductOptionGroup {
  id: string
  name: string
  required: boolean
  choices: ProductOptionChoice[]
}

export interface Product {
  id?: number
  categoryId: number
  name: string
  code: string
  price: number
  station: KitchenStation
  active: boolean
  trackStock: boolean
  stockQty: number
  stockMin: number
  allowExtras: boolean
  optionGroups: ProductOptionGroup[]
  description?: string
}

export interface Extra {
  id?: number
  name: string
  price: number
  active: boolean
  station: KitchenStation
}

export interface Table {
  id?: number
  number: number
  name: string
  seats: number
  status: TableStatus
  currentOrderId?: number
}

export interface Customer {
  id?: number
  name: string
  phone: string
  address: string
  neighborhood: string
  notes?: string
  createdAt: string
}

export interface CartItemExtra {
  extraId: number
  name: string
  price: number
}

export interface CartItemOption {
  groupId: string
  groupName: string
  choiceId: string
  choiceName: string
  priceDelta: number
}

export interface OrderItem {
  id: string
  productId: number
  name: string
  code: string
  unitPrice: number
  priceOverride?: number
  qty: number
  notes: string
  extras: CartItemExtra[]
  options: CartItemOption[]
  station: KitchenStation
  lineTotal: number
}

export interface PaymentLine {
  method: PaymentMethod
  amount: number
}

export interface Order {
  id?: number
  dailyNumber: string
  type: OrderType
  status: OrderStatus
  items: OrderItem[]
  customerName: string
  customerId?: number
  tableId?: number
  tableName?: string
  deliveryAddress?: string
  deliveryFee: number
  serviceFee: number
  discountType: DiscountType
  discountValue: number
  discountAmount: number
  subtotal: number
  total: number
  payments: PaymentLine[]
  changeAmount: number
  notes: string
  cancelReason?: string
  cashSessionId?: number
  createdBy: string
  createdAt: string
  updatedAt: string
  paidAt?: string
  kitchenSentAt?: string
  readyAt?: string
}

export interface CashSession {
  id?: number
  openedAt: string
  closedAt?: string
  openedBy: string
  closedBy?: string
  openingAmount: number
  expectedCash: number
  countedCash?: number
  difference?: number
  status: 'aberto' | 'fechado'
  notes?: string
}

export interface CashMovement {
  id?: number
  sessionId: number
  type: CashMovementType
  amount: number
  reason: string
  createdBy: string
  createdAt: string
  orderId?: number
}

export interface StockMovement {
  id?: number
  productId: number
  productName: string
  type: StockMovementType
  qty: number
  previousQty: number
  newQty: number
  reason: string
  createdBy: string
  createdAt: string
  orderId?: number
}

export interface AuditLog {
  id?: number
  action: string
  details: string
  userName: string
  createdAt: string
}

export interface StoreSettings {
  id?: number
  storeName: string
  phone: string
  address: string
  receiptFooter: string
  serviceFeePercent: number
  defaultDeliveryFee: number
  requireOpenCash: boolean
  allowNegativeStock: boolean
  kitchenAlertSeconds: number
  idleLockMinutes?: number
  discountApproval?: boolean
  discountApprovalPercent?: number
  discountApprovalAmount?: number
  seeded: boolean
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
  vale_refeicao: 'Vale-refeição',
  vale_alimentacao: 'Vale-alimentação',
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  balcao: 'Balcão',
  mesa: 'Mesa',
  retirada: 'Retirada',
  delivery: 'Delivery',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  aberto: 'Aberto',
  enviado_cozinha: 'Novo',
  preparando: 'Preparando',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega',
  entregue: 'Entregue',
  pago: 'Pago',
  cancelado: 'Cancelado',
}
