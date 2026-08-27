'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', label: 'Resumen', emoji: '📊' },
  { href: '/dashboard/ingresos-gastos', label: 'Ingresos y Gastos Fijos', emoji: '💼' },
  { href: '/dashboard/gastos-variables', label: 'Gastos Variables', emoji: '🛒' },
  { href: '/dashboard/inversiones', label: 'Inversiones', emoji: '📈' },
  { href: '/dashboard/metas', label: 'Metas de Ahorro', emoji: '🎯' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="px-6 py-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div><h1 className="font-bold text-lg leading-none">FinanzApp</h1><p className="text-muted text-xs mt-0.5">Tus finanzas</p></div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-confirm text-white' : 'text-muted hover:bg-slate-800 hover:text-white'}`}>
              <span className="text-lg">{item.emoji}</span>{item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-700">
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:bg-slate-800 hover:text-white transition-colors">
          <span className="text-lg">🚪</span>Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
