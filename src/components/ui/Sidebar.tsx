'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, Briefcase, ShoppingCart, TrendingUp, Target, Receipt,
  CreditCard, Download, Plus, Settings, LogOut, Menu, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ThemeSelector } from '@/components/ThemeSelector'
import { SeccionModal } from '@/components/SeccionModal'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import type { Seccion } from '@/lib/secciones'

const NAV = [
  { href: '/dashboard', label: 'Resumen', Icono: Home },
  { href: '/dashboard/ingresos-gastos', label: 'Trabajos', Icono: Briefcase },
  { href: '/dashboard/gastos-variables', label: 'Gastos & CC', Icono: ShoppingCart },
  { href: '/dashboard/inversiones', label: 'Portfolio', Icono: TrendingUp },
  { href: '/dashboard/metas', label: 'Metas', Icono: Target },
  { href: '/dashboard/historial', label: 'Historial', Icono: Receipt },
  { href: '/dashboard/tarjetas', label: 'Tarjetas', Icono: CreditCard },
  { href: '/dashboard/importar', label: 'Importar', Icono: Download },
]

export default function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [modal, setModal] = useState(false)
  const [abierta, setAbierta] = useState(false)

  const cargarSecciones = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('secciones')
        .select('*')
        .order('orden', { ascending: true })
        .order('created_at', { ascending: true })
      setSecciones((data ?? []) as Seccion[])
    } catch {
      setSecciones([])
    }
  }, [])

  useEffect(() => { cargarSecciones() }, [cargarSecciones])

  // Al navegar en mobile, el panel se cierra solo.
  useEffect(() => { setAbierta(false) }, [pathname])

  async function salir() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const item = (activa: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      activa ? 'text-primary' : 'text-secondary hover:bg-alternate hover:text-primary'
    }`

  const estiloActiva = { background: 'color-mix(in srgb, var(--accent-confirm) 16%, transparent)' }

  const contenido = (
    <div className="flex h-full flex-col gap-1 overflow-y-auto px-4 py-5">
      {/* marca */}
      <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-1">
        <Image src="/logo-f.png" alt="" width={296} height={353} priority className="h-8 w-auto" />
        <span className="text-lg font-extrabold text-primary">FinanzApp</span>
      </Link>

      {/* navegación */}
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icono }) => {
          const activa = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={activa ? 'page' : undefined}
              className={item(activa)}
              style={activa ? estiloActiva : undefined}
            >
              <Icono
                size={18}
                strokeWidth={2}
                style={activa ? { color: 'var(--accent-confirm)' } : undefined}
              />
              {label}
            </Link>
          )
        })}

        {secciones.length > 0 && (
          <div className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Mis secciones
          </div>
        )}

        {secciones.map(s => {
          const href = `/dashboard/seccion/${s.id}`
          const activa = pathname === href
          return (
            <Link
              key={s.id}
              href={href}
              aria-current={activa ? 'page' : undefined}
              className={item(activa)}
              style={activa ? estiloActiva : undefined}
            >
              <span className="w-[18px] text-center text-sm leading-none">{s.emoji}</span>
              <span className="truncate">{s.nombre}</span>
            </Link>
          )
        })}

        <button
          onClick={() => setModal(true)}
          className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-alternate hover:text-primary"
        >
          <Plus size={18} strokeWidth={2} />
          Nueva sección
        </button>
      </nav>

      {/* Luca */}
      <div className="fa-card mt-6 p-4 text-center">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-primary">Luca</span>
          <span className="flex items-center gap-1.5 text-[10px] text-secondary">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--accent-positive)' }}
            />
            Online
          </span>
        </div>
        <LucaAvatar estado="idle" size={72} className="mx-auto" />
        <p className="mt-2 text-[11px] leading-snug text-secondary">
          Estoy para ayudarte con tus finanzas.
        </p>
        <Link
          href="/dashboard/luca"
          className="mt-3 block rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-alternate"
          style={{ borderColor: 'var(--accent-confirm)', color: 'var(--accent-confirm)' }}
        >
          Hablar con Luca
        </Link>
      </div>

      {/* pie */}
      <div className="mt-auto pt-5">
        <div className="mb-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: 'var(--accent-confirm)' }}
              >
                {(userName || '?').charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-sm font-medium text-primary">{userName || 'Mi cuenta'}</span>
            </div>
            <ThemeSelector />
          </div>
        </div>

        <Link
          href="/dashboard/configuracion"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-secondary transition-colors hover:bg-alternate hover:text-primary"
        >
          <Settings size={17} strokeWidth={2} />
          Configuración
        </Link>
        <button
          onClick={salir}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-secondary transition-colors hover:bg-alternate hover:text-negative"
        >
          <LogOut size={17} strokeWidth={2} />
          Salir
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* barra superior sólo en mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-page px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo-f.png" alt="" width={296} height={353} className="h-7 w-auto" />
          <span className="font-extrabold text-primary">FinanzApp</span>
        </Link>
        <button
          onClick={() => setAbierta(true)}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-secondary hover:bg-alternate hover:text-primary"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* sidebar fija en escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-page lg:block">
        {contenido}
      </aside>

      {/* panel deslizante en mobile */}
      {abierta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAbierta(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-page">
            <button
              onClick={() => setAbierta(false)}
              aria-label="Cerrar menú"
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-secondary hover:bg-alternate hover:text-primary"
            >
              <X size={18} />
            </button>
            {contenido}
          </aside>
        </div>
      )}

      {modal && (
        <SeccionModal
          onClose={() => setModal(false)}
          onCreated={() => { cargarSecciones(); router.refresh() }}
        />
      )}
    </>
  )
}
