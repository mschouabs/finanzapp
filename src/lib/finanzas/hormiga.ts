/* ── Gastos hormiga ──────────────────────────────────────────────────
   Un gasto hormiga es chico, prescindible y suele repetirse: el café,
   el kiosco, el delivery, el Uber corto, la app. Por sí solo no pesa;
   sumado a fin de mes, sí.

   Se detecta solo (no hace falta marcarlo al cargar):
   · chico PARA VOS: por debajo del umbral, que es la mitad más baja de
     tus propios gastos de los últimos 90 días (se ajusta con la
     inflación y con tu forma de gastar; no hay un monto fijo);
   · prescindible: por el nombre (café, kiosco, delivery, Uber…) o por
     ser de comida u ocio, o porque lo repetís 3 veces o más en 30 días;
   · nunca cuenta: cuotas, impuestos, servicios, salud, nafta, SUBE,
     peajes ni nada que no sea prescindible.
   Si lo marcaste a mano como hormiga, se respeta.                    */

export interface GastoHormiga {
  nombre: string
  monto: number
  moneda?: string | null
  categoria: string
  fecha: string
  cuotas_total?: number | null
  es_gasto_hormiga?: boolean | null
}

export interface ContextoHormiga {
  /** monto (en pesos) hasta el que un gasto se considera chico */
  umbral: number
  /** nombres que se repiten 3+ veces en los últimos 30 días */
  repetidos: Set<string>
}

const PRESCINDIBLE = /(caf[eé]|cafecito|kiosc|kiosk|golosin|alfajor|chicle|cigarr|pucho|gaseosa|coca|snack|helado|facturas|medialuna|panader|starbucks|havanna|mostaza|mc ?donald|burger|rappi|pedidos ?ya|delivery|uber|cabify|didi|taxi|remis|propina|birra|cerveza|fernet|trago|app ?store|google play|steam|juego|sticker|merienda|desayuno)/i
const NECESARIO = /(nafta|combustible|sube|peaje|estacionamiento|alquiler|expensa|luz|edenor|edesur|metrogas|aysa|internet|obra social|prepaga|medic|farmacia|colegio|cuota)/i
const NUNCA = new Set(['impuesto', 'impuestos', 'servicios', 'farmacia', 'salud', 'tecnologia', 'regalo', 'ropa'])
const DISCRECIONAL = new Set(['comida', 'ocio'])
const PROPORCION = 0.5

export const normalizarNombre = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const enPesos = (g: GastoHormiga, dolar: number) => (g.moneda === 'USD' ? g.monto * dolar : g.monto)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function contextoHormiga(gastos: GastoHormiga[], dolar: number, hoy = new Date()): ContextoHormiga {
  const desde90 = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 90))
  const desde30 = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30))
  const recientes = gastos.filter(g => g.fecha >= desde90 && (g.cuotas_total ?? 1) <= 1)
  const montos = recientes.map(g => enPesos(g, dolar)).filter(v => v > 0).sort((a, b) => a - b)
  /* con pocos datos el corte no es confiable: solo se usa lo marcado a mano */
  const umbral = montos.length >= 8 ? montos[Math.floor((montos.length - 1) * PROPORCION)] : 0

  const cuenta = new Map<string, number>()
  for (const g of gastos) {
    if (g.fecha < desde30) continue
    const k = normalizarNombre(g.nombre)
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return { umbral, repetidos: new Set(Array.from(cuenta.entries()).filter(([, n]) => n >= 3).map(([k]) => k)) }
}

export function esHormiga(g: GastoHormiga, ctx: ContextoHormiga, dolar: number): boolean {
  if (g.es_gasto_hormiga) return true
  if ((g.cuotas_total ?? 1) > 1) return false
  const cat = (g.categoria ?? '').toLowerCase()
  if (NUNCA.has(cat) || NECESARIO.test(g.nombre)) return false
  const v = enPesos(g, dolar)
  if (!(v > 0) || v > ctx.umbral) return false
  return PRESCINDIBLE.test(g.nombre) || DISCRECIONAL.has(cat) || ctx.repetidos.has(normalizarNombre(g.nombre))
}
