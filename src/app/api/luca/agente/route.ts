import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
    name: 'consultar_viajes',
    description: 'Lee la sección Planificación → Viajes (solo lectura): cada viaje con destino, fechas, presupuesto, total gastado en pesos y sus gastos. Usala SIEMPRE que pregunten por viajes o por lo gastado/presupuestado en un viaje: esos gastos NO están en buscar_movimientos.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Parte del nombre o destino del viaje (opcional; sin texto devuelve todos)' },
      },
    },
  },
  {
    name: 'revisar_cuentas',
    description: 'Diagnóstico de datos (solo lectura): cuentas cuyo saldo no coincide con el libro de movimientos, gastos posiblemente duplicados, consumos de crédito sin tarjeta y gastos de débito sin cuenta. Usala cuando el usuario diga que algo "no cuadra", un saldo está raro o sospeche un error.',
    input_schema: { type: 'object', properties: {} },
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
    description: 'Propone agregar un gasto fijo mensual (alquiler, servicio) o una suscripción (Netflix, Spotify, ChatGPT: usá es_suscripcion=true).',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' }, monto: { type: 'number' }, categoria: { type: 'string' }, es_suscripcion: { type: 'boolean' } },
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
    name: 'registrar_me_deben',
    description: 'Propone anotar plata que alguien le debe al usuario (ej: la parte de un Airbnb, un préstamo). No es un gasto ni un ingreso.',
    input_schema: {
      type: 'object',
      properties: {
        persona: { type: 'string' },
        concepto: { type: 'string' },
        monto: { type: 'number' },
        moneda: { type: 'string', enum: ['ARS', 'USD'] },
        vence: { type: 'string', description: 'YYYY-MM-DD, solo si el usuario dio una fecha' },
      },
      required: ['persona', 'monto'],
    },
  },
  {
    name: 'registrar_cobro_me_deben',
    description: 'Propone registrar que alguien le pagó (total o parcial) lo que le debía al usuario. Usá el id de la deuda y el id de la cuenta donde entró la plata (misma moneda que la deuda).',
    input_schema: {
      type: 'object',
      properties: {
        deuda_id: { type: 'string' },
        cuenta_id: { type: 'string' },
        monto: { type: 'number', description: 'Lo que pagó; si pagó todo, el pendiente completo' },
      },
      required: ['deuda_id', 'cuenta_id', 'monto'],
    },
  },
  {
    name: 'editar_gasto',
    description: 'Propone corregir un gasto ya cargado (nombre, monto, categoría o fecha). Usá el id que devuelve buscar_movimientos. Si salió de una billetera, el saldo se ajusta por la diferencia.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, nombre: { type: 'string' }, monto: { type: 'number' }, categoria: { type: 'string' }, fecha: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['id'],
    },
  },
  {
    name: 'borrar_gasto',
    description: 'Propone borrar un gasto cargado por error o duplicado (si salió de una billetera, la plata vuelve). Usá el id de buscar_movimientos. compra_completa=true borra todas las cuotas de esa compra.',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, compra_completa: { type: 'boolean' } }, required: ['id'] },
  },
  {
    name: 'corregir_saldo',
    description: 'Propone ajustar el saldo de una cuenta al valor real que dice el usuario (queda anotado en el libro como ajuste). Usá el id de la cuenta del contexto. Solo si el usuario confirma cuál es el saldo real.',
    input_schema: {
      type: 'object',
      properties: { cuenta_id: { type: 'string' }, saldo_real: { type: 'number' }, motivo: { type: 'string' } },
      required: ['cuenta_id', 'saldo_real'],
    },
  },
  {
    name: 'reportar_problema',
    description: 'Guarda un reporte de problema para que lo revise el equipo de la app. Usala solo cuando no puedas resolver el problema con tus herramientas, o si el usuario lo pide. Resumí qué pasó y qué ya se intentó.',
    input_schema: {
      type: 'object',
      properties: { resumen: { type: 'string', description: 'Título corto' }, detalle: { type: 'string', description: 'Qué pasó, qué esperaba el usuario y qué se revisó' } },
      required: ['resumen', 'detalle'],
    },
  },
  {
    name: 'deshacer_ultimo_movimiento',
    description: 'Propone deshacer el último movimiento de plata que se puede deshacer (gasto, transferencia o ajuste).',
    input_schema: { type: 'object', properties: {} },
  },
]

