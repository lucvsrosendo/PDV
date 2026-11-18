import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  UtensilsCrossed,
  ChefHat,
  Wallet,
  BookOpen,
  Boxes,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Store,
  Lock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOpenCashSession } from '../db/db'
import { money } from '../utils/money'

const links = [
  { to: '/', label: 'PDV', icon: Store, roles: ['admin', 'caixa'] },
  { to: '/mesas', label: 'Mesas', icon: LayoutGrid, roles: ['admin', 'caixa'] },
  { to: '/cozinha', label: 'Cozinha', icon: ChefHat, roles: ['admin', 'caixa', 'cozinha'] },
  { to: '/caixa', label: 'Caixa', icon: Wallet, roles: ['admin', 'caixa'] },
  { to: '/cardapio', label: 'Cardápio', icon: BookOpen, roles: ['admin'] },
  { to: '/estoque', label: 'Estoque', icon: Boxes, roles: ['admin'] },
  { to: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'caixa'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin'] },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, roles: ['admin'] },
]

export function Layout() {
  const { user, logout, lockNow } = useAuth()
  const navigate = useNavigate()
  const settings = useLiveQuery(() => db.settings.toCollection().first())
  const session = useLiveQuery(() => getOpenCashSession())
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!user) return null

  const visible = links.filter((l) => l.roles.includes(user.role))

  return (
    <div className="flex h-full min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <UtensilsCrossed className="shrink-0 text-orange-400" />
          <div className="min-w-0">
            <div className="truncate text-base font-bold leading-tight">{settings?.storeName || 'PDV Lanchonete'}</div>
            <div className="text-xs text-slate-300">
              {user.name} · {user.role} · {clock}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`hidden rounded-full px-3 py-1.5 font-semibold sm:inline ${
              session ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-200'
            }`}
          >
            {session ? `Caixa ${money(session.expectedCash)}` : 'Caixa fechado'}
          </span>
          <button
            type="button"
            onClick={lockNow}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 hover:bg-white/20"
          >
            <Lock size={16} /> Bloquear
          </button>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 hover:bg-white/20"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold ${
                isActive
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-3 md:p-4">
        <Outlet />
      </main>

      <div id="print-root" className="hidden print:block" />
    </div>
  )
}
