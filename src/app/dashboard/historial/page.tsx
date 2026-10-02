'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Download, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { traerCotizaciones } from '@/lib/patrimonio'
import { SkeletonPagina, fmtK, fmtPesos } from '@/components/ui/Piezas'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { Encabezado, NumeroAnimado, Pestanas, Toasts, fmt, useToasts } from '@/components/resumen/base'
import { GraficoMensual } from '@/components/resumen/GraficoMensual'
import { useAlCambiarDatos } from '@/lib/eventos'
import { hoyISO } from '@/lib/fechas'
import { cobradoDelMes, cobrosDeFreelance } from '@/lib/ingresos'
import { editarGastoVariable } from '@/lib/movimientos'

/* ── Historial ────────────────────────────────────────────────────
   Todo lo que entró y salió, en un solo lugar: gastos variables (con
   tarjeta y cuotas), fijos (uno por mes), ingresos, freelance, viajes
   y secciones propias. Los montos en dólares se pasan a pesos.       */

type Tipo = 'ingreso-fijo' | 'ingreso-freelance' | 'ingreso-seccion' | 'gasto-fijo' | 'gasto-variable' | 'gasto-viaje' | 'gasto-seccion' | 'cuenta'

interface Movimiento {
  id: string
  origenId: string
  tipo: Tipo
  descripcion: string
  monto: number
  moneda: string
  montoOriginal: number
  fecha: string
  categoria?: string
  tarjeta?: string
  forma?: string | null
  cuota?: string
  viajeId?: string
  viaje?: string
  seccionId?: string
}

const TIPO: Record<Tipo, { label: string; emoji: string }> = {
  'ingreso-fijo': { label: 'Ingreso fijo', emoji: '💼' },
  'ingreso-freelance': { label: 'Freelance', emoji: '🧾' },
  'ingreso-seccion': { label: 'Ingreso', emoji: '📥' },
  'gasto-fijo': { label: 'Gasto fijo', emoji: '📌' },
  'gasto-variable': { label: 'Gasto', emoji: '🛒' },
  'gasto-viaje': { label: 'Viaje', emoji: '✈️' },
  'gasto-seccion': { label: 'Gasto', emoji: '📤' },
  cuenta: { label: 'Entre cuentas', emoji: '🔁' },
}

const FILTROS = [
  { key: 'todos', label: 'Todo' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'fijos', label: 'Fijos' },
  { key: 'variables', label: 'Variables' },
  { key: 'tarjeta', label: '💳 Tarjeta' },
  { key: 'viajes', label: '✈️ Viajes' },
  { key: 'cuentas', label: '🔁 Entre cuentas' },
] as const
type Filtro = typeof FILTROS[number]['key']

const RANGOS = [
  { key: 'mes', label: 'Este mes' },
  { key: '3m', label: '3 meses' },
  { key: 'anio', label: 'Año' },
  { key: 'todo', label: 'Todo' },
  { key: 'custom', label: 'Fechas' },
] as const
type Rango = typeof RANGOS[number]['key']

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaMes = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`
const etiquetaMesCorta = (k: string) => `${MESES_C[Number(k.slice(5, 7)) - 1]} '${k.slice(2, 4)}`
const claveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const esIngreso = (t: Tipo) => t.startsWith('ingreso')
/* transferencias, pagos de tarjeta y ajustes: mueven plata entre tus cuentas, no son ingreso ni gasto */
const esCuenta = (t: Tipo) => t === 'cuenta'
const esGasto = (t: Tipo) => !esIngreso(t) && !esCuenta(t)
const PAGINA = 80

/** Meses desde `desde` (YYYY-MM) hasta el actual, como máximo 24. */
function mesesDesde(desde: string): string[] {
  const hoy = new Date()
  const res: string[] = []
  const d = new Date(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, 1)
  const tope = new Date(hoy.getFullYear(), hoy.getMonth() - 23, 1)
  if (d < tope) d.setTime(tope.getTime())
  while (d <= hoy) { res.push(claveMes(d)); d.setMonth(d.getMonth() + 1) }
  return res
}

