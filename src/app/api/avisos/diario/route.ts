/* Envío diario de avisos con la app cerrada (Web Push).
   Lo llama el cron de Vercel todos los días a las 9 de Argentina
   (ver vercel.json). Protegido con CRON_SECRET.                     */
import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { enviarPush, type Vapid } from '@/lib/servidor/webpush'
import { ahoraArgentina, avisosDelDia, soloDe } from '@/lib/servidor/avisosDelDia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req: NextRequest) {
  const secreto = process.env.CRON_SECRET
  const h = req.headers.get('authorization') ?? ''
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secreto}`)
  return !!secreto && a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const vapid: Vapid = {
    publica: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    privada: process.env.VAPID_PRIVATE_KEY ?? '',
    sujeto: process.env.VAPID_SUBJECT ?? 'https://finanzapp-five-chi.vercel.app',
  }
  if (!vapid.publica || !vapid.privada || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'faltan variables de entorno' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: subs, error } = await admin.from('push_suscripciones').select('id, user_id, endpoint, p256dh, auth')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Sus = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
  const porUsuario = new Map<string, Sus[]>()
  for (const s of (subs ?? []) as Sus[]) porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) ?? []), s])

  const hoy = ahoraArgentina()
  let enviados = 0, borradas = 0
  const fallos: string[] = []

  for (const [uid, lista] of Array.from(porUsuario.entries())) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(uid)
      const { data: ya } = await admin.from('push_enviados').select('clave').eq('user_id', uid)
      const avisos = await avisosDelDia({
        cliente: soloDe(admin, uid), metadatos: u.user?.user_metadata ?? {},
        enviados: new Set(((ya ?? []) as { clave: string }[]).map(x => x.clave)), hoy,
      })
      if (!avisos.length) continue
      for (const s of lista) {
        for (const a of avisos) {
          const st = await enviarPush(s, { titulo: a.titulo, cuerpo: a.cuerpo, href: a.href, clave: a.clave }, vapid)
          if (st === 404 || st === 410) { await admin.from('push_suscripciones').delete().eq('id', s.id); borradas++; break }
          if (st >= 200 && st < 300) enviados++
          else fallos.push(`${st}`)
        }
      }
      const unicos = avisos.filter(a => a.clave.startsWith('pres:')).map(a => ({ user_id: uid, clave: a.clave }))
      if (unicos.length) await admin.from('push_enviados').upsert(unicos, { onConflict: 'user_id,clave', ignoreDuplicates: true })
      await admin.from('push_suscripciones').update({ ultimo_envio: new Date().toISOString() }).eq('user_id', uid)
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : 'error')
    }
  }
  return NextResponse.json({ usuarios: porUsuario.size, enviados, borradas, fallos: fallos.slice(0, 10) })
}
