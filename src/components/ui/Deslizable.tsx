'use client'

/* ── Fila deslizable (celular) ─────────────────────────────────────
   Deslizá una fila hacia la izquierda para ver sus acciones (editar,
   borrar). En computadora no cambia nada: las acciones siguen en la
   fila al pasar el mouse.                                            */

import { useRef, useState, type ReactNode } from 'react'

export interface AccionFila { label: string; icono: ReactNode; onClick: () => void; peligro?: boolean }

const ANCHO = 72

export function Deslizable({ acciones, children, className = '' }: { acciones: AccionFila[]; children: ReactNode; className?: string }) {
  const [x, setX] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const ini = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null)
  const abierto = -ANCHO * acciones.length

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      {/* acciones, detrás de la fila */}
      <div className="absolute inset-y-0 right-0 flex lg:hidden" aria-hidden={x === 0} style={{ opacity: x === 0 && !arrastrando ? 0 : 1 }}>
        {acciones.map(a => (
          <button key={a.label} type="button" tabIndex={x === 0 ? -1 : 0}
            onClick={() => { setX(0); a.onClick() }}
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white"
            style={{ width: ANCHO, background: a.peligro ? 'var(--accent-negative)' : 'var(--accent-secondary)' }}>
            {a.icono}{a.label}
          </button>
        ))}
      </div>

      <div
        className="relative"
        style={{
          transform: `translateX(${x}px)`, background: x !== 0 || arrastrando ? 'var(--bg-card)' : 'transparent',
          transition: arrastrando ? 'none' : 'transform 260ms cubic-bezier(.2,.8,.2,1)',
          touchAction: 'pan-y',
        }}
        onTouchStart={e => { ini.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: x, horizontal: null } }}
        onTouchMove={e => {
          const s = ini.current
          if (!s) return
          const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
          if (s.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.horizontal = Math.abs(dx) > Math.abs(dy)
          if (!s.horizontal) return
          setArrastrando(true)
          setX(Math.max(abierto - 24, Math.min(0, s.base + dx)))
        }}
        onTouchEnd={() => {
          const s = ini.current
          ini.current = null
          setArrastrando(false)
          if (!s?.horizontal) return
          setX(v => (v < abierto / 2 ? abierto : 0))
        }}
        onClickCapture={e => { if (x !== 0) { e.stopPropagation(); e.preventDefault(); setX(0) } }}
      >
        {children}
      </div>
    </div>
  )
}
