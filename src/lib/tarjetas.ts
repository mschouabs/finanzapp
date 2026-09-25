/* ── Tarjetas y cuentas ───────────────────────────────────────────
   Viven en la tabla `tarjetas_cuentas` (antes estaban en el
   localStorage del navegador y se perdían al cambiar de dispositivo).
   Cada gasto variable puede apuntar a una con `tarjeta_id`.          */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Tarjeta {
  id: string
  user_id: string
  nombre: string
  tipo: string
  marca: string | null
  limite: number | null
  cierre: number | null
  vencimiento: number | null
  saldo: number | null
  moneda: string
  created_at: string
}

export const MARCAS = ['Visa', 'Mastercard', 'Naranja X', 'Mercado Pago', 'Ualá', 'Brubank', 'AMEX', 'Cabal', 'Otra']

export const COLORES_MARCA: Record<string, string> = {
  'Visa': '#1A1F71',
  'Mastercard': '#EB001B',
  'Naranja X': '#F47920',
  'Mercado Pago': '#009EE3',
  'Ualá': '#3E5BF6',
  'Brubank': '#6C2BD9',
  'AMEX': '#007BC1',
  'Cabal': '#004A97',
  'Otra': '#6E7681',
}

/* ── Medios de pago ─────────────────────────────────────────────
   Cómo escribe la gente cada app/tarjeta → nombre canónico + marca.
   El orden importa: los alias más largos primero ("naranja x" antes
   que "naranja", "mercado pago" antes que "mp").                      */
const MEDIOS: Array<{ nombre: string; marca: string; alias: RegExp }> = [
  { nombre: 'MercadoPago', marca: 'Mercado Pago', alias: /\b(mercado\s*pago|mercadopago|mp)\b/ },
  { nombre: 'Naranja X',   marca: 'Naranja X',    alias: /\b(naranja\s*x|naranja)\b/ },
  { nombre: 'Ualá',        marca: 'Ualá',         alias: /\b(uala)\b/ },
  { nombre: 'Brubank',     marca: 'Brubank',      alias: /\b(brubank)\b/ },
  { nombre: 'Cuenta DNI',  marca: 'Otra',         alias: /\b(cuenta\s*dni)\b/ },
  { nombre: 'Personal Pay', marca: 'Otra',        alias: /\b(personal\s*pay)\b/ },
  { nombre: 'Lemon',       marca: 'Otra',         alias: /\b(lemon(\s*cash)?)\b/ },
  { nombre: 'Prex',        marca: 'Otra',         alias: /\b(prex)\b/ },
  { nombre: 'Modo',        marca: 'Otra',         alias: /\b(con|por|via|en|desde)\s+modo\b/ },
  { nombre: 'Visa',        marca: 'Visa',         alias: /\b(visa)\b/ },
  { nombre: 'Mastercard',  marca: 'Mastercard',   alias: /\b(mastercard|master)\b/ },
  { nombre: 'AMEX',        marca: 'AMEX',         alias: /\b(amex|american\s*express)\b/ },
]

export function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Detecta con qué app/tarjeta se pagó. Devuelve el nombre canónico o null. */
export function detectarMedioPago(texto: string): string | null {
  const t = normalizar(texto)
  for (const m of MEDIOS) if (m.alias.test(t)) return m.nombre
  return null
}

export function marcaDeMedio(nombre: string): string {
  return MEDIOS.find(m => m.nombre === nombre)?.marca ?? 'Otra'
}

/** ¿El nombre de una tarjeta guardada corresponde a este medio de pago? */
function coincide(tarjeta: Pick<Tarjeta, 'nombre' | 'marca'>, medio: string): boolean {
  const n = normalizar(tarjeta.nombre).replace(/\s+/g, '')
  const m = normalizar(medio).replace(/\s+/g, '')
  if (n === m || n.includes(m) || m.includes(n)) return true
  // "Visa Galicia" guardada, medio detectado "Visa"
  return detectarMedioPago(tarjeta.nombre) === medio
}

/**
 * Devuelve el id de la tarjeta/cuenta del usuario que corresponde al
 * medio de pago. Si todavía no existe, la crea — así "gasté 5 lucas
 * con Ualá" arma la cuenta Ualá sola la primera vez.
 */
export async function resolverTarjetaId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  medio: string | null | undefined,
): Promise<string | null> {
  if (!medio) return null

  const { data: existentes } = await supabase
    .from('tarjetas_cuentas')
    .select('id, nombre, marca')
    .eq('user_id', userId)

  const match = (existentes ?? []).find(t => coincide(t as Tarjeta, medio))
  if (match) return (match as Tarjeta).id

  const { data: nueva } = await supabase
    .from('tarjetas_cuentas')
    .insert({ user_id: userId, nombre: medio, tipo: 'cuenta', marca: marcaDeMedio(medio) })
    .select('id')
    .single()

  return (nueva as { id: string } | null)?.id ?? null
}
