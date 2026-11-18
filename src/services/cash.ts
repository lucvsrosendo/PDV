import { db, addAudit, getOpenCashSession } from '../db/db'
import { roundMoney } from '../utils/money'
import { assertAmount, clip } from '../utils/security'

export async function openCash(openingAmount: number, userName: string) {
  const open = await getOpenCashSession()
  if (open) throw new Error('Já existe um caixa aberto')

  const amount = assertAmount(openingAmount, 'Fundo de troco', 50_000)
  const now = new Date().toISOString()
  const id = Number(
    await db.cashSessions.add({
      openedAt: now,
      openedBy: clip(userName, 60),
      openingAmount: amount,
      expectedCash: amount,
      status: 'aberto',
    }),
  )

  await db.cashMovements.add({
    sessionId: id,
    type: 'abertura',
    amount,
    reason: 'Fundo de troco',
    createdBy: userName,
    createdAt: now,
  })

  await addAudit('caixa', `Caixa aberto com ${openingAmount}`, userName)
  return id
}

export async function addCashMovement(
  type: 'suprimento' | 'sangria',
  amount: number,
  reason: string,
  userName: string,
) {
  const session = await getOpenCashSession()
  if (!session) throw new Error('Nenhum caixa aberto')

  const value = assertAmount(Math.abs(amount), type === 'sangria' ? 'Sangria' : 'Suprimento', 50_000)
  if (value <= 0) throw new Error('Informe um valor maior que zero')
  if (type === 'sangria' && value > session.expectedCash + 0.001) {
    throw new Error('Sangria maior que o dinheiro esperado no caixa')
  }
  const now = new Date().toISOString()
  const delta = type === 'suprimento' ? value : -value

  await db.cashMovements.add({
    sessionId: session.id!,
    type,
    amount: value,
    reason: clip(reason, 160) || type,
    createdBy: userName,
    createdAt: now,
  })

  await db.cashSessions.update(session.id!, {
    expectedCash: roundMoney(session.expectedCash + delta),
  })

  await addAudit('caixa', `${type}: ${value} (${reason})`, userName)
}

export async function closeCash(countedCash: number, notes: string, userName: string) {
  const session = await getOpenCashSession()
  if (!session) throw new Error('Nenhum caixa aberto')

  const counted = assertAmount(countedCash, 'Valor contado', 500_000)
  const difference = roundMoney(counted - session.expectedCash)
  const now = new Date().toISOString()

  await db.cashMovements.add({
    sessionId: session.id!,
    type: 'fechamento',
    amount: counted,
    reason: clip(notes, 160) || 'Fechamento',
    createdBy: userName,
    createdAt: now,
  })

  const cleanNotes = clip(notes, 160)
  await db.cashSessions.update(session.id!, {
    status: 'fechado',
    closedAt: now,
    closedBy: userName,
    countedCash: counted,
    difference,
    notes: cleanNotes,
  })

  await addAudit('caixa', `Caixa fechado. Diferença: ${difference}`, userName)

  return {
    ...session,
    status: 'fechado' as const,
    closedAt: now,
    closedBy: userName,
    countedCash: counted,
    difference,
    notes: cleanNotes,
  }
}

export async function getSessionSummary(sessionId: number) {
  const movements = await db.cashMovements.where('sessionId').equals(sessionId).toArray()
  const orders = await db.orders.where('cashSessionId').equals(sessionId).toArray()
  const paid = orders.filter((o) => o.status === 'pago')

  const salesTotal = roundMoney(paid.reduce((s, o) => s + o.total, 0))
  const cashSales = roundMoney(
    paid.reduce((s, o) => {
      const cash = o.payments
        .filter((p) => p.method === 'dinheiro')
        .reduce((a, p) => a + p.amount, 0)
      return s + Math.max(0, cash - o.changeAmount)
    }, 0),
  )
  const supplies = roundMoney(
    movements.filter((m) => m.type === 'suprimento').reduce((s, m) => s + m.amount, 0),
  )
  const withdraws = roundMoney(
    movements.filter((m) => m.type === 'sangria').reduce((s, m) => s + m.amount, 0),
  )
  const session = await db.cashSessions.get(sessionId)
  const expected = session?.expectedCash ?? 0

  return {
    salesTotal,
    cashSales,
    supplies,
    withdraws,
    expected,
    counted: session?.countedCash ?? expected,
    difference: session?.difference ?? 0,
    paidOrders: paid,
    movements,
  }
}
