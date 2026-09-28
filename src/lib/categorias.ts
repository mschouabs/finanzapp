/* Categorías de gasto variable, compartidas por los formularios de carga
   manual (Movimientos, y el modal rápido de Resumen / bottom nav). */

export const CATEGORIAS = [
  { key: 'mercado', label: 'Mercado', emoji: '🛒', color: '#32D158' },
  { key: 'comida', label: 'Comida', emoji: '🍕', color: '#F5C451' },
  { key: 'transporte', label: 'Transporte', emoji: '🚗', color: '#63A9FF' },
  { key: 'farmacia', label: 'Farmacia', emoji: '💊', color: '#22C55E' },
  { key: 'ocio', label: 'Ocio', emoji: '🎬', color: '#A855F7' },
  { key: 'ropa', label: 'Ropa', emoji: '👕', color: '#FF8A3D' },
  { key: 'personal', label: 'Personal', emoji: '✂️', color: '#DF7897' },
  { key: 'impuesto', label: 'Impuesto', emoji: '📋', color: '#94A3B8' },
  { key: 'tecnologia', label: 'Tecnología', emoji: '💻', color: '#79C0FF' },
  { key: 'regalo', label: 'Regalo', emoji: '🎁', color: '#FF5873' },
  { key: 'servicios', label: 'Servicios', emoji: '💡', color: '#14B8A6' },
  { key: 'varios', label: 'Varios', emoji: '📦', color: '#6E7681' },
]

export const getCat = (key: string) =>
  CATEGORIAS.find(c => c.key === key) ?? { key, label: key, emoji: '📦', color: '#6E7681' }
