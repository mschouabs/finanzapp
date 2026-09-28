/* ══ Núcleo financiero ════════════════════════════════════════════
   Piloto de "una sola fuente de verdad". Hoy cada pantalla trae sus
   datos y arma sus propios totales (y por eso a veces no coinciden).
   Acá se trae TODO en una sola tanda de consultas en paralelo y cada
   métrica sale de una única función pura:

     cargarSnapshot()  →  Snapshot (datos crudos, ya tipados)
     patrimonio()      →  cuánto tengo, dónde está, cuánto debo
     flujoDelMes()     →  ingresos / gastos / balance / ahorro
     compromisos()     →  plata que ya tiene destino (próx. 30 días)
     serieMensual()    →  evolución mes a mes
     categorias()      →  en qué se va
     ritmoDeGasto()    →  cómo vengo vs. mis meses anteriores
     actividad()       →  últimos movimientos, de todas las fuentes

   Criterios (documentados para que todas las pantallas usen los mismos):
   · "Hoy" y "este mes" se calculan en hora LOCAL, nunca en UTC.
   · Compras en cuotas: cada cuota cuenta en un mes distinto, empezando
     por el mes de la compra (sin el "mes vacío" que generaba guardar la
     2ª cuota en la fecha de vencimiento de su resumen).
   · Gastos en dólares: se pasan a pesos con la cotización del día.
   · Sueldos: el mes en curso usa lo cobrado (monto_cobrado); los meses
     anteriores usan el monto nominal, porque "cobrado" no se reinicia.
   · Gastos fijos: cuentan desde el mes en que se cargaron.
   El primer usuario de este núcleo es el nuevo Resumen (preview).      */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aPesos, calcularPatrimonio, esLiquida, traerCotizaciones, COTIZACION_RESPALDO,
  type Cotizaciones, type LineaSaldo,
} from '@/lib/patrimonio'
import {
  COLUMNAS_CONSUMO, estadoTarjeta, resumenDe,
  type Consumo, type EstadoTarjeta, type TarjetaInfo,
} from '@/lib/resumenes'
import { diasEntre, fechasDeResumen, sumarMeses } from '@/lib/ciclos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>
type Fila = Record<string, unknown>

/* ── fechas en hora local ─────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0')
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const claveMes = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const mesDeISO = (s: string | null | undefined) => (s ?? '').slice(0, 7)
export const diasDelMes = (k: string) => {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const nombreMes = (k: string) => MESES[Number(k.slice(5, 7)) - 1] ?? k
export const nombreMesCorto = (k: string) => MESES_C[Number(k.slice(5, 7)) - 1] ?? k
export const fechaLocal = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const num = (v: unknown) => Number(v) || 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/* ── datos crudos ─────────────────────────────────────────────── */

export interface GastoVar {
  id: string
  nombre: string
  monto: number
  moneda: string
  categoria: string
  fecha: string
  created_at: string
  tarjeta_id: string | null
  forma_pago: string | null
  billetera_linea_id: string | null
  compra_id: string | null
  cuota_numero: number | null
  cuotas_total: number | null
  fecha_compra: string | null
  es_gasto_hormiga: boolean
}

export interface GastoFijo { id: string; nombre: string; monto: number; categoria: string; debitado: boolean; created_at: string }
export interface IngresoFijo { id: string; nombre: string; monto: number; monto_cobrado: number | null; created_at: string }
export interface Freelance { id: string; titulo: string; monto: number; fecha: string; created_at: string }
export interface GastoViaje { id: string; viaje: string; concepto: string; categoria: string; monto: number; fecha: string }
export interface RegistroSeccion { id: string; seccion: string; tipo: 'ingreso' | 'gasto'; monto: number; fecha: string; texto: string }
export interface PuntoPatrimonio { mes: string; neto: number; liquido: number; invertido: number }
export interface MetaInfo { id: string; nombre: string; emoji: string | null; objetivo: number; moneda: string; aportado: number; billetera_app: string | null }

