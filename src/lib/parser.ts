/* ═══════════════════════════════════════════════════════════════
Parser local de transacciones — sin IA, sin costo, sin red.

Interpreta lenguaje natural argentino y devuelve un registro
listo para guardar. Es la fuente de verdad de /api/parse-expense
y el primer intento de /api/luca-chat.
═══════════════════════════════════════════════════════════════ */

import { detectarFormaPago, detectarMedioPago } from './tarjetas'

export type TipoRegistro =
  | 'gasto_variable'
  | 'gasto_fijo'
  | 'ingreso_fijo'
  | 'ingreso_freelance'
  | 'inversion'

export interface DatosRegistro {
  nombre?: string
  monto?: number
  monto_total?: number
  categoria?: string
  fecha?: string
  es_gasto_hormiga?: boolean
  activo?: boolean
  cliente?: string
  descripcion?: string
  tipo?: string
  moneda?: string
  nivel_riesgo?: string
  /** App o tarjeta con la que se pagó ("MercadoPago", "Naranja X"…). */
  medio_pago?: string
  /** 'debito' sale del saldo de la billetera, 'credito' va al resumen. */
  forma_pago?: 'debito' | 'credito'
  /** Cantidad de cuotas (compras con tarjeta). */
  cuotas?: number
}

export interface Resultado {
  tipo: TipoRegistro | 'texto'
  mensaje: string
  datos?: DatosRegistro
}

/* ── Normalización ──────────────────────────────────────────── */

function sinAcentos(t: string) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const norm = (t: string) => sinAcentos(t.toLowerCase())

/* ── Medios de pago: se descartan antes de clasificar ────────── */

const MEDIOS_PAGO = [
  'mercado pago', 'mercadopago', 'cuenta dni', 'modo', 'uala', 'ualá',
  'brubank', 'naranja x', 'naranja', 'personal pay', 'prex', 'lemon cash',
  'debito', 'credito', 'tarjeta', 'visa', 'mastercard', 'master', 'amex',
  'efectivo', 'transferencia', 'transferi', 'qr', 'cuotas', 'cuota sin interes',
  'mp',
]

