import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Sos un asistente financiero argentino. El usuario te va a describir un gasto en lenguaje natural.
DevolvÃ© SOLO un JSON vÃ¡lido (sin markdown, sin texto extra) con estos campos:
- nombre: string (descripciÃ³n breve del gasto, mÃ¡x 50 chars)
- monto: number (el monto en pesos ARS; null si no se menciona o no se puede determinar)
- categoria: string (una de: mercado, comida, transporte, farmacia, ocio, ropa, personal, impuesto, tecnologia, regalo, varios)
- fecha: string (formato YYYY-MM-DD; hoy si no se especifica)

Ejemplos:
"gastÃ© 3500 en delivery" â {"nombre":"Delivery","monto":3500,"categoria":"comida","fecha":"HOY"}
"paguÃ© el monotributo" â {"nombre":"Monotributo","monto":null,"categoria":"impuesto","fecha":"HOY"}
"11000 de multa" â {"nombre":"Multa","monto":11000,"categoria":"varios","fecha":"HOY"}`

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text) return NextResponse.json({ error: 'No text' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    const prompt = SYSTEM_PROMPT.replaceAll('HOY', today)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Fallback: return just the text as nombre, no monto
      return NextResponse.json({ nombre: text, monto: null, categoria: 'varios', fecha: today })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: prompt,
        messages: [{ role: 'user', content: text }],
      }),
    })

    const data = await response.json()
    const raw = data.content?.[0]?.text || '{}'
    // Remove possible markdown fences
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({
      nombre: parsed.nombre || text,
      monto: parsed.monto ?? null,
      categoria: parsed.categoria || 'varios',
      fecha: parsed.fecha || today,
    })
  } catch (err) {
    const today = new Date().toISOString().split('T')[0]
    return NextResponse.json({ nombre: '', monto: null, categoria: 'varios', fecha: today })
  }
}
