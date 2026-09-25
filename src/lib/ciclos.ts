/* ── Ciclos de tarjeta: resúmenes, cierres y vencimientos ──────────
   Un "resumen" se identifica por el mes en que VENCE (YYYY-MM).
   Ejemplos con los días de cada tarjeta:
   - MercadoPago cierra el 12 y vence el 17: una compra del 5/9 cierra
     el 12/9 y vence el 17/9 -> resumen "2026-09". Una del 20/9 cierra
     el 12/10 y vence el 17/10 -> "2026-10".
   - Naranja X cierra el 27 y vence el 10 del mes siguiente: una compra
     del 5/9 cierra el 27/9 y vence el 10/10 -> "2026-10".            */

export interface DiasTarjeta {
  cierre: number | null
  vencimiento: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const clave = (y: number, m0: number) => {
  const d = new Date(y, m0, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const partes = (k: string) => {
  const [y, m] = k.split('-').map(Number)
  return { y, m0: m - 1 }
}
const diasEnMes = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate()
/** Día `dia` del mes, recortado si el mes es más corto (ej: 31 -> 30). */
const fechaDia = (y: number, m0: number, dia: number) => {
  const d = new Date(y, m0, 1)
  return new Date(d.getFullYear(), d.getMonth(), Math.min(dia, diasEnMes(d.getFullYear(), d.getMonth())))
}
const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const aISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const desdeISO = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function sumarMeses(k: string, n: number): string {
  const { y, m0 } = partes(k)
  return clave(y, m0 + n)
}

export function mesClaveDe(d: Date) {
  return clave(d.getFullYear(), d.getMonth())
}

const tieneCiclo = (t: DiasTarjeta): t is { cierre: number; vencimiento: number } =>
  !!t.cierre && !!t.vencimiento

/** Resumen (mes de vencimiento) al que entra una compra hecha en `fecha`. */
export function resumenDeCompra(fecha: string | Date, t: DiasTarjeta): string {
  const d = soloFecha(typeof fecha === 'string' ? desdeISO(fecha) : fecha)
  if (!tieneCiclo(t)) return mesClaveDe(d)
  const cierreEsteMes = fechaDia(d.getFullYear(), d.getMonth(), t.cierre)
  const cy = d.getFullYear()
  let cm = d.getMonth()
  if (d > cierreEsteMes) cm += 1
  /* si vence después del día de cierre, vence el mismo mes; si no, el siguiente */
  return clave(cy, t.vencimiento > t.cierre ? cm : cm + 1)
}

/** Fechas de un resumen: desde (día después del cierre anterior), cierre y vencimiento. */
export function fechasDeResumen(resumen: string, t: DiasTarjeta) {
  const { y, m0 } = partes(resumen)
  if (!tieneCiclo(t)) {
    return { desde: new Date(y, m0, 1), cierre: new Date(y, m0 + 1, 0), vencimiento: new Date(y, m0 + 1, 0) }
  }
  const vencimiento = fechaDia(y, m0, t.vencimiento)
  const mCierre = t.vencimiento > t.cierre ? m0 : m0 - 1
  const cierre = fechaDia(y, mCierre, t.cierre)
  const cierreAnterior = fechaDia(y, mCierre - 1, t.cierre)
  const desde = new Date(cierreAnterior.getFullYear(), cierreAnterior.getMonth(), cierreAnterior.getDate() + 1)
  return { desde, cierre, vencimiento }
}

/** Resumen que está abierto hoy (al que entraría una compra de hoy). */
export const resumenAbierto = (t: DiasTarjeta, hoy = new Date()) => resumenDeCompra(hoy, t)

export function diasEntre(desde: Date, hasta: Date) {
  return Math.round((soloFecha(hasta).getTime() - soloFecha(desde).getTime()) / 86_400_000)
}

export const fmtDiaMes = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const etiquetaMes = (k: string) => {
  const { y, m0 } = partes(k)
  return `${MESES[m0]} ${String(y).slice(2)}`
}

export type EstadoResumen = 'abierto' | 'a_pagar' | 'vencido' | 'pagado' | 'futuro' | 'vacio'

export function estadoResumen(
  resumen: string, t: DiasTarjeta, pendiente: number, total: number, hoy = new Date(),
): EstadoResumen {
  if (total === 0) return 'vacio'
  const { desde, cierre, vencimiento } = fechasDeResumen(resumen, t)
  const h = soloFecha(hoy)
  if (h < desde) return pendiente > 0 ? 'futuro' : 'pagado'
  if (h <= cierre) return pendiente > 0 ? 'abierto' : 'pagado'
  if (pendiente <= 0.5) return 'pagado'
  return h <= vencimiento ? 'a_pagar' : 'vencido'
}

/**
 * ¿Con qué tarjeta conviene comprar hoy? La que te da más días hasta
 * pagar: la compra entra al resumen abierto y se paga en su vencimiento.
 */
export function mejorTarjetaHoy<T extends DiasTarjeta & { id: string }>(ts: T[], hoy = new Date()) {
  let mejor: { tarjeta: T; vence: Date; dias: number } | null = null
  for (const t of ts) {
    if (!tieneCiclo(t)) continue
    const vence = fechasDeResumen(resumenAbierto(t, hoy), t).vencimiento
    const dias = diasEntre(hoy, vence)
    if (!mejor || dias > mejor.dias) mejor = { tarjeta: t, vence, dias }
  }
  return mejor
}
