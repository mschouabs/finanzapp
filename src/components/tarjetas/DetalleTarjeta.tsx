'use client'

/* ── Detalle de una tarjeta ────────────────────────────────────────
   Navegás resumen por resumen (‹ ›), ves en qué gastaste (torta por
   categoría tocable), cómo vienen los resúmenes (barras con promedio)
   y todos los consumos con buscador. Cada consumo se puede mover a
   otra tarjeta o borrar. El resumen se paga o se deshace el pago.   */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Trash2, Undo2, X } from 'lucide-react'
import { Dona } from '@/components/ui/Piezas'
import { etiquetaMes, fmtDiaMes, sumarMeses } from '@/lib/ciclos'
import { enPesos, infoResumen, type Consumo, type EstadoTarjeta, type ResumenInfo, type TarjetaInfo } from '@/lib/resumenes'
import { Modal } from './Modales'
import { colorTarjeta, fmt, fmtCorto } from './TarjetaVisual'

const CAT_COLOR: Record<string, string> = {
  mercado: '#32D158', comida: '#F5C451', transporte: '#63A9FF', farmacia: '#22C55E', ocio: '#A855F7',
  ropa: '#FF8A3D', personal: '#DF7897', impuesto: '#94A3B8', tecnologia: '#79C0FF', regalo: '#FF5873',
  servicios: '#14B8A6', varios: '#6E7681',
}
const colorCat = (c: string) => CAT_COLOR[c] ?? '#6E7681'

const ESTADO: Record<string, { label: string; color: string }> = {
  abierto: { label: 'Abierto', color: 'var(--accent-secondary)' },
  a_pagar: { label: 'A pagar', color: 'var(--accent-warning, #F5C451)' },
  vencido: { label: 'Vencido', color: 'var(--accent-negative)' },
  pagado: { label: 'Pagado', color: 'var(--accent-positive)' },
  futuro: { label: 'Futuro', color: 'var(--text-muted)' },
  vacio: { label: 'Sin consumos', color: 'var(--text-muted)' },
}

