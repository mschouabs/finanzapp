'use client'

/* ── Gráfico mensual (SVG propio, sin recharts) ────────────────────
   Un solo componente para las tres preguntas de "Evolución":
   · balance  → ¿cerré en positivo o en negativo?  (columnas desde 0)
   · flujo    → ¿entra más de lo que sale?          (2 líneas)
   · patrimonio → ¿cómo evolucionó lo que tengo?    (línea + área)
   Liviano (sin dependencia de 90 KB), animado una sola vez al cargar,
   con crosshair + tooltip al pasar el mouse, tap en mobile y click
   para elegir un mes.                                                */

import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fmtCorto } from './base'
import { nombreMes, nombreMesCorto } from '@/lib/finanzas/nucleo'

export interface PuntoMes {
  mes: string
  ingresos?: number
  gastos?: number
  balance?: number
  patrimonio?: number
}

export type Modo = 'balance' | 'flujo' | 'patrimonio'

const COLOR = {
  ingresos: 'var(--accent-positive)',
  gastos: 'var(--accent-negative)',
  patrimonio: 'var(--accent-secondary)',
}

/** Ticks "redondos" para el eje Y. */
function ticks(min: number, max: number, n = 4) {
  if (max === min) { max = min + 1 }
  const bruto = (max - min) / n
  const pot = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)))
  const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto) ?? bruto
  const desde = Math.floor(min / paso) * paso
  const hasta = Math.ceil(max / paso) * paso
  const out: number[] = []
  for (let v = desde; v <= hasta + paso / 2; v += paso) out.push(Math.round(v))
  return out
}

