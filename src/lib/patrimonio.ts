/* ── Patrimonio y billeteras ──────────────────────────────────────
   Los saldos viven en la tabla `inversiones` (una fila por "línea":
   Disponible MP, Dólares Ualá, BTC Spot BINGX…). Acá se separan en
   plata líquida (bancos y billeteras) vs. inversiones, y se pasa
   todo a pesos con las cotizaciones del día.                        */

export interface LineaSaldo {
  id: string
  nombre: string
  app: string
  tipo: string
  moneda: string
  monto: number
  tasa_anual: number | null
  nivel_riesgo: string | null
  es_disponible: boolean | null
  /** Nombre visible de la billetera (si la renombraste). `app` sigue
      siendo la clave con la que Luca la reconoce. */
  etiqueta?: string | null
  /** Posición de la tarjeta en la grilla de Billeteras. */
  orden?: number | null
}

export interface Cotizaciones {
  dolar: number | null
  btcUsd: number | null
}

/* Cotización de respaldo si la API no responde (valores del archivo). */
export const COTIZACION_RESPALDO = { dolar: 1560, btcUsd: 78800 }

/* Brokers y exchanges: todo lo que está ahí cuenta como inversión,
   aunque sea efectivo sin invertir. */
const BROKERS = /\b(iol|invertir online|bingx|binance|balanz|cocos|ppi|bull market|eco valores)\b/i

/** Plata que se puede usar ya: disponible, cajas de ahorro y dólares
    en bancos y billeteras virtuales. */
export function esLiquida(l: Pick<LineaSaldo, 'tipo' | 'es_disponible' | 'app'>): boolean {
  if (BROKERS.test(l.app)) return false
  return !!l.es_disponible || ['efectivo', 'ahorro', 'divisa', 'cuenta'].includes(l.tipo)
}

export function aPesos(l: Pick<LineaSaldo, 'moneda' | 'monto'>, c: Cotizaciones): number {
  const dolar = c.dolar ?? COTIZACION_RESPALDO.dolar
  const btc = c.btcUsd ?? COTIZACION_RESPALDO.btcUsd
  const m = Number(l.monto) || 0
  if (l.moneda === 'USD') return m * dolar
  if (l.moneda === 'BTC') return m * btc * dolar
  return m
}

export async function traerCotizaciones(): Promise<Cotizaciones> {
  try {
    const [d, c] = await Promise.all([
      fetch('/api/dolar').then(r => r.json()),
      fetch('/api/crypto?ids=bitcoin').then(r => r.json()),
    ])
    return { dolar: d?.blue ?? null, btcUsd: c?.bitcoin?.usd ?? null }
  } catch {
    return { dolar: null, btcUsd: null }
  }
}

export function calcularPatrimonio(lineas: LineaSaldo[], c: Cotizaciones) {
  let liquido = 0
  let invertido = 0
  for (const l of lineas) {
    const v = aPesos(l, c)
    if (esLiquida(l)) liquido += v
    else invertido += v
  }
  return { liquido, invertido, total: liquido + invertido }
}

export const mesClave = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export const mesAnteriorClave = (d = new Date()) =>
  mesClave(new Date(d.getFullYear(), d.getMonth() - 1, 1))