export interface Snapshot {
  hoy: Date
  cot: Cotizaciones
  dolar: number
  lineas: LineaSaldo[]
  /** tarjetas de crédito (tipo = 'tarjeta') */
  tarjetas: TarjetaInfo[]
  /** todas las cuentas/tarjetas, para mostrar nombres */
  nombreCuenta: Map<string, string>
  consumosImpagos: Consumo[]
  gastos: GastoVar[]
  fijos: GastoFijo[]
  ingresosFijos: IngresoFijo[]
  freelance: Freelance[]
  viajes: GastoViaje[]
  registros: RegistroSeccion[]
  historial: PuntoPatrimonio[]
  metas: MetaInfo[]
}

/**
 * Trae todo lo que necesita el Resumen en UNA tanda de consultas en
 * paralelo (antes: ~26 pedidos, con tablas repetidas y esperas en
 * cadena). Los movimientos se limitan a los últimos 13 meses.
 */
export async function cargarSnapshot(supabase: Cliente, hoy = new Date()): Promise<Snapshot> {
  const desde = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 12, 1))
  const [
    cot, rLineas, rCuentas, rImpagos, rGastos, rFijos, rIngFijos, rFree,
    rViajes, rViajeGastos, rSecciones, rRegistros, rHist, rMetas,
  ] = await Promise.all([
    traerCotizaciones(),
    supabase.from('inversiones').select('*'),
    supabase.from('tarjetas_cuentas').select('*'),
    supabase.from('gastos_variables').select(COLUMNAS_CONSUMO).eq('forma_pago', 'credito').eq('pagado', false),
    supabase.from('gastos_variables').select('*').gte('fecha', desde),
    supabase.from('gastos_fijos').select('*'),
    supabase.from('ingresos_fijos').select('*'),
    supabase.from('ingresos_freelance').select('*').gte('fecha', desde),
    supabase.from('viajes').select('id, nombre, emoji'),
    supabase.from('viaje_gastos').select('id, viaje_id, concepto, categoria, monto_ars, fecha').gte('fecha', desde),
    supabase.from('secciones').select('id, nombre, tipo, emoji'),
    supabase.from('seccion_registros').select('id, seccion_id, monto, fecha, datos').gte('fecha', desde),
    supabase.from('patrimonio_mensual').select('mes, total_ars, detalle').order('mes', { ascending: true }).limit(36),
    supabase.from('metas').select('*'),
  ])

  /* si la tabla principal falla, mejor avisar que mostrar ceros */
  const critico = rLineas.error || rGastos.error
  if (critico) throw new Error(critico.message)

  const dolar = cot.dolar ?? COTIZACION_RESPALDO.dolar
  const activo = (r: Fila) => r.activo !== false
  const cuentas = (rCuentas.data ?? []) as Fila[]

  const viajeNombre = new Map(((rViajes.data ?? []) as Fila[]).map(v => [str(v.id), `${str(v.emoji)} ${str(v.nombre)}`.trim()]))
  const secciones = new Map(((rSecciones.data ?? []) as Fila[])
    .filter(s => s.tipo === 'ingreso' || s.tipo === 'gasto')
    .map(s => [str(s.id), { nombre: `${str(s.emoji)} ${str(s.nombre)}`.trim(), tipo: s.tipo as 'ingreso' | 'gasto' }]))

  return {
    hoy,
    cot,
    dolar,
    lineas: (rLineas.data ?? []) as LineaSaldo[],
    tarjetas: cuentas.filter(c => c.tipo === 'tarjeta') as unknown as TarjetaInfo[],
    nombreCuenta: new Map(cuentas.map(c => [str(c.id), str(c.nombre)])),
    consumosImpagos: (rImpagos.data ?? []) as unknown as Consumo[],
    gastos: ((rGastos.data ?? []) as Fila[]).filter(r => str(r.fecha)).map(r => ({
      id: str(r.id),
      nombre: str(r.nombre) || str(r.descripcion) || 'Gasto',
      monto: num(r.monto),
      moneda: str(r.moneda) || 'ARS',
      categoria: str(r.categoria) || 'varios',
      fecha: str(r.fecha),
      created_at: str(r.created_at),
      tarjeta_id: (r.tarjeta_id as string | null) ?? null,
      forma_pago: (r.forma_pago as string | null) ?? null,
      billetera_linea_id: (r.billetera_linea_id as string | null) ?? null,
      compra_id: (r.compra_id as string | null) ?? null,
      cuota_numero: r.cuota_numero == null ? null : num(r.cuota_numero),
      cuotas_total: r.cuotas_total == null ? null : num(r.cuotas_total),
      fecha_compra: (r.fecha_compra as string | null) ?? null,
      es_gasto_hormiga: !!r.es_gasto_hormiga,
    })),
    fijos: ((rFijos.data ?? []) as Fila[]).filter(activo).map(r => ({
      id: str(r.id), nombre: str(r.nombre) || 'Gasto fijo', monto: num(r.monto),
      categoria: str(r.categoria) || 'Fijo', debitado: !!r.debitado, created_at: str(r.created_at),
    })),
    ingresosFijos: ((rIngFijos.data ?? []) as Fila[]).filter(activo).map(r => ({
      id: str(r.id), nombre: str(r.nombre) || 'Ingreso fijo', monto: num(r.monto),
      monto_cobrado: r.monto_cobrado == null ? null : num(r.monto_cobrado), created_at: str(r.created_at),
    })),
    freelance: ((rFree.data ?? []) as Fila[]).filter(r => str(r.fecha)).map(r => ({
      id: str(r.id),
      titulo: str(r.cliente) || str(r.descripcion) || str(r.nombre) || 'Ingreso',
      /* mismo criterio que el Resumen actual: lo cobrado; si no hay dato, el total */
      monto: num(r.monto_cobrado ?? r.monto_total ?? r.monto),
      fecha: str(r.fecha),
      created_at: str(r.created_at),
    })),
    viajes: ((rViajeGastos.data ?? []) as Fila[]).filter(r => str(r.fecha)).map(r => ({
      id: str(r.id), viaje: viajeNombre.get(str(r.viaje_id)) ?? 'Viaje', concepto: str(r.concepto) || 'Gasto de viaje',
      categoria: str(r.categoria), monto: num(r.monto_ars), fecha: str(r.fecha),
    })),
    registros: ((rRegistros.data ?? []) as Fila[])
      .filter(r => secciones.has(str(r.seccion_id)) && str(r.fecha))
      .map(r => {
        const s = secciones.get(str(r.seccion_id))!
        const campos = (r.datos as Fila | null) ?? {}
        const texto = Object.values(campos).find(v => typeof v === 'string' && v.trim() !== '') as string | undefined
        return { id: str(r.id), seccion: s.nombre, tipo: s.tipo, monto: num(r.monto), fecha: str(r.fecha), texto: texto || s.nombre }
      }),
    historial: ((rHist.data ?? []) as Fila[]).map(h => {
      const det = (h.detalle as { neto?: number; liquido?: number; invertido?: number } | null) ?? {}
      return {
        mes: str(h.mes),
        neto: Math.round(det.neto ?? num(h.total_ars)),
        liquido: Math.round(det.liquido ?? 0),
        invertido: Math.round(det.invertido ?? 0),
      }
    }),
    /* si la tabla de metas no existe, simplemente no hay metas */
    metas: rMetas.error ? [] : ((rMetas.data ?? []) as Fila[]).map(m => ({
      id: str(m.id), nombre: str(m.nombre), emoji: (m.emoji as string | null) ?? null,
      objetivo: num(m.monto_objetivo), moneda: str(m.moneda) || 'ARS', aportado: num(m.aportado),
      billetera_app: (m.billetera_app as string | null) ?? null,
    })),
  }
}

