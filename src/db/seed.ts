import { db } from './db'
import { protectStoredPins } from '../utils/security'
import type { ProductOptionGroup } from '../types'

const burgerOptions: ProductOptionGroup[] = [
  {
    id: 'ponto',
    name: 'Ponto da carne',
    required: true,
    choices: [
      { id: 'mal', name: 'Mal passado', priceDelta: 0 },
      { id: 'ao', name: 'Ao ponto', priceDelta: 0 },
      { id: 'bem', name: 'Bem passado', priceDelta: 0 },
    ],
  },
]

const drinkSize: ProductOptionGroup[] = [
  {
    id: 'tamanho',
    name: 'Tamanho',
    required: true,
    choices: [
      { id: '300', name: '300ml', priceDelta: 0 },
      { id: '500', name: '500ml', priceDelta: 2 },
      { id: '1l', name: '1L', priceDelta: 4 },
    ],
  },
]

let seedPromise: Promise<void> | null = null

async function dedupeCustomers() {
  const all = await db.customers.toArray()
  const seen = new Set<string>()
  for (const customer of all) {
    const key = `${customer.name}|${customer.phone}|${customer.address}`
    if (seen.has(key) && customer.id) {
      await db.customers.delete(customer.id)
    } else {
      seen.add(key)
    }
  }
}

