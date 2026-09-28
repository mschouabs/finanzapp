'use client'

/* ── Bloques del Resumen: flujo del mes, categorías, compromisos y
   actividad. Menos cajas: listas y bandas sobre superficies planas,
   separadas por hairlines y espacio.                                  */

import Link from 'next/link'
import { useState } from 'react'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, CreditCard, Pin, X,
} from 'lucide-react'
import { Encabezado, NumeroAnimado, fmt, fmtFechaCorta, fmtSigno } from './base'
import { getCat } from '@/lib/categorias'
import {
  isoLocal, nombreMes,
  type Actividad, type Categoria, type Compromiso, type Compromisos, type Flujo, type Ritmo,
} from '@/lib/finanzas/nucleo'

/* ── flujo del período ────────────────────────────────────────── */

export function FlujoPeriodo({ flujo, esActual, ritmo, puedeAtras, puedeAdelante, onMover, onHoy, compacto = false }: {
  flujo: Flujo
  esActual: boolean
  ritmo: Ritmo
  puedeAtras: boolean
  puedeAdelante: boolean
  onMover: (d: -1 | 1) => void
  onHoy: () => void
  compacto?: boolean
}) {
  const g = flujo.gastos
  const partesGasto = [
    { k: 'Fijos', v: g.fijos },
    { k: 'Día a día', v: g.variables },
    { k: 'Cuotas', v: g.cuotas },
    { k: 'Viajes', v: g.viajes },
    { k: 'Secciones', v: g.secciones },
  ].filter(x => x.v > 0)
  const [focoGasto, setFocoGasto] = useState<string | null>(null)
  const tasa = flujo.tasaAhorro
  const avanceMes = esActual ? ritmo.dia / ritmo.diasMes : 1

  return (
    <section aria-labelledby="t-flujo" className="min-w-0">
      <Encabezado id="t-flujo" titulo={esActual ? 'Este mes' : `${nombreMes(flujo.mes)[0].toUpperCase()}${nombreMes(flujo.mes).slice(1)} ${flujo.mes.slice(0, 4)}`}
        sub={esActual ? `Día ${ritmo.dia} de ${ritmo.diasMes}` : 'Mes cerrado'}
        derecha={
          <div className="flex items-center gap-1">
            {!esActual && <button onClick={onHoy} className="fa-press mr-1 rounded-lg px-2 py-1 text-xs font-semibold text-info hover:bg-alternate">Volver a hoy</button>}
            <button onClick={() => onMover(-1)} disabled={!puedeAtras} aria-label="Mes anterior"
              className="fa-press flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-alternate hover:text-primary disabled:opacity-30"><ChevronLeft size={16} /></button>
            <button onClick={() => onMover(1)} disabled={!puedeAdelante} aria-label="Mes siguiente"
              className="fa-press flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-alternate hover:text-primary disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        } />

      {/* progreso del mes: fino, arriba de todo */}
      {esActual && (
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }} aria-hidden="true">
          <div className="fa-grow-x h-full rounded-full" style={{ width: `${avanceMes * 100}%`, background: 'var(--text-muted)' }} />
        </div>
      )}

      <div key={flujo.mes} className={`fa-page-in mt-4 grid gap-y-4 ${compacto ? 'grid-cols-2 gap-x-4' : 'grid-cols-2 gap-x-6 xl:grid-cols-4'}`}>
        <Bloque label="Entró" valor={flujo.ingresos.total} signo="+"
          sub={[flujo.ingresos.fijos > 0 && `Fijos ${fmt(flujo.ingresos.fijos)}`, flujo.ingresos.extra > 0 && `Extra ${fmt(flujo.ingresos.extra)}`, flujo.ingresos.secciones > 0 && `Otros ${fmt(flujo.ingresos.secciones)}`].filter(Boolean).join(' · ') || 'Sin ingresos cargados'}
          href="/dashboard/ingresos-gastos" tono="var(--accent-positive)" />
        <div className="min-w-0">
          <Bloque label="Salió" valor={flujo.gastos.total} signo="−"
            sub={focoGasto ? `${focoGasto}: ${fmt(partesGasto.find(p => p.k === focoGasto)?.v ?? 0)}` : `${partesGasto.length ? partesGasto.map(p => p.k.toLowerCase()).slice(0, 3).join(', ') : 'Sin gastos cargados'}`}
            href="/dashboard/gastos-variables" tono="var(--accent-negative)" />
          {partesGasto.length > 1 && (
            <div className="mt-2 flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full" onMouseLeave={() => setFocoGasto(null)}>
              {partesGasto.map((p, i) => (
                <button key={p.k} type="button" aria-label={`${p.k}: ${fmt(p.v)}`}
                  onMouseEnter={() => setFocoGasto(p.k)} onFocus={() => setFocoGasto(p.k)} onClick={() => setFocoGasto(f => f === p.k ? null : p.k)}
                  className="fa-grow-x h-full"
                  style={{
                    width: `${(p.v / Math.max(flujo.gastos.total, 1)) * 100}%`,
                    background: `color-mix(in srgb, var(--accent-negative) ${100 - i * 16}%, var(--bg-card))`,
                    opacity: focoGasto && focoGasto !== p.k ? 0.3 : 1, transition: 'opacity 140ms ease',
                  }} />
              ))}
            </div>
          )}
        </div>
        <Bloque label="Quedó" valor={flujo.balance} fuerte
          sub={flujo.balance >= 0 ? 'balance positivo' : 'gastaste más de lo que entró'}
          tono={flujo.balance >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)'} />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">Ahorro</p>
          <p className="mt-1 text-[1.35rem] font-bold leading-tight tabular-nums text-primary">
            {tasa === null ? '—' : `${Math.round(tasa)}%`}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
            <div className="fa-grow-x h-full rounded-full" style={{
              width: `${Math.max(0, Math.min(100, tasa ?? 0))}%`,
              background: (tasa ?? 0) >= 20 ? 'var(--accent-positive)' : (tasa ?? 0) > 0 ? 'var(--accent-warning)' : 'var(--accent-negative)',
            }} />
          </div>
          <p className="mt-1 text-[11px] text-muted">{tasa === null ? 'sin ingresos para calcular' : 'de lo que entró'}</p>
        </div>
      </div>

      {esActual && ritmo.variacion !== null && ritmo.mesesComparados >= 2 && (
        <p className="mt-4 flex items-center gap-2 text-xs text-secondary">
          <span className="inline-flex h-5 items-center rounded-md px-1.5 font-semibold tabular-nums"
            style={{
              background: ritmo.variacion > 10 ? 'var(--glow-negative)' : ritmo.variacion < -10 ? 'var(--glow-positive)' : 'var(--bg-alternate)',
              color: ritmo.variacion > 10 ? 'var(--accent-negative)' : ritmo.variacion < -10 ? 'var(--accent-positive)' : 'var(--text-secondary)',
            }}>
            {ritmo.variacion > 0 ? '▲' : '▼'} {Math.abs(Math.round(ritmo.variacion))}%
          </span>
          ritmo de consumo vs. tus últimos {ritmo.mesesComparados} meses a esta altura
        </p>
      )}
    </section>
  )
}

