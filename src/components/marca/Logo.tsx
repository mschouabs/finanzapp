/* ── Marca: tres propuestas de isotipo (sin letras: sirven con cualquier nombre) ─────────────────────
   Geométricos, sobre grilla de 64 (8 × 8 módulos de 8 px), legibles a
   16 px. Usan currentColor para la forma y --acento para un único
   detalle; en versión monocromática el detalle toma currentColor.    */

export type VarianteLogo = 'cuadrante' | 'escalon' | 'nivel'

export const VARIANTES: { id: VarianteLogo; nombre: string; idea: string }[] = [
  { id: 'cuadrante', nombre: 'D · Cuadrante', idea: 'Un cuadrado partido en cuatro, con un cuarto resaltado: planta, grilla y torta a la vez. Lo que ya tiene destino y lo que queda.' },
  { id: 'escalon', nombre: 'E · Escalón', idea: 'Un corte de escalera de tres peldaños: progreso medido, paso a paso. Un solo trazo, como un detalle constructivo.' },
  { id: 'nivel', nombre: 'F · Nivel', idea: 'El nivel de burbuja del arquitecto: una barra con la burbuja centrada. Cuentas en equilibrio.' },
]

export function Isotipo({ variante, size = 32, mono = false, fondo = true, className = '' }: {
  variante: VarianteLogo
  size?: number
  /** sin acento: todo en currentColor */
  mono?: boolean
  /** con la placa redondeada (ícono de app) o solo la forma */
  fondo?: boolean
  className?: string
}) {
  const acento = mono ? 'currentColor' : 'var(--logo-acento, #6FD3A6)'
  const tinta = fondo ? 'var(--logo-tinta, #0E0E10)' : 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Logo" xmlns="http://www.w3.org/2000/svg">
      {fondo && <rect width="64" height="64" rx="16" fill="currentColor" />}
      {variante === 'cuadrante' && <>
        <rect x="15" y="15" width="15" height="15" rx="3" fill={tinta} />
        <rect x="34" y="15" width="15" height="15" rx="3" fill={tinta} />
        <rect x="15" y="34" width="15" height="15" rx="3" fill={tinta} />
        <rect x="34" y="34" width="15" height="15" rx="3" fill={acento} />
      </>}
      {variante === 'escalon' && <>
        <path d="M14 50h12V38h12V26h12V14" fill="none" stroke={tinta} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="50" cy="14" r="5" fill={acento} />
      </>}
      {variante === 'nivel' && <>
        <rect x="10" y="24" width="44" height="16" rx="8" fill="none" stroke={tinta} strokeWidth="5" />
        <path d="M32 18v28" stroke={tinta} strokeWidth="3" strokeLinecap="round" opacity=".35" />
        <circle cx="32" cy="32" r="5" fill={acento} />
      </>}
    </svg>
  )
}

export function Logotipo({ variante, nombre, size = 28, mono = false, className = '' }: {
  variante: VarianteLogo; nombre: string; size?: number; mono?: boolean; className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Isotipo variante={variante} size={size} mono={mono} />
      <span className="font-semibold tracking-[-0.03em]" style={{ fontSize: size * 0.68 }}>{nombre}</span>
    </span>
  )
}