export function DetalleTarjeta({ e, tarjetas, dolar, onCerrar, onPagar, onDeshacer, onMover, onBorrar }: {
  e: EstadoTarjeta
  tarjetas: TarjetaInfo[]
  dolar: number
  onCerrar: () => void
  onPagar: (r: ResumenInfo) => void
  onDeshacer: (r: ResumenInfo) => void
  onMover: (c: Consumo, tarjetaId: string) => void
  onBorrar: (c: Consumo) => void
}) {
  const t = e.tarjeta
  const [clave, setClave] = useState(e.aPagar?.clave ?? e.abierto.clave)
  const [busqueda, setBusqueda] = useState('')
  const [cat, setCat] = useState<string | null>(null)

  const r = useMemo(() => infoResumen(clave, t, e.consumos, dolar), [clave, t, e.consumos, dolar])

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of r.consumos) m.set(c.categoria, (m.get(c.categoria) ?? 0) + (c.moneda === 'USD' ? Number(c.monto) * dolar : Number(c.monto)))
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [r, dolar])

  const evolucion = useMemo(() => {
    const base = e.abierto.clave
    return Array.from({ length: 9 }, (_, i) => {
      const k = sumarMeses(base, i - 5)
      const ri = infoResumen(k, t, e.consumos, dolar)
      return { clave: k, mes: etiquetaMes(k), total: enPesos(ri.totales, dolar), futuro: k > base }
    })
  }, [e, t, dolar])
  const pasados = evolucion.filter(x => !x.futuro && x.total > 0)
  const promedio = pasados.length ? pasados.reduce((s, x) => s + x.total, 0) / pasados.length : 0

  const q = busqueda.trim().toLowerCase()
  const visibles = r.consumos
    .filter(c => !cat || c.categoria === cat)
    .filter(c => !q || c.nombre.toLowerCase().includes(q))
    .sort((a, b) => (b.fecha_compra ?? b.fecha).localeCompare(a.fecha_compra ?? a.fecha))

  const est = ESTADO[r.estado]
  const pendiente = enPesos({ ars: r.totales.pendArs, usd: r.totales.pendUsd }, dolar)
  const hayPagoDeshacible = r.consumos.some(c => c.pagado && c.pago_linea_id)
  const otras = tarjetas.filter(x => x.id !== t.id)

  return (
    <Modal ancho="max-w-3xl" onCerrar={onCerrar} titulo={
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: colorTarjeta(t.marca) }} />
        {t.nombre}
      </span>
    }>
      {/* selector de resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setClave(k => sumarMeses(k, -1))} aria-label="Resumen anterior" className="rounded-lg border p-2 text-secondary hover:bg-alternate"><ChevronLeft size={16} /></button>
          <div className="min-w-[150px] text-center">
            <p className="text-sm font-bold capitalize text-primary">Resumen {etiquetaMes(clave)}</p>
            <p className="text-[11px] text-muted">{fmtDiaMes(r.desde)} al {fmtDiaMes(r.cierre)} · vence {fmtDiaMes(r.vencimiento)}</p>
          </div>
          <button onClick={() => setClave(k => sumarMeses(k, 1))} aria-label="Resumen siguiente" className="rounded-lg border p-2 text-secondary hover:bg-alternate"><ChevronRight size={16} /></button>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: est.color, background: `color-mix(in srgb, ${est.color} 15%, transparent)` }}>
          {est.label}
        </span>
      </div>

      {/* totales + acciones */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-alternate p-4">
        <div>
          <p className="text-xs text-secondary">Total del resumen</p>
          <p className="fa-amount text-2xl text-primary">
            {fmt(r.totales.ars)}{r.totales.usd > 0 && <span className="text-base"> + US$ {r.totales.usd.toLocaleString('es-AR')}</span>}
          </p>
          {pendiente > 0 && r.estado !== 'futuro' && <p className="text-xs text-secondary">Pendiente: {fmt(pendiente)}</p>}
        </div>
        <div className="flex gap-2">
          {hayPagoDeshacible && (
            <button onClick={() => onDeshacer(r)} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-secondary hover:bg-card">
              <Undo2 size={15} /> Deshacer pago
            </button>
          )}
          {pendiente > 0 && (
            <button onClick={() => onPagar(r)} className="rounded-lg bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover">
              {r.estado === 'abierto' || r.estado === 'futuro' ? 'Adelantar pago' : `Pagar ${fmtCorto(pendiente)}`}
            </button>
          )}
        </div>
      </div>

      {/* gráficos */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold text-primary">En qué gastaste</h3>
          {porCategoria.length === 0 ? (
            <p className="mt-6 text-center text-xs text-muted">Sin consumos en este resumen</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <Dona size={130} grosor={18} activo={cat} onElegir={k => setCat(c => (c === k ? null : k))}
                  datos={porCategoria.map(c => ({ key: c.name, label: c.name, valor: c.value, color: colorCat(c.name) }))} />
              </div>
              <ul className="min-w-0 flex-1 space-y-0.5">
                {porCategoria.map(c => (
                  <li key={c.name}>
                    <button onClick={() => setCat(x => (x === c.name ? null : c.name))}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs capitalize hover:bg-alternate ${cat === c.name ? 'bg-alternate' : ''}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorCat(c.name) }} />
                      <span className="flex-1 truncate text-secondary">{c.name}</span>
                      <span className="fa-amount text-primary">{fmtCorto(c.value)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-bold text-primary">Tus resúmenes</h3>
          <p className="text-[11px] text-muted">Tocá una barra para verlo{promedio > 0 ? ` · promedio ${fmtCorto(promedio)}` : ''}</p>
          <div className="relative mt-3 flex h-[140px] items-end gap-1.5">
            {promedio > 0 && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `calc(18px + ${(promedio / Math.max(...evolucion.map(x => x.total), 1)) * 110}px)`, borderColor: 'var(--text-muted)', opacity: 0.6 }} />
            )}
            {evolucion.map((x, i) => {
              const max = Math.max(...evolucion.map(y => y.total), 1)
              const on = x.clave === clave
              return (
                <button key={x.clave} onClick={() => setClave(x.clave)} aria-label={`${x.mes}: ${fmt(x.total)}`} aria-pressed={on}
                  title={`${x.mes}: ${fmt(x.total)}`}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="fa-grow-y block w-full max-w-[28px] rounded-t"
                    style={{
                      height: Math.max(x.total > 0 ? 3 : 0, (x.total / max) * 110), animationDelay: `${i * 30}ms`,
                      background: on ? colorTarjeta(t.marca) : x.futuro ? 'var(--border-color)' : 'color-mix(in srgb, var(--text-muted) 60%, transparent)',
                    }} />
                  <span className={`text-[10px] capitalize ${on ? 'font-semibold text-primary' : 'text-muted'}`}>{x.mes.slice(0, 3)}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {/* consumos */}
      <section className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-primary">Consumos ({visibles.length})</h3>
          {cat && (
            <button onClick={() => setCat(null)} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] capitalize text-secondary hover:bg-alternate">
              <X size={11} /> {cat}
            </button>
          )}
          <label className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={busqueda} onChange={ev => setBusqueda(ev.target.value)} placeholder="Buscar…"
              className="w-40 rounded-lg border bg-field py-1.5 pl-8 pr-2 text-sm text-primary" aria-label="Buscar consumo" />
          </label>
        </div>

        <ul className="mt-2 divide-y divide-line">
          {visibles.length === 0 && <li className="py-6 text-center text-sm text-muted">Nada por acá</li>}
          {visibles.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorCat(c.categoria) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-primary">{c.nombre}</p>
                <p className="text-[11px] text-muted">
                  {fmtDiaMes(new Date((c.fecha_compra ?? c.fecha) + 'T12:00:00'))}
                  {(c.cuotas_total ?? 1) > 1 && ` · cuota ${c.cuota_numero}/${c.cuotas_total}`}
                  {c.pagado && ' · pagado'}
                </p>
              </div>
              <span className="fa-amount text-sm text-primary">
                {c.moneda === 'USD' ? `US$ ${Number(c.monto).toLocaleString('es-AR')}` : fmt(Number(c.monto))}
              </span>
              {otras.length > 0 && !c.pagado && (
                <select value="" onChange={ev => ev.target.value && onMover(c, ev.target.value)}
                  aria-label={`Mover ${c.nombre} a otra tarjeta`}
                  className="rounded border bg-field px-1.5 py-1 text-[11px] text-secondary">
                  <option value="">Mover a…</option>
                  {otras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              )}
              <button onClick={() => onBorrar(c)} aria-label={`Borrar ${c.nombre}`} className="rounded p-1 text-muted hover:bg-alternate hover:text-negative">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  )
}
