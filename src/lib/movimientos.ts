/* ── Guardar / borrar gastos variables ─────────────────────────────
   Un solo lugar para toda la lógica de "con qué pagaste":
   - vincula el gasto a su tarjeta/app (tarjeta_id)
   - si fue con débito, lo descuenta del saldo disponible de esa
     billetera y guarda de qué línea salió (billetera_linea_id), así
     al borrar el gasto la plata vuelve al mismo lugar.
   Lo usan Luca, el widget del Resumen, Movimientos, Tarjetas y WhatsApp. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizar, resolverTarjetaId, type FormaPago } from './tarjetas'
import { aISO, fechasDeResumen, resumenDeCompra, sumarMeses } from './ciclos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export interface NuevoGasto {
  nombre: string
  monto: number
  categoria: string
  fecha: string
  es_gasto_hormiga?: boolean
  /** Nombre de la app/tarjeta ("MercadoPago"). */
  medio_pago?: string | null
  forma_pago?: FormaPago | null
  /** Compras con tarjeta: en cuántas cuotas (monto = total de la compra). */
  cuotas?: number | null
  /**
   * Para cargar una compra que ya venía en curso (ej: "vamos por la
   * cuota 5 de 6"): no crea las cuotas anteriores, arranca directo en
   * esta. `fecha` pasa a ser la fecha de ESA cuota (para saber en qué
   * resumen cae), no la de la compra original. 1 por defecto.
   */
  cuotaInicial?: number | null
  /** 'ARS' por defecto. Los consumos en dólares con tarjeta van en 'USD'. */
  moneda?: 'ARS' | 'USD'
}

/** Gasto en pesos: los consumos en dólares se pasan con la cotización. */
export function montoEnPesos(g: { monto: number; moneda?: string | null }, dolar: number | null) {
  const m = Number(g.monto) || 0
  return g.moneda === 'USD' ? m * (dolar ?? 1560) : m
}

const nuevoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

const mismaApp = (a: string, b: string) => {
  const x = normalizar(a).replace(/\s+/g, '')
  const y = normalizar(b).replace(/\s+/g, '')
  return x === y || x.startsWith(y) || y.startsWith(x)
}

/**
 * Línea de saldo en pesos de la que sale la plata cuando pagás con
 * débito en esa app. Si la app todavía no tiene una, se crea en $0
 * (va a quedar en negativo hasta que cargues el saldo real).
 */
export async function resolverLineaDisponible(
  supabase: Cliente, userId: string, app: string, moneda: 'ARS' | 'USD' = 'ARS',
): Promise<string | null> {
  if (moneda === 'USD') {
    /* dólares: la línea en USD de esa app, si existe */
    const { data } = await supabase.from('inversiones').select('id, app, tipo')
      .eq('user_id', userId).eq('moneda', 'USD')
    const l = (data ?? []).find(x => mismaApp(x.app as string, app) && x.tipo !== 'cripto')
    return (l?.id as string) ?? null
  }
  const { data } = await supabase
    .from('inversiones')
    .select('id, app, moneda, es_disponible')
    .eq('user_id', userId)
    .eq('moneda', 'ARS')
    .eq('es_disponible', true)

  const linea = (data ?? []).find(l => mismaApp(l.app as string, app))
  if (linea) return linea.id as string

  const { data: nueva } = await supabase
    .from('inversiones')
    .insert({
      user_id: userId, app, nombre: 'Disponible en pesos', tipo: 'efectivo',
      moneda: 'ARS', monto: 0, tasa_anual: 0, nivel_riesgo: 'conservador', es_disponible: true,
    })
    .select('id')
    .single()
  return (nueva as { id: string } | null)?.id ?? null
}

export async function guardarGastoVariable(
  supabase: Cliente, userId: string, g: NuevoGasto,
): Promise<{ error: string | null }> {
  const medio = g.medio_pago || null
  const cuotas = Math.max(1, Math.round(Number(g.cuotas) || 1))
  /* en cuotas es siempre crédito */
  const forma: FormaPago | null = medio ? (cuotas > 1 ? 'credito' : (g.forma_pago ?? 'debito')) : null
  const moneda = g.moneda ?? 'ARS'

  const tarjeta_id = await resolverTarjetaId(supabase, userId, medio)
  const billetera_linea_id =
    medio && forma === 'debito' ? await resolverLineaDisponible(supabase, userId, medio, moneda) : null

  const base = {
    user_id: userId,
    nombre: g.nombre,
    moneda,
    categoria: g.categoria || 'varios',
    es_gasto_hormiga: g.es_gasto_hormiga ?? false,
    tarjeta_id,
    forma_pago: forma,
  }

  let filas: Record<string, unknown>[]
  if (forma === 'credito' && tarjeta_id) {
    /* Compra con tarjeta: cada cuota va al resumen que le toca */
    const { data: t } = await supabase
      .from('tarjetas_cuentas').select('cierre, vencimiento').eq('id', tarjeta_id).single()
    const dias = { cierre: t?.cierre ?? null, vencimiento: t?.vencimiento ?? null }
    /* si la compra ya venía en curso ("vamos por la cuota 5 de 6"),
       arranca ahí: no crea las cuotas anteriores, y `g.fecha` marca la
       fecha de esa cuota (no la de la compra original) */
    const cuotaInicial = Math.min(cuotas, Math.max(1, Math.round(Number(g.cuotaInicial) || 1)))
    const primero = resumenDeCompra(g.fecha, dias)
    const total = Number(g.monto)
    const cuota = Math.round((total / cuotas) * 100) / 100
    const compra_id = cuotas > 1 ? nuevoId() : null
    filas = Array.from({ length: cuotas - cuotaInicial + 1 }, (_, i) => {
      const numero = cuotaInicial + i
      const resumen = sumarMeses(primero, i)
      /* la última cuota absorbe el redondeo */
      const monto = numero === cuotas ? Math.round((total - cuota * (cuotas - 1)) * 100) / 100 : cuota
      return {
        ...base,
        monto,
        /* la primera cuota que cargamos queda en la fecha indicada; las
           demás, en el vencimiento de su resumen (cuando la vas a pagar) */
        fecha: i === 0 ? g.fecha : aISO(fechasDeResumen(resumen, dias).vencimiento),
        fecha_compra: g.fecha,
        resumen,
        pagado: false,
        compra_id,
        cuota_numero: numero,
        cuotas_total: cuotas,
        monto_total: total,
      }
    })
  } else {
    filas = [{ ...base, monto: g.monto, fecha: g.fecha, billetera_linea_id }]
  }

  const { error } = await supabase.from('gastos_variables').insert(filas)
  if (error) return { error: error.message }

  /* Si pagaste a crédito con una app que teníamos solo como cuenta,
     pasa a figurar también como tarjeta. */
  if (tarjeta_id && forma === 'credito') {
    await supabase.from('tarjetas_cuentas').update({ tipo: 'tarjeta' }).eq('id', tarjeta_id).eq('tipo', 'cuenta')
  }

  if (billetera_linea_id) {
    const { error: e2 } = await supabase.rpc('ajustar_saldo', {
      p_id: billetera_linea_id, p_delta: -Number(g.monto),
    })
    if (e2) return { error: `El gasto se guardó pero no se pudo descontar del saldo: ${e2.message}` }
  }
  return { error: null }
}