export async function ensureSeeded() {
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
  const existing = await db.settings.toCollection().first()
  if (existing?.seeded) {
    await dedupeCustomers()
    const tableCount = await db.diningTables.count()
    if (tableCount === 0) {
      await db.diningTables.bulkAdd(
        Array.from({ length: 12 }, (_, i) => ({
          number: i + 1,
          name: `Mesa ${i + 1}`,
          seats: i < 8 ? 4 : 6,
          status: 'livre' as const,
        })),
      )
    }
    return
  }

  await db.transaction(
    'rw',
    [
      db.users,
      db.categories,
      db.products,
      db.extras,
      db.diningTables,
      db.settings,
      db.customers,
    ],
    async () => {
      const again = await db.settings.toCollection().first()
      if (again?.seeded) return

      await db.users.clear()
      await db.categories.clear()
      await db.products.clear()
      await db.extras.clear()
      await db.diningTables.clear()
      await db.customers.clear()
      await db.settings.clear()

      await db.users.bulkAdd([
        { name: 'Administrador', pin: '1234', role: 'admin', active: true },
        { name: 'Operador Caixa', pin: '1111', role: 'caixa', active: true },
        { name: 'Cozinha', pin: '0000', role: 'cozinha', active: true },
      ])

      const lanches = Number(
        await db.categories.add({
          name: 'Lanches',
          sortOrder: 1,
          active: true,
          color: 'bg-orange-500',
        }),
      )
      const porcoes = Number(
        await db.categories.add({
          name: 'Porções',
          sortOrder: 2,
          active: true,
          color: 'bg-amber-500',
        }),
      )
      const bebidas = Number(
        await db.categories.add({
          name: 'Bebidas',
          sortOrder: 3,
          active: true,
          color: 'bg-sky-500',
        }),
      )
      const sucos = Number(
        await db.categories.add({
          name: 'Sucos',
          sortOrder: 4,
          active: true,
          color: 'bg-lime-500',
        }),
      )
      const shakes = Number(
        await db.categories.add({
          name: 'Milk-shake',
          sortOrder: 5,
          active: true,
          color: 'bg-pink-500',
        }),
      )
      const sobremesas = Number(
        await db.categories.add({
          name: 'Sobremesas',
          sortOrder: 6,
          active: true,
          color: 'bg-violet-500',
        }),
      )
      const combos = Number(
        await db.categories.add({
          name: 'Combos',
          sortOrder: 7,
          active: true,
          color: 'bg-red-500',
        }),
      )

      await db.extras.bulkAdd([
        { name: 'Bacon', price: 4, active: true, station: 'cozinha' },
        { name: 'Queijo extra', price: 3, active: true, station: 'cozinha' },
        { name: 'Ovo', price: 2.5, active: true, station: 'cozinha' },
        { name: 'Catupiry', price: 3.5, active: true, station: 'cozinha' },
        { name: 'Cheddar', price: 3.5, active: true, station: 'cozinha' },
        { name: 'Hambúrguer extra', price: 8, active: true, station: 'cozinha' },
        { name: 'Calabresa', price: 4, active: true, station: 'cozinha' },
      ])

      await db.products.bulkAdd([
        {
          categoryId: lanches,
          name: 'X-Burger',
          code: 'XB01',
          price: 18,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
          description: 'Pão, hambúrguer e queijo',
        },
        {
          categoryId: lanches,
          name: 'X-Salada',
          code: 'XS01',
          price: 20,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
        },
        {
          categoryId: lanches,
          name: 'X-Bacon',
          code: 'XBAC',
          price: 24,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
        },
        {
          categoryId: lanches,
          name: 'X-Tudo',
          code: 'XTUD',
          price: 32,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
        },
        {
          categoryId: lanches,
          name: 'Hot Dog Simples',
          code: 'HD01',
          price: 12,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: [],
        },
        {
          categoryId: lanches,
          name: 'Hot Dog Completo',
          code: 'HD02',
          price: 16,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: [],
        },
        {
          categoryId: porcoes,
          name: 'Batata Frita P',
          code: 'BF01',
          price: 14,
          station: 'cozinha',
          active: true,
          trackStock: true,
          stockQty: 40,
          stockMin: 10,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: porcoes,
          name: 'Batata Frita G',
          code: 'BF02',
          price: 22,
          station: 'cozinha',
          active: true,
          trackStock: true,
          stockQty: 30,
          stockMin: 8,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: porcoes,
          name: 'Onion Rings',
          code: 'OR01',
          price: 18,
          station: 'cozinha',
          active: true,
          trackStock: true,
          stockQty: 25,
          stockMin: 5,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: porcoes,
          name: 'Porção Mista',
          code: 'PM01',
          price: 45,
          station: 'cozinha',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: bebidas,
          name: 'Refrigerante Lata',
          code: 'REF1',
          price: 6,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 80,
          stockMin: 20,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: bebidas,
          name: 'Refrigerante 600ml',
          code: 'REF2',
          price: 9,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 50,
          stockMin: 15,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: bebidas,
          name: 'Água Mineral',
          code: 'AG01',
          price: 4,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 60,
          stockMin: 15,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: bebidas,
          name: 'Chá Gelado',
          code: 'CHA1',
          price: 7,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 30,
          stockMin: 8,
          allowExtras: false,
          optionGroups: drinkSize,
        },
        {
          categoryId: sucos,
          name: 'Suco de Laranja',
          code: 'SUC1',
          price: 10,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: drinkSize,
        },
        {
          categoryId: sucos,
          name: 'Suco de Maracujá',
          code: 'SUC2',
          price: 10,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: drinkSize,
        },
        {
          categoryId: sucos,
          name: 'Suco de Abacaxi',
          code: 'SUC3',
          price: 10,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: drinkSize,
        },
        {
          categoryId: shakes,
          name: 'Milk-shake Chocolate',
          code: 'MS01',
          price: 16,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: shakes,
          name: 'Milk-shake Morango',
          code: 'MS02',
          price: 16,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: shakes,
          name: 'Milk-shake Ovomaltine',
          code: 'MS03',
          price: 18,
          station: 'copa',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: sobremesas,
          name: 'Brownie',
          code: 'SB01',
          price: 12,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 20,
          stockMin: 5,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: sobremesas,
          name: 'Pudim',
          code: 'SB02',
          price: 10,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 15,
          stockMin: 4,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: sobremesas,
          name: 'Açaí 300ml',
          code: 'AC01',
          price: 14,
          station: 'copa',
          active: true,
          trackStock: true,
          stockQty: 25,
          stockMin: 6,
          allowExtras: false,
          optionGroups: [],
        },
        {
          categoryId: combos,
          name: 'Combo X-Burger',
          code: 'CB01',
          price: 32,
          station: 'ambos',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
          description: 'X-Burger + batata P + refri lata',
        },
        {
          categoryId: combos,
          name: 'Combo X-Bacon',
          code: 'CB02',
          price: 38,
          station: 'ambos',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: true,
          optionGroups: burgerOptions,
          description: 'X-Bacon + batata P + refri lata',
        },
        {
          categoryId: combos,
          name: 'Combo Família',
          code: 'CB03',
          price: 89,
          station: 'ambos',
          active: true,
          trackStock: false,
          stockQty: 0,
          stockMin: 0,
          allowExtras: false,
          optionGroups: [],
          description: '2 X-Tudo + batata G + 2 refri 600ml',
        },
      ])

      await db.diningTables.bulkAdd(
        Array.from({ length: 12 }, (_, i) => ({
          number: i + 1,
          name: `Mesa ${i + 1}`,
          seats: i < 8 ? 4 : 6,
          status: 'livre' as const,
        })),
      )

      await db.customers.bulkAdd([
        {
          name: 'Cliente Balcão',
          phone: '',
          address: '',
          neighborhood: '',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'João Delivery',
          phone: '11999990001',
          address: 'Rua das Flores, 100',
          neighborhood: 'Centro',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Maria Santos',
          phone: '11988880002',
          address: 'Av. Brasil, 250 apto 12',
          neighborhood: 'Jardins',
          createdAt: new Date().toISOString(),
        },
      ])

      await db.settings.add({
        storeName: 'Lanchonete Sabor & Cia',
        phone: '(11) 4002-8922',
        address: 'Rua do Comércio, 123 - Centro',
        receiptFooter: 'Obrigado pela preferência! Volte sempre.',
        serviceFeePercent: 10,
        defaultDeliveryFee: 5,
        requireOpenCash: true,
        allowNegativeStock: true,
        kitchenAlertSeconds: 8,
        idleLockMinutes: 8,
        seeded: true,
      })
    },
  )
  })().finally(async () => {
    await protectStoredPins()
  })
  return seedPromise
}
