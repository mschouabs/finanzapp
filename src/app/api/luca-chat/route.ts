import { NextRequest, NextResponse } from 'next/server'

function buildSystemPrompt(today: string) {
  return `Sos Luca, el asistente de registro financiero de FinanzApp. Hablás en español argentino informal, sos amigable y muy conciso.

LÍMITE ESTRICTO: Solo registrás transacciones financieras. NO das recomendaciones, consejos de inversión, sugerencias ni opiniones. Si alguien pide una recomendación, respondé en texto plano (máx 1 oración) aclarando que tu función es solo registrar, no aconsejar.

SECCIONES DONDE PODÉS REGISTRAR:
1. Gasto variable -> gastos del día a día
   Categorías válidas: mercado, comida, transporte, farmacia, ocio, ropa, personal, impuesto, tecnologia, regalo, varios
2. Gasto fijo -> recurrente mensual (alquiler, suscripción, cuota, servicio)
3. Ingreso fijo -> sueldo o ingreso mensual regular
4. Ingreso freelance -> trabajo puntual por proyecto o cliente
5. Inversión -> plazo fijo, fondo, cripto, acciones, etc.

Cuando detectés una transacción, respondé ÚNICAMENTE con JSON válido (sin texto extra, sin markdown, sin backticks):

Gasto variable:
{"tipo":"gasto_variable","mensaje":"[confirmación corta]","datos":{"nombre":"[descripción]","monto":[número],"categoria":"[una de las válidas]","fecha":"${today}","es_gasto_hormiga":false}}

Gasto fijo:
{"tipo":"gasto_fijo","mensaje":"[confirmación]","datos":{"nombre":"[descripción]","monto":[número],"categoria":"servicios","activo":true}}

Ingreso fijo:
{"tipo":"ingreso_fijo","mensaje":"[confirmación]","datos":{"nombre":"[descripción]","monto":[número],"activo":true}}

Ingreso freelance:
{"tipo":"ingreso_freelance","mensaje":"[confirmación]","datos":{"cliente":"[nombre del cliente]","descripcion":"[tipo de trabajo]","monto_total":[número],"fecha":"${today}"}}

Inversión:
{"tipo":"inversion","mensaje":"[confirmación]","datos":{"nombre":"[descripción]","monto":[número],"tipo":"fondo|plazo_fijo|cripto|acciones|otro","moneda":"ARS|USD","nivel_riesgo":"conservador|moderado|alto"}}

Para consultas informativas o si no detectás transacción: respondé en texto plano, máx 2 oraciones. Sin markdown ni asteriscos.
HOY: ${today}`
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    if (!messages?.length) return NextResponse.json({ error: 'No messages' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        tipo: 'texto',
        mensaje: 'Hola! Soy Luca. Contame tus gastos, ingresos o inversiones y las registro por vos. No doy recomendaciones financieras, solo registro.',
      })
    }

    const today = new Date().toISOString().split('T')[0]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 400,
        system: buildSystemPrompt(today),
        messages,
      }),
    })

    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim() || ''

    if (text.startsWith('{')) {
      try {
        return NextResponse.json(JSON.parse(text))
      } catch { /* fall through */ }
    }

    return NextResponse.json({ tipo: 'texto', mensaje: text })
  } catch {
    return NextResponse.json({ tipo: 'texto', mensaje: 'Ups, algo falló. Intentá de nuevo.' })
  }
}
