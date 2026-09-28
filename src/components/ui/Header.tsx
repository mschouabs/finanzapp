'use client'

/* ── Header global (desktop) ────────────────────────────────────────
   Búsqueda global (Ctrl+K) + notificaciones. Vive arriba del
   contenido en todas las pantallas de /dashboard, así que solo pide
   los datos livianos que necesita (vencimientos de tarjeta, metas
   cerca de cumplirse) — no duplica la carga pesada de cada página. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { NAV_GRUPOS } from './Sidebar'
import {
  COLUMNAS_CONSUMO, avisosDeVencimiento, estadoTarjeta,
  type AvisoVencimiento, type Consumo, type TarjetaInfo,
} from '@/lib/resumenes'
import { traerCotizaciones } from '@/lib/patrimonio'

interface Notificacion {
  id: string
  texto: string
  href: string
  tono: string
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Header() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [notifAbierto, setNotifAbierto] = useState(false)
  const [avisos, setAvisos] = useState<AvisoVencimiento[]>([])
  const [metasCerca, setMetasCerca] = useState<{ id: string; nombre: string; pct: number }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierto(true)
      }
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 30)
    else setQ('')
  }, [abierto])

  /* notificaciones: mismos datos reales que ya usa Resumen para los
     avisos de vencimiento, más metas propias (sin billetera vinculada)
     que están al 90% o más. */
  useEffect(() => {
    let activo = true
    async function cargar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [cot, { data: ts }, { data: cs }, { data: metas }] = await Promise.all([
        traerCotizaciones(),
        supabase.from('tarjetas_cuentas').select('*').eq('tipo', 'tarjeta'),
        supabase.from('gastos_variables').select(COLUMNAS_CONSUMO).eq('forma_pago', 'credito').eq('pagado', false),
        supabase.from('metas').select('id, nombre, monto_objetivo, aportado, billetera_app'),
      ])
      if (!activo) return
      const dolar = cot.dolar ?? 1560
      const estados = ((ts ?? []) as TarjetaInfo[]).map(t => estadoTarjeta(t, (cs ?? []) as Consumo[], dolar))
      setAvisos(avisosDeVencimiento(estados, dolar, 7))

      const cerca = ((metas ?? []) as { id: string; nombre: string; monto_objetivo: number; aportado: number; billetera_app: string | null }[])
        .filter(m => !m.billetera_app && m.monto_objetivo > 0)
        .map(m => ({ id: m.id, nombre: m.nombre, pct: Math.round((Number(m.aportado) / m.monto_objetivo) * 100) }))
        .filter(m => m.pct >= 90 && m.pct < 100)
      setMetasCerca(cerca)
    }
    cargar()
    return () => { activo = false }
  }, [])

  const notificaciones: Notificacion[] = useMemo(() => [
    ...avisos.map(a => ({
      id: `t-${a.tarjeta.id}-${a.resumen.clave}`,
      texto: a.dias < 0
        ? `El resumen de ${a.tarjeta.nombre} venció hace ${-a.dias} días (${fmt(Math.round(a.monto))})`
        : `${a.tarjeta.nombre} vence ${a.dias === 0 ? 'hoy' : `en ${a.dias} ${a.dias === 1 ? 'día' : 'días'}`} (${fmt(Math.round(a.monto))})`,
      href: '/dashboard/tarjetas',
      tono: a.dias < 0 ? 'var(--accent-negative)' : 'var(--accent-warning)',
    })),
    ...metasCerca.map(m => ({
      id: `m-${m.id}`,
      texto: `Estás al ${m.pct}% de tu meta "${m.nombre}"`,
      href: '/dashboard/metas',
      tono: 'var(--accent-positive)',
    })),
  ], [avisos, metasCerca])

  const destinos = useMemo(
    () => NAV_GRUPOS.flatMap(g => g.items.map(it => ({ ...it, grupo: g.titulo }))),
    [],
  )
  const resultados = q.trim()
    ? destinos.filter(d => d.label.toLowerCase().includes(q.trim().toLowerCase()))
    : destinos

  function ir(href: string) {
    setAbierto(false)
    router.push(href)
  }

  return (
    <div
      className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b px-10 py-3 backdrop-blur lg:flex"
      style={{ background: 'color-mix(in srgb, var(--bg-page) 85%, transparent)' }}
    >

      <button
        onClick={() => setAbierto(true)}
        className="flex w-72 items-center gap-2 rounded-lg border bg-field px-3 py-2 text-xs text-muted hover:border-[var(--accent-confirm)] hover:text-secondary"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Buscar movimientos, cuentas, tarjetas…</span>
        <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted">Ctrl K</kbd>
      </button>

      <div className="relative">
        <button
          onClick={() => setNotifAbierto(v => !v)}
          aria-label="Notificaciones"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-alternate hover:text-primary"
        >
          <Bell size={18} />
          {notificaciones.length > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full"
              style={{ background: 'var(--accent-negative)' }}
            />
          )}
        </button>
        {notifAbierto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setNotifAbierto(false)} />
            <div className="fa-card absolute right-0 z-20 mt-2 w-80 overflow-hidden p-1.5">
              <div className="px-2.5 py-1.5 fa-label">Notificaciones</div>
              {notificaciones.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-xs text-muted">Todo tranquilo por ahora.</p>
              ) : (
                notificaciones.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setNotifAbierto(false); router.push(n.href) }}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-secondary hover:bg-alternate"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.tono }} />
                    <span className="flex-1">{n.texto}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh]" onClick={() => setAbierto(false)}>
          <div className="fa-card w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Search size={16} className="text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar movimientos, cuentas, tarjetas…"
                className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
              />
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-muted hover:text-primary">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {resultados.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">Sin resultados para &quot;{q}&quot;.</p>
              ) : (
                resultados.map(r => (
                  <button
                    key={r.href}
                    onClick={() => ir(r.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-secondary hover:bg-alternate hover:text-primary"
                  >
                    <r.Icono size={16} />
                    {r.label}
                    {r.grupo && <span className="ml-auto text-[10px] text-muted">{r.grupo}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
