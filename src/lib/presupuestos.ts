/* ── Presupuesto por categoría ─────────────────────────────────────────
   Un tope mensual (en pesos) por categoría de gasto variable. Se guarda
   en tu cuenta (metadatos del usuario) y en el dispositivo, así no hace
   falta tocar la base de datos.                                      */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tono } from '@/components/ui/Estado'

export type Presupuestos = Record<string, number>

const CLAVE = 'fa_presupuestos_v1'

export function normalizarPresupuestos(p: unknown): Presupuestos {
  const out: Presupuestos = {}
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const n = Number(v)
    if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n)
  }
  return out
}

export function leerPresupuestosLocal(): Presupuestos {
  try { return normalizarPresupuestos(JSON.parse(localStorage.getItem(CLAVE) || '{}')) } catch { return {} }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leerPresupuestosCuenta(supabase: SupabaseClient<any, any, any>): Promise<Presupuestos | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const p = user?.user_metadata?.presupuestos
    return p ? normalizarPresupuestos(p) : null
  } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guardarPresupuestos(supabase: SupabaseClient<any, any, any> | null, p: Presupuestos) {
  const limpio = normalizarPresupuestos(p)
  try { localStorage.setItem(CLAVE, JSON.stringify(limpio)) } catch { /* sin storage */ }
  if (supabase) { try { await supabase.auth.updateUser({ data: { presupuestos: limpio } }) } catch { /* queda local */ } }
  return limpio
}

export interface EstadoPresupuesto { tope: number; resta: number; pct: number; tono: Tono; texto: string }

/** Cómo vas contra el tope. `avance` = fracción del mes transcurrida (1 = mes cerrado). */
export function estadoPresupuesto(gastado: number, tope: number, avance: number, fmt: (n: number) => string): EstadoPresupuesto {
  const resta = tope - gastado
  const pct = tope > 0 ? gastado / tope : 0
  if (resta < 0) return { tope, resta, pct, tono: 'negativo', texto: `Te pasaste ${fmt(-resta)}` }
  const esperado = Math.min(Math.max(avance, 0), 1) * tope
  if (avance < 1 && gastado > esperado * 1.1 && pct >= 0.5) return { tope, resta, pct, tono: 'advertencia', texto: `Quedan ${fmt(resta)} · vas rápido` }
  return { tope, resta, pct, tono: 'positivo', texto: `Quedan ${fmt(resta)}` }
}
