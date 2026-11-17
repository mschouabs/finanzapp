'use client'

/* ── Widget: la unidad del sistema ───────────────────────────────────
   Tamaños en grilla: S = 1×1, M = 2×1, L = 2×2 (en celular S ocupa media
   fila y M/L la fila entera). Misma anatomía en todos: título → dato
   principal → dato secundario → acción. Cada uno tiene sus estados:
   cargando (skeleton), vacío, error y con datos.                      */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight, EyeOff, GripVertical, Maximize2, Minimize2 } from 'lucide-react'
import type { HandleProps } from '@/components/GrillaOrdenable'
import type { Tam } from '@/lib/inicio'

export const SPAN: Record<Tam, string> = {
  S: 'col-span-1',
  M: 'col-span-2',
  L: 'col-span-2 lg:row-span-2',
}

export interface Edicion {
  handle: HandleProps
  tam: Tam
  tamanos: Tam[]
  onTam: (t: Tam) => void
  onOcultar: () => void
}

export function Widget({ titulo, href, derecha, estado = 'ok', vacio, onReintentar, sinMarco = false, edicion, children, className = '' }: {
  titulo: string
  href?: string
  derecha?: ReactNode
  estado?: 'ok' | 'cargando' | 'vacio' | 'error'
  /** qué mostrar cuando no hay datos (con una acción para empezar) */
  vacio?: ReactNode
  onReintentar?: () => void
  /** el contenido ya trae su propia superficie */
  sinMarco?: boolean
  edicion?: Edicion
  children?: ReactNode
  className?: string
}) {
  const cabecera = (
    <div className="flex min-h-[28px] items-center gap-2">
      {edicion && (
        <button type="button" {...edicion.handle} className="-ml-1 grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-alternate hover:text-primary">
          <GripVertical size={16} />
        </button>
      )}
      {href && !edicion ? (
        <Link href={href} className="group flex min-w-0 flex-1 items-center gap-1 text-[13px] font-medium text-secondary hover:text-primary">
          <span className="truncate">{titulo}</span>
          <ChevronRight size={14} className="opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </Link>
      ) : (
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-secondary">{titulo}</p>
      )}
      {edicion ? (
        <div className="flex items-center gap-1">
          {edicion.tamanos.length > 1 && (
            <button type="button" onClick={() => edicion.onTam(edicion.tamanos[(edicion.tamanos.indexOf(edicion.tam) + 1) % edicion.tamanos.length])}
              className="flex h-8 items-center gap-1 rounded-control bg-alternate px-2 text-xs font-medium text-primary"
              aria-label={`Tamaño ${edicion.tam}. Cambiar tamaño`}>
              {edicion.tam === 'L' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{edicion.tam}
            </button>
          )}
          <button type="button" onClick={edicion.onOcultar} aria-label={`Ocultar ${titulo}`}
            className="grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-alternate hover:text-primary">
            <EyeOff size={15} />
          </button>
        </div>
      ) : derecha}
    </div>
  )

  let cuerpo: ReactNode = children
  if (estado === 'cargando') cuerpo = <Esqueleto />
  else if (estado === 'error') cuerpo = (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 py-4">
      <p className="text-sm text-primary">No se pudo cargar.</p>
      {onReintentar && <button onClick={onReintentar} className="text-sm font-medium text-info hover:underline">Reintentar</button>}
    </div>
  )
  else if (estado === 'vacio') cuerpo = <div className="flex flex-1 flex-col justify-center py-3 text-sm text-secondary">{vacio}</div>

  if (sinMarco && estado === 'ok' && !edicion) return <div className={`h-full ${className}`}>{children}</div>

  return (
    <section className={`fa-card flex h-full min-w-0 flex-col gap-3 p-4 sm:p-5 ${edicion ? 'ring-1 ring-[var(--border-color)]' : ''} ${className}`}
      aria-label={titulo}>
      {cabecera}
      <div className={`flex min-w-0 flex-1 flex-col ${edicion ? 'pointer-events-none select-none opacity-70' : ''}`}>{cuerpo}</div>
    </section>
  )
}

function Esqueleto() {
  const B = ({ c }: { c: string }) => <div className={`animate-pulse rounded-md bg-alternate ${c}`} />
  return <div className="space-y-2.5 py-1" aria-hidden="true"><B c="h-8 w-2/3" /><B c="h-3 w-1/2" /><B c="h-2 w-full" /></div>
}

/* ── mini gráfico de línea (sin librerías) ── */
export function Sparkline({ valores, color = 'var(--text-secondary)', alto = 32 }: { valores: number[]; color?: string; alto?: number }) {
  if (valores.length < 2) return null
  const min = Math.min(...valores), max = Math.max(...valores)
  const r = max - min || 1
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * 100},${alto - 3 - ((v - min) / r) * (alto - 6)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height: alto }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
