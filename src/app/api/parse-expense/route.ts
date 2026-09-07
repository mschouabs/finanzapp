import { NextRequest, NextResponse } from 'next/server'
import { parsear } from '@/lib/parser'

// El parser local vive en src/lib/parser.ts y lo comparten
// esta ruta y /api/luca-chat. Ver ese archivo para la logica.
function parsearLocal(text: string, today: string) {
  const r = parsear(text, new Date(today + 'T12:00:00'))
  return {
    nombre: r.datos?.nombre ?? text.slice(0, 50),
    monto: r.datos?.monto ?? null,
    categoria: r.datos?.categoria ?? 'varios',
    fecha: r.datos?.fecha ?? today,
  }
}

// ─── System prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos un asistente financiero argentino. El usuario te va a describir un gasto en lenguaje natural.
Devolvé SOLO un JSON válido (sin markdown, sin texto extra) con estos campos:
- nombre: string (descripción breve del gasto, máx 50 chars)
- monto: number (el monto en pesos ARS; null si no se menciona)
- categoria: string (una de: mercado, comida, transporte, farmacia, ocio, ropa, personal, impuesto, tecnologia, regalo, varios)
- fecha: string (formato YYYY-MM-DD; hoy si no se especifica)

Ejemplos:
"gasté 3500 en delivery" → {"nombre":"Delivery","monto":3500,"categoria":"comida","fecha":"HOY"}
"pagué el monotributo" → {"nombre":"Monotributo","monto":null,"categoria":"impuesto","fecha":"HOY"}
"$18.500 cena con amigos" → {"nombre":"Cena con amigos","monto":18500,"categoria":"comida","fecha":"HOY"}`

// ─── Handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0]
  let text = ''

  try {
    const body = await req.json()
    text = body?.text || ''
    if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(parsearLocal(text, today))
    }

    const prompt = SYSTEM_PROMPT.replaceAll('HOY', today)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        system: prompt,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json(parsearLocal(text, today))
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const localFallback = parsearLocal(text, today)

    return NextResponse.json({
      nombre: parsed.nombre || localFallback.nombre,
      monto: typeof parsed.monto === 'number' ? parsed.monto : null,
      categoria: parsed.categoria || 'varios',
      fecha: parsed.fecha || today,
    })
  } catch {
    return NextResponse.json(parsearLocal(text, today))
  }
}
