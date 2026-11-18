import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addAudit } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { money } from '../utils/money'
import { formatDateTime } from '../utils/format'

export function ClientesPage() {
  const { user } = useAuth()
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) || []
  const orders = useLiveQuery(() => db.orders.toArray()) || []
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    neighborhood: '',
    notes: '',
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.neighborhood.toLowerCase().includes(q),
    )
  }, [customers, query])

  const history = useMemo(() => {
    if (!selectedId) return []
    return orders
      .filter((o) => o.customerId === selectedId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [orders, selectedId])

  function openNew() {
    setEditingId(null)
    setForm({ name: '', phone: '', address: '', neighborhood: '', notes: '' })
    setModal(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Clientes</h1>
        <button type="button" onClick={openNew} className="touch-btn bg-orange-500 px-4 text-white">
          Novo cliente
        </button>
      </div>

      {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome, telefone ou bairro"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3"
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedId(customer.id!)}
              className={`w-full rounded-2xl bg-white p-4 text-left shadow-sm ${
                selectedId === customer.id ? 'ring-2 ring-orange-400' : ''
              }`}
            >
              <div className="font-bold">{customer.name}</div>
              <div className="text-sm text-slate-500">{customer.phone || 'Sem telefone'}</div>
              <div className="text-sm">
                {[customer.address, customer.neighborhood].filter(Boolean).join(' · ') || 'Sem endereço'}
              </div>
              <div className="mt-2 flex gap-2">
                <span
                  className="text-sm font-semibold text-orange-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingId(customer.id!)
                    setForm({
                      name: customer.name,
                      phone: customer.phone,
                      address: customer.address,
                      neighborhood: customer.neighborhood,
                      notes: customer.notes || '',
                    })
                    setModal(true)
                  }}
                >
                  Editar
                </span>
                <span
                  className="text-sm font-semibold text-rose-600"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!window.confirm(`Excluir ${customer.name}?`)) return
                    await db.customers.delete(customer.id!)
                    if (selectedId === customer.id) setSelectedId(null)
                    setMessage('Cliente excluído')
                  }}
                >
                  Excluir
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Histórico</h2>
          {!selectedId && <div className="text-sm text-slate-500">Selecione um cliente</div>}
          <div className="space-y-2">
            {history.map((order) => (
              <div key={order.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="font-semibold">
                  #{order.dailyNumber} · {money(order.total)} · {order.status}
                </div>
                <div className="text-slate-500">{formatDateTime(order.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={modal} title={editingId ? 'Editar cliente' : 'Novo cliente'} onClose={() => setModal(false)}>
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Nome"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Telefone"
          />
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Endereço"
          />
          <input
            value={form.neighborhood}
            onChange={(e) => setForm((p) => ({ ...p, neighborhood: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Bairro"
          />
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Observações"
            rows={2}
          />
          <button
            type="button"
            className="touch-btn w-full bg-orange-500 text-white"
            onClick={async () => {
              if (!form.name.trim() || !user) return
              if (editingId) {
                await db.customers.update(editingId, form)
                await addAudit('cliente', `Cliente atualizado: ${form.name}`, user.name)
              } else {
                await db.customers.add({
                  ...form,
                  createdAt: new Date().toISOString(),
                })
                await addAudit('cliente', `Cliente criado: ${form.name}`, user.name)
              }
              setModal(false)
              setMessage('Cliente salvo')
            }}
          >
            Salvar
          </button>
        </div>
      </Modal>
    </div>
  )
}
