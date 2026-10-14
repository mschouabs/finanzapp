'use client'

/* ── Hero: patrimonio + libre para usar ────────────────────────────
   Responde, en este orden: ¿cuánto tengo? ¿dónde está? ¿cuánto debo?
   ¿cómo evolucionó? y, al lado, la pregunta del día a día: ¿cuánto
   puedo usar sin comprometer lo que ya tiene destino?                  */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from 'lucide-react'
import { NumeroAnimado, fmt, fmtCorto, fmtFechaCorta } from './base'
import {
  isoLocal, nombreMes, claveMes,
  type Compromisos, type Patrimonio, type Posicion, type PuntoPatrimonio,
} from '@/lib/finanzas/nucleo'

type Bucket = 'disponible' | 'invertido' | 'deuda'

const TONO: Record<Bucket, string> = {
  disponible: 'var(--accent-secondary)',
  invertido: 'var(--accent-violet)',
  deuda: 'var(--accent-negative)',
}

const ETIQUETA: Record<Bucket, string> = {
  disponible: 'Disponible',
  invertido: 'Invertido',
  deuda: 'Deuda en tarjetas',
}

/* ── patrimonio ───────────────────────────────────────────────── */

export function PatrimonioHero({ p, serie, compacto = false }: { p: Patrimonio; serie: PuntoPatrimonio[]; compacto?: boolean }) {
  const [foco, setFoco] = useState<Bucket | null>(null)
  const [abierto, setAbierto] = useState<Bucket | null>(null)

  const hoy = new Date()
  const mesAnt = nombreMes(claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)))
  const diff = p.anterior !== null ? p.neto - p.anterior : null
  const pct = diff !== null && p.anterior ? (diff / Math.abs(p.anterior)) * 100 : null
  const sube = (diff ?? 0) >= 0

  const partes: { k: Bucket; v: number }[] = [
    { k: 'disponible', v: p.liquido },
    { k: 'invertido', v: p.invertido },
  ]
  const posiciones: Record<Bucket, Posicion[]> = { disponible: p.disponibles, invertido: p.inversiones, deuda: p.deudas }

  const alternar = (k: Bucket) => setAbierto(a => (a === k ? null : k))

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1.5">
        <p className="fa-label">Patrimonio neto</p>
        <span title="Lo que tenés en billeteras e inversiones (en pesos, al dólar de hoy) menos lo que debés en tarjetas."
          className="text-muted" aria-label="Qué es el patrimonio neto"><Info size={12} /></span>
      </div>

      <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2">
        <NumeroAnimado valor={p.neto} contarAlInicio moneda
          className={`fa-cifra font-extrabold text-primary tabular-nums ${compacto ? 'text-[2.1rem] leading-none' : 'text-[clamp(2.6rem,4.4vw,3.7rem)] leading-[1.02]'}`} />
      </div>

      {diff !== null ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold"
            style={{ background: sube ? 'var(--glow-positive)' : 'var(--glow-negative)', color: sube ? 'var(--accent-positive)' : 'var(--accent-negative)' }}>
            {sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            <span className="tabular-nums">{sube ? '+' : '−'}{fmt(Math.abs(diff)).replace('−', '')}{pct !== null ? ` · ${sube ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')}%` : ''}</span>
          </span>
          <span className="text-secondary">vs. fin de {mesAnt}</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-secondary">A partir del mes que viene vas a ver cuánto cambió contra este.</p>
      )}

      {serie.length >= 2 && !compacto && <MiniEvolucion serie={serie} />}

      {/* composición: una sola barra con lo que tenés; la parte rayada es lo que debés */}
      <div className="mt-5 space-y-2" onMouseLeave={() => setFoco(null)}>
        <div className="relative h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
          <div className="flex h-full w-full gap-[2px]">
            {partes.map(({ k, v }) => v > 0 && (
              <button key={k} type="button" aria-label={`${ETIQUETA[k]}: ${fmt(v)}`}
                onMouseEnter={() => setFoco(k)} onFocus={() => setFoco(k)} onClick={() => alternar(k)}
                className="fa-grow-x h-full"
                style={{
                  width: `${(v / Math.max(p.activos, 1)) * 100}%`,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${TONO[k]} 100%, #fff 18%), ${TONO[k]})`,
                  opacity: foco && foco !== k ? 0.35 : 1, transition: 'opacity 140ms ease',
                }} />
            ))}
          </div>
          {p.deuda > 0 && (
            <button type="button" aria-label={`Deuda en tarjetas: ${fmt(p.deuda)}`}
              onMouseEnter={() => setFoco('deuda')} onFocus={() => setFoco('deuda')} onClick={() => alternar('deuda')}
              className="fa-rayado fa-grow-x absolute inset-y-0 right-0"
              style={{
                width: `${Math.min(100, (p.deuda / Math.max(p.activos, 1)) * 100)}%`,
                boxShadow: '-2px 0 0 var(--bg-card)',
                opacity: foco && foco !== 'deuda' ? 0.35 : 1, transition: 'opacity 140ms ease',
              }} />
          )}
        </div>
        {p.deuda > 0 && (
          <p className="text-[11px] text-muted">La parte rayada es lo que debés: lo que te queda es tu patrimonio neto.</p>
        )}

        <div className={`grid gap-1 pt-2 ${p.deuda > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {(['disponible', 'invertido', ...(p.deuda > 0 ? ['deuda'] : [])] as Bucket[]).map(k => {
            const v = k === 'disponible' ? p.liquido : k === 'invertido' ? p.invertido : p.deuda
            const on = abierto === k
            return (
              <button key={k} type="button" aria-expanded={on}
                onMouseEnter={() => setFoco(k)} onFocus={() => setFoco(k)} onClick={() => alternar(k)}
                className="fa-press -mx-1 rounded-lg px-2 py-1.5 text-left hover:bg-alternate"
                style={{ opacity: foco && foco !== k ? 0.55 : 1, background: on ? 'var(--bg-alternate)' : undefined }}>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONO[k] }} />
                  <span className="truncate text-[11px] font-semibold text-secondary">{ETIQUETA[k]}</span>
                </span>
                <NumeroAnimado valor={k === 'deuda' ? -v : v} moneda
                  className="fa-cifra mt-0.5 block text-[17px] font-bold tabular-nums text-primary" />
                <span className="text-[11px] text-muted">
                  {k === 'deuda' ? `${p.deudas.length} ${p.deudas.length === 1 ? 'tarjeta' : 'tarjetas'}` : `${Math.round((v / Math.max(p.activos, 1)) * 100)}% de lo que tenés`}
                </span>
              </button>
            )
          })}
        </div>

        {/* detalle del bloque elegido: dónde está esa plata */}
        <div className="fa-colapsable" data-abierto={!!abierto}>
          <div>
            {abierto && (
              <ul className="mt-2 divide-y fa-hairline rounded-xl border fa-hairline" aria-label={`Detalle de ${ETIQUETA[abierto]}`}>
                {posiciones[abierto].slice(0, 6).map(x => (
                  <li key={x.clave}>
                    <Link href={x.href} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-alternate">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONO[abierto] }} />
                      <span className="min-w-0 flex-1 truncate text-primary">{x.nombre}</span>
                      <span className="tabular-nums font-semibold text-primary">{fmt(abierto === 'deuda' ? -x.monto : x.monto)}</span>
                      <ChevronRight size={14} className="text-muted" />
                    </Link>
                  </li>
                ))}
                {posiciones[abierto].length === 0 && <li className="px-3 py-3 text-xs text-secondary">No hay nada cargado acá todavía.</li>}
                {posiciones[abierto].length > 6 && (
                  <li><Link href={posiciones[abierto][0].href} className="block px-3 py-2 text-xs font-semibold text-info hover:bg-alternate">
                    Ver las {posiciones[abierto].length} →</Link></li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Evolución del patrimonio a lo ancho: área en degradé, punto que late y lectura por mes. */
function MiniEvolucion({ serie }: { serie: PuntoPatrimonio[] }) {
  const [i, setI] = useState<number | null>(null)
  const ult = serie.slice(-12)
  const W = 600, H = 70
  const vals = ult.map(p => p.neto)
  const min = Math.min(...vals), max = Math.max(...vals)
  const r = max - min || 1
  const pts = vals.map((v, k) => [(k / (vals.length - 1)) * W, H - 6 - ((v - min) / r) * (H - 14)] as const)
  /* curva suave (Catmull-Rom → Bézier) */
  const d = pts.map(([x, y], k) => {
    if (!k) return `M${x},${y}`
    const [x0, y0] = pts[k - 1], [xm, ym] = pts[k - 2] ?? pts[k - 1], [x2, y2] = pts[k + 1] ?? pts[k]
    const c1x = x0 + (x - xm) / 6, c1y = y0 + (y - ym) / 6, c2x = x - (x2 - x0) / 6, c2y = y - (y2 - y0) / 6
    return `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const sel = i ?? vals.length - 1
  const sube = vals[vals.length - 1] >= vals[0]
  const tono = sube ? 'var(--tendencia-sube)' : 'var(--tendencia-baja)'
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="capitalize text-muted">{i === null ? `Últimos ${vals.length} meses` : `${nombreMes(ult[sel].mes)} ${ult[sel].mes.slice(0, 4)}`}</span>
        <span className="font-semibold tabular-nums text-secondary">{fmtCorto(vals[sel])}</span>
      </div>
      <div className="relative h-[70px] w-full"
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          setI(Math.max(0, Math.min(vals.length - 1, Math.round(((e.clientX - rect.left) / rect.width) * (vals.length - 1)))))
        }}
        onMouseLeave={() => setI(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="Evolución del patrimonio neto">
          <defs>
            <linearGradient id="fa-mini-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tono} stopOpacity={0.32} />
              <stop offset="100%" stopColor={tono} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#fa-mini-area)" />
          <path d={d} fill="none" stroke={tono} strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke"
            pathLength={1} className="fa-draw" style={{ filter: `drop-shadow(0 0 6px ${tono})` }} />
          {i !== null && <line x1={pts[sel][0]} x2={pts[sel][0]} y1={0} y2={H} stroke="var(--border-color)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${i === null ? 'fa-latido' : ''}`}
          style={{ left: `${(pts[sel][0] / W) * 100}%`, top: `${(pts[sel][1] / H) * 100}%`, background: tono, border: '2px solid var(--bg-card)', ['--latido' as string]: tono }} />
      </div>
    </div>
  )
}

/* ── libre para usar ──────────────────────────────────────────── */

export function LibreParaUsar({ p, comp, foco, onFoco }: {
  p: Patrimonio
  comp: Compromisos
  foco: string | null
  onFoco: (id: string | null) => void
}) {
  const libre = p.liquido - comp.total
  const base = Math.max(p.liquido, comp.total, 1)
  const proximo = comp.items.find(i => i.fecha && !i.vencido) ?? comp.items.find(i => i.vencido)
  const hoy = isoLocal(new Date())

  const colores = useMemo(() => {
    /* un solo tono (compromiso) con variaciones de intensidad, en orden de vencimiento */
    return comp.items.map((_, i) => `color-mix(in srgb, var(--accent-warning) ${Math.max(45, 100 - i * 12)}%, var(--bg-card))`)
  }, [comp.items])

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1.5">
        <p className="fa-label">Libre para usar</p>
        <span title={`Tu disponible menos lo que ya tiene destino en los próximos ${comp.horizonte} días: resúmenes de tarjeta y gastos fijos que todavía figuran como pendientes.`}
          className="text-muted" aria-label="Qué es libre para usar"><Info size={12} /></span>
      </div>
      <NumeroAnimado valor={libre} moneda
        className={`fa-cifra mt-1 text-[2.3rem] font-extrabold leading-tight tabular-nums ${libre < 0 ? 'text-negative' : 'text-primary'}`} />
      <p className="text-xs text-secondary">
        {libre < 0 ? 'Tus pagos próximos superan lo que tenés disponible.' : `después de los pagos de los próximos ${comp.horizonte} días`}
      </p>

      {/* la cuenta, a la vista: disponible − comprometido = libre */}
      <div className="mt-5 space-y-3 text-sm">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-secondary">Disponible</span>
            <NumeroAnimado valor={p.liquido} className="font-semibold tabular-nums text-primary" />
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
            <div className="fa-grow-x h-full rounded-full" style={{ width: `${(Math.max(p.liquido, 0) / base) * 100}%`, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-secondary) 55%, transparent), var(--accent-secondary))', boxShadow: '0 0 12px -2px var(--accent-secondary)' }} />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-secondary">− Comprometido · {comp.horizonte} días</span>
            <NumeroAnimado valor={-comp.total} className="font-semibold tabular-nums text-primary" />
          </div>
          <div className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}
            onMouseLeave={() => onFoco(null)}>
            {comp.items.map((it, i) => (
              <button key={it.id} type="button" aria-label={`${it.titulo}: ${fmt(it.monto)}`}
                onMouseEnter={() => onFoco(it.id)} onFocus={() => onFoco(it.id)}
                onClick={() => document.getElementById('compromisos')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="fa-grow-x h-full"
                style={{
                  width: `${(it.monto / base) * 100}%`, background: it.vencido ? 'var(--accent-negative)' : colores[i],
                  opacity: foco && foco !== it.id ? 0.3 : 1, transition: 'opacity 140ms ease',
                }} />
            ))}
          </div>
          {foco && comp.items.find(i => i.id === foco) && (() => {
            const it = comp.items.find(i => i.id === foco)!
            return <p className="mt-1.5 text-[11px] text-secondary">{it.titulo} · {fmt(it.monto)}{it.fecha ? ` · vence ${fmtFechaCorta(isoLocal(it.fecha))}` : ''}</p>
          })()}
        </div>

        <div className="flex items-baseline justify-between border-t pt-3 fa-hairline">
          <span className="font-semibold text-primary">= Libre</span>
          <NumeroAnimado valor={libre} className={`font-bold tabular-nums ${libre < 0 ? 'text-negative' : 'text-primary'}`} />
        </div>
      </div>

      {proximo && proximo.fecha && (
        <Link href="#compromisos" onClick={e => { e.preventDefault(); document.getElementById('compromisos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
          className="fa-press mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-alternate fa-hairline">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: proximo.vencido ? 'var(--accent-negative)' : 'var(--accent-warning)' }} />
          <span className="min-w-0 flex-1 truncate text-secondary">
            {proximo.vencido ? 'Vencido' : 'Próximo pago'}: <b className="font-semibold text-primary">{proximo.titulo}</b> · {isoLocal(proximo.fecha) === hoy ? 'hoy' : fmtFechaCorta(isoLocal(proximo.fecha))}
          </span>
          <span className="tabular-nums font-semibold text-primary">{fmt(proximo.monto)}</span>
        </Link>
      )}
    </div>
  )
}
