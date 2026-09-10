/* ── Viajes: tipos, catálogos y helpers ──────────────────────────
   Un viaje agrupa gastos que pueden estar en distintas monedas.
   Cada gasto guarda el importe original y el tipo de cambio usado,
   y la base calcula `monto_ars` para que todo sea comparable.      */

export interface Viaje {
  id: string
  user_id: string
  nombre: string
  emoji: string
  destino: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  /** Siempre en ARS, para comparar contra la suma de gastos. */
  presupuesto: number | null
  notas: string | null
  archivado: boolean
  created_at: string
}

export interface ViajeGasto {
  id: string
  viaje_id: string
  user_id: string
  concepto: string
  categoria: string
  /** Importe en la moneda en que se pagó. */
  monto: number
  moneda: string
  /** Cuántos ARS vale 1 unidad de `moneda`. Para ARS es 1. */
  tipo_cambio: number
  /** Generada por la base: monto × tipo_cambio. */
  monto_ars: number
  fecha: string
  notas: string | null
  created_at: string
}

/* ── Monedas ────────────────────────────────────────────────────
   `tasaSugerida` es solo un valor inicial para el formulario: el
   usuario siempre puede sobreescribirlo con el cambio real que pagó. */
export interface Moneda {
  codigo: string
  nombre: string
  simbolo: string
  bandera: string
}

export const MONEDAS: Moneda[] = [
  { codigo: 'ARS', nombre: 'Peso argentino', simbolo: '$',   bandera: '🇦🇷' },
  { codigo: 'USD', nombre: 'Dólar',          simbolo: 'US$', bandera: '🇺🇸' },
  { codigo: 'EUR', nombre: 'Euro',           simbolo: '€',   bandera: '🇪🇺' },
  { codigo: 'BRL', nombre: 'Real',           simbolo: 'R$',  bandera: '🇧🇷' },
  { codigo: 'CLP', nombre: 'Peso chileno',   simbolo: 'CLP', bandera: '🇨🇱' },
  { codigo: 'UYU', nombre: 'Peso uruguayo',  simbolo: '$U',  bandera: '🇺🇾' },
  { codigo: 'PYG', nombre: 'Guaraní',        simbolo: '₲',   bandera: '🇵🇾' },
  { codigo: 'GBP', nombre: 'Libra',          simbolo: '£',   bandera: '🇬🇧' },
]

export const getMoneda = (codigo: string) =>
  MONEDAS.find(m => m.codigo === codigo) ?? MONEDAS[0]

/* ── Categorías de gasto de viaje ───────────────────────────────
   Son distintas de las de gastos variables: en un viaje el peso
   está en alojamiento y transporte, no en supermercado.            */
export interface CategoriaViaje {
  key: string
  label: string
  emoji: string
  color: string
}

export const CATEGORIAS_VIAJE: CategoriaViaje[] = [
  { key: 'alojamiento', label: 'Alojamiento', emoji: '🏨', color: 'var(--accent-secondary)' },
  { key: 'transporte',  label: 'Transporte',  emoji: '✈️', color: 'var(--accent-violet)' },
  { key: 'comida',      label: 'Comida',      emoji: '🍽️', color: 'var(--accent-warning)' },
  { key: 'actividades', label: 'Actividades', emoji: '🎟️', color: 'var(--accent-positive)' },
  { key: 'compras',     label: 'Compras',     emoji: '🛍️', color: 'var(--accent-negative)' },
  { key: 'salud',       label: 'Salud',       emoji: '💊', color: 'var(--riesgo-medio)' },
  { key: 'varios',      label: 'Varios',      emoji: '📦', color: 'var(--text-muted)' },
]

export const getCategoriaViaje = (key: string) =>
  CATEGORIAS_VIAJE.find(c => c.key === key) ?? CATEGORIAS_VIAJE[CATEGORIAS_VIAJE.length - 1]

/* ── Formato ────────────────────────────────────────────────────── */

/** Monto en pesos, con separadores y sin decimales cuando es redondo. */
export function fmtARS(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

/** Versión compacta para tarjetas y totales grandes. */
export function fmtCorto(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/** Importe en su moneda original, para mostrar junto al equivalente. */
export function fmtMonedaOriginal(monto: number, codigo: string): string {
  const m = getMoneda(codigo)
  return `${m.simbolo} ${Number(monto).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

export function fmtFecha(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  })
}

/** Rango del viaje en una línea: "12 mar — 24 mar 2026". */
export function fmtRango(inicio: string | null, fin: string | null): string {
  if (!inicio && !fin) return 'Sin fechas'
  if (inicio && !fin) return `Desde ${fmtFecha(inicio)}`
  if (!inicio && fin) return `Hasta ${fmtFecha(fin)}`
  const anio = new Date(fin + 'T12:00:00').getFullYear()
  return `${fmtFecha(inicio)} — ${fmtFecha(fin)} ${anio}`
}

/* ── Estado del viaje ────────────────────────────────────────────
   Se deriva de las fechas en vez de guardarse: así nunca queda
   un viaje marcado "en curso" seis meses después.                  */
export type EstadoViaje = 'proximo' | 'en_curso' | 'terminado' | 'sin_fecha'

export function estadoViaje(v: Viaje): EstadoViaje {
  if (!v.fecha_inicio && !v.fecha_fin) return 'sin_fecha'
  const hoy = new Date().toISOString().split('T')[0]
  if (v.fecha_inicio && hoy < v.fecha_inicio) return 'proximo'
  if (v.fecha_fin && hoy > v.fecha_fin) return 'terminado'
  return 'en_curso'
}

export const ETIQUETA_ESTADO: Record<EstadoViaje, { label: string; color: string }> = {
  proximo:   { label: 'Próximo',   color: 'var(--accent-secondary)' },
  en_curso:  { label: 'En curso',  color: 'var(--accent-positive)' },
  terminado: { label: 'Terminado', color: 'var(--text-muted)' },
  sin_fecha: { label: 'Sin fecha', color: 'var(--text-muted)' },
}

/** Cuántos días dura el viaje (inclusive). null si falta una fecha. */
export function duracionDias(v: Viaje): number | null {
  if (!v.fecha_inicio || !v.fecha_fin) return null
  const ms = new Date(v.fecha_fin).getTime() - new Date(v.fecha_inicio).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** Verde mientras sobre presupuesto, ámbar cerca del límite, rojo pasado. */
export function colorPresupuesto(pct: number): string {
  if (pct > 100) return 'var(--accent-negative)'
  if (pct >= 80) return 'var(--riesgo-medio)'
  return 'var(--accent-positive)'
}
