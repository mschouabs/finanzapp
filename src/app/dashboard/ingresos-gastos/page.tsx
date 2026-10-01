'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { SkeletonPagina } from '@/components/ui/Piezas'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { Encabezado, NumeroAnimado, Pestanas, Toasts, fmt, fmtCorto, useToasts } from '@/components/resumen/base'
import { EVENTO_DATOS, useAlCambiarDatos } from '@/lib/eventos'
import { hoyISO, mesActualISO } from '@/lib/fechas'
import { cobradoDelMes, cobradoFreelanceEnMes, cobrosDeFreelance, guardarIngresoFijo, tieneCobroEsteMes, yaCobradoEsteMes } from '@/lib/ingresos'
import { esLiquida, type LineaSaldo } from '@/lib/patrimonio'

/* ── Trabajos ─────────────────────────────────────────────────────
   Lo que ganás: sueldos fijos y proyectos freelance.
   · Arriba, cuánto entra este mes y cuánto falta cobrar.
   · Cada cobro (de sueldo o de proyecto) se puede registrar con un
     toque y, si querés, sumarlo a la cuenta donde entró.
   · El freelance cuenta en el mes en que lo cobraste, no en el mes
     en que empezó el proyecto.                                       */

type Fila = Record<string, unknown>

interface IngresoFijo {
  id: string
  nombre: string
  monto: number
  monto_cobrado: number | null
  cobrado_mes?: string | null
  activo: boolean
  created_at?: string
}

interface IngresoFreelance {
  id: string
  cliente: string
  descripcion: string | null
  monto_total: number
  monto_cobrado: number
  fecha: string
  cobros?: { fecha: string; monto: number }[]
  created_at?: string
}

type Filtro = 'pendientes' | 'cobrados' | 'todos'

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const formVacioFreelance = () => ({ cliente: '', descripcion: '', monto_total: '', monto_cobrado: '', fecha: hoyISO() })

const inputCls = 'h-11 w-full rounded-lg border bg-field px-3 text-sm text-primary'
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted'
const btnIcono = 'fa-press grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-alternate hover:text-primary'

const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_DATOS))

