'use client'
import { useTheme } from './ThemeProvider'

const SIZE = 28

export function ThemeSelector() {
  const { theme, toggleTheme } = useTheme()

  const base: React.CSSProperties = {
    width: SIZE,
    height: SIZE,
    borderRadius: '50%',
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
    flexShrink: 0,
    transition: 'border-color 200ms, transform 200ms',
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => theme !== 'dark' && toggleTheme()}
        title="Tema Oscuro"
        aria-label="Cambiar a tema oscuro"
        aria-pressed={theme === 'dark'}
        style={{
          ...base,
          background: '#0D1117',
          border: theme === 'dark' ? '2px solid #3FB950' : '2px solid #30363D',
          transform: theme === 'dark' ? 'scale(1)' : 'scale(0.9)',
          cursor: theme === 'dark' ? 'default' : 'pointer',
        }}
      />
      <button
        onClick={() => theme !== 'rosa' && toggleTheme()}
        title="Tema Rosa"
        aria-label="Cambiar a tema rosa"
        aria-pressed={theme === 'rosa'}
        style={{
          ...base,
          background: '#D4849C',
          border: theme === 'rosa' ? '2px solid #C85A6D' : '2px solid transparent',
          transform: theme === 'rosa' ? 'scale(1)' : 'scale(0.9)',
          cursor: theme === 'rosa' ? 'default' : 'pointer',
        }}
      />
    </div>
  )
}
