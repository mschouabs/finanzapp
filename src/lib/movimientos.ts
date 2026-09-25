/* ── Guardar / borrar gastos variables ─────────────────────────────
   Un solo lugar para toda la lógica de "con qué pagaste":
   - vincula el gasto a su tarjeta/app (tarjeta_id)
   - si fue con débito, lo descuenta del saldo disponible de esa
     billetera y guarda de qué línea salió (billetera_linea_id), así
     al borrar el gasto la plata vuelve al mismo lugar.
   Lo usan Luca, el widget del Resumen, Movimientos, Tarjetas y WhatsApp. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizar, resolverTarjetaId, type FormaPago } from './tarjetas'

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
}

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
  supabase: Cliente, userId: string, app: string,
): Promise<string | null> {
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
  const forma: FormaPago | null = medio ? (g.forma_pago ?? 'debito') : null

  const tarjeta_id = await resolverTarjetaId(supabase, userId, medio)
  const billetera_linea_id =
    medio && forma === 'debito' ? await resolverLineaDisponible(supabase, userId, medio) : null

  const { error } = await supabase.from('gastos_variables').insert({
    user_id: userId,
    nombre: g.nombre,
    monto: g.monto,
    categoria: g.categoria || 'varios',
    fecha: g.fecha,
    es_gasto_hormiga: g.es_gasto_hormiga ?? false,
    tarjeta_id,
    forma_pago: forma,
    billetera_linea_id,
  })
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

/** Borra el gasto y, si había salido de una billetera, devuelve la plata. */
export async function borrarGastoVariable(
  supabase: Cliente,
  gasto: { id: string; monto: number; billetera_linea_id?: string | null },
) {
  await supabase.from('gastos_variables').delete().eq('id', gasto.id)
  if (gasto.billetera_linea_id) {
    await supabase.rpc('ajustar_saldo', {
      p_id: gasto.billetera_linea_id, p_delta: Number(gasto.monto),
    })
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
