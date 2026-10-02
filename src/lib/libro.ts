/* ── Libro de movimientos ─────────────────────────────────────────
   Toda la plata que entra o sale de una cuenta queda anotada en la
   tabla `movimientos` (la escribe la base, con un trigger). Desde la
   app solo hay que decir POR QUÉ cambia el saldo: eso es el contexto.

   Las operaciones de dos pasos (transferir, pagar un resumen) se hacen
   en la base, en una sola transacción: o se hace todo o nada.

   Compatibilidad: si la base todavía no tiene las funciones nuevas,
   se usa `ajustar_saldo` como antes (sin motivo).                     */

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export type TipoMovimiento = 'gasto' | 'ingreso' | 'transferencia' | 'inversion' | 'pago_tarjeta' | 'deshacer' | 'ajuste'

export interface Contexto {
  tipo: TipoMovimiento
  descripcion?: string
  origen_tabla?: string
  origen_id?: string | null
}

const faltaFuncion = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || /could not find the function/i.test(e.message ?? ''))

/** Suma (o resta, con delta negativo) al saldo de una cuenta, anotando el motivo. */
export async function ajustarSaldo(
  supabase: Cliente, cuentaId: string, delta: number, ctx: Contexto,
): Promise<{ error: { message: string } | null }> {
  const limpio = { ...ctx, origen_id: ctx.origen_id || undefined }
  const r = await supabase.rpc('ajustar_saldo_ctx', { p_id: cuentaId, p_delta: delta, p_ctx: limpio })
  if (!faltaFuncion(r.error)) return { error: r.error }
  const r2 = await supabase.rpc('ajustar_saldo', { p_id: cuentaId, p_delta: delta })
  return { error: r2.error }
}

/** Transferencia atómica entre dos cuentas (`llega` distinto de `sale` si cambia la moneda). */
export async function transferirEntreCuentas(
  supabase: Cliente, desde: string, hacia: string, sale: number, llega: number, nota?: string,
): Promise<{ error: string | null }> {
  const r = await supabase.rpc('transferir', { p_desde: desde, p_hacia: hacia, p_sale: sale, p_llega: llega, p_nota: nota ?? null })
  if (!faltaFuncion(r.error)) return { error: r.error ? r.error.message : null }
  /* respaldo: dos pasos, devolviendo la plata si el segundo falla */
  const e1 = await ajustarSaldo(supabase, desde, -sale, { tipo: 'transferencia', descripcion: 'Transferencia enviada' })
  if (e1.error) return { error: 'No se pudo descontar de la cuenta de origen.' }
  const e2 = await ajustarSaldo(supabase, hacia, llega, { tipo: 'transferencia', descripcion: 'Transferencia recibida' })
  if (e2.error) {
    await ajustarSaldo(supabase, desde, sale, { tipo: 'deshacer', descripcion: 'Transferencia anulada' })
    return { error: 'No se pudo acreditar en la cuenta de destino. No se movió nada.' }
  }
  return { error: null }
}

/** Paga consumos de tarjeta desde una cuenta, en una sola operación. Devuelve null si la base no la soporta. */
export async function pagarConsumosAtomico(
  supabase: Cliente, cuentaId: string, ids: string[], descripcion: string,
): Promise<{ error: string | null } | null> {
  const r = await supabase.rpc('pagar_consumos', { p_linea: cuentaId, p_ids: ids, p_descripcion: descripcion })
  if (faltaFuncion(r.error)) return null
  return { error: r.error ? r.error.message : null }
}

/* ── lectura ── */

export interface Movimiento {
  id: string
  cuenta_id: string
  fecha: string
  tipo: TipoMovimiento | 'apertura' | 'cierre'
  delta: number
  saldo_resultante: number
  moneda: string
  descripcion: string | null
  grupo: string | null
  origen_tabla: string | null
  origen_id: string | null
}

export async function ultimosMovimientos(supabase: Cliente, opts: { cuentaId?: string; limite?: number } = {}) {
  let q = supabase.from('movimientos').select('id, cuenta_id, fecha, tipo, delta, saldo_resultante, moneda, descripcion, grupo, origen_tabla, origen_id')
    .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limite ?? 30)
  if (opts.cuentaId) q = q.eq('cuenta_id', opts.cuentaId)
  const { data, error } = await q
  if (error) return { movimientos: [] as Movimiento[], disponible: false }
  return { movimientos: (data ?? []) as Movimiento[], disponible: true }
}

/** Cuántas cuentas no cuadran (saldo ≠ suma del libro). null si no se pudo verificar. */
export async function cuentasQueNoCuadran(supabase: Cliente): Promise<number | null> {
  const { data, error } = await supabase.from('movimientos_control').select('cuenta_id, diferencia')
  if (error) return null
  return ((data ?? []) as { diferencia: number }[]).filter(r => Math.abs(Number(r.diferencia)) > 0.005).length
}

/** Deshace un movimiento del libro (y su contraparte, si es una transferencia). */
export async function deshacerMovimiento(supabase: Cliente, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('deshacer_movimiento', { p_id: id })
  return { error: error ? error.message : null }
}

/** ¿Se puede deshacer desde el libro? (lo demás se deshace desde su pantalla) */
export function sePuedeDeshacer(m: Movimiento, todos: Movimiento[]): boolean {
  const revertidos = new Set(todos.filter(x => x.origen_tabla === 'movimientos').map(x => x.origen_id))
  const grupo = m.grupo ? todos.filter(x => x.grupo === m.grupo) : [m]
  if (grupo.some(x => revertidos.has(x.id))) return false
  if (m.tipo === 'transferencia' || m.tipo === 'ajuste') return true
  if (m.tipo === 'gasto' && m.origen_id && (m.origen_tabla === 'gastos_variables' || m.origen_tabla === 'viaje_gastos')) {
    /* si el gasto ya se borró desde su pantalla, la plata ya volvió */
    return !todos.some(x => x.tipo === 'deshacer' && x.origen_id === m.origen_id)
  }
  return false
}
