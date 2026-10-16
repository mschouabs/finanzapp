'use client'

/* Invitación a instalar FinanzApp cuando se abre desde el navegador del
   celular. No aparece dentro de la app instalada (Capacitor o pantalla de
   inicio) ni en computadora. Si la cerrás, vuelve a ofrecerse en 14 días. */

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { X } from 'lucide-react'

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const CLAVE = 'fa-instalar-cerrado'
const PAUSA = 14 * 864e5

function enAppInstalada() {
  const w = window as unknown as { Capacitor?: unknown; navigator: Navigator & { standalone?: boolean } }
  return Boolean(w.Capacitor)
    || window.matchMedia('(display-mode: standalone)').matches
    || w.navigator.standalone === true
    || /; wv\)/.test(navigator.userAgent)
}

export default function InstalarApp() {
  const pathname = usePathname()
  const [plataforma, setPlataforma] = useState<'android' | 'ios' | null>(null)
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && !enAppInstalada()) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/i.test(ua)
    const android = /Android/i.test(ua)
    if ((!ios && !android) || enAppInstalada()) return
    try {
      const t = Number(localStorage.getItem(CLAVE) || 0)
      if (t && Date.now() - t < PAUSA) return
    } catch { /* sin almacenamiento: se muestra igual */ }

    const alInstalar = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar) }
    const instalada = () => setPlataforma(null)
    window.addEventListener('beforeinstallprompt', alInstalar)
    window.addEventListener('appinstalled', instalada)
    const t = setTimeout(() => setPlataforma(ios ? 'ios' : 'android'), 2500)
    return () => {
      clearTimeout(t)
      window.removeEventListener('beforeinstallprompt', alInstalar)
      window.removeEventListener('appinstalled', instalada)
    }
  }, [])

  if (!plataforma) return null

  const cerrar = () => {
    try { localStorage.setItem(CLAVE, String(Date.now())) } catch { /* nada */ }
    setPlataforma(null)
  }

  const instalar = async () => {
    if (evento) {
      await evento.prompt()
      const r = await evento.userChoice.catch(() => null)
      if (r?.outcome === 'accepted') setPlataforma(null)
      setEvento(null)
    } else {
      setAyuda(true)
    }
  }

  const conBarra = pathname?.startsWith('/dashboard')

  return (
    <div
      role="dialog"
      aria-label="Instalar FinanzApp"
      className="fa-instalar fixed left-3 right-3 z-50 rounded-[22px] p-4 lg:hidden"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${conBarra ? 88 : 12}px)` }}
    >
      <div className="flex items-start gap-3">
        <Image src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-primary">Instalá FinanzApp</p>
          {!ayuda ? (
            <p className="mt-1 text-[13px] leading-snug text-secondary">Se abre como app, a pantalla completa y desde tu inicio.</p>
          ) : plataforma === 'ios' ? (
            <p className="mt-1 text-[13px] leading-snug text-secondary">En Safari tocá <b className="text-primary">Compartir</b> (el cuadrado con la flecha) y después <b className="text-primary">Agregar a inicio</b>.</p>
          ) : (
            <p className="mt-1 text-[13px] leading-snug text-secondary">Abrí el menú <b className="text-primary">⋮</b> del navegador y tocá <b className="text-primary">Instalar app</b> o <b className="text-primary">Agregar a la pantalla principal</b>.</p>
          )}
        </div>
        <button onClick={cerrar} aria-label="Cerrar" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted">
          <X size={18} />
        </button>
      </div>
      {!ayuda && (
        <div className="mt-3 flex gap-2">
          <button onClick={instalar} className="fa-press flex-1 rounded-full bg-confirm py-2.5 text-sm font-semibold text-white">
            {plataforma === 'ios' || !evento ? 'Cómo instalarla' : 'Instalar app'}
          </button>
          <button onClick={cerrar} className="fa-press rounded-full px-4 py-2.5 text-sm font-medium text-secondary">
            Seguir en la web
          </button>
        </div>
      )}
    </div>
  )
}
