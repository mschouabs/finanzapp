/* ── Me deben ─────────────────────────────────────────────────────
   Plata que otras personas te deben (la parte de un Airbnb, un
   préstamo, una cena). NO es un ingreso ni suma a tu patrimonio:
   es plata que ya gastaste y te van a devolver. Cuando te pagan,
   el cobro entra a la cuenta que elijas y queda en el libro.        */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ajustarSaldo } from './libro'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export interface MeDeben {
  id: string
  persona: string
  concepto: string
  monto: number
  moneda: 'ARS' | 'USD'
  cobrado: number
  fecha: string
  vence: string | null
  nota: string | null
}

export const pendienteDe = (d: Pick<MeDeben, 'monto' | 'cobrado'>) => Math.max(0, Math.round((d.monto - d.cobrado) * 100) / 100)

/** Convierte una fila de la base. */
export function aMeDeben(r: Record<string, unknown>): MeDeben {
  return {
    id: String(r.id), persona: String(r.persona ?? ''), concepto: String(r.concepto ?? ''),
    monto: Number(r.monto) || 0, moneda: r.moneda === 'USD' ? 'USD' : 'ARS', cobrado: Number(r.cobrado) || 0,
    fecha: String(r.fecha ?? '').slice(0, 10), vence: r.vence ? String(r.vence).slice(0, 10) : null,
    nota: (r.nota as string | null) ?? null,
  }
}

/** Todas las deudas (las saldadas también). `disponible` es false si la tabla no existe todavía. */
export async function cargarMeDeben(supabase: Cliente): Promise<{ deudas: MeDeben[]; disponible: boolean }> {
  const { data, error } = await supabase.from('me_deben').select('*').order('fecha', { ascending: false })
  if (error) return { deudas: [], disponible: false }
  return { deudas: ((data ?? []) as Record<string, unknown>[]).map(aMeDeben), disponible: true }
}

export async function agregarMeDeben(
  supabase: Cliente, userId: string,
  d: { persona: string; concepto: string; monto: number; moneda: 'ARS' | 'USD'; vence?: string | null; fecha?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('me_deben').insert({
    user_id: userId, persona: d.persona.trim(), concepto: d.concepto.trim(), monto: d.monto, moneda: d.moneda,
    vence: d.vence || null, ...(d.fecha ? { fecha: d.fecha } : {}),
  })
  return { error: error ? error.message : null }
}

/**
 * Registra un cobro: la plata entra a `cuentaId` (que debe ser de la misma
 * moneda) y queda anotada en el libro. No cuenta como ingreso del mes.
 */
export async function registrarCobro(
  supabase: Cliente, d: MeDeben, monto: number, cuentaId: string,
): Promise<{ error: string | null }> {
  const pend = pendienteDe(d)
  if (!(monto > 0)) return { error: 'Poné un monto mayor a cero.' }
  if (monto > pend + 0.005) return { error: 'Es más de lo que te debe.' }
  const motivo = `Cobro a ${d.persona}${d.concepto ? `: ${d.concepto}` : ''}`
  const { error: e1 } = await ajustarSaldo(supabase, cuentaId, monto, { tipo: 'ingreso', descripcion: motivo, origen_tabla: 'me_deben', origen_id: d.id })
  if (e1) return { error: e1.message }
  const { error: e2 } = await supabase.from('me_deben').update({ cobrado: Math.round((d.cobrado + monto) * 100) / 100 }).eq('id', d.id)
  if (e2) {
    /* si no se pudo anotar el cobro, la plata vuelve a como estaba */
    await ajustarSaldo(supabase, cuentaId, -monto, { tipo: 'deshacer', descripcion: `${motivo} (anulado)` })
    return { error: e2.message }
  }
  return { error: null }
}

export async function borrarMeDeben(supabase: Cliente, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('me_deben').delete().eq('id', id)
  return { error: error ? error.message : null }
}
