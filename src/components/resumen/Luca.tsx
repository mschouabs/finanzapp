'use client'

/* ── Luca, capa de inteligencia ────────────────────────────────────
   1) LucaInsights: lo que Luca detectó, de a uno, con su "¿por qué?"
      y una acción. Se pueden ocultar (por hoy).
   2) CapturaLuca: registrar un gasto en lenguaje natural con
      confirmación visual antes de guardar.                            */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Lightbulb, Sparkles, TrendingUp, X } from 'lucide-react'
import { LucaAvatar, type LucaEstado } from '@/components/luca/LucaAvatar'
import { CATEGORIAS, getCat } from '@/lib/categorias'
import { fmt, fmtFechaCorta } from './base'
import type { Insight, TipoInsight } from '@/lib/finanzas/insights'
import { hoyISO } from '@/lib/fechas'

const TIPO: Record<TipoInsight, { label: string; color: string; Icono: typeof Lightbulb }> = {
  atencion: { label: 'Atención', color: 'var(--accent-warning)', Icono: AlertTriangle },
  oportunidad: { label: 'Oportunidad', color: 'var(--accent-secondary)', Icono: Lightbulb },
  progreso: { label: 'Progreso', color: 'var(--accent-positive)', Icono: TrendingUp },
  dato: { label: 'Para tener en cuenta', color: 'var(--text-secondary)', Icono: Sparkles },
}

const CLAVE_OCULTOS = () => `fa_insights_ocultos_${hoyISO()}`

function leerOcultos(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_OCULTOS()) || '[]') as string[] } catch { return [] }
}

/* ── insights ─────────────────────────────────────────────────── */

