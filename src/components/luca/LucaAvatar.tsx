'use client'

export type LucaEstado = 'idle' | 'thinking' | 'celebration' | 'sad'

interface Props {
  estado?: LucaEstado
  size?: number
}

function FaceIdle() {
  return (
    <>
      <ellipse cx="25" cy="30" rx="8" ry="9" fill="#22c55e" opacity="0.12" />
      <ellipse cx="25" cy="30" rx="5.5" ry="6.5" fill="#22c55e" />
      <ellipse cx="23" cy="28" rx="1.8" ry="2.2" fill="white" opacity="0.55" />
      <ellipse cx="51" cy="30" rx="8" ry="9" fill="#22c55e" opacity="0.12" />
      <ellipse cx="51" cy="30" rx="5.5" ry="6.5" fill="#22c55e" />
      <ellipse cx="49" cy="28" rx="1.8" ry="2.2" fill="white" opacity="0.55" />
      <path d="M 24 44 Q 38 53 52 44" stroke="#22c55e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  )
}

function FaceThinking() {
  return (
    <>
      <circle cx="22" cy="33" r="4.5" fill="#22c55e">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0s" repeatCount="indefinite" />
      </circle>
      <circle cx="38" cy="33" r="4.5" fill="#22c55e">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="54" cy="33" r="4.5" fill="#22c55e">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
      </circle>
    </>
  )
}

function FaceCelebration() {
  return (
    <>
      <text x="12" y="40" fontSize="19" fill="#fbbf24">&#9733;</text>
      <text x="44" y="40" fontSize="19" fill="#fbbf24">&#9733;</text>
      <path d="M 20 46 Q 38 58 56 46" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  )
}

function FaceSad() {
  return (
    <>
      <line x1="19" y1="24" x2="31" y2="36" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="31" y1="24" x2="19" y2="36" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="45" y1="24" x2="57" y2="36" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="57" y1="24" x2="45" y2="36" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 24 50 Q 38 43 52 50" stroke="#f87171" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  )
}

const FACES = { idle: FaceIdle, thinking: FaceThinking, celebration: FaceCelebration, sad: FaceSad }

export function LucaAvatar({ estado = 'idle', size = 40 }: Props) {
  const Face = FACES[estado]

  return (
    <svg
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 76 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Luca"
    >
      <line x1="38" y1="2" x2="38" y2="10" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="38" cy="1.5" r="3.5" fill="#22c55e" />
      <ellipse cx="38" cy="36" rx="34" ry="30" fill="white" />
      <ellipse cx="38" cy="64" rx="22" ry="3" fill="black" opacity="0.06" />
      <rect x="1" y="22" width="9" height="22" rx="4.5" fill="#15803d" />
      <rect x="2.5" y="27" width="6" height="12" rx="3" fill="#22c55e" opacity="0.55" />
      <rect x="66" y="22" width="9" height="22" rx="4.5" fill="#15803d" />
      <rect x="67.5" y="27" width="6" height="12" rx="3" fill="#22c55e" opacity="0.55" />
      <rect x="9" y="12" width="58" height="48" rx="16" fill="#0f1623" />
      <rect x="9" y="12" width="58" height="48" rx="16" fill="#22c55e" opacity="0.03" />
      <Face />
      <rect x="17" y="66" width="42" height="18" rx="9" fill="white" />
      <text x="38" y="80" fontSize="13" fontWeight="bold" fill="#15803d" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">F</text>
      <ellipse cx="11" cy="74" rx="6" ry="7" fill="white" />
      <ellipse cx="65" cy="74" rx="6" ry="7" fill="white" />
    </svg>
  )
}
