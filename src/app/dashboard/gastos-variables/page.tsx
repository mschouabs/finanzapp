'use client'

/* ══ Movimientos ══════════════════════════════════════════════════
   Personalidad: análisis + registro. Responde "¿en qué se me va la
   plata?" y permite cargar y corregir rápido.
   Jerarquía:
     PRIMARIO    total del período y cómo viene vs. el anterior
     SECUNDARIO  la lista de movimientos (buscar, filtrar, editar)
     CONTEXTUAL  día a día, categorías, con qué pagaste, más grandes
     AVANZADO    gastos fijos, exportar
   Todo conectado: click en un día o en una categoría filtra la lista.
   Los gastos de viaje también aparecen (antes no estaban acá).       */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Download, MessageCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  borrarConDeshacer, editarGastoVariable, guardarGastoVariable, montoEnPesos, restaurarGastos,
} from '@/lib/movimientos'
import { traerCotizaciones } from '@/lib/patrimonio'
import { CATEGORIAS, getCat } from '@/lib/categorias'
import { hoyISO } from '@/lib/fechas'
import { useAlCambiarDatos } from '@/lib/eventos'
import { AgregarMovimientoModal } from '@/components/AgregarMovimientoModal'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import {
  Confirmar, Encabezado, NumeroAnimado, Pestanas, Revelar, Toasts, fmt, fmtFechaCorta, useMedia, useToasts,
} from '@/components/resumen/base'
import { Categorias } from '@/components/resumen/Secciones'
import { CapturaLuca, type GastoDetectado } from '@/components/resumen/Luca'
import { GraficoBarras, type PuntoBarra } from '@/components/resumen/GraficoBarras'
import type { Categoria } from '@/lib/finanzas/nucleo'

interface GastoVariable {
  id: string
  nombre: string
  monto: number
  categoria: string
  fecha: string
  es_gasto_hormiga: boolean
  tarjeta_id: string | null
  forma_pago: 'debito' | 'credito' | null
  billetera_linea_id: string | null
  moneda: string | null
  compra_id: string | null
  cuota_numero: number | null
  cuotas_total: number | null
  monto_total: number | null
}

interface GastoViaje { id: string; viaje_id: string; concepto: string; monto_ars: number; fecha: string }
interface GastoFijo { id: string; nombre: string; monto: number; categoria: string; activo: boolean; debitado: boolean }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const pad = (n: number) => String(n).padStart(2, '0')

/* ── períodos ─────────────────────────────────────────────────── */
type Preset = 'mes' | 'pasado' | '3m' | 'anio'
interface Rango { desde: string; hasta: string; titulo: string; esMes: boolean; year: number; month: number }
const ultimoDia = (y: number, m: number) => new Date(y, m, 0).getDate()
const rangoMes = (y: number, m: number): Rango => ({
  desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(ultimoDia(y, m))}`,
  titulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`, esMes: true, year: y, month: m,
})
function rangoPreset(p: Preset): Rango {
  const h = new Date()
  if (p === 'mes') return rangoMes(h.getFullYear(), h.getMonth() + 1)
  if (p === 'pasado') { const d = new Date(h.getFullYear(), h.getMonth() - 1, 1); return rangoMes(d.getFullYear(), d.getMonth() + 1) }
  if (p === '3m') {
    const d = new Date(h.getFullYear(), h.getMonth() - 2, 1)
    return { desde: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, hasta: hoyISO(), titulo: 'Últimos 3 meses', esMes: false, year: h.getFullYear(), month: h.getMonth() + 1 }
  }
  return { desde: `${h.getFullYear()}-01-01`, hasta: hoyISO(), titulo: `Año ${h.getFullYear()}`, esMes: false, year: h.getFullYear(), month: 12 }
}
const PRESETS = [
  { key: 'mes', label: 'Este mes' }, { key: 'pasado', label: 'Mes pasado' }, { key: '3m', label: '3 meses' }, { key: 'anio', label: 'Año' },
] as const

type Fila = { tipo: 'gasto'; g: GastoVariable; pesos: number } | { tipo: 'viaje'; v: GastoViaje; pesos: number }

