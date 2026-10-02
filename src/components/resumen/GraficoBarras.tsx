'use client'

/* ── Gráfico de barras por período (SVG propio) ────────────────────
   Día a día (o mes a mes) de un solo valor, con dos lecturas:
   · barras    → ¿qué días gasté más?
   · acumulado → ¿voy por encima o por debajo del período anterior?
   Hover: tooltip. Click en una barra: la elige (para filtrar la lista). */

import { useEffect, useRef, useState } from 'react'
import { fmt, fmtCorto } from './base'

export interface PuntoBarra {
  clave: string
  etiqueta: string
  valor: number
  /** mismo punto del período anterior (para el acumulado) */
  anterior?: number
}

function ticks(max: number, n = 4) {
  if (max <= 0) return [0, 1]
  const bruto = max / n
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)))
  const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto) ?? bruto
  const out: number[] = []
  for (let v = 0; v <= Math.ceil(max / paso) * paso + paso / 2; v += paso) out.push(Math.round(v))
  return out
}

export function GraficoBarras({ datos, modo, seleccion, onElegir, alto = 220, color = 'var(--accent-negative)', etiquetaAnterior = 'Período anterior' }: {
  datos: PuntoBarra[]
  modo: 'barras' | 'acumulado'
  seleccion?: string | null
  onElegir?: (clave: string | null) => void
  alto?: number
  color?: string
  etiquetaAnterior?: string
}) {
  const cont = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(280)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = cont.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const m = { top: 12, right: 12, bottom: 24, left: 48 }
  const w = ancho - m.left - m.right
  const h = alto - m.top - m.bottom
  const n = Math.max(datos.length, 1)
  const banda = w / n

  /* serie a dibujar según el modo */
  let acA = 0, acB = 0
  const acumulado = datos.map(d => { acA += d.valor; acB += d.anterior ?? 0; return { a: acA, b: acB } })
  const hayAnterior = datos.some(d => (d.anterior ?? 0) > 0)
  const max = modo === 'barras'
    ? Math.max(...datos.map(d => d.valor), 1)
    : Math.max(...acumulado.map(x => Math.max(x.a, hayAnterior ? x.b : 0)), 1)
  const escala = ticks(max)
  const tope = escala[escala.length - 1] || 1
  const y = (v: number) => m.top + h - (v / tope) * h
  const x = (i: number) => m.left + banda * i + banda / 2
  /* no escribir todas las etiquetas si no entran */
  const cadaCuanto = Math.ceil(n / Math.max(1, Math.floor(w / 34)))

  const indice = (clientX: number) => {
    const r = cont.current?.getBoundingClientRect()
    if (!r) return null
    const i = Math.floor((clientX - r.left - m.left) / banda)
    return i >= 0 && i < n ? i : null
  }

  const p = hover !== null ? datos[hover] : null

  return (
    <div ref={cont} className="relative w-full select-none" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" className="fa-grafico" style={{ overflow: 'visible', cursor: onElegir ? 'pointer' : 'default' }}
        aria-label={modo === 'barras' ? 'Gasto por período' : 'Gasto acumulado comparado con el período anterior'}
        onMouseMove={e => setHover(indice(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={e => {
          const i = indice(e.clientX)
          if (i === null || !onElegir) return
          onElegir(datos[i].clave === seleccion ? null : datos[i].clave)
        }}>
        {escala.map(t => (
          <g key={t}>
            <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border-color)' : 'var(--border-subtle)'} strokeWidth={1} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCorto(t)}</text>
          </g>
        ))}

        {datos.map((d, i) => (i % cadaCuanto === 0 || d.clave === seleccion) && (
          <text key={d.clave} x={x(i)} y={alto - 6} textAnchor="middle" fontSize={11}
            fill={d.clave === seleccion ? 'var(--text-primary)' : 'var(--text-muted)'} fontWeight={d.clave === seleccion ? 600 : 400}>
            {d.etiqueta}
          </text>
        ))}

        {hover !== null && (
          <rect x={m.left + banda * hover + 1} y={m.top} width={Math.max(banda - 2, 2)} height={h} rx={4}
            fill="color-mix(in srgb, var(--text-primary) 5%, transparent)" />
        )}

        {modo === 'barras' ? datos.map((d, i) => {
          if (d.valor <= 0) return null
          const bw = Math.max(2, Math.min(24, banda * 0.62))
          const top = y(d.valor), base = y(0)
          const r = Math.min(4, (base - top) / 2, bw / 2)
          const px = x(i) - bw / 2
          const path = `M${px},${base} V${top + r} Q${px},${top} ${px + r},${top} H${px + bw - r} Q${px + bw},${top} ${px + bw},${top + r} V${base} Z`
          const apagada = (seleccion && d.clave !== seleccion) || (hover !== null && hover !== i && !seleccion)
          return (
            <path key={d.clave} d={path} fill={color} opacity={apagada ? 0.4 : 1}
              style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animation: `fa-grow-y 560ms cubic-bezier(.2,.8,.2,1) ${Math.min(i * 12, 360)}ms both`, transition: 'opacity 140ms ease' }} />
          )
        }) : (
          <g key={`acum-${datos.length}`}>
            {hayAnterior && (
              <path d={acumulado.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v.b)}`).join(' ')} fill="none"
                stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />
            )}
            <path d={acumulado.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v.a)}`).join(' ')} fill="none"
              stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="fa-draw" />
            {hover !== null && (
              <>
                {hayAnterior && <circle cx={x(hover)} cy={y(acumulado[hover].b)} r={4} fill="var(--text-muted)" stroke="var(--bg-card)" strokeWidth={2} />}
                <circle cx={x(hover)} cy={y(acumulado[hover].a)} r={4.5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
              </>
            )}
          </g>
        )}
      </svg>

      {p && hover !== null && (
        <div className="pointer-events-none absolute z-10 min-w-[160px] rounded-xl border px-3 py-2 text-xs shadow-card-hover"
          style={{ background: 'var(--bg-alternate)', borderColor: 'var(--border-color)', left: Math.min(Math.max(x(hover) - 80, 0), ancho - 170), top: -6 }}>
          <p className="mb-1 font-semibold text-primary">{p.etiqueta}</p>
          {modo === 'barras' ? (
            <p className="flex justify-between gap-3"><span className="text-secondary">Gastado</span><span className="font-semibold tabular-nums text-primary">{fmt(p.valor)}</span></p>
          ) : (
            <>
              <p className="flex justify-between gap-3"><span className="text-secondary">Acumulado</span><span className="font-semibold tabular-nums text-primary">{fmt(acumulado[hover].a)}</span></p>
              {hayAnterior && <p className="flex justify-between gap-3"><span className="text-secondary">{etiquetaAnterior}</span><span className="tabular-nums text-secondary">{fmt(acumulado[hover].b)}</span></p>}
            </>
          )}
          {onElegir && modo === 'barras' && <p className="mt-1 text-[11px] text-muted">{p.clave === seleccion ? 'Click para quitar el filtro' : 'Click para ver esos movimientos'}</p>}
        </div>
      )}
    </div>
  )
}
