'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Plus, Trash2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { traerCotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { SkeletonPagina, fmtPesos } from '@/components/ui/Piezas'
import { Modal } from '@/components/tarjetas/Modales'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { Confirmar, Encabezado, NumeroAnimado, Toasts, useToasts } from '@/components/resumen/base'
import { EVENTO_DATOS, useAlCambiarDatos } from '@/lib/eventos'
import { agregarMeDeben, borrarMeDeben, cargarMeDeben, pendienteDe, registrarCobro, type MeDeben } from '@/lib/medeben'
import { hoyISO } from '@/lib/fechas'

/* ── Me deben ─────────────────────────────────────────────────────
   Plata que otras personas te deben (la parte de un Airbnb, un
   préstamo, una cena). Es plata que ya gastaste: NO suma a tu
   patrimonio ni a tus ingresos hasta que la cobrás. Cuando te
   pagan, entra a la cuenta que elijas y queda en el libro.        */

const fmt = (n: number, moneda: string) =>
  moneda === 'USD' ? `US$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : fmtPesos(n)
const fmtFecha = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const input = 'w-full rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'
const label = 'mb-1 block text-xs font-semibold text-secondary'

export default function MeDebenPage() {
  const [loading, setLoading] = useState(true)
  const [deudas, setDeudas] = useState<MeDeben[]>([])
  const [disponible, setDisponible] = useState(true)
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [dolar, setDolar] = useState(1560)
  const [nueva, setNueva] = useState(false)
  const [cobrando, setCobrando] = useState<MeDeben | null>(null)
  const [borrando, setBorrando] = useState<MeDeben | null>(null)
  const toasts = useToasts()

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [r, { data: ls }, cot] = await Promise.all([
      cargarMeDeben(supabase),
      supabase.from('inversiones').select('*'),
      traerCotizaciones(),
    ])
    setDeudas(r.deudas); setDisponible(r.disponible)
    setLineas((ls ?? []) as LineaSaldo[])
    if (cot.dolar) setDolar(cot.dolar)
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useAlCambiarDatos(cargar)

  const pendientes = useMemo(() => deudas.filter(d => pendienteDe(d) > 0), [deudas])
  const saldadas = useMemo(() => deudas.filter(d => pendienteDe(d) <= 0), [deudas])
  const totalArs = pendientes.filter(d => d.moneda === 'ARS').reduce((s, d) => s + pendienteDe(d), 0)
  const totalUsd = pendientes.filter(d => d.moneda === 'USD').reduce((s, d) => s + pendienteDe(d), 0)
  const total = totalArs + totalUsd * dolar
  const porPersona = useMemo(() => {
    const m = new Map<string, MeDeben[]>()
    for (const d of pendientes) m.set(d.persona, [...(m.get(d.persona) ?? []), d])
    return Array.from(m.entries())
      .map(([persona, items]) => ({ persona, items, total: items.reduce((s, d) => s + pendienteDe(d) * (d.moneda === 'USD' ? dolar : 1), 0) }))
      .sort((a, b) => b.total - a.total)
  }, [pendientes, dolar])
  const hoy = hoyISO()

  const avisar = () => window.dispatchEvent(new Event(EVENTO_DATOS))

  async function guardar(d: { persona: string; concepto: string; monto: number; moneda: 'ARS' | 'USD'; vence: string }) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'No hay sesión activa.'
    const { error } = await agregarMeDeben(supabase, user.id, d)
    if (error) return error
    setNueva(false)
    toasts.mostrar({ texto: `Anotado: ${d.persona} te debe ${fmt(d.monto, d.moneda)}.` }, 4000)
    avisar()
    return null
  }

  async function cobrar(d: MeDeben, monto: number, cuentaId: string) {
    const { error } = await registrarCobro(createClient(), d, monto, cuentaId)
    if (error) return error
    setCobrando(null)
    toasts.mostrar({ texto: `Cobro de ${d.persona} registrado: ${fmt(monto, d.moneda)}.` }, 4000)
    avisar()
    return null
  }

  async function borrar(d: MeDeben) {
    const { error } = await borrarMeDeben(createClient(), d.id)
    setBorrando(null)
    if (error) { toasts.mostrar({ texto: 'No se pudo borrar.', tono: 'error' }, 5000); return }
    toasts.mostrar({ texto: 'Borrado.' }, 3000)
    avisar()
  }

  if (loading) return <SkeletonPagina kpis={2} />

  if (!disponible) {
    return (
      <div className="fa-panel p-6 text-sm text-secondary">
        Esta sección todavía no está lista en tu base de datos. Avisale a Claude para activarla.
      </div>
    )
  }

  return (
    <div className="fa-page-in mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Encabezado titulo="Me deben" sub="Plata que ya pusiste y te tienen que devolver"
        derecha={
          <button onClick={() => setNueva(true)} className="fa-press inline-flex h-10 items-center gap-1.5 rounded-xl bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={16} /> Anotar
          </button>
        } />

      <section className="fa-panel p-5" aria-label="Total pendiente">
        <p className="fa-caption">Te deben en total</p>
        <NumeroAnimado valor={total} formato={n => fmtPesos(n)} className="mt-1 block text-3xl font-extrabold tabular-nums text-primary" />
        <p className="fa-caption mt-1">
          {pendientes.length === 0
            ? 'Nadie te debe nada ahora.'
            : <>{totalArs > 0 && fmtPesos(totalArs)}{totalArs > 0 && totalUsd > 0 && ' + '}{totalUsd > 0 && `US$ ${totalUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`} · {porPersona.length} {porPersona.length === 1 ? 'persona' : 'personas'}</>}
        </p>
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <LucaAvatar estado="idle" size={20} />
          <span>Esta plata no suma a tu patrimonio ni a tus ingresos hasta que la cobrás. Cuando te paguen, tocá «Cobrar» y entra a la cuenta que elijas.</span>
        </p>
      </section>

      {porPersona.length === 0 ? (
        <div className="fa-panel flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Users size={28} className="text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-primary">Todavía no anotaste a nadie</p>
          <p className="max-w-sm text-xs text-secondary">Por ejemplo: «Tomás me debe US$146,75 del Airbnb». También se lo podés decir a Luca por el chat.</p>
        </div>
      ) : porPersona.map(g => (
        <section key={g.persona} className="fa-panel overflow-hidden" aria-label={`Deuda de ${g.persona}`}>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 fa-hairline">
            <h3 className="min-w-0 truncate text-sm font-bold text-primary">{g.persona}</h3>
            <span className="fa-num-sm shrink-0 text-primary">{fmtPesos(g.total)}</span>
          </div>
          <ul className="divide-y fa-hairline">
            {g.items.map(d => {
              const pend = pendienteDe(d)
              const pct = d.monto > 0 ? Math.min(100, (d.cobrado / d.monto) * 100) : 0
              const vencida = !!d.vence && d.vence < hoy
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <p className="truncate text-sm text-primary">{d.concepto || 'Sin detalle'}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                        <span>Desde {fmtFecha(d.fecha)}</span>
                        {d.vence && (
                          <span className="inline-flex items-center gap-1" style={vencida ? { color: 'var(--accent-warning)' } : undefined}>
                            <CalendarClock size={11} aria-hidden="true" /> {vencida ? 'Venció' : 'Vence'} {fmtFecha(d.vence)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex-1 text-left sm:flex-none sm:shrink-0 sm:text-right">
                      <p className="fa-num-sm text-primary">{fmt(pend, d.moneda)}</p>
                      {d.cobrado > 0 && <p className="text-[10px] text-muted">de {fmt(d.monto, d.moneda)}</p>}
                    </div>
                    <button onClick={() => setCobrando(d)} className="fa-press h-9 shrink-0 rounded-lg bg-confirm px-3 text-xs font-semibold text-white hover:bg-confirm-hover">
                      Cobrar
                    </button>
                    <button onClick={() => setBorrando(d)} aria-label={`Borrar deuda de ${d.persona}`} className="fa-press grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-alternate hover:text-negative">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {d.cobrado > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-alternate" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Ya cobrado">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent-positive)' }} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {saldadas.length > 0 && (
        <details className="fa-panel">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-secondary">Ya cobradas ({saldadas.length})</summary>
          <ul className="divide-y fa-hairline border-t fa-hairline">
            {saldadas.map(d => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <Check size={14} className="shrink-0 text-positive" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-xs text-secondary">{d.persona} · {d.concepto || 'Sin detalle'}</p>
                <span className="text-xs tabular-nums text-muted">{fmt(d.monto, d.moneda)}</span>
                <button onClick={() => setBorrando(d)} aria-label={`Borrar deuda de ${d.persona}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-alternate hover:text-negative">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {nueva && <FormNueva personas={Array.from(new Set(deudas.map(d => d.persona)))} onGuardar={guardar} onCerrar={() => setNueva(false)} />}
      {cobrando && <FormCobro deuda={cobrando} lineas={lineas} onCobrar={cobrar} onCerrar={() => setCobrando(null)} />}
      {borrando && (
        <Confirmar titulo="¿Borrar esta deuda?" peligro accion="Borrar"
          detalle={<>Se borra «{borrando.persona}{borrando.concepto ? ` · ${borrando.concepto}` : ''}» de la lista. Si ya la cobraste, la plata que entró a tu cuenta no se modifica.</>}
          onConfirmar={() => borrar(borrando)} onCancelar={() => setBorrando(null)} />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}

/* ── anotar ────────────────────────────────── */

function FormNueva({ personas, onGuardar, onCerrar }: {
  personas: string[]
  onGuardar: (d: { persona: string; concepto: string; monto: number; moneda: 'ARS' | 'USD'; vence: string }) => Promise<string | null>
  onCerrar: () => void
}) {
  const [d, setD] = useState({ persona: '', concepto: '', monto: '', moneda: 'ARS' as 'ARS' | 'USD', vence: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const monto = Number(d.monto)

  async function enviar() {
    if (!d.persona.trim()) { setError('¿Quién te debe?'); return }
    if (!(monto > 0)) { setError('Poné cuánto te debe.'); return }
    setGuardando(true); setError('')
    const e = await onGuardar({ persona: d.persona, concepto: d.concepto, monto, moneda: d.moneda, vence: d.vence })
    setGuardando(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo="Anotar una deuda" onCerrar={onCerrar}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); enviar() }}>
        <div>
          <label className={label} htmlFor="md-persona">¿Quién te debe?</label>
          <input id="md-persona" autoFocus list="md-personas" value={d.persona} onChange={e => setD({ ...d, persona: e.target.value })} placeholder="Ej: Tomás" className={input} />
          <datalist id="md-personas">{personas.map(p => <option key={p} value={p} />)}</datalist>
        </div>
        <div>
          <label className={label} htmlFor="md-concepto">¿Por qué?</label>
          <input id="md-concepto" value={d.concepto} onChange={e => setD({ ...d, concepto: e.target.value })} placeholder="Ej: Parte del Airbnb de Córdoba" className={input} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className={label} htmlFor="md-monto">¿Cuánto?</label>
            <input id="md-monto" type="number" inputMode="decimal" value={d.monto} onChange={e => setD({ ...d, monto: e.target.value })} className={input} />
          </div>
          <div>
            <span className={label}>Moneda</span>
            <div className="flex overflow-hidden rounded-lg border">
              {(['ARS', 'USD'] as const).map(m => (
                <button key={m} type="button" onClick={() => setD({ ...d, moneda: m })}
                  className={`px-4 py-2.5 text-sm font-semibold ${d.moneda === m ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}>
                  {m === 'ARS' ? '$' : 'US$'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="md-vence">¿Para cuándo? (opcional)</label>
          <input id="md-vence" type="date" value={d.vence} onChange={e => setD({ ...d, vence: e.target.value })} className={input} />
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-negative">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={guardando} className="fa-press h-11 flex-1 rounded-xl bg-confirm text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Anotar'}
          </button>
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl border px-4 text-sm font-semibold text-secondary hover:bg-alternate">Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── cobrar ────────────────────────────────── */

function FormCobro({ deuda, lineas, onCobrar, onCerrar }: {
  deuda: MeDeben
  lineas: LineaSaldo[]
  onCobrar: (d: MeDeben, monto: number, cuentaId: string) => Promise<string | null>
  onCerrar: () => void
}) {
  const pend = pendienteDe(deuda)
  /* solo cuentas de la misma moneda; primero las de uso diario */
  const cuentas = useMemo(() => lineas
    .filter(l => l.moneda === deuda.moneda)
    .sort((a, b) => Number(!!b.es_disponible) - Number(!!a.es_disponible) || (a.etiqueta || a.app).localeCompare(b.etiqueta || b.app)), [lineas, deuda.moneda])
  const [monto, setMonto] = useState(String(pend))
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function enviar() {
    if (!cuenta) { setError('Elegí en qué cuenta entró la plata.'); return }
    setGuardando(true); setError('')
    const e = await onCobrar(deuda, Number(monto), cuenta)
    setGuardando(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo={`Cobro de ${deuda.persona}`} onCerrar={onCerrar}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); enviar() }}>
        <p className="text-xs text-secondary">Te debe {fmt(pend, deuda.moneda)}{deuda.concepto ? ` por ${deuda.concepto}` : ''}.</p>
        <div>
          <label className={label} htmlFor="cb-monto">¿Cuánto te pagó?</label>
          <input id="cb-monto" autoFocus type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} className={input} />
          {Number(monto) > 0 && Number(monto) < pend && <p className="mt-1 text-[11px] text-muted">Quedaría debiendo {fmt(pend - Number(monto), deuda.moneda)}.</p>}
        </div>
        <div>
          <label className={label} htmlFor="cb-cuenta">¿En qué cuenta entró?</label>
          {cuentas.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--accent-warning)' }}>No tenés ninguna cuenta en {deuda.moneda === 'USD' ? 'dólares' : 'pesos'}. Creá una en Billeteras.</p>
          ) : (
            <select id="cb-cuenta" value={cuenta} onChange={e => setCuenta(e.target.value)} className={input}>
              {cuentas.map(l => <option key={l.id} value={l.id}>{l.etiqueta || l.app} · {l.nombre}</option>)}
            </select>
          )}
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-negative">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={guardando || cuentas.length === 0} className="fa-press h-11 flex-1 rounded-xl bg-confirm text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
            {guardando ? 'Registrando…' : 'Registrar cobro'}
          </button>
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl border px-4 text-sm font-semibold text-secondary hover:bg-alternate">Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
