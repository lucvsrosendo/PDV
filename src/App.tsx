import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { PDVPage } from './pages/PDV'
import { MesasPage } from './pages/Mesas'
import { CozinhaPage } from './pages/Cozinha'
import { CaixaPage } from './pages/Caixa'
import { CardapioPage } from './pages/Cardapio'
import { EstoquePage } from './pages/Estoque'
import { ClientesPage } from './pages/Clientes'
import { RelatoriosPage } from './pages/Relatorios'
import { AjustesPage } from './pages/Ajustes'
import type { UserRole } from './types'

function Protected({
  children,
  roles,
}: {
  children: React.ReactNode
  roles?: UserRole[]
}) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Carregando PDV...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'cozinha' ? '/cozinha' : '/'} replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route
          index
          element={
            <Protected roles={['admin', 'caixa']}>
              <PDVPage />
            </Protected>
          }
        />
        <Route
          path="mesas"
          element={
            <Protected roles={['admin', 'caixa']}>
              <MesasPage />
            </Protected>
          }
        />
        <Route
          path="cozinha"
          element={
            <Protected roles={['admin', 'caixa', 'cozinha']}>
              <CozinhaPage />
            </Protected>
          }
        />
        <Route
          path="caixa"
          element={
            <Protected roles={['admin', 'caixa']}>
              <CaixaPage />
            </Protected>
          }
        />
        <Route
          path="cardapio"
          element={
            <Protected roles={['admin']}>
              <CardapioPage />
            </Protected>
          }
        />
        <Route
          path="estoque"
          element={
            <Protected roles={['admin']}>
              <EstoquePage />
            </Protected>
          }
        />
        <Route
          path="clientes"
          element={
            <Protected roles={['admin', 'caixa']}>
              <ClientesPage />
            </Protected>
          }
        />
        <Route
          path="relatorios"
          element={
            <Protected roles={['admin']}>
              <RelatoriosPage />
            </Protected>
          }
        />
        <Route
          path="ajustes"
          element={
            <Protected roles={['admin']}>
              <AjustesPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
