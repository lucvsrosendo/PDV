import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOpenCashSession, getSettings } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { openCash, addCashMovement, closeCash, getSessionSummary } from '../services/cash'
import { money } from '../utils/money'
import { formatDateTime } from '../utils/format'
import { buildCashCloseHtml, buildReceiptHtml, printHtml } from '../utils/print'
import { cancelPaidOrder } from '../services/orders'
import { AuthorizeModal } from '../components/AuthorizeModal'
import { verifyAdminPin } from '../utils/security'

export function CaixaPage() {
  const { user } = useAuth()
  const session = useLiveQuery(() => getOpenCashSession())
  const sessions = useLiveQuery(() => db.cashSessions.orderBy('openedAt').reverse().limit(20).toArray()) || []
  const movements = useLiveQuery(
    () => (session?.id ? db.cashMovements.where('sessionId').equals(session.id).reverse().sortBy('createdAt') : []),
    [session?.id],
  ) || []
  const settings = useLiveQuery(() => db.settings.toCollection().first())

  const [openModal, setOpenModal] = useState(false)
  const [moveModal, setMoveModal] = useState<'suprimento' | 'sangria' | null>(null)
  const [closeModal, setCloseModal] = useState(false)
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState('')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getSessionSummary>> | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)

  async function refreshSummary(sessionId: number) {
    setSummary(await getSessionSummary(sessionId))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Caixa</h1>
        {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm md:col-span-2">
          {session ? (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm text-emerald-600 font-semibold">Caixa aberto</div>
                  <div className="text-3xl font-bold">{money(session.expectedCash)}</div>
                  <div className="text-sm text-slate-500">
                    Aberto em {formatDateTime(session.openedAt)} por {session.openedBy}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="touch-btn bg-emerald-500 px-4 text-white"
                    onClick={() => {
                      setAmount('50')
                      setReason('')
                      setMoveModal('suprimento')
                    }}
                  >
                    Suprimento
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-amber-500 px-4 text-white"
                    onClick={() => {
                      setAmount('50')
                      setReason('')
                      setMoveModal('sangria')
                    }}
                  >
                    Sangria
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-slate-900 px-4 text-white"
                    onClick={async () => {
                      await refreshSummary(session.id!)
                      setCounted(String(session.expectedCash))
                      setNotes('')
                      setCloseModal(true)
                    }}
                  >
                    Fechar caixa
                  </button>
                  <button
                    type="button"
                    className="touch-btn bg-sky-100 px-4 text-sky-800"
                    onClick={async () => {
                      const lastId = localStorage.getItem('pdv_last_order_id')
                      if (!lastId) {
                        setMessage('Nenhum cupom recente')
                        return
                      }
                      const order = await db.orders.get(Number(lastId))
                      const cfg = settings || (await getSettings())
                      if (order && cfg) printHtml(buildReceiptHtml(order, cfg))
                    }}
                  >
                    Reimprimir último cupom
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-semibold capitalize">{m.type}</div>
                      <div className="text-slate-500">{m.reason} · {formatDateTime(m.createdAt)}</div>
                    </div>
                    <div className="font-bold">{money(m.amount)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <div className="mb-3 text-lg font-semibold text-slate-700">Nenhum caixa aberto</div>
              <button
                type="button"
                className="touch-btn bg-orange-500 px-6 text-white"
                onClick={() => {
                  setAmount('100')
                  setOpenModal(true)
                }}
              >
                Abrir caixa
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Histórico</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm"
                onClick={async () => {
                  const sum = await getSessionSummary(s.id!)
                  setSummary(sum)
                  if (settings) {
                    printHtml(
                      buildCashCloseHtml(s, settings, {
                        salesTotal: sum.salesTotal,
                        cashSales: sum.cashSales,
                        supplies: sum.supplies,
                        withdraws: sum.withdraws,
                        expected: sum.expected,
                        counted: sum.counted,
                        difference: sum.difference,
                      }),
                    )
                  }
                }}
              >
                <div className="font-semibold capitalize">{s.status}</div>
                <div className="text-slate-500">{formatDateTime(s.openedAt)}</div>
                <div>{money(s.expectedCash)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {summary && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Resumo da sessão</h2>
            <button type="button" className="text-sm text-slate-500" onClick={() => setSummary(null)}>
              Fechar
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Stat label="Vendas" value={money(summary.salesTotal)} />
            <Stat label="Dinheiro" value={money(summary.cashSales)} />
            <Stat label="Suprimentos" value={money(summary.supplies)} />
            <Stat label="Sangrias" value={money(summary.withdraws)} />
            <Stat label="Esperado" value={money(summary.expected)} />
            <Stat label="Diferença" value={money(summary.difference)} />
          </div>
          <div className="mt-4 space-y-2">
            {summary.paidOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span>
                  #{order.dailyNumber} · {money(order.total)}
                </span>
                <button
                  type="button"
                  className="font-semibold text-rose-600"
                  onClick={() => order.id && setCancelId(order.id)}
                >
                  Cancelar venda
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={openModal} title="Abrir caixa" onClose={() => setOpenModal(false)}>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">Fundo de troco</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3"
            inputMode="decimal"
          />
          <button
            type="button"
            className="touch-btn w-full bg-orange-500 text-white"
            onClick={async () => {
              try {
                await openCash(Number(amount.replace(',', '.')), user!.name)
                setOpenModal(false)
                setMessage('Caixa aberto')
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Erro')
              }
            }}
          >
            Confirmar abertura
          </button>
        </div>
      </Modal>

      <Modal
        open={!!moveModal}
        title={moveModal === 'sangria' ? 'Sangria' : 'Suprimento'}
        onClose={() => setMoveModal(null)}
      >
        <div className="space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3"
            placeholder="Valor"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3"
            placeholder="Motivo"
          />
          <button
            type="button"
            className="touch-btn w-full bg-slate-900 text-white"
            onClick={async () => {
              try {
                await addCashMovement(
                  moveModal!,
                  Number(amount.replace(',', '.')),
                  reason || moveModal!,
                  user!.name,
                )
                setMoveModal(null)
                setMessage(`${moveModal} registrada`)
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Erro')
              }
            }}
          >
            Confirmar
          </button>
        </div>
      </Modal>

      <Modal open={closeModal} title="Fechar caixa" onClose={() => setCloseModal(false)}>
        <div className="space-y-3">
          {summary && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div>Esperado em dinheiro: {money(summary.expected)}</div>
              <div>Vendas totais: {money(summary.salesTotal)}</div>
            </div>
          )}
          <input
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3"
            placeholder="Valor contado"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3"
            placeholder="Observações"
          />
          <button
            type="button"
            className="touch-btn w-full bg-slate-900 text-white"
            onClick={async () => {
              try {
                const closed = await closeCash(Number(counted.replace(',', '.')), notes, user!.name)
                const sum = await getSessionSummary(closed.id!)
                const cfg = settings || (await getSettings())
                if (cfg) {
                  printHtml(
                    buildCashCloseHtml(closed, cfg, {
                      salesTotal: sum.salesTotal,
                      cashSales: sum.cashSales,
                      supplies: sum.supplies,
                      withdraws: sum.withdraws,
                      expected: closed.expectedCash,
                      counted: closed.countedCash || 0,
                      difference: closed.difference || 0,
                    }),
                  )
                }
                setCloseModal(false)
                setMessage(`Caixa fechado. Diferença: ${money(closed.difference || 0)}`)
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Erro')
              }
            }}
          >
            Confirmar fechamento
          </button>
        </div>
      </Modal>

      <AuthorizeModal
        open={cancelId !== null}
        title="Cancelar venda paga"
        hint="Estorna o dinheiro no caixa aberto e exige o PIN do administrador."
        requirePin
        onClose={() => setCancelId(null)}
        onConfirm={async (reason, pin) => {
          if (!cancelId || !user) return
          await verifyAdminPin(pin)
          await cancelPaidOrder(cancelId, reason, user.name)
          if (session?.id) await refreshSummary(session.id)
          setCancelId(null)
          setMessage('Venda paga cancelada')
        }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}
