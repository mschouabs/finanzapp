/* Etiqueta de estado única para toda la app (Pagado, Pendiente, Vencido,
   Cobrado, Abierto…): fondo teñido del color del estado, sin borde. */
import type { ReactNode } from 'react'

export type Tono = 'positivo' | 'advertencia' | 'negativo' | 'info' | 'neutro'

export const COLOR_TONO: Record<Tono, string> = {
  positivo: 'var(--accent-positive)',
  advertencia: 'var(--accent-warning, #F5C451)',
  negativo: 'var(--accent-negative)',
  info: 'var(--accent-secondary)',
  neutro: 'var(--text-secondary)',
}

export const estiloEstado = (tono: Tono) => ({
  color: COLOR_TONO[tono],
  background: tono === 'neutro' ? 'var(--bg-alternate)' : `color-mix(in srgb, ${COLOR_TONO[tono]} 14%, transparent)`,
})

export const CLASE_ESTADO = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none'

export function Estado({ tono, children, className = '' }: { tono: Tono; children: ReactNode; className?: string }) {
  return <span className={`${CLASE_ESTADO} ${className}`} style={estiloEstado(tono)}>{children}</span>
}
