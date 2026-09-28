/* ── Ingresos fijos: lo cobrado es de UN mes ───────────────────────
   Antes, "cobrado este mes" (monto_cobrado) nunca se reiniciaba: si
   un mes cobrabas menos, ese monto se seguía mostrando todos los meses.
   Ahora se guarda también en qué mes se cobró (`cobrado_mes`).

   Compatibilidad: si la columna todavía no existe en la base (no se
   corrió la migración 2026-09-28_ingresos_cobrado_mes.sql), todo sigue
   funcionando con el criterio anterior.                              */

import type { SupabaseClient } from '@supabase/supabase-js'
import { mesActualISO } from './fechas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>
type Fila = Record<string, unknown>

const tieneColumna = (r: Fila) => Object.prototype.hasOwnProperty.call(r, 'cobrado_mes')
const n = (v: unknown) => (v == null || v === '' ? null : Number(v) || 0)

/** Lo que ese sueldo aporta como ingreso en `mes` (por defecto, el actual). */
export function cobradoDelMes(r: Fila, mes = mesActualISO()): number {
  const monto = n(r.monto) ?? 0
  const cobrado = n(r.monto_cobrado)
  if (!tieneColumna(r)) return cobrado ?? monto
  return r.cobrado_mes === mes ? (cobrado ?? monto) : monto
}

/** Cuánto de ese sueldo ya se registró como cobrado ESTE mes (0 si nada). */
export function yaCobradoEsteMes(r: Fila): number {
  const monto = n(r.monto) ?? 0
  const cobrado = n(r.monto_cobrado)
  if (!tieneColumna(r)) return cobrado ?? monto
  return r.cobrado_mes === mesActualISO() ? (cobrado ?? monto) : 0
}

/** ¿Hay un cobro registrado para este mes? */
export function tieneCobroEsteMes(r: Fila): boolean {
  if (!tieneColumna(r)) return n(r.monto_cobrado) != null
  return r.cobrado_mes === mesActualISO() && n(r.monto_cobrado) != null
}

const faltaColumna = (e: { message?: string } | null) => !!e && /cobrado_mes/i.test(e.message ?? '')

/**
 * Inserta o actualiza un ingreso fijo. Si trae `monto_cobrado`, marca el
 * mes del cobro. Si la base todavía no tiene la columna, reintenta sin ella.
 */
export async function guardarIngresoFijo(
  supabase: Cliente, datos: Fila, id?: string,
): Promise<{ error: { message: string } | null }> {
  const conMes = 'monto_cobrado' in datos
    ? { ...datos, cobrado_mes: datos.monto_cobrado == null ? null : mesActualISO() }
    : datos
  const escribir = (fila: Fila) => id
    ? supabase.from('ingresos_fijos').update(fila).eq('id', id)
    : supabase.from('ingresos_fijos').insert(fila)
  const r1 = await escribir(conMes)
  if (!faltaColumna(r1.error)) return { error: r1.error }
  const r2 = await escribir(datos)
  return { error: r2.error }
}