export default function HistorialPage() {
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [rango, setRango] = useState<Rango>('3m')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [mostrar, setMostrar] = useState(PAGINA)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [edit, setEdit] = useState({ nombre: '', monto: '', categoria: '', fecha: '' })
  const [guardando, setGuardando] = useState(false)

  const toasts = useToasts()

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [cot, { data: gv }, { data: gf }, { data: iff }, { data: inf }, { data: secs }, { data: vg }, { data: vs }, { data: ts }, { data: lib }, { data: cts }] = await Promise.all([
      traerCotizaciones(),
      supabase.from('gastos_variables').select('*'),
      supabase.from('gastos_fijos').select('*'),
      supabase.from('ingresos_fijos').select('*'),
      supabase.from('ingresos_freelance').select('*'),
      supabase.from('secciones').select('id, nombre, tipo'),
      supabase.from('viaje_gastos').select('id, viaje_id, concepto, categoria, monto, moneda, monto_ars, fecha'),
      supabase.from('viajes').select('id, nombre, emoji'),
      supabase.from('tarjetas_cuentas').select('id, nombre'),
      supabase.from('movimientos').select('id, cuenta_id, fecha, tipo, delta, moneda, descripcion, grupo').in('tipo', ['transferencia', 'pago_tarjeta', 'ajuste']).order('fecha', { ascending: false }).limit(400),
      supabase.from('inversiones').select('id, nombre, app, etiqueta'),
    ])
    const dolar = cot.dolar ?? 1560
    type Fila = Record<string, unknown>
    const num = (v: unknown) => Number(v) || 0
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const fechaDe = (r: Fila) => str(r.fecha) || str(r.created_at).slice(0, 10)
    const tarjetas = new Map(((ts ?? []) as Fila[]).map(t => [str(t.id), str(t.nombre)]))
    const viajes = new Map(((vs ?? []) as Fila[]).map(v => [str(v.id), `${str(v.emoji)} ${str(v.nombre)}`.trim()]))

    const secsCont = ((secs ?? []) as Fila[]).filter(x => x.tipo === 'ingreso' || x.tipo === 'gasto')
    const infoSec = new Map(secsCont.map(x => [str(x.id), { nombre: str(x.nombre), tipo: str(x.tipo) }]))
    let regs: Fila[] = []
    if (secsCont.length) {
      const { data } = await supabase.from('seccion_registros').select('id, seccion_id, monto, fecha, datos, created_at').in('seccion_id', Array.from(infoSec.keys()))
      regs = (data ?? []) as Fila[]
    }

    /* los fijos se repiten todos los meses desde que los cargaste */
    const expandirFijo = (r: Fila, tipo: Tipo, montoDe: (mes: string) => number, pref: string): Movimiento[] =>
      mesesDesde(str(r.created_at).slice(0, 7) || claveMes(new Date())).map(m => ({ monto: montoDe(m), m }))
      .map(({ monto, m }) => ({
        id: `${pref}-${str(r.id)}-${m}`, origenId: str(r.id), tipo,
        descripcion: str(r.nombre) || str(r.descripcion) || TIPO[tipo].label,
        monto, moneda: 'ARS', montoOriginal: monto, fecha: `${m}-01`,
        categoria: tipo === 'gasto-fijo' ? str(r.categoria) || 'Fijo' : 'Ingreso fijo',
      }))

    /* libro: una fila por transferencia (la pata que sale) y una por pago o ajuste */
    const nombreCta = new Map(((cts ?? []) as Fila[]).map(c => [str(c.id), `${str(c.etiqueta) || str(c.app)} · ${str(c.nombre)}`.replace(/^ · /, '')]))
    const delLibro: Movimiento[] = ((lib ?? []) as Fila[])
      .filter(r => str(r.tipo) !== 'transferencia' || num(r.delta) < 0)
      .map(r => {
        const t = str(r.tipo)
        const d = num(r.delta)
        const cta = nombreCta.get(str(r.cuenta_id)) ?? 'Cuenta eliminada'
        const otra = t === 'transferencia' ? ((lib ?? []) as Fila[]).find(x => x.grupo && x.grupo === r.grupo && x.id !== r.id) : undefined
        const dest = otra ? nombreCta.get(str(otra.cuenta_id)) : undefined
        const moneda = str(r.moneda) || 'ARS'
        return {
          id: 'lb-' + str(r.id), origenId: str(r.id), tipo: 'cuenta' as Tipo,
          descripcion: t === 'transferencia' ? `${cta} → ${dest ?? 'otra cuenta'}` : str(r.descripcion) || (t === 'pago_tarjeta' ? 'Pago de tarjeta' : 'Ajuste de saldo'),
          monto: moneda === 'USD' ? Math.abs(d) * dolar : Math.abs(d), moneda, montoOriginal: Math.abs(d), fecha: str(r.fecha).slice(0, 10),
          categoria: t === 'transferencia' ? 'Transferencia' : t === 'pago_tarjeta' ? 'Pago de tarjeta' : 'Ajuste manual',
          forma: d < 0 ? 'sale' : 'entra', tarjeta: t !== 'transferencia' ? cta : undefined,
        }
      })

    const todos: Movimiento[] = [
      ...delLibro,
      ...((gv ?? []) as Fila[]).map(r => {
        const moneda = str(r.moneda) || 'ARS'
        const orig = num(r.monto)
        const cuotasTotal = num(r.cuotas_total)
        return {
          id: 'gv-' + str(r.id), origenId: str(r.id), tipo: 'gasto-variable' as Tipo,
          descripcion: str(r.nombre) || str(r.descripcion), monto: moneda === 'USD' ? orig * dolar : orig,
          moneda, montoOriginal: orig, fecha: fechaDe(r), categoria: str(r.categoria),
          tarjeta: tarjetas.get(str(r.tarjeta_id)), forma: (r.forma_pago as string | null) ?? null,
          cuota: cuotasTotal > 1 ? `${num(r.cuota_numero)}/${cuotasTotal}` : undefined,
        }
      }),
      ...activos(gf as Fila[] | null).flatMap(r => expandirFijo(r, 'gasto-fijo', () => num(r.monto), 'gf')),
      ...activos(iff as Fila[] | null).flatMap(r => expandirFijo(r, 'ingreso-fijo', m => cobradoDelMes(r, m), 'iff')),
      /* freelance: un movimiento por cobro, en la fecha en que entró */
      ...((inf ?? []) as Fila[]).flatMap(r => cobrosDeFreelance(r).map((c, i) => ({
        id: `inf-${str(r.id)}-${i}`, origenId: str(r.id), tipo: 'ingreso-freelance' as Tipo,
        descripcion: str(r.descripcion) || str(r.cliente) || str(r.nombre) || 'Freelance',
        monto: c.monto, moneda: 'ARS', montoOriginal: c.monto, fecha: c.fecha, categoria: str(r.cliente) || 'Freelance',
      }))),
      ...((vg ?? []) as Fila[]).map(r => ({
        id: 'vg-' + str(r.id), origenId: str(r.id), tipo: 'gasto-viaje' as Tipo,
        descripcion: str(r.concepto), monto: num(r.monto_ars), moneda: str(r.moneda) || 'ARS',
        montoOriginal: num(r.monto), fecha: fechaDe(r), categoria: str(r.categoria),
        viajeId: str(r.viaje_id), viaje: viajes.get(str(r.viaje_id)),
      })),
      ...regs.map(r => {
        const info = infoSec.get(str(r.seccion_id))
        const campos = (r.datos as Record<string, unknown>) || {}
        const texto = Object.values(campos).find(v => typeof v === 'string' && v.trim() !== '') as string | undefined
        return {
          id: 'sr-' + str(r.id), origenId: str(r.id),
          tipo: (info?.tipo === 'ingreso' ? 'ingreso-seccion' : 'gasto-seccion') as Tipo,
          descripcion: texto || info?.nombre || 'Registro', monto: num(r.monto), moneda: 'ARS',
          montoOriginal: num(r.monto), fecha: fechaDe(r), categoria: info?.nombre, seccionId: str(r.seccion_id),
        }
      }),
    ].filter(m => m.fecha)

    todos.sort((a, b) => b.fecha.localeCompare(a.fecha))
    setMovs(todos)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  /* llega desde el buscador global: /dashboard/historial?q=… */
  useEffect(() => {
    const q0 = new URLSearchParams(window.location.search).get('q')
    if (q0) { setBusqueda(q0); setRango('todo') }
  }, [])
  useAlCambiarDatos(cargar)

  /* ── filtros ─────────────────────────────── */
  const [fDesde, fHasta] = useMemo(() => {
    const hoy = new Date()
    if (rango === 'mes') return [`${claveMes(hoy)}-01`, hoyISO()]
    if (rango === '3m') return [`${claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1))}-01`, hoyISO()]
    if (rango === 'anio') return [`${hoy.getFullYear()}-01-01`, hoyISO()]
    if (rango === 'custom') return [desde, hasta]
    return ['', '']
  }, [rango, desde, hasta])

  const q = busqueda.trim().toLowerCase()
  const filtrados = useMemo(() => movs.filter(m => {
    if (fDesde && m.fecha < fDesde) return false
    if (esCuenta(m.tipo) !== (filtro === 'cuentas')) return false
    if (fHasta && m.fecha > fHasta) return false
    if (filtro === 'ingresos' && !esIngreso(m.tipo)) return false
    if (filtro === 'gastos' && esIngreso(m.tipo)) return false
    if (filtro === 'fijos' && m.tipo !== 'gasto-fijo' && m.tipo !== 'ingreso-fijo') return false
    if (filtro === 'variables' && m.tipo !== 'gasto-variable') return false
    if (filtro === 'tarjeta' && (!m.tarjeta || esCuenta(m.tipo))) return false
    if (filtro === 'viajes' && m.tipo !== 'gasto-viaje') return false
    if (q && !`${m.descripcion} ${m.categoria ?? ''} ${m.tarjeta ?? ''} ${m.viaje ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }), [movs, fDesde, fHasta, filtro, q])

  useEffect(() => { setMostrar(PAGINA) }, [filtro, rango, desde, hasta, q])

  const totIng = filtrados.filter(m => esIngreso(m.tipo)).reduce((s, m) => s + m.monto, 0)
  const totGas = filtrados.filter(m => esGasto(m.tipo)).reduce((s, m) => s + m.monto, 0)

  const porMes = useMemo(() => {
    const acc: Record<string, { mes: string; ingresos: number; gastos: number; balance: number }> = {}
    for (const m of filtrados) {
      const k = m.fecha.slice(0, 7)
      acc[k] = acc[k] ?? { mes: k, ingresos: 0, gastos: 0, balance: 0 }
      if (esIngreso(m.tipo)) acc[k].ingresos += m.monto
      else if (esGasto(m.tipo)) acc[k].gastos += m.monto
      acc[k].balance = acc[k].ingresos - acc[k].gastos
    }
    return Object.values(acc).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12)
  }, [filtrados])

  const pagina = filtrados.slice(0, mostrar)
  const grupos = useMemo(() => {
    const g: { mes: string; items: Movimiento[] }[] = []
    for (const m of pagina) {
      const k = m.fecha.slice(0, 7)
      const ultimo = g[g.length - 1]
      if (ultimo && ultimo.mes === k) ultimo.items.push(m)
      else g.push({ mes: k, items: [m] })
    }
    return g
  }, [pagina])
  const subtotalMes = (k: string) => {
    const ms = filtrados.filter(m => m.fecha.startsWith(k))
    const ing = ms.filter(m => esIngreso(m.tipo)).reduce((s, m) => s + m.monto, 0)
    const gas = ms.filter(m => esGasto(m.tipo)).reduce((s, m) => s + m.monto, 0)
    return { ing, gas, cant: ms.length }
  }

  function irAlMes(k: string) {
    const [y, mm] = k.split('-').map(Number)
    setDesde(`${k}-01`)
    setHasta(`${k}-${String(new Date(y, mm, 0).getDate()).padStart(2, '0')}`)
    setRango('custom')
  }

  function abrir(m: Movimiento) {
    if (abierto === m.id) { setAbierto(null); return }
    setAbierto(m.id)
    setEdit({ nombre: m.descripcion, monto: String(m.montoOriginal), categoria: m.categoria ?? '', fecha: m.fecha })
  }

  async function guardarEdicion(m: Movimiento) {
    if (!edit.nombre.trim() || !Number(edit.monto)) return
    setGuardando(true)
    const supabase = createClient()
    const antes = { nombre: m.descripcion, monto: m.montoOriginal, categoria: m.categoria || 'varios', fecha: m.fecha }
    const r = await editarGastoVariable(supabase, m.origenId, {
      nombre: edit.nombre.trim(), monto: Number(edit.monto), categoria: edit.categoria || 'varios', fecha: edit.fecha,
    })
    setGuardando(false)
    if (r && 'error' in r && r.error) { toasts.mostrar({ texto: 'No se pudo guardar el cambio.', tono: 'error' }, 5000); return }
    setAbierto(null)
    cargar()
    toasts.mostrar({
      texto: `Guardaste ${edit.nombre.trim()}.`,
      deshacer: async () => { await editarGastoVariable(createClient(), m.origenId, antes); cargar() },
    }, 7000)
  }

  function exportarCSV() {
    const filas = [
      ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Medio', 'Cuota', 'Moneda', 'Monto original', 'Monto en pesos'],
      ...filtrados.map(m => [
        m.fecha, TIPO[m.tipo].label, m.descripcion, m.categoria ?? '', m.tarjeta ?? m.viaje ?? '', m.cuota ?? '',
        m.moneda, String(m.montoOriginal), String(Math.round(m.monto) * (esCuenta(m.tipo) ? (m.forma === 'sale' ? -1 : 1) : esIngreso(m.tipo) ? 1 : -1)),
      ]),
    ]
    const csv = filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `historial-${hoyISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hayFiltros = filtro !== 'todos' || rango !== '3m' || q

  if (loading) return <SkeletonPagina kpis={2} />

  /* Luca: el mejor y el peor mes de lo que estás viendo (solo meses cerrados) */
  const cerrados = porMes.filter(x => x.mes < claveMes(new Date()))
  let luca = ''
  if (cerrados.length >= 3) {
    const mejor = cerrados.reduce((a, b) => (b.balance > a.balance ? b : a))
    const peor = cerrados.reduce((a, b) => (b.balance < a.balance ? b : a))
    const prom = cerrados.reduce((s2, x) => s2 + x.balance, 0) / cerrados.length
    luca = `En estos ${cerrados.length} meses cerrados te quedaron en promedio ${fmt(prom)} por mes. El mejor fue ${etiquetaMes(mejor.mes)} (${fmt(mejor.balance)}) y el más flojo ${etiquetaMes(peor.mes)} (${fmt(peor.balance)}).`
  }
  const mesElegido = rango === 'custom' && desde && hasta && desde.slice(0, 7) === hasta.slice(0, 7) ? desde.slice(0, 7) : null

  return (
    <div className="fa-page-in flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Historial</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-primary lg:text-2xl">Todo lo que entró y salió</h1>
        </div>
        <button onClick={exportarCSV} disabled={!filtrados.length}
          className="fa-press flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold text-primary hover:bg-alternate disabled:opacity-40 fa-hairline">
          <Download size={16} /> Exportar CSV
        </button>
      </header>

      {/* Hero: neto del período elegido */}
      <section aria-label="Resultado del período" className="grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-5">
          <p className="fa-label">Te quedó en el período</p>
          <NumeroAnimado valor={totIng - totGas} contarAlInicio
            className={`mt-1 block text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold leading-none tracking-tight tabular-nums ${totIng - totGas >= 0 ? 'text-primary' : 'text-negative'}`} />
          <p className="mt-2 text-xs text-secondary">
            {filtrados.length.toLocaleString('es-AR')} movimientos · {rango === 'custom' ? (desde && hasta ? `${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}` : 'elegí las fechas') : RANGOS.find(r => r.key === rango)?.label.toLowerCase()}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 lg:col-span-7">
          <div>
            <dt className="fa-label">Entró</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-positive">+{fmt(totIng)}</dd>
          </div>
          <div>
            <dt className="fa-label">Salió</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-negative">−{fmt(totGas)}</dd>
          </div>
        </dl>
      </section>

      {luca && (
        <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent-secondary) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-secondary) 4%, var(--bg-card))' }}>
          <LucaAvatar estado="insight" size={30} />
          <p className="text-sm leading-relaxed text-primary">{luca}</p>
        </div>
      )}

      {porMes.length > 1 && (
        <section aria-labelledby="t-mes">
          <Encabezado id="t-mes" titulo="Mes a mes" sub="Lo que entró y lo que salió · tocá un mes para verlo solo" />
          <div className="mt-4">
            <GraficoMensual datos={porMes} modo="flujo" mesSel={mesElegido} onElegir={irAlMes} alto={230} />
          </div>
        </section>
      )}

      {/* Filtros (fijos arriba al bajar) */}
      <div className="sticky top-[var(--header-h)] z-20 -mx-4 flex flex-col gap-3 border-b px-4 py-3 backdrop-blur fa-hairline lg:-mx-2 lg:px-2"
        style={{ background: 'color-mix(in srgb, var(--bg-page) 88%, transparent)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <label htmlFor="h-buscar" className="sr-only">Buscar</label>
            <input id="h-buscar" type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar descripción, categoría, tarjeta o viaje…"
              className="h-11 w-full rounded-lg border bg-field pl-9 pr-3 text-sm text-primary" />
          </div>
          <Pestanas etiqueta="Período" opciones={RANGOS} valor={rango} onCambio={setRango} />
        </div>
        {rango === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
            <label htmlFor="h-desde">Desde</label> <input id="h-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 rounded-lg border bg-field px-2.5 text-sm text-primary" />
            <label htmlFor="h-hasta">hasta</label> <input id="h-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9 rounded-lg border bg-field px-2.5 text-sm text-primary" />
          </div>
        )}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          {FILTROS.map(f => {
            const on = filtro === f.key
            return (
              <button key={f.key} onClick={() => setFiltro(f.key)} aria-pressed={on}
                className="fa-press h-8 shrink-0 rounded-full border px-3 text-xs font-semibold fa-hairline"
                style={on ? { background: 'var(--text-primary)', borderColor: 'var(--text-primary)', color: 'var(--bg-page)' } : { color: 'var(--text-secondary)' }}>
                {f.label}
              </button>
            )
          })}
          {hayFiltros && (
            <button onClick={() => { setFiltro('todos'); setRango('3m'); setBusqueda('') }}
              className="fa-press ml-auto flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted hover:bg-alternate hover:text-primary">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Lista agrupada por mes */}
      {filtrados.length === 0 ? (
        <div className="fa-panel p-10 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm text-secondary">{movs.length === 0 ? 'No hay movimientos registrados' : 'Nada con estos filtros'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map(g => {
            const st = subtotalMes(g.mes)
            return (
              <section key={g.mes} className="fa-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 fa-hairline">
                  <p className="text-sm font-bold capitalize text-primary">{etiquetaMes(g.mes)} <span className="ml-1 text-xs font-normal text-muted">{st.cant} movimientos</span></p>
                  <p className="flex gap-3 text-xs font-semibold">
                    <span className="text-positive">+{fmtK(st.ing)}</span>
                    <span className="text-negative">−{fmtK(st.gas)}</span>
                    <span className="text-primary">= {fmtK(st.ing - st.gas)}</span>
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {g.items.map(m => {
                    const ing = esIngreso(m.tipo)
                    const cta = esCuenta(m.tipo)
                    const open = abierto === m.id
                    return (
                      <li key={m.id}>
                        <button onClick={() => abrir(m)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-alternate ${open ? 'bg-alternate' : ''}`}>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                            style={{ background: `color-mix(in srgb, ${cta ? 'var(--accent-secondary)' : ing ? 'var(--accent-positive)' : 'var(--accent-negative)'} 12%, transparent)` }}>
                            {TIPO[m.tipo].emoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-primary">{m.descripcion || '—'}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="text-muted">{m.fecha.slice(8, 10)}/{m.fecha.slice(5, 7)}</span>
                              <Chip>{TIPO[m.tipo].label}</Chip>
                              {m.categoria && m.categoria !== TIPO[m.tipo].label && <Chip>{m.categoria}</Chip>}
                              {m.tarjeta && !cta && <Chip>💳 {m.tarjeta}{m.forma === 'credito' ? ' · crédito' : m.forma === 'debito' ? ' · débito' : ''}</Chip>}
                              {cta && m.tarjeta && <Chip>{m.tarjeta}</Chip>}
                              {m.cuota && <Chip>cuota {m.cuota}</Chip>}
                              {m.viaje && <Chip>{m.viaje}</Chip>}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`fa-num-sm block ${cta ? 'text-primary' : ing ? 'text-positive' : 'text-negative'}`}>{cta ? (m.categoria === 'Transferencia' ? '' : m.forma === 'sale' ? '−' : '+') : ing ? '+' : '−'}{fmtPesos(m.monto)}</span>
                            {m.moneda !== 'ARS' && <span className="fa-caption block">{m.moneda} {m.montoOriginal.toLocaleString('es-AR')}</span>}
                          </span>
                          <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>

                        {open && (
                          <div className="fa-aparecer border-t border-line bg-alternate px-4 py-3">
                            {m.tipo === 'gasto-variable' ? (
                              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                                <input value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} aria-label="Descripción" className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
                                <input type="number" value={edit.monto} onChange={e => setEdit({ ...edit, monto: e.target.value })} aria-label={`Monto en ${m.moneda}`} className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
                                <input value={edit.categoria} onChange={e => setEdit({ ...edit, categoria: e.target.value })} aria-label="Categoría" className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
                                <input type="date" value={edit.fecha} onChange={e => setEdit({ ...edit, fecha: e.target.value })} aria-label="Fecha" className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
                                <div className="flex gap-2">
                                  <button onClick={() => guardarEdicion(m)} disabled={guardando} className="rounded-lg bg-confirm px-3 py-2 text-xs font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
                                    {guardando ? '…' : 'Guardar'}
                                  </button>
                                  <button onClick={() => setAbierto(null)} className="rounded-lg px-3 py-2 text-xs text-secondary hover:bg-card">Cerrar</button>
                                </div>
                                {m.cuota && <p className="text-[11px] text-muted sm:col-span-5">Es la cuota {m.cuota}: el cambio aplica solo a esta cuota.</p>}
                              </div>
                            ) : esCuenta(m.tipo) ? (
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
                                <span>Movió plata entre tus cuentas, no cuenta como ingreso ni gasto. Lo podés deshacer desde el libro en Billeteras.</span>
                                <Link href="/dashboard/billeteras" className="rounded-lg border px-3 py-1.5 font-semibold text-primary hover:bg-card">Ir al libro →</Link>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
                                <span>
                                  {m.tipo === 'gasto-fijo' || m.tipo === 'ingreso-fijo'
                                    ? 'Es un movimiento fijo: se repite todos los meses. Lo editás desde su sección.'
                                    : 'Este movimiento se edita desde su sección.'}
                                </span>
                                <Link href={linkDe(m)} className="rounded-lg border px-3 py-1.5 font-semibold text-primary hover:bg-card">Ir a editarlo →</Link>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}

          {filtrados.length > mostrar && (
            <button onClick={() => setMostrar(n => n + PAGINA)}
              className="fa-lift mx-auto rounded-xl border px-5 py-2.5 text-sm font-semibold text-primary hover:bg-alternate">
              Cargar más ({filtrados.length - mostrar} restantes)
            </button>
          )}
        </div>
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}

function activos<T extends Record<string, unknown>>(rows: T[] | null): T[] {
  return (rows ?? []).filter(r => r.activo !== false)
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-alternate px-1.5 py-0.5 font-medium text-secondary">{children}</span>
}

function linkDe(m: Movimiento): string {
  if (m.tipo === 'gasto-viaje' && m.viajeId) return `/dashboard/viajes/${m.viajeId}`
  if (m.seccionId) return `/dashboard/seccion/${m.seccionId}`
  if (m.tipo === 'gasto-fijo') return '/dashboard/gastos-variables'
  return '/dashboard/ingresos-gastos'
}
