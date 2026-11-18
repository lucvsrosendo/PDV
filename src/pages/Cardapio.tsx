import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, addAudit } from '../db/db'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import type { Category, Extra, KitchenStation, Product, ProductOptionGroup } from '../types'
import { money } from '../utils/money'
import { uid } from '../utils/format'

const emptyProduct = (): Omit<Product, 'id'> => ({
  categoryId: 0,
  name: '',
  code: '',
  price: 0,
  station: 'cozinha',
  active: true,
  trackStock: false,
  stockQty: 0,
  stockMin: 0,
  allowExtras: true,
  optionGroups: [],
  description: '',
})

export function CardapioPage() {
  const { user } = useAuth()
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray()) || []
  const products = useLiveQuery(() => db.products.orderBy('name').toArray()) || []
  const extras = useLiveQuery(() => db.extras.orderBy('name').toArray()) || []

  const [tab, setTab] = useState<'produtos' | 'categorias' | 'adicionais'>('produtos')
  const [productModal, setProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyProduct())
  const [catName, setCatName] = useState('')
  const [extraForm, setExtraForm] = useState({ name: '', price: 0, station: 'cozinha' as KitchenStation })
  const [message, setMessage] = useState('')

  function openNewProduct() {
    setEditingProduct(null)
    setForm({
      ...emptyProduct(),
      categoryId: categories[0]?.id || 0,
    })
    setProductModal(true)
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setForm({ ...product })
    setProductModal(true)
  }

  async function saveProduct() {
    if (!form.name || !form.code || !form.categoryId) {
      setMessage('Preencha nome, código e categoria')
      return
    }
    if (form.optionGroups.some((group) => group.required && group.choices.length === 0)) {
      setMessage('Opção obrigatória precisa de pelo menos uma escolha')
      return
    }
    if (!Number.isFinite(form.price) || form.price < 0) {
      setMessage('Preço inválido')
      return
    }
    if (editingProduct?.id) {
      await db.products.update(editingProduct.id, form)
      await addAudit('cardapio', `Produto atualizado: ${form.name}`, user!.name)
    } else {
      await db.products.add(form)
      await addAudit('cardapio', `Produto criado: ${form.name}`, user!.name)
    }
    setProductModal(false)
    setMessage('Produto salvo')
  }

  function addOptionGroup() {
    const group: ProductOptionGroup = {
      id: uid('grp'),
      name: 'Nova opção',
      required: true,
      choices: [{ id: uid('ch'), name: 'Opção 1', priceDelta: 0 }],
    }
    setForm((prev) => ({ ...prev, optionGroups: [...prev.optionGroups, group] }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Cardápio</h1>
        <div className="flex gap-2">
          {(['produtos', 'categorias', 'adicionais'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize ${
                tab === t ? 'bg-orange-500 text-white' : 'bg-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">{message}</div>}

      {tab === 'produtos' && (
        <div className="space-y-3">
          <button type="button" onClick={openNewProduct} className="touch-btn bg-orange-500 px-4 text-white">
            Novo produto
          </button>
          <div className="overflow-auto rounded-2xl bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Preço</th>
                  <th className="px-3 py-2">Praça</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{p.code}</td>
                    <td className="px-3 py-2 font-semibold">{p.name}</td>
                    <td className="px-3 py-2">{money(p.price)}</td>
                    <td className="px-3 py-2 capitalize">{p.station}</td>
                    <td className="px-3 py-2">{p.active ? 'Ativo' : 'Inativo'}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="font-semibold text-orange-600" onClick={() => openEditProduct(p)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ml-3 font-semibold text-rose-600"
                        onClick={async () => {
                          if (!window.confirm(`Excluir ${p.name}? Pedidos antigos continuam no histórico.`)) return
                          await db.products.delete(p.id!)
                          await addAudit('cardapio', `Produto excluído: ${p.name}`, user!.name)
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categorias' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold">Nova categoria</h2>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Nome"
            />
            <button
              type="button"
              className="touch-btn bg-orange-500 px-4 text-white"
              onClick={async () => {
                if (!catName.trim()) return
                const cat: Omit<Category, 'id'> = {
                  name: catName.trim(),
                  sortOrder: categories.length + 1,
                  active: true,
                  color: 'bg-orange-500',
                }
                await db.categories.add(cat)
                await addAudit('cardapio', `Categoria criada: ${cat.name}`, user!.name)
                setCatName('')
                setMessage('Categoria salva')
              }}
            >
              Salvar
            </button>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-3 shadow-sm">
                <input
                  defaultValue={cat.name}
                  className="min-w-40 flex-1 rounded-lg border border-slate-200 px-2 py-2 font-semibold"
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== cat.name) {
                      void db.categories.update(cat.id!, { name })
                    }
                  }}
                />
                <input
                  type="number"
                  defaultValue={cat.sortOrder}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-2"
                  title="Ordem"
                  onBlur={(e) => {
                    void db.categories.update(cat.id!, { sortOrder: Number(e.target.value) || cat.sortOrder })
                  }}
                />
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600"
                  onClick={() => db.categories.update(cat.id!, { active: !cat.active })}
                >
                  {cat.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-600"
                  onClick={async () => {
                    const used = products.some((p) => p.categoryId === cat.id)
                    if (used) {
                      setMessage('Mova ou exclua os produtos desta categoria antes')
                      return
                    }
                    await db.categories.delete(cat.id!)
                  }}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'adicionais' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-bold">Novo adicional</h2>
            <input
              value={extraForm.name}
              onChange={(e) => setExtraForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Nome"
            />
            <input
              type="number"
              value={extraForm.price}
              onChange={(e) => setExtraForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Preço"
            />
            <select
              value={extraForm.station}
              onChange={(e) => setExtraForm((p) => ({ ...p, station: e.target.value as KitchenStation }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            >
              <option value="cozinha">Cozinha</option>
              <option value="copa">Copa</option>
            </select>
            <button
              type="button"
              className="touch-btn bg-orange-500 px-4 text-white"
              onClick={async () => {
                const extra: Omit<Extra, 'id'> = {
                  name: extraForm.name,
                  price: extraForm.price,
                  active: true,
                  station: extraForm.station,
                }
                await db.extras.add(extra)
                await addAudit('cardapio', `Adicional criado: ${extra.name}`, user!.name)
                setExtraForm({ name: '', price: 0, station: 'cozinha' })
                setMessage('Adicional salvo')
              }}
            >
              Salvar
            </button>
          </div>
          <div className="space-y-2">
            {extras.map((extra) => (
              <div key={extra.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-3 shadow-sm">
                <input
                  defaultValue={extra.name}
                  className="min-w-32 flex-1 rounded-lg border border-slate-200 px-2 py-2 font-semibold"
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name) void db.extras.update(extra.id!, { name })
                  }}
                />
                <input
                  type="number"
                  defaultValue={extra.price}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-2"
                  onBlur={(e) => {
                    void db.extras.update(extra.id!, { price: Math.max(0, Number(e.target.value) || 0) })
                  }}
                />
                <button
                  type="button"
                  className="text-sm font-semibold"
                  onClick={() => db.extras.update(extra.id!, { active: !extra.active })}
                >
                  {extra.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-600"
                  onClick={() => db.extras.delete(extra.id!)}
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={productModal} title={editingProduct ? 'Editar produto' : 'Novo produto'} onClose={() => setProductModal(false)} wide>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Nome"
          />
          <input
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            className="rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Código"
          />
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
            className="rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Preço"
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm((p) => ({ ...p, categoryId: Number(e.target.value) }))}
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={form.station}
            onChange={(e) => setForm((p) => ({ ...p, station: e.target.value as KitchenStation }))}
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="cozinha">Cozinha</option>
            <option value="copa">Copa</option>
            <option value="ambos">Ambos</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.allowExtras}
              onChange={(e) => setForm((p) => ({ ...p, allowExtras: e.target.checked }))}
            />
            Permitir adicionais
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.trackStock}
              onChange={(e) => setForm((p) => ({ ...p, trackStock: e.target.checked }))}
            />
            Controlar estoque
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            />
            Ativo
          </label>
          {form.trackStock && (
            <>
              <input
                type="number"
                value={form.stockQty}
                onChange={(e) => setForm((p) => ({ ...p, stockQty: Number(e.target.value) || 0 }))}
                className="rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Estoque atual"
              />
              <input
                type="number"
                value={form.stockMin}
                onChange={(e) => setForm((p) => ({ ...p, stockMin: Number(e.target.value) || 0 }))}
                className="rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Estoque mínimo"
              />
            </>
          )}
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="md:col-span-2 rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Descrição"
            rows={2}
          />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Opções</h3>
            <button type="button" onClick={addOptionGroup} className="text-sm font-semibold text-orange-600">
              + Grupo
            </button>
          </div>
          {form.optionGroups.map((group, gi) => (
            <div key={group.id} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-2 flex gap-2">
                <input
                  value={group.name}
                  onChange={(e) => {
                    const optionGroups = [...form.optionGroups]
                    optionGroups[gi] = { ...group, name: e.target.value }
                    setForm((p) => ({ ...p, optionGroups }))
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1"
                />
                <label className="flex items-center gap-1 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) => {
                      const optionGroups = [...form.optionGroups]
                      optionGroups[gi] = { ...group, required: e.target.checked }
                      setForm((p) => ({ ...p, optionGroups }))
                    }}
                  />
                  Obrigatória
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-600"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      optionGroups: p.optionGroups.filter((item) => item.id !== group.id),
                    }))
                  }
                >
                  Remover
                </button>
              </div>
              {group.choices.map((choice, ci) => (
                <div key={choice.id} className="mb-1 flex gap-2">
                  <input
                    value={choice.name}
                    onChange={(e) => {
                      const optionGroups = [...form.optionGroups]
                      const choices = [...group.choices]
                      choices[ci] = { ...choice, name: e.target.value }
                      optionGroups[gi] = { ...group, choices }
                      setForm((p) => ({ ...p, optionGroups }))
                    }}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1"
                    placeholder="Nome da opção"
                  />
                  <input
                    type="number"
                    value={choice.priceDelta}
                    onChange={(e) => {
                      const optionGroups = [...form.optionGroups]
                      const choices = [...group.choices]
                      choices[ci] = { ...choice, priceDelta: Number(e.target.value) || 0 }
                      optionGroups[gi] = { ...group, choices }
                      setForm((p) => ({ ...p, optionGroups }))
                    }}
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1"
                    title="Acréscimo ou desconto"
                  />
                  <button
                    type="button"
                    className="px-2 text-rose-600"
                    onClick={() => {
                      const optionGroups = [...form.optionGroups]
                      optionGroups[gi] = {
                        ...group,
                        choices: group.choices.filter((item) => item.id !== choice.id),
                      }
                      setForm((p) => ({ ...p, optionGroups }))
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="mt-1 text-sm font-semibold text-orange-600"
                onClick={() => {
                  const optionGroups = [...form.optionGroups]
                  optionGroups[gi] = {
                    ...group,
                    choices: [...group.choices, { id: uid('ch'), name: 'Nova opção', priceDelta: 0 }],
                  }
                  setForm((p) => ({ ...p, optionGroups }))
                }}
              >
                + Opção
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => void saveProduct()} className="touch-btn mt-4 w-full bg-orange-500 text-white">
          Salvar produto
        </button>
      </Modal>
    </div>
  )
}
