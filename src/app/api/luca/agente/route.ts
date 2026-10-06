import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hoyArgentina } from '@/lib/fechas'

/* ── Luca con Claude ────────────────────────────────────────────────
   Recibe la conversación y un resumen de tu situación real (lo arma la
   app con tus datos). Claude responde con ese contexto y, si hace
   falta, usa herramientas:
     · de lectura (buscar movimientos): se ejecutan acá, con TU sesión.
     · de acción (registrar, transferir, pagar tarjeta, deshacer): NO
       se ejecutan acá. Se devuelven como propuestas y la app te pide
       confirmación antes de tocar tu plata.
   La clave de Anthropic vive solo en el servidor.                    */

export const maxDuration = 60

const MODELO_RAPIDO = 'claude-haiku-4-5-20251001'
const MODELO_FUERTE = 'claude-sonnet-5'
const MAX_VUELTAS = 4

type Msg = { role: 'user' | 'assistant'; content: string }
type Bloque = { type: string; [k: string]: unknown }

const HERRAMIENTAS = [
  {
    name: 'buscar_movimientos',
    description: 'Busca gastos cargados por texto y/o fechas. Usala cuando la pregunta necesite un detalle que no está en el contexto (ej: "¿cuánto gasté en Uber este año?"). Solo lectura.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Parte del nombre del gasto' },
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' },
        limite: { type: 'integer', description: 'Máximo de filas (por defecto 30, tope 60)' },
      },
    },
  },
  {
    name: 'registrar_gasto',
    description: 'Propone registrar un gasto puntual. El usuario lo confirma antes de guardarse.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        monto: { type: 'number', description: 'Monto total en la moneda indicada' },
        moneda: { type: 'string', enum: ['ARS', 'USD'] },
        categoria: { type: 'string', enum: ['mercado', 'comida', 'transporte', 'farmacia', 'ocio', 'ropa', 'personal', 'impuesto', 'tecnologia', 'regalo', 'varios'] },
        fecha: { type: 'string', description: 'YYYY-MM-DD; hoy si no se aclara' },
        medio_pago: { type: 'string', description: 'Nombre de la billetera o tarjeta, si se aclaró' },
        forma_pago: { type: 'string', enum: ['debito', 'credito'] },
        cuotas: { type: 'integer' },
      },
      required: ['nombre', 'monto'],
    },
  },
  {
    name: 'registrar_ingreso',
    description: 'Propone registrar un ingreso: sueldo/ingreso fijo cobrado o proyecto freelance.',
    input_schema: {
      type: 'object',
      properties: {
        clase: { type: 'string', enum: ['fijo', 'freelance'] },
        nombre: { type: 'string', description: 'Nombre del sueldo (fijo) o cliente (freelance)' },
        descripcion: { type: 'string' },
        monto: { type: 'number' },
        fecha: { type: 'string' },
      },
      required: ['clase', 'nombre', 'monto'],
    },
  },
  {
    name: 'registrar_gasto_fijo',
    description: 'Propone agregar un gasto fijo mensual (alquiler, suscripción, servicio).',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' }, monto: { type: 'number' }, categoria: { type: 'string' } },
      required: ['nombre', 'monto'],
    },
  },
  {
    name: 'transferir',
    description: 'Propone una transferencia entre dos cuentas. Usá los ids del contexto. Si cambia la moneda, indicá cuánto llega.',
    input_schema: {
      type: 'object',
      properties: {
        desde_id: { type: 'string' },
        hacia_id: { type: 'string' },
        monto_sale: { type: 'number', description: 'En la moneda de la cuenta de origen' },
        monto_llega: { type: 'number', description: 'En la moneda de la cuenta destino (igual a monto_sale si es la misma moneda)' },
        nota: { type: 'string' },
      },
      required: ['desde_id', 'hacia_id', 'monto_sale', 'monto_llega'],
    },
  },
  {
    name: 'pagar_tarjeta',
    description: 'Propone pagar el resumen pendiente de una tarjeta desde una cuenta. Usá los ids del contexto.',
    input_schema: {
      type: 'object',
      properties: {
        tarjeta_id: { type: 'string' },
        cuenta_pesos_id: { type: 'string', description: 'Cuenta en pesos de donde sale el pago' },
        cuenta_usd_id: { type: 'string', description: 'Cuenta en dólares, solo si el resumen tiene consumos en USD' },
      },
      required: ['tarjeta_id'],
    },
  },
  {
    name: 'deshacer_ultimo_movimiento',
    description: 'Propone deshacer el último movimiento de plata que se puede deshacer (gasto, transferencia o ajuste).',
    input_schema: { type: 'object', properties: {} },
  },
]

const ACCIONES = new Set(['registrar_gasto', 'registrar_ingreso', 'registrar_gasto_fijo', 'transferir', 'pagar_tarjeta', 'deshacer_ultimo_movimiento'])

