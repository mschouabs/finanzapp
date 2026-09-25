'use client'

/* ── Piezas visuales compartidas ─────────────────────────────────────
   El mismo lenguaje que Billeteras y Tarjetas: tarjetas que se elevan
   al pasar el mouse, anillos y donas en SVG, selectores segmentados.
   Sin dependencias: todo SVG + variables de tema.                    */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'

export const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 10, fontSize: 12, color: 'var(--text-primary)',
}

export const PALETA = ['#32D158', '#63A9FF', '#A855F7', '#F5C451', '#FF5873', '#14B8A6', '#FF8A3D', '#DF7897', '#79C0FF', '#94A3B8']

/* ── Selector segmentado ─────────────────────────────────────────── */

export function Segmentado<T extends string>({ opciones, valor, onCambio, className = '' }: {
  opciones: readonly { key: T; label: ReactNode }[]
  valor: T
  onCambio: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex gap-1 rounded-lg bg-alternate p-1 ${className}`} role="tablist">
      {opciones.map(o => (
        <button
          key={o.key}
          role="tab"
          aria-selected={valor === o.key}
          onClick={() => onCambio(o.key)}
          className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
          style={valor === o.key
            ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.18)' }
            : { color: 'var(--text-secondary)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── KPI ─────────────────────────────────────────────────────────── */

export function Kpi({ label, valor, sub, icono, tono = 'var(--accent-secondary)', href }: {
  label: string; valor: ReactNode; sub?: ReactNode; icono?: ReactNode; tono?: string; href?: string
}) {
  const cuerpo = (
    <div className="fa-card fa-lift flex h-full items-start gap-3 p-4">
      {icono && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${tono} 16%, transparent)`, color: tono }}>
          {icono}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</p>
        <p className="fa-amount mt-0.5 truncate text-xl text-primary">{valor}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href} className="block h-full">{cuerpo}</Link> : cuerpo
}

/* ── Anillo de progreso ──────────────────────────────────────────── */

export function AnilloProgreso({ pct, size = 96, grosor = 10, color = 'var(--accent-positive)', children }: {
  pct: number; size?: number; grosor?: number; color?: string; children?: ReactNode
}) {
  const r = size / 2 - grosor / 2 - 1
  const circ = 2 * Math.PI * r
  const visible = (Math.min(Math.max(pct, 0), 100) / 100) * circ
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-color)" strokeWidth={grosor} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={`${visible} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/* ── Dona interactiva ────────────────────────────────────────────── */

export interface Porcion { key: string; label: string; valor: number; color: string }

export function Dona({ datos, size = 170, grosor = 22, centro, activo, onElegir }: {
  datos: Porcion[]
  size?: number
  grosor?: number
  centro?: ReactNode
  /** porción resaltada (las demás se apagan) */
  activo?: string | null
  onElegir?: (key: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = datos.reduce((s, d) => s + Math.max(d.valor, 0), 0)
  const r = size / 2 - grosor / 2 - 4
  const circ = 2 * Math.PI * r
  const gap = datos.length > 1 ? 2 : 0
  let acum = 0
  const foco = hover ?? activo ?? null
  const enFoco = datos.find(d => d.key === foco)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribución">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-color)" strokeWidth={grosor} opacity={0.35} />
        {total > 0 && datos.map(d => {
          const largo = (Math.max(d.valor, 0) / total) * circ
          const offset = acum
          acum += largo
          if (largo <= 0) return null
          const apagada = foco !== null && foco !== d.key
          return (
            <circle
              key={d.key}
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
              strokeWidth={foco === d.key ? grosor + 5 : grosor}
              strokeDasharray={`${Math.max(largo - gap, 0.5)} ${circ}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              opacity={apagada ? 0.28 : 1}
              style={{ transition: 'opacity .2s, stroke-width .2s', cursor: onElegir ? 'pointer' : 'default' }}
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onElegir?.(d.key)}
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {enFoco ? (
          <>
            <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wide text-secondary">{enFoco.label}</span>
            <span className="fa-amount text-lg text-primary">{total > 0 ? Math.round((enFoco.valor / total) * 100) : 0}%</span>
          </>
        ) : centro}
      </div>
    </div>
  )
}

/** Leyenda clickeable que acompaña a la dona. */
export function Leyenda({ datos, fmt, activo, onElegir, max = 8 }: {
  datos: Porcion[]; fmt: (n: number) => string; activo?: string | null; onElegir?: (key: string) => void; max?: number
}) {
  const total = datos.reduce((s, d) => s + Math.max(d.valor, 0), 0)
  return (
    <ul className="min-w-0 flex-1 space-y-0.5">
      {datos.slice(0, max).map(d => {
        const pct = total > 0 ? Math.round((d.valor / total) * 100) : 0
        const on = activo === d.key
        return (
          <li key={d.key}>
            <button
              type="button"
              onClick={() => onElegir?.(d.key)}
              disabled={!onElegir}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${onElegir ? 'hover:bg-alternate' : ''} ${on ? 'bg-alternate' : ''}`}
              style={activo && !on ? { opacity: 0.5 } : undefined}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-secondary">{d.label}</span>
              <span className="fa-amount shrink-0 text-primary">{fmt(d.valor)}</span>
              <span className="w-9 shrink-0 text-right text-muted">{pct}%</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Barra apilada (exposición por moneda, etc.) ─────────────────── */

export function BarraApilada({ datos, alto = 12 }: { datos: Porcion[]; alto?: number }) {
  const total = datos.reduce((s, d) => s + Math.max(d.valor, 0), 0)
  return (
    <div className="flex w-full overflow-hidden rounded-full" style={{ height: alto, background: 'var(--border-color)' }}>
      {total > 0 && datos.map(d => (
        <div
          key={d.key}
          title={`${d.label}: ${Math.round((d.valor / total) * 100)}%`}
          style={{ width: `${(Math.max(d.valor, 0) / total) * 100}%`, background: d.color, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      ))}
    </div>
  )
}

/* ── Encabezado de sección ───────────────────────────────────────── */

export function Titulo({ titulo, sub, derecha }: { titulo: ReactNode; sub?: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-primary">{titulo}</h2>
        {sub && <p className="mt-0.5 text-xs text-secondary">{sub}</p>}
      </div>
      {derecha}
    </div>
  )
}

/** Formato corto para ejes y tarjetas: $1,2M / $350K / $900 */
export const fmtK = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  : Math.abs(n) >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n).toLocaleString('es-AR')}`

export const fmtPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
