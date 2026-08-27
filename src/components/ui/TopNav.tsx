'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ThemeSelector } from '@/components/ThemeSelector'

const navItems = [
  { href: '/dashboard', label: 'Resumen', emoji: '📊' },
  { href: '/dashboard/ingresos-gastos', label: 'Trabajos', emoji: '💼' },
  { href: '/dashboard/gastos-variables', label: 'Gastos & CC', emoji: '🛒' },
  { href: '/dashboard/inversiones', label: 'Portfolio', emoji: '📈' },
  { href: '/dashboard/metas', label: 'Metas', emoji: '🎯' },
  { href: '/dashboard/historial', label: 'Historial', emoji: '📋' },
  { href: '/dashboard/tarjetas', label: 'Tarjetas', emoji: '💳' },
]

export default function TopNav({ userName }: { userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="fa-card mb-6 overflow-hidden">
      {/* Fila superior: identidad + acciones */}
      <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-primary leading-tight">
            💰 FinanzApp
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Control de gastos e inversiones
          </p>
        </div>

        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-xs text-secondary hidden sm:block">{userName}</span>
          )}
          <ThemeSelector />
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-secondary hover:text-negative transition-colors"
          >
            Salir →
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="px-5 pb-4 flex gap-2 flex-wrap">
        {navItems.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap border transition-colors ${
                isActive
                  ? 'bg-confirm border-confirm text-white'
                  : 'bg-card text-secondary hover:text-primary hover:bg-alternate'
              }`}
              style={isActive ? { borderColor: 'var(--accent-confirm)' } : undefined}
            >
              <span>{item.emoji}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
