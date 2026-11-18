import { db, addAudit } from '../db/db'
import type { User, UserRole } from '../types'

const LOCK_KEY = 'pdv_auth_guard'
const PBKDF2_ITERATIONS = 80_000

interface LockState {
  fails: number
  until: number
}

export function clip(value: unknown, max = 120): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max)
}

export function escapeHtml(value: unknown): string {
  return clip(value, 500)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function assertAmount(value: number, label = 'Valor', max = 100_000): number {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} inválido`)
  }
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function assertPinFormat(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN deve ter de 4 a 6 dígitos')
  }
}

export function safeEqual(a: string, b: string): boolean {
  const left = a.length === b.length ? a : ''
  const right = a.length === b.length ? b : ''
  let out = a.length === b.length ? 0 : 1
  const len = Math.max(left.length, right.length, 1)
  for (let i = 0; i < len; i++) {
    out |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0)
  }
  return out === 0
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readLock(): LockState {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return { fails: 0, until: 0 }
    const parsed = JSON.parse(raw) as LockState
    return {
      fails: Number(parsed.fails) || 0,
      until: Number(parsed.until) || 0,
    }
  } catch {
    return { fails: 0, until: 0 }
  }
}

export function assertNotLocked() {
  const lock = readLock()
  const wait = lock.until - Date.now()
  if (wait > 0) {
    throw new Error(`Muitas tentativas. Aguarde ${Math.ceil(wait / 1000)}s.`)
  }
}

function registerFailure() {
  const lock = readLock()
  const fails = lock.fails + 1
  const steps = Math.max(0, fails - 4)
  const wait = steps > 0 ? Math.min(15 * 60 * 1000, 15_000 * 2 ** (steps - 1)) : 0
  const until = wait ? Date.now() + wait : 0
  localStorage.setItem(LOCK_KEY, JSON.stringify({ fails, until }))
  return wait
}

function registerSuccess() {
  localStorage.removeItem(LOCK_KEY)
}

export function publicUser(user: User): User {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    active: user.active,
    pin: '',
  }
}

async function matchUser(pin: string): Promise<User | undefined> {
  const users = await db.users.filter((user) => user.active).limit(50).toArray()
  for (const user of users) {
    if (user.pinHash && user.pinSalt) {
      const hash = await hashPin(pin, user.pinSalt)
      if (safeEqual(hash, user.pinHash)) return user
    } else if (user.pin && safeEqual(user.pin, pin)) {
      if (user.id) {
        const salt = crypto.randomUUID()
        const pinHash = await hashPin(pin, salt)
        await db.users.update(user.id, { pinHash, pinSalt: salt, pin: '' })
      }
      return user
    }
  }
  await hashPin(pin, 'pdv-timing-pad')
  return undefined
}

export async function authenticate(pin: string): Promise<User> {
  assertNotLocked()
  assertPinFormat(pin)
  const user = await matchUser(pin)
  if (!user) {
    const wait = registerFailure()
    await addAudit('login', 'PIN recusado', 'sistema')
    if (wait > 0) throw new Error(`Muitas tentativas. Aguarde ${Math.ceil(wait / 1000)}s.`)
    throw new Error('PIN inválido')
  }
  registerSuccess()
  await addAudit('login', `Entrada de ${user.name}`, user.name)
  return publicUser(user)
}

export async function verifyAdminPin(pin: string): Promise<User> {
  const user = await authenticate(pin)
  if (user.role !== 'admin') {
    throw new Error('Somente o administrador autoriza esta ação')
  }
  return user
}

export async function setUserPin(userId: number, pin: string) {
  assertPinFormat(pin)
  const salt = crypto.randomUUID()
  const pinHash = await hashPin(pin, salt)
  await db.users.update(userId, { pinHash, pinSalt: salt, pin: '' })
}

export async function protectStoredPins() {
  const users = await db.users.toArray()
  for (const user of users) {
    if (!user.id || user.pinHash || !user.pin) continue
    if (!/^\d{4,6}$/.test(user.pin)) {
      await db.users.update(user.id, { pin: '' })
      continue
    }
    const salt = crypto.randomUUID()
    const pinHash = await hashPin(user.pin, salt)
    await db.users.update(user.id, { pinHash, pinSalt: salt, pin: '' })
  }
}

const ROLES: UserRole[] = ['admin', 'caixa', 'cozinha']

export function parseBackup(json: string): Record<string, unknown> {
  if (typeof json !== 'string' || json.length === 0 || json.length > 8_000_000) {
    throw new Error('Arquivo de backup inválido')
  }
  const data: unknown = JSON.parse(json, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined
    return value
  })
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Backup inválido')
  }
  return data as Record<string, unknown>
}

export function cleanImportedUser(row: unknown): User | null {
  if (!row || typeof row !== 'object') return null
  const data = row as Record<string, unknown>
  if (!ROLES.includes(data.role as UserRole)) return null
  const name = clip(data.name, 60)
  if (!name) return null
  const user: User = {
    name,
    role: data.role as UserRole,
    active: data.active !== false,
    pin: '',
  }
  if (
    typeof data.pinHash === 'string' &&
    /^[a-f0-9]{64}$/.test(data.pinHash) &&
    typeof data.pinSalt === 'string' &&
    data.pinSalt.length > 8 &&
    data.pinSalt.length < 80
  ) {
    user.pinHash = data.pinHash
    user.pinSalt = data.pinSalt
    return user
  }
  if (typeof data.pin === 'string' && /^\d{4,6}$/.test(data.pin)) {
    user.pin = data.pin
    return user
  }
  return null
}
