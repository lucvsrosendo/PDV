import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '../types'
import { db } from '../db/db'
import { ensureSeeded } from '../db/seed'
import { authenticate, publicUser } from '../utils/security'
import { LockScreen } from '../components/LockScreen'

interface AuthContextValue {
  user: User | null
  ready: boolean
  locked: boolean
  loginWithPin: (pin: string) => Promise<User>
  logout: () => void
  lockNow: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = 'pdv_user_id'
const ACTIVITY_KEY = 'pdv_last_activity'

function touchActivity() {
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    ;(async () => {
      await ensureSeeded()
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const found = await db.users.get(Number(saved))
        if (found?.active) {
          const settings = await db.settings.toCollection().first()
          const idleMs = (settings?.idleLockMinutes ?? 8) * 60 * 1000
          const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0)
          const stale = Date.now() - last > idleMs
          setUser(publicUser(found))
          setLocked(stale && found.role !== 'cozinha')
          if (!stale) touchActivity()
        }
      }
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    if (!user || locked || user.role === 'cozinha') return
    touchActivity()
    const bump = () => touchActivity()
    window.addEventListener('pointerdown', bump)
    window.addEventListener('keydown', bump)
    const timer = window.setInterval(async () => {
      const settings = await db.settings.toCollection().first()
      const idleMs = (settings?.idleLockMinutes ?? 8) * 60 * 1000
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0)
      if (Date.now() - last > idleMs) setLocked(true)
    }, 20_000)
    return () => {
      window.removeEventListener('pointerdown', bump)
      window.removeEventListener('keydown', bump)
      window.clearInterval(timer)
    }
  }, [user, locked])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      locked,
      async loginWithPin(pin: string) {
        const found = await authenticate(pin)
        setUser(found)
        setLocked(false)
        localStorage.setItem(STORAGE_KEY, String(found.id))
        touchActivity()
        return found
      },
      logout() {
        setUser(null)
        setLocked(false)
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(ACTIVITY_KEY)
      },
      lockNow() {
        if (user) setLocked(true)
      },
    }),
    [user, ready, locked],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {user && locked && <LockScreen />}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do provider')
  return ctx
}
