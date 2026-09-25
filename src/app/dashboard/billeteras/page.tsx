'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Check, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { COLORES_MARCA, marcaDeMedio, normalizar } from '@/lib/tarjetas'
import {
  aPesos, calcularPatrimonio, esLiquida, traerCotizaciones,
  type Cotizaciones, type LineaSaldo,
} from '@/lib/patrimonio'

const fmtARS = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const fmtLinea = (l: LineaSaldo) =>
  l.moneda === 'USD' ? `US$ ${Number(l.monto).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  : l.moneda === 'BTC' ? `₿ ${Number(l.monto).toLocaleString('es-AR', { maximumFractionDigits: 8 })}`
  : fmtARS(Number(l.monto))

function colorApp(app: string) {
  const marca = marcaDeMedio(app === 'Uala' ? 'Ualá' : app)
  if (COLORES_MARCA[marca] && marca !== 'Otra') return COLORES_MARCA[marca]
  const n = normalizar(app)
  if (n.includes('bingx') || n.includes('binance')) return '#F0B90B'
  if (n.includes('iol')) return '#0B3D91'
  if (n.includes('lemon')) return '#00C853'
  return '#6E7681'
}

interface GastoDebito { id: string; nombre: string; monto: number; fecha: string; billetera_linea_id: string | null }

const TIPOS_LINEA = [
  { key: 'efectivo',    label: 'Disponible / caja de ahorro' },
  { key: 'divisa',      label: 'Dólares' },
  { key: 'fondo_comun', label: 'FCI / cuenta remunerada' },
  { key: 'plazo_fijo',  label: 'Plazo fijo' },
  { key: 'acciones',    label: 'Acciones' },
  { key: 'cedear',      label: 'CEDEARs' },
  { key: 'cripto',      label: 'Cripto' },
]

export default function BilleterasPage() {
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [gastos, setGastos] = useState<GastoDebito[]>([])
  const [cot, setCot] = useState<Cotizaciones>({ dolar: null, btcUsd: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ app: '', nombre: '', tipo: 'efectivo', moneda: 'ARS', monto: '' })

  const cargar = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const hoy = new Date()
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
    const [{ data: ls, error: e1 }, { data: gs }] = await Promise.all([
      supabase.from('inversiones').select('*').order('app').order('moneda'),
      supabase.from('gastos_variables')
        .select('id, nombre, monto, fecha, billetera_linea_id')
        .not('billetera_linea_id', 'is', null)
        .gte('fecha', desde)
        .order('fecha', { ascending: false }),
    ])
    if (e1) setError('No se pudieron cargar los saldos.')
    setLineas((ls ?? []) as LineaSaldo[])
    setGastos((gs ?? []) as GastoDebito[])
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
    traerCotizaciones().then(setCot)
  }, [cargar])

  const { liquidas, invertidas, totales } = useMemo(() => {
    const agrupar = (ls: LineaSaldo[]) => {
      const m = new Map<string, LineaSaldo[]>()
      for (const l of ls) m.set(l.app, [...(m.get(l.app) ?? []), l])
      return Array.from(m.entries())
        .map(([app, items]) => ({ app, items, total: items.reduce((s, l) => s + aPesos(l, cot), 0) }))
        .sort((a, b) => b.total - a.total)
    }
    return {
      liquidas: agrupar(lineas.filter(esLiquida)),
      invertidas: agrupar(lineas.filter(l => !esLiquida(l))),
      totales: calcularPatrimonio(lineas, cot),
    }
  }, [lineas, cot])

  async function guardarEdicion(l: LineaSaldo) {
    const monto = Number(valorEdit.replace(/\./g, '').replace(',', '.'))
    if (isNaN(monto)) return
    const supabase = createClient()
    const { error: e } = await supabase.from('inversiones').update({ monto }).eq('id', l.id)
    if (e) { setError('No se pudo actualizar el saldo.'); return }
    setEditando(null)
    cargar()
  }

  async function borrarLinea(l: LineaSaldo) {
    if (!window.confirm(`¿Borrar "${l.nombre}" de ${l.app}?`)) return
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', l.id)
    cargar()
  }

  async function agregarLinea() {
    if (!form.app.trim() || !form.nombre.trim() || form.monto === '') return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const app = form.app.trim()
    /* La primera línea en pesos "disponible" de una app es de donde
       se descuentan los gastos con débito. */
    const yaTieneDisponible = lineas.some(l => l.app === app && l.es_disponible)
    const { error: e } = await supabase.from('inversiones').insert({
      user_id: user.id,
      app,
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

  const apps = Array.from(new Set(lineas.map(l => l.app))).sort()

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando billeteras…</p></div>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="fa-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-lg font-extrabold text-primary">👛 Billeteras</h1>
          <p className="mt-1 text-xs text-secondary">
            Dónde está tu plata{cot.dolar ? ` · Dólar blue $${Math.round(cot.dolar).toLocaleString('es-AR')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-5 text-right">
          <Total label="Disponible" valor={totales.liquido} />
          <Total label="Invertido" valor={totales.invertido} />
          <Total label="Total" valor={totales.total} fuerte />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover"
        >
          <Plus size={16} strokeWidth={2.5} /> Agregar saldo
        </button>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {showForm && (
        <div className="fa-card p-5">
          <p className="mb-3 text-sm font-semibold text-primary">Nuevo saldo</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input list="apps-existentes" placeholder="App o banco (ej: Lemon Cash)" value={form.app}
              onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
            <datalist id="apps-existentes">{apps.map(a => <option key={a} value={a} />)}</datalist>
            <input placeholder="Concepto (ej: Pesos disponibles)" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, moneda: e.target.value === 'divisa' ? 'USD' : f.moneda }))}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary">
              {TIPOS_LINEA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary">
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
              <option value="BTC">BTC (cantidad)</option>
            </select>
            <input placeholder="Monto" type="number" value={form.monto}
              onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={agregarLinea} className="rounded-lg bg-confirm px-4 py-2 text-sm text-white hover:bg-confirm-hover">Guardar</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-alternate">Cancelar</button>
          </div>
        </div>
      )}

      {/* Bancos y billeteras */}
      <Seccion
        titulo="🏦 Bancos y billeteras virtuales"
        subtitulo="Plata disponible en pesos y dólares. Los gastos con débito se descuentan solos de acá."
        total={totales.liquido}
      >
        {liquidas.map(g => (
          <TarjetaApp key={g.app} app={g.app} total={g.total}>
            {g.items.map(l => (
              <FilaLinea
                key={l.id} l={l} cot={cot}
                editando={editando === l.id} valorEdit={valorEdit}
                onEditar={() => { setEditando(l.id); setValorEdit(String(l.monto)) }}
                onCambiar={setValorEdit}
                onGuardar={() => guardarEdicion(l)}
                onCancelar={() => setEditando(null)}
                onBorrar={() => borrarLinea(l)}
              />
            ))}
            {(() => {
              const ids = new Set(g.items.map(l => l.id))
              const mios = gastos.filter(x => x.billetera_linea_id && ids.has(x.billetera_linea_id))
              if (mios.length === 0) return null
              const total = mios.reduce((s, x) => s + Number(x.monto), 0)
              return (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Pagado con débito este mes · {fmtARS(total)}
                  </p>
                  {mios.slice(0, 4).map(x => (
                    <div key={x.id} className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-secondary">{x.nombre}</span>
                      <span className="shrink-0 text-negative">-{fmtARS(Number(x.monto))}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </TarjetaApp>
        ))}
      </Seccion>

      {/* Inversiones */}
      <Seccion
        titulo="📈 Inversiones"
        subtitulo="FCIs, CEDEARs, acciones y cripto. Por nivel de riesgo, en Portfolio."
        total={totales.invertido}
        extra={<Link href="/dashboard/inversiones" className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">Ver Portfolio →</Link>}
      >
        {invertidas.map(g => (
          <TarjetaApp key={g.app} app={g.app} total={g.total}>
            {g.items.map(l => (
              <FilaLinea
                key={l.id} l={l} cot={cot}
                editando={editando === l.id} valorEdit={valorEdit}
                onEditar={() => { setEditando(l.id); setValorEdit(String(l.monto)) }}
                onCambiar={setValorEdit}
                onGuardar={() => guardarEdicion(l)}
                onCancelar={() => setEditando(null)}
                onBorrar={() => borrarLinea(l)}
              />
            ))}
          </TarjetaApp>
        ))}
      </Seccion>
    </div>
  )
}

/* ── piezas ─────────────────────────────── */

function Total({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-secondary">{label}</div>
      <div className={`fa-amount ${fuerte ? 'text-2xl' : 'text-lg'} text-primary`}>{fmtARS(valor)}</div>
    </div>
  )
}

function Seccion({ titulo, subtitulo, total, extra, children }: {
  titulo: string; subtitulo: string; total: number; extra?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-primary">{titulo}</h2>
          <p className="text-xs text-secondary">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-3">
          {extra}
          <span className="fa-amount text-lg text-primary">{fmtARS(total)}</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}

function TarjetaApp({ app, total, children }: { app: string; total: number; children: React.ReactNode }) {
  const color = colorApp(app)
  return (
    <div className="fa-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ background: color }}>
        <span className="truncate text-sm font-bold text-white">{app}</span>
        <span className="fa-amount shrink-0 text-base text-white">{fmtARS(total)}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-4">{children}</div>
    </div>
  )
}

function FilaLinea({ l, cot, editando, valorEdit, onEditar, onCambiar, onGuardar, onCancelar, onBorrar }: {
  l: LineaSaldo; cot: Cotizaciones; editando: boolean; valorEdit: string
  onEditar: () => void; onCambiar: (v: string) => void; onGuardar: () => void; onCancelar: () => void; onBorrar: () => void
}) {
  const negativo = Number(l.monto) < 0
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-primary">
          {l.nombre}
          {l.es_disponible && <span className="ml-1.5 rounded bg-alternate px-1.5 py-0.5 text-[9px] font-semibold uppercase text-secondary">débito</span>}
        </p>
        {l.moneda !== 'ARS' && <p className="text-[11px] text-muted">≈ {fmtARS(aPesos(l, cot))}</p>}
      </div>
      {editando ? (
        <div className="flex shrink-0 items-center gap-1">
          <input autoFocus type="number" value={valorEdit} onChange={e => onCambiar(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onGuardar(); if (e.key === 'Escape') onCancelar() }}
            className="w-28 rounded border bg-field px-2 py-1 text-right text-sm text-primary" />
          <button onClick={onGuardar} aria-label="Guardar" className="rounded p-1 text-positive hover:bg-alternate"><Check size={15} /></button>
          <button onClick={onCancelar} aria-label="Cancelar" className="rounded p-1 text-muted hover:bg-alternate"><X size={15} /></button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <span className={`fa-amount text-sm ${negativo ? 'text-negative' : 'text-primary'}`}>{fmtLinea(l)}</span>
          <button onClick={onEditar} aria-label={`Editar ${l.nombre}`} className="rounded p-1 text-muted hover:bg-alternate hover:text-primary"><Pencil size={13} /></button>
          <button onClick={onBorrar} aria-label={`Borrar ${l.nombre}`} className="rounded p-1 text-muted hover:bg-alternate hover:text-negative"><X size={13} /></button>
        </div>
      )}
    </div>
  )
}
