'use client'

/* ── Experiencia global ────────────────────────────────────────────
   Lo que hace que la app se sienta ágil, en cualquier pantalla:
     · Atajos de teclado: "g" + letra para ir a cada sección, "p" para
       ocultar montos, "?" para ver la lista de atajos.
     · Tirar hacia abajo (celular) para actualizar los datos.
     · Modo privado: los montos se reemplazan por *** hasta que lo apagás.
     · Festejo cuando lográs algo (meta cumplida, deuda saldada).
   Todo respeta "reducir movimiento" del sistema.                    */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X } from 'lucide-react'
import { EVENTO_CELEBRAR, EVENTO_DATOS, EVENTO_NUEVO, alternarPrivado, aplicarPrivado, privadoActivo } from '@/lib/eventos'

const IR: Record<string, { href: string; label: string }> = {
  r: { href: '/dashboard', label: 'Resumen' },
  m: { href: '/dashboard/gastos-variables', label: 'Movimientos' },
  b: { href: '/dashboard/billeteras', label: 'Billeteras' },
  t: { href: '/dashboard/tarjetas', label: 'Tarjetas' },
  d: { href: '/dashboard/me-deben', label: 'Me deben' },
  v: { href: '/dashboard/viajes', label: 'Viajes' },
  e: { href: '/dashboard/metas', label: 'Metas' },
  j: { href: '/dashboard/ingresos-gastos', label: 'Trabajos' },
  i: { href: '/dashboard/inversiones', label: 'Portfolio' },
  h: { href: '/dashboard/historial', label: 'Historial' },
  l: { href: '/dashboard/luca', label: 'Luca' },
}

const menosMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Experiencia() {
  const router = useRouter()
  const [ayuda, setAyuda] = useState(false)
  const [tirando, setTirando] = useState(0)
  const [actualizando, setActualizando] = useState(false)
  const [fiesta, setFiesta] = useState(0)
  const esperandoG = useRef<number | null>(null)

  /* modo privado: se restaura al abrir la app */
  useEffect(() => { aplicarPrivado(privadoActivo()) }, [])

  /* atajos de teclado */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const escribiendo = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (escribiendo || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (esperandoG.current !== null) {
        window.clearTimeout(esperandoG.current)
        esperandoG.current = null
        const destino = IR[k]
        if (destino) { e.preventDefault(); router.push(destino.href) }
        return
      }
      if (k === 'g') { esperandoG.current = window.setTimeout(() => { esperandoG.current = null }, 900); return }
      if (e.key === '?') { e.preventDefault(); setAyuda(v => !v); return }
      if (k === 'p') { e.preventDefault(); alternarPrivado(); return }
      if (e.key === 'Escape') setAyuda(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  /* tirar hacia abajo para actualizar (solo pantallas táctiles, desde arriba de todo) */
  useEffect(() => {
    let inicio: number | null = null
    let dist = 0
    const start = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector('[aria-modal="true"]')) { inicio = null; return }
      inicio = e.touches[0].clientY; dist = 0
    }
    const move = (e: TouchEvent) => {
      if (inicio === null) return
      dist = Math.max(0, e.touches[0].clientY - inicio)
      if (dist > 6 && window.scrollY <= 0) setTirando(Math.min(dist * 0.5, 90))
    }
    const end = () => {
      if (inicio !== null && dist * 0.5 >= 64) {
        setActualizando(true)
        window.dispatchEvent(new Event(EVENTO_DATOS))
        if (navigator.vibrate) navigator.vibrate(12)
        window.setTimeout(() => setActualizando(false), 900)
      }
      inicio = null; dist = 0; setTirando(0)
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', end)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
    }
  }, [])

  /* festejo */
  useEffect(() => {
    const h = () => {
      if (menosMovimiento()) return
      setFiesta(n => n + 1)
      if (navigator.vibrate) navigator.vibrate([10, 40, 20])
    }
    window.addEventListener(EVENTO_CELEBRAR, h)
    return () => window.removeEventListener(EVENTO_CELEBRAR, h)
  }, [])
  useEffect(() => {
    if (!fiesta) return
    const t = window.setTimeout(() => setFiesta(0), 1600)
    return () => window.clearTimeout(t)
  }, [fiesta])

  const visible = tirando > 0 || actualizando
  return (
    <>
      {/* indicador de "tirar para actualizar" */}
      {visible && (
        <div className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 lg:hidden"
          style={{ top: `calc(env(safe-area-inset-top, 0px) + ${actualizando ? 64 : 8 + tirando * 0.6}px)`, transition: tirando ? 'none' : 'top 200ms ease' }}>
          <span className="fa-vidrio grid h-10 w-10 place-items-center rounded-full border fa-hairline"
            style={{ boxShadow: '0 8px 20px -10px rgba(0,0,0,.5)' }}>
            <RefreshCw size={17} className={actualizando ? 'animate-spin' : ''}
              style={{ color: tirando >= 64 || actualizando ? 'var(--accent-confirm)' : 'var(--text-muted)', transform: actualizando ? undefined : `rotate(${tirando * 4}deg)` }} />
          </span>
        </div>
      )}

      {/* festejo */}
      {fiesta > 0 && (
        <div key={fiesta} className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden="true">
          {Array.from({ length: 34 }, (_, i) => {
            const colores = ['var(--accent-confirm)', 'var(--accent-positive)', 'var(--accent-secondary)', 'var(--accent-warning)', 'var(--accent-violet)']
            const x = (i * 37) % 100
            return (
              <span key={i} className="fa-confeti" style={{
                left: `${x}%`, background: colores[i % colores.length],
                animationDelay: `${(i % 7) * 40}ms`, ['--deriva' as string]: `${((i * 53) % 120) - 60}px`,
                ['--giro' as string]: `${(i * 97) % 720}deg`, width: i % 3 ? 7 : 10, height: i % 2 ? 12 : 7,
              }} />
            )
          })}
        </div>
      )}

      {/* ayuda de atajos */}
      {ayuda && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="t-atajos" onClick={() => setAyuda(false)}>
          <div className="fa-pop fa-tile w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 id="t-atajos" className="text-base font-bold text-primary">Atajos de teclado</h2>
              <button onClick={() => setAyuda(false)} aria-label="Cerrar" className="fa-press grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-alternate hover:text-primary"><X size={16} /></button>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[['Ctrl K  o  /', 'Buscar'], ['N', 'Nuevo movimiento (en el Resumen)'], ['P', 'Ocultar / mostrar montos'], ['?', 'Esta ayuda'],
                ...Object.entries(IR).map(([k, v]) => [`G  ${k.toUpperCase()}`, v.label])].map(([t, d]) => (
                <li key={t} className="flex items-center justify-between gap-3">
                  <span className="text-secondary">{d}</span>
                  <kbd className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold text-primary fa-hairline">{t}</kbd>
                </li>
              ))}
            </ul>
            <button onClick={() => { setAyuda(false); window.dispatchEvent(new Event(EVENTO_NUEVO)) }}
              className="fa-press mt-5 w-full rounded-xl bg-confirm py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">Registrar un movimiento</button>
          </div>
        </div>
      )}
    </>
  )
}
