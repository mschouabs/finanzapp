'use client'

/* Aviso global "cambiaron los datos": lo dispara quien guarda algo desde
   fuera de la pantalla (ej: el botón Nuevo del menú inferior) y lo escucha
   la pantalla abierta para recargar. */
import { useEffect } from 'react'

export const EVENTO_DATOS = 'finanzapp:datos-actualizados'

/** Ejecuta `recargar` cada vez que alguien avisa que cambiaron los datos. */
export function useAlCambiarDatos(recargar: () => void) {
  useEffect(() => {
    const h = () => recargar()
    window.addEventListener(EVENTO_DATOS, h)
    return () => window.removeEventListener(EVENTO_DATOS, h)
  }, [recargar])
}

/** Pide abrir el formulario de "Nuevo movimiento" (lo escucha la barra lateral). */
export const EVENTO_NUEVO = 'finanzapp:nuevo-movimiento'

/* ── Celebración: un pequeño festejo cuando lográs algo (meta cumplida, deuda saldada) ── */
export const EVENTO_CELEBRAR = 'finanzapp:celebrar'
export function celebrar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CELEBRAR))
}

/* ── Modo privado: oculta los montos con un toque (para usar la app en público) ── */
export const EVENTO_PRIVADO = 'finanzapp:privado'
const CLAVE_PRIVADO = 'finanzapp_privado'

export function privadoActivo(): boolean {
  try { return localStorage.getItem(CLAVE_PRIVADO) === '1' } catch { return false }
}

export function aplicarPrivado(on: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('fa-privado', on)
  try { localStorage.setItem(CLAVE_PRIVADO, on ? '1' : '0') } catch { /* sin storage */ }
  window.dispatchEvent(new Event(EVENTO_PRIVADO))
}

export function alternarPrivado() { aplicarPrivado(!privadoActivo()) }