export function LucaInsights({ insights, cargando = false }: { insights: Insight[]; cargando?: boolean }) {
  const [ocultos, setOcultos] = useState<string[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [porQue, setPorQue] = useState(false)

  useEffect(() => { setOcultos(leerOcultos()) }, [])

  const visibles = insights.filter(i => !ocultos.includes(i.id))
  const principal = visibles.find(i => i.id === abierto) ?? visibles[0]
  const resto = visibles.filter(i => i !== principal).slice(0, 3)

  function ocultar(id: string) {
    const n = [...ocultos, id]
    setOcultos(n)
    setPorQue(false)
    try { localStorage.setItem(CLAVE_OCULTOS(), JSON.stringify(n)) } catch { /* sin storage */ }
  }

  function irA(href: string, e: React.MouseEvent) {
    if (!href.startsWith('#')) return
    e.preventDefault()
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const estado: LucaEstado = cargando ? 'thinking' : principal ? (principal.tipo === 'atencion' ? 'warning' : principal.tipo === 'progreso' ? 'success' : 'insight') : 'idle'
  const t = principal ? TIPO[principal.tipo] : null

  return (
    <section aria-labelledby="t-luca" className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border p-5"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent-positive) 22%, var(--border-subtle))',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-positive) 5%, var(--bg-card)) 0%, var(--bg-card) 60%)',
      }}>
      <div className="flex items-center gap-3">
        <div className="luca-float"><LucaAvatar estado={estado} size={38} /></div>
        <div className="min-w-0 flex-1">
          <h2 id="t-luca" className="text-sm font-bold text-primary">Luca</h2>
          <p className="text-[11px] text-secondary" aria-live="polite">
            {cargando ? 'Mirando tus números…' : visibles.length ? `Detecté ${visibles.length} ${visibles.length === 1 ? 'cosa' : 'cosas'} para mirar` : 'No veo nada raro por ahora'}
          </p>
        </div>
      </div>

      {principal && t ? (
        <div key={principal.id} className="fa-page-in mb-4 mt-4">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: t.color }}>
            <t.Icono size={13} /> {t.label}
          </p>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-primary">{principal.titulo}</p>

          <div className="fa-colapsable" data-abierto={porQue}>
            <div>
              <p className="mt-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-secondary" style={{ background: 'var(--bg-alternate)' }}>
                {principal.detalle}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {principal.accion && (
              <Link href={principal.accion.href} onClick={e => principal.accion && irA(principal.accion.href, e)}
                className="fa-press rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover">
                {principal.accion.label}
              </Link>
            )}
            <button onClick={() => setPorQue(v => !v)} aria-expanded={porQue}
              className="fa-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-alternate hover:text-primary">
              {porQue ? 'Ocultar detalle' : '¿Por qué?'}
              <ChevronDown size={13} style={{ transform: porQue ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} />
            </button>
            <button onClick={() => ocultar(principal.id)} aria-label="Ocultar este aviso por hoy" title="Ocultar por hoy"
              className="fa-press ml-auto rounded-lg p-1.5 text-muted hover:bg-alternate hover:text-primary"><X size={14} /></button>
          </div>
        </div>
      ) : !cargando && (
        <p className="mt-4 text-sm text-secondary">Tus números están en orden. Cuando detecte algo importante (un vencimiento, un gasto fuera de lo normal, una meta cerca) te lo muestro acá.</p>
      )}

      {resto.length > 0 && (
        <ul className="mt-auto space-y-0.5 border-t pt-3 fa-hairline">
          {resto.map(i => {
            const ti = TIPO[i.tipo]
            return (
              <li key={i.id}>
                <button onClick={() => { setAbierto(i.id); setPorQue(false) }}
                  className="fa-press flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-alternate">
                  <ti.Icono size={13} className="mt-0.5 shrink-0" style={{ color: ti.color }} />
                  <span className="line-clamp-2 text-secondary">{i.titulo}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ── captura en lenguaje natural ──────────────────────────────── */

export interface GastoDetectado {
  nombre: string
  monto: number
  categoria: string
  fecha: string
  medio_pago?: string
  forma_pago?: 'debito' | 'credito'
  cuotas?: number
  moneda?: 'ARS' | 'USD'
}

type Paso = 'idle' | 'escuchando' | 'pensando' | 'confirmar' | 'guardando' | 'error'

export function CapturaLuca({ onGuardar, autoFoco = false, flotante = false }: {
  /** guarda y devuelve un error (o null) */
  onGuardar: (g: GastoDetectado) => Promise<string | null>
  autoFoco?: boolean
  /** desktop: la confirmación flota debajo del input sin empujar la pantalla */
  flotante?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [paso, setPaso] = useState<Paso>('idle')
  const [g, setG] = useState<GastoDetectado | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (autoFoco) setTimeout(() => input.current?.focus(), 60) }, [autoFoco])

  async function interpretar() {
    if (!texto.trim()) return
    setPaso('pensando')
    setError('')
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto }) })
      const d = await r.json()
      if (!d?.nombre || !(Number(d.monto) > 0)) throw new Error('sin datos')
      setG({ ...d, monto: Number(d.monto) })
      setPaso('confirmar')
    } catch {
      setError('No lo pude entender. Probá con monto y en qué: “12.500 en farmacia”.')
      setPaso('error')
    }
  }

  async function confirmar() {
    if (!g) return
    setPaso('guardando')
    const e = await onGuardar(g)
    if (e) { setError(e); setPaso('error'); return }
    setTexto('')
    setG(null)
    setPaso('idle')
  }

  function cancelar() {
    setG(null)
    setPaso(texto ? 'escuchando' : 'idle')
    setError('')
    input.current?.focus()
  }

  const estado: LucaEstado = paso === 'escuchando' ? 'listening' : paso === 'pensando' ? 'thinking'
    : paso === 'guardando' ? 'saving' : paso === 'error' ? 'warning' : paso === 'confirmar' ? 'insight' : 'idle'

  return (
    <div className="relative w-full">
      <form onSubmit={e => { e.preventDefault(); if (paso === 'confirmar') confirmar(); else interpretar() }}
        className="flex items-center gap-2 rounded-2xl border px-2 py-1.5 transition-colors focus-within:border-[var(--accent-confirm)]"
        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
        <span className="shrink-0"><LucaAvatar estado={estado} size={30} /></span>
        <label htmlFor="captura-luca" className="sr-only">Contale a Luca un gasto</label>
        <input id="captura-luca" ref={input} value={texto} autoComplete="off"
          onChange={e => { setTexto(e.target.value); if (paso === 'idle' || paso === 'error') setPaso('escuchando') }}
          onFocus={() => paso === 'idle' && setPaso('escuchando')}
          onBlur={() => paso === 'escuchando' && !texto && setPaso('idle')}
          onKeyDown={e => { if (e.key === 'Escape') cancelar() }}
          disabled={paso === 'pensando' || paso === 'guardando'}
          placeholder="Contale a Luca: “Gasté 18.500 en comida con Mercado Pago”"
          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-sm text-primary outline-none placeholder:text-muted" />
        <button type="submit" disabled={!texto.trim() || paso === 'pensando' || paso === 'guardando'}
          className="fa-press shrink-0 rounded-xl bg-confirm px-3.5 py-2 text-xs font-semibold text-white hover:bg-confirm-hover disabled:opacity-40">
          {paso === 'pensando' ? 'Pensando…' : paso === 'confirmar' ? 'Confirmar' : paso === 'guardando' ? 'Guardando…' : 'Enviar'}
        </button>
      </form>

      {error && paso === 'error' && <p className={`mt-2 px-2 text-xs text-negative ${flotante ? 'absolute inset-x-0 top-full' : ''}`} role="alert">{error}</p>}

      {/* lo que entendió Luca: se confirma antes de guardar */}
      {g && (paso === 'confirmar' || paso === 'guardando') && (
        <div className={`fa-pop mt-2 rounded-2xl border p-4 shadow-card-hover ${flotante ? 'absolute inset-x-0 top-full z-40' : ''}`} style={{ background: 'var(--bg-alternate)', borderColor: 'var(--border-color)' }}
          role="dialog" aria-label="Confirmar gasto detectado">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-secondary">Luca entendió</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-primary">{g.nombre}</p>
              <label className="mt-0.5 flex items-baseline gap-1 text-[1.6rem] font-extrabold tabular-nums text-primary">
                <span>{g.moneda === 'USD' ? 'US$' : '$'}</span>
                <input type="number" inputMode="decimal" value={g.monto} aria-label="Monto"
                  onChange={e => setG({ ...g, monto: Number(e.target.value) })}
                  className="w-40 border-0 border-b border-dashed bg-transparent p-0 text-[1.6rem] font-extrabold tabular-nums text-primary outline-none"
                  style={{ borderColor: 'var(--border-color)' }} />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <select value={g.categoria} onChange={e => setG({ ...g, categoria: e.target.value })} aria-label="Categoría"
                className="rounded-full border px-2.5 py-1 text-xs text-primary" style={{ background: 'var(--bg-card)' }}>
                {!CATEGORIAS.some(c => c.key === g.categoria) && <option value={g.categoria}>{getCat(g.categoria).emoji} {g.categoria}</option>}
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
              <span className="rounded-full border px-2.5 py-1 text-secondary fa-hairline">{g.medio_pago ? `${g.medio_pago} · ${g.forma_pago === 'credito' ? `crédito${(g.cuotas ?? 1) > 1 ? ` · ${g.cuotas} cuotas` : ''}` : 'débito'}` : 'Efectivo / sin medio'}</span>
              <span className="rounded-full border px-2.5 py-1 text-secondary fa-hairline">{fmtFechaCorta(g.fecha)}</span>
            </div>
          </div>
          {g.medio_pago && g.forma_pago !== 'credito' && (
            <p className="mt-2 text-[11px] text-muted">Se descuenta del disponible de {g.medio_pago}.</p>
          )}
          {g.forma_pago === 'credito' && (g.cuotas ?? 1) > 1 && (
            <p className="mt-2 text-[11px] text-muted">{g.cuotas} cuotas de {fmt(g.monto / (g.cuotas ?? 1))}: se suman a tus compromisos futuros.</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={confirmar} disabled={paso === 'guardando' || !(g.monto > 0)} autoFocus
              className="fa-press inline-flex items-center gap-1.5 rounded-lg bg-confirm px-3.5 py-2 text-xs font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
              <Check size={14} /> {paso === 'guardando' ? 'Guardando…' : 'Confirmar gasto'}
            </button>
            <button onClick={cancelar} className="fa-press rounded-lg px-3 py-2 text-xs font-semibold text-secondary hover:bg-card hover:text-primary">Cancelar</button>
            <span className="ml-auto hidden text-[11px] text-muted sm:inline">Enter confirma · Esc cancela</span>
          </div>
        </div>
      )}
    </div>
  )
}
