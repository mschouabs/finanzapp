import { NextRequest, NextResponse } from 'next/server'
import { detectarMoneda, extraerCuotas, parsear, parsearVarios } from '@/lib/parser'
import { detectarFormaPago, detectarMedioPago } from '@/lib/tarjetas'

function getToday() {
  return new Date().toISOString().split('T')[0]
}

async function callAnthropic(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 500,
  model = 'claude-haiku-4-5-20251001',
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
        model,
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
MEDIOS DE PAGO: no los uses para el nombre ni la categoría (mp, mercado pago, naranja x, uala, brubank, débito, crédito, tarjeta, efectivo). El sistema los detecta aparte.
CATEGORÍAS: mercado|comida|transporte|farmacia|ocio|ropa|personal|impuesto|tecnologia|regalo|varios
MONEDA: si el mensaje dice "dólares", "USD" o "u$s", el gasto es en esa moneda ("moneda":"USD"); si no aclara nada, es en pesos ("moneda":"ARS"). Un gasto puntual pagado en dólares sigue siendo gasto_variable, NO inversion (inversion es solo cuando compra/invierte esos dólares para guardarlos).

SECCIONES:
1. gasto_variable -> gasto puntual, en pesos o dólares (DEFAULT)
2. gasto_fijo -> recurrente mensual (alquiler, expensas, servicios)
3. ingreso_fijo -> sueldo, jubilación
4. ingreso_freelance -> changa, proyecto, comisión
5. inversion -> comprar/guardar plazo fijo, cripto, acciones, dólares para invertir

RESPUESTA: JSON válido sin markdown.
{"tipo":"gasto_variable","mensaje":"...","datos":{"nombre":"...","monto":0,"categoria":"...","fecha":"${today}","moneda":"ARS","es_gasto_hormiga":false}}
{"tipo":"gasto_fijo","mensaje":"...","datos":{"nombre":"...","monto":0,"categoria":"servicios","activo":true}}
{"tipo":"ingreso_fijo","mensaje":"...","datos":{"nombre":"...","monto":0,"activo":true}}
{"tipo":"ingreso_freelance","mensaje":"...","datos":{"cliente":"...","descripcion":"...","monto_total":0,"fecha":"${today}"}}
{"tipo":"inversion","mensaje":"...","datos":{"nombre":"...","monto":0,"tipo":"fondo|plazo_fijo|cripto|acciones|otro","moneda":"ARS|USD","nivel_riesgo":"conservador|moderado|alto"}}
Si no hay transacción: texto plano máx 2 oraciones.
HOY: ${today}`
}

async function handleChat(messages: { role: string; content: string }[]) {
  const ultimo: string = messages[messages.length - 1]?.content ?? ''

  /* Varios movimientos en un solo mensaje ("gasté 5mil en super y
     3mil en nafta") -> se resuelven 100% local, sin llamar a la IA. */
  const varios = parsearVarios(ultimo)
  if (varios) {
    return NextResponse.json({
      tipo: 'multiple',
      mensaje: `Encontré ${varios.length} movimientos, revisalos:`,
      registros: varios,
    })
  }

  const local = parsear(ultimo)

  /* La IA solo interviene cuando el parser local no pudo clasificar
     nada (tipo === 'texto') o cuando clasificó como gasto pero no
     reconoció la categoría (quedó en "varios", señal de que el texto
     tenía jerga o una frase que las reglas no cubren). El resto de
     los mensajes se resuelve 100% local, sin costo ni red. */
  const necesitaAyuda =
    local.tipo === 'texto' ||
    (local.tipo === 'gasto_variable' && local.datos?.categoria === 'varios')
  if (!necesitaAyuda) return NextResponse.json(local)

  const today = getToday()
  const text = await callAnthropic(buildChatPrompt(today), messages, 500, 'claude-sonnet-5')
  if (!text) return NextResponse.json(local)
  const cleaned = cleanJson(text)
  const inicio = cleaned.indexOf('{')
  const fin = cleaned.lastIndexOf('}')
  if (inicio !== -1 && fin > inicio) {
    try {
      const parsed = JSON.parse(cleaned.slice(inicio, fin + 1))
      if (parsed?.tipo) {
        /* La IA no se ocupa del medio de pago: lo agrega el detector
           local para que el gasto quede asociado a la tarjeta/app. */
        const medio = detectarMedioPago(ultimo)
        if (parsed.tipo === 'gasto_variable' && medio) {
          parsed.datos = { ...(parsed.datos ?? {}), ...medioDe(ultimo) }
          if (typeof parsed.mensaje === 'string' && !parsed.mensaje.includes(medio)) {
            parsed.mensaje = parsed.mensaje.replace(/\.?\s*$/, '') + ` (con ${medio}).`
          }
        }
        /* Si la IA no aclaró la moneda (o la contestó mal), se cae al
           detector local: así el gasto nunca queda "sin moneda". */
        if (parsed.tipo === 'gasto_variable' && parsed.datos && !parsed.datos.moneda) {
          parsed.datos.moneda = detectarMoneda(ultimo)
        }
        return NextResponse.json(parsed)
      }
    } catch { /* fall through */ }
  }
  return NextResponse.json({ tipo: 'texto', mensaje: text || local.mensaje })
}

const PARSE_PROMPT = `Sos un asistente financiero argentino. Devolvé SOLO JSON válido:
{"nombre":"string (máx 50)","monto":number|null,"categoria":"mercado|comida|transporte|farmacia|ocio|ropa|personal|impuesto|tecnologia|regalo|varios","fecha":"YYYY-MM-DD","moneda":"ARS|USD"}
El nombre describe qué se compró; NO incluyas el medio de pago (mercado pago, naranja x, uala, tarjeta, débito…).
"moneda" es "USD" solo si el texto dice explícitamente dólares/USD/u$s; si no aclara nada, es "ARS".
Flores, bombones o algo "para mi novia/mamá" es "regalo".`

/* Medio de pago detectado localmente: la IA no lo devuelve, así que
   se agrega siempre a la respuesta de /api/ai {text}. */
function medioDe(text: string) {
  const medio = detectarMedioPago(text)
  const cuotas = extraerCuotas(text)
  return {
    ...(medio ? { medio_pago: medio, forma_pago: cuotas ? 'credito' : detectarFormaPago(text, medio) } : {}),
    ...(cuotas ? { cuotas: cuotas.cuotas } : {}),
  }
}

function parsearLocal(text: string, today: string) {
  const r = parsear(text, new Date(today + 'T12:00:00'))
  return {
    nombre: r.datos?.nombre ?? text.slice(0, 50),
    monto: r.datos?.monto ?? null,
    categoria: r.datos?.categoria ?? 'varios',
    fecha: r.datos?.fecha ?? today,
    moneda: r.datos?.moneda ?? detectarMoneda(text),
    ...medioDe(text),
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
    /* con "N cuotas de $X" la IA suele devolver el monto de la cuota:
       el total lo calcula el parser local */
    const porCuota = extraerCuotas(text)?.montoEsPorCuota
    return NextResponse.json({
      nombre: parsed.nombre || local.nombre,
      monto: porCuota ? local.monto : typeof parsed.monto === 'number' ? parsed.monto : local.monto,
      categoria: parsed.categoria || local.categoria || 'varios',
      fecha: parsed.fecha || today,
      moneda: parsed.moneda === 'USD' || parsed.moneda === 'ARS' ? parsed.moneda : local.moneda,
      ...medioDe(text),
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