/* ── patrimonio ──────────────────────────────────────────────── */

export interface Posicion { clave: string; nombre: string; monto: number; href: string }

export interface Patrimonio {
  liquido: number
  invertido: number
  deuda: number
  /** lo que tenés (billeteras + inversiones) */
  activos: number
  /** activos − deuda */
  neto: number
  /** neto de la foto del mes anterior (patrimonio_mensual), si existe */
  anterior: number | null
  disponibles: Posicion[]
  inversiones: Posicion[]
  deudas: Posicion[]
  estados: EstadoTarjeta[]
}

export function patrimonio(s: Snapshot): Patrimonio {
  const p = calcularPatrimonio(s.lineas, s.cot)
  const estados = s.tarjetas.map(t => estadoTarjeta(t, s.consumosImpagos, s.dolar, s.hoy))
  const deuda = estados.reduce((a, e) => a + e.deuda, 0)

  /* agrupado por billetera/app, con su nombre visible */
  const agrupar = (liquidas: boolean) => {
    const m = new Map<string, Posicion>()
    for (const l of s.lineas) {
      if (esLiquida(l) !== liquidas) continue
      const v = aPesos(l, s.cot)
      const nombre = s.lineas.find(x => x.app === l.app && x.etiqueta)?.etiqueta || l.app || l.nombre
      const prev = m.get(l.app) ?? { clave: l.app, nombre, monto: 0, href: liquidas ? '/dashboard/billeteras' : '/dashboard/inversiones' }
      prev.monto += v
      m.set(l.app, prev)
    }
    return Array.from(m.values()).filter(x => Math.abs(x.monto) >= 1).sort((a, b) => b.monto - a.monto)
  }

  const mesAnt = claveMes(new Date(s.hoy.getFullYear(), s.hoy.getMonth() - 1, 1))
  const anterior = s.historial.find(h => h.mes === mesAnt)?.neto ?? null

  return {
    liquido: p.liquido,
    invertido: p.invertido,
    deuda,
    activos: p.total,
    neto: p.total - deuda,
    anterior,
    disponibles: agrupar(true),
    inversiones: agrupar(false),
    deudas: estados.filter(e => e.deuda > 0).map(e => ({
      clave: e.tarjeta.id, nombre: e.tarjeta.nombre, monto: e.deuda, href: '/dashboard/tarjetas',
    })).sort((a, b) => b.monto - a.monto),
    estados,
  }
}

