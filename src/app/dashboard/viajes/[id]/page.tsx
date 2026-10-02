'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Archive, ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { SkeletonPagina } from '@/components/ui/Piezas'
import { ViajeModal } from '@/components/ViajeModal'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { Confirmar, Encabezado, NumeroAnimado, Toasts, useToasts } from '@/components/resumen/base'
import { GraficoBarras, type PuntoBarra } from '@/components/resumen/GraficoBarras'
import { EVENTO_DATOS } from '@/lib/eventos'
import { hoyISO } from '@/lib/fechas'
import { esLiquida, type LineaSaldo } from '@/lib/patrimonio'
import { ajustarSaldo } from '@/lib/libro'
import {
  CATEGORIAS_VIAJE, ETIQUETA_ESTADO, MONEDAS, colorPresupuesto, duracionDias, estadoViaje,
  fmtARS, fmtCorto, fmtFecha, fmtMonedaOriginal, fmtRango, getCategoriaViaje, getMoneda,
  proyeccionViaje, sugerirCategoriaViaje, type Viaje, type ViajeGasto,
} from '@/lib/viajes'

/* ── Detalle de un viaje ──────────────────────────────────────────
   Cuánto llevás gastado contra el presupuesto, a qué ritmo, en qué y
   en qué moneda. Cada gasto puede descontarse de la cuenta de la que
   salió, así el patrimonio queda al día.                            */

type Gasto = ViajeGasto & { billetera_linea_id?: string | null; monto_descontado?: number | null }

const formVacio = () => ({
  concepto: '', monto: '', moneda: 'ARS', tipo_cambio: '1',
  categoria: 'varios', categoriaSugerida: 'varios', fecha: hoyISO(), notas: '', cuenta: '',
})

const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_DATOS))

/** Cuánto se descuenta de la cuenta: en su moneda si coincide, si no en pesos. */
function aDescontar(cuenta: LineaSaldo | undefined, monto: number, moneda: string, tc: number) {
  if (!cuenta) return 0
  return cuenta.moneda === moneda ? monto : monto * tc
}

