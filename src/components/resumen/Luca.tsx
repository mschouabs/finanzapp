'use client'

/* ── Luca, capa de inteligencia ────────────────────────────────────
   1) LucaInsights: lo que Luca detectó, de a uno, con su "¿por qué?"
      y una acción. Se pueden ocultar (por hoy).
   2) CapturaLuca: el input único de Luca, en todas las pantallas.
      Escribís en lenguaje natural; Luca muestra lo que entendió y vos
      confirmás, editás o cancelás. No es un chat: el chat completo
      queda aparte (/dashboard/luca) para seguir una conversación.     */

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Lightbulb, Sparkles, TrendingUp, X } from 'lucide-react'
import { LucaAvatar, type LucaEstado } from '@/components/luca/LucaAvatar'
import { CATEGORIAS, getCat } from '@/lib/categorias'
import { fmt, fmtFechaCorta } from './base'
import type { Insight, TipoInsight } from '@/lib/finanzas/insights'
import { hoyISO } from '@/lib/fechas'
import { useRouter } from 'next/navigation'
import { parsear, parsearVarios } from '@/lib/parser'
import { createClient } from '@/lib/supabase'
import { guardarGastoVariable } from '@/lib/movimientos'
import { snapshotCompartido } from '@/lib/finanzas/compartido'
import { construirContexto } from '@/lib/luca/contexto'
import { comoRegistroSimple, ejecutarAccion, prepararAccion, type AccionPropuesta, type Vista } from '@/lib/luca/acciones'
import { EVENTO_DATOS } from '@/lib/eventos'
import { guardarRegistroSimple, type TablaRegistro } from '@/lib/luca/registro'

const TIPO: Record<TipoInsight, { label: string; color: string; Icono: typeof Lightbulb }> = {
  atencion: { label: 'Atención', color: 'var(--accent-warning)', Icono: AlertTriangle },
  oportunidad: { label: 'Oportunidad', color: 'var(--accent-secondary)', Icono: Lightbulb },
  progreso: { label: 'Progreso', color: 'var(--accent-positive)', Icono: TrendingUp },
  dato: { label: 'Para tener en cuenta', color: 'var(--text-secondary)', Icono: Sparkles },
}

const CLAVE_OCULTOS = () => `fa_insights_ocultos_${hoyISO()}`

function leerOcultos(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_OCULTOS()) || '[]') as string[] } catch { return [] }
}

/* ── insights ─────────────────────────────────────────────────── */

