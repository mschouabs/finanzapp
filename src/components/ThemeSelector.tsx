'use client'
import { useTheme } from './ThemeProvider'

export function ThemeSelector() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        onClick={() => theme !== 'dark' && toggleTheme()}
        title="Tema Oscuro"
        aria-label="Cambiar a tema oscuro"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#0D1117',
          border: theme === 'dark' ? '2.5px solid #C9D1D9' : '2px solid #444',
          cursor: theme === 'dark' ? 'default' : 'pointer',
          padding: 0,
          outline: 'none',
          transition: 'border 200ms',
          flexShrink: 0,
        }}
      />
      <button
        onClick={() => theme !== 'rosa' && toggleTheme()}
        title="Tema Rosa"
        aria-label="Cambiar a tema rosa"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#FAF6F3',
          border: theme === 'rosa' ? '2.5px solid #C85A6D' : '2px solid #aaa',
          cursor: theme === 'rosa' ? 'default' : 'pointer',
          padding: 0,
          outline: 'none',
          transition: 'border 200ms',
          flexShrink: 0,
        }}
      />
    </div>
  )
}