/* ── mes contable de un gasto ─────────────────────────────────── */

/** Primer mes (y primera cuota cargada) de cada compra en cuotas. */
function iniciosDeCompras(gastos: GastoVar[]) {
  const m = new Map<string, { mes: string; cuota: number }>()
  for (const g of gastos) {
    if (!g.compra_id) continue
    const cuota = g.cuota_numero ?? 1
    const prev = m.get(g.compra_id)
    if (!prev || cuota < prev.cuota) m.set(g.compra_id, { mes: mesDeISO(g.fecha_compra ?? g.fecha), cuota })
  }
  return m
}

export function mesContable(g: GastoVar, inicios: Map<string, { mes: string; cuota: number }>) {
  if (g.compra_id && (g.cuotas_total ?? 1) > 1) {
    const ini = inicios.get(g.compra_id)
    if (ini) return sumarMeses(ini.mes, (g.cuota_numero ?? 1) - ini.cuota)
  }
  return mesDeISO(g.fecha)
}

/** ¿Es una cuota "arrastrada" (2ª en adelante) y no un consumo nuevo? */
const esCuotaArrastrada = (g: GastoVar, inicios: Map<string, { mes: string; cuota: number }>) =>
  !!g.compra_id && (g.cuotas_total ?? 1) > 1 && (g.cuota_numero ?? 1) > (inicios.get(g.compra_id)?.cuota ?? 1)

const enPesosGasto = (g: GastoVar, dolar: number) => (g.moneda === 'USD' ? g.monto * dolar : g.monto)

/* ── flujo de un mes ──────────────────────────────────────────── */

export interface Flujo {
  mes: string
  ingresos: { fijos: number; extra: number; secciones: number; total: number }
  gastos: { fijos: number; variables: number; cuotas: number; viajes: number; secciones: number; total: number }
  balance: number
  /** % de lo que entró que quedó (null si no entró nada) */
  tasaAhorro: number | null
  /** ¿el mes tiene algún movimiento cargado? */
  conDatos: boolean
}

