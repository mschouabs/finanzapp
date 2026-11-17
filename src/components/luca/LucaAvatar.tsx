'use client'

/* ── Luca ────────────────────────────────────────────────────────────
   Avatar geométrico, coherente con la marca: una placa redondeada (como
   el isotipo) con una pantalla. Los estados cambian solo ojos, boca y
   el punto de la antena. Colores desde los tokens del tema.           */

export type LucaEstado =
  | 'idle' | 'thinking' | 'celebration' | 'sad' | 'warning'
  | 'listening' | 'insight' | 'saving' | 'success'

interface Props {
  estado?: LucaEstado
  size?: number
  className?: string
}

const OJO = 'var(--luca-glow)'

function Cara({ estado }: { estado: LucaEstado }) {
  const trazo = { stroke: OJO, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' }
  switch (estado) {
    case 'celebration':
    case 'success':
      return <>
        <path d="M21 33l4-4 4 4M35 33l4-4 4 4" {...trazo} />
        <path d="M24 40q8 6 16 0" {...trazo} />
      </>
    case 'sad':
      return <>
        <rect x="22" y="31" width="5" height="5" rx="2.5" fill={OJO} />
        <rect x="37" y="31" width="5" height="5" rx="2.5" fill={OJO} />
        <path d="M25 43q7-4 14 0" {...trazo} />
      </>
    case 'warning':
      return <>
        <path d="M21 32h7M36 32h7" {...trazo} />
        <path d="M26 41h12" {...trazo} />
      </>
    case 'thinking':
      return <>
        <rect x="24" y="26" width="5" height="8" rx="2.5" fill={OJO} />
        <rect x="38" y="26" width="5" height="8" rx="2.5" fill={OJO} />
        <circle cx="27" cy="42" r="1.6" fill={OJO} className="luca-dot-1" />
        <circle cx="32" cy="42" r="1.6" fill={OJO} className="luca-dot-2" />
        <circle cx="37" cy="42" r="1.6" fill={OJO} className="luca-dot-3" />
      </>
    case 'listening':
      return <>
        <circle cx="24.5" cy="32" r="4" fill={OJO} />
        <circle cx="39.5" cy="32" r="4" fill={OJO} />
        <path d="M27 41q5 3 10 0" {...trazo} />
      </>
    case 'insight':
      return <>
        <rect x="22" y="27" width="5" height="9" rx="2.5" fill={OJO} />
        <rect x="37" y="27" width="5" height="9" rx="2.5" fill={OJO} />
        <circle cx="32" cy="42" r="2.5" {...trazo} strokeWidth={2.5} />
      </>
    case 'saving':
      return <>
        <path d="M21 32h6M37 32h6" {...trazo} />
        <path d="M27 41q5 2 10 0" {...trazo} />
      </>
    default:
      return <>
        <rect x="22" y="27" width="5" height="9" rx="2.5" fill={OJO} />
        <rect x="37" y="27" width="5" height="9" rx="2.5" fill={OJO} />
        <path d="M25 40q7 5 14 0" {...trazo} />
      </>
  }
}

const ANTENA: Partial<Record<LucaEstado, string>> = {
  warning: 'var(--accent-warning)', sad: 'var(--accent-negative)',
  success: 'var(--accent-positive)', celebration: 'var(--accent-positive)',
}

export function LucaAvatar({ estado = 'idle', size = 40, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Luca">
      <path d="M32 9V4" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="4" r="3.5" fill={ANTENA[estado] ?? 'var(--luca-glow)'} />
      <rect x="6" y="10" width="52" height="48" rx="15" fill="var(--luca-shell)" stroke="var(--border-color)" strokeWidth="1.5" />
      <rect x="12" y="16" width="40" height="36" rx="10" fill="var(--luca-screen)" />
      <Cara estado={estado} />
    </svg>
  )
}
