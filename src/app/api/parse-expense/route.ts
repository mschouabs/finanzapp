import { NextRequest, NextResponse } from 'next/server'

// ─── Parser local (regex) — fallback sin API key ───────────────────────────
function parsearLocal(text: string, today: string) {
  const t = text.toLowerCase()

  // Extraer monto: $18.500 | $18,500 | 18500
  let monto: number | null = null
  const montoMatch = text.match(/\$\s*([\d]+(?:[.,]\d{3})*(?:[.,]\d{0,2})?)|(\b[\d]+(?:[.,]\d{3})+(?:[.,]\d{0,2})?)|(\b[\d]{3,}(?:[.,]\d{0,2})?\b)/)
  if (montoMatch) {
    const raw = (montoMatch[1] || montoMatch[2] || montoMatch[3] || '')
      .replace(/\./g, '')
      .replace(',', '.')
    const n = parseFloat(raw)
    if (!isNaN(n) && n > 0) monto = n
  }

  // Categoría por palabras clave
  let categoria = 'varios'
  if (/mercado|supermercado|super|verdulería|verduleria|carnicería|carniceria|almacén|almacen/.test(t)) categoria = 'mercado'
  else if (/comida|resto\b|restaurant|delivery|pizza|sushi|empanada|cena|almuerzo|desayuno|café|cafe|mcdonald|burger|hamburguesa/.test(t)) categoria = 'comida'
  else if (/uber|taxi|subte|colectivo|bus|nafta|peaje|estacionamiento|remis|combustible|tren/.test(t)) categoria = 'transporte'
  else if (/farmacia|médico|medico|doctor|hospital|consulta|análisis|analisis|remedio|medicamento/.test(t)) categoria = 'farmacia'
  else if (/cine|teatro|netflix|spotify|disney|prime|juego|game|fiesta|bar|boliche|recital/.test(t)) categoria = 'ocio'
  else if (/ropa|zapatilla|camisa|pantalon|vestido|calzado|jean|remera|saco|campera/.test(t)) categoria = 'ropa'
  else if (/monotributo|impuesto|afip|agip|arba|rentas|iva|ingresos brutos/.test(t)) categoria = 'impuesto'
  else if (/celular|computadora|compu|laptop|tablet|tecnolog|electr[oó]nic|auricular/.test(t)) categoria = 'tecnologia'
  else if (/regalo|presente|cumpleaños|cumpleanos/.test(t)) categoria = 'regalo'
  else if (/gym|gimnasio|peluquería|peluqueria|belleza|manicura|masaje|barbería/.test(t)) categoria = 'personal'

  // Nombre: quitar monto y palabras de relleno
  const sinMonto = text
    .replace(/\$\s*[\d]+(?:[.,]\d{3})*(?:[.,]\d{0,2})?/g, '')
    .replace(/\b[\d]+(?:[.,]\d{3})+(?:[.,]\d{0,2})?\b/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s*(pesos|ars)\b/gi, '')
    .trim()

  const nombre = sinMonto
    .replace(/^(gasté|gaste|pagué|pague|compré|compre|me cobr\w+|salió|salio|fue\s+de?|en\s+|de\s+|por\s+|un\s+|una\s+|el\s+|la\s+)\s*/i, '')
    .trim()
    .slice(0, 50) || text.slice(0, 50)

  return {
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    monto,
    categoria,
    fecha: today,
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