const ACCIONES = new Set(['registrar_gasto', 'registrar_ingreso', 'registrar_gasto_fijo', 'transferir', 'pagar_tarjeta', 'registrar_me_deben', 'registrar_cobro_me_deben', 'deshacer_ultimo_movimiento', 'editar_gasto', 'borrar_gasto', 'corregir_saldo', 'reportar_problema'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function diagnostico(supabase: SupabaseClient<any, any, any>): Promise<string> {
  const out: Record<string, unknown> = {}
  const { data: ctl, error: e1 } = await supabase.from('movimientos_control').select('nombre, app, saldo, suma_libro, diferencia')
  out.cuentas_que_no_cuadran = e1 ? 'no se pudo verificar' : (ctl ?? []).filter((r: { diferencia: number }) => Math.abs(Number(r.diferencia)) > 0.005)
  const desde = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const { data: gs } = await supabase.from('gastos_variables')
    .select('id, nombre, monto, moneda, fecha, forma_pago, tarjeta_id, billetera_linea_id, compra_id, cuota_numero')
    .gte('fecha', desde).order('fecha', { ascending: false }).limit(600)
  const filas = (gs ?? []) as { id: string; nombre: string; monto: number; moneda: string; fecha: string; forma_pago: string | null; tarjeta_id: string | null; billetera_linea_id: string | null; compra_id: string | null; cuota_numero: number | null }[]
  const grupos = new Map<string, typeof filas>()
  for (const g of filas) {
    if (g.compra_id && (g.cuota_numero ?? 1) > 1) continue
    const k = `${g.nombre.trim().toLowerCase()}|${g.monto}|${g.moneda}|${g.fecha}`
    grupos.set(k, [...(grupos.get(k) ?? []), g])
  }
  out.posibles_duplicados = [...grupos.values()].filter(v => v.length > 1).slice(0, 10)
    .map(v => ({ nombre: v[0].nombre, monto: v[0].monto, fecha: v[0].fecha, ids: v.map(x => x.id) }))
  out.credito_sin_tarjeta = filas.filter(g => g.forma_pago === 'credito' && !g.tarjeta_id).slice(0, 10).map(g => ({ id: g.id, nombre: g.nombre, monto: g.monto, fecha: g.fecha }))
  out.debito_sin_cuenta = filas.filter(g => g.forma_pago === 'debito' && !g.billetera_linea_id).slice(0, 10).map(g => ({ id: g.id, nombre: g.nombre, monto: g.monto, fecha: g.fecha }))
  return JSON.stringify(out)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function consultarViajes(supabase: SupabaseClient<any, any, any>, texto: string): Promise<string> {
  const { data: vs, error } = await supabase.from('viajes')
    .select('id, nombre, destino, fecha_inicio, fecha_fin, presupuesto, archivado, notas')
    .order('fecha_inicio', { ascending: false, nullsFirst: false }).limit(30)
  if (error) return 'No se pudo consultar.'
  const t = texto.trim().toLowerCase()
  const viajes = ((vs ?? []) as { id: string; nombre: string; destino: string | null; fecha_inicio: string | null; fecha_fin: string | null; presupuesto: number | null; archivado: boolean; notas: string | null }[])
    .filter(v => !t || `${v.nombre} ${v.destino ?? ''}`.toLowerCase().includes(t))
  if (!viajes.length) return JSON.stringify({ viajes: [], aviso: 'No hay viajes cargados' + (t ? ' que coincidan' : '') })
  const { data: gs } = await supabase.from('viaje_gastos')
    .select('viaje_id, concepto, categoria, monto, moneda, tipo_cambio, monto_ars, fecha')
    .in('viaje_id', viajes.map(v => v.id)).order('fecha', { ascending: false }).limit(400)
  const filas = (gs ?? []) as { viaje_id: string; concepto: string; categoria: string; monto: number; moneda: string; tipo_cambio: number; monto_ars: number; fecha: string }[]
  return JSON.stringify({
    viajes: viajes.map(v => {
      const g = filas.filter(x => x.viaje_id === v.id)
      const total = g.reduce((a, x) => a + Number(x.monto_ars || 0), 0)
      return {
        ...v, id: undefined,
        gastado_ars: Math.round(total),
        restante_ars: v.presupuesto != null ? Math.round(Number(v.presupuesto) - total) : null,
        cantidad_gastos: g.length,
        gastos: g.slice(0, 40).map(x => ({ concepto: x.concepto, categoria: x.categoria, monto: x.monto, moneda: x.moneda, monto_ars: x.monto_ars, fecha: x.fecha })),
      }
    }),
  })
}

const GUIA_APP = `GUÍA DE LA APP (usala para explicar cómo funciona; si algo no está acá, decí que no estás segura y ofrecé reportarlo):
- Resumen (inicio): "Libre para usar" = disponible − comprometido de los próximos 30 días (tarjetas, fijos pendientes, cuotas). Patrimonio neto = billeteras + inversiones − deuda de tarjetas, en pesos al dólar blue.
- Planificación → Viajes: cada viaje tiene presupuesto en pesos y sus propios gastos (en cualquier moneda, convertidos a pesos). Están separados de Movimientos: para leerlos usá consultar_viajes. Todavía no podés cargar gastos de viaje por el chat: indicale que lo haga desde el viaje.
- Movimientos: gastos variables. Se cargan con "Registrar" o hablándome. Los de crédito van a una tarjeta y al resumen según su fecha de cierre/vencimiento; los de débito descuentan de una billetera.
- Gastos fijos: mensuales; "Pagado/Pendiente" marca si ya se debitó. Las suscripciones son fijos con tipo propio. Suman igual al gasto del mes.
- Billeteras: cuentas, inversiones y saldos. Las transferencias entre cuentas se hacen ahí y quedan en el libro.
- Tarjetas: resúmenes por tarjeta, cierre y vencimiento; "Pagar" descuenta de una cuenta y marca los consumos pagados.
- Me deben: plata que otros te deben. No es ingreso ni patrimonio hasta que la cobrás.
- Historial: todo lo que pasó, incluido "Entre cuentas" (transferencias, pagos de tarjeta y ajustes).
- Libro de movimientos: cada cambio de saldo queda anotado; si una cuenta no cuadra es que su saldo no coincide con la suma del libro.
- Ojo de privacidad: oculta los montos con ***. Atajo: tecla P.
- Deshacer: se puede deshacer el último gasto, transferencia o ajuste.`

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
- SOPORTE: si el usuario dice que algo está mal, no cuadra o no entiende un número, primero usá revisar_cuentas y/o buscar_movimientos para encontrar la causa, explicala en simple y proponé la corrección (editar_gasto, borrar_gasto, corregir_saldo). Nunca corrijas nada sin explicar antes qué encontraste. Si no lográs resolverlo, ofrecé reportar_problema.
- Hoy es ${hoy}. "Ayer", "el viernes", etc. se resuelven contra esa fecha.`,
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: GUIA_APP, cache_control: { type: 'ephemeral' } },
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
          let q = supabase.from('gastos_variables').select('id, nombre, monto, moneda, fecha, categoria, forma_pago, pagado, cuota_numero, cuotas_total, compra_id')
            .order('fecha', { ascending: false }).limit(Math.min(Number(input.limite) || 30, 60))
          if (typeof input.texto === 'string' && input.texto.trim()) q = q.ilike('nombre', `%${input.texto.trim().replace(/[%,]/g, '')}%`)
          if (typeof input.desde === 'string') q = q.gte('fecha', input.desde)
          if (typeof input.hasta === 'string') q = q.lte('fecha', input.hasta)
          const { data, error } = await q
          salida = error ? 'No se pudo consultar.' : JSON.stringify(data ?? [])
        } else if (nombre === 'consultar_viajes') {
          salida = await consultarViajes(supabase, typeof input.texto === 'string' ? input.texto : '')
        } else if (nombre === 'revisar_cuentas') {
          salida = await diagnostico(supabase)
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