function sistema(hoy: string, contexto: string) {
  return [
    {
      type: 'text',
      text: `Sos Luca, el asistente financiero personal de esta app. Hablás en español rioplatense, claro, cálido y breve (máximo 5 oraciones salvo que pidan detalle).

CÓMO TRABAJÁS
- Respondé SOLO con los datos del contexto que sigue. Si un dato no está, decilo ("no tengo cargado…"); nunca inventes números, saldos ni fechas.
- Mostrá las cuentas: cuando uses un número, que se entienda de dónde sale. Los montos van en pesos argentinos con separador de miles ($1.250.000); dólares como US$.
- Podés analizar la situación del usuario, comparar meses, estimar si le alcanza para algo y explicar el porqué. NO recomendás comprar o vender activos concretos ni prometés rendimientos; si te lo piden, explicá los pros y contras con sus números y aclarás que la decisión es suya.
- Para registrar o mover plata usá las herramientas de acción. Nunca digas que algo ya está hecho: las acciones quedan como propuesta y el usuario las confirma. Decí algo como "Te dejo esto para confirmar".
- Usá los ids exactos de cuentas y tarjetas del contexto. Si la petición es ambigua (no sabés qué cuenta), preguntá en una línea en vez de adivinar.
- Si el usuario cuenta varios movimientos en un mensaje, proponé una acción por cada uno.
- Si el mensaje no tiene que ver con sus finanzas, respondé breve y volvé al tema.
- Hoy es ${hoy}. "Ayer", "el viernes", etc. se resuelven contra esa fecha.`,
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: `CONTEXTO ACTUAL DEL USUARIO\n${contexto}` },
  ]
}

function elegirModelo(texto: string) {
  const t = texto.toLowerCase()
  const complejo = texto.length > 90 || /\?|cu[aá]nto|puedo|alcanza|conviene|por qu[eé]|compar|resumen|c[oó]mo (voy|est[aá])|an[aá]li|estim|proyec|ahorr/.test(t)
  return complejo ? MODELO_FUERTE : MODELO_RAPIDO
}

async function llamar(modelo: string, system: unknown, messages: { role: string; content: unknown }[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: modelo, max_tokens: 1000, system, tools: HERRAMIENTAS, messages }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  return (await res.json()) as { content: Bloque[]; stop_reason: string }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'sin_clave' }, { status: 503 })

  /* solo usuarios con sesión: la clave de Anthropic cuesta plata */
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })

  let body: { messages?: Msg[]; contexto?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json' }, { status: 400 }) }
  const historial = (body.messages ?? []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-14)
  if (!historial.length || historial[historial.length - 1].role !== 'user') return NextResponse.json({ error: 'mensajes' }, { status: 400 })
  const contexto = String(body.contexto ?? '').slice(0, 12000)

  const ultimo = historial[historial.length - 1].content.slice(0, 2000)
  const modelo = elegirModelo(ultimo)
  const system = sistema(hoyArgentina(), contexto)
  const mensajes: { role: string; content: unknown }[] = historial.map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  const acciones: { tool: string; input: Record<string, unknown> }[] = []

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await llamar(modelo, system, mensajes)
      const usos = r.content.filter(b => b.type === 'tool_use')
      if (r.stop_reason !== 'tool_use' || !usos.length) {
        const texto = r.content.filter(b => b.type === 'text').map(b => String(b.text ?? '')).join('\n').trim()
        return NextResponse.json({ mensaje: texto || (acciones.length ? 'Te dejo esto para confirmar.' : 'No pude armar una respuesta, ¿me lo decís de otra forma?'), acciones, modelo })
      }

      mensajes.push({ role: 'assistant', content: r.content })
      const resultados: Bloque[] = []
      for (const u of usos) {
        const input = (u.input ?? {}) as Record<string, unknown>
        const nombre = String(u.name)
        let salida = ''
        if (nombre === 'buscar_movimientos') {
          let q = supabase.from('gastos_variables').select('nombre, monto, moneda, fecha, categoria, forma_pago, pagado, cuota_numero, cuotas_total')
            .order('fecha', { ascending: false }).limit(Math.min(Number(input.limite) || 30, 60))
          if (typeof input.texto === 'string' && input.texto.trim()) q = q.ilike('nombre', `%${input.texto.trim().replace(/[%,]/g, '')}%`)
          if (typeof input.desde === 'string') q = q.gte('fecha', input.desde)
          if (typeof input.hasta === 'string') q = q.lte('fecha', input.hasta)
          const { data, error } = await q
          salida = error ? 'No se pudo consultar.' : JSON.stringify(data ?? [])
        } else if (ACCIONES.has(nombre)) {
          acciones.push({ tool: nombre, input })
          salida = 'Propuesta mostrada al usuario. NO está ejecutada: espera su confirmación.'
        } else {
          salida = 'Herramienta desconocida.'
        }
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: salida })
      }
      mensajes.push({ role: 'user', content: resultados })
    }
    return NextResponse.json({ mensaje: acciones.length ? 'Te dejo esto para confirmar.' : 'Me enredé con la consulta, ¿probamos de nuevo?', acciones, modelo })
  } catch {
    return NextResponse.json({ error: 'ia' }, { status: 502 })
  }
}