export default function MovimientosPage() {
  const desktop = useMedia('(min-width: 1024px)', true)
  const toasts = useToasts()
  const [rango, setRango] = useState<Rango>(() => rangoPreset('mes'))
  const [preset, setPreset] = useState<Preset | null>('mes')
  const [gastos, setGastos] = useState<GastoVariable[]>([])
  const [gastosAnt, setGastosAnt] = useState<GastoVariable[]>([])
  const [viajes, setViajes] = useState<GastoViaje[]>([])
  const [viajesAnt, setViajesAnt] = useState<GastoViaje[]>([])
  const [nombreViaje, setNombreViaje] = useState<Record<string, string>>({})
  const [fijos, setFijos] = useState<GastoFijo[]>([])
  const [cuentas, setCuentas] = useState<Record<string, string>>({})
  const [dolar, setDolar] = useState<number | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando')

  const [filtroCat, setFiltroCat] = useState<string | null>(null)
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [soloHormiga, setSoloHormiga] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<'barras' | 'acumulado'>('barras')
  const [agregar, setAgregar] = useState(false)
  const [hoja, setHoja] = useState(false)
  const [analisis, setAnalisis] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState({ nombre: '', monto: '', categoria: 'varios', fecha: '', es_gasto_hormiga: false })
  const [confirmarCompra, setConfirmarCompra] = useState<GastoVariable | null>(null)
  const [formFijo, setFormFijo] = useState<{ nombre: string; monto: string; categoria: string } | null>(null)
  const [nuevos, setNuevos] = useState<Set<string>>(new Set())

  const idsPrevios = useRef<Set<string> | null>(null)
  const ars = useCallback((g: { monto: number; moneda?: string | null }) => montoEnPesos(g, dolar), [dolar])

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setEstado('cargando')
    const supabase = createClient()
    const ant = new Date(rango.year, rango.month - 2, 1)
    const antDesde = `${ant.getFullYear()}-${pad(ant.getMonth() + 1)}-01`
    const antHasta = `${ant.getFullYear()}-${pad(ant.getMonth() + 1)}-${pad(ultimoDia(ant.getFullYear(), ant.getMonth() + 1))}`
    const [cot, rG, rA, rV, rVA, rVs, rF, rC, rL] = await Promise.all([
      traerCotizaciones(),
      supabase.from('gastos_variables').select('*').gte('fecha', rango.desde).lte('fecha', rango.hasta).order('fecha', { ascending: false }),
      rango.esMes ? supabase.from('gastos_variables').select('*').gte('fecha', antDesde).lte('fecha', antHasta) : Promise.resolve({ data: [] }),
      supabase.from('viaje_gastos').select('id, viaje_id, concepto, monto_ars, fecha').gte('fecha', rango.desde).lte('fecha', rango.hasta),
      rango.esMes ? supabase.from('viaje_gastos').select('id, viaje_id, concepto, monto_ars, fecha').gte('fecha', antDesde).lte('fecha', antHasta) : Promise.resolve({ data: [] }),
      supabase.from('viajes').select('id, nombre, emoji'),
      supabase.from('gastos_fijos').select('*').eq('activo', true).order('nombre'),
      supabase.from('tarjetas_cuentas').select('id, nombre'),
      supabase.from('inversiones').select('id, app, etiqueta'),
    ])
    const lista = (rG.data ?? []) as GastoVariable[]
    const antes = idsPrevios.current
    idsPrevios.current = new Set(lista.map(g => g.id))
    if (silencioso && antes) {
      const llegaron = lista.filter(g => !antes.has(g.id)).map(g => g.id)
      if (llegaron.length) { setNuevos(new Set(llegaron)); setTimeout(() => setNuevos(new Set()), 2000) }
    }
    setDolar(cot.dolar)
    setGastos(lista)
    setGastosAnt((rA.data ?? []) as GastoVariable[])
    setViajes((rV.data ?? []) as GastoViaje[])
    setViajesAnt((rVA.data ?? []) as GastoViaje[])
    setNombreViaje(Object.fromEntries(((rVs.data ?? []) as { id: string; nombre: string; emoji: string | null }[]).map(v => [v.id, `${v.emoji ?? '✈️'} ${v.nombre}`])))
    setFijos((rF.data ?? []) as GastoFijo[])
    const c: Record<string, string> = {}
    for (const t of (rC.data ?? []) as { id: string; nombre: string }[]) c[t.id] = t.nombre
    for (const l of (rL.data ?? []) as { id: string; app: string; etiqueta: string | null }[]) c[`l:${l.id}`] = l.etiqueta || l.app
    setCuentas(c)
    setEstado('listo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde, rango.hasta])

  useEffect(() => { cargar() }, [cargar])
  useAlCambiarDatos(useCallback(() => { cargar(true) }, [cargar]))
  useEffect(() => { setDiaSel(null) }, [rango.desde])

  /* ── derivados ─────────────────────────────────────────────── */
  const esActual = rango.esMes && rango.desde.slice(0, 7) === hoyISO().slice(0, 7)
  const corte = esActual ? new Date().getDate() : 31
  const mesesEnRango = (() => {
    const [y1, m1] = rango.desde.slice(0, 7).split('-').map(Number)
    const [y2, m2] = rango.hasta.slice(0, 7).split('-').map(Number)
    return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1)
  })()

  const esCuota = (g: GastoVariable) => (g.cuotas_total ?? 1) > 1 && (g.cuota_numero ?? 1) > 1
  const totales = useMemo(() => {
    let diaADia = 0, cuotas = 0, hormiga = 0, nHormiga = 0
    for (const g of gastos) {
      const v = ars(g)
      if (esCuota(g)) cuotas += v; else diaADia += v
      if (g.es_gasto_hormiga) { hormiga += v; nHormiga++ }
    }
    const viaje = viajes.reduce((a, v) => a + (Number(v.monto_ars) || 0), 0)
    const fijosMes = fijos.reduce((a, f) => a + Number(f.monto), 0)
    const fijosPeriodo = fijosMes * mesesEnRango
    /* comparación justa: mes anterior hasta el mismo día */
    const antMismoTramo = gastosAnt.filter(g => Number(g.fecha.slice(8, 10)) <= corte).reduce((a, g) => a + ars(g), 0)
      + viajesAnt.filter(v => Number(v.fecha.slice(8, 10)) <= corte).reduce((a, v) => a + (Number(v.monto_ars) || 0), 0)
    const actualTramo = diaADia + cuotas + viaje
    return {
      diaADia, cuotas, viaje, fijosMes, fijosPeriodo, hormiga, nHormiga,
      variables: actualTramo,
      total: actualTramo + fijosPeriodo,
      variacion: rango.esMes && antMismoTramo > 0 ? ((actualTramo - antMismoTramo) / antMismoTramo) * 100 : null,
      antMismoTramo,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gastos, gastosAnt, viajes, viajesAnt, fijos, ars, corte, mesesEnRango, rango.esMes])

  const cats: Categoria[] = useMemo(() => {
    const m = new Map<string, Categoria>()
    const sumar = (clave: string, v: number, prev: boolean) => {
      const c = m.get(clave) ?? { clave, nombre: clave, monto: 0, anterior: 0, movimientos: 0 }
      if (prev) c.anterior += v; else { c.monto += v; c.movimientos++ }
      m.set(clave, c)
    }
    for (const g of gastos) sumar(g.categoria, ars(g), false)
    for (const v of viajes) sumar('viajes', Number(v.monto_ars) || 0, false)
    for (const g of gastosAnt) if (Number(g.fecha.slice(8, 10)) <= corte) sumar(g.categoria, ars(g), true)
    for (const v of viajesAnt) if (Number(v.fecha.slice(8, 10)) <= corte) sumar('viajes', Number(v.monto_ars) || 0, true)
    return Array.from(m.values()).filter(c => c.monto > 0).sort((a, b) => b.monto - a.monto)
  }, [gastos, gastosAnt, viajes, viajesAnt, ars, corte])

  const pasaFiltros = useCallback((f: Fila) => {
    const cat = f.tipo === 'gasto' ? f.g.categoria : 'viajes'
    const fecha = f.tipo === 'gasto' ? f.g.fecha : f.v.fecha
    const nombre = f.tipo === 'gasto' ? f.g.nombre : f.v.concepto
    if (filtroCat && cat !== filtroCat) return false
    if (soloHormiga && !(f.tipo === 'gasto' && f.g.es_gasto_hormiga)) return false
    if (diaSel && (rango.esMes ? fecha !== diaSel : fecha.slice(0, 7) !== diaSel)) return false
    if (busqueda.trim() && !nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false
    return true
  }, [filtroCat, soloHormiga, diaSel, busqueda, rango.esMes])

  const filas: Fila[] = useMemo(() => [
    ...gastos.map(g => ({ tipo: 'gasto' as const, g, pesos: ars(g) })),
    ...viajes.map(v => ({ tipo: 'viaje' as const, v, pesos: Number(v.monto_ars) || 0 })),
  ].sort((a, b) => (b.tipo === 'gasto' ? b.g.fecha : b.v.fecha).localeCompare(a.tipo === 'gasto' ? a.g.fecha : a.v.fecha)), [gastos, viajes, ars])

  const visibles = useMemo(() => filas.filter(pasaFiltros), [filas, pasaFiltros])
  const porFecha = useMemo(() => {
    const out: { fecha: string; items: Fila[]; total: number }[] = []
    for (const f of visibles) {
      const fecha = f.tipo === 'gasto' ? f.g.fecha : f.v.fecha
      const ult = out[out.length - 1]
      if (ult && ult.fecha === fecha) { ult.items.push(f); ult.total += f.pesos } else out.push({ fecha, items: [f], total: f.pesos })
    }
    return out
  }, [visibles])

  /* gráfico: por día (un mes) o por mes (rangos largos), con los filtros de categoría/hormiga */
  const puntos: PuntoBarra[] = useMemo(() => {
    const filtra = (cat: string, hormiga: boolean) => (!filtroCat || cat === filtroCat) && (!soloHormiga || hormiga)
    if (rango.esMes) {
      const dias = ultimoDia(rango.year, rango.month)
      const arr: PuntoBarra[] = Array.from({ length: dias }, (_, i) => ({
        clave: `${rango.desde.slice(0, 8)}${pad(i + 1)}`, etiqueta: String(i + 1), valor: 0, anterior: 0,
      }))
      for (const g of gastos) if (filtra(g.categoria, g.es_gasto_hormiga)) { const d = Number(g.fecha.slice(8, 10)); if (arr[d - 1]) arr[d - 1].valor += ars(g) }
      for (const v of viajes) if (filtra('viajes', false)) { const d = Number(v.fecha.slice(8, 10)); if (arr[d - 1]) arr[d - 1].valor += Number(v.monto_ars) || 0 }
      for (const g of gastosAnt) if (filtra(g.categoria, g.es_gasto_hormiga)) { const d = Number(g.fecha.slice(8, 10)); if (arr[d - 1]) arr[d - 1].anterior = (arr[d - 1].anterior ?? 0) + ars(g) }
      for (const v of viajesAnt) if (filtra('viajes', false)) { const d = Number(v.fecha.slice(8, 10)); if (arr[d - 1]) arr[d - 1].anterior = (arr[d - 1].anterior ?? 0) + (Number(v.monto_ars) || 0) }
      return esActual ? arr.slice(0, new Date().getDate()) : arr
    }
    const m = new Map<string, number>()
    for (const g of gastos) if (filtra(g.categoria, g.es_gasto_hormiga)) m.set(g.fecha.slice(0, 7), (m.get(g.fecha.slice(0, 7)) ?? 0) + ars(g))
    for (const v of viajes) if (filtra('viajes', false)) m.set(v.fecha.slice(0, 7), (m.get(v.fecha.slice(0, 7)) ?? 0) + (Number(v.monto_ars) || 0))
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, valor]) => ({ clave: k, etiqueta: `${MESES_C[Number(k.slice(5, 7)) - 1]}`, valor }))
  }, [gastos, gastosAnt, viajes, viajesAnt, rango, filtroCat, soloHormiga, ars, esActual])

  const porMedio = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of visibles) {
      if (f.tipo === 'viaje') { m.set('Viajes', (m.get('Viajes') ?? 0) + f.pesos); continue }
      const g = f.g
      const n = g.tarjeta_id && cuentas[g.tarjeta_id] ? `${cuentas[g.tarjeta_id]}${g.forma_pago === 'credito' ? ' · crédito' : ''}`
        : g.billetera_linea_id && cuentas[`l:${g.billetera_linea_id}`] ? cuentas[`l:${g.billetera_linea_id}`] : 'Efectivo / sin especificar'
      m.set(n, (m.get(n) ?? 0) + f.pesos)
    }
    return Array.from(m.entries()).map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor)
  }, [visibles, cuentas])

  const masGrandes = useMemo(() => [...visibles].sort((a, b) => b.pesos - a.pesos).slice(0, 5), [visibles])

  /* ── acciones ──────────────────────────────────────────────── */
  function elegirPreset(p: Preset) { setPreset(p); setRango(rangoPreset(p)) }
  function moverMes(d: -1 | 1) {
    const x = new Date(rango.year, rango.month - 1 + d, 1)
    setPreset(null)
    setRango(rangoMes(x.getFullYear(), x.getMonth() + 1))
  }

  async function guardarDesdeLuca(g: GastoDetectado): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Tu sesión venció. Volvé a entrar.'
    const r = await guardarGastoVariable(supabase, user.id, {
      nombre: g.nombre, monto: Number(g.monto), categoria: g.categoria, fecha: g.fecha,
      medio_pago: g.medio_pago, forma_pago: g.forma_pago,
      cuotas: g.forma_pago === 'credito' ? g.cuotas : undefined,
      moneda: g.moneda === 'USD' ? 'USD' : 'ARS',
    })
    if (r.error && !r.guardado) return 'No se pudo guardar el gasto.'
    setHoja(false)
    await cargar(true)
    const guardado = r.guardado
    toasts.mostrar({
      texto: `Gasto registrado: ${g.nombre} · ${fmt(g.monto)}`,
      deshacer: guardado?.id ? async () => {
        await borrarConDeshacer(createClient(), guardado, !!guardado.compra_id)
        await cargar(true)
      } : undefined,
    }, 8000)
    if (r.avisoSaldoNegativo) toasts.mostrar({ texto: r.avisoSaldoNegativo, tono: 'info' }, 9000)
    if (r.error) toasts.mostrar({ texto: r.error, tono: 'error' }, 9000)
    return null
  }

  async function borrar(g: GastoVariable, compraCompleta = false) {
    const supabase = createClient()
    const filas = await borrarConDeshacer(supabase, g, compraCompleta)
    setConfirmarCompra(null)
    await cargar(true)
    toasts.mostrar({
      texto: compraCompleta ? `Borraste la compra "${g.nombre}" (${filas.length} cuotas)` : `Borraste "${g.nombre}"`,
      deshacer: async () => {
        const { error } = await restaurarGastos(createClient(), filas)
        await cargar(true)
        toasts.mostrar(error ? { texto: 'No pude restaurarlo.', tono: 'error' } : { texto: 'Listo, lo restauré.', tono: 'info' }, 3000)
      },
    }, 8000)
  }

  function pedirBorrar(g: GastoVariable) {
    if (g.compra_id && (g.cuotas_total ?? 1) > 1) setConfirmarCompra(g)
    else borrar(g)
  }

  async function guardarEdicion(id: string) {
    if (!formEdit.nombre.trim() || !Number(formEdit.monto)) return
    const { error } = await editarGastoVariable(createClient(), id, {
      nombre: formEdit.nombre.trim(), monto: Number(formEdit.monto), categoria: formEdit.categoria,
      fecha: formEdit.fecha, es_gasto_hormiga: formEdit.es_gasto_hormiga,
    })
    setEditando(null)
    await cargar(true)
    toasts.mostrar(error ? { texto: error, tono: 'error' } : { texto: 'Cambios guardados.' }, 4000)
  }

  async function guardarFijo() {
    if (!formFijo?.nombre.trim() || !Number(formFijo.monto)) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('gastos_fijos').insert({
      user_id: user.id, nombre: formFijo.nombre.trim(), monto: Number(formFijo.monto), categoria: formFijo.categoria, activo: true, debitado: false,
    })
    setFormFijo(null)
    await cargar(true)
    toasts.mostrar({ texto: 'Gasto fijo agregado.' }, 3000)
  }

  async function alternarPagado(f: GastoFijo) {
    setFijos(xs => xs.map(x => (x.id === f.id ? { ...x, debitado: !x.debitado } : x)))
    await createClient().from('gastos_fijos').update({ debitado: !f.debitado }).eq('id', f.id)
  }

  async function quitarFijo(f: GastoFijo) {
    await createClient().from('gastos_fijos').update({ activo: false }).eq('id', f.id)
    await cargar(true)
    toasts.mostrar({
      texto: `Quitaste "${f.nombre}" de tus fijos`,
      deshacer: async () => { await createClient().from('gastos_fijos').update({ activo: true }).eq('id', f.id); await cargar(true) },
    }, 8000)
  }

  function exportarCSV() {
    const lineas = [
      ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Moneda', 'Monto en pesos', 'Medio de pago', 'Forma de pago', 'Cuota'],
      ...visibles.map(f => f.tipo === 'gasto'
        ? [f.g.fecha, f.g.nombre, getCat(f.g.categoria).label, String(f.g.monto), f.g.moneda ?? 'ARS', String(Math.round(f.pesos)),
          f.g.tarjeta_id ? (cuentas[f.g.tarjeta_id] ?? '') : f.g.billetera_linea_id ? (cuentas[`l:${f.g.billetera_linea_id}`] ?? '') : 'Efectivo',
          f.g.forma_pago ?? '', (f.g.cuotas_total ?? 1) > 1 ? `${f.g.cuota_numero}/${f.g.cuotas_total}` : '']
        : [f.v.fecha, f.v.concepto, 'Viajes', String(f.v.monto_ars), 'ARS', String(Math.round(f.pesos)), nombreViaje[f.v.viaje_id] ?? 'Viaje', '', '']),
    ]
    const csv = lineas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `movimientos_${rango.titulo.replace(/\s+/g, '_').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Luca: lo más relevante del período, con datos reales ──── */
  const lucaTexto = (() => {
    const partes: string[] = []
    if (totales.variacion !== null && Math.abs(totales.variacion) >= 10) {
      partes.push(`${esActual ? 'A esta altura del mes' : 'Este mes'} vas ${Math.abs(Math.round(totales.variacion))}% ${totales.variacion > 0 ? 'arriba' : 'abajo'} del anterior (${fmt(totales.antMismoTramo)} → ${fmt(totales.variables)}).`)
    }
    const suba = cats.filter(c => c.anterior > 0 && c.monto - c.anterior >= 10_000).sort((a, b) => (b.monto - b.anterior) - (a.monto - a.anterior))[0]
    if (suba) partes.push(`Lo que más creció: ${getCat(suba.clave).label.toLowerCase()} (+${fmt(suba.monto - suba.anterior)}).`)
    if (totales.nHormiga >= 5) partes.push(`${totales.nHormiga} gastos hormiga suman ${fmt(totales.hormiga)}.`)
    return partes
  })()

  const hayFiltros = !!(filtroCat || diaSel || soloHormiga || busqueda.trim())
  const limpiar = () => { setFiltroCat(null); setDiaSel(null); setSoloHormiga(false); setBusqueda('') }

  if (estado === 'cargando' && gastos.length === 0) return <SkeletonMovimientos />

  /* ── bloques ───────────────────────────────────────────────── */
  const encabezado = (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Movimientos</p>
        <div className="mt-0.5 flex items-center gap-1">
          {rango.esMes && (
            <button onClick={() => moverMes(-1)} aria-label="Mes anterior"
              className="fa-press -ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-alternate hover:text-primary"><ChevronLeft size={18} /></button>
          )}
          <h1 className="text-xl font-extrabold tracking-tight text-primary lg:text-2xl">{rango.titulo}</h1>
          {rango.esMes && (
            <button onClick={() => moverMes(1)} aria-label="Mes siguiente" disabled={esActual}
              className="fa-press flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-alternate hover:text-primary disabled:opacity-30"><ChevronRight size={18} /></button>
          )}
        </div>
        <div className="mt-2 overflow-x-auto"><Pestanas etiqueta="Período" opciones={PRESETS} valor={(preset ?? 'x') as Preset} onCambio={elegirPreset} /></div>
      </div>
      {desktop ? (
        <div className="flex w-full items-start gap-3 xl:w-auto xl:min-w-[560px]">
          <div className="min-w-0 flex-1"><CapturaLuca onGuardar={guardarDesdeLuca} flotante /></div>
          <button onClick={() => setAgregar(true)}
            className="fa-press flex h-11 items-center gap-2 rounded-xl bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={18} strokeWidth={2.5} /> Agregar
          </button>
        </div>
      ) : (
        <div className="flex w-full gap-2">
          <button onClick={() => setHoja(true)} className="fa-press flex flex-1 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm text-muted fa-hairline" style={{ background: 'var(--bg-input)' }}>
            <LucaAvatar estado="idle" size={24} /><span className="flex-1">Contale a Luca…</span><MessageCircle size={16} />
          </button>
          <button onClick={() => setAgregar(true)} aria-label="Agregar gasto" className="fa-press flex h-12 w-12 items-center justify-center rounded-2xl bg-confirm text-white"><Plus size={20} strokeWidth={2.5} /></button>
        </div>
      )}
    </header>
  )

  const resumen = (
    <section aria-label="Total del período" className="grid gap-5 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-4">
        <p className="fa-label">Total del período</p>
        <NumeroAnimado valor={totales.total} contarAlInicio className="mt-1 block text-[clamp(2.1rem,3.6vw,2.9rem)] font-extrabold leading-none tracking-tight tabular-nums text-primary" />
        {totales.variacion !== null ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              style={{ background: totales.variacion > 0 ? 'var(--glow-negative)' : 'var(--glow-positive)', color: totales.variacion > 0 ? 'var(--accent-negative)' : 'var(--accent-positive)' }}>
              {totales.variacion > 0 ? '▲' : '▼'} {Math.abs(Math.round(totales.variacion))}%
            </span>
            <span className="text-secondary">variables vs. {esActual ? 'el mes pasado a esta altura' : 'el mes anterior'}</span>
          </p>
        ) : <p className="mt-2 text-xs text-secondary">{mesesEnRango > 1 ? `${mesesEnRango} meses` : 'Sin mes anterior para comparar'}</p>}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:col-span-8">
        {[
          { l: 'Día a día', v: totales.diaADia, t: 'var(--accent-negative)' },
          { l: 'Cuotas', v: totales.cuotas, t: 'var(--accent-warning)' },
          { l: 'Viajes', v: totales.viaje, t: 'var(--accent-secondary)' },
          { l: mesesEnRango > 1 ? `Fijos · ${mesesEnRango} meses` : 'Fijos', v: totales.fijosPeriodo, t: 'var(--text-muted)' },
        ].map(x => (
          <div key={x.l} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.t }} />{x.l}
            </p>
            <NumeroAnimado valor={x.v} className="mt-1 block whitespace-nowrap text-lg font-bold tabular-nums text-primary" />
            <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
              <div className="fa-grow-x h-full rounded-full" style={{ width: `${(x.v / Math.max(totales.total, 1)) * 100}%`, background: x.t }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const luca = lucaTexto.length > 0 && (
    <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
      style={{ borderColor: 'color-mix(in srgb, var(--accent-positive) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-positive) 4%, var(--bg-card))' }}>
      <LucaAvatar estado={totales.variacion !== null && totales.variacion >= 10 ? 'warning' : 'insight'} size={30} />
      <p className="text-sm leading-relaxed text-primary">{lucaTexto.join(' ')}</p>
    </div>
  )

  const grafico = (
    <section aria-labelledby="t-dia" className="min-w-0">
      <Encabezado id="t-dia" titulo={rango.esMes ? 'Día a día' : 'Mes a mes'}
        sub={`${filtroCat ? `Solo ${getCat(filtroCat).label.toLowerCase()} · ` : ''}${rango.esMes ? 'click en un día para ver sus movimientos' : 'click en un mes para ver sus movimientos'}`}
        derecha={rango.esMes ? <Pestanas etiqueta="Vista" opciones={[{ key: 'barras', label: 'Por día' }, { key: 'acumulado', label: 'Acumulado' }] as const} valor={vista} onCambio={setVista} /> : undefined} />
      {vista === 'acumulado' && rango.esMes && (
        <div className="mt-3 flex gap-4 text-xs text-secondary" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: 'var(--accent-negative)' }} />Este mes</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: 'var(--text-muted)' }} />Mes anterior</span>
        </div>
      )}
      <div className="mt-3">
        {puntos.some(p => p.valor > 0) ? (
          <GraficoBarras key={`${rango.desde}-${vista}-${filtroCat}`} datos={puntos} modo={rango.esMes ? vista : 'barras'}
            seleccion={diaSel} onElegir={setDiaSel} alto={desktop ? 240 : 190} etiquetaAnterior="Mes anterior" />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-secondary fa-hairline">Sin gastos en este período.</p>
        )}
      </div>
    </section>
  )

  const categorias = (
    <Categorias cats={cats} mes={rango.desde.slice(0, 7)} esActual={esActual} seleccion={filtroCat} onSeleccion={setFiltroCat} max={8}
      titulo="Por categoría" sub={rango.esMes ? (esActual ? 'La marca gris es el mes pasado a esta altura' : 'La marca gris es el mes anterior') : `${rango.titulo} · click para filtrar`} />
  )

  const medios = (
    <section aria-labelledby="t-medio" className="min-w-0">
      <Encabezado id="t-medio" titulo="Con qué pagaste" sub={hayFiltros ? 'De lo que estás viendo' : undefined} />
      <ul className="mt-3 space-y-2.5">
        {porMedio.slice(0, 6).map(m => (
          <li key={m.nombre}>
            <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 flex-1 truncate text-secondary">{m.nombre}</span><span className="font-semibold tabular-nums text-primary">{fmt(m.valor)}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
              <div className="fa-grow-x h-full rounded-full" style={{ width: `${(m.valor / Math.max(porMedio[0]?.valor ?? 1, 1)) * 100}%`, background: 'var(--accent-secondary)' }} />
            </div>
          </li>
        ))}
        {porMedio.length === 0 && <li className="text-xs text-secondary">Sin datos.</li>}
      </ul>
    </section>
  )

  const grandes = masGrandes.length > 0 && (
    <section aria-labelledby="t-grandes" className="min-w-0">
      <Encabezado id="t-grandes" titulo="Los más grandes" />
      <ol className="mt-3 space-y-2">
        {masGrandes.map((f, i) => (
          <li key={f.tipo === 'gasto' ? f.g.id : f.v.id} className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alternate text-[11px] font-bold text-secondary">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-primary">{f.tipo === 'gasto' ? `${getCat(f.g.categoria).emoji} ${f.g.nombre}` : `✈️ ${f.v.concepto}`}</span>
            <span className="font-semibold tabular-nums text-primary">{fmt(f.pesos)}</span>
          </li>
        ))}
      </ol>
    </section>
  )

  const inputCls = 'rounded-lg border bg-field px-3 py-2 text-sm text-primary'

  const lista = (
    <section aria-labelledby="t-lista" className="min-w-0">
      <div className="sticky top-[var(--header-h)] z-20 -mx-1 flex flex-wrap items-center gap-2 px-1 pb-3 pt-1" style={{ background: 'var(--bg-page)' }}>
        <h2 id="t-lista" className="mr-auto text-[15px] font-bold text-primary">
          {visibles.length} {visibles.length === 1 ? 'movimiento' : 'movimientos'}
          <span className="ml-2 text-xs font-normal tabular-nums text-secondary">{fmt(visibles.reduce((a, f) => a + f.pesos, 0))}</span>
        </h2>
        <div className="relative w-full sm:w-52">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…" aria-label="Buscar movimientos"
            className="w-full rounded-lg border bg-field py-2 pl-8 pr-2 text-sm text-primary" />
        </div>
        <button onClick={() => setSoloHormiga(v => !v)} aria-pressed={soloHormiga}
          className="fa-press rounded-lg border px-2.5 py-2 text-xs font-semibold fa-hairline"
          style={soloHormiga ? { background: 'var(--riesgo-medio-tint)', borderColor: 'var(--riesgo-medio)', color: 'var(--riesgo-medio)' } : { color: 'var(--text-secondary)' }}>
          🐜 Hormiga
        </button>
        <button onClick={exportarCSV} className="fa-press flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold text-secondary hover:bg-alternate fa-hairline" title="Exportar lo que estás viendo">
          <Download size={14} /> CSV
        </button>
        {hayFiltros && (
          <div className="flex w-full flex-wrap items-center gap-1.5">
            {filtroCat && <Chip onQuitar={() => setFiltroCat(null)}>{filtroCat === 'viajes' ? '✈️ Viajes' : `${getCat(filtroCat).emoji} ${getCat(filtroCat).label}`}</Chip>}
            {diaSel && <Chip onQuitar={() => setDiaSel(null)}>{rango.esMes ? fmtFechaCorta(diaSel) : MESES[Number(diaSel.slice(5, 7)) - 1]}</Chip>}
            {soloHormiga && <Chip onQuitar={() => setSoloHormiga(false)}>🐜 Hormiga</Chip>}
            {busqueda.trim() && <Chip onQuitar={() => setBusqueda('')}>“{busqueda.trim()}”</Chip>}
            <button onClick={limpiar} className="text-xs font-semibold text-info hover:underline">Limpiar todo</button>
          </div>
        )}
      </div>

      {porFecha.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center fa-hairline">
          <p className="text-sm text-secondary">{hayFiltros ? 'Nada con estos filtros.' : 'Todavía no hay gastos en este período.'}</p>
          {hayFiltros ? <button onClick={limpiar} className="mt-3 text-xs font-semibold text-info hover:underline">Limpiar filtros</button>
            : <button onClick={() => setAgregar(true)} className="fa-press mt-3 rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white">Registrar un gasto</button>}
        </div>
      ) : (
        <div className="space-y-4">
          {porFecha.map(d => (
            <div key={d.fecha}>
              <div className="flex items-baseline justify-between border-b pb-1.5 fa-hairline">
                <span className="text-xs font-semibold capitalize text-secondary">
                  {fmtFechaCorta(d.fecha)} <span className="font-normal text-muted">· {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long' })}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums text-secondary">{fmt(d.total)}</span>
              </div>
              <ul>
                {d.items.map(f => {
                  if (f.tipo === 'viaje') {
                    return (
                      <li key={`v-${f.v.id}`}>
                        <Link href={`/dashboard/viajes/${f.v.viaje_id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-alternate">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alternate" aria-hidden="true">✈️</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-primary">{f.v.concepto}</span>
                            <span className="block truncate text-[11px] text-muted">Viaje · {nombreViaje[f.v.viaje_id] ?? 'Viaje'}</span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-primary">−{fmt(f.pesos)}</span>
                          <ChevronRight size={14} className="text-muted" />
                        </Link>
                      </li>
                    )
                  }
                  const g = f.g
                  const cat = getCat(g.categoria)
                  const medio = g.tarjeta_id ? cuentas[g.tarjeta_id] : g.billetera_linea_id ? cuentas[`l:${g.billetera_linea_id}`] : null
                  if (editando === g.id) {
                    return (
                      <li key={g.id} className="fa-pop -mx-2 my-1 rounded-xl border p-3 fa-hairline" style={{ background: 'var(--bg-alternate)' }}>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                          <input value={formEdit.nombre} onChange={e => setFormEdit(p => ({ ...p, nombre: e.target.value }))} aria-label="Descripción" className={`${inputCls} col-span-2 sm:col-span-2`} />
                          <input type="number" inputMode="decimal" value={formEdit.monto} onChange={e => setFormEdit(p => ({ ...p, monto: e.target.value }))} aria-label="Monto" className={inputCls} />
                          <select value={formEdit.categoria} onChange={e => setFormEdit(p => ({ ...p, categoria: e.target.value }))} aria-label="Categoría" className={inputCls}>
                            {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                          </select>
                          <input type="date" value={formEdit.fecha} onChange={e => setFormEdit(p => ({ ...p, fecha: e.target.value }))} aria-label="Fecha" className={`${inputCls} col-span-2 sm:col-span-2`} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-secondary">
                            <input type="checkbox" checked={formEdit.es_gasto_hormiga} onChange={e => setFormEdit(p => ({ ...p, es_gasto_hormiga: e.target.checked }))} /> 🐜 Hormiga
                          </label>
                          {(g.cuotas_total ?? 1) > 1 && <span className="text-[11px] text-muted">Cuota {g.cuota_numero}/{g.cuotas_total}: solo cambia esta cuota.</span>}
                          {g.billetera_linea_id && <span className="text-[11px] text-muted">Si cambiás el monto, se corrige el saldo de {medio ?? 'la billetera'}.</span>}
                          <div className="ml-auto flex gap-2">
                            <button onClick={() => setEditando(null)} className="fa-press rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-card">Cancelar</button>
                            <button onClick={() => guardarEdicion(g.id)} className="fa-press rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover">Guardar</button>
                          </div>
                        </div>
                      </li>
                    )
                  }
                  return (
                    <li key={g.id} className={`group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-alternate ${nuevos.has(g.id) ? 'fa-flash' : ''}`}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alternate text-base" aria-hidden="true">{cat.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-primary">{g.nombre}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {cat.label}
                          {medio && <> · {medio}{g.forma_pago === 'credito' ? ' · crédito' : ''}</>}
                          {(g.cuotas_total ?? 1) > 1 && <> · cuota {g.cuota_numero}/{g.cuotas_total}</>}
                          {g.es_gasto_hormiga && <> · 🐜</>}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-primary">−{fmt(f.pesos)}</span>
                        {g.moneda === 'USD' && <span className="block text-[11px] text-muted">US$ {Number(g.monto).toLocaleString('es-AR')}</span>}
                      </span>
                      <span className="flex shrink-0 items-center lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                        <button onClick={() => { setEditando(g.id); setFormEdit({ nombre: g.nombre, monto: String(g.monto), categoria: g.categoria, fecha: g.fecha, es_gasto_hormiga: g.es_gasto_hormiga }) }}
                          aria-label={`Editar ${g.nombre}`} className="fa-press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-primary"><Pencil size={15} /></button>
                        <button onClick={() => pedirBorrar(g)} aria-label={`Borrar ${g.nombre}`}
                          className="fa-press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-negative"><Trash2 size={15} /></button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )

  const panelFijos = (
    <section aria-labelledby="t-fijos" className="min-w-0">
      <Encabezado id="t-fijos" titulo="Gastos fijos" sub={`${fmt(totales.fijosMes)} por mes · ${fijos.filter(f => !f.debitado).length} pendientes`}
        derecha={<button onClick={() => setFormFijo(f => (f ? null : { nombre: '', monto: '', categoria: 'servicios' }))}
          className="fa-press flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-alternate fa-hairline"><Plus size={13} /> Agregar</button>} />
      <div className="fa-colapsable" data-abierto={!!formFijo}>
        <div>
          {formFijo && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input autoFocus placeholder="Nombre (ej. Gimnasio)" value={formFijo.nombre} onChange={e => setFormFijo({ ...formFijo, nombre: e.target.value })} className={`${inputCls} col-span-2`} />
              <input placeholder="Monto mensual" type="number" inputMode="decimal" value={formFijo.monto} onChange={e => setFormFijo({ ...formFijo, monto: e.target.value })} className={inputCls} />
              <select value={formFijo.categoria} onChange={e => setFormFijo({ ...formFijo, categoria: e.target.value })} aria-label="Categoría" className={inputCls}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
              <button onClick={guardarFijo} className="fa-press col-span-2 rounded-lg bg-confirm py-2 text-sm font-semibold text-white hover:bg-confirm-hover">Guardar fijo</button>
            </div>
          )}
        </div>
      </div>
      <ul className="mt-3 divide-y fa-hairline">
        {fijos.length === 0 && <li className="py-4 text-xs text-secondary">Sin gastos fijos. Agregá alquiler, servicios o suscripciones para ver tus compromisos del mes.</li>}
        {fijos.map(f => (
          <li key={f.id} className="flex items-center gap-3 py-2.5">
            <span className="text-base" aria-hidden="true">{getCat(f.categoria).emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-primary">{f.nombre}</span>
              <span className="block text-[11px] tabular-nums text-muted">{fmt(Number(f.monto))} por mes</span>
            </span>
            <button onClick={() => alternarPagado(f)} role="switch" aria-checked={f.debitado} aria-label={`${f.nombre}: ${f.debitado ? 'pagado' : 'pendiente'}`}
              className="fa-press rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={f.debitado ? { borderColor: 'var(--accent-positive)', color: 'var(--accent-positive)', background: 'var(--glow-positive)' } : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              {f.debitado ? '✓ Pagado' : 'Pendiente'}
            </button>
            <button onClick={() => quitarFijo(f)} aria-label={`Quitar ${f.nombre}`} className="fa-press flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-alternate hover:text-negative"><X size={14} /></button>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <div className="fa-page-in mx-auto flex max-w-[1480px] flex-col gap-6 pb-6 lg:gap-7">
      {encabezado}
      {resumen}
      {luca}

      {desktop ? (
        <>
          <div className="grid grid-cols-12 gap-7">
            <Revelar className="fa-panel col-span-8 p-6">{grafico}</Revelar>
            <Revelar className="fa-panel col-span-4 p-6" demora={60}>{categorias}</Revelar>
          </div>
          <div className="grid grid-cols-12 gap-7">
            <div className="col-span-8">{lista}</div>
            <div className="col-span-4 flex flex-col gap-7">
              <Revelar className="fa-panel p-6">{panelFijos}</Revelar>
              <Revelar className="fa-panel p-6">{medios}</Revelar>
              {grandes && <Revelar className="fa-panel p-6">{grandes}</Revelar>}
            </div>
          </div>
        </>
      ) : (
        <>
          {lista}
          <section className="fa-panel overflow-hidden">
            <button onClick={() => setAnalisis(v => !v)} aria-expanded={analisis} className="fa-press flex w-full items-center gap-3 px-5 py-4 text-left">
              <BarChart3 size={18} className="text-info" />
              <span className="flex-1"><span className="block text-sm font-semibold text-primary">Análisis</span><span className="block text-xs text-secondary">Día a día, categorías y medios de pago</span></span>
              <ChevronDown size={16} className="text-muted" style={{ transform: analisis ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} />
            </button>
            <div className="fa-colapsable" data-abierto={analisis}>
              <div>{analisis && <div className="space-y-8 border-t px-5 pb-6 pt-5 fa-hairline">{grafico}{categorias}{medios}{grandes}</div>}</div>
            </div>
          </section>
          <section className="fa-panel p-5">{panelFijos}</section>
        </>
      )}

      {hoja && !desktop && (
        <div className="fixed inset-0 z-[55] flex items-end" role="dialog" aria-modal="true" aria-label="Contale a Luca">
          <button className="fa-fade-in absolute inset-0 bg-black/60" aria-label="Cerrar" onClick={() => setHoja(false)} />
          <div className="fa-sheet-up relative w-full rounded-t-3xl border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] fa-hairline" style={{ background: 'var(--bg-card)' }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: 'var(--border-color)' }} />
            <p className="mb-3 text-sm font-semibold text-primary">Contale a Luca</p>
            <CapturaLuca onGuardar={guardarDesdeLuca} autoFoco />
          </div>
        </div>
      )}
      {agregar && <AgregarMovimientoModal defaultTab="gasto" onClose={() => setAgregar(false)} onSaved={() => { cargar(true); toasts.mostrar({ texto: 'Movimiento guardado.' }, 3000) }} />}
      {confirmarCompra && (
        <Confirmar titulo={`¿Borrar la compra "${confirmarCompra.nombre}"?`} peligro accion="Borrar compra"
          detalle={<>Es la cuota {confirmarCompra.cuota_numero}/{confirmarCompra.cuotas_total}: se borran todas sus cuotas. Vas a poder deshacerlo.</>}
          onConfirmar={() => borrar(confirmarCompra, true)} onCancelar={() => setConfirmarCompra(null)} />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}

function Chip({ children, onQuitar }: { children: React.ReactNode; onQuitar: () => void }) {
  return (
    <button onClick={onQuitar} className="fa-press fa-pop inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-primary hover:bg-alternate fa-hairline">
      {children} <X size={12} className="text-muted" />
    </button>
  )
}

function SkeletonMovimientos() {
  const B = ({ c }: { c: string }) => <div className={`animate-pulse rounded-lg ${c}`} style={{ background: 'var(--bg-alternate)' }} />
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-7" aria-busy="true" aria-label="Cargando movimientos">
      <div className="space-y-2"><B c="h-3 w-24" /><B c="h-8 w-56" /><B c="h-8 w-72" /></div>
      <div className="grid gap-5 lg:grid-cols-12"><div className="space-y-2 lg:col-span-4"><B c="h-3 w-28" /><B c="h-12 w-60" /></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-8"><B c="h-14" /><B c="h-14" /><B c="h-14" /><B c="h-14" /></div></div>
      <div className="grid gap-7 lg:grid-cols-12"><B c="h-72 rounded-2xl lg:col-span-8" /><B c="h-72 rounded-2xl lg:col-span-4" /></div>
      <div className="space-y-3">{[0, 1, 2, 3, 4].map(i => <B key={i} c="h-12" />)}</div>
    </div>
  )
}