export function flujoDelMes(s: Snapshot, mes: string): Flujo {
  const actual = claveMes(s.hoy)
  const finMes = `${mes}-${pad(diasDelMes(mes))}`
  const vigente = (created: string) => !created || created.slice(0, 10) <= finMes

  const ingFijos = s.ingresosFijos.filter(i => vigente(i.created_at))
    .reduce((a, i) => a + (mes === actual ? (i.monto_cobrado ?? i.monto) : i.monto), 0)
  const extra = s.freelance.filter(f => mesDeISO(f.fecha) === mes).reduce((a, f) => a + f.monto, 0)
  const secIng = s.registros.filter(r => r.tipo === 'ingreso' && mesDeISO(r.fecha) === mes).reduce((a, r) => a + r.monto, 0)

  const inicios = iniciosDeCompras(s.gastos)
  let variables = 0, cuotas = 0, movs = 0
  for (const g of s.gastos) {
    if (mesContable(g, inicios) !== mes) continue
    movs++
    if (esCuotaArrastrada(g, inicios)) cuotas += enPesosGasto(g, s.dolar)
    else variables += enPesosGasto(g, s.dolar)
  }
  const gFijos = s.fijos.filter(f => vigente(f.created_at)).reduce((a, f) => a + f.monto, 0)
  const viajes = s.viajes.filter(v => mesDeISO(v.fecha) === mes).reduce((a, v) => a + v.monto, 0)
  const secGas = s.registros.filter(r => r.tipo === 'gasto' && mesDeISO(r.fecha) === mes).reduce((a, r) => a + r.monto, 0)

  const ingresos = ingFijos + extra + secIng
  const gastos = gFijos + variables + cuotas + viajes + secGas
  const conDatos = movs > 0 || extra > 0 || viajes > 0 || secIng > 0 || secGas > 0

  return {
    mes,
    ingresos: { fijos: ingFijos, extra, secciones: secIng, total: ingresos },
    gastos: { fijos: gFijos, variables, cuotas, viajes, secciones: secGas, total: gastos },
    balance: ingresos - gastos,
    tasaAhorro: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : null,
    conDatos,
  }
}

/** Serie de los últimos `n` meses (incluido el actual), desde el primer mes con datos. */
export function serieMensual(s: Snapshot, n = 12): Flujo[] {
  const actual = claveMes(s.hoy)
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(actual, i - n + 1))
  const serie = meses.map(m => flujoDelMes(s, m))
  const primero = serie.findIndex(f => f.conDatos)
  return primero === -1 ? serie.slice(-1) : serie.slice(primero)
}

/** Patrimonio neto mes a mes: fotos guardadas + el valor en vivo de este mes. */
export function seriePatrimonio(s: Snapshot, p: Patrimonio): PuntoPatrimonio[] {
  const actual = claveMes(s.hoy)
  const base = s.historial.filter(h => h.mes < actual)
  return [...base, { mes: actual, neto: Math.round(p.neto), liquido: Math.round(p.liquido), invertido: Math.round(p.invertido) }]
}

/* ── categorías ───────────────────────────────────────────────── */

export interface Categoria { clave: string; nombre: string; monto: number; anterior: number; movimientos: number }

/**
 * En qué se fue la plata en `mes`. `anterior` es el mismo mes previo
 * hasta el MISMO día (si `mes` es el actual), para comparar parejo.
 */
