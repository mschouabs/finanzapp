'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'rosa'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('userTheme') as Theme
    const initial = saved === 'rosa' ? 'rosa' : 'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', initial === 'rosa' ? '#FDF6F9' : '#080D13')
  }, [])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'rosa' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'rosa' ? '#FDF6F9' : '#080D13')
    localStorage.setItem('userTheme', next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
