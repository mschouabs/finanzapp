'use client'

/* ── Diálogos accesibles ──────────────────────────────────────────
   Un solo hook para todos los modales: Escape cierra, el foco entra
   al abrir, Tab no se escapa del diálogo, el fondo no scrollea y al
   cerrar el foco vuelve a donde estaba.                             */

import { useEffect, useRef } from 'react'

const FOCO = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogo<T extends HTMLElement>(onCerrar: () => void) {
  const ref = useRef<T>(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const el = ref.current
    /* si nada adentro pidió el foco (autoFocus), va al primer campo o botón */
    setTimeout(() => {
      if (el && !el.contains(document.activeElement)) {
        const primero = el.querySelector<HTMLElement>('input:not([disabled]), select, textarea') ?? el.querySelector<HTMLElement>(FOCO)
        primero?.focus()
      }
    }, 30)
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar.current() }
      if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCO)).filter(x => x.offsetParent !== null)
        if (!items.length) return
        const [a, z] = [items[0], items[items.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      previo?.focus?.()
    }
  }, [])

  return ref
}
