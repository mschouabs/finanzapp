'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight, ArrowLeftRight, ArrowRight, ArrowUpRight, Check, ChevronRight, Coins, Eye, EyeOff,
  GripVertical, Landmark, LineChart, Pencil, Percent, PiggyBank, Plus, Trash2, Wallet, X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarraApilada, Dona, Leyenda, PALETA, Titulo, fmtK, tooltipStyle, type Porcion } from '@/components/ui/Piezas'
import { Modal } from '@/components/tarjetas/Modales'
import { createClient } from '@/lib/supabase'
import { COLORES_MARCA, marcaDeMedio, normalizar } from '@/lib/tarjetas'
import {
  aPesos, calcularPatrimonio, esLiquida, mesAnteriorClave, traerCotizaciones,
  type Cotizaciones, type LineaSaldo,
} from '@/lib/patrimonio'
import { GrillaOrdenable, type HandleProps } from '@/components/GrillaOrdenable'
import { LucaAvatar } from '@/components/luca/LucaAvatar'

/* ── formato ─────────────────────────────── */
const OCULTO = '••••••'
const fmtARS = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const fmtUSD = (n: number) => 'US$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBTC = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 8 }) + ' BTC'
const fmtNativo = (l: LineaSaldo) =>
  l.moneda === 'USD' ? fmtUSD(Number(l.monto)) : l.moneda === 'BTC' ? fmtBTC(Number(l.monto)) : fmtARS(Number(l.monto))

/* ── identidad visual de cada app (color + iniciales, sin logos) ── */
function colorApp(app: string) {
  const n = normalizar(app)
  if (n.includes('uala')) return '#3E5BF6'
  const marca = marcaDeMedio(app)
  if (COLORES_MARCA[marca] && marca !== 'Otra') return COLORES_MARCA[marca]
  if (n.includes('mercado')) return COLORES_MARCA['Mercado Pago']
  if (n.includes('naranja')) return COLORES_MARCA['Naranja X']
  if (n.includes('brubank')) return COLORES_MARCA['Brubank']
  if (n.includes('bingx') || n.includes('binance')) return '#1D4ED8'
  if (n.includes('iol')) return '#1E3A8A'
  if (n.includes('lemon')) return '#00B96B'
  return '#6E7681'
}

function iniciales(nombre: string) {
  const limpio = nombre.replace(/invertir online/i, '').trim()
  const palabras = limpio.split(/\s+/).filter(Boolean)
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase()
  const p = palabras[0] ?? '?'
  /* "MercadoPago" -> "MP", "BINGX" -> "BX", "Ualá" -> "U" */
  const mayus = p.match(/[A-ZÁÉÍÓÚ]/g)
  if (mayus && mayus.length >= 2 && p !== p.toUpperCase()) return mayus.slice(0, 2).join('')
  if (p === p.toUpperCase() && p.length > 3) return p[0] + p[p.length - 1]
  return p.slice(0, p.length <= 3 ? 3 : 1).toUpperCase()
}

function Insignia({ app, size = 32 }: { app: string; size?: number }) {
  const ini = iniciales(app)
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg font-extrabold text-white"
      style={{ width: size, height: size, background: colorApp(app), fontSize: ini.length > 2 ? size * 0.3 : size * 0.38 }}
    >
      {ini}
    </span>
  )
}

function IconoLinea({ l }: { l: LineaSaldo }) {
  const base = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold'
  if (l.moneda === 'BTC') return <span className={base} style={{ background: '#F7931A', color: '#fff' }}>₿</span>
  if (l.moneda === 'USD' && l.tipo === 'cripto') return <span className={base} style={{ background: '#26A17B', color: '#fff' }}>₮</span>
  if (l.moneda === 'USD') return <span className={base} style={{ background: 'color-mix(in srgb, var(--accent-positive) 18%, transparent)', color: 'var(--accent-positive)' }}>US$</span>
  if (['acciones', 'cedear'].includes(l.tipo)) return <span className={base} style={{ background: 'var(--bg-alternate, rgba(127,127,127,.15))', color: 'var(--text-secondary)' }}><LineChart size={14} /></span>
  if (['fondo_comun', 'plazo_fijo'].includes(l.tipo)) return <span className={base} style={{ background: 'var(--bg-alternate, rgba(127,127,127,.15))', color: 'var(--text-secondary)' }}><Coins size={14} /></span>
  return <span className={base} style={{ background: 'color-mix(in srgb, var(--accent-secondary) 18%, transparent)', color: 'var(--accent-secondary)' }}>$</span>
}

