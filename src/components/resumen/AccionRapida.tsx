'use client'

/* ── Acción rápida global ("+") ────────────────────────────────────
   Un solo botón para todo lo que se registra: gasto, ingreso,
   transferencia, inversión y pago de tarjeta. Atajo de teclado: N.   */

import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, LineChart, Plus } from 'lucide-react'

export type AccionTipo = 'gasto' | 'ingreso' | 'transferencia' | 'inversion' | 'pago'

const ACCIONES: { k: AccionTipo; label: string; ayuda: string; Icono: typeof Plus; tono: string }[] = [
  { k: 'gasto', label: 'Gasto', ayuda: 'Una compra o un pago', Icono: ArrowUpRight, tono: 'var(--accent-negative)' },
  { k: 'ingreso', label: 'Ingreso', ayuda: 'Sueldo, cobro o extra', Icono: ArrowDownLeft, tono: 'var(--accent-positive)' },
  { k: 'transferencia', label: 'Transferencia', ayuda: 'Entre tus billeteras', Icono: ArrowLeftRight, tono: 'var(--accent-secondary)' },
  { k: 'inversion', label: 'Inversión', ayuda: 'Plazo fijo, FCI, cripto…', Icono: LineChart, tono: 'var(--accent-violet)' },
  { k: 'pago', label: 'Pago de tarjeta', ayuda: 'Pagar un resumen', Icono: CreditCard, tono: 'var(--accent-warning)' },
]

export function AccionRapida({ onAccion, pagoHint }: { onAccion: (a: AccionTipo) => void; pagoHint?: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (!escribiendo && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setAbierto(true)
      }
      if (e.key === 'Escape') setAbierto(false)
    }
    const onClick = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [])

  useEffect(() => { if (abierto) setTimeout(() => items.current[0]?.focus(), 20) }, [abierto])

  function mover(e: React.KeyboardEvent, i: number) {
    if (e.key === 'ArrowDown') { e.preventDefault(); items.current[(i + 1) % ACCIONES.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items.current[(i - 1 + ACCIONES.length) % ACCIONES.length]?.focus() }
  }

  return (
    <div ref={raiz} className="relative">
      <button onClick={() => setAbierto(v => !v)} aria-haspopup="menu" aria-expanded={abierto}
        className="fa-press flex h-11 items-center gap-2 rounded-xl bg-confirm px-4 text-sm font-semibold text-white shadow-[0_6px_18px_-6px_var(--accent-confirm)] hover:bg-confirm-hover">
        <Plus size={18} strokeWidth={2.5} style={{ transform: abierto ? 'rotate(45deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} />
        Registrar
        <kbd className="ml-1 hidden rounded border border-white/30 px-1 text-[10px] font-medium text-white/80 xl:inline">N</kbd>
      </button>

      {abierto && (
        <div role="menu" aria-label="Registrar"
          className="fa-pop absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-2xl border p-1.5 shadow-card-hover"
          style={{ background: 'var(--bg-alternate)', borderColor: 'var(--border-color)' }}>
          {ACCIONES.map((a, i) => (
            <button key={a.k} role="menuitem" ref={el => { items.current[i] = el }}
              onKeyDown={e => mover(e, i)}
              onClick={() => { setAbierto(false); onAccion(a.k) }}
              className="fa-press flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-card focus:bg-card">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${a.tono} 16%, transparent)`, color: a.tono }}>
                <a.Icono size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-primary">{a.label}</span>
                <span className="block truncate text-[11px] text-muted">{a.k === 'pago' && pagoHint ? pagoHint : a.ayuda}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