export function categorias(s: Snapshot, mes: string): Categoria[] {
  const actual = claveMes(s.hoy)
  const mesAnt = sumarMeses(mes, -1)
  const corte = mes === actual ? s.hoy.getDate() : 31
  const inicios = iniciosDeCompras(s.gastos)
  const m = new Map<string, Categoria>()
  const sumar = (clave: string, nombre: string, v: number, previo: boolean) => {
    const c = m.get(clave) ?? { clave, nombre, monto: 0, anterior: 0, movimientos: 0 }
    if (previo) c.anterior += v
    else { c.monto += v; c.movimientos++ }
    m.set(clave, c)
  }
  for (const g of s.gastos) {
    const k = mesContable(g, inicios)
    const cat = g.categoria.toLowerCase()
    if (k === mes) sumar(cat, cat, enPesosGasto(g, s.dolar), false)
    else if (k === mesAnt && Number(g.fecha.slice(8, 10)) <= corte) sumar(cat, cat, enPesosGasto(g, s.dolar), true)
  }
  for (const v of s.viajes) {
    const k = mesDeISO(v.fecha)
    if (k === mes) sumar('viajes', 'viajes', v.monto, false)
    else if (k === mesAnt && Number(v.fecha.slice(8, 10)) <= corte) sumar('viajes', 'viajes', v.monto, true)
  }
  for (const r of s.registros.filter(x => x.tipo === 'gasto')) {
    const k = mesDeISO(r.fecha)
    if (k === mes) sumar(r.seccion, r.seccion, r.monto, false)
    else if (k === mesAnt && Number(r.fecha.slice(8, 10)) <= corte) sumar(r.seccion, r.seccion, r.monto, true)
  }
  const fin = (k: string) => `${k}-${pad(diasDelMes(k))}`
  const fijosMes = s.fijos.filter(f => !f.created_at || f.created_at.slice(0, 10) <= fin(mes)).reduce((a, f) => a + f.monto, 0)
  const fijosAnt = s.fijos.filter(f => !f.created_at || f.created_at.slice(0, 10) <= fin(mesAnt)).reduce((a, f) => a + f.monto, 0)
  if (fijosMes > 0 || fijosAnt > 0) {
    m.set('fijos', { clave: 'fijos', nombre: 'gastos fijos', monto: fijosMes, anterior: fijosAnt, movimientos: s.fijos.length })
  }
  return Array.from(m.values()).filter(c => c.monto > 0).sort((a, b) => b.monto - a.monto)
}

/* ── ritmo de gasto ───────────────────────────────────────────── */

export interface Ritmo {
  dia: number
  diasMes: number
  /** gasto variable del día a día acumulado hasta hoy */
  acumulado: number
  /** promedio de los meses anteriores con datos, hasta el mismo día */
  promedio: number | null
  mesesComparados: number
  /** variación % vs. el promedio (null si no hay con qué comparar) */
  variacion: number | null
}

/**
 * Consumo del día a día (sin cuotas arrastradas ni fijos) acumulado a
 * hoy, contra el mismo tramo de los últimos 3 meses que tengan datos.
 */
export function ritmoDeGasto(s: Snapshot): Ritmo {
  const actual = claveMes(s.hoy)
  const dia = s.hoy.getDate()
  const inicios = iniciosDeCompras(s.gastos)
  const hoyISO = isoLocal(s.hoy)
  const acumuladoDe = (mes: string) => {
    const tope = Math.min(dia, diasDelMes(mes))
    let total = 0, hay = false
    for (const g of s.gastos) {
      if (esCuotaArrastrada(g, inicios) || mesDeISO(g.fecha) !== mes) continue
      if (Number(g.fecha.slice(8, 10)) > tope || g.fecha > hoyISO) continue
      total += enPesosGasto(g, s.dolar)
      hay = true
    }
    for (const v of s.viajes) {
      if (mesDeISO(v.fecha) !== mes || Number(v.fecha.slice(8, 10)) > tope || v.fecha > hoyISO) continue
      total += v.monto
      hay = true
    }
    return { total, hay }
  }
  const acumulado = acumuladoDe(actual).total
  const previos = [1, 2, 3].map(i => acumuladoDe(sumarMeses(actual, -i))).filter(x => x.hay)
  const promedio = previos.length ? previos.reduce((a, x) => a + x.total, 0) / previos.length : null
  return {
    dia,
    diasMes: diasDelMes(actual),
    acumulado,
    promedio,
    mesesComparados: previos.length,
    variacion: promedio && promedio > 0 ? ((acumulado - promedio) / promedio) * 100 : null,
  }
}

