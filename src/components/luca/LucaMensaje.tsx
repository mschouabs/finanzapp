'use client'

import Link from 'next/link'
import { LucaAvatar, type LucaEstado } from './LucaAvatar'

/* Panel reutilizable de Luca. Sirve para el insight del Resumen, para
   estados vacíos, alertas y confirmaciones: cambia el estado y el
   texto, no el componente. */

interface Accion {
  label: string
  href?: string
  onClick?: () => void
}

interface Props {
  estado?: LucaEstado
  titulo?: string
  children: React.ReactNode
  accion?: Accion
  /** 'panel' es la card con encabezado; 'vacio' se centra para listas sin datos. */
  variante?: 'panel' | 'vacio'
  className?: string
}

export function LucaMensaje({
  estado = 'idle',
  titulo,
  children,
  accion,
  variante = 'panel',
  className = '',
}: Props) {
  const boton = accion && (
    accion.href ? (
      <Link
        href={accion.href}
        className="mt-4 inline-block rounded-lg bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover"
      >
        {accion.label}
      </Link>
    ) : (
      <button
        onClick={accion.onClick}
        className="mt-4 rounded-lg bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover"
      >
        {accion.label}
      </button>
    )
  )

  if (variante === 'vacio') {
    return (
      <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
        <LucaAvatar estado={estado} size={68} />
        {titulo && <p className="mt-4 text-sm font-bold text-primary">{titulo}</p>}
        <div className="mt-1.5 max-w-xs text-xs leading-relaxed text-secondary">{children}</div>
        {boton}
      </div>
    )
  }

  return (
    <section className={`fa-card p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <LucaAvatar estado={estado} size={30} />
        <h3 className="text-sm font-bold text-primary">{titulo ?? 'Luca dice:'}</h3>
      </div>
      <div className="rounded-xl border bg-alternate p-4 text-sm leading-relaxed text-primary">
        {children}
      </div>
      {boton}
    </section>
  )
}
