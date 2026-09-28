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

  const base = Math.max(p.activos, p.deuda, 1)
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
        <NumeroAnimado valor={p.neto} contarAlInicio
          className={`font-extrabold tracking-tight text-primary tabular-nums ${compacto ? 'text-[2.1rem] leading-none' : 'text-[clamp(2.4rem,4vw,3.4rem)] leading-[1.02]'}`} />
        {serie.length >= 2 && !compacto && <MiniEvolucion serie={serie} />}
      </div>

      {diff !== null ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold"
            style={{ background: sube ? 'var(--glow-positive)' : 'var(--glow-negative)', color: sube ? 'var(--accent-positive)' : 'var(--accent-negative)' }}>
            {sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {sube ? '+' : '−'}{fmt(Math.abs(diff)).replace('−', '')}{pct !== null ? ` · ${sube ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')}%` : ''}
          </span>
          <span className="text-secondary">vs. fin de {mesAnt}</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-secondary">A partir del mes que viene vas a ver cuánto cambió contra este.</p>
      )}

      {/* composición: lo que tenés (arriba) contra lo que debés (abajo), misma escala */}
      <div className="mt-5 space-y-2" onMouseLeave={() => setFoco(null)}>
        <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
          {partes.map(({ k, v }) => v > 0 && (
            <button key={k} type="button" aria-label={`${ETIQUETA[k]}: ${fmt(v)}`}
              onMouseEnter={() => setFoco(k)} onFocus={() => setFoco(k)} onClick={() => alternar(k)}
              className="fa-grow-x h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(v / base) * 100}%`, background: TONO[k],
                opacity: foco && foco !== k ? 0.35 : 1, transition: 'opacity 140ms ease',
              }} />
          ))}
        </div>
        {p.deuda > 0 && (
          <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'transparent' }}>
            <button type="button" aria-label={`Deuda en tarjetas: ${fmt(p.deuda)}`}
              onMouseEnter={() => setFoco('deuda')} onFocus={() => setFoco('deuda')} onClick={() => alternar('deuda')}
              className="fa-grow-x h-full rounded-full"
              style={{ width: `${Math.min(100, (p.deuda / base) * 100)}%`, background: TONO.deuda, opacity: foco && foco !== 'deuda' ? 0.35 : 1, transition: 'opacity 140ms ease' }} />
          </div>
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
                <NumeroAnimado valor={k === 'deuda' ? -v : v}
                  className="mt-0.5 block text-[15px] font-bold tabular-nums text-primary" />
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

/** Sparkline de patrimonio: la forma de la evolución, con hover por mes. */
function MiniEvolucion({ serie }: { serie: PuntoPatrimonio[] }) {
  const [i, setI] = useState<number | null>(null)
  const ult = serie.slice(-12)
  const w = 168, h = 44
  const vals = ult.map(p => p.neto)
  const min = Math.min(...vals), max = Math.max(...vals)
  const r = max - min || 1
  const pts = vals.map((v, k) => [(k / (vals.length - 1)) * w, h - 4 - ((v - min) / r) * (h - 8)] as const)
  const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const sel = i ?? vals.length - 1
  return (
    <div className="mb-1.5 flex items-center gap-3">
      <svg width={w} height={h} className="overflow-visible" role="img" aria-label="Evolución del patrimonio neto"
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          setI(Math.max(0, Math.min(vals.length - 1, Math.round(((e.clientX - rect.left) / w) * (vals.length - 1)))))
        }}
        onMouseLeave={() => setI(null)}>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--accent-secondary)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--accent-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="fa-draw" />
        <circle cx={pts[sel][0]} cy={pts[sel][1]} r={4} fill="var(--accent-secondary)" stroke="var(--bg-card)" strokeWidth={2} />
      </svg>
      <div className="w-[92px] text-[11px] leading-tight">
        <p className="capitalize text-muted">{i === null ? 'Últimos meses' : nombreMes(ult[sel].mes)}</p>
        <p className="font-semibold tabular-nums text-secondary">{fmtCorto(vals[sel])}</p>
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
      <NumeroAnimado valor={libre}
        className={`mt-1 text-[2rem] font-extrabold leading-tight tracking-tight tabular-nums ${libre < 0 ? 'text-negative' : 'text-primary'}`} />
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
            <div className="fa-grow-x h-full rounded-full" style={{ width: `${(Math.max(p.liquido, 0) / base) * 100}%`, background: 'var(--accent-secondary)' }} />
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