/* ── compromisos: plata que ya tiene destino ──────────────────── */

export interface Compromiso {
  id: string
  tipo: 'tarjeta' | 'fijo'
  titulo: string
  detalle: string
  monto: number
  /** vencimiento (null: gasto fijo sin fecha, se asume este mes) */
  fecha: Date | null
  vencido: boolean
  href: string
}

export interface Compromisos {
  horizonte: number
  items: Compromiso[]
  /** total a pagar dentro del horizonte */
  total: number
  /** cuotas y resúmenes que vencen después del horizonte */
  futuro: number
  /** mes (YYYY-MM) en que vence lo último que está comprometido */
  hasta: string | null
  comprasEnCuotas: number
}

export function compromisos(s: Snapshot, horizonte = 30): Compromisos {
  const limite = new Date(s.hoy.getFullYear(), s.hoy.getMonth(), s.hoy.getDate() + horizonte)
  const items: Compromiso[] = []
  let futuro = 0
  let hasta: string | null = null
  const compras = new Set<string>()

  for (const t of s.tarjetas) {
    const porResumen = new Map<string, { monto: number; cantidad: number }>()
    for (const c of s.consumosImpagos) {
      if (c.tarjeta_id !== t.id) continue
      const k = resumenDe(c, t)
      const v = c.moneda === 'USD' ? num(c.monto) * s.dolar : num(c.monto)
      const acc = porResumen.get(k) ?? { monto: 0, cantidad: 0 }
      acc.monto += v
      acc.cantidad++
      porResumen.set(k, acc)
      if (c.compra_id && (c.cuotas_total ?? 1) > 1) compras.add(c.compra_id)
    }
    for (const [k, acc] of Array.from(porResumen.entries())) {
      if (acc.monto <= 0.5) continue
      const venc = fechasDeResumen(k, t).vencimiento
      if (!hasta || k > hasta) hasta = k
      if (venc <= limite) {
        const dias = diasEntre(s.hoy, venc)
        items.push({
          id: `${t.id}:${k}`,
          tipo: 'tarjeta',
          titulo: `Resumen ${t.nombre}`,
          detalle: `${acc.cantidad} ${acc.cantidad === 1 ? 'consumo' : 'consumos'}`,
          monto: acc.monto,
          fecha: venc,
          vencido: dias < 0,
          href: '/dashboard/tarjetas',
        })
      } else {
        futuro += acc.monto
      }
    }
  }

  for (const f of s.fijos) {
    if (f.debitado || f.monto <= 0) continue
    items.push({
      id: `fijo:${f.id}`,
      tipo: 'fijo',
      titulo: f.nombre,
      detalle: 'Gasto fijo pendiente',
      monto: f.monto,
      fecha: null,
      vencido: false,
      href: '/dashboard/gastos-variables',
    })
  }

  items.sort((a, b) => {
    if (a.fecha && b.fecha) return a.fecha.getTime() - b.fecha.getTime()
    if (a.fecha) return -1
    if (b.fecha) return 1
    return b.monto - a.monto
  })

  return {
    horizonte,
    items,
    total: items.reduce((a, i) => a + i.monto, 0),
    futuro,
    hasta,
    comprasEnCuotas: compras.size,
  }
}

/* ── actividad reciente ───────────────────────────────────────── */

export interface Actividad {
  id: string
  tipo: 'gasto' | 'ingreso'
  titulo: string
  categoria: string
  cuenta: string | null
  fecha: string
  monto: number
  moneda: string
  montoOriginal: number
  cuota: string | null
  hormiga: boolean
  href: string
}