/**
 * Borra el gasto y, si había salido de una billetera, devuelve la plata.
 * Si es una cuota, `compraCompleta` borra todas las cuotas de esa compra.
 */
export async function borrarGastoVariable(
  supabase: Cliente,
  gasto: { id: string; monto: number; billetera_linea_id?: string | null; compra_id?: string | null },
  compraCompleta = false,
) {
  if (compraCompleta && gasto.compra_id) {
    await supabase.from('gastos_variables').delete().eq('compra_id', gasto.compra_id)
    return
  }
  await supabase.from('gastos_variables').delete().eq('id', gasto.id)
  if (gasto.billetera_linea_id) {
    await supabase.rpc('ajustar_saldo', {
      p_id: gasto.billetera_linea_id, p_delta: Number(gasto.monto),
    })
  }
}

/* ── Pago de resúmenes ─────────────────────────────────────────── */

export interface ConsumoTarjeta {
  id: string
  monto: number
  moneda: string | null
  pagado: boolean | null
  pago_linea_id: string | null
}

/**
 * Paga los consumos pendientes de un resumen: descuenta los pesos de
 * `lineaARS` y los dólares de `lineaUSD`, y marca todo como pagado
 * recordando de dónde salió (para poder deshacerlo).
 */
export async function pagarConsumos(
  supabase: Cliente, consumos: ConsumoTarjeta[], lineaARS: string | null, lineaUSD: string | null,
): Promise<{ error: string | null }> {
  const pendientes = consumos.filter(c => !c.pagado)
  const ars = pendientes.filter(c => c.moneda !== 'USD')
  const usd = pendientes.filter(c => c.moneda === 'USD')
  if (ars.length && !lineaARS) return { error: 'Elegí de qué cuenta salen los pesos.' }
  if (usd.length && !lineaUSD) return { error: 'Elegí de qué cuenta salen los dólares.' }

  for (const [grupo, linea] of [[ars, lineaARS], [usd, lineaUSD]] as const) {
    if (!grupo.length || !linea) continue
    const total = grupo.reduce((s, c) => s + Number(c.monto), 0)
    const { error: e1 } = await supabase.rpc('ajustar_saldo', { p_id: linea, p_delta: -total })
    if (e1) return { error: e1.message }
    const { error: e2 } = await supabase.from('gastos_variables')
      .update({ pagado: true, pago_linea_id: linea }).in('id', grupo.map(c => c.id))
    if (e2) return { error: e2.message }
  }
  return { error: null }
}

/** Deshace un pago: la plata vuelve a la cuenta y los consumos quedan pendientes. */
export async function deshacerPago(supabase: Cliente, consumos: ConsumoTarjeta[]) {
  const porLinea = new Map<string, number>()
  for (const c of consumos) {
    if (!c.pagado || !c.pago_linea_id) continue
    porLinea.set(c.pago_linea_id, (porLinea.get(c.pago_linea_id) ?? 0) + Number(c.monto))
  }
  for (const [linea, total] of porLinea) {
    await supabase.rpc('ajustar_saldo', { p_id: linea, p_delta: total })
  }
  const ids = consumos.filter(c => c.pagado && c.pago_linea_id).map(c => c.id)
  if (ids.length) {
    await supabase.from('gastos_variables').update({ pagado: false, pago_linea_id: null }).in('id', ids)
  }
}

/** Apps/tarjetas disponibles para elegir "con qué pagaste". */
export async function listarMediosDePago(supabase: Cliente): Promise<string[]> {
  const [{ data: ts }, { data: ls }] = await Promise.all([
    supabase.from('tarjetas_cuentas').select('nombre'),
    supabase.from('inversiones').select('app').eq('es_disponible', true),
  ])
  const nombres: string[] = []
  for (const n of [...(ts ?? []).map(t => t.nombre as string), ...(ls ?? []).map(l => l.app as string)]) {
    if (n && !nombres.some(x => mismaApp(x, n))) nombres.push(n)
  }
  return nombres.sort((a, b) => a.localeCompare(b))
}