export default function ViajeDetallePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toasts = useToasts()

  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [cuentas, setCuentas] = useState<LineaSaldo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(formVacio())
  const [abierto, setAbierto] = useState(false)
  const [editandoGasto, setEditandoGasto] = useState<Gasto | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [editarViaje, setEditarViaje] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [filtroCat, setFiltroCat] = useState<string | null>(null)
  const [filtroDia, setFiltroDia] = useState<string | null>(null)
  /** Cotización sugerida del dólar, solo como valor inicial editable. */
  const [dolarBlue, setDolarBlue] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient()
      const [{ data: v, error: e1 }, { data: gs, error: e2 }, { data: lin }] = await Promise.all([
        supabase.from('viajes').select('*').eq('id', id).single(),
        supabase.from('viaje_gastos').select('*').eq('viaje_id', id)
          .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('inversiones').select('*'),
      ])
      if (e1) throw e1
      if (e2) throw e2
      setViaje(v as Viaje)
      setGastos((gs ?? []) as Gasto[])
      setCuentas(((lin ?? []) as LineaSaldo[]).filter(l => esLiquida(l) && l.moneda !== 'BTC'))
    } catch {
      setViaje(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  /* la cotización es solo una sugerencia: si falla, el usuario pone la que pagó */
  useEffect(() => {
    fetch('/api/dolar').then(r => r.json())
      .then(d => setDolarBlue(d?.blue ?? d?.oficial ?? null))
      .catch(() => setDolarBlue(null))
  }, [])

  /* ── números ── */
  const total = useMemo(() => gastos.reduce((s, g) => s + (Number(g.monto_ars) || 0), 0), [gastos])

  const porCategoria = useMemo(() => {
    const acum: Record<string, { monto: number; n: number }> = {}
    for (const g of gastos) {
      const k = getCategoriaViaje(g.categoria).key
      const a = acum[k] ?? { monto: 0, n: 0 }
      a.monto += Number(g.monto_ars) || 0; a.n++
      acum[k] = a
    }
    return Object.entries(acum).map(([key, v]) => ({ ...getCategoriaViaje(key), ...v })).sort((a, b) => b.monto - a.monto)
  }, [gastos])

  /* un punto por día: todo el rango del viaje + días con gastos fuera de él */
  const porDia: PuntoBarra[] = useMemo(() => {
    const acum: Record<string, number> = {}
    for (const g of gastos) acum[g.fecha] = (acum[g.fecha] ?? 0) + (Number(g.monto_ars) || 0)
    let fechas = Object.keys(acum)
    if (viaje?.fecha_inicio && viaje?.fecha_fin && viaje.fecha_fin >= viaje.fecha_inicio) {
      const d = new Date(viaje.fecha_inicio + 'T12:00:00')
      const fin = new Date(viaje.fecha_fin + 'T12:00:00')
      while (d <= fin && fechas.length < 150) {
        fechas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        d.setDate(d.getDate() + 1)
      }
    }
    fechas = Array.from(new Set(fechas)).sort()
    return fechas.map(f => ({ clave: f, etiqueta: String(Number(f.slice(8, 10))), valor: acum[f] ?? 0 }))
  }, [gastos, viaje])

  const porMoneda = useMemo(() => {
    const acum: Record<string, { original: number; ars: number }> = {}
    for (const g of gastos) {
      const a = acum[g.moneda] ?? { original: 0, ars: 0 }
      a.original += Number(g.monto) || 0
      a.ars += Number(g.monto_ars) || 0
      acum[g.moneda] = a
    }
    return Object.entries(acum).map(([codigo, v]) => ({ codigo, ...v })).sort((a, b) => b.ars - a.ars)
  }, [gastos])

  const visibles = gastos.filter(g =>
    (!filtroCat || getCategoriaViaje(g.categoria).key === filtroCat) && (!filtroDia || g.fecha === filtroDia))
  const grupos = useMemo(() => {
    const m = new Map<string, Gasto[]>()
    for (const g of visibles) m.set(g.fecha, [...(m.get(g.fecha) ?? []), g])
    return Array.from(m.entries())
  }, [visibles])

  const equivalenteARS = Number(form.monto) && Number(form.tipo_cambio) ? Number(form.monto) * Number(form.tipo_cambio) : null
  const cuentasForm = cuentas.filter(c => c.moneda === 'ARS' || c.moneda === form.moneda)
  const cuentaForm = cuentas.find(c => c.id === form.cuenta)

  /* ── acciones ── */
  function cambiarMoneda(codigo: string) {
    setForm(f => {
      const cuenta = cuentas.find(c => c.id === f.cuenta)
      return {
        ...f, moneda: codigo,
        tipo_cambio: codigo === 'ARS' ? '1' : codigo === 'USD' && dolarBlue ? String(dolarBlue) : '',
        cuenta: cuenta && cuenta.moneda !== 'ARS' && cuenta.moneda !== codigo ? '' : f.cuenta,
      }
    })
  }

  function abrirNuevo() {
    setForm(formVacio()); setEditandoGasto(null); setError(''); setAbierto(true)
  }

  function abrirEdicion(g: Gasto) {
    setForm({
      concepto: g.concepto, monto: String(g.monto), moneda: g.moneda, tipo_cambio: String(g.tipo_cambio),
      categoria: g.categoria, categoriaSugerida: '', fecha: g.fecha, notas: g.notas ?? '',
      cuenta: g.billetera_linea_id ?? '',
    })
    setEditandoGasto(g); setError(''); setAbierto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** devuelve a la cuenta lo que se le había descontado por ese gasto */
  async function devolver(g: Pick<Gasto, 'billetera_linea_id' | 'monto_descontado'>) {
    if (!g.billetera_linea_id || !g.monto_descontado) return
    await ajustarSaldo(createClient(), g.billetera_linea_id, Number(g.monto_descontado), { tipo: 'deshacer', descripcion: 'Gasto de viaje devuelto' })
  }

  async function guardarGasto() {
    if (!form.concepto.trim()) return setError('Poné un concepto.')
    if (!form.monto || Number(form.monto) <= 0) return setError('El monto tiene que ser mayor a cero.')
    const tc = Number(form.tipo_cambio)
    if (!tc || tc <= 0) return setError('Poné el tipo de cambio que pagaste.')

    setGuardando(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión vencida. Volvé a entrar.')

      const monto = Number(form.monto)
      const descontado = aDescontar(cuentaForm, monto, form.moneda, tc)
      const fila = {
        concepto: form.concepto.trim(), categoria: form.categoria, monto, moneda: form.moneda,
        tipo_cambio: tc, fecha: form.fecha || hoyISO(), notas: form.notas.trim() || null,
        billetera_linea_id: cuentaForm?.id ?? null, monto_descontado: cuentaForm ? descontado : null,
      }

      const { data: nuevo, error: err } = editandoGasto
        ? await supabase.from('viaje_gastos').update(fila).eq('id', editandoGasto.id).select('id').single()
        : await supabase.from('viaje_gastos').insert({ ...fila, viaje_id: id, user_id: user.id }).select('id').single()
      if (err) throw err
      const gastoId = (nuevo as { id?: string } | null)?.id ?? editandoGasto?.id

      /* saldo de la cuenta: se devuelve lo viejo y se descuenta lo nuevo */
      let fallo = false
      if (editandoGasto) await devolver(editandoGasto)
      if (cuentaForm && descontado > 0) {
        const { error: e2 } = await ajustarSaldo(supabase, cuentaForm.id, -descontado, {
          tipo: 'gasto', descripcion: `${viaje?.nombre ?? 'Viaje'}: ${fila.concepto}`, origen_tabla: 'viaje_gastos', origen_id: gastoId,
        })
        fallo = !!e2
      }

      toasts.mostrar(fallo
        ? { texto: 'El gasto se guardó, pero no se pudo descontar de la cuenta.', tono: 'error' }
        : { texto: `${editandoGasto ? 'Guardaste' : 'Agregaste'} ${fila.concepto}: ${fmtARS(monto * tc)}${cuentaForm ? ' (descontado de tu cuenta)' : ''}.` }, 5000)
      setForm(formVacio()); setEditandoGasto(null); setAbierto(false)
      await cargar(); avisarCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el gasto.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrarGasto(g: Gasto) {
    const supabase = createClient()
    setGastos(xs => xs.filter(x => x.id !== g.id))
    const { error: err } = await supabase.from('viaje_gastos').delete().eq('id', g.id)
    if (err) { toasts.mostrar({ texto: 'No se pudo borrar.', tono: 'error' }); cargar(); return }
    await devolver(g)
    avisarCambio()
    toasts.mostrar({
      texto: `Borraste ${g.concepto}${g.billetera_linea_id ? ' y se devolvió a tu cuenta' : ''}.`,
      deshacer: async () => {
        /* monto_ars es calculado por la base: no se reinserta */
        const { monto_ars: _calc, ...fila } = g
        void _calc
        await createClient().from('viaje_gastos').insert(fila)
        if (g.billetera_linea_id && g.monto_descontado)
          await ajustarSaldo(createClient(), g.billetera_linea_id, -Number(g.monto_descontado), { tipo: 'gasto', descripcion: g.concepto, origen_tabla: 'viaje_gastos', origen_id: g.id })
        cargar(); avisarCambio()
      },
    }, 7000)
  }

  async function alternarArchivo() {
    if (!viaje) return
    const nuevo = !viaje.archivado
    setViaje({ ...viaje, archivado: nuevo })
    await createClient().from('viajes').update({ archivado: nuevo }).eq('id', viaje.id)
    toasts.mostrar({
      texto: nuevo ? 'Viaje marcado como realizado.' : 'El viaje volvió a activos.',
      deshacer: async () => { await createClient().from('viajes').update({ archivado: !nuevo }).eq('id', viaje.id); cargar() },
    }, 6000)
  }

  async function borrarViaje() {
    const supabase = createClient()
    for (const g of gastos) await devolver(g)
    await supabase.from('viaje_gastos').delete().eq('viaje_id', id)
    await supabase.from('viajes').delete().eq('id', id)
    avisarCambio()
    router.push('/dashboard/viajes')
  }

  /* ── render ── */
  if (loading) return <SkeletonPagina kpis={2} />

  if (!viaje) {
    return (
      <div className="fa-panel p-8 text-center">
        <p className="text-sm text-primary">Este viaje no existe.</p>
        <Link href="/dashboard/viajes" className="mt-3 inline-block text-xs text-info">Volver a Viajes</Link>
      </div>
    )
  }

  const pct = viaje.presupuesto ? (total / viaje.presupuesto) * 100 : 0
  const dias = duracionDias(viaje)
  const estadoK = estadoViaje(viaje)
  const estado = ETIQUETA_ESTADO[estadoK]
  const promedioDia = dias && dias > 0 ? total / dias : null
  const proy = proyeccionViaje(viaje, gastos)
  const transcurridos = proy?.transcurridos ?? null
  /* ritmo del día a día (sin vuelos ni alojamiento) si el viaje está en curso */
  const ritmo = proy ? proy.ritmo : promedioDia
  const proyectado = proy?.proyectado ?? null
  const diaMax = porDia.reduce<PuntoBarra | null>((m, d) => (!m || d.valor > m.valor ? d : m), null)
  const descontados = gastos.filter(g => g.billetera_linea_id).length

  /* Luca: proyección contra presupuesto, categoría dominante, día más caro */
  const luca: string[] = []
  if (proyectado != null && viaje.presupuesto) {
    const dif = proyectado - viaje.presupuesto
    luca.push(dif > 0
      ? `Con el día a día a ${fmtCorto(ritmo ?? 0)} (sin vuelos ni alojamiento) terminás gastando ${fmtARS(proyectado)}: ${fmtARS(dif)} más que el presupuesto. Para no pasarte, te quedan ${fmtARS(Math.max(0, (viaje.presupuesto - total) / Math.max(1, (dias ?? 0) - (transcurridos ?? 0))))} por día.`
      : `A este ritmo terminás en ${fmtARS(proyectado)}, ${fmtARS(-dif)} debajo del presupuesto.`)
  } else if (viaje.presupuesto && pct > 100) {
    luca.push(`Te pasaste ${fmtARS(total - viaje.presupuesto)} del presupuesto.`)
  }
  if (porCategoria.length > 1 && total > 0) {
    const top = porCategoria[0]
    luca.push(`${top.label} se llevó el ${Math.round((top.monto / total) * 100)}% del viaje.`)
  }
  if (luca.length < 2 && diaMax && diaMax.valor > 0 && porDia.filter(d => d.valor > 0).length > 2) {
    luca.push(`El día más caro fue el ${fmtFecha(diaMax.clave)} (${fmtARS(diaMax.valor)}).`)
  }

  const input = 'h-11 w-full rounded-lg border bg-field px-3 text-sm text-primary placeholder:text-muted'
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted'
  const btnIcono = 'fa-press grid h-10 w-10 place-items-center rounded-lg text-secondary hover:bg-alternate hover:text-primary'
  const maxCat = Math.max(...porCategoria.map(c => c.monto), 1)

  return (
    <div className="fa-page-in flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/viajes" className="inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-secondary hover:text-primary">
            <ArrowLeft size={14} /> Viajes
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span className="text-3xl" aria-hidden="true">{viaje.emoji}</span>
            <h1 className="text-xl font-extrabold tracking-tight text-primary lg:text-2xl">{viaje.nombre}</h1>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: viaje.archivado ? 'var(--text-muted)' : estado.color, background: `color-mix(in srgb, ${viaje.archivado ? 'var(--text-muted)' : estado.color} 14%, transparent)` }}>
              {viaje.archivado ? 'Realizado' : estado.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-secondary">
            {viaje.destino && `${viaje.destino} · `}{fmtRango(viaje.fecha_inicio, viaje.fecha_fin)}{dias ? ` · ${dias} ${dias === 1 ? 'día' : 'días'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditarViaje(true)} aria-label="Editar viaje" className={btnIcono}><Pencil size={16} /></button>
          <button onClick={alternarArchivo} aria-label={viaje.archivado ? 'Volver a activos' : 'Marcar como realizado'} title={viaje.archivado ? 'Volver a activos' : 'Marcar como realizado'} className={btnIcono}><Archive size={16} /></button>
          <button onClick={() => setConfirmarBorrado(true)} aria-label="Borrar viaje" className={`${btnIcono} hover:text-negative`}><Trash2 size={16} /></button>
          <button onClick={abierto ? () => setAbierto(false) : abrirNuevo}
            className="fa-press ml-2 flex h-11 items-center gap-1.5 rounded-xl bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={16} strokeWidth={2.5} /> Gasto
          </button>
        </div>
      </div>

      {/* Hero */}
      <section aria-label="Total del viaje" className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-5">
          <p className="fa-label">Gastado en el viaje</p>
          <NumeroAnimado valor={total} contarAlInicio
            className="mt-1 block text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold leading-none tracking-tight tabular-nums text-primary" />
          <p className="mt-2 text-xs text-secondary">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
            {ritmo != null && total > 0 ? ` · ${fmtARS(ritmo)} por día${proy ? ' sin vuelos ni alojamiento' : ''}` : ''}
            {transcurridos ? ` · día ${transcurridos} de ${dias}` : ''}
          </p>
        </div>
        <div className="lg:col-span-7">
          {viaje.presupuesto != null ? (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-secondary">Presupuesto <b className="tabular-nums text-primary">{fmtARS(viaje.presupuesto)}</b></span>
                <span className="font-semibold tabular-nums" style={{ color: colorPresupuesto(pct) }}>
                  {pct > 100 ? `Te pasaste ${fmtARS(total - viaje.presupuesto)}` : `Quedan ${fmtARS(viaje.presupuesto - total)}`}
                </span>
              </div>
              <div className="relative mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}
                role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Presupuesto usado">
                <div className="fa-grow-x h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: colorPresupuesto(pct) }} />
                {proyectado != null && viaje.presupuesto > 0 && proyectado / viaje.presupuesto < 1.5 && (
                  <span className="absolute top-0 h-full w-0.5" title="Proyección al final del viaje"
                    style={{ left: `${Math.min(99.5, (proyectado / viaje.presupuesto) * 100)}%`, background: 'var(--text-primary)', opacity: 0.6 }} />
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                {Math.round(pct)}% usado{proyectado != null ? ` · la marca es dónde terminarías a este ritmo (${fmtCorto(proyectado)})` : ''}
              </p>
            </>
          ) : (
            <button onClick={() => setEditarViaje(true)} className="fa-press rounded-xl border border-dashed px-4 py-3 text-left text-sm text-secondary hover:bg-alternate fa-hairline">
              Ponele un presupuesto y te aviso si vas a pasarte.
            </button>
          )}
        </div>
      </section>

      {luca.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent-secondary) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-secondary) 4%, var(--bg-card))' }}>
          <LucaAvatar estado={proyectado != null && viaje.presupuesto && proyectado > viaje.presupuesto ? 'warning' : 'insight'} size={30} />
          <p className="text-sm leading-relaxed text-primary">{luca.slice(0, 2).join(' ')}</p>
        </div>
      )}

      {/* Alta / edición de gasto */}
      {abierto && (
        <section className="fa-panel fa-pop p-5" aria-labelledby="t-form">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="t-form" className="text-[15px] font-bold text-primary">{editandoGasto ? 'Editar gasto' : 'Nuevo gasto'}</h2>
            <button onClick={() => { setAbierto(false); setEditandoGasto(null); setError('') }} aria-label="Cerrar" className={btnIcono}><X size={16} /></button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div>
                <label className={label} htmlFor="g-concepto">Concepto</label>
                <input id="g-concepto" className={input} value={form.concepto} autoFocus placeholder="Cena en Copacabana"
                  onChange={e => {
                    const concepto = e.target.value
                    const sug = sugerirCategoriaViaje(concepto) ?? 'varios'
                    /* sugiere la categoría mientras no la hayas elegido a mano */
                    setForm(f => ({ ...f, concepto, categoria: f.categoria === 'varios' || f.categoria === f.categoriaSugerida ? sug : f.categoria, categoriaSugerida: sug }))
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') guardarGasto() }} />
              </div>
              <div>
                <span className={label}>Moneda</span>
                <div className="flex flex-wrap gap-1.5">
                  {MONEDAS.map(m => {
                    const on = form.moneda === m.codigo
                    return (
                      <button key={m.codigo} type="button" aria-pressed={on} onClick={() => cambiarMoneda(m.codigo)}
                        className="fa-press h-10 rounded-lg border px-3 text-xs font-semibold text-secondary fa-hairline"
                        style={on ? { borderColor: 'var(--accent-confirm)', color: 'var(--accent-confirm)', background: 'color-mix(in srgb, var(--accent-confirm) 12%, transparent)' } : undefined}>
                        {m.bandera} {m.codigo}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="g-monto">Monto en {form.moneda}</label>
                  <input id="g-monto" type="number" inputMode="decimal" className={input} value={form.monto} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') guardarGasto() }} />
                </div>
                {form.moneda !== 'ARS' ? (
                  <div>
                    <label className={label} htmlFor="g-tc">1 {form.moneda} = ? ARS</label>
                    <input id="g-tc" type="number" inputMode="decimal" className={input} value={form.tipo_cambio} placeholder="Tipo de cambio"
                      onChange={e => setForm(f => ({ ...f, tipo_cambio: e.target.value }))} />
                    {form.moneda === 'USD' && dolarBlue && Number(form.tipo_cambio) !== dolarBlue && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, tipo_cambio: String(dolarBlue) }))} className="mt-1 text-[11px] text-info hover:underline">
                        Usar blue de hoy (${dolarBlue.toFixed(0)})
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className={label} htmlFor="g-fecha">Fecha</label>
                    <input id="g-fecha" type="date" className={input} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                  </div>
                )}
              </div>
              {equivalenteARS != null && form.moneda !== 'ARS' && (
                <p className="-mt-2 text-xs text-secondary">Equivale a <b className="tabular-nums text-primary">{fmtARS(equivalenteARS)}</b></p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {form.moneda !== 'ARS' && (
                  <div>
                    <label className={label} htmlFor="g-fecha">Fecha</label>
                    <input id="g-fecha" type="date" className={input} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                  </div>
                )}
                <div className={form.moneda !== 'ARS' ? '' : 'col-span-2'}>
                  <label className={label} htmlFor="g-cuenta">¿De qué cuenta salió?</label>
                  <select id="g-cuenta" className={input} value={form.cuenta} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))}>
                    <option value="">No descontar</option>
                    {cuentasForm.map(c => <option key={c.id} value={c.id}>{c.etiqueta || c.app} · {c.nombre} ({c.moneda})</option>)}
                  </select>
                </div>
              </div>
              {cuentaForm && Number(form.monto) > 0 && Number(form.tipo_cambio) > 0 && (
                <p className="-mt-2 text-[11px] text-muted">
                  Se descuentan {cuentaForm.moneda === 'ARS' ? fmtARS(aDescontar(cuentaForm, Number(form.monto), form.moneda, Number(form.tipo_cambio))) : fmtMonedaOriginal(Number(form.monto), form.moneda)} de esa cuenta.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <span className={label}>Categoría</span>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIAS_VIAJE.map(c => {
                    const on = form.categoria === c.key
                    return (
                      <button key={c.key} type="button" aria-pressed={on} onClick={() => setForm(f => ({ ...f, categoria: c.key }))}
                        className="fa-press h-10 rounded-lg border px-3 text-xs font-medium text-secondary fa-hairline"
                        style={on ? { borderColor: c.color, color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` } : undefined}>
                        {c.emoji} {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className={label} htmlFor="g-notas">Notas</label>
                <input id="g-notas" className={input} value={form.notas} placeholder="Opcional" onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-negative" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={guardarGasto} disabled={guardando}
              className="fa-press h-11 rounded-lg bg-confirm px-5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
              {guardando ? 'Guardando…' : editandoGasto ? 'Guardar cambios' : 'Agregar gasto'}
            </button>
            <button onClick={() => { setAbierto(false); setEditandoGasto(null); setError('') }} className="fa-press h-11 rounded-lg px-4 text-sm font-semibold text-secondary hover:bg-alternate">Cancelar</button>
          </div>
        </section>
      )}

      {gastos.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* En qué se fue */}
          <section className="min-w-0 lg:col-span-5" aria-labelledby="t-cat">
            <Encabezado id="t-cat" titulo="En qué se fue" sub="Tocá una categoría para filtrar los gastos" />
            <ul className="mt-4 space-y-1">
              {porCategoria.map(c => {
                const on = filtroCat === c.key
                return (
                  <li key={c.key}>
                    <button type="button" aria-pressed={on} onClick={() => setFiltroCat(on ? null : c.key)}
                      className="fa-press w-full rounded-lg px-2 py-1.5 text-left hover:bg-alternate"
                      style={{ background: on ? 'var(--bg-alternate)' : undefined, opacity: filtroCat && !on ? 0.5 : 1 }}>
                      <span className="flex items-center gap-2 text-sm">
                        <span aria-hidden="true">{c.emoji}</span>
                        <span className="flex-1 truncate text-primary">{c.label}</span>
                        <span className="text-xs text-muted">{Math.round((c.monto / (total || 1)) * 100)}%</span>
                        <span className="w-24 text-right font-semibold tabular-nums text-primary">{fmtARS(c.monto)}</span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                        <span className="fa-grow-x block h-full rounded-full" style={{ width: `${(c.monto / maxCat) * 100}%`, background: c.color }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* Día a día + monedas */}
          <section className="min-w-0 lg:col-span-7" aria-labelledby="t-dia">
            <Encabezado id="t-dia" titulo="Día a día" sub={filtroDia ? `Mostrando el ${fmtFecha(filtroDia)} · tocá de nuevo para ver todo` : 'Tocá un día para ver sus gastos'} />
            <div className="mt-4">
              <GraficoBarras datos={porDia} modo="barras" seleccion={filtroDia} onElegir={setFiltroDia} alto={190} color="var(--accent-secondary)" />
            </div>
            {porMoneda.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 border-t pt-4 fa-hairline">
                <span className="fa-label w-full">Cómo pagaste</span>
                {porMoneda.map(m => (
                  <div key={m.codigo} className="rounded-xl border px-3 py-2 fa-hairline">
                    <p className="text-xs font-semibold text-primary">{getMoneda(m.codigo).bandera} {m.codigo} <span className="font-normal text-muted">· {total > 0 ? Math.round((m.ars / total) * 100) : 0}%</span></p>
                    <p className="text-sm font-bold tabular-nums text-primary">{fmtMonedaOriginal(m.original, m.codigo)}</p>
                    {m.codigo !== 'ARS' && <p className="text-[11px] text-muted">≈ {fmtARS(m.ars)}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Lista de gastos */}
      <section aria-labelledby="t-gastos" className="flex flex-col gap-3">
        <Encabezado id="t-gastos" titulo="Gastos"
          sub={`${visibles.length} de ${gastos.length}${descontados ? ` · ${descontados} descontados de tus cuentas` : ''}`}
          derecha={(filtroCat || filtroDia) ? (
            <button onClick={() => { setFiltroCat(null); setFiltroDia(null) }} className="fa-press flex h-9 items-center gap-1 rounded-full border px-3 text-xs text-secondary hover:bg-alternate fa-hairline">
              <X size={12} /> Quitar filtros
            </button>
          ) : undefined} />

        {gastos.length === 0 ? (
          <button onClick={abrirNuevo} className="fa-press rounded-xl border border-dashed px-4 py-10 text-center text-sm text-secondary hover:bg-alternate fa-hairline">
            Todavía no cargaste gastos de este viaje. <span className="font-semibold text-info">Agregar el primero</span>
          </button>
        ) : (
          <div className="fa-panel overflow-hidden">
            {grupos.map(([fecha, lista]) => (
              <div key={fecha}>
                <div className="flex items-center justify-between px-4 pb-1.5 pt-4 text-xs">
                  <span className="font-semibold capitalize text-secondary">
                    {new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="tabular-nums text-muted">{fmtARS(lista.reduce((s, g) => s + Number(g.monto_ars || 0), 0))}</span>
                </div>
                <ul>
                  {lista.map(g => {
                    const cat = getCategoriaViaje(g.categoria)
                    return (
                      <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-alternate">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base" aria-hidden="true"
                          style={{ background: `color-mix(in srgb, ${cat.color} 14%, transparent)` }}>{cat.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary">{g.concepto}</p>
                          <p className="truncate text-[11px] text-muted">
                            {cat.label}{g.billetera_linea_id ? ` · ${(() => { const c = cuentas.find(x => x.id === g.billetera_linea_id); return c ? (c.etiqueta || c.app) : 'cuenta' })()}` : ''}{g.notas ? ` · ${g.notas}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-primary">{fmtARS(Number(g.monto_ars))}</p>
                          {g.moneda !== 'ARS' && <p className="text-[10px] text-muted">{getMoneda(g.moneda).bandera} {fmtMonedaOriginal(Number(g.monto), g.moneda)}</p>}
                        </div>
                        <div className="flex shrink-0">
                          <button onClick={() => abrirEdicion(g)} aria-label={`Editar ${g.concepto}`} className="fa-press grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-card hover:text-primary"><Pencil size={14} /></button>
                          <button onClick={() => borrarGasto(g)} aria-label={`Borrar ${g.concepto}`} className="fa-press grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-card hover:text-negative"><Trash2 size={14} /></button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {visibles.length === 0 && <p className="p-8 text-center text-xs text-secondary">No hay gastos con ese filtro.</p>}
          </div>
        )}
      </section>

      {editarViaje && <ViajeModal viaje={viaje} onClose={() => setEditarViaje(false)} onSaved={cargar} />}
      {confirmarBorrado && (
        <Confirmar titulo={`¿Borrar "${viaje.nombre}"?`} peligro accion="Borrar viaje"
          detalle={<>Se borran el viaje y sus {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}.{descontados ? ' Lo que se había descontado de tus cuentas vuelve a ellas.' : ''} No se puede deshacer.</>}
          onConfirmar={borrarViaje} onCancelar={() => setConfirmarBorrado(false)} />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}
