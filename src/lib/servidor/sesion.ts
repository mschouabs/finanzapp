/* Verificación de sesión para las rutas /api que cuestan plata
   (Anthropic, OpenAI). Acepta la sesión de Supabase por cookie (el
   navegador la manda sola) o por "Authorization: Bearer". Las llamadas
   internas del servidor (webhook de WhatsApp) se identifican con una
   huella de la clave de servicio, que nunca sale del servidor. */
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const CABECERA_INTERNA = 'x-finanzapp-interno'

export function huellaInterna(): string | null {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  return clave ? crypto.createHash('sha256').update(`interno:${clave}`).digest('hex') : null
}

function iguales(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** true si el pedido viene de un usuario con sesión o del propio servidor. */
export async function pedidoAutorizado(req: NextRequest): Promise<boolean> {
  const interna = req.headers.get(CABECERA_INTERNA)
  const esperada = huellaInterna()
  if (interna && esperada && iguales(interna, esperada)) return true

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  try {
    const supabase = createServerClient(url, anon, {
      cookies: { getAll: () => req.cookies.getAll(), setAll() {} },
    })
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
    return !!user
  } catch {
    return false
  }
}
