'use client'

/* ── Luca ─────────────────────────────────────────────────────────
   Robot mascota de FinanzApp, dibujado en SVG para que sea nítido a
   cualquier tamaño y tome el color del tema activo. No tiene rasgos
   humanos ni género: es un aparatito.

   Los estados neutros usan el color del tema (--luca-glow); los que
   comunican un resultado usan el color semántico correspondiente,
   así el verde siempre significa lo mismo en toda la app.         */

export type LucaEstado =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'saving'
  | 'success'
  | 'celebration'
  | 'warning'
  | 'error'
  | 'sad'

interface Props {
  estado?: LucaEstado
  /** Lado del cuadrado en px. Por debajo de 24 se pierde la expresión. */
  size?: number
  className?: string
  label?: string
}

const DESCRIPCION: Record<LucaEstado, string> = {
  idle: 'Luca, en espera',
  listening: 'Luca, escuchando',
  thinking: 'Luca, pensando',
  saving: 'Luca, guardando',
  success: 'Luca, listo',
  celebration: 'Luca, celebrando',
  warning: 'Luca, atención',
  error: 'Luca, hubo un error',
  sad: 'Luca, sin novedades',
}

const COLOR_ESTADO: Partial<Record<LucaEstado, string>> = {
  success: 'var(--accent-positive)',
  celebration: 'var(--accent-positive)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-negative)',
}

const ANIMACION: Partial<Record<LucaEstado, string>> = {
  idle: 'luca-float',
  listening: 'luca-float',
  celebration: 'luca-bounce',
  error: 'luca-shake',
}

export function LucaAvatar({ estado = 'idle', size = 48, className = '', label }: Props) {
  const g = COLOR_ESTADO[estado] ?? 'var(--luca-glow)'

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? DESCRIPCION[estado]}
      className={`${ANIMACION[estado] ?? ''} ${className}`}
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="60" cy="106" rx="24" ry="4" fill={g} opacity="0.10" />

      <Alrededor estado={estado} g={g} />

      {/* antena */}
      <line x1="60" y1="26" x2="60" y2="13" stroke={g} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="10" r="4.2" fill={g} className={estado === 'idle' ? undefined : 'luca-antenna'} />

      {/* orejas */}
      <rect x="11" y="52" width="13" height="26" rx="6" fill={g} opacity="0.9" />
      <rect x="96" y="52" width="13" height="26" rx="6" fill={g} opacity="0.9" />

      {/* cabeza y visera */}
      <rect x="20" y="26" width="80" height="72" rx="26" fill="var(--luca-shell)" stroke={g} strokeWidth="2" />
      <path d="M40 30 h40 a22 22 0 0 1 16 12 h-72 a22 22 0 0 1 16 -12 z" fill={g} opacity="0.85" />

      {/* pantalla */}
      <rect x="30" y="44" width="60" height="42" rx="18" fill="var(--luca-screen)" />

      <Cara estado={estado} g={g} />
    </svg>
  )
}

/* Lo que ocurre fuera de la cabeza: burbujas, aro de carga, zZ. */
function Alrededor({ estado, g }: { estado: LucaEstado; g: string }) {
  if (estado === 'thinking') {
    return (
      <>
        <circle cx="99" cy="24" r="8" fill={g} opacity="0.16" />
        <circle cx="93" cy="21" r="2.2" fill={g} className="luca-dot-1" />
        <circle cx="99" cy="24" r="2.2" fill={g} className="luca-dot-2" />
        <circle cx="105" cy="27" r="2.2" fill={g} className="luca-dot-3" />
      </>
    )
  }

  if (estado === 'saving') {
    return (
      <g className="luca-spin" style={{ transformOrigin: '60px 62px' }}>
        <circle
          cx="60" cy="62" r="54"
          fill="none" stroke={g} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray="60 280" opacity="0.9"
        />
      </g>
    )
  }

  if (estado === 'sad') {
    return (
      <>
        <text x="96" y="30" fontSize="17" fontWeight="700" fill={g} opacity="0.6">z</text>
        <text x="108" y="19" fontSize="11" fontWeight="700" fill={g} opacity="0.38">z</text>
      </>
    )
  }

  if (estado === 'celebration') {
    return (
      <>
        <circle cx="12" cy="34" r="3" fill={g} className="luca-dot-1" />
        <circle cx="108" cy="40" r="2.5" fill={g} className="luca-dot-2" />
        <circle cx="100" cy="18" r="2" fill={g} className="luca-dot-3" />
        <circle cx="20" cy="16" r="2.2" fill={g} className="luca-dot-2" />
      </>
    )
  }

  return null
}

function Cara({ estado, g }: { estado: LucaEstado; g: string }) {
  switch (estado) {
    case 'thinking':
    case 'saving':
      return (
        <>
          <circle cx="47" cy="62" r="5.5" fill={g} />
          <circle cx="73" cy="62" r="5.5" fill={g} />
          <path d="M53 77 h14" stroke={g} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )

    case 'listening':
      return (
        <>
          <circle cx="47" cy="63" r="6" fill={g} />
          <circle cx="73" cy="63" r="6" fill={g} />
          <path d="M52 77 q8 5 16 0" fill="none" stroke={g} strokeWidth="2.6" strokeLinecap="round" />
        </>
      )

    case 'success':
      return (
        <>
          <path d="M41 65 q6 -8 12 0" fill="none" stroke={g} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M67 65 q6 -8 12 0" fill="none" stroke={g} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M51 74 q9 8 18 0" fill="none" stroke={g} strokeWidth="3" strokeLinecap="round" />
        </>
      )

    case 'celebration':
      return (
        <>
          <Estrella cx={47} cy={63} r={7} fill={g} />
          <Estrella cx={73} cy={63} r={7} fill={g} />
          <path d="M51 77 q9 7 18 0" fill="none" stroke={g} strokeWidth="3" strokeLinecap="round" />
        </>
      )

    case 'warning':
      return (
        <>
          <circle cx="47" cy="62" r="5.5" fill={g} />
          <circle cx="73" cy="62" r="5.5" fill={g} />
          <line x1="60" y1="73" x2="60" y2="79" stroke={g} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="60" cy="84" r="1.9" fill={g} />
        </>
      )

    case 'error':
      return (
        <>
          <path d="M42 58 l10 10 M52 58 l-10 10" stroke={g} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M68 58 l10 10 M78 58 l-10 10" stroke={g} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M52 81 q8 -6 16 0" fill="none" stroke={g} strokeWidth="3" strokeLinecap="round" />
        </>
      )

    case 'sad':
      return (
        <>
          <path d="M41 62 q6 6 12 0" fill="none" stroke={g} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M67 62 q6 6 12 0" fill="none" stroke={g} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M52 81 q8 -6 16 0" fill="none" stroke={g} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )

    default:
      return (
        <>
          <circle cx="47" cy="63" r="6" fill={g} className="luca-eye" />
          <circle cx="73" cy="63" r="6" fill={g} className="luca-eye" />
          <path d="M52 77 q8 6 16 0" fill="none" stroke={g} strokeWidth="2.8" strokeLinecap="round" />
        </>
      )
  }
}

function Estrella({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const puntos = Array.from({ length: 10 }, (_, i) => {
    const radio = i % 2 === 0 ? r : r / 2.3
    const ang = (Math.PI / 5) * i - Math.PI / 2
    return `${cx + radio * Math.cos(ang)},${cy + radio * Math.sin(ang)}`
  }).join(' ')
  return <polygon points={puntos} fill={fill} />
}
