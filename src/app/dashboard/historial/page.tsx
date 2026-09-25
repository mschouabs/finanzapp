'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Download, Hash, Scale, Search, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { traerCotizaciones } from '@/lib/patrimonio'
import { Kpi, Segmentado, Titulo, fmtK, fmtPesos, tooltipStyle } from '@/components/ui/Piezas'

/* ── Historial ────────────────────────────────────────────────────
   Todo lo que entró y salió, en un solo lugar: gastos variables (con
   tarjeta y cuotas), fijos (uno por mes), ingresos, freelance, viajes
   y secciones propias. Los montos en dólares se pasan a pesos.       */

type Tipo = 'ingreso-fijo' | 'ingreso-freelance' | 'ingreso-seccion' | 'gasto-fijo' | 'gasto-variable' | 'gasto-viaje' | 'gasto-seccion'

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
}

const FILTROS = [
  { key: 'todos', label: 'Todo' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'fijos', label: 'Fijos' },
  { key: 'variables', label: 'Variables' },
  { key: 'tarjeta', label: '💳 Tarjeta' },
  { key: 'viajes', label: '✈️ Viajes' },
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
const hoyISO = () => new Date().toISOString().slice(0, 10)
const esIngreso = (t: Tipo) => t.startsWith('ingreso')
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

  const cargar = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [cot, { data: gv }, { data: gf }, { data: iff }, { data: inf }, { data: secs }, { data: vg }, { data: vs }, { data: ts }] = await Promise.all([
      traerCotizaciones(),
      supabase.from('gastos_variables').select('*'),
      supabase.from('gastos_fijos').select('*'),
      supabase.from('ingresos_fijos').select('*'),
      supabase.from('ingresos_freelance').select('*'),
      supabase.from('secciones').select('id, nombre, tipo'),
      supabase.from('viaje_gastos').select('id, viaje_id, concepto, categoria, monto, moneda, monto_ars, fecha'),
      supabase.from('viajes').select('id, nombre, emoji'),
      supabase.from('tarjetas_cuentas').select('id, nombre'),
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
    const expandirFijo = (r: Fila, tipo: Tipo, monto: number, pref: string): Movimiento[] =>
      mesesDesde(str(r.created_at).slice(0, 7) || claveMes(new Date())).map(m => ({
        id: `${pref}-${str(r.id)}-${m}`, origenId: str(r.id), tipo,
        descripcion: str(r.nombre) || str(r.descripcion) || TIPO[tipo].label,
        monto, moneda: 'ARS', montoOriginal: monto, fecha: `${m}-01`,
        categoria: tipo === 'gasto-fijo' ? str(r.categoria) || 'Fijo' : 'Ingreso fijo',
      }))

    const todos: Movimiento[] = [
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
      ...activos(gf as Fila[] | null).flatMap(r => expandirFijo(r, 'gasto-fijo', num(r.monto), 'gf')),
      ...activos(iff as Fila[] | null).flatMap(r => expandirFijo(r, 'ingreso-fijo', num(r.monto_cobrado ?? r.monto), 'iff')),
      ...((inf ?? []) as Fila[]).map(r => {
        const m = num(r.monto_cobrado ?? r.monto_total ?? r.monto)
        return {
          id: 'inf-' + str(r.id), origenId: str(r.id), tipo: 'ingreso-freelance' as Tipo,
          descripcion: str(r.descripcion) || str(r.cliente) || str(r.nombre) || 'Freelance',
          monto: m, moneda: 'ARS', montoOriginal: m, fecha: fechaDe(r), categoria: 'Freelance',
        }
      }),
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
    if (fHasta && m.fecha > fHasta) return false
    if (filtro === 'ingresos' && !esIngreso(m.tipo)) return false
    if (filtro === 'gastos' && esIngreso(m.tipo)) return false
    if (filtro === 'fijos' && m.tipo !== 'gasto-fijo' && m.tipo !== 'ingreso-fijo') return false
    if (filtro === 'variables' && m.tipo !== 'gasto-variable') return false
    if (filtro === 'tarjeta' && !m.tarjeta) return false
    if (filtro === 'viajes' && m.tipo !== 'gasto-viaje') return false
    if (q && !`${m.descripcion} ${m.categoria ?? ''} ${m.tarjeta ?? ''} ${m.viaje ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }), [movs, fDesde, fHasta, filtro, q])

  useEffect(() => { setMostrar(PAGINA) }, [filtro, rango, desde, hasta, q])

  const totIng = filtrados.filter(m => esIngreso(m.tipo)).reduce((s, m) => s + m.monto, 0)
  const totGas = filtrados.filter(m => !esIngreso(m.tipo)).reduce((s, m) => s + m.monto, 0)

  const porMes = useMemo(() => {
    const acc: Record<string, { mes: string; ingresos: number; gastos: number }> = {}
    for (const m of filtrados) {
      const k = m.fecha.slice(0, 7)
      acc[k] = acc[k] ?? { mes: k, ingresos: 0, gastos: 0 }
      if (esIngreso(m.tipo)) acc[k].ingresos += m.monto
      else acc[k].gastos += m.monto
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
    const gas = ms.filter(m => !esIngreso(m.tipo)).reduce((s, m) => s + m.monto, 0)
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
    await supabase.from('gastos_variables').update({
      nombre: edit.nombre.trim(), monto: Number(edit.monto), categoria: edit.categoria || 'varios', fecha: edit.fecha,
    }).eq('id', m.origenId)
    setGuardando(false)
    setAbierto(null)
    cargar()
  }

  function exportarCSV() {
    const filas = [
      ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Medio', 'Cuota', 'Moneda', 'Monto original', 'Monto en pesos'],
      ...filtrados.map(m => [
        m.fecha, TIPO[m.tipo].label, m.descripcion, m.categoria ?? '', m.tarjeta ?? m.viaje ?? '', m.cuota ?? '',
        m.moneda, String(m.montoOriginal), String(Math.round(m.monto) * (esIngreso(m.tipo) ? 1 : -1)),
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

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">📋 Historial</h1>
          <p className="mt-1 text-sm text-secondary">Todo lo que entró y salió, en un solo lugar.</p>
        </div>
        <button onClick={exportarCSV} disabled={!filtrados.length}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold text-primary hover:bg-alternate disabled:opacity-40">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="fa-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por descripción, categoría, tarjeta o viaje…"
              className="w-full rounded-lg border bg-field py-2.5 pl-9 pr-3 text-sm text-primary" />
          </div>
          <Segmentado opciones={RANGOS} valor={rango} onCambio={setRango} />
        </div>
        {rango === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
            Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="rounded-lg border bg-field px-2.5 py-1.5 text-sm text-primary" />
            hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="rounded-lg border bg-field px-2.5 py-1.5 text-sm text-primary" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={filtro === f.key
                ? { background: 'var(--accent-confirm)', borderColor: 'var(--accent-confirm)', color: '#fff' }
                : { color: 'var(--text-secondary)' }}>
              {f.label}
            </button>
          ))}
          {hayFiltros && (
            <button onClick={() => { setFiltro('todos'); setRango('3m'); setBusqueda('') }}
              className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted hover:bg-alternate hover:text-primary">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Movimientos" valor={filtrados.length.toLocaleString('es-AR')} icono={<Hash size={17} />} tono="var(--accent-secondary)" />
        <Kpi label="Ingresos" valor={fmtK(totIng)} icono={<ArrowUpRight size={17} />} tono="var(--accent-positive)" />
        <Kpi label="Gastos" valor={fmtK(totGas)} icono={<ArrowDownRight size={17} />} tono="var(--accent-negative)" />
        <Kpi label="Neto" valor={fmtK(totIng - totGas)} icono={<Scale size={17} />} tono={totIng - totGas >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)'} />
      </div>

      {/* Gráfico mensual */}
      {porMes.length > 0 && (
        <section className="fa-card p-5">
          <Titulo titulo="Mes a mes" sub="Ingresos contra gastos de lo que estás viendo · tocá un mes para verlo solo" />
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} barGap={3}
                onClick={(e: unknown) => { const k = (e as { activeLabel?: string } | null)?.activeLabel; if (k) irAlMes(k) }}>
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={etiquetaMesCorta} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={etiquetaMes} formatter={(v: number) => fmtPesos(v)} cursor={{ fill: 'var(--bg-alternate)' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="var(--accent-positive)" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} />
                <Bar dataKey="gastos" name="Gastos" fill="var(--accent-negative)" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Lista agrupada por mes */}
      {loading ? (
        <div className="fa-card p-10 text-center text-sm text-muted">Cargando movimientos…</div>
      ) : filtrados.length === 0 ? (
        <div className="fa-card p-10 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm text-secondary">{movs.length === 0 ? 'No hay movimientos registrados' : 'Nada con estos filtros'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map(g => {
            const st = subtotalMes(g.mes)
            return (
              <section key={g.mes} className="fa-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-alternate px-4 py-2.5">
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
                    const open = abierto === m.id
                    return (
                      <li key={m.id}>
                        <button onClick={() => abrir(m)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-alternate ${open ? 'bg-alternate' : ''}`}>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                            style={{ background: `color-mix(in srgb, ${ing ? 'var(--accent-positive)' : 'var(--accent-negative)'} 12%, transparent)` }}>
                            {TIPO[m.tipo].emoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-primary">{m.descripcion || '—'}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="text-muted">{m.fecha.slice(8, 10)}/{m.fecha.slice(5, 7)}</span>
                              <Chip>{TIPO[m.tipo].label}</Chip>
                              {m.categoria && m.categoria !== TIPO[m.tipo].label && <Chip>{m.categoria}</Chip>}
                              {m.tarjeta && <Chip>💳 {m.tarjeta}{m.forma === 'credito' ? ' · crédito' : m.forma === 'debito' ? ' · débito' : ''}</Chip>}
                              {m.cuota && <Chip>cuota {m.cuota}</Chip>}
                              {m.viaje && <Chip>{m.viaje}</Chip>}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`fa-amount block text-sm ${ing ? 'text-positive' : 'text-negative'}`}>{ing ? '+' : '−'}{fmtPesos(m.monto)}</span>
                            {m.moneda !== 'ARS' && <span className="block text-[10px] text-muted">{m.moneda} {m.montoOriginal.toLocaleString('es-AR')}</span>}
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
