'use client'
import { useTheme } from './ThemeProvider'

/* Selector de tema: control segmentado (Negro / Rosa), con una muestra de color en cada opción. */
const TEMAS = [
  { id: 'dark', nombre: 'Negro', muestra: '#0E0E10' },
  { id: 'rosa', nombre: 'Rosa', muestra: '#EFC6D3' },
] as const

export function ThemeSelector() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-grid grid-cols-2 rounded-control bg-alternate p-[3px]">
      {TEMAS.map(t => {
        const activo = theme === t.id
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={activo}
            onClick={() => !activo && toggleTheme()}
            className={`flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-xs font-medium transition-colors duration-150 ${activo ? 'bg-card text-primary shadow-card' : 'text-secondary hover:text-primary'}`}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: t.muestra, boxShadow: 'inset 0 0 0 1px rgba(127,127,127,.35)' }} />
            {t.nombre}
          </button>
        )
      })}
    </div>
  )
}
