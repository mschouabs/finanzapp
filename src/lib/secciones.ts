/* ── Secciones dinámicas: tipos, plantillas y helpers ────────────── */

export type CampoTipo = 'text' | 'number' | 'date' | 'select' | 'textarea'

export interface Campo {
  key: string
  label: string
  tipo: CampoTipo
  opciones?: string[]
  /** Los campos fijos (monto, fecha) no se pueden borrar ni renombrar. */
  fijo?: boolean
}

export type SeccionTipo = 'ingreso' | 'gasto' | 'neutra'

export interface Seccion {
  id: string
  user_id: string
  nombre: string
  emoji: string
  tipo: SeccionTipo
  plantilla: string | null
  campos: Campo[]
  orden: number
  created_at: string
}

export interface Registro {
  id: string
  seccion_id: string
  user_id: string
  datos: Record<string, string | number | null>
  monto: number | null
  fecha: string | null
  created_at: string
}

/* ── Campos obligatorios ──────────────────────────────────────────
   Van a columnas propias (monto, fecha) para que el resumen pueda
   sumar sin parsear JSON. Por eso no se pueden borrar.              */
export const CAMPO_MONTO: Campo = { key: 'monto', label: 'Monto', tipo: 'number', fijo: true }
export const CAMPO_FECHA: Campo = { key: 'fecha', label: 'Fecha', tipo: 'date', fijo: true }

export const esCampoFijo = (key: string) => key === 'monto' || key === 'fecha'

/* ── Plantillas ─────────────────────────────────────────────────── */
export interface Plantilla {
  id: string
  nombre: string
  emoji: string
  tipo: SeccionTipo
  descripcion: string
  campos: Campo[]
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'trabajos',
    nombre: 'Trabajos',
    emoji: '💼',
    tipo: 'ingreso',
    descripcion: 'Ingresos por trabajos freelance o empleos',
    campos: [
      { key: 'empresa', label: 'Empresa', tipo: 'text' },
      CAMPO_MONTO,
      CAMPO_FECHA,
      { key: 'descripcion', label: 'Descripción', tipo: 'text' },
    ],
  },
  {
    id: 'gastos_fijos',
    nombre: 'Gastos Fijos',
    emoji: '🏠',
    tipo: 'gasto',
    descripcion: 'Gastos recurrentes como alquiler o servicios',
    campos: [
      { key: 'concepto', label: 'Concepto', tipo: 'text' },
      CAMPO_MONTO,
      CAMPO_FECHA,
      {
        key: 'frecuencia',
        label: 'Frecuencia',
        tipo: 'select',
        opciones: ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'],
      },
    ],
  },
  {
    id: 'tarjetas',
    nombre: 'Tarjetas',
    emoji: '💳',
    tipo: 'gasto',
    descripcion: 'Consumos con tarjeta de crédito',
    campos: [
      { key: 'tarjeta', label: 'Tarjeta', tipo: 'text' },
      { key: 'concepto', label: 'Concepto', tipo: 'text' },
      CAMPO_MONTO,
      CAMPO_FECHA,
      { key: 'cuotas', label: 'Cuotas', tipo: 'number' },
    ],
  },
  {
    id: 'inversiones',
    nombre: 'Inversiones',
    emoji: '📊',
    tipo: 'neutra',
    descripcion: 'Activos y posiciones de tu portfolio',
    campos: [
      { key: 'activo', label: 'Activo', tipo: 'text' },
      {
        key: 'clase',
        label: 'Clase',
        tipo: 'select',
        opciones: ['Acciones', 'Bonos', 'Cripto', 'Plazo fijo', 'Fondo', 'Otro'],
      },
      CAMPO_MONTO,
      CAMPO_FECHA,
    ],
  },
  {
    id: 'vacia',
    nombre: 'Desde cero',
    emoji: '📁',
    tipo: 'neutra',
    descripcion: 'Empezá con lo mínimo y agregá los campos que quieras',
    campos: [
      { key: 'descripcion', label: 'Descripción', tipo: 'text' },
      CAMPO_MONTO,
      CAMPO_FECHA,
    ],
  },
]

export const getPlantilla = (id: string) => PLANTILLAS.find(p => p.id === id)

/* ── Helpers ────────────────────────────────────────────────────── */

/** Convierte una etiqueta en una key válida y estable para jsonb. */
export function labelAKey(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'campo'
}

/** Garantiza que monto y fecha estén presentes, y evita keys repetidas. */
export function normalizarCampos(campos: Campo[]): Campo[] {
  const vistos = new Set<string>()
  const limpios: Campo[] = []

  for (const c of campos) {
    const key = esCampoFijo(c.key) ? c.key : labelAKey(c.label || c.key)
    if (!key || vistos.has(key)) continue
    vistos.add(key)
    limpios.push(esCampoFijo(key) ? { ...c, key, fijo: true } : { ...c, key })
  }

  if (!vistos.has('monto')) limpios.push(CAMPO_MONTO)
  if (!vistos.has('fecha')) limpios.push(CAMPO_FECHA)

  return limpios
}

export const fmtMonto = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })

export function fmtFecha(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Cómo se muestra el valor de un campo en la tabla. */
export function formatearValor(campo: Campo, registro: Registro): string {
  if (campo.key === 'monto') return fmtMonto(registro.monto)
  if (campo.key === 'fecha') return fmtFecha(registro.fecha)
  const v = registro.datos?.[campo.key]
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
