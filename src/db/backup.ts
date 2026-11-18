import { db } from './db'
import { cleanImportedUser, parseBackup, protectStoredPins } from '../utils/security'

function asArray(value: unknown, max = 5000): unknown[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, max).filter((row) => row && typeof row === 'object' && !Array.isArray(row))
}

export async function exportBackup(): Promise<string> {
  const users = (await db.users.toArray()).map((user) => ({
    ...user,
    pin: '',
  }))
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    users,
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    extras: await db.extras.toArray(),
    tables: await db.diningTables.toArray(),
    customers: await db.customers.toArray(),
    cashSessions: await db.cashSessions.toArray(),
    cashMovements: await db.cashMovements.toArray(),
    orders: await db.orders.toArray(),
    stockMovements: await db.stockMovements.toArray(),
    auditLogs: await db.auditLogs.toArray(),
    settings: await db.settings.toArray(),
  }
  return JSON.stringify(data)
}

export async function downloadBackup() {
  const json = await exportBackup()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup-pdv-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(json: string) {
  const data = parseBackup(json)
  const users = asArray(data.users, 50)
    .map(cleanImportedUser)
    .filter((user) => user !== null)
  if (users.length === 0) throw new Error('Backup sem operadores válidos')

  const categories = asArray(data.categories)
  const products = asArray(data.products)
  const extras = asArray(data.extras)
  const tables = asArray(data.tables)
  const customers = asArray(data.customers)
  const cashSessions = asArray(data.cashSessions)
  const cashMovements = asArray(data.cashMovements)
  const orders = asArray(data.orders)
  const stockMovements = asArray(data.stockMovements)
  const auditLogs = asArray(data.auditLogs, 2000)
  const settings = asArray(data.settings, 5)

  await db.transaction(
    'rw',
    [
      db.users,
      db.categories,
      db.products,
      db.extras,
      db.diningTables,
      db.customers,
      db.cashSessions,
      db.cashMovements,
      db.orders,
      db.stockMovements,
      db.auditLogs,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.users.clear(),
        db.categories.clear(),
        db.products.clear(),
        db.extras.clear(),
        db.diningTables.clear(),
        db.customers.clear(),
        db.cashSessions.clear(),
        db.cashMovements.clear(),
        db.orders.clear(),
        db.stockMovements.clear(),
        db.auditLogs.clear(),
        db.settings.clear(),
      ])

      await db.users.bulkAdd(users)
      if (categories.length) await db.categories.bulkAdd(categories as never[])
      if (products.length) await db.products.bulkAdd(products as never[])
      if (extras.length) await db.extras.bulkAdd(extras as never[])
      if (tables.length) await db.diningTables.bulkAdd(tables as never[])
      if (customers.length) await db.customers.bulkAdd(customers as never[])
      if (cashSessions.length) await db.cashSessions.bulkAdd(cashSessions as never[])
      if (cashMovements.length) await db.cashMovements.bulkAdd(cashMovements as never[])
      if (orders.length) await db.orders.bulkAdd(orders as never[])
      if (stockMovements.length) await db.stockMovements.bulkAdd(stockMovements as never[])
      if (auditLogs.length) await db.auditLogs.bulkAdd(auditLogs as never[])
      if (settings.length) await db.settings.bulkAdd(settings as never[])
    },
  )

  await protectStoredPins()
}