const RIESGO: Record<string, { label: string; color: string }> = {
  alto: { label: 'Riesgo alto', color: 'var(--accent-negative)' },
  moderado: { label: 'Riesgo medio', color: 'var(--riesgo-medio)' },
}

const TIPOS_LINEA = [
  { key: 'efectivo',    label: 'Disponible / caja de ahorro' },
  { key: 'divisa',      label: 'Dólares' },
  { key: 'fondo_comun', label: 'FCI / cuenta remunerada' },
  { key: 'plazo_fijo',  label: 'Plazo fijo' },
  { key: 'acciones',    label: 'Acciones' },
  { key: 'cedear',      label: 'CEDEARs' },
  { key: 'cripto',      label: 'Cripto' },
]

interface Grupo { app: string; nombre: string; items: LineaSaldo[]; total: number }

/* ═══════════════════════════════════════ */

export default function BilleterasPage() {
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [cot, setCot] = useState<Cotizaciones>({ dolar: null, btcUsd: null })
  const [anterior, setAnterior] = useState<number | null>(null)
  const [historia, setHistoria] = useState<{ mes: string; total: number }[]>([])
  const [focoApp, setFocoApp] = useState<string | null>(null)
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oculto, setOculto] = useState(false)

  const [lineaEdit, setLineaEdit] = useState<{ id: string; nombre: string; monto: string; tasa: string } | null>(null)
  const [appEdit, setAppEdit] = useState<{ app: string; nombre: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ app: '', nombre: '', tipo: 'efectivo', moneda: 'ARS', monto: '' })

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ls, error: e1 }, { data: prev }, { data: hist }] = await Promise.all([
      supabase.from('inversiones').select('*'),
      supabase.from('patrimonio_mensual').select('total_ars').eq('mes', mesAnteriorClave()).maybeSingle(),
      supabase.from('patrimonio_mensual').select('mes, total_ars').order('mes', { ascending: true }).limit(24),
    ])
    if (e1) setError('No se pudieron cargar los saldos.')
    setLineas((ls ?? []) as LineaSaldo[])
    setAnterior(prev ? Number(prev.total_ars) : null)
    setHistoria(((hist ?? []) as { mes: string; total_ars: number }[]).map(h => ({ mes: h.mes, total: Number(h.total_ars) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
    traerCotizaciones().then(setCot)
    try { setOculto(localStorage.getItem('billeteras_ocultar') === '1') } catch { /* sin storage */ }
  }, [cargar])

  const toggleOculto = () => {
    setOculto(v => {
      try { localStorage.setItem('billeteras_ocultar', v ? '0' : '1') } catch { /* sin storage */ }
      return !v
    })
  }
  const $ = (n: number) => (oculto ? OCULTO : fmtARS(n))

  const { liquidas, invertidas, tot, monedas } = useMemo(() => {
    const agrupar = (ls: LineaSaldo[]): Grupo[] => {
      const m = new Map<string, LineaSaldo[]>()
      for (const l of ls) m.set(l.app, [...(m.get(l.app) ?? []), l])
      return Array.from(m.entries())
        .map(([app, items]) => ({
          app,
          nombre: items.find(i => i.etiqueta)?.etiqueta || app,
          items: [...items].sort((a, b) => (a.moneda === b.moneda ? 0 : a.moneda === 'ARS' ? -1 : b.moneda === 'ARS' ? 1 : a.moneda.localeCompare(b.moneda))),
          total: items.reduce((s, l) => s + aPesos(l, cot), 0),
        }))
        .sort((a, b) => {
          const oa = Math.min(...a.items.map(i => i.orden ?? 999))
          const ob = Math.min(...b.items.map(i => i.orden ?? 999))
          return oa !== ob ? oa - ob : b.total - a.total
        })
    }
    return {
      liquidas: agrupar(lineas.filter(esLiquida)),
      invertidas: agrupar(lineas.filter(l => !esLiquida(l))),
      tot: calcularPatrimonio(lineas, cot),
      monedas: new Set(lineas.filter(l => Number(l.monto) !== 0).map(l => l.moneda)).size,
    }
  }, [lineas, cot])

  const variacion = anterior ? ((tot.total - anterior) / Math.abs(anterior)) * 100 : null
  const pctLiq = tot.total > 0 ? Math.round((tot.liquido / tot.total) * 100) : 0
  /* rendimiento de la plata disponible: las cuentas remuneradas (MP, Ualá…)
     también generan interés sobre el saldo, no solo las inversiones. */
  const rindeDisponibleMes = lineas
    .filter(esLiquida)
    .reduce((s, l) => s + aPesos(l, cot) * (Number(l.tasa_anual) || 0) / 100 / 12, 0)
  const pctInv = 100 - pctLiq

  /* distribución por app (todas las cuentas e inversiones) */
  const porApp: Porcion[] = [...liquidas, ...invertidas]
    .filter(g => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((g, i) => ({ key: g.app, label: g.nombre, valor: g.total, color: colorApp(g.app) !== '#6E7681' ? colorApp(g.app) : PALETA[i % PALETA.length] }))

  /* exposición por moneda: pesos vs dólares vs cripto */
  const exposicion: Porcion[] = (() => {
    let ars = 0, usd = 0, cripto = 0
    for (const l of lineas) {
      const v = aPesos(l, cot)
      if (v <= 0) continue
      if (l.moneda === 'BTC' || l.tipo === 'cripto') cripto += v
      else if (l.moneda === 'USD') usd += v
      else ars += v
    }
    return [
      { key: 'ARS', label: 'Pesos', valor: ars, color: 'var(--accent-secondary)' },
      { key: 'USD', label: 'Dólares', valor: usd, color: 'var(--accent-positive)' },
      { key: 'CRIPTO', label: 'Cripto', valor: cripto, color: '#F7931A' },
    ]
  })()
  const totalExpo = exposicion.reduce((s, e) => s + e.valor, 0)
  const pctPesos = totalExpo > 0 ? (exposicion[0].valor / totalExpo) * 100 : 0
  const semaforo = pctPesos > 70
    ? { color: 'var(--accent-negative)', texto: 'Mucho en pesos: la inflación se lo come. Pensá en pasar una parte a dólares.' }
    : pctPesos > 40
    ? { color: 'var(--riesgo-medio)', texto: 'Mitad y mitad. Razonable, pero ojo con la plata en pesos que no rinde.' }
    : { color: 'var(--accent-positive)', texto: 'Buena cobertura: la mayor parte está en moneda dura.' }

  const serieHistoria = historia.length && historia[historia.length - 1].mes === mesActualClave()
    ? historia.map(h => (h.mes === mesActualClave() ? { ...h, total: Math.round(tot.total) } : h))
    : [...historia, { mes: mesActualClave(), total: Math.round(tot.total) }]

  /* ── acciones ─────────────────────────── */

  const guardarOrden = useCallback((grupos: Grupo[]) => async (apps: string[]) => {
    /* orden optimista en pantalla, después se guarda en la base */
    const pos = new Map(apps.map((a, i) => [a, i]))
    const ids = new Set(grupos.flatMap(g => g.items.map(i => i.id)))
    setLineas(prev => prev.map(l => (ids.has(l.id) ? { ...l, orden: pos.get(l.app) ?? l.orden } : l)))
    const supabase = createClient()
    await Promise.all(
      grupos.map(g => supabase.from('inversiones').update({ orden: pos.get(g.app) ?? 0 }).in('id', g.items.map(i => i.id))),
    )
  }, [])

  const ordenarLiquidas = useMemo(() => guardarOrden(liquidas), [guardarOrden, liquidas])
  const ordenarInvertidas = useMemo(() => guardarOrden(invertidas), [guardarOrden, invertidas])

  async function renombrarApp() {
    if (!appEdit) return
    const nombre = appEdit.nombre.trim()
    const supabase = createClient()
    const { error: e } = await supabase
      .from('inversiones')
      .update({ etiqueta: nombre && nombre !== appEdit.app ? nombre : null })
      .eq('app', appEdit.app)
    if (e) { setError('No se pudo cambiar el nombre.'); return }
    setAppEdit(null)
    cargar()
  }

  async function guardarLinea() {
    if (!lineaEdit) return
    const monto = Number(lineaEdit.monto.replace(',', '.'))
    const tasa = lineaEdit.tasa.trim() === '' ? 0 : Number(lineaEdit.tasa.replace(',', '.'))
    if (isNaN(monto) || isNaN(tasa) || !lineaEdit.nombre.trim()) return
    const supabase = createClient()
    const { error: e } = await supabase.from('inversiones')
      .update({ monto, nombre: lineaEdit.nombre.trim(), tasa_anual: tasa }).eq('id', lineaEdit.id)
    if (e) { setError('No se pudo guardar.'); return }
    setLineaEdit(null)
    cargar()
  }

  async function borrarLinea(l: LineaSaldo) {
    if (!window.confirm(`¿Borrar "${l.nombre}"?`)) return
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', l.id)
    setLineaEdit(null)
    cargar()
  }

  async function agregarLinea() {
    if (!form.app.trim() || !form.nombre.trim() || form.monto === '') return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const app = form.app.trim()
    const yaTieneDisponible = lineas.some(l => l.app === app && l.es_disponible)
    const etiqueta = lineas.find(l => l.app === app)?.etiqueta ?? null
    const { error: e } = await supabase.from('inversiones').insert({
      user_id: user.id, app, etiqueta,
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      moneda: form.moneda,
      monto: Number(form.monto),
      tasa_anual: 0,
      nivel_riesgo: ['cripto', 'acciones', 'cedear'].includes(form.tipo) ? 'alto' : 'conservador',
      es_disponible: form.tipo === 'efectivo' && form.moneda === 'ARS' && !yaTieneDisponible,
    })
    if (e) { setError('No se pudo agregar.'); return }
    setForm({ app: '', nombre: '', tipo: 'efectivo', moneda: 'ARS', monto: '' })
    setShowForm(false)
    cargar()
  }

  async function transferir(desdeId: string, haciaId: string, sale: number, llega: number): Promise<string | null> {
    const supabase = createClient()
    const { error: e1 } = await supabase.rpc('ajustar_saldo', { p_id: desdeId, p_delta: -sale })
    if (e1) return 'No se pudo descontar de la cuenta de origen.'
    const { error: e2 } = await supabase.rpc('ajustar_saldo', { p_id: haciaId, p_delta: llega })
    if (e2) {
      /* si no se pudo acreditar, devolvemos la plata al origen */
      await supabase.rpc('ajustar_saldo', { p_id: desdeId, p_delta: sale })
      return 'No se pudo acreditar en la cuenta de destino. No se movió nada.'
    }
    setTransfiriendo(false)
    cargar()
    return null
  }

  const abrirAgregar = (app = '') => {
    setForm(f => ({ ...f, app }))
    setShowForm(true)
    setTimeout(() => document.getElementById('form-saldo')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  const apps = Array.from(new Set(lineas.map(l => l.app))).sort()

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando billeteras…</p></div>
  }

  /* ── tarjeta de una app ───────────────── */
  const renderTarjeta = (g: Grupo, handle: HandleProps, arrastrando: boolean, inversion: boolean) => {
    const riesgo = inversion ? (g.items.some(i => i.nivel_riesgo === 'alto') ? RIESGO.alto : g.items.some(i => i.nivel_riesgo === 'moderado') ? RIESGO.moderado : null) : null
    const editandoNombre = appEdit?.app === g.app
    return (
      <div
        className={`fa-card flex h-full flex-col p-4 ${arrastrando ? '' : 'fa-lift'}`}
        style={focoApp === g.app && !arrastrando ? { outline: '2px solid var(--accent-secondary)', outlineOffset: 2 } : arrastrando ? { boxShadow: '0 18px 40px rgba(0,0,0,.35)', outline: '2px solid var(--accent-positive)' } : undefined}
      >
        {/* cabecera: manija + nombre + lápiz */}
        <div className="flex items-center gap-2">
          <button type="button" {...handle} className="-ml-1 rounded p-1 text-muted hover:bg-alternate hover:text-primary">
            <GripVertical size={16} />
          </button>
          <Insignia app={g.nombre} size={30} />
          {editandoNombre ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <input
                autoFocus value={appEdit.nombre}
                onChange={e => setAppEdit({ ...appEdit, nombre: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') renombrarApp(); if (e.key === 'Escape') setAppEdit(null) }}
                className="min-w-0 flex-1 rounded border bg-field px-2 py-1 text-sm text-primary"
                aria-label="Nuevo nombre"
              />
              <button onClick={renombrarApp} aria-label="Guardar nombre" className="rounded p-1 text-positive hover:bg-alternate"><Check size={15} /></button>
              <button onClick={() => setAppEdit(null)} aria-label="Cancelar" className="rounded p-1 text-muted hover:bg-alternate"><X size={15} /></button>
            </div>
          ) : (
            <>
              <span className="min-w-0 truncate text-sm font-semibold text-primary">{g.nombre}</span>
              <button
                onClick={() => setAppEdit({ app: g.app, nombre: g.nombre })}
                aria-label={`Cambiar nombre de ${g.nombre}`}
                className="rounded p-1 text-muted hover:bg-alternate hover:text-primary"
              >
                <Pencil size={13} />
              </button>
              {riesgo && (
                <span className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ color: riesgo.color, background: `color-mix(in srgb, ${riesgo.color} 16%, transparent)` }}>
                  {riesgo.label}
                </span>
              )}
              {!riesgo && (
                <button onClick={() => abrirAgregar(g.app)} aria-label={`Agregar saldo a ${g.nombre}`}
                  className="ml-auto rounded p-1 text-muted hover:bg-alternate hover:text-primary">
                  <Plus size={15} />
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <p className="fa-amount text-2xl text-primary">{$(g.total)}</p>
          {tot.total > 0 && !oculto && (
            <span className="text-xs font-medium text-muted">{Math.round((g.total / tot.total) * 100)}% del total</span>
          )}
        </div>

        {/* líneas */}
        <div className="mt-3 flex flex-col divide-y divide-line border-t border-line">
          {g.items.map(l => {
            const edit = lineaEdit?.id === l.id
            const rinde = Number(l.tasa_anual) > 0
            if (edit) {
              return (
                <div key={l.id} className="flex flex-col gap-2 py-2.5">
                  <input value={lineaEdit.nombre} onChange={e => setLineaEdit({ ...lineaEdit, nombre: e.target.value })}
                    aria-label="Nombre" className="rounded border bg-field px-2 py-1.5 text-sm text-primary" />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted">{l.moneda}</span>
                    <input autoFocus type="number" inputMode="decimal" value={lineaEdit.monto}
                      onChange={e => setLineaEdit({ ...lineaEdit, monto: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') guardarLinea(); if (e.key === 'Escape') setLineaEdit(null) }}
                      aria-label="Monto" className="min-w-0 flex-1 rounded border bg-field px-2 py-1.5 text-right text-sm text-primary" />
                    <button onClick={guardarLinea} aria-label="Guardar" className="rounded p-1.5 text-positive hover:bg-alternate"><Check size={16} /></button>
                    <button onClick={() => setLineaEdit(null)} aria-label="Cancelar" className="rounded p-1.5 text-muted hover:bg-alternate"><X size={16} /></button>
                    <button onClick={() => borrarLinea(l)} aria-label="Borrar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-negative"><Trash2 size={15} /></button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <Percent size={12} /> TNA (rinde sobre este saldo)
                    <input type="number" inputMode="decimal" value={lineaEdit.tasa} placeholder="0"
                      onChange={e => setLineaEdit({ ...lineaEdit, tasa: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') guardarLinea(); if (e.key === 'Escape') setLineaEdit(null) }}
                      aria-label="TNA %" className="w-16 rounded border bg-field px-2 py-1 text-right text-xs text-primary" />
                    %
                  </label>
                </div>
              )
            }
            return (
              <button
                key={l.id}
                onClick={() => setLineaEdit({ id: l.id, nombre: l.nombre, monto: String(Number(l.monto)), tasa: l.tasa_anual ? String(Number(l.tasa_anual)) : '' })}
                className="group flex w-full items-center gap-2.5 py-2.5 text-left"
              >
                {inversion && <IconoLinea l={l} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-secondary group-hover:text-primary">{l.nombre}</span>
                  {rinde && !oculto && (
                    <span className="block text-[11px] font-semibold text-positive">{Number(l.tasa_anual)}% TNA</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`fa-amount block text-sm ${Number(l.monto) < 0 ? 'text-negative' : 'text-primary'}`}>
                    {oculto ? OCULTO : fmtNativo(l)}
                  </span>
                  {l.moneda !== 'ARS' && !oculto && (
                    <span className="block text-[11px] text-muted">≈ {fmtARS(aPesos(l, cot))}</span>
                  )}
                  {rinde && !oculto && (
                    <span className="block text-[11px] text-muted">~{fmtK(aPesos(l, cot) * Number(l.tasa_anual) / 100 / 12)}/mes</span>
                  )}
                </span>
                <ChevronRight size={15} className="shrink-0 text-muted group-hover:text-primary" />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Billeteras</h1>
          <p className="mt-1 text-sm text-secondary">Dónde está tu plata. Cuentas, dólares e inversiones.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTransfiriendo(true)}
            disabled={lineas.length < 2}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold text-primary hover:bg-alternate disabled:opacity-40"
          >
            <ArrowLeftRight size={16} /> Transferir
          </button>
          <button
            onClick={() => (showForm ? setShowForm(false) : abrirAgregar())}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover"
          >
            <Plus size={16} strokeWidth={2.5} /> Agregar saldo
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {/* Patrimonio */}
      <section className="fa-card grid gap-6 p-5 lg:grid-cols-[1.1fr_1.4fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Wallet size={17} className="text-positive" />
            <h2 className="text-sm font-semibold text-primary">Patrimonio financiero</h2>
            <button onClick={toggleOculto} aria-label={oculto ? 'Mostrar montos' : 'Ocultar montos'}
              className="rounded p-1 text-muted hover:bg-alternate hover:text-primary">
              {oculto ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="fa-amount mt-2 text-4xl text-primary">{$(tot.total)}</p>
          {variacion !== null ? (
            <p className="mt-1.5 flex items-center gap-1 text-sm">
              {variacion >= 0
                ? <ArrowUpRight size={16} className="text-positive" />
                : <ArrowDownRight size={16} className="text-negative" />}
              <span className={`font-semibold ${variacion >= 0 ? 'text-positive' : 'text-negative'}`}>
                {variacion >= 0 ? '+' : ''}{variacion.toFixed(1).replace('.', ',')}%
              </span>
              <span className="text-secondary">respecto al mes anterior</span>
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-secondary">Primer mes registrado: desde el mes que viene ves la comparación.</p>
          )}
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-secondary">Disponible</p>
              <p className="fa-amount text-xl text-primary">{$(tot.liquido)}</p>
              <p className="text-sm font-semibold text-positive">{pctLiq}%</p>
              {rindeDisponibleMes > 0 && !oculto && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-positive">
                  <PiggyBank size={11} /> +{fmtK(rindeDisponibleMes)}/mes rindiendo
                </p>
              )}
            </div>
            <div className="border-l border-line pl-4">
              <p className="text-xs text-secondary">Invertido</p>
              <p className="fa-amount text-xl text-primary">{$(tot.invertido)}</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--accent-violet, #8B5CF6)' }}>{pctInv}%</p>
            </div>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
            <div style={{ width: `${pctLiq}%`, background: 'var(--accent-positive)' }} />
            <div style={{ width: `${pctInv}%`, background: 'var(--accent-violet, #8B5CF6)' }} />
          </div>
        </div>

        <ul className="flex gap-5 text-sm text-secondary lg:flex-col lg:gap-2.5 lg:border-l lg:border-line lg:pl-6">
          <li className="flex items-center gap-2"><Landmark size={15} /> {liquidas.length} cuentas</li>
          <li className="flex items-center gap-2"><LineChart size={15} /> {invertidas.length} inversiones</li>
          <li className="flex items-center gap-2"><Coins size={15} /> {monedas} monedas</li>
        </ul>
      </section>

      {/* Distribución, exposición y evolución */}
      {tot.total > 0 && (
        <div className="grid gap-5 xl:grid-cols-3">
          <section className="fa-card p-5">
            <Titulo titulo="Dónde está tu plata" sub="Tocá una app para resaltarla abajo" />
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start xl:flex-col xl:items-center">
              <Dona
                datos={porApp}
                size={160}
                activo={focoApp}
                onElegir={k => setFocoApp(f => (f === k ? null : k))}
                centro={<>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Total</span>
                  <span className="fa-amount text-base text-primary">{oculto ? OCULTO : fmtK(tot.total)}</span>
                </>}
              />
              <Leyenda datos={porApp} fmt={n => (oculto ? OCULTO : fmtK(n))} activo={focoApp} onElegir={k => setFocoApp(f => (f === k ? null : k))} max={6} />
            </div>
          </section>

          <section className="fa-card flex flex-col p-5">
            <Titulo titulo="En qué moneda" sub="Cuánto de tu patrimonio está en pesos, dólares y cripto" />
            <div className="mt-5">
              <BarraApilada datos={exposicion} alto={14} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {exposicion.map(e => (
                <li key={e.key} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                  <span className="flex-1 text-secondary">{e.label}</span>
                  <span className="fa-amount text-primary">{oculto ? OCULTO : fmtK(e.valor)}</span>
                  <span className="w-10 text-right text-xs font-semibold text-muted">{totalExpo > 0 ? Math.round((e.valor / totalExpo) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-start gap-2 rounded-xl p-3 pt-3 text-xs" style={{ background: `color-mix(in srgb, ${semaforo.color} 12%, transparent)`, marginTop: 16 }}>
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: semaforo.color }} />
              <span className="text-primary">{semaforo.texto}</span>
            </div>
          </section>

          <section className="fa-card flex flex-col p-5">
            <Titulo titulo="Evolución" sub="Tu patrimonio financiero, mes a mes" />
            {serieHistoria.length >= 2 ? (
              <div className="mt-4 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serieHistoria} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
                    <defs>
                      <linearGradient id="gradPatrimonio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-positive)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent-positive)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={etiquetaMesCorta} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => (oculto ? '' : fmtK(v))} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={etiquetaMesCorta} formatter={(v: number) => [oculto ? OCULTO : fmtARS(v), 'Patrimonio']} />
                    <Area type="monotone" dataKey="total" stroke="var(--accent-positive)" strokeWidth={2.5} fill="url(#gradPatrimonio)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                <LineChart size={28} className="text-muted" />
                <p className="mt-2 text-sm text-secondary">Guardé la foto de este mes.</p>
                <p className="text-xs text-muted">Desde el mes que viene vas a ver la curva.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div id="form-saldo" className="fa-card p-5">
          <p className="mb-3 text-sm font-semibold text-primary">Nuevo saldo</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input list="apps-existentes" placeholder="App o banco (ej: Lemon Cash)" value={form.app}
              onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2.5 text-sm text-primary" />
            <datalist id="apps-existentes">{apps.map(a => <option key={a} value={a} />)}</datalist>
            <input placeholder="Concepto (ej: Pesos)" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2.5 text-sm text-primary" />
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, moneda: e.target.value === 'divisa' ? 'USD' : f.moneda }))}
              className="rounded-lg border bg-field px-3 py-2.5 text-sm text-primary">
              {TIPOS_LINEA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2.5 text-sm text-primary">
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
              <option value="BTC">BTC (cantidad)</option>
            </select>
            <input placeholder="Monto" type="number" inputMode="decimal" value={form.monto}
              onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2.5 text-sm text-primary" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={agregarLinea} className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">Guardar</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
          </div>
        </div>
      )}

      {/* Cuentas y billeteras */}
      <Seccion
        icono={<Wallet size={20} />}
        titulo="Cuentas y billeteras"
        subtitulo="Plata disponible en pesos y dólares. Los gastos con débito se descuentan de acá."
        etiquetaTotal="Total disponible"
        total={$(tot.liquido)}
      >
        <GrillaOrdenable
          ids={liquidas.map(g => g.app)}
          onReordenar={ordenarLiquidas}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          render={(app, handle, arr) => {
            const g = liquidas.find(x => x.app === app)
            return g ? renderTarjeta(g, handle, arr, false) : null
          }}
        />
      </Seccion>

      {/* Inversiones */}
      <Seccion
        icono={<LineChart size={20} />}
        titulo="Inversiones"
        subtitulo="FCIs, CEDEARs, acciones y cripto."
        etiquetaTotal="Total invertido"
        total={$(tot.invertido)}
      >
        <GrillaOrdenable
          ids={invertidas.map(g => g.app)}
          onReordenar={ordenarInvertidas}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          render={(app, handle, arr) => {
            const g = invertidas.find(x => x.app === app)
            return g ? renderTarjeta(g, handle, arr, true) : null
          }}
        />
      </Seccion>

      <p className="-mt-2 text-center text-xs text-muted">
        Arrastrá las tarjetas desde <GripVertical size={12} className="inline" /> para ordenarlas · Tocá un saldo para editarlo
        {cot.dolar ? ` · Dólar blue $${Math.round(cot.dolar).toLocaleString('es-AR')}` : ''}
      </p>

      {/* Luca */}
      <section className="fa-card flex flex-wrap items-center gap-4 p-4">
        <LucaAvatar estado={variacion !== null && variacion < 0 ? 'warning' : 'idle'} size={40} />
        <p className="min-w-0 flex-1 text-sm text-secondary">
          {variacion !== null
            ? `Tu patrimonio ${variacion >= 0 ? 'aumentó' : 'bajó'} ${Math.abs(variacion).toFixed(1).replace('.', ',')}% este mes. `
            : 'Ya guardé la foto de tu patrimonio de este mes. '}
          El {pctInv}% de tu dinero está invertido.
        </p>
        <Link href="/dashboard/inversiones"
          className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium text-primary hover:bg-alternate">
          Ver análisis completo <ArrowRight size={15} />
        </Link>
      </section>

      {transfiriendo && (
        <Transferir lineas={lineas} cot={cot} onTransferir={transferir} onCerrar={() => setTransfiriendo(false)} />
      )}
    </div>
  )
}

/* ── helpers ─────────────────────────────── */

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaMesCorta = (k: string) => `${MESES_CORTO[Number(k.slice(5, 7)) - 1]} '${k.slice(2, 4)}`
const mesActualClave = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ── Transferir entre cuentas ────────────── */

function Transferir({ lineas, cot, onTransferir, onCerrar }: {
  lineas: LineaSaldo[]
  cot: Cotizaciones
  onTransferir: (desde: string, hacia: string, sale: number, llega: number) => Promise<string | null>
  onCerrar: () => void
}) {
  const ordenadas = [...lineas].sort((a, b) => (a.etiqueta || a.app).localeCompare(b.etiqueta || b.app))
  const [desde, setDesde] = useState(ordenadas.find(l => l.es_disponible)?.id ?? ordenadas[0]?.id ?? '')
  const [hacia, setHacia] = useState(ordenadas.find(l => l.id !== desde)?.id ?? '')
  const [sale, setSale] = useState('')
  const [llega, setLlega] = useState('')
  const [llegaManual, setLlegaManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const lDesde = lineas.find(l => l.id === desde)
  const lHacia = lineas.find(l => l.id === hacia)
  const mismaMoneda = lDesde?.moneda === lHacia?.moneda

  /* lo que llega se calcula solo con la cotización del día (editable) */
  const sugerido = (() => {
    const m = Number(sale.replace(',', '.'))
    if (!lDesde || !lHacia || !m) return ''
    if (mismaMoneda) return String(m)
    const enPesos = aPesos({ moneda: lDesde.moneda, monto: m }, cot)
    const unidad = aPesos({ moneda: lHacia.moneda, monto: 1 }, cot)
    const r = unidad > 0 ? enPesos / unidad : 0
    return lHacia.moneda === 'BTC' ? r.toFixed(8) : r.toFixed(2)
  })()
  const valorLlega = llegaManual ? llega : sugerido

  const nombre = (l: LineaSaldo) => `${l.etiqueta || l.app} · ${l.nombre} (${fmtNativo(l)})`

  async function confirmar() {
    const s = Number(sale.replace(',', '.'))
    const ll = Number(String(valorLlega).replace(',', '.'))
    if (!desde || !hacia || desde === hacia) return setError('Elegí dos cuentas distintas.')
    if (!s || s <= 0) return setError('Poné cuánto sale.')
    if (!ll || ll <= 0) return setError('Poné cuánto llega.')
    setEnviando(true)
    const e = await onTransferir(desde, hacia, s, ll)
    setEnviando(false)
    if (e) setError(e)
  }

  const input = 'w-full rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'
  const label = 'mb-1 block text-xs font-semibold text-secondary'

  return (
    <Modal titulo="Transferir entre cuentas" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="tr-desde">Sale de</label>
          <select id="tr-desde" value={desde} onChange={e => { setDesde(e.target.value); if (e.target.value === hacia) setHacia('') }} className={input}>
            {ordenadas.map(l => <option key={l.id} value={l.id}>{nombre(l)}</option>)}
          </select>
        </div>
        <div className="flex justify-center">
          <button type="button" aria-label="Invertir"
            onClick={() => { const d = desde; setDesde(hacia); setHacia(d) }}
            className="rounded-full border p-2 text-secondary hover:bg-alternate hover:text-primary">
            <ArrowLeftRight size={16} className="rotate-90" />
          </button>
        </div>
        <div>
          <label className={label} htmlFor="tr-hacia">Llega a</label>
          <select id="tr-hacia" value={hacia} onChange={e => setHacia(e.target.value)} className={input}>
            <option value="">Elegí una cuenta…</option>
            {ordenadas.filter(l => l.id !== desde).map(l => <option key={l.id} value={l.id}>{nombre(l)}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="tr-sale">Monto que sale ({lDesde?.moneda ?? ''})</label>
            <input id="tr-sale" type="number" inputMode="decimal" autoFocus value={sale} onChange={e => setSale(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="tr-llega">Monto que llega ({lHacia?.moneda ?? ''})</label>
            <input id="tr-llega" type="number" inputMode="decimal" value={valorLlega}
              onChange={e => { setLlegaManual(true); setLlega(e.target.value) }} className={input} />
            {!mismaMoneda && lHacia && (
              <p className="mt-1 text-[11px] text-muted">
                Calculado con la cotización de hoy. Si te dieron otro cambio, corregilo.
                {llegaManual && <button type="button" onClick={() => setLlegaManual(false)} className="ml-1 underline">Recalcular</button>}
              </p>
            )}
          </div>
        </div>
        {lDesde && Number(sale) > Number(lDesde.monto) && (
          <p className="text-xs text-negative">Esa cuenta tiene menos de lo que querés mover: va a quedar en negativo.</p>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={confirmar} disabled={enviando}
          className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
          {enviando ? 'Transfiriendo…' : 'Confirmar'}
        </button>
        <button onClick={onCerrar} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
      </div>
    </Modal>
  )
}

function Seccion({ icono, titulo, subtitulo, etiquetaTotal, total, children }: {
  icono: React.ReactNode; titulo: string; subtitulo: string; etiquetaTotal: string; total: string; children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-positive">{icono}</span>
          <div>
            <h2 className="text-lg font-bold text-primary">{titulo}</h2>
            <p className="text-xs text-secondary">{subtitulo}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-secondary">{etiquetaTotal}</p>
          <p className="fa-amount text-xl text-primary">{total}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
