'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">💰</span>
          <div>
            <h1 className="font-bold text-slate-800 leading-none text-base">FinanzApp</h1>
            <p className="text-slate-400 text-xs">Panel financiero</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-sm text-slate-500 hidden sm:block">{userName}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-red-500 font-medium transition-colors"
          >
            Salir →
          </button>
        </div>
      </div>
      <div className="px-6 flex gap-1 overflow-x-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span>{item.emoji}</span>
              {item.label}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
