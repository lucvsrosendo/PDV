import { useEffect } from 'react'
import { Delete } from 'lucide-react'

export function PinPad({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        if (value.length < 6) onChange(value + event.key)
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        onChange(value.slice(0, -1))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onSubmit()
      } else if (event.key === 'Escape') {
        onChange('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [value, onChange, onSubmit])

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'limpar', '0', 'ok']

  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
      <div
        className="col-span-3 mb-1 flex h-16 items-center justify-center rounded-2xl bg-slate-900 text-3xl tracking-[0.45em] text-white"
        aria-label="PIN oculto"
      >
        {value.length ? '•'.repeat(value.length) : 'PIN'}
      </div>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="touch-btn flex h-16 items-center justify-center bg-white text-2xl shadow-sm ring-1 ring-slate-200 hover:bg-orange-50"
          onClick={() => {
            if (key === 'limpar') onChange('')
            else if (key === 'ok') onSubmit()
            else if (value.length < 6) onChange(value + key)
          }}
        >
          {key === 'limpar' ? <Delete size={26} /> : key === 'ok' ? 'OK' : key}
        </button>
      ))}
    </div>
  )
}