export function actividad(s: Snapshot, n = 8, categoria?: string | null): Actividad[] {
  const hoyISO = isoLocal(s.hoy)
  const lineaApp = new Map(s.lineas.map(l => [l.id, l.etiqueta || l.app]))
  const lista: (Actividad & { orden: string })[] = []

  for (const g of s.gastos) {
    if (g.fecha > hoyISO) continue
    const cuenta = g.tarjeta_id ? s.nombreCuenta.get(g.tarjeta_id) ?? null
      : g.billetera_linea_id ? lineaApp.get(g.billetera_linea_id) ?? null : null
    lista.push({
      id: `gv:${g.id}`, tipo: 'gasto', titulo: g.nombre, categoria: g.categoria.toLowerCase(),
      cuenta: cuenta ? `${cuenta}${g.forma_pago === 'credito' ? ' · crédito' : ''}` : null,
      fecha: g.fecha, monto: enPesosGasto(g, s.dolar), moneda: g.moneda, montoOriginal: g.monto,
      cuota: g.cuotas_total && g.cuotas_total > 1 ? `${g.cuota_numero ?? 1}/${g.cuotas_total}` : null,
      hormiga: g.es_gasto_hormiga, href: '/dashboard/gastos-variables', orden: `${g.fecha}|${g.created_at}`,
    })
  }
  for (const f of s.freelance) {
    if (f.fecha > hoyISO) continue
    lista.push({
      id: `in:${f.id}`, tipo: 'ingreso', titulo: f.titulo, categoria: 'ingreso', cuenta: null,
      fecha: f.fecha, monto: f.monto, moneda: 'ARS', montoOriginal: f.monto, cuota: null, hormiga: false,
      href: '/dashboard/ingresos-gastos', orden: `${f.fecha}|${f.created_at}`,
    })
  }
  for (const v of s.viajes) {
    if (v.fecha > hoyISO) continue
    lista.push({
      id: `vj:${v.id}`, tipo: 'gasto', titulo: v.concepto, categoria: 'viajes', cuenta: v.viaje,
      fecha: v.fecha, monto: v.monto, moneda: 'ARS', montoOriginal: v.monto, cuota: null, hormiga: false,
      href: '/dashboard/viajes', orden: `${v.fecha}|`,
    })
  }
  for (const r of s.registros) {
    if (r.fecha > hoyISO) continue
    lista.push({
      id: `sr:${r.id}`, tipo: r.tipo, titulo: r.texto, categoria: r.seccion, cuenta: null,
      fecha: r.fecha, monto: r.monto, moneda: 'ARS', montoOriginal: r.monto, cuota: null, hormiga: false,
      href: '/dashboard/historial', orden: `${r.fecha}|`,
    })
  }
  return lista
    .filter(a => !categoria || a.categoria === categoria)
    .sort((a, b) => b.orden.localeCompare(a.orden))
    .slice(0, n)
    .map(({ orden: _o, ...a }) => a)
}

/* ── momento del mes (contexto) ───────────────────────────────── */

export type Momento = 'inicio' | 'mitad' | 'cierre'

export function momentoDelMes(hoy: Date): { momento: Momento; dia: number; diasMes: number; restan: number } {
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const dia = hoy.getDate()
  const momento: Momento = dia <= 7 ? 'inicio' : dia >= diasMes - 5 ? 'cierre' : 'mitad'
  return { momento, dia, diasMes, restan: diasMes - dia }
}

/* ── metas: progreso ──────────────────────────────────────────── */

export interface ProgresoMeta { id: string; nombre: string; emoji: string; pct: number; actual: number; objetivo: number; moneda: string }

export function progresoMetas(s: Snapshot): ProgresoMeta[] {
  const saldoApp = new Map<string, number>()
  for (const l of s.lineas) saldoApp.set(l.app, (saldoApp.get(l.app) ?? 0) + aPesos(l, s.cot))
  return s.metas.filter(m => m.objetivo > 0).map(m => {
    const pesos = m.billetera_app ? saldoApp.get(m.billetera_app) ?? 0 : null
    const actual = pesos === null ? m.aportado : m.moneda === 'USD' ? pesos / s.dolar : pesos
    return { id: m.id, nombre: m.nombre, emoji: m.emoji || '🎯', pct: (actual / m.objetivo) * 100, actual, objetivo: m.objetivo, moneda: m.moneda }
  }).sort((a, b) => b.pct - a.pct)
}
