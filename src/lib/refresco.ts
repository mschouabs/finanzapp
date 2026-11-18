'use client'
/* Refresco periódico que se pausa cuando la app no está a la vista
   (otra pestaña, celular bloqueado): no gasta datos ni batería, y al
   volver actualiza enseguida si ya pasó el intervalo.               */
import { useEffect, useRef } from 'react'

export function useRefrescoVisible(fn: () => void, ms: number) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let ultimo = Date.now()
    let id: ReturnType<typeof setInterval> | null = null
    const correr = () => { ultimo = Date.now(); ref.current() }
    const arrancar = () => { if (!id) id = setInterval(correr, ms) }
    const parar = () => { if (id) { clearInterval(id); id = null } }
    const alCambiar = () => {
      if (document.hidden) { parar(); return }
      if (Date.now() - ultimo >= ms) correr()
      arrancar()
    }
    if (!document.hidden) arrancar()
    document.addEventListener('visibilitychange', alCambiar)
    return () => { parar(); document.removeEventListener('visibilitychange', alCambiar) }
  }, [ms])
}
