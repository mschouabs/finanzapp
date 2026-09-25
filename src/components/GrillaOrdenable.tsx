'use client'

/* ── Grilla ordenable con arrastrar y soltar ─────────────────────────
   Sin librerías: usa pointer events, así funciona igual con mouse y
   con el dedo en el celular. Mientras arrastrás una tarjeta, las demás
   se van corriendo (con una animación corta) y al soltar se avisa el
   orden nuevo para guardarlo. El arrastre arranca solo desde la
   "manija" (handleProps), para no pelearse con los botones y el scroll. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  style: React.CSSProperties
  'aria-label': string
}

interface Props {
  ids: string[]
  onReordenar: (ids: string[]) => void
  render: (id: string, handle: HandleProps, arrastrando: boolean) => ReactNode
  className?: string
}

export function GrillaOrdenable({ ids, onReordenar, render, className }: Props) {
  const [lista, setLista] = useState(ids)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const nodos = useRef(new Map<string, HTMLElement>())
  const posiciones = useRef(new Map<string, DOMRect>())
  const listaRef = useRef(lista)
  listaRef.current = lista

  /* Si cambian los datos (se agrega/borra una billetera) y no estamos
     arrastrando, tomamos el orden que viene de afuera. */
  const clave = ids.join('|')
  useEffect(() => {
    if (!arrastrando) setLista(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  /* Animación FLIP: cada tarjeta que cambió de lugar se desliza desde
     su posición anterior a la nueva. */
  useLayoutEffect(() => {
    const nuevas = new Map<string, DOMRect>()
    nodos.current.forEach((el, id) => {
      const ahora = el.getBoundingClientRect()
      const antes = posiciones.current.get(id)
      if (antes && id !== arrastrando && (antes.left !== ahora.left || antes.top !== ahora.top)) {
        el.animate(
          [{ transform: `translate(${antes.left - ahora.left}px, ${antes.top - ahora.top}px)` }, { transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      }
      nuevas.set(id, ahora)
    })
    posiciones.current = nuevas
  }, [lista, arrastrando])

  useEffect(() => {
    if (!arrastrando) return

    const mover = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-orden-id]')
      const destino = el?.dataset.ordenId
      if (!el || !destino || destino === arrastrando || !contenedor.current?.contains(el)) return
      setLista(prev => {
        const sin = prev.filter(x => x !== arrastrando)
        const i = prev.indexOf(destino)
        const desde = prev.indexOf(arrastrando)
        /* si venís de antes, caés después del destino, y viceversa */
        const idx = sin.indexOf(destino) + (desde < i ? 1 : 0)
        sin.splice(idx, 0, arrastrando)
        return sin
      })
    }
    const soltar = () => {
      setArrastrando(null)
      if (listaRef.current.join('|') !== clave) onReordenar(listaRef.current)
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [arrastrando, clave, onReordenar])

  return (
    <div ref={contenedor} className={className}>
      {lista.map(id => {
        const activo = arrastrando === id
        const handle: HandleProps = {
          onPointerDown: e => {
            if (e.button !== 0) return
            e.preventDefault()
            setArrastrando(id)
          },
          style: { touchAction: 'none', cursor: activo ? 'grabbing' : 'grab' },
          'aria-label': 'Arrastrar para reordenar',
        }
        return (
          <div
            key={id}
            data-orden-id={id}
            ref={el => { if (el) nodos.current.set(id, el); else nodos.current.delete(id) }}
            style={{
              transition: 'box-shadow .15s, transform .15s, opacity .15s',
              transform: activo ? 'scale(1.03)' : undefined,
              opacity: activo ? 0.92 : 1,
              zIndex: activo ? 10 : undefined,
              position: 'relative',
              userSelect: arrastrando ? 'none' : undefined,
            }}
          >
            {render(id, handle, activo)}
          </div>
        )
      })}
    </div>
  )
}
