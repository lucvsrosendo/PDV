import Dexie, { type EntityTable } from 'dexie'
import type {
  AuditLog,
  CashMovement,
  CashSession,
  Category,
  Customer,
  Extra,
  Order,
  Product,
  StockMovement,
  StoreSettings,
  Table as DiningTable,
  User,
} from '../types'

class PdvDatabase extends Dexie {
  users!: EntityTable<User, 'id'>
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  extras!: EntityTable<Extra, 'id'>
  diningTables!: EntityTable<DiningTable, 'id'>
  customers!: EntityTable<Customer, 'id'>
  cashSessions!: EntityTable<CashSession, 'id'>
  cashMovements!: EntityTable<CashMovement, 'id'>
  orders!: EntityTable<Order, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  auditLogs!: EntityTable<AuditLog, 'id'>
  settings!: EntityTable<StoreSettings, 'id'>

  constructor() {
    super('pdv_lanchonete_v2')
    this.version(1).stores({
      users: '++id, pin, role, active',
      categories: '++id, sortOrder, active',
      products: '++id, categoryId, code, name, active',
      extras: '++id, name, active',
      diningTables: '++id, number, status, currentOrderId',
      customers: '++id, name, phone',
      cashSessions: '++id, status, openedAt',
      cashMovements: '++id, sessionId, type, createdAt',
      orders: '++id, dailyNumber, type, status, tableId, createdAt, cashSessionId',
      stockMovements: '++id, productId, type, createdAt',
      auditLogs: '++id, createdAt, action',
      settings: '++id',
    })
  }
}

export const db = new PdvDatabase()

export async function getSettings(): Promise<StoreSettings> {
  const settings = await db.settings.toCollection().first()
  if (!settings) {
    throw new Error('Configurações não inicializadas')
  }
  return settings
}

export async function updateSettings(partial: Partial<StoreSettings>) {
  const current = await getSettings()
  await db.settings.update(current.id!, { ...current, ...partial })
}

export async function addAudit(action: string, details: string, userName: string) {
  await db.auditLogs.add({
    action,
    details,
    userName,
    createdAt: new Date().toISOString(),
  })
}

export async function getOpenCashSession() {
  return db.cashSessions.where('status').equals('aberto').first()
}

export async function nextDailyNumber(date = new Date()): Promise<string> {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)

  const todays = await db.orders
    .where('createdAt')
    .between(start.toISOString(), end.toISOString(), true, true)
    .toArray()

  const next = todays.length + 1
  return String(next).padStart(3, '0')
}
