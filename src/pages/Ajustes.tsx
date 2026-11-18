import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addAudit, updateSettings } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { downloadBackup, importBackup } from '../db/backup'
import { AuthorizeModal } from '../components/AuthorizeModal'
import { clip, setUserPin, verifyAdminPin } from '../utils/security'
import type { UserRole } from '../types'

export function AjustesPage() {
  const { user } = useAuth()
  const settings = useLiveQuery(() => db.settings.toCollection().first())
  const [form, setForm] = useState({
    storeName: '',
    phone: '',
    address: '',
    receiptFooter: '',
    serviceFeePercent: 10,
    defaultDeliveryFee: 5,
    requireOpenCash: true,
    allowNegativeStock: true,
    kitchenAlertSeconds: 8,
    idleLockMinutes: 8,
    discountApproval: false,
    discountApprovalPercent: 20,
    discountApprovalAmount: 30,
  })
  const [message, setMessage] = useState('')
  const [backupText, setBackupText] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      storeName: settings.storeName,
      phone: settings.phone,
      address: settings.address,
      receiptFooter: settings.receiptFooter,
      serviceFeePercent: settings.serviceFeePercent,
      defaultDeliveryFee: settings.defaultDeliveryFee,
      requireOpenCash: settings.requireOpenCash,
      allowNegativeStock: settings.allowNegativeStock,
      kitchenAlertSeconds: settings.kitchenAlertSeconds,
      idleLockMinutes: settings.idleLockMinutes ?? 8,
      discountApproval: settings.discountApproval ?? false,
      discountApprovalPercent: settings.discountApprovalPercent ?? 20,
      discountApprovalAmount: settings.discountApprovalAmount ?? 30,
    })
  }, [settings])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Ajustes</h1>
      {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}

      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <Field label="Nome da lanchonete">
          <input
            value={form.storeName}
            onChange={(e) => setForm((p) => ({ ...p, storeName: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </Field>
        <Field label="Telefone">
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </Field>
        <Field label="Endereço">
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </Field>
        <Field label="Rodapé do cupom">
          <textarea
            value={form.receiptFooter}
            onChange={(e) => setForm((p) => ({ ...p, receiptFooter: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            rows={2}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Taxa de serviço (%)">
            <input
              type="number"
              value={form.serviceFeePercent}
              onChange={(e) =>
                setForm((p) => ({ ...p, serviceFeePercent: Number(e.target.value) || 0 }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </Field>
          <Field label="Taxa de entrega padrão">
            <input
              type="number"
              value={form.defaultDeliveryFee}
              onChange={(e) =>
                setForm((p) => ({ ...p, defaultDeliveryFee: Number(e.target.value) || 0 }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </Field>
          <Field label="Bloquear após (min)">
            <input
              type="number"
              min={1}
              max={120}
              value={form.idleLockMinutes}
              onChange={(e) =>
                setForm((p) => ({ ...p, idleLockMinutes: Number(e.target.value) || 8 }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </Field>
          <Field label="Alerta cozinha (seg)">
            <input
              type="number"
              value={form.kitchenAlertSeconds}
              onChange={(e) =>
                setForm((p) => ({ ...p, kitchenAlertSeconds: Number(e.target.value) || 0 }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={form.requireOpenCash}
            onChange={(e) => setForm((p) => ({ ...p, requireOpenCash: e.target.checked }))}
          />
          Exigir caixa aberto para vender
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={form.allowNegativeStock}
            onChange={(e) => setForm((p) => ({ ...p, allowNegativeStock: e.target.checked }))}
          />
          Permitir venda com estoque negativo (com aviso)
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={form.discountApproval}
            onChange={(e) => setForm((p) => ({ ...p, discountApproval: e.target.checked }))}
          />
          Pedir PIN do administrador quando o desconto passar do limite
        </label>
        {form.discountApproval && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Limite sem PIN (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={form.discountApprovalPercent}
                onChange={(e) =>
                  setForm((p) => ({ ...p, discountApprovalPercent: Number(e.target.value) || 0 }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </Field>
            <Field label="Limite sem PIN (R$)">
              <input
                type="number"
                min={0}
                value={form.discountApprovalAmount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, discountApprovalAmount: Number(e.target.value) || 0 }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </Field>
          </div>
        )}

        <button
          type="button"
          className="touch-btn bg-orange-500 px-5 text-white"
            onClick={async () => {
              await updateSettings({
                ...form,
                storeName: clip(form.storeName, 80),
                phone: clip(form.phone, 40),
                address: clip(form.address, 160),
                receiptFooter: clip(form.receiptFooter, 180),
                serviceFeePercent: Math.min(100, Math.max(0, form.serviceFeePercent)),
                defaultDeliveryFee: Math.min(500, Math.max(0, form.defaultDeliveryFee)),
                kitchenAlertSeconds: Math.min(60, Math.max(2, form.kitchenAlertSeconds)),
                idleLockMinutes: Math.min(120, Math.max(1, form.idleLockMinutes)),
                discountApproval: form.discountApproval,
                discountApprovalPercent: Math.min(100, Math.max(0, form.discountApprovalPercent)),
                discountApprovalAmount: Math.max(0, form.discountApprovalAmount),
              })
              await addAudit('ajustes', 'Configurações atualizadas', user!.name)
              setMessage('Configurações salvas')
            }}
        >
          Salvar ajustes
        </button>
      </div>

      <OperatorsPanel onMessage={setMessage} actor={user?.name || 'admin'} />
      <TablesPanel onMessage={setMessage} />

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Backup e restauração</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="touch-btn bg-slate-900 px-4 text-white"
            onClick={async () => {
              await downloadBackup()
              await addAudit('backup', 'Backup exportado', user!.name)
              setMessage('Backup baixado')
            }}
          >
            Exportar JSON
          </button>
          <label className="touch-btn cursor-pointer bg-sky-600 px-4 text-white">
            Importar JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (file.size > 8_000_000) {
                  setMessage('Arquivo grande demais')
                  return
                }
                setBackupText(await file.text())
                setImportOpen(true)
              }}
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Os dados ficam no navegador deste computador (IndexedDB). Faça backup com frequência.
        </p>
      </div>

      <AuthorizeModal
        open={importOpen}
        title="Restaurar backup"
        hint="Isso substitui cardápio, vendas e operadores deste computador."
        requirePin
        onClose={() => {
          setImportOpen(false)
          setBackupText('')
        }}
        onConfirm={async (reason, pin) => {
          await verifyAdminPin(pin)
          await importBackup(backupText)
          await addAudit('backup', `Backup importado: ${reason}`, user!.name)
          window.location.reload()
        }}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function OperatorsPanel({ onMessage, actor }: { onMessage: (text: string) => void; actor: string }) {
  const users = useLiveQuery(async () => {
    const rows = await db.users.toArray()
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }) || []
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<UserRole>('caixa')

  async function createUser() {
    if (name.trim().length < 2) {
      onMessage('Informe o nome do operador')
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      onMessage('PIN de 4 a 6 dígitos')
      return
    }
    const id = Number(await db.users.add({ name: name.trim(), pin: '', role, active: true }))
    await setUserPin(id, pin)
    await addAudit('usuarios', `Operador criado: ${name}`, actor)
    setName('')
    setPin('')
    onMessage('Operador criado')
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">Operadores e PINs</h2>
      <div className="grid gap-2 md:grid-cols-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-2"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="PIN"
          inputMode="numeric"
          autoComplete="off"
          className="rounded-xl border border-slate-200 px-3 py-2"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-xl border border-slate-200 px-3 py-2"
        >
          <option value="admin">Admin</option>
          <option value="caixa">Caixa</option>
          <option value="cozinha">Cozinha</option>
        </select>
      </div>
      <button type="button" onClick={() => void createUser()} className="touch-btn bg-orange-500 px-4 text-white">
        Novo operador
      </button>
      <div className="space-y-2">
        {users.map((operator) => (
          <OperatorRow key={operator.id} operatorId={operator.id!} onMessage={onMessage} actor={actor} />
        ))}
      </div>
    </div>
  )
}

function OperatorRow({
  operatorId,
  onMessage,
  actor,
}: {
  operatorId: number
  onMessage: (text: string) => void
  actor: string
}) {
  const operator = useLiveQuery(() => db.users.get(operatorId), [operatorId])
  const [nextPin, setNextPin] = useState('')
  if (!operator) return null

  return (
    <div className="grid items-center gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_140px_120px_1fr]">
      <input
        defaultValue={operator.name}
        key={`${operator.id}-${operator.name}`}
        className="rounded-lg border border-slate-200 px-2 py-2 font-semibold"
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (name) void db.users.update(operator.id!, { name })
        }}
      />
      <select
        value={operator.role}
        onChange={async (e) => {
          const role = e.target.value as UserRole
          const admins = await db.users.filter((item) => item.role === 'admin' && item.active).toArray()
          if (operator.role === 'admin' && role !== 'admin' && admins.length <= 1) {
            onMessage('Precisa existir pelo menos um administrador ativo')
            return
          }
          await db.users.update(operator.id!, { role })
          await addAudit('usuarios', `${operator.name} agora é ${role}`, actor)
        }}
        className="rounded-lg border border-slate-200 px-2 py-2"
      >
        <option value="admin">Admin</option>
        <option value="caixa">Caixa</option>
        <option value="cozinha">Cozinha</option>
      </select>
      <button
        type="button"
        className="rounded-lg bg-white px-2 py-2 text-sm font-semibold"
        onClick={async () => {
          const admins = await db.users.filter((item) => item.role === 'admin' && item.active).toArray()
          if (operator.active && operator.role === 'admin' && admins.length <= 1) {
            onMessage('Não desative o último administrador')
            return
          }
          await db.users.update(operator.id!, { active: !operator.active })
        }}
      >
        {operator.active ? 'Ativo' : 'Inativo'}
      </button>
      <div className="flex gap-2">
        <input
          value={nextPin}
          onChange={(e) => setNextPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Novo PIN"
          inputMode="numeric"
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-200 px-2 py-2"
        />
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white"
          onClick={async () => {
            try {
              await setUserPin(operator.id!, nextPin)
              setNextPin('')
              await addAudit('usuarios', `PIN alterado: ${operator.name}`, actor)
              onMessage(`PIN de ${operator.name} atualizado`)
            } catch (err) {
              onMessage(err instanceof Error ? err.message : 'PIN inválido')
            }
          }}
        >
          Salvar PIN
        </button>
      </div>
    </div>
  )
}

function TablesPanel({ onMessage }: { onMessage: (text: string) => void }) {
  const tables = useLiveQuery(() => db.diningTables.orderBy('number').toArray()) || []
  const [seats, setSeats] = useState(4)

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Mesas</h2>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-xl border border-slate-200 px-3 py-2"
            title="Lugares"
          />
          <button
            type="button"
            className="touch-btn bg-orange-500 px-4 text-white"
            onClick={async () => {
              const number = tables.reduce((max, table) => Math.max(max, table.number), 0) + 1
              await db.diningTables.add({
                number,
                name: `Mesa ${number}`,
                seats,
                status: 'livre',
              })
              onMessage(`Mesa ${number} criada`)
            }}
          >
            Nova mesa
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {tables.map((table) => (
          <div key={table.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <input
              defaultValue={table.name}
              key={`${table.id}-${table.name}`}
              className="min-w-32 flex-1 rounded-lg border border-slate-200 px-2 py-2 font-semibold"
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name) void db.diningTables.update(table.id!, { name })
              }}
            />
            <input
              type="number"
              defaultValue={table.seats}
              key={`${table.id}-seats-${table.seats}`}
              className="w-20 rounded-lg border border-slate-200 px-2 py-2"
              title="Lugares"
              onBlur={(e) => {
                void db.diningTables.update(table.id!, { seats: Math.max(1, Number(e.target.value) || 1) })
              }}
            />
            <span className="text-sm text-slate-500">{table.status}</span>
            <button
              type="button"
              className="text-sm font-semibold text-rose-600"
              onClick={async () => {
                if (table.status !== 'livre') {
                  onMessage('Feche a comanda antes de excluir a mesa')
                  return
                }
                await db.diningTables.delete(table.id!)
                onMessage(`${table.name} excluída`)
              }}
            >
              Excluir
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