function quitarMediosDePago(t: string) {
  let out = t
  for (const m of MEDIOS_PAGO) {
    out = out.replace(new RegExp(`\\b(con|por|en|via|usando|desde)?\\s*(la|el|mi|mis)?\\s*${m}\\b`, 'gi'), ' ')
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

/* ── Montos ─────────────────────────────────────────────────── */

const PALABRAS_NUMERO: Record<string, number> = {
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  cien: 100, ciento: 100, doscientos: 200, quinientos: 500, mil: 1000,
}

/** "1.234,56" | "1,234.56" | "1234" -> number */
function aNumero(bruto: string): number | null {
  let s = bruto.trim()
  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')

  if (tieneComa && tienePunto) {
    // el separador decimal es el que aparece último
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (tieneComa) {
    const [, dec] = s.split(',')
    // "1,5" -> decimal · "1,500" -> miles
    s = dec && dec.length === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (tienePunto) {
    const [, dec] = s.split('.')
    s = dec && dec.length === 3 ? s.replace(/\./g, '') : s
  }

  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export function extraerMonto(texto: string): number | null {
  const t = norm(texto)

  // "medio palo" / "medio millon"
  if (/\bmedio\s+(palo|millon)\b/.test(t)) return 500_000
  if (/\bmedia\s+luca\b/.test(t)) return 500

  // compuesto primero: "5 lucas con 500" -> 5500
  const compuesto = t.match(/(\d+)\s*(?:k\b|mil\b|lucas?\b|gambas?\b)\s+(?:con|y)\s+(\d+)/)
  if (compuesto) {
    return Number(compuesto[1]) * 1_000 + Number(compuesto[2])
  }

  // número + multiplicador: 20mil · 20 mil · 20k · 20 lucas · 2 palos · 1,2 millones
  const mult = t.match(
    /(\d+(?:[.,]\d+)?)\s*(k\b|mil\b|lucas?\b|gambas?\b|palos?\b|millon(?:es)?\b)/
  )
  if (mult) {
    const base = aNumero(mult[1])
    if (base !== null) {
      const u = mult[2]
      if (/^k\b|^mil\b|^lucas?\b|^gambas?\b/.test(u)) return Math.round(base * 1_000)
      if (/^palos?\b|^millon/.test(u)) return Math.round(base * 1_000_000)
    }
  }

  // palabra + multiplicador: "dos palos", "cinco lucas", "mil quinientos"
  const palabraMult = t.match(
    /\b([a-z]+)\s+(mil\b|lucas?\b|gambas?\b|palos?\b|millon(?:es)?\b)/
  )
  if (palabraMult && PALABRAS_NUMERO[palabraMult[1]] !== undefined) {
    const base = PALABRAS_NUMERO[palabraMult[1]]
    const u = palabraMult[2]
    const total = /^palos?\b|^millon/.test(u) ? base * 1_000_000 : base * 1_000
    // "mil quinientos" -> sumar el resto
    const resto = t.slice(t.indexOf(palabraMult[0]) + palabraMult[0].length).trim().split(/\s+/)[0]
    const extra = PALABRAS_NUMERO[resto]
    return extra !== undefined && extra < 1000 ? total + extra : total
  }

  // monto con $ explícito
  const conSigno = texto.match(/\$\s*(\d+(?:[.,]\d+)*)/)
  if (conSigno) {
    const n = aNumero(conSigno[1])
    if (n !== null && n > 0) return n
  }

  // número suelto con separadores de miles: 18.500 · 1,250.00
  const conSeparador = t.match(/\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\b/)
  if (conSeparador) {
    const n = aNumero(conSeparador[1])
    if (n !== null && n > 0) return n
  }

  /* monto en dólares: como suelen ser montos chicos ("gasté 50 dólares"),
     no llegan al mínimo de 3 dígitos de la regla genérica de abajo. Si el
     número está pegado a "dólares/usd/u$s", alcanza con que sea > 0. */
  const conDolares = t.match(/\b(\d+(?:[.,]\d+)?)\s*(dolares?|u\$s|usd)\b/)
  if (conDolares) {
    const n = aNumero(conDolares[1])
    if (n !== null && n > 0) return n
  }

  // número pelado de 3 o más dígitos
  const pelado = t.match(/\b(\d{3,})\b/)
  if (pelado) {
    const n = Number(pelado[1])
    if (n > 0) return n
  }

  return null
}

/* ── Categorías ─────────────────────────────────────────────── */

const CATEGORIAS: Array<[string, RegExp]> = [
  ['mercado', /\b(mercado|supermercado|super|chino|verduleria|carniceria|almacen|dietetica|fiambreria|pescaderia|mandados|compras del mes|coto|carrefour|dia|jumbo|vea|disco)\b/],
  ['comida', /\b(comida|delivery|pedidosya|rappi|resto|restaurante|bar|cafe|cafeteria|kiosco|panaderia|heladeria|helado|almuerzo|cena|desayuno|merienda|mcdonald|burger|hamburguesa|pizza|sushi|empanada|parrilla|asado|vianda)\b/],
  ['transporte', /\b(auto|camioneta|moto|bici|bicicleta|nafta|combustible|gasoil|sube|colectivo|bondi|subte|tren|taxi|uber|cabify|didi|remis|peaje|estacionamiento|cochera|mecanico|gomeria|patente|vtv|seguro del auto|seguro auto)\b/],
  ['farmacia', /\b(farmacia|remedio|medicamento|medico|doctor|dentista|odontologo|psicologo|terapia|hospital|clinica|consulta|analisis|estudio medico|oculista|obra social|prepaga)\b/],
  ['ocio', /\b(cine|teatro|recital|show|concierto|salida|boliche|birra|cerveza|joda|previa|fiesta|viaje|hotel|escapada|streaming|netflix|spotify|disney|hbo|prime|videojuego|juego|steam|gimnasio|gym|padel|futbol|cancha)\b/],
  ['ropa', /\b(ropa|indumentaria|zapatillas?|zapatilla|zapato|calzado|campera|buzo|jean|pantalon|remera|camisa|vestido|abrigo|accesorio|cartera|mochila)\b/],
  ['personal', /\b(peluqueria|barberia|corte de pelo|unas|manicura|pedicura|cosmetica|perfume|maquillaje|spa|masaje|curso|libro|educacion|universidad|facultad|colegio)\b/],
  ['impuesto', /\b(impuesto|afip|monotributo|arba|agip|abl|rentas|ingresos brutos|multa|tasa|patente municipal|ganancias)\b/],
  ['tecnologia', /\b(celular|telefono|notebook|compu|computadora|laptop|tablet|monitor|teclado|mouse|auricular|cable|cargador|software|licencia|apple|samsung|xiaomi)\b/],
  ['regalo', /\b(regalo|presente|flores|flor|floreria|ramo|bombones|cumpleanos|navidad|reyes|casamiento|baby shower|donacion|aguinaldo para)\b/],
]

export function detectarCategoria(texto: string): string {
  const t = norm(quitarMediosDePago(texto))
  for (const [cat, re] of CATEGORIAS) {
    if (re.test(t)) return cat
  }
  return 'varios'
}

/* ── Cuotas ─────────────────────────────────────────────────────
   "en 3 cuotas", "6 cuotas sin interés", "en doce cuotas".
   Si dice "3 cuotas de 20 lucas", el monto dicho es por cuota.      */

export function extraerCuotas(texto: string): { cuotas: number; montoEsPorCuota: boolean } | null {
  const t = norm(texto)
  const m = t.match(/\b(\d{1,2}|[a-z]+)\s+cuotas?\b/)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : PALABRAS_NUMERO[m[1]]
  if (!n || n < 2 || n > 48) return null
  const porCuota = new RegExp(`\\b${m[1]}\\s+cuotas?\\s+(sin interes\\s+)?de\\b`).test(t)
  return { cuotas: n, montoEsPorCuota: porCuota }
}

/* ── Tipo de registro ───────────────────────────────────────── */

const RE_GASTO_FIJO = /\b(alquiler|expensas|luz|gas|agua|internet|wifi|cable|abono|prepaga|obra social|seguro|suscripcion|netflix|spotify|disney|hbo|cuota|colegio|gimnasio mensual)\b/
const RE_INGRESO_FIJO = /\b(sueldo|salario|jubilacion|pension|aguinaldo|mensualidad|quincena)\b/
const RE_FREELANCE = /\b(freelance|changa|laburito|proyecto|cliente|factura|comision|honorarios|me pago|me pagaron)\b/
/* "dolar/dolares" sueltos NO alcanzan para clasificar como inversión (si no,
   "gasté 50 dólares en la cena" quedaba mal clasificado): solo cuenta si
   además hay un verbo de compra/inversión de esa moneda. */
const RE_INVERSION = /\b(plazo fijo|fondo|fci|money market|cripto|bitcoin|btc|ethereum|eth|usdt|acciones|cedear|bono|obligacion negociable|\bon\b|oro|invertir|inverti)\b/
const RE_COMPRA_DOLARES = /\b(compr[eé]|comprar|cambi[eé]|cambiar)\b[\s\S]*\b(dolares?|dólares?|usd|u\$s)\b/
const RE_INGRESO = /\b(cobre|cobré|cobrar|me pagaron|me pago|me depositaron|deposito|ingreso|gane|entro|factura|vendi|vendí)\b/

/** Detecta si el monto está expresado en dólares ("USD", "u$s", "dólares"). */
export function detectarMoneda(texto: string): 'ARS' | 'USD' {
  return /\b(usd|u\$s|dolares?|dólares?)\b/i.test(texto) ? 'USD' : 'ARS'
}

export function detectarTipo(texto: string): TipoRegistro {
  const t = norm(quitarMediosDePago(texto))

  if (RE_INVERSION.test(t) || RE_COMPRA_DOLARES.test(t)) return 'inversion'
  if (RE_INGRESO.test(t) || RE_INGRESO_FIJO.test(t) || RE_FREELANCE.test(t)) {
    if (RE_INGRESO_FIJO.test(t)) return 'ingreso_fijo'
    if (RE_FREELANCE.test(t)) return 'ingreso_freelance'
    return 'ingreso_fijo'
  }
  if (RE_GASTO_FIJO.test(t)) return 'gasto_fijo'
  return 'gasto_variable'
}

/* ── Varias transacciones en un mismo mensaje ─────────────────
   "gasté 5mil en el super y 3mil en nafta" -> 2 registros.
   Solo se activa si CADA fragmento separado por " y " tiene su
   propio monto; si no, se deja que el flujo normal (un solo
   registro) se encargue del mensaje completo. ────────────────── */

export function parsearVarios(texto: string, hoy = new Date()): Resultado[] | null {
  const fragmentos = texto
    .split(/\s+y\s+(?=.*\d)/i)
    .map(f => f.trim())
    .filter(Boolean)

  if (fragmentos.length < 2) return null

  const resultados = fragmentos.map(f => parsear(f, hoy))
  const todosConMonto = resultados.every(r => r.tipo !== 'texto' && r.datos?.monto)

  return todosConMonto ? resultados : null
}

/* ── Fechas ─────────────────────────────────────────────────── */

const DIAS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3,
  jueves: 4, viernes: 5, sabado: 6,
}

function iso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function extraerFecha(texto: string, hoy = new Date()): string {
  const t = norm(texto)
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  if (/\banteayer\b|\bantes de ayer\b/.test(t)) {
    base.setDate(base.getDate() - 2)
    return iso(base)
  }
  if (/\bayer\b/.test(t)) {
    base.setDate(base.getDate() - 1)
    return iso(base)
  }
  if (/\bhoy\b/.test(t)) return iso(base)

  // "hace 3 dias"
  const hace = t.match(/\bhace\s+(\d+)\s+dias?\b/)
  if (hace) {
    base.setDate(base.getDate() - Number(hace[1]))
    return iso(base)
  }

  // "el lunes" -> último lunes pasado
  const dia = t.match(/\bel\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/)
  if (dia && DIAS[dia[1]] !== undefined) {
    const objetivo = DIAS[dia[1]]
    let delta = base.getDay() - objetivo
    if (delta <= 0) delta += 7
    base.setDate(base.getDate() - delta)
    return iso(base)
  }

  // "el 15" -> día 15 del mes actual
  const nroDia = t.match(/\bel\s+(\d{1,2})\b(?!\s*(?:mil|k|lucas))/)
  if (nroDia) {
    const d = Number(nroDia[1])
    if (d >= 1 && d <= 31) {
      const f = new Date(base.getFullYear(), base.getMonth(), d)
      return iso(f)
    }
  }

  // "15/3" o "15-03-2026"
  const explicita = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (explicita) {
    const d = Number(explicita[1])
    const m = Number(explicita[2]) - 1
    let y = explicita[3] ? Number(explicita[3]) : base.getFullYear()
    if (y < 100) y += 2000
    const f = new Date(y, m, d)
    if (!isNaN(f.getTime())) return iso(f)
  }

  return iso(base)
}

/* ── Nombre limpio ──────────────────────────────────────────── */

const RELLENO = /^(gaste|gasté|pague|pagué|compre|compré|cobre|cobré|puse|saque|saqué|me\s+(salio|salió|costo|costó|pagaron|pago|depositaron)|se\s+me\s+fueron|invert[ií]|cargue|cargué|anota|anotame|registra|registrame)\s*/i

const RE_FRASE_CUOTAS =
  /\b(en\s+)?(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte)\s+cuotas?(\s+sin\s+inter[eé]s)?(\s+de\b)?/gi

export function extraerNombre(texto: string): string {
  let s = quitarMediosDePago(texto.replace(RE_FRASE_CUOTAS, ' '))

  // sacar montos y monedas
  s = s
    .replace(/\$\s*[\d.,]+/g, ' ')
    // compuesto primero: "5 lucas con 500" completo
    .replace(/\b\d+(?:[.,]\d+)?\s*(k|mil|lucas?|gambas?|palos?|millon(?:es)?)\s+(?:con|y)\s+\d+/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(k|mil|lucas?|gambas?|palos?|millon(?:es)?)\b/gi, ' ')
    .replace(/\bmedio\s+(palo|millon)\b/gi, ' ')
    .replace(/\b\d[\d.,]*\b/g, ' ')
    .replace(/\b(pesos|ars|usd|dolares|dólares)\b/gi, ' ')

  // sacar referencias temporales
  s = s.replace(/\b(hoy|ayer|anteayer|hace\s+\d+\s+dias?|el\s+(domingo|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado))\b/gi, ' ')

  s = s.replace(/\s{2,}/g, ' ').trim()
  s = s.replace(RELLENO, '').trim()
  s = s.replace(/^(en|de|por|un|una|el|la|los|las|para)\s+/i, '').trim()
  s = s.replace(/(\s+(en|de|por|con|la|el|mi))+$/i, '').trim()

  if (!s) return 'Gasto'
  return s.charAt(0).toUpperCase() + s.slice(1, 60)
}

/* ── Parser principal ───────────────────────────────────────── */

export function parsear(texto: string, hoy = new Date()): Resultado {
  const monto = extraerMonto(texto)

  if (monto === null) {
    return {
      tipo: 'texto',
      mensaje: 'Te falta el monto. Probá algo como "gasté 20mil en comida".',
    }
  }

  const tipo = detectarTipo(texto)
  const nombre = extraerNombre(texto)
  const fecha = extraerFecha(texto, hoy)
  const fmt = monto.toLocaleString('es-AR')

  switch (tipo) {
    case 'gasto_fijo':
      return {
        tipo,
        mensaje: `Listo, ${nombre} por $${fmt} como gasto fijo.`,
        datos: { nombre, monto, categoria: 'servicios', activo: true },
      }

    case 'ingreso_fijo':
      return {
        tipo,
        mensaje: `Anotado, ${nombre} por $${fmt}.`,
        datos: { nombre, monto, activo: true },
      }

    case 'ingreso_freelance':
      return {
        tipo,
        mensaje: `Anotado el trabajo por $${fmt}.`,
        datos: { cliente: nombre, descripcion: nombre, monto_total: monto, fecha },
      }

    case 'inversion':
      return {
        tipo,
        mensaje: `Inversión registrada: ${nombre} por $${fmt}.`,
        datos: {
          nombre, monto, tipo: 'otro',
          moneda: /\b(usd|dolar|dólar|dolares|dólares)\b/i.test(texto) ? 'USD' : 'ARS',
          nivel_riesgo: 'conservador',
        },
      }

    default: {
      const medio = detectarMedioPago(texto)
      const cuotas = extraerCuotas(texto)
      const forma = cuotas ? 'credito' : detectarFormaPago(texto, medio)
      /* "3 cuotas de 20 lucas" -> la compra total es 60 lucas */
      const total = cuotas?.montoEsPorCuota ? monto * cuotas.cuotas : monto
      const fmtTotal = total.toLocaleString('es-AR')
      const detalleCuotas = cuotas
        ? ` en ${cuotas.cuotas} cuotas de $${Math.round(total / cuotas.cuotas).toLocaleString('es-AR')}`
        : ''
      const moneda = detectarMoneda(texto)
      return {
        tipo: 'gasto_variable',
        mensaje: medio
          ? `Listo, ${nombre} por ${moneda === 'USD' ? 'US$' : '$'}${fmtTotal}${detalleCuotas} con ${medio}${forma === 'credito' && !cuotas ? ' (crédito)' : ''}.`
          : `Listo, ${nombre} por ${moneda === 'USD' ? 'US$' : '$'}${fmtTotal}${detalleCuotas}.`,
        datos: {
          nombre, monto: total,
          categoria: detectarCategoria(texto),
          fecha,
          moneda,
          es_gasto_hormiga: total < 5000,
          ...(medio ? { medio_pago: medio, forma_pago: forma } : {}),
          ...(cuotas ? { cuotas: cuotas.cuotas } : {}),
        },
      }
    }
  }
}