export default function TrabajosPage() {
  const [fijos, setFijos] = useState<IngresoFijo[]>([])
  const [freelance, setFreelance] = useState<IngresoFreelance[]>([])
  const [cuentas, setCuentas] = useState<LineaSaldo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<'fijo' | 'freelance' | null>(null)
  const [formFijo, setFormFijo] = useState({ nombre: '', monto: '', monto_cobrado: '' })
  const [formFreelance, setFormFreelance] = useState(formVacioFreelance())
  const [editandoFijoId, setEditandoFijoId] = useState<string | null>(null)
  const [editandoFreelanceId, setEditandoFreelanceId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [cobrando, setCobrando] = useState<{ tipo: 'fijo' | 'freelance'; id: string; monto: string; cuenta: string } | null>(null)
  const [mesFoco, setMesFoco] = useState<string | null>(null)
  const toasts = useToasts()

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: f }, { data: fl }, { data: lin }] = await Promise.all([
      supabase.from('ingresos_fijos').select('*').eq('user_id', user.id).eq('activo', true).order('nombre'),
      supabase.from('ingresos_freelance').select('*').eq('user_id', user.id).order('fecha', { ascending: false }),
      supabase.from('inversiones').select('*'),
    ])
    setFijos((f ?? []) as IngresoFijo[])
    /* sin dato de cobrado = cobrado completo (mismo criterio que el Resumen) */
    setFreelance(((fl ?? []) as IngresoFreelance[]).map(r => ({
      ...r, monto_total: Number(r.monto_total) || 0,
      monto_cobrado: r.monto_cobrado == null ? Number(r.monto_total) || 0 : Number(r.monto_cobrado) || 0,
    })))
    setCuentas(((lin ?? []) as LineaSaldo[]).filter(l => esLiquida(l) && l.moneda === 'ARS'))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useAlCambiarDatos(cargar)

  /* ── números ── */
  const mes = mesActualISO()
  const totalFijos = fijos.reduce((s, f) => s + cobradoDelMes(f as unknown as Fila), 0)
  const fijosCobrados = fijos.reduce((s, f) => s + yaCobradoEsteMes(f as unknown as Fila), 0)
  const fijosSinCobrar = fijos.filter(f => !tieneCobroEsteMes(f as unknown as Fila))
  const freelanceDelMes = freelance.reduce((s, f) => s + cobradoFreelanceEnMes(f as unknown as Fila, mes), 0)
  const pendientes = freelance.filter(f => f.monto_total - f.monto_cobrado > 0.5)
  const totalPendiente = pendientes.reduce((s, f) => s + (f.monto_total - f.monto_cobrado), 0)
  const totalMes = totalFijos + freelanceDelMes
  const yaEntro = fijosCobrados + freelanceDelMes

  /* últimos 6 meses: el freelance es real (por fecha de cobro). El sueldo
     de meses pasados no tiene historial guardado: se muestra al monto
     actual y más tenue, y así se aclara. */
  const meses = useMemo(() => {
    const hoy = new Date()
    const out: { key: string; label: string; fijo: number; freelance: number; estimado: boolean }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const fin = `${key}-31`
      const fijo = i === 0 ? totalFijos
        : fijos.filter(f => !f.created_at || f.created_at.slice(0, 10) <= fin).reduce((s, f) => s + Number(f.monto || 0), 0)
      const fl = freelance.reduce((s, f) => s + cobradoFreelanceEnMes(f as unknown as Fila, key), 0)
      out.push({ key, label: MESES_CORTO[d.getMonth()], fijo, freelance: fl, estimado: i > 0 })
    }
    return out
  }, [fijos, freelance, totalFijos])

  const promedioFreelance = meses.slice(0, 5).reduce((s, m) => s + m.freelance, 0) / 5

  /* Luca: lo más útil primero, sin inventar nada */
  const luca = useMemo(() => {
    const frases: string[] = []
    if (pendientes.length > 0) {
      const viejo = [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
      frases.push(`Te deben ${fmt(totalPendiente)} en ${pendientes.length} ${pendientes.length === 1 ? 'proyecto' : 'proyectos'}; el más antiguo es de ${viejo.cliente} (desde el ${fechaCorta(viejo.fecha)}).`)
    }
    if (fijosSinCobrar.length > 0 && new Date().getDate() >= 10) {
      frases.push(`Todavía no marcaste el cobro de ${fijosSinCobrar.map(f => f.nombre).join(' y ')} este mes.`)
    }
    if (frases.length < 2 && totalMes > 0 && freelanceDelMes > 0) {
      const pct = Math.round((freelanceDelMes / totalMes) * 100)
      const vsProm = promedioFreelance > 0 ? Math.round(((freelanceDelMes - promedioFreelance) / promedioFreelance) * 100) : null
      frases.push(`El freelance es el ${pct}% de lo que entra este mes${vsProm !== null && Math.abs(vsProm) >= 15 ? ` (${vsProm > 0 ? '+' : ''}${vsProm}% vs. tu promedio de los últimos 5 meses)` : ''}.`)
    }
    return frases.slice(0, 2).join(' ')
  }, [pendientes, totalPendiente, fijosSinCobrar, totalMes, freelanceDelMes, promedioFreelance])

  /* ── sueldos fijos ── */
  async function guardarFijo() {
    if (!formFijo.nombre.trim() || !formFijo.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const monto = Number(formFijo.monto)
    const monto_cobrado = formFijo.monto_cobrado ? Number(formFijo.monto_cobrado) : null
    /* editar o, si ya hay uno activo con el mismo nombre, actualizarlo
       (evita los sueldos duplicados) */
    const existente = editandoFijoId
      ? fijos.find(f => f.id === editandoFijoId)
      : fijos.find(f => f.nombre.trim().toLowerCase() === formFijo.nombre.trim().toLowerCase())
    const datos: Fila = { nombre: formFijo.nombre.trim(), monto }
    if (monto_cobrado != null || existente) datos.monto_cobrado = monto_cobrado
    const { error } = existente
      ? await guardarIngresoFijo(supabase, datos, existente.id)
      : await guardarIngresoFijo(supabase, { user_id: user.id, ...datos, activo: true })
    if (error) { toasts.mostrar({ texto: 'No se pudo guardar el sueldo.', tono: 'error' }, 5000); return }
    toasts.mostrar({ texto: existente ? `Actualizaste ${datos.nombre}.` : `Agregaste ${datos.nombre}.` }, 4000)
    setFormFijo({ nombre: '', monto: '', monto_cobrado: '' })
    setEditandoFijoId(null)
    setShowForm(null)
    cargar(); avisarCambio()
  }

  function editarFijo(f: IngresoFijo) {
    const cobrado = tieneCobroEsteMes(f as unknown as Fila) && f.monto_cobrado != null ? String(f.monto_cobrado) : ''
    setFormFijo({ nombre: f.nombre, monto: String(f.monto), monto_cobrado: cobrado })
    setEditandoFijoId(f.id)
    setShowForm('fijo')
  }

  async function borrarFijo(f: IngresoFijo) {
    const supabase = createClient()
    setFijos(xs => xs.filter(x => x.id !== f.id))
    const { error } = await supabase.from('ingresos_fijos').update({ activo: false }).eq('id', f.id)
    if (error) { toasts.mostrar({ texto: 'No se pudo quitar.', tono: 'error' }); cargar(); return }
    avisarCambio()
    toasts.mostrar({
      texto: `Quitaste ${f.nombre}.`,
      deshacer: async () => { await createClient().from('ingresos_fijos').update({ activo: true }).eq('id', f.id); cargar(); avisarCambio() },
    }, 7000)
  }

  /* ── freelance ── */
  async function guardarFreelance() {
    if (!formFreelance.cliente.trim() || !formFreelance.monto_total) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const datos: Fila = {
      cliente: formFreelance.cliente.trim(),
      descripcion: formFreelance.descripcion.trim(),
      monto_total: Number(formFreelance.monto_total),
      monto_cobrado: Number(formFreelance.monto_cobrado || '0'),
      fecha: formFreelance.fecha,
    }
    if (editandoFreelanceId) {
      /* si corregís lo cobrado a menos de lo que tiene detallado, el
         detalle deja de valer y se toma todo en la fecha del proyecto */
      const previo = freelance.find(f => f.id === editandoFreelanceId)
      const detallado = (previo?.cobros ?? []).reduce((s, c) => s + Number(c.monto || 0), 0)
      if (detallado > Number(datos.monto_cobrado)) datos.cobros = []
    }
    const { error } = editandoFreelanceId
      ? await supabase.from('ingresos_freelance').update(datos).eq('id', editandoFreelanceId)
      : await supabase.from('ingresos_freelance').insert({ user_id: user.id, ...datos })
    if (error) { toasts.mostrar({ texto: 'No se pudo guardar el proyecto.', tono: 'error' }, 5000); return }
    toasts.mostrar({ texto: editandoFreelanceId ? 'Proyecto actualizado.' : `Agregaste el proyecto de ${datos.cliente}.` }, 4000)
    setFormFreelance(formVacioFreelance())
    setEditandoFreelanceId(null)
    setShowForm(null)
    cargar(); avisarCambio()
  }

  function editarFreelance(f: IngresoFreelance) {
    setFormFreelance({
      cliente: f.cliente, descripcion: f.descripcion ?? '',
      monto_total: String(f.monto_total), monto_cobrado: String(f.monto_cobrado), fecha: f.fecha,
    })
    setEditandoFreelanceId(f.id)
    setShowForm('freelance')
  }

  async function borrarFreelance(f: IngresoFreelance) {
    const supabase = createClient()
    setFreelance(xs => xs.filter(x => x.id !== f.id))
    const { data: fila } = await supabase.from('ingresos_freelance').select('*').eq('id', f.id).single()
    const { error } = await supabase.from('ingresos_freelance').delete().eq('id', f.id)
    if (error) { toasts.mostrar({ texto: 'No se pudo borrar.', tono: 'error' }); cargar(); return }
    avisarCambio()
    toasts.mostrar({
      texto: `Borraste el proyecto de ${f.cliente}.`,
      deshacer: fila ? async () => { await createClient().from('ingresos_freelance').insert(fila); cargar(); avisarCambio() } : undefined,
    }, 7000)
  }

  /* ── registrar un cobro (sueldo o proyecto) ── */
  function abrirCobro(tipo: 'fijo' | 'freelance', id: string, sugerido: number) {
    setCobrando({ tipo, id, monto: String(Math.round(sugerido)), cuenta: '' })
  }

  async function confirmarCobro() {
    if (!cobrando) return
    const monto = Number(cobrando.monto)
    if (!(monto > 0)) return
    const supabase = createClient()
    const { tipo, id, cuenta } = cobrando
    let deshacerFila: () => Promise<unknown>
    let nombre = ''

    if (tipo === 'fijo') {
      const f = fijos.find(x => x.id === id)
      if (!f) return
      nombre = f.nombre
      const antes = { monto_cobrado: f.monto_cobrado, ...('cobrado_mes' in f ? { cobrado_mes: f.cobrado_mes ?? null } : {}) }
      const { error } = await guardarIngresoFijo(supabase, { monto_cobrado: monto }, id)
      if (error) { toasts.mostrar({ texto: 'No se pudo registrar el cobro.', tono: 'error' }, 5000); return }
      deshacerFila = () => Promise.resolve(createClient().from('ingresos_fijos').update(antes).eq('id', id))
    } else {
      const f = freelance.find(x => x.id === id)
      if (!f) return
      nombre = f.cliente
      const antes = { monto_cobrado: f.monto_cobrado, cobros: f.cobros ?? [] }
      const cobros = [...(f.cobros ?? []), { fecha: hoyISO(), monto }]
      const { error } = await supabase.from('ingresos_freelance')
        .update({ monto_cobrado: Number(f.monto_cobrado || 0) + monto, cobros }).eq('id', id)
      if (error) { toasts.mostrar({ texto: 'No se pudo registrar el cobro.', tono: 'error' }, 5000); return }
      deshacerFila = () => Promise.resolve(createClient().from('ingresos_freelance').update(antes).eq('id', id))
    }

    let enCuenta = false
    if (cuenta) {
      const { error } = await supabase.rpc('ajustar_saldo', { p_id: cuenta, p_delta: monto })
      if (error) toasts.mostrar({ texto: 'El cobro quedó anotado, pero no se pudo sumar a la cuenta.', tono: 'error' }, 8000)
      else enCuenta = true
    }

    setCobrando(null)
    cargar(); avisarCambio()
    toasts.mostrar({
      texto: `Cobro de ${nombre}: ${fmt(monto)}${enCuenta ? ' sumado a tu cuenta' : ''}.`,
      deshacer: async () => {
        await deshacerFila()
        if (enCuenta) await createClient().rpc('ajustar_saldo', { p_id: cuenta, p_delta: -monto })
        cargar(); avisarCambio()
      },
    }, 8000)
  }

  if (loading) return <SkeletonPagina kpis={2} />

  const visibles = freelance.filter(f => {
    const pend = f.monto_total - f.monto_cobrado > 0.5
    if (filtro === 'pendientes') return pend
    if (filtro === 'cobrados') return !pend
    return true
  })
  const maxMes = Math.max(...meses.map(m => m.fijo + m.freelance), 1)
  const foco = meses.find(m => m.key === mesFoco) ?? meses[meses.length - 1]
  const pctEntro = totalMes > 0 ? Math.min(100, (yaEntro / totalMes) * 100) : 0

  const panelCobro = (sugerido: number) => cobrando && (
    <div className="fa-pop mt-3 rounded-xl border p-3 fa-hairline" style={{ background: 'var(--bg-alternate)' }}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="cobro-monto">¿Cuánto cobraste?</label>
          <input id="cobro-monto" type="number" inputMode="decimal" autoFocus value={cobrando.monto}
            onChange={e => setCobrando({ ...cobrando, monto: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') confirmarCobro(); if (e.key === 'Escape') setCobrando(null) }}
            className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cobro-cuenta">¿Dónde entró?</label>
          <select id="cobro-cuenta" value={cobrando.cuenta} onChange={e => setCobrando({ ...cobrando, cuenta: e.target.value })} className={inputCls}>
            <option value="">Solo anotarlo</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.etiqueta || c.app} · {c.nombre}</option>)}
          </select>
        </div>
      </div>
      {cobrando.cuenta && <p className="mt-1.5 text-[11px] text-muted">Se suma al saldo de esa cuenta.</p>}
      {Number(cobrando.monto) > 0 && Math.abs(Number(cobrando.monto) - sugerido) > 0.5 && cobrando.tipo === 'fijo' && (
        <p className="mt-1.5 text-[11px] text-muted">Distinto de lo normal ({fmt(sugerido)}): queda solo para este mes.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={confirmarCobro} className="fa-press h-10 rounded-lg bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">Registrar cobro</button>
        <button onClick={() => setCobrando(null)} className="fa-press h-10 rounded-lg px-4 text-sm text-secondary hover:bg-card">Cancelar</button>
      </div>
    </div>
  )

  return (
    <div className="fa-page-in flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Trabajos</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-primary lg:text-2xl">Lo que ganás</h1>
        </div>
      </header>

      {/* Hero: lo que entra este mes */}
      <section aria-label="Ingresos del mes" className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-5">
          <p className="fa-label">Ingresos de este mes</p>
          <NumeroAnimado valor={totalMes} contarAlInicio
            className="mt-1 block text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold leading-none tracking-tight tabular-nums text-primary" />
          <p className="mt-2 text-xs text-secondary">
            {fmt(totalFijos)} de sueldo{fijos.length === 1 ? '' : 's'} · {fmt(freelanceDelMes)} de freelance
          </p>
        </div>
        <div className="lg:col-span-7">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-secondary">Ya entró <b className="tabular-nums text-primary">{fmt(yaEntro)}</b></span>
            {totalPendiente > 0 && (
              <span className="text-secondary">Te deben <b className="tabular-nums" style={{ color: 'var(--accent-warning)' }}>{fmt(totalPendiente)}</b></span>
            )}
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}
            role="progressbar" aria-valuenow={Math.round(pctEntro)} aria-valuemin={0} aria-valuemax={100} aria-label="Parte del mes ya cobrada">
            <div className="fa-grow-x h-full rounded-full" style={{ width: `${pctEntro}%`, background: 'var(--accent-positive)' }} />
          </div>
          {fijosSinCobrar.length > 0 && (
            <p className="mt-2 text-xs text-muted">Falta marcar el cobro de {fijosSinCobrar.map(f => f.nombre).join(', ')}.</p>
          )}
        </div>
      </section>

      {luca && (
        <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent-secondary) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-secondary) 4%, var(--bg-card))' }}>
          <LucaAvatar estado="insight" size={30} />
          <p className="text-sm leading-relaxed text-primary">{luca}</p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Sueldos fijos */}
        <section className="flex flex-col gap-3 lg:col-span-5" aria-labelledby="t-fijos">
          <Encabezado id="t-fijos" titulo="Sueldos" sub="Lo que cobrás todos los meses"
            derecha={
              <button onClick={() => { setEditandoFijoId(null); setFormFijo({ nombre: '', monto: '', monto_cobrado: '' }); setShowForm(showForm === 'fijo' ? null : 'fijo') }}
                className="fa-press flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-info hover:bg-alternate">
                <Plus size={14} strokeWidth={2.5} /> Agregar
              </button>
            } />

          {showForm === 'fijo' && (
            <div className="fa-panel fa-pop p-4">
              {editandoFijoId && <p className="mb-3 text-xs text-muted">Editando «{formFijo.nombre}».</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="f-nombre">Nombre</label>
                  <input id="f-nombre" placeholder="Ej. Trabajo principal" value={formFijo.nombre}
                    onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="f-monto">Sueldo normal</label>
                  <input id="f-monto" type="number" inputMode="decimal" value={formFijo.monto}
                    onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="f-cobrado">Cobrado este mes</label>
                  <input id="f-cobrado" type="number" inputMode="decimal" placeholder="Opcional" value={formFijo.monto_cobrado}
                    onChange={e => setFormFijo(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={guardarFijo} className="fa-press h-10 rounded-lg bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
                  {editandoFijoId ? 'Guardar cambios' : 'Guardar'}
                </button>
                <button onClick={() => { setShowForm(null); setEditandoFijoId(null) }} className="fa-press h-10 rounded-lg px-4 text-sm text-secondary hover:bg-alternate">Cancelar</button>
              </div>
            </div>
          )}

          {fijos.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-secondary fa-hairline">
              Todavía no cargaste ningún sueldo.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {fijos.map(f => {
                const fila = f as unknown as Fila
                const cobrado = tieneCobroEsteMes(fila)
                const monto = cobradoDelMes(fila)
                const diff = monto - f.monto
                const abierto = cobrando?.tipo === 'fijo' && cobrando.id === f.id
                return (
                  <li key={f.id} className="fa-panel p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-primary">{f.nombre}</p>
                        <p className="mt-0.5 text-xs text-muted">Normal {fmt(f.monto)}{diff !== 0 && cobrado ? ` · este mes ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}` : ''}</p>
                      </div>
                      <div className="flex shrink-0">
                        <button onClick={() => editarFijo(f)} aria-label={`Editar ${f.nombre}`} className={btnIcono}><Pencil size={15} /></button>
                        <button onClick={() => borrarFijo(f)} aria-label={`Quitar ${f.nombre}`} className={`${btnIcono} hover:text-negative`}><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <NumeroAnimado valor={monto} className="text-xl font-bold tabular-nums text-primary" />
                      {cobrado ? (
                        <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-positive"
                          style={{ background: 'color-mix(in srgb, var(--accent-positive) 14%, transparent)' }}>
                          <Check size={12} strokeWidth={3} /> Cobrado
                        </span>
                      ) : !abierto && (
                        <button onClick={() => abrirCobro('fijo', f.id, f.monto)}
                          className="fa-press h-9 rounded-lg border px-3 text-xs font-semibold text-primary hover:bg-alternate fa-hairline">
                          Marcar cobrado
                        </button>
                      )}
                    </div>
                    {abierto && panelCobro(f.monto)}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Evolución */}
        <section className="flex flex-col gap-3 lg:col-span-7" aria-labelledby="t-evol">
          <Encabezado id="t-evol" titulo="Últimos 6 meses" sub="Sueldo y freelance, por mes de cobro" />
          <div className="fa-panel p-5">
            <div className="flex h-[180px] items-end gap-2 sm:gap-4" onMouseLeave={() => setMesFoco(null)}>
              {meses.map((m, i) => {
                const total = m.fijo + m.freelance
                const activo = foco.key === m.key
                return (
                  <button key={m.key} onMouseEnter={() => setMesFoco(m.key)} onFocus={() => setMesFoco(m.key)} onClick={() => setMesFoco(m.key)}
                    aria-label={`${m.label}: ${fmt(total)}`}
                    className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="flex w-full max-w-[44px] flex-col justify-end overflow-hidden rounded-t-md"
                      style={{ height: `${(total / maxMes) * 100}%`, minHeight: total > 0 ? 3 : 0, opacity: activo ? 1 : 0.75, transition: 'opacity 140ms ease' }}>
                      <span className="fa-grow-y block w-full" style={{ height: `${total > 0 ? (m.freelance / total) * 100 : 0}%`, background: 'var(--accent-violet)', animationDelay: `${i * 40}ms` }} />
                      <span className="fa-grow-y block w-full" style={{
                        height: `${total > 0 ? (m.fijo / total) * 100 : 0}%`, animationDelay: `${i * 40}ms`,
                        background: m.estimado ? 'color-mix(in srgb, var(--accent-secondary) 45%, transparent)' : 'var(--accent-secondary)',
                      }} />
                    </span>
                    <span className={`text-[11px] ${activo ? 'font-semibold text-primary' : 'text-muted'}`}>{m.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm fa-hairline">
              <span className="capitalize text-secondary">{foco.label} {foco.key.slice(0, 4)}</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-secondary)' }} />Sueldo {fmtCorto(foco.fijo)}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-violet)' }} />Freelance {fmtCorto(foco.freelance)}</span>
                <b className="tabular-nums text-primary">{fmt(foco.fijo + foco.freelance)}</b>
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted">En meses anteriores el sueldo se muestra a su monto actual (más tenue): no hay historial guardado de esos cobros.</p>
          </div>
        </section>
      </div>

      {/* Freelance */}
      <section className="flex flex-col gap-3" aria-labelledby="t-free">
        <Encabezado id="t-free" titulo="Proyectos freelance" sub="Trabajos puntuales: lo que cobraste y lo que te deben"
          derecha={
            <div className="flex flex-wrap items-center gap-2">
              <Pestanas etiqueta="Filtrar proyectos" valor={filtro} onCambio={setFiltro}
                opciones={[{ key: 'pendientes', label: `Por cobrar${pendientes.length ? ` · ${pendientes.length}` : ''}` }, { key: 'cobrados', label: 'Cobrados' }, { key: 'todos', label: 'Todos' }]} />
              <button onClick={() => { setEditandoFreelanceId(null); setFormFreelance(formVacioFreelance()); setShowForm(showForm === 'freelance' ? null : 'freelance') }}
                className="fa-press flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-info hover:bg-alternate">
                <Plus size={14} strokeWidth={2.5} /> Agregar
              </button>
            </div>
          } />

        {showForm === 'freelance' && (
          <div className="fa-panel fa-pop p-4">
            {editandoFreelanceId && <p className="mb-3 text-xs text-muted">Editando el proyecto.</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="col-span-2 lg:col-span-1">
                <label className={labelCls} htmlFor="p-cliente">Cliente</label>
                <input id="p-cliente" value={formFreelance.cliente} onChange={e => setFormFreelance(p => ({ ...p, cliente: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2 lg:col-span-1">
                <label className={labelCls} htmlFor="p-desc">Qué hiciste</label>
                <input id="p-desc" placeholder="Opcional" value={formFreelance.descripcion} onChange={e => setFormFreelance(p => ({ ...p, descripcion: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="p-total">Monto total</label>
                <input id="p-total" type="number" inputMode="decimal" value={formFreelance.monto_total} onChange={e => setFormFreelance(p => ({ ...p, monto_total: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="p-cobrado">Ya cobré</label>
                <input id="p-cobrado" type="number" inputMode="decimal" placeholder="0" value={formFreelance.monto_cobrado} onChange={e => setFormFreelance(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2 lg:col-span-1">
                <label className={labelCls} htmlFor="p-fecha">Fecha</label>
                <input id="p-fecha" type="date" value={formFreelance.fecha} onChange={e => setFormFreelance(p => ({ ...p, fecha: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={guardarFreelance} className="fa-press h-10 rounded-lg bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
                {editandoFreelanceId ? 'Guardar cambios' : 'Guardar'}
              </button>
              <button onClick={() => { setShowForm(null); setEditandoFreelanceId(null) }} className="fa-press h-10 rounded-lg px-4 text-sm text-secondary hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        )}

        {visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-secondary fa-hairline">
            {filtro === 'pendientes' ? 'Nadie te debe nada. 🎉' : filtro === 'cobrados' ? 'Todavía no hay proyectos cobrados completos.' : 'Todavía no cargaste proyectos.'}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map(f => {
              const pct = f.monto_total > 0 ? Math.min(100, (f.monto_cobrado / f.monto_total) * 100) : 0
              const pendiente = f.monto_total - f.monto_cobrado
              const completo = pendiente <= 0.5 && f.monto_total > 0
              const abierto = cobrando?.tipo === 'freelance' && cobrando.id === f.id
              const ultimos = cobrosDeFreelance(f as unknown as Fila).slice(-3).reverse()
              return (
                <li key={f.id} className={`fa-panel flex flex-col p-4 ${abierto ? 'sm:col-span-2 xl:col-span-1' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary">{f.descripcion || f.cliente}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{f.descripcion ? `${f.cliente} · ` : ''}{fechaCorta(f.fecha)}</p>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => editarFreelance(f)} aria-label={`Editar proyecto de ${f.cliente}`} className={btnIcono}><Pencil size={15} /></button>
                      <button onClick={() => borrarFreelance(f)} aria-label={`Borrar proyecto de ${f.cliente}`} className={`${btnIcono} hover:text-negative`}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <NumeroAnimado valor={f.monto_cobrado} className="text-xl font-bold tabular-nums text-primary" />
                    <span className="text-xs text-muted">de {fmt(f.monto_total)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                    <div className="fa-grow-x h-full rounded-full" style={{ width: `${pct}%`, background: completo ? 'var(--accent-positive)' : 'var(--accent-warning)' }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {completo ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-positive"><Check size={13} strokeWidth={3} /> Cobrado completo</span>
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent-warning)' }}>Te deben {fmt(pendiente)}</span>
                    )}
                    {!completo && !abierto && (
                      <button onClick={() => abrirCobro('freelance', f.id, pendiente)}
                        className="fa-press h-9 rounded-lg border px-3 text-xs font-semibold text-primary hover:bg-alternate fa-hairline">
                        Registrar cobro
                      </button>
                    )}
                  </div>
                  {ultimos.length > 0 && !abierto && (f.cobros?.length ?? 0) > 0 && (
                    <p className="mt-2 text-[11px] text-muted">Cobros: {ultimos.map(c => `${fmtCorto(c.monto)} el ${fechaCorta(c.fecha)}`).join(' · ')}</p>
                  )}
                  {abierto && panelCobro(pendiente)}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}
