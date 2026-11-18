import { format, formatDistanceStrict, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, 'HH:mm', { locale: ptBR })
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, 'dd/MM/yyyy', { locale: ptBR })
}

export function elapsedLabel(fromIso: string, now = new Date()): string {
  return formatDistanceStrict(parseISO(fromIso), now, {
    locale: ptBR,
    addSuffix: false,
  })
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function todayRangeIso() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}
