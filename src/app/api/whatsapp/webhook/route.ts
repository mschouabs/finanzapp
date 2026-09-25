import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { resolverTarjetaId } from '@/lib/tarjetas'
import { createAdminClient } from '@/lib/supabaseAdmin'

/* Webhook de WhatsApp (Twilio). Un mensaje de texto llega, se interpreta
   con el mismo cerebro de Luca (/api/ai) y si es una transaccion valida
   se guarda directo en Supabase, sin pasar por la UI. */

function validarFirmaTwilio(url: string, params: Record<string, string>, firma: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token || !firma) return false
  const datos = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)
  const esperado = crypto.createHmac('sha1', token).update(Buffer.from(datos, 'utf-8')).digest('base64')
  return esperado === firma
}

function twiml(mensaje: string) {
  const escapado = mensaje
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapado}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text()
  const params = Object.fromEntries(new URLSearchParams(bodyText))

  const firma = req.headers.get('x-twilio-signature')
  const url = process.env.WHATSAPP_WEBHOOK_URL || req.nextUrl.href
  if (process.env.TWILIO_AUTH_TOKEN && !validarFirmaTwilio(url, params, firma)) {
    return new NextResponse('Firma invalida', { status: 403 })
  }

  const from = params.From ?? ''
  const texto = (params.Body ?? '').trim()
  const owner = process.env.WHATSAPP_OWNER_NUMBER

  if (!owner || from !== owner) {
    return twiml('Este numero no esta autorizado.')
  }
  if (!texto) {
    return twiml('Mandame algo como "gaste 5mil en el super".')
  }

  const origin = new URL(req.url).origin
  const res = await fetch(`${origin}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: texto }] }),
  })
  const data = await res.json()

  const TIPOS = ['gasto_variable', 'gasto_fijo', 'ingreso_fijo', 'ingreso_freelance', 'inversion']
  if (!TIPOS.includes(data.tipo)) {
    return twiml(data.mensaje || 'No entendi, podes reformularlo?')
  }

  const uid = process.env.WHATSAPP_USER_ID
  if (!uid) {
    return twiml('Falta configurar el usuario. Avisale a Mati.')
  }

  const supabase = createAdminClient()
  const d = data.datos ?? {}
  let error

  if (data.tipo === 'gasto_variable') {
    const tarjeta_id = await resolverTarjetaId(supabase, uid, d.medio_pago)
    const { error: e } = await supabase.from('gastos_variables').insert({
      user_id: uid, nombre: d.nombre, monto: d.monto,
      categoria: d.categoria, fecha: d.fecha, es_gasto_hormiga: false,
      tarjeta_id,
    })
    error = e
  } else if (data.tipo === 'gasto_fijo') {
    const { error: e } = await supabase.from('gastos_fijos').insert({
      user_id: uid, nombre: d.nombre, monto: d.monto,
      categoria: d.categoria ?? 'servicios', activo: true,
    })
    error = e
  } else if (data.tipo === 'ingreso_fijo') {
    const { data: existentes } = await supabase
      .from('ingresos_fijos')
      .select('id')
      .eq('user_id', uid)
      .eq('activo', true)
      .ilike('nombre', d.nombre ?? '')
    if (existentes && existentes.length > 0) {
      const { error: e } = await supabase.from('ingresos_fijos')
        .update({ monto_cobrado: d.monto })
        .eq('id', existentes[0].id)
      error = e
    } else {
      const { error: e } = await supabase.from('ingresos_fijos').insert({
        user_id: uid, nombre: d.nombre, monto: d.monto,
        monto_cobrado: d.monto, activo: true,
      })
      error = e
    }
  } else if (data.tipo === 'ingreso_freelance') {
    const { error: e } = await supabase.from('ingresos_freelance').insert({
      user_id: uid, cliente: d.cliente ?? d.nombre, descripcion: d.descripcion ?? d.nombre,
      monto_total: d.monto_total ?? d.monto, monto_cobrado: 0, fecha: d.fecha,
    })
    error = e
  } else if (data.tipo === 'inversion') {
    const { error: e } = await supabase.from('inversiones').insert({
      user_id: uid, nombre: d.nombre, monto: d.monto,
      tipo: d.tipo ?? 'otro', moneda: d.moneda ?? 'ARS',
      nivel_riesgo: d.nivel_riesgo ?? 'conservador', app: 'WhatsApp',
    })
    error = e
  }

  if (error) {
    return twiml('Uy, no pude guardarlo. Proba de nuevo en un rato.')
  }

  return twiml(`✅ ${data.mensaje}`)
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
