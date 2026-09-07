import { NextRequest, NextResponse } from 'next/server'
import { parsear } from '@/lib/parser'

function getToday() {
  return new Date().toISOString().split('T')[0]
}

async function callAnthropic(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 500,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() ?? null
  } catch {
    return null
  }
}

function cleanJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}

function buildChatPrompt(today: string) {
  return `Sos Luca, asistente de registro financiero. Español argentino informal, conciso.
Solo registrás transacciones. NO das consejos de inversión.

MONTOS: "20mil"/"20k" -> 20000 | "2 palos" -> 2000000 | "medio palo" -> 500000
MEDIOS DE PAGO (IGNORAR): mp, débito, crédito, tarjeta, efectivo, uala, brubank.
CATEGORÍAS: mercado|comida|transporte|farmacia|ocio|ropa|personal|impuesto|tecnologia|regalo|varios

SECCIONES:
1. gasto_variable -> gasto puntual (DEFAULT)
2. gasto_fijo -> recurrente mensual (alquiler, expensas, servicios)
3. ingreso_fijo -> sueldo, jubilación
4. ingreso_freelance -> changa, proyecto, comisión
5. inversion -> plazo fijo, cripto, acciones, dólares

RESPUESTA: JSON válido sin markdown.
{"tipo":"gasto_variable","mensaje":"...","datos":{"nombre":"...","monto":0,"categoria":"...","fecha":"${today}","es_gasto_hormiga":false}}
{"tipo":"gasto_fijo","mensaje":"...","datos":{"nombre":"...","monto":0,"categoria":"servicios","activo":true}}
{"tipo":"ingreso_fijo","mensaje":"...","datos":{"nombre":"...","monto":0,"activo":true}}
{"tipo":"ingreso_freelance","mensaje":"...","datos":{"cliente":"...","descripcion":"...","monto_total":0,"fecha":"${today}"}}
{"tipo":"inversion","mensaje":"...","datos":{"nombre":"...","monto":0,"tipo":"fondo|plazo_fijo|cripto|acciones|otro","moneda":"ARS|USD","nivel_riesgo":"conservador|moderado|alto"}}
Si no hay transacción: texto plano máx 2 oraciones.
HOY: ${today}`
}

async function handleChat(messages: { role: string; content: string }[]) {
  const ultimo: string = messages[messages.length - 1]?.content ?? ''
  const local = parsear(ultimo)
  if (local.tipo !== 'texto') return NextResponse.json(local)
  const today = getToday()
  const text = await callAnthropic(buildChatPrompt(today), messages)
  if (!text) return NextResponse.json(local)
  const cleaned = cleanJson(text)
  const inicio = cleaned.indexOf('{')
  const fin = cleaned.lastIndexOf('}')
  if (inicio !== -1 && fin > inicio) {
    try {
      const parsed = JSON.parse(cleaned.slice(inicio, fin + 1))
      if (parsed?.tipo) return NextResponse.json(parsed)
    } catch { /* fall through */ }
  }
  return NextResponse.json({ tipo: 'texto', mensaje: text || local.mensaje })
}

const PARSE_PROMPT = `Sos un asistente financiero argentino. Devolvé SOLO JSON válido:
{"nombre":"string (máx 50)","monto":number|null,"categoria":"mercado|comida|transporte|farmacia|ocio|ropa|personal|impuesto|tecnologia|regalo|varios","fecha":"YYYY-MM-DD"}`

function parsearLocal(text: string, today: string) {
  const r = parsear(text, new Date(today + 'T12:00:00'))
  return {
    nombre: r.datos?.nombre ?? text.slice(0, 50),
    monto: r.datos?.monto ?? null,
    categoria: r.datos?.categoria ?? 'varios',
    fecha: r.datos?.fecha ?? today,
  }
}

async function handleParse(text: string) {
  const today = getToday()
  const local = parsearLocal(text, today)
  const prompt = PARSE_PROMPT + '\nHOY=' + today
  const raw = await callAnthropic(prompt, [{ role: 'user', content: text }], 200)
  if (!raw) return NextResponse.json(local)
  try {
    const parsed = JSON.parse(cleanJson(raw))
    return NextResponse.json({
      nombre: parsed.nombre || local.nombre,
      monto: typeof parsed.monto === 'number' ? parsed.monto : null,
      categoria: parsed.categoria || 'varios',
      fecha: parsed.fecha || today,
    })
  } catch {
    return NextResponse.json(local)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      return handleChat(body.messages)
    }
    if (typeof body.text === 'string' && body.text.trim()) {
      return handleParse(body.text.trim())
    }
    return NextResponse.json({ error: 'Se requiere messages[] o text' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
