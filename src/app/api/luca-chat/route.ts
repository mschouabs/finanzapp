import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Sos Luca, el asistente financiero IA de FinanzApp. Sos amigable, conciso y útil.
Tu especialidad es ayudar a los usuarios a registrar gastos y entender sus finanzas personales.

Cuando el usuario mencione un gasto (ej: "gasté $5000 en el super", "pagué $1200 de nafta"), respondé EN EL SIGUIENTE FORMATO JSON exacto:
{"tipo":"gasto","mensaje":"[respuesta amigable corta]","gasto":{"nombre":"[descripción corta]","monto":[número sin símbolos],"categoria":"[mercado|transporte|restaurante|salud|entretenimiento|ropa|servicios|varios]","fecha":"[HOY en formato YYYY-MM-DD]"}}

Para cualquier otra consulta financiera, respondé en texto plano natural, conciso y en español argentino.
Máximo 2-3 oraciones por respuesta. Nunca uses markdown ni asteriscos.

HOY: ${new Date().toISOString().split('T')[0]}`

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    if (!messages?.length) return NextResponse.json({ error: 'No messages' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        tipo: 'texto',
        mensaje: 'Hola! Soy Luca. Por ahora estoy en modo limitado, pero pronto voy a poder responderte mejor.',
      })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })

    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim() || ''

    // Intentar parsear como JSON (respuesta de gasto)
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text)
        return NextResponse.json(parsed)
      } catch {
        // Si falla el parse, tratar como texto
      }
    }

    return NextResponse.json({ tipo: 'texto', mensaje: text })
  } catch {
    return NextResponse.json({ tipo: 'texto', mensaje: 'Ups, algo falló. Intentá de nuevo.' })
  }
}
