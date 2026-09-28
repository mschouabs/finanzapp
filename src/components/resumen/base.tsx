'use client'

/* ── Piezas base del nuevo lenguaje (preview del Resumen) ──────────
   Formato de montos, número animado, aparición al hacer scroll,
   media query y toasts con "Deshacer". Chicas y sin dependencias:
   la idea es que después pasen al design system global.            */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

/* ── formato ──────────────────────────────────────────────────── */

export const fmt = (n: number) => (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
export const fmtSigno = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
export const fmtCorto = (n: number) => {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (a >= 10_000) return `${s}$${Math.round(a / 1_000)}K`
  return `${s}$${Math.round(a).toLocaleString('es-AR')}`
}
export const fmtPct = (n: number) => `${Math.round(n)}%`
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const fmtFechaCorta = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const f = new Date(y, m - 1, d)
  const hoy = new Date()
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  if (f.toDateString() === hoy.toDateString()) return 'Hoy'
  if (f.toDateString() === ayer.toDateString()) return 'Ayer'
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/* ── preferencias del sistema ─────────────────────────────────── */

function suscribirMedia(q: string) {
  return (cb: () => void) => {
    if (typeof window === 'undefined') return () => {}
    const m = window.matchMedia(q)
    m.addEventListener('change', cb)
    return () => m.removeEventListener('change', cb)
  }
}

export function useMedia(q: string, servidor = false) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suscribir = useCallback(suscribirMedia(q), [q])
  return useSyncExternalStore(
    suscribir,
    () => (typeof window === 'undefined' ? servidor : window.matchMedia(q).matches),
    () => servidor,
  )
}

export const useMenosMovimiento = () => useMedia('(prefers-reduced-motion: reduce)')

/* ── número animado ───────────────────────────────────────────── */

/**
 * Muestra un monto y, cuando cambia, lo lleva del valor viejo al nuevo
 * (≈0,5 s) con un tinte breve verde/rojo según la dirección. En la
 * primera carga solo el hero cuenta hacia arriba (`contarAlInicio`).
 */
export function NumeroAnimado({
  valor, formato = fmt, className = '', contarAlInicio = false, duracion = 520,
}: {
  valor: number
  formato?: (n: number) => string
  className?: string
  contarAlInicio?: boolean
  duracion?: number
}) {
  const quieto = useMenosMovimiento()
  const [mostrado, setMostrado] = useState(contarAlInicio && !quieto ? valor * 0.94 : valor)
  const [tinte, setTinte] = useState<'' | 'fa-tint-up' | 'fa-tint-down'>('')
  const previo = useRef(contarAlInicio ? valor * 0.94 : valor)
  const primera = useRef(true)

  useEffect(() => {
    const desde = previo.current
    const esPrimera = primera.current
    previo.current = valor
    primera.current = false
    if (quieto || desde === valor) { setMostrado(valor); return }
    if (!esPrimera) setTinte(valor > desde ? 'fa-tint-up' : 'fa-tint-down')
    const dur = esPrimera ? duracion + 200 : duracion
    const inicio = performance.now()
    let raf = 0
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / dur)
      const e = 1 - Math.pow(1 - k, 3)
      setMostrado(desde + (valor - desde) * e)
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    const limpiar = setTimeout(() => setTinte(''), 1500)
    return () => { cancelAnimationFrame(raf); clearTimeout(limpiar) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, quieto])

  return (
    <span className={`${className} ${tinte}`} aria-label={formato(valor)}>
      <span aria-hidden="true">{formato(mostrado)}</span>
    </span>
  )
}

/* ── aparición al hacer scroll ────────────────────────────────── */

export function Revelar({ children, className = '', demora = 0, id }: {
  children: ReactNode; className?: string; demora?: number; id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} id={id} className={`fa-reveal ${className}`} data-visible={visible}
      style={demora ? { transitionDelay: `${demora}ms` } : undefined}>
      {children}
    </div>
  )
}

/* ── toasts ───────────────────────────────────────────────────── */

export interface Toast { id: number; texto: string; tono?: 'ok' | 'error' | 'info'; deshacer?: () => void }

export function Toasts({ items, onCerrar }: { items: Toast[]; onCerrar: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end"
      role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className="fa-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-card-hover"
          style={{ background: 'var(--bg-alternate)', borderColor: t.tono === 'error' ? 'var(--accent-negative)' : 'var(--border-color)' }}>
          <span className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: t.tono === 'error' ? 'var(--accent-negative)' : t.tono === 'info' ? 'var(--accent-secondary)' : 'var(--accent-positive)' }} />
          <span className="min-w-0 flex-1 text-primary">{t.texto}</span>
          {t.deshacer && (
            <button onClick={() => { t.deshacer?.(); onCerrar(t.id) }}
              className="fa-press shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-info hover:bg-card">
              Deshacer
            </button>
          )}
          <button onClick={() => onCerrar(t.id)} aria-label="Cerrar aviso" className="fa-press shrink-0 rounded-md px-1.5 text-muted hover:text-primary">×</button>
        </div>
      ))}
    </div>
  )
}

export function useToasts() {
  const [items, setItems] = useState<Toast[]>([])
  const cerrar = (id: number) => setItems(xs => xs.filter(x => x.id !== id))
  const mostrar = (t: Omit<Toast, 'id'>, ms = 6000) => {
    const id = Date.now() + Math.random()
    setItems(xs => [...xs.slice(-2), { ...t, id }])
    setTimeout(() => cerrar(id), ms)
  }
  return { items, mostrar, cerrar }
}

/* ── encabezado de sección (sin caja) ─────────────────────────── */

export function Encabezado({ titulo, sub, derecha, id }: { titulo: string; sub?: ReactNode; derecha?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-bold tracking-tight text-primary">{titulo}</h2>
        {sub && <p className="mt-0.5 text-xs text-secondary">{sub}</p>}
      </div>
      {derecha}
    </div>
  )
}

/* ── pestañas chicas (segmentado) ─────────────────────────────── */

export function Pestanas<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: readonly { key: T; label: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="relative flex rounded-lg bg-alternate p-0.5">
      {opciones.map(o => {
        const on = o.key === valor
        return (
          <button key={o.key} role="tab" aria-selected={on} onClick={() => onCambio(o.key)}
            className={`fa-press relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold ${on ? 'text-primary' : 'text-secondary hover:text-primary'}`}
            style={on ? { background: 'var(--bg-card)', boxShadow: '0 1px 2px rgba(0,0,0,.25)' } : undefined}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── confirmación (reemplaza a window.confirm) ────────────────── */

export function Confirmar({ titulo, detalle, accion = 'Confirmar', peligro = false, onConfirmar, onCancelar }: {
  titulo: string
  detalle?: ReactNode
  accion?: string
  peligro?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const boton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    boton.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCancelar])
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo">
      <button className="fa-fade-in absolute inset-0 bg-black/60" aria-label="Cancelar" onClick={onCancelar} />
      <div className="fa-pop relative w-full max-w-sm rounded-2xl border p-5 shadow-card-hover" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <p id="confirmar-titulo" className="font-semibold text-primary">{titulo}</p>
        {detalle && <div className="mt-1.5 text-sm text-secondary">{detalle}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancelar} className="fa-press rounded-lg px-4 py-2 text-sm font-semibold text-secondary hover:bg-alternate">Cancelar</button>
          <button ref={boton} onClick={onConfirmar}
            className="fa-press rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: peligro ? 'var(--accent-negative)' : 'var(--accent-confirm)' }}>{accion}</button>
        </div>
      </div>
    </div>
  )
}
