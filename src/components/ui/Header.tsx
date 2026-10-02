'use client'

/* ── Header global ────────────────────────────────────────────────
   · Buscador (Ctrl+K / "/"): busca en tus datos reales — movimientos,
     cuentas, tarjetas, metas, ingresos y viajes — además de pantallas
     y acciones. Si escribís un número, encuentra montos parecidos.
   · Luca te avisa: los mismos insights del Resumen, en cualquier
     pantalla (desktop y mobile).
   Usa el snapshot compartido, así no repite la carga del Resumen.    */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, CornerDownLeft, Plus, Search, X } from 'lucide-react'
import { NAV_GRUPOS } from './Sidebar'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { EVENTO_NUEVO, useAlCambiarDatos } from '@/lib/eventos'
import { useMedia } from '@/components/resumen/base'
import { snapshotCompartido } from '@/lib/finanzas/compartido'
import { insightsDe, type Insight } from '@/lib/finanzas/insights'
import type { Snapshot } from '@/lib/finanzas/nucleo'

interface Resultado {
  id: string
  grupo: string
  titulo: string
  detalle?: string
  monto?: string
  icono?: ReactNode
  /** ir a una ruta, o ejecutar una acción */
  href?: string
  accion?: () => void
}

const VISTOS_KEY = 'fa_avisos_vistos'
const fmt = (n: number) => (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fechaCorta = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const TONO: Record<Insight['tipo'], string> = {
  atencion: 'var(--accent-warning)', oportunidad: 'var(--accent-secondary)', progreso: 'var(--accent-positive)', dato: 'var(--text-muted)',
}

export function Header() {
  const router = useRouter()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [activo, setActivo] = useState(0)
  const [avisosAbierto, setAvisosAbierto] = useState(false)
  const [vistos, setVistos] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  const desktop = useMedia('(min-width: 1024px)')

  const cargar = useCallback(() => {
    snapshotCompartido().then(setSnap).catch(() => {})
  }, [])
  useEffect(() => {
    cargar()
    try { setVistos(JSON.parse(localStorage.getItem(VISTOS_KEY) || '[]')) } catch { /* sin storage */ }
  }, [cargar])
  useAlCambiarDatos(cargar)

  /* atajos: Ctrl/⌘+K o "/" abren el buscador */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(v => !v) }
      else if (e.key === '/' && !escribiendo) { e.preventDefault(); setAbierto(true) }
      else if (e.key === 'Escape') { setAbierto(false); setAvisosAbierto(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (abierto) { setTimeout(() => inputRef.current?.focus(), 30); cargar() }
    else { setQ(''); setActivo(0) }
  }, [abierto, cargar])

  /* ── avisos de Luca ── */
  const insights = useMemo(() => (snap ? insightsDe(snap).sort((a, b) => b.prioridad - a.prioridad) : []), [snap])
  const sinVer = insights.filter(i => i.tipo === 'atencion' && !vistos.includes(i.id)).length

  function abrirAvisos() {
    setAvisosAbierto(v => !v)
    const ids = insights.map(i => i.id)
    setVistos(ids)
    try { localStorage.setItem(VISTOS_KEY, JSON.stringify(ids)) } catch { /* sin storage */ }
  }

  function irA(href: string) {
    setAbierto(false); setAvisosAbierto(false)
    router.push(href.startsWith('#') ? `/dashboard${href}` : href)
  }

  /* ── búsqueda ── */
  const resultados: Resultado[] = useMemo(() => {
    const t = normal(q.trim())
    const acciones: Resultado[] = [
      { id: 'a-nuevo', grupo: 'Acciones', titulo: 'Registrar un movimiento', detalle: 'Gasto, ingreso o transferencia', icono: <Plus size={15} />, accion: () => window.dispatchEvent(new Event(EVENTO_NUEVO)) },
      { id: 'a-luca', grupo: 'Acciones', titulo: 'Preguntarle a Luca', detalle: 'Chat con tu asistente', href: '/dashboard/luca' },
      { id: 'a-importar', grupo: 'Acciones', titulo: 'Importar un CSV', href: '/dashboard/importar' },
    ]
    const paginas: Resultado[] = NAV_GRUPOS.flatMap(g => g.items.map(it => ({
      id: `p-${it.href}`, grupo: 'Pantallas', titulo: it.label, detalle: g.titulo ?? undefined,
      icono: <it.Icono size={15} />, href: it.href,
    })))

    if (!t) {
      const recientes: Resultado[] = (snap?.gastos ?? [])
        .slice().sort((a, b) => (b.fecha + b.created_at).localeCompare(a.fecha + a.created_at)).slice(0, 4)
        .map(g => ({ id: `r-${g.id}`, grupo: 'Últimos movimientos', titulo: g.nombre, detalle: `${fechaCorta(g.fecha)} · ${g.categoria}`, monto: fmt(-g.monto * (g.moneda === 'USD' ? snap!.dolar : 1)), href: `/dashboard/historial?q=${encodeURIComponent(g.nombre)}` }))
      return [...acciones, ...paginas, ...recientes]
    }

    const coincide = (...campos: (string | null | undefined)[]) => campos.some(c => c && normal(c).includes(t))
    const numero = Number(t.replace(/[$.\s]/g, '').replace(',', '.'))
    const esMonto = /^[\d$.,\s]+$/.test(t) && numero > 0
    const cerca = (v: number) => esMonto && Math.abs(v - numero) <= Math.max(1, numero * 0.02)
    const top = <T,>(xs: T[], n = 6) => xs.slice(0, n)
    const out: Resultado[] = []

    out.push(...acciones.filter(a => coincide(a.titulo, a.detalle)))
    out.push(...paginas.filter(p => coincide(p.titulo, p.detalle)))
    if (snap) {
      const dolar = snap.dolar
      /* movimientos: por nombre/categoría, o por monto parecido; agrupados por nombre */
      const vistosNombre = new Set<string>()
      const movs = snap.gastos
        .filter(g => coincide(g.nombre, g.categoria) || cerca(g.monto))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .filter(g => { const k = normal(g.nombre); if (esMonto) return true; if (vistosNombre.has(k)) return false; vistosNombre.add(k); return true })
      out.push(...top(movs).map(g => {
        const veces = esMonto ? 0 : snap.gastos.filter(x => normal(x.nombre) === normal(g.nombre)).length
        return {
          id: `g-${g.id}`, grupo: 'Movimientos', titulo: g.nombre,
          detalle: `${fechaCorta(g.fecha)} · ${g.categoria}${veces > 1 ? ` · ${veces} veces en el año` : ''}`,
          monto: fmt(-g.monto * (g.moneda === 'USD' ? dolar : 1)),
          href: `/dashboard/historial?q=${encodeURIComponent(g.nombre)}`,
        }
      }))
      out.push(...top(snap.lineas.filter(l => coincide(l.nombre, l.app, l.etiqueta) || cerca(Number(l.monto))), 4).map(l => ({
        id: `l-${l.id}`, grupo: 'Cuentas', titulo: `${l.etiqueta || l.app} · ${l.nombre}`,
        monto: l.moneda === 'ARS' ? fmt(Number(l.monto)) : `${l.moneda} ${Number(l.monto).toLocaleString('es-AR')}`,
        href: '/dashboard/billeteras',
      })))
      out.push(...top(snap.tarjetas.filter(x => coincide(x.nombre)), 3).map(x => ({
        id: `t-${x.id}`, grupo: 'Tarjetas', titulo: x.nombre, href: '/dashboard/tarjetas',
      })))
      out.push(...top(snap.metas.filter(m => coincide(m.nombre)), 3).map(m => ({
        id: `m-${m.id}`, grupo: 'Metas', titulo: `${m.emoji ?? '🎯'} ${m.nombre}`,
        detalle: m.objetivo > 0 ? `${Math.round((m.aportado / m.objetivo) * 100)}% juntado` : undefined, href: '/dashboard/metas',
      })))
      out.push(...top([
        ...snap.ingresosFijos.filter(i => coincide(i.nombre) || cerca(i.monto)).map(i => ({ id: `if-${i.id}`, titulo: i.nombre, detalle: 'Sueldo', monto: fmt(i.monto) })),
        ...snap.freelance.filter(f => coincide(f.titulo) || cerca(f.monto)).map(f => ({ id: `fl-${f.id}`, titulo: f.titulo, detalle: `Cobro · ${fechaCorta(f.fecha)}`, monto: fmt(f.monto) })),
      ], 4).map(x => ({ ...x, grupo: 'Ingresos', href: '/dashboard/ingresos-gastos' })))
      out.push(...top(snap.viajes.filter(v => coincide(v.concepto, v.viaje, v.categoria) || cerca(v.monto)), 4).map(v => ({
        id: `v-${v.id}`, grupo: 'Viajes', titulo: v.concepto, detalle: `${v.viaje} · ${fechaCorta(v.fecha)}`, monto: fmt(-v.monto), href: '/dashboard/viajes',
      })))
    }
    return out
  }, [q, snap])

  useEffect(() => { setActivo(0) }, [q])

  function elegir(r: Resultado) {
    setAbierto(false)
    if (r.accion) r.accion()
    else if (r.href) router.push(r.href)
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(resultados.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && resultados[activo]) { e.preventDefault(); elegir(resultados[activo]) }
  }
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  return (
    <div className="sticky top-0 z-30 flex items-center justify-end gap-1.5 border-b px-4 py-2 backdrop-blur fa-hairline lg:gap-2 lg:px-10 lg:py-3"
      style={{ background: 'color-mix(in srgb, var(--bg-page) 85%, transparent)' }}>
      <span className="mr-auto text-sm font-extrabold tracking-tight text-primary lg:hidden">FinanzApp</span>

      {/* buscador: barra en desktop, ícono en mobile */}
      <button onClick={() => setAbierto(true)} aria-label="Buscar"
        className="fa-press hidden w-80 items-center gap-2 rounded-lg border bg-field px-3 py-2 text-xs text-muted hover:text-secondary lg:flex">
        <Search size={14} />
        <span className="flex-1 text-left">Buscar en tus datos…</span>
        <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted">Ctrl K</kbd>
      </button>
      <button onClick={() => setAbierto(true)} aria-label="Buscar"
        className="fa-press grid h-10 w-10 place-items-center rounded-lg text-secondary hover:bg-alternate hover:text-primary lg:hidden">
        <Search size={19} />
      </button>

      {/* avisos de Luca */}
      <div className="relative">
        <button onClick={abrirAvisos} aria-label={`Avisos de Luca${sinVer ? ` (${sinVer} nuevos)` : ''}`} aria-expanded={avisosAbierto}
          className="fa-press relative grid h-10 w-10 place-items-center rounded-lg text-secondary hover:bg-alternate hover:text-primary">
          <Bell size={19} />
          {sinVer > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: 'var(--accent-negative)' }}>{sinVer}</span>
          )}
        </button>
        {avisosAbierto && createPortal(
          <>
            <button className="fixed inset-0 z-[55] cursor-default bg-black/40 lg:bg-transparent" aria-label="Cerrar avisos" onClick={() => setAvisosAbierto(false)} />
            <div role="dialog" aria-label="Avisos de Luca"
              className={`${desktop ? 'fa-pop' : 'fa-sheet-up'} fixed inset-x-0 bottom-0 z-[56] max-h-[75vh] overflow-y-auto rounded-t-2xl border p-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] shadow-card-hover lg:inset-x-auto lg:bottom-auto lg:right-10 lg:top-[calc(var(--header-h)+4px)] lg:w-[380px] lg:rounded-2xl`}
              style={{ background: 'var(--bg-alternate)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <LucaAvatar estado={insights.some(i => i.tipo === 'atencion') ? 'warning' : 'idle'} size={26} />
                <p className="flex-1 text-sm font-bold text-primary">Luca te avisa</p>
                <button onClick={() => setAvisosAbierto(false)} aria-label="Cerrar" className="fa-press grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-primary"><X size={16} /></button>
              </div>
              {!snap ? (
                <p className="px-3 py-6 text-center text-xs text-muted">Revisando tus números…</p>
              ) : insights.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">Todo tranquilo por ahora.</p>
              ) : (
                <ul className="flex flex-col gap-1 pb-1">
                  {insights.map(i => (
                    <li key={i.id} className="rounded-xl px-3 py-2.5 hover:bg-card">
                      <p className="flex items-start gap-2 text-sm font-semibold text-primary">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TONO[i.tipo] }} />
                        <span>{i.titulo}</span>
                      </p>
                      <p className="ml-4 mt-1 text-xs leading-relaxed text-secondary">{i.detalle}</p>
                      {i.accion && (
                        <button onClick={() => irA(i.accion!.href)} className="fa-press ml-4 mt-1.5 text-xs font-semibold text-info hover:underline">
                          {i.accion.label} →
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>,
          document.body,
        )}
      </div>

      {/* paleta de búsqueda */}
      {abierto && createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[8vh] lg:pt-[12vh]" onClick={() => setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Buscar"
            className="fa-pop w-full max-w-xl overflow-hidden rounded-2xl border shadow-card-hover"
            style={{ background: 'var(--bg-alternate)', borderColor: 'var(--border-color)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-4 fa-hairline">
              <Search size={17} className="text-muted" />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={teclas}
                role="combobox" aria-expanded="true" aria-controls="paleta-lista" aria-activedescendant={resultados[activo] ? `res-${resultados[activo].id}` : undefined}
                placeholder="Buscá un gasto, una cuenta, un monto…"
                className="h-14 flex-1 bg-transparent text-[15px] text-primary outline-none placeholder:text-muted" />
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="fa-press grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-primary"><X size={16} /></button>
            </div>
            <ul ref={listaRef} id="paleta-lista" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
              {resultados.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted">No encontré nada con &quot;{q}&quot;.</li>
              ) : resultados.map((r, i) => {
                const nuevoGrupo = i === 0 || resultados[i - 1].grupo !== r.grupo
                const on = i === activo
                return (
                  <li key={r.id} role="presentation">
                    {nuevoGrupo && <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">{r.grupo}</p>}
                    <button id={`res-${r.id}`} data-i={i} role="option" aria-selected={on}
                      onMouseMove={() => setActivo(i)} onClick={() => elegir(r)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                      style={{ background: on ? 'var(--bg-card)' : undefined }}>
                      {r.icono && <span className="text-secondary">{r.icono}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-primary">{r.titulo}</span>
                        {r.detalle && <span className="block truncate text-[11px] text-muted">{r.detalle}</span>}
                      </span>
                      {r.monto && <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{r.monto}</span>}
                      {on && <CornerDownLeft size={14} className="shrink-0 text-muted" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="hidden border-t px-4 py-2 text-[11px] text-muted fa-hairline lg:block">
              ↑↓ para moverte · Enter para abrir · Esc para cerrar · tip: escribí un monto para encontrarlo
            </p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