function Bloque({ label, valor, sub, signo, fuerte, href, tono }: {
  label: string; valor: number; sub: string; signo?: '+' | '−'; fuerte?: boolean; href?: string; tono: string
}) {
  const cuerpo = (
    <>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tono }} />{label}
      </p>
      <NumeroAnimado valor={signo === '−' ? -valor : valor} formato={signo || fuerte ? fmtSigno : fmt}
        className={`mt-1 block whitespace-nowrap text-[1.3rem] font-bold leading-tight tabular-nums ${fuerte ? '' : 'text-primary'}`} />
      <p className="mt-1 truncate text-[11px] text-muted">{sub}</p>
    </>
  )
  return href
    ? <Link href={href} className="fa-press -m-1.5 block min-w-0 rounded-lg p-1.5 hover:bg-alternate">{cuerpo}</Link>
    : <div className="min-w-0" style={fuerte ? { color: tono } : undefined}>{cuerpo}</div>
}

/* ── categorías ───────────────────────────────────────────────── */

export function Categorias({ cats, mes, esActual, seleccion, onSeleccion, max = 7, sub, titulo = 'En qué se fue' }: {
  cats: Categoria[]
  mes: string
  esActual: boolean
  seleccion: string | null
  onSeleccion: (c: string | null) => void
  max?: number
  /** reemplaza el subtítulo (ej: para rangos de varios meses) */
  sub?: string
  titulo?: string
}) {
  const [foco, setFoco] = useState<string | null>(null)
  const total = cats.reduce((a, c) => a + c.monto, 0)
  const visibles = cats.slice(0, max)
  const resto = cats.slice(max).reduce((a, c) => a + c.monto, 0)
  const tope = Math.max(...visibles.map(c => Math.max(c.monto, c.anterior)), 1)

  return (
    <section aria-labelledby="t-cat" className="min-w-0">
      <Encabezado id="t-cat" titulo={titulo}
        sub={sub ?? `${esActual ? 'Este mes' : nombreMes(mes)} · la marca gris es ${esActual ? 'el mes pasado a esta altura' : 'el mes anterior'}`} />
      {cats.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-xs text-secondary fa-hairline">
          No hay gastos en este período.
        </p>
      ) : (
        <ul className="mt-4 space-y-1" onMouseLeave={() => setFoco(null)}>
          {visibles.map((c, i) => {
            const cat = getCat(c.clave)
            const on = seleccion === c.clave
            const delta = c.anterior > 0 ? ((c.monto - c.anterior) / c.anterior) * 100 : null
            const apagada = (foco && foco !== c.clave) || (seleccion && !on)
            return (
              <li key={c.clave}>
                <button type="button" aria-pressed={on}
                  onMouseEnter={() => setFoco(c.clave)} onFocus={() => setFoco(c.clave)}
                  onClick={() => onSeleccion(on ? null : c.clave)}
                  title={on ? 'Quitar filtro' : 'Ver estos movimientos en Actividad'}
                  className="fa-press w-full rounded-lg px-2 py-1.5 text-left hover:bg-alternate"
                  style={{ opacity: apagada ? 0.5 : 1, background: on ? 'var(--bg-alternate)' : undefined, transition: 'opacity 140ms ease' }}>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-center" aria-hidden="true">{c.clave === 'fijos' ? '📌' : c.clave === 'viajes' ? '✈️' : cat.emoji}</span>
                    <span className="min-w-0 flex-1 truncate capitalize text-primary">{c.clave === 'fijos' ? 'Gastos fijos' : cat.label === c.clave ? c.nombre : cat.label}</span>
                    {delta !== null && Math.abs(delta) >= 10 && (
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: delta > 0 ? 'var(--accent-negative)' : 'var(--accent-positive)' }}>
                        {delta > 0 ? '▲' : '▼'}{Math.abs(Math.round(delta))}%
                      </span>
                    )}
                    <span className="w-24 text-right font-semibold tabular-nums text-primary">{fmt(c.monto)}</span>
                  </span>
                  <span className="relative mt-1.5 ml-7 block h-1.5 rounded-full" style={{ background: 'var(--border-subtle)' }}>
                    <span className="fa-grow-x absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${(c.monto / tope) * 100}%`, background: 'var(--accent-negative)', opacity: foco === c.clave || on ? 1 : 0.72, animationDelay: `${i * 40}ms` }} />
                    {c.anterior > 0 && (
                      <span className="absolute -top-[3px] h-[12px] w-[2px] rounded-full" title={`Antes: ${fmt(c.anterior)}`}
                        style={{ left: `calc(${(c.anterior / tope) * 100}% - 1px)`, background: 'var(--text-secondary)' }} />
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {resto > 0 && (
            <li className="flex items-center justify-between px-2 pt-1 text-xs text-secondary">
              <span className="ml-7">Otras {cats.length - max}</span>
              <span className="tabular-nums">{fmt(resto)}</span>
            </li>
          )}
          <li className="flex items-center justify-between border-t px-2 pt-2 text-xs fa-hairline">
            <span className="ml-7 text-secondary">Total</span>
            <span className="font-semibold tabular-nums text-primary">{fmt(total)}</span>
          </li>
        </ul>
      )}
    </section>
  )
}

/* ── compromisos ──────────────────────────────────────────────── */

export function ListaCompromisos({ comp, foco, onFoco, onPagar }: {
  comp: Compromisos
  foco: string | null
  onFoco: (id: string | null) => void
  onPagar: (c: Compromiso) => void
}) {
  const hoy = new Date()
  const grupos: { titulo: string; items: Compromiso[] }[] = [
    { titulo: 'Vencidos', items: comp.items.filter(i => i.vencido) },
    { titulo: 'Próximos 7 días', items: comp.items.filter(i => !i.vencido && i.fecha && (i.fecha.getTime() - hoy.getTime()) / 86_400_000 <= 7) },
    { titulo: `Hasta ${comp.horizonte} días`, items: comp.items.filter(i => !i.vencido && i.fecha && (i.fecha.getTime() - hoy.getTime()) / 86_400_000 > 7) },
    { titulo: 'Gastos fijos pendientes', items: comp.items.filter(i => !i.fecha) },
  ].filter(g => g.items.length)

  return (
    <section id="compromisos" aria-labelledby="t-comp" className="min-w-0 scroll-mt-24">
      <Encabezado id="t-comp" titulo="Plata comprometida"
        sub={`Lo que ya tiene destino: ${fmt(comp.total)} en ${comp.horizonte} días`}
        derecha={<Link href="/dashboard/tarjetas" className="text-xs font-semibold text-info hover:underline">Tarjetas →</Link>} />
      {comp.items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-sm fa-hairline">
          <CalendarClock size={18} className="text-positive" />
          <span className="text-secondary">No tenés pagos pendientes en los próximos {comp.horizonte} días.</span>
        </div>
      ) : (
        <div className="mt-3 space-y-4" onMouseLeave={() => onFoco(null)}>
          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">{g.titulo}</p>
              <ul>
                {g.items.map(it => {
                  const on = foco === it.id
                  return (
                    <li key={it.id}
                      onMouseEnter={() => onFoco(it.id)}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                      style={{ background: on ? 'var(--bg-alternate)' : undefined }}>
                      <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-semibold leading-none"
                        style={{
                          background: it.vencido ? 'var(--glow-negative)' : 'var(--bg-alternate)',
                          color: it.vencido ? 'var(--accent-negative)' : 'var(--text-secondary)',
                        }}>
                        {it.fecha ? (<><span className="text-[13px] font-bold text-primary">{it.fecha.getDate()}</span><span className="mt-0.5 uppercase">{it.fecha.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</span></>)
                          : <Pin size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm text-primary">
                          {it.tipo === 'tarjeta' && <CreditCard size={13} className="shrink-0 text-muted" />}
                          <span className="truncate">{it.titulo}</span>
                        </span>
                        <span className="block text-[11px] text-muted">
                          {it.vencido ? <span className="inline-flex items-center gap-1 text-negative"><AlertTriangle size={11} /> Vencido</span> : it.detalle}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-primary">{fmt(it.monto)}</span>
                      {it.tipo === 'tarjeta' ? (
                        <button onClick={() => onPagar(it)}
                          className="fa-press rounded-lg border px-2.5 py-1 text-xs font-semibold text-primary hover:border-[var(--accent-confirm)] hover:text-positive fa-hairline">
                          Pagar
                        </button>
                      ) : (
                        <Link href={it.href} className="fa-press rounded-lg border px-2.5 py-1 text-xs font-semibold text-secondary hover:text-primary fa-hairline">Marcar</Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {comp.futuro > 0 && comp.hasta && (
        <p className="mt-4 border-t pt-3 text-xs text-secondary fa-hairline">
          Más adelante: <b className="font-semibold tabular-nums text-primary">{fmt(comp.futuro)}</b> en resúmenes y cuotas, hasta {nombreMes(comp.hasta)}.
        </p>
      )}
    </section>
  )
}

/* ── actividad reciente ───────────────────────────────────────── */

export function ListaActividad({ items, filtro, onLimpiar, nuevos }: {
  items: Actividad[]
  filtro: string | null
  onLimpiar: () => void
  nuevos: Set<string>
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const hoy = isoLocal(new Date())

  return (
    <section aria-labelledby="t-act" className="min-w-0">
      <Encabezado id="t-act" titulo="Actividad reciente"
        sub={filtro ? undefined : 'Tus últimos movimientos, de todas las fuentes'}
        derecha={<Link href="/dashboard/historial" className="text-xs font-semibold text-info hover:underline">Ver todo →</Link>} />
      {filtro && (
        <button onClick={onLimpiar} className="fa-press fa-pop mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-primary hover:bg-alternate fa-hairline">
          Filtrado por <b className="capitalize">{filtro === 'fijos' ? 'gastos fijos' : getCat(filtro).label}</b> <X size={12} />
        </button>
      )}
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-xs text-secondary fa-hairline">
          {filtro === 'fijos' ? 'Los gastos fijos no tienen movimientos con fecha: se ven en Movimientos.' : filtro ? 'No hay movimientos recientes en esta categoría.' : 'Todavía no hay movimientos. Contale a Luca tu primer gasto.'}
        </p>
      ) : (
        <ul className="mt-2 divide-y fa-hairline">
          {items.map(a => {
            const cat = getCat(a.categoria)
            const ing = a.tipo === 'ingreso'
            const on = abierto === a.id
            return (
              <li key={a.id} className={nuevos.has(a.id) ? 'fa-flash rounded-lg' : ''}>
                <button type="button" aria-expanded={on} onClick={() => setAbierto(on ? null : a.id)}
                  className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-alternate">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ background: ing ? 'var(--glow-positive)' : 'var(--bg-alternate)' }} aria-hidden="true">
                    {ing ? <ArrowDownLeft size={16} className="text-positive" /> : a.categoria === 'viajes' ? '✈️' : cat.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-primary">{a.titulo}</span>
                    <span className="block truncate text-[11px] text-muted">
                      <span className="capitalize">{ing ? 'Ingreso' : a.categoria === 'viajes' ? 'Viaje' : cat.label}</span>
                      {a.cuenta && <> · {a.cuenta}</>}
                      {a.cuota && <> · cuota {a.cuota}</>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block text-sm font-semibold tabular-nums ${ing ? 'text-positive' : 'text-primary'}`}>
                      {ing ? '+' : '−'}{fmt(a.monto).replace('−', '')}
                    </span>
                    <span className="block text-[11px] text-muted">{a.fecha === hoy ? 'Hoy' : fmtFechaCorta(a.fecha)}</span>
                  </span>
                </button>
                <div className="fa-colapsable" data-abierto={on}>
                  <div>
                    <div className="mb-2 ml-12 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-secondary">
                      {a.moneda !== 'ARS' && <span>Original: {a.moneda} {a.montoOriginal.toLocaleString('es-AR')}</span>}
                      {a.hormiga && <span>🐜 Gasto hormiga</span>}
                      <span>{new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                      <Link href={a.href} className="font-semibold text-info hover:underline">Abrir <ArrowUpRight size={11} className="inline" /></Link>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