export function LucaInsights({ insights, cargando = false }: { insights: Insight[]; cargando?: boolean }) {
  const [ocultos, setOcultos] = useState<string[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)
  const [porQue, setPorQue] = useState(false)

  useEffect(() => { setOcultos(leerOcultos()) }, [])

  const visibles = insights.filter(i => !ocultos.includes(i.id))
  const principal = visibles.find(i => i.id === abierto) ?? visibles[0]
  const resto = visibles.filter(i => i !== principal).slice(0, 3)

  function ocultar(id: string) {
    const n = [...ocultos, id]
    setOcultos(n)
    setPorQue(false)
    try { localStorage.setItem(CLAVE_OCULTOS(), JSON.stringify(n)) } catch { /* sin storage */ }
  }

  function irA(href: string, e: React.MouseEvent) {
    if (!href.startsWith('#')) return
    e.preventDefault()
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const estado: LucaEstado = cargando ? 'thinking' : principal ? (principal.tipo === 'atencion' ? 'warning' : principal.tipo === 'progreso' ? 'success' : 'insight') : 'idle'
  const t = principal ? TIPO[principal.tipo] : null

  return (
    <section aria-labelledby="t-luca" className="fa-borde-vivo relative flex h-full min-w-0 flex-col rounded-[18px] p-5"
      style={{
        background: 'radial-gradient(420px 180px at 0% 0%, color-mix(in srgb, var(--accent-luca) 11%, transparent), transparent 70%), var(--bg-card)',
        boxShadow: '0 18px 40px -26px color-mix(in srgb, var(--accent-luca) 60%, transparent)',
      }}>
      <div className="flex items-center gap-3">
        <div className="luca-float"><LucaAvatar estado={estado} size={38} /></div>
        <div className="min-w-0 flex-1">
          <h2 id="t-luca" className="text-sm font-bold text-primary">Luca</h2>
          <p className="text-[11px] text-secondary" aria-live="polite">
            {cargando ? 'Mirando tus números…' : visibles.length ? `Detecté ${visibles.length} ${visibles.length === 1 ? 'cosa' : 'cosas'} para mirar` : 'No veo nada raro por ahora'}
          </p>
        </div>
      </div>

      {principal && t ? (
        <div key={principal.id} className="fa-page-in mb-4 mt-4">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.05em]" style={{ color: t.color }}>
            <t.Icono size={13} /> {t.label}
          </p>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-primary" aria-label={principal.titulo}>
            <Escribiendo texto={principal.titulo} />
          </p>

          <div className="fa-colapsable" data-abierto={porQue}>
            <div>
              <p className="mt-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-secondary" style={{ background: 'var(--bg-alternate)' }}>
                {principal.detalle}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {principal.accion && (
              <Link href={principal.accion.href} onClick={e => principal.accion && irA(principal.accion.href, e)}
                className="fa-press rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover">
                {principal.accion.label}
              </Link>
            )}
            <button onClick={() => setPorQue(v => !v)} aria-expanded={porQue}
              className="fa-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-alternate hover:text-primary">
              {porQue ? 'Ocultar detalle' : '¿Por qué?'}
              <ChevronDown size={13} style={{ transform: porQue ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} />
            </button>
            <button onClick={() => ocultar(principal.id)} aria-label="Ocultar este aviso por hoy" title="Ocultar por hoy"
              className="fa-press ml-auto rounded-lg p-1.5 text-muted hover:bg-alternate hover:text-primary"><X size={14} /></button>
          </div>
        </div>
      ) : !cargando && (
        <p className="mt-4 text-sm text-secondary">Tus números están en orden. Cuando detecte algo importante (un vencimiento, un gasto fuera de lo normal, una meta cerca) te lo muestro acá.</p>
      )}

      {resto.length > 0 && (
        <ul className="mt-auto space-y-0.5 border-t pt-3 fa-hairline">
          {resto.map(i => {
            const ti = TIPO[i.tipo]
            return (
              <li key={i.id}>
                <button onClick={() => { setAbierto(i.id); setPorQue(false) }}
                  className="fa-press flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-alternate">
                  <ti.Icono size={13} className="mt-0.5 shrink-0" style={{ color: ti.color }} />
                  <span className="line-clamp-2 text-secondary">{i.titulo}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ── captura en lenguaje natural ──────────────────────────────── */

export interface GastoDetectado {
  nombre: string
  monto: number
  categoria: string
  fecha: string
  medio_pago?: string
  forma_pago?: 'debito' | 'credito'
  cuotas?: number
  moneda?: 'ARS' | 'USD'
}

type Paso = 'idle' | 'escuchando' | 'pensando' | 'confirmar' | 'guardando' | 'respuesta' | 'error'

/* guardado por defecto de un gasto (cuando la pantalla no trae el suyo) */
async function guardarGastoPorDefecto(g: GastoDetectado): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Tu sesión venció. Volvé a entrar.'
  const r = await guardarGastoVariable(supabase, user.id, {
    nombre: g.nombre, monto: Number(g.monto), categoria: g.categoria, fecha: g.fecha,
    medio_pago: g.medio_pago, forma_pago: g.forma_pago,
    cuotas: g.forma_pago === 'credito' ? g.cuotas : undefined,
    moneda: g.moneda === 'USD' ? 'USD' : 'ARS',
  })
  if (r.error && !r.guardado) return 'No se pudo guardar el gasto.'
  window.dispatchEvent(new Event(EVENTO_DATOS))
  return null
}

interface Propuesta { id: number; a: AccionPropuesta; vista: Vista | null; estado: 'pendiente' | 'haciendo' | 'hecha' | 'cancelada' | 'error'; msg?: string }

export function CapturaLuca({ onGuardar = guardarGastoPorDefecto, autoFoco = false, flotante = false, compacto = false }: {
  /** guarda y devuelve un error (o null) */
  onGuardar?: (g: GastoDetectado) => Promise<string | null>
  /** input más bajo (barra superior) */
  compacto?: boolean
  autoFoco?: boolean
  /** desktop: la confirmación flota debajo del input sin empujar la pantalla */
  flotante?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [paso, setPaso] = useState<Paso>('idle')
  const [g, setG] = useState<GastoDetectado | null>(null)
  const [error, setError] = useState('')
  const [respuesta, setRespuesta] = useState<{ texto: string; propuestas: Propuesta[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const idInput = useId()
  const router = useRouter()
  const enChat = () => router.push(`/dashboard/luca?q=${encodeURIComponent(texto.trim())}`)

  /* Luca completo (con acceso a toda la app), pero la respuesta se muestra
     acá mismo: lo que entendió y cada acción para confirmar o cancelar. */
  async function consultarAgente() {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('sesion')
      const s = await snapshotCompartido()
      const res = await fetch('/api/luca/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: texto.trim() }], contexto: construirContexto(s) }),
      })
      if (res.status === 403) throw new Error('permiso')
      if (!res.ok) throw new Error('ia')
      const data = await res.json() as { mensaje?: string; acciones?: AccionPropuesta[] }
      const acciones = data.acciones ?? []
      /* un solo gasto: la tarjeta editable de siempre */
      const unico = acciones.length === 1 ? comoRegistroSimple(acciones[0]) : null
      if (unico?.tabla === 'gasto_variable') {
        const dd = unico.datos as Record<string, unknown>
        setG({ nombre: String(dd.nombre), monto: Number(dd.monto), categoria: String(dd.categoria), fecha: String(dd.fecha),
          medio_pago: dd.medio_pago as string | undefined, forma_pago: dd.forma_pago as 'debito' | 'credito' | undefined,
          cuotas: dd.cuotas as number | undefined, moneda: dd.moneda === 'USD' ? 'USD' : 'ARS' })
        setPaso('confirmar')
        return
      }
      const propuestas: Propuesta[] = []
      for (const [i, a] of acciones.entries()) {
        const simple = comoRegistroSimple(a)
        propuestas.push({ id: i, a, vista: simple ? null : await prepararAccion(supabase, s, a), estado: 'pendiente' })
      }
      setRespuesta({ texto: data.mensaje || 'Listo.', propuestas })
      setPaso('respuesta')
    } catch (e) {
      setError(e instanceof Error && e.message === 'permiso'
        ? 'Luca no está habilitado para esta cuenta. Podés cargar los movimientos a mano.'
        : 'Luca no pudo responder ahora. Probá de nuevo en un rato.')
      setPaso('error')
    }
  }

  async function confirmarPropuesta(p: Propuesta) {
    const upd = (c: Partial<Propuesta>) => setRespuesta(r => r && { ...r, propuestas: r.propuestas.map(x => x.id === p.id ? { ...x, ...c } : x) })
    upd({ estado: 'haciendo' })
    try {
      const supabase = createClient()
      const s = await snapshotCompartido(true)
      const uid = (await supabase.auth.getUser()).data.user?.id ?? ''
      const simple = comoRegistroSimple(p.a)
      if (simple) {
        const g = await guardarRegistroSimple(supabase, uid, simple.tabla as TablaRegistro, simple.datos)
        if (g.error) throw new Error(g.error)
        upd({ estado: 'hecha', msg: g.aviso ? `Guardado. Ojo: ${g.aviso}` : 'Guardado.' })
      } else {
        const r = await ejecutarAccion(supabase, uid, s, p.a)
        if (r.error) throw new Error(r.error)
        upd({ estado: 'hecha', msg: r.ok ?? 'Hecho.' })
      }
      window.dispatchEvent(new Event(EVENTO_DATOS))
    } catch (e) {
      upd({ estado: 'error', msg: e instanceof Error ? e.message : 'No se pudo completar.' })
    }
  }

  function cerrarRespuesta(limpiar: boolean) {
    setRespuesta(null)
    setPaso(limpiar ? 'idle' : 'escuchando')
    if (limpiar) setTexto('')
    else input.current?.focus()
  }

  useEffect(() => { if (autoFoco) setTimeout(() => input.current?.focus(), 60) }, [autoFoco])

  async function interpretar() {
    if (!texto.trim()) return
    setPaso('pensando')
    setError('')
    /* Acá se confirma al instante solo un gasto simple. Preguntas, varios
       movimientos, ingresos, transferencias, viajes o cualquier otra cosa
       van a Luca completo, que tiene acceso a toda la app. */
    const local = parsear(texto)
    const pregunta = /\?/.test(texto) || /^(cu[aá]nto|cu[aá]l|qu[eé]|c[oó]mo|puedo|me alcanza|por qu[eé]|d[oó]nde|cu[aá]ndo|mostr|decime|explic|revis|correg|borr|deshac|transfer|pagu[eé]|cobr)/i.test(texto.trim())
    const simple = local.tipo === 'gasto_variable' && !pregunta && !parsearVarios(texto)
    if (!simple) { await consultarAgente(); return }
    try {
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto }) })
      const d = await r.json()
      if (!d?.nombre || !(Number(d.monto) > 0)) throw new Error('sin datos')
      setG({ ...d, monto: Number(d.monto) })
      setPaso('confirmar')
    } catch {
      await consultarAgente()
    }
  }

  async function confirmar() {
    if (!g) return
    setPaso('guardando')
    const e = await onGuardar(g)
    if (e) { setError(e); setPaso('error'); return }
    setTexto('')
    setG(null)
    setPaso('idle')
  }

  function cancelar() {
    setG(null)
    setRespuesta(null)
    setPaso(texto ? 'escuchando' : 'idle')
    setError('')
    input.current?.focus()
  }

  const estado: LucaEstado = paso === 'escuchando' ? 'listening' : paso === 'pensando' ? 'thinking'
    : paso === 'guardando' ? 'saving' : paso === 'error' ? 'warning' : paso === 'confirmar' || paso === 'respuesta' ? 'insight' : 'idle'

  return (
    <div className="relative w-full">
      <form onSubmit={e => { e.preventDefault(); if (paso === 'confirmar') confirmar(); else interpretar() }}
        className={`flex items-center gap-2 rounded-control border px-2 transition-colors focus-within:border-[var(--accent-confirm)] ${compacto ? 'py-1' : 'py-1.5'}`}
        style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
        <span className="shrink-0"><LucaAvatar estado={estado} size={compacto ? 24 : 30} /></span>
        <label htmlFor={idInput} className="sr-only">Contale o preguntale a Luca</label>
        <input id={idInput} ref={input} value={texto} autoComplete="off"
          onChange={e => { setTexto(e.target.value); if (paso === 'idle' || paso === 'error') setPaso('escuchando') }}
          onFocus={() => paso === 'idle' && setPaso('escuchando')}
          onBlur={() => paso === 'escuchando' && !texto && setPaso('idle')}
          onKeyDown={e => { if (e.key === 'Escape') cancelar() }}
          disabled={paso === 'pensando' || paso === 'guardando'}
          placeholder="Contale o preguntale a Luca: “gasté 18.500 en el súper”"
          enterKeyHint="send"
          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-sm text-primary outline-none focus-visible:outline-none placeholder:text-muted" style={{ outline: "none" }} />
        <button type="submit" disabled={!texto.trim() || paso === 'pensando' || paso === 'guardando'}
          className="fa-press shrink-0 rounded-[9px] bg-confirm px-3.5 py-2 text-xs font-semibold hover:bg-confirm-hover disabled:opacity-40">
          {paso === 'pensando' ? 'Pensando…' : paso === 'confirmar' ? 'Confirmar' : paso === 'guardando' ? 'Guardando…' : 'Enviar'}
        </button>
      </form>

      {error && paso === 'error' && <p className={`mt-2 px-2 text-xs text-negative ${flotante ? 'absolute inset-x-0 top-full' : ''}`} role="alert">{error}</p>}

      {/* lo que entendió Luca: se confirma antes de guardar */}
      {g && (paso === 'confirmar' || paso === 'guardando') && (
        <div className={`fa-pop mt-2 rounded-[18px] p-4 ${flotante ? 'absolute inset-x-0 top-full z-40' : ''}`} style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-pop)' }}
          role="dialog" aria-label="Confirmar gasto detectado">
          <p className="text-xs font-medium tracking-[0.05em] text-secondary">Luca entendió</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-primary">{g.nombre}</p>
              <label className="mt-0.5 flex items-baseline gap-1 text-[1.6rem] font-extrabold tabular-nums text-primary">
                <span>{g.moneda === 'USD' ? 'US$' : '$'}</span>
                <input type="number" inputMode="decimal" value={g.monto} aria-label="Monto"
                  onChange={e => setG({ ...g, monto: Number(e.target.value) })}
                  className="w-40 border-0 border-b border-dashed bg-transparent p-0 text-[1.6rem] font-extrabold tabular-nums text-primary outline-none"
                  style={{ borderColor: 'var(--border-color)' }} />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <select value={g.categoria} onChange={e => setG({ ...g, categoria: e.target.value })} aria-label="Categoría"
                className="rounded-full border px-2.5 py-1 text-xs text-primary" style={{ background: 'var(--bg-card)' }}>
                {!CATEGORIAS.some(c => c.key === g.categoria) && <option value={g.categoria}>{g.categoria}</option>}
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <span className="rounded-full px-2.5 py-1 text-secondary bg-alternate">{g.medio_pago ? `${g.medio_pago} · ${g.forma_pago === 'credito' ? `crédito${(g.cuotas ?? 1) > 1 ? ` · ${g.cuotas} cuotas` : ''}` : 'débito'}` : 'Efectivo / sin medio'}</span>
              <span className="rounded-full px-2.5 py-1 text-secondary bg-alternate">{fmtFechaCorta(g.fecha)}</span>
            </div>
          </div>
          {g.medio_pago && g.forma_pago !== 'credito' && (
            <p className="mt-2 text-[11px] text-muted">Se descuenta del disponible de {g.medio_pago}.</p>
          )}
          {g.forma_pago === 'credito' && (g.cuotas ?? 1) > 1 && (
            <p className="mt-2 text-[11px] text-muted">{g.cuotas} cuotas de {fmt(g.monto / (g.cuotas ?? 1))}: se suman a tus compromisos futuros.</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={confirmar} disabled={paso === 'guardando' || !(g.monto > 0)} autoFocus
              className="fa-press inline-flex items-center gap-1.5 rounded-[9px] bg-confirm px-3.5 py-2 text-xs font-semibold hover:bg-confirm-hover disabled:opacity-50">
              <Check size={14} /> {paso === 'guardando' ? 'Guardando…' : 'Confirmar gasto'}
            </button>
            <button onClick={cancelar} className="fa-press rounded-lg px-3 py-2 text-xs font-semibold text-secondary hover:bg-card hover:text-primary">Cancelar</button>
            <span className="ml-auto hidden text-[11px] text-muted sm:inline">Enter confirma · Esc cancela</span>
          </div>
        </div>
      )}

      {/* respuesta de Luca: lo que entendió y cada acción para confirmar */}
      {respuesta && paso === 'respuesta' && (
        <div className={`fa-pop mt-2 rounded-[18px] p-4 shadow-pop ${flotante ? 'absolute inset-x-0 top-full z-40' : ''}`} style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-pop)' }}
          role="dialog" aria-label="Respuesta de Luca">
          <p className="whitespace-pre-line text-sm leading-relaxed text-primary">{respuesta.texto}</p>
          {respuesta.propuestas.length > 0 && (
            <ul className="mt-3 space-y-2">
              {respuesta.propuestas.map(p => {
                const simple = comoRegistroSimple(p.a)
                const titulo = p.vista?.titulo ?? simple?.mensaje.replace(' para confirmar:', '') ?? 'Acción'
                const lineas = p.vista?.lineas ?? (simple ? [String((simple.datos as Record<string, unknown>).nombre ?? (simple.datos as Record<string, unknown>).cliente ?? ''), fmt(Number((simple.datos as Record<string, unknown>).monto ?? 0))] : [])
                return (
                  <li key={p.id} className="rounded-control bg-alternate p-3">
                    <p className="text-sm font-medium text-primary">{titulo}</p>
                    {lineas.filter(Boolean).map((l, i) => <p key={i} className="text-xs text-secondary">{l}</p>)}
                    {p.vista?.error && <p className="mt-1 text-xs text-negative">{p.vista.error}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      {p.estado === 'hecha' ? <span className="inline-flex items-center gap-1 text-xs font-medium text-positive"><Check size={14} />{p.msg}</span>
                        : p.estado === 'cancelada' ? <span className="text-xs text-muted">Cancelado</span>
                        : !p.vista?.error && (<>
                          <button onClick={() => confirmarPropuesta(p)} disabled={p.estado === 'haciendo'}
                            className="fa-press rounded-[9px] bg-confirm px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{p.estado === 'haciendo' ? 'Haciendo…' : p.estado === 'error' ? 'Reintentar' : 'Confirmar'}</button>
                          <button onClick={() => setRespuesta(r => r && { ...r, propuestas: r.propuestas.map(x => x.id === p.id ? { ...x, estado: 'cancelada' } : x) })}
                            className="fa-press rounded-[9px] px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary">Cancelar</button>
                        </>)}
                    </div>
                    {p.estado === 'error' && p.msg && <p className="mt-1 text-xs text-negative">{p.msg}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
            <button onClick={() => cerrarRespuesta(false)} className="text-secondary hover:text-primary">Editar lo que escribí</button>
            <button onClick={enChat} className="text-secondary hover:text-primary">Seguir en el chat</button>
            <button onClick={() => cerrarRespuesta(true)} className="ml-auto text-secondary hover:text-primary">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** El aviso principal aparece "escribiéndose", como si Luca lo tipeara. */
function Escribiendo({ texto }: { texto: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(texto.length); return }
    setN(0)
    const id = setInterval(() => setN(k => { if (k >= texto.length) { clearInterval(id); return k } return k + 2 }), 22)
    return () => clearInterval(id)
  }, [texto])
  return <span aria-hidden="true" className={n < texto.length ? 'fa-cursor' : ''}>{texto.slice(0, n)}</span>
}
