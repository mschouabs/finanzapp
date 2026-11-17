/* Paleta acotada: tonos de luminosidad media que se leen igual en Negro y en Rosa.
   Categorías de gasto variable, compartidas por los formularios de carga
   manual (Movimientos, y el modal rápido de Resumen / bottom nav). */

export const CATEGORIAS = [
  { key: 'mercado', label: 'Mercado', emoji: '🛒', color: '#5FA883' },
  { key: 'comida', label: 'Comida', emoji: '🍕', color: '#D9A55B' },
  { key: 'transporte', label: 'Transporte', emoji: '🚗', color: '#6E8FD6' },
  { key: 'farmacia', label: 'Farmacia', emoji: '💊', color: '#4FA3A0' },
  { key: 'ocio', label: 'Ocio', emoji: '🎬', color: '#9C82D6' },
  { key: 'ropa', label: 'Ropa', emoji: '👕', color: '#D88A6A' },
  { key: 'personal', label: 'Personal', emoji: '✂️', color: '#CF7FA0' },
  { key: 'impuesto', label: 'Impuesto', emoji: '📋', color: '#8D96A3' },
  { key: 'tecnologia', label: 'Tecnología', emoji: '💻', color: '#6FA7C9' },
  { key: 'regalo', label: 'Regalo', emoji: '🎁', color: '#D46F7E' },
  { key: 'servicios', label: 'Servicios', emoji: '💡', color: '#C2A14A' },
  { key: 'varios', label: 'Varios', emoji: '📦', color: '#9A9AA3' },
]

export const getCat = (key: string) =>
  CATEGORIAS.find(c => c.key === key) ?? { key, label: key, emoji: '📦', color: '#9A9AA3' }
