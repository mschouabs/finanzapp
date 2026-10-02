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