export function GraficoMensual({ datos, modo, mesSel, onElegir, alto = 240, etiquetaSerie = 'Patrimonio neto', ocultarMontos = false }: {
  /** nombre de la serie en el tooltip (modo patrimonio) */
  etiquetaSerie?: string
  /** modo "ocultar montos": ejes y tooltips sin cifras */
  ocultarMontos?: boolean
  datos: PuntoMes[]
  modo: Modo
  mesSel?: string | null
  onElegir?: (mes: string) => void
  alto?: number
}) {
  const cont = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(280)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = cont.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const m = { top: 14, right: 64, bottom: 26, left: 52 }
  const w = ancho - m.left - m.right
  const h = alto - m.top - m.bottom

  const series = useMemo(() => {
    if (modo === 'balance') return [{ key: 'balance' as const, valores: datos.map(d => d.balance ?? 0) }]
    if (modo === 'flujo') return [
      { key: 'ingresos' as const, valores: datos.map(d => d.ingresos ?? 0) },
      { key: 'gastos' as const, valores: datos.map(d => d.gastos ?? 0) },
    ]
    return [{ key: 'patrimonio' as const, valores: datos.map(d => d.patrimonio ?? 0) }]
  }, [datos, modo])

  const todos = series.flatMap(s => s.valores)
  const minV = modo === 'patrimonio' ? Math.min(...todos) * 0.96 : Math.min(0, ...todos)
  const maxV = Math.max(0, ...todos)
  const escala = ticks(minV, maxV)
  const y0 = escala[0], y1 = escala[escala.length - 1]
  const y = (v: number) => m.top + h - ((v - y0) / (y1 - y0 || 1)) * h
  const banda = w / Math.max(datos.length, 1)
  const x = (i: number) => m.left + banda * i + banda / 2

  const puntoHover = hover !== null ? datos[hover] : null

  function elegirDesdeEvento(clientX: number) {
    const r = cont.current?.getBoundingClientRect()
    if (!r) return null
    const i = Math.floor((clientX - r.left - m.left) / banda)
    return i >= 0 && i < datos.length ? i : null
  }

  if (datos.length === 0) return null

  return (
    <div ref={cont} className="relative w-full select-none" style={{ height: alto }}>
      <svg width={ancho} height={alto} role="img" className="fa-grafico"
        aria-label={`Gráfico mensual de ${modo === 'balance' ? 'balance' : modo === 'flujo' ? 'ingresos y gastos' : 'patrimonio neto'}`}
        onMouseMove={e => setHover(elegirDesdeEvento(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={e => { const i = elegirDesdeEvento(e.clientX); if (i !== null) { setHover(i); onElegir?.(datos[i].mes) } }}
        style={{ cursor: onElegir ? 'pointer' : 'default', overflow: 'visible' }}>

        {/* grilla y eje Y: hairlines sólidas, recesivas */}
        {escala.map(t => (
          <g key={t}>
            <line x1={m.left} x2={m.left + w} y1={y(t)} y2={y(t)}
              stroke={t === 0 && modo !== 'patrimonio' ? 'var(--border-color)' : 'var(--border-subtle)'} strokeWidth={1} />
            <text x={m.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}>{ocultarMontos ? '' : fmtCorto(t)}</text>
          </g>
        ))}

        {/* banda del mes elegido / en hover */}
        {datos.map((d, i) => {
          const elegido = d.mes === mesSel
          if (!elegido && hover !== i) return null
          return <rect key={d.mes} x={m.left + banda * i + 2} y={m.top} width={banda - 4} height={h} rx={6}
            fill={elegido ? 'color-mix(in srgb, var(--accent-secondary) 9%, transparent)' : 'color-mix(in srgb, var(--text-primary) 4%, transparent)'} />
        })}

        {/* eje X */}
        {datos.map((d, i) => (
          <text key={d.mes} x={x(i)} y={alto - 6} textAnchor="middle" fontSize={11}
            fill={d.mes === mesSel ? 'var(--text-primary)' : 'var(--text-muted)'} fontWeight={d.mes === mesSel ? 600 : 400}>
            {nombreMesCorto(d.mes)}
          </text>
        ))}

        {/* BALANCE: columnas desde el cero, verde arriba / rojo abajo */}
        {modo === 'balance' && datos.map((d, i) => {
          const v = d.balance ?? 0
          const anchoBarra = Math.min(24, banda * 0.5)
          const top = y(Math.max(v, 0)), base = y(Math.min(v, 0))
          const alto2 = Math.max(1, base - top)
          const positivo = v >= 0
          const r = Math.min(4, alto2 / 2)
          /* 4px redondeado solo en la punta del dato, recto contra la base */
          const px = x(i) - anchoBarra / 2
          const path = positivo
            ? `M${px},${base} V${top + r} Q${px},${top} ${px + r},${top} H${px + anchoBarra - r} Q${px + anchoBarra},${top} ${px + anchoBarra},${top + r} V${base} Z`
            : `M${px},${top} V${base - r} Q${px},${base} ${px + r},${base} H${px + anchoBarra - r} Q${px + anchoBarra},${base} ${px + anchoBarra},${base - r} V${top} Z`
          const atenuado = hover !== null && hover !== i
          return (
            <path key={d.mes} d={path} fill={positivo ? COLOR.ingresos : COLOR.gastos}
              opacity={atenuado ? 0.45 : 1}
              style={{
                transformBox: 'fill-box', transformOrigin: positivo ? 'bottom' : 'top',
                animation: `fa-grow-y 620ms cubic-bezier(.2,.8,.2,1) ${i * 35}ms both`,
                transition: 'opacity 140ms ease',
              }} />
          )
        })}

        {/* FLUJO / PATRIMONIO: líneas de 2px, se dibujan una vez */}
        {modo !== 'balance' && series.map(s => {
          const pts = s.valores.map((v, i) => [x(i), y(v)] as const)
          const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')
          const color = COLOR[s.key as 'ingresos' | 'gastos' | 'patrimonio']
          const area = modo === 'patrimonio'
            ? `${d} L${pts[pts.length - 1][0]},${m.top + h} L${pts[0][0]},${m.top + h} Z` : null
          const ultimo = pts[pts.length - 1]
          return (
            <g key={`${modo}-${s.key}-${datos.length}`}>
              {area && <path d={area} fill={color} fillOpacity={0.1} className="fa-fade-in" />}
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                pathLength={1} className="fa-draw" />
              {/* punto final + etiqueta directa (solo el último valor) */}
              <circle cx={ultimo[0]} cy={ultimo[1]} r={4} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
              <text x={ultimo[0] + 10} y={ultimo[1]} dy="0.32em" fontSize={11} fill="var(--text-secondary)" fontWeight={600}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {ocultarMontos ? '' : fmtCorto(s.valores[s.valores.length - 1])}
              </text>
            </g>
          )
        })}

        {/* crosshair + puntos en hover */}
        {hover !== null && modo !== 'balance' && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + h} stroke="var(--border-color)" strokeWidth={1} />
            {series.map(s => (
              <circle key={s.key} cx={x(hover)} cy={y(s.valores[hover])} r={4.5}
                fill={COLOR[s.key as 'ingresos' | 'gastos' | 'patrimonio']} stroke="var(--bg-card)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {puntoHover && hover !== null && (
        <div className="pointer-events-none absolute z-10 min-w-[170px] rounded-xl border px-3 py-2.5 text-xs shadow-card-hover"
          style={{
            background: 'var(--bg-alternate)', borderColor: 'var(--border-color)',
            left: Math.min(Math.max(x(hover) - 85, 0), ancho - 180), top: 0,
            transform: 'translateY(-8px)',
          }}>
          <p className="mb-1.5 font-semibold capitalize text-primary">{nombreMes(puntoHover.mes)} {puntoHover.mes.slice(0, 4)}</p>
          {modo === 'patrimonio' ? (
            <Fila color={COLOR.patrimonio} label={etiquetaSerie} valor={ocultarMontos ? '••••••' : fmt(puntoHover.patrimonio ?? 0)} />
          ) : (
            <>
              <Fila color={COLOR.ingresos} label="Entró" valor={fmt(puntoHover.ingresos ?? 0)} />
              <Fila color={COLOR.gastos} label="Salió" valor={fmt(puntoHover.gastos ?? 0)} />
              <div className="my-1 border-t fa-hairline" />
              <Fila label="Quedó" valor={fmt(puntoHover.balance ?? 0)} fuerte />
            </>
          )}
          {onElegir && puntoHover.mes !== mesSel && <p className="mt-1.5 text-[11px] text-muted">Click para ver este mes</p>}
        </div>
      )}
    </div>
  )
}

function Fila({ color, label, valor, fuerte }: { color?: string; label: string; valor: string; fuerte?: boolean }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : <span className="w-2" />}
      <span className="flex-1 text-secondary">{label}</span>
      <span className={`tabular-nums ${fuerte ? 'font-bold text-primary' : 'font-semibold text-primary'}`}>{valor}</span>
    </p>
  )
}
