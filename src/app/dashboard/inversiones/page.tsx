'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Coins, LineChart as IconoLinea, Pencil, Percent, PiggyBank, Plus, RefreshCw, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { aPesos, esLiquida, traerCotizaciones, type Cotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { Dona, Kpi, Leyenda, PALETA, Segmentado, Titulo, fmtK, fmtPesos, tooltipStyle, type Porcion } from '@/components/ui/Piezas'
import { Modal } from '@/components/tarjetas/Modales'

type Riesgo = 'conservador' | 'moderado' | 'alto'

const RIESGO: Record<Riesgo, { label: string; tono: string; tint: string; emoji: string }> = {
  conservador: { label: 'Conservador', tono: 'var(--riesgo-bajo)', tint: 'var(--riesgo-bajo-tint)', emoji: '🟢' },
  moderado: { label: 'Moderado', tono: 'var(--riesgo-medio)', tint: 'var(--riesgo-medio-tint)', emoji: '🟡' },
  alto: { label: 'Alto riesgo', tono: 'var(--riesgo-alto)', tint: 'var(--riesgo-alto-tint)', emoji: '🔴' },
}

const TIPOS: Record<string, string> = {
  efectivo: 'Disponible', ahorro: 'Caja de ahorro', cuenta: 'Cuenta', divisa: 'Dólares',
  fondo_comun: 'FCI / remunerada', fondo: 'FCI', plazo_fijo: 'Plazo fijo',
  acciones: 'Acciones', cedear: 'CEDEARs', cripto: 'Cripto',
}
const TIPOS_FORM = ['fondo_comun', 'plazo_fijo', 'acciones', 'cedear', 'cripto', 'divisa', 'efectivo']

const riesgoDe = (l: LineaSaldo): Riesgo =>
  l.nivel_riesgo === 'alto' || l.nivel_riesgo === 'moderado' ? l.nivel_riesgo : 'conservador'

const fmtNativo = (l: Pick<LineaSaldo, 'moneda' | 'monto'>) =>
  l.moneda === 'BTC' ? `₿ ${Number(l.monto).toLocaleString('es-AR', { maximumFractionDigits: 8 })}`
  : l.moneda === 'USD' ? `US$ ${Number(l.monto).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  : fmtPesos(Number(l.monto))

const HORIZONTES = [{ key: '3', label: '3 meses' }, { key: '6', label: '6 meses' }, { key: '12', label: '12 meses' }] as const

export default function PortfolioPage() {
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [cot, setCot] = useState<Cotizaciones>({ dolar: null, btcUsd: null })
  const [cotAt, setCotAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [alcance, setAlcance] = useState<'inversiones' | 'todo'>('inversiones')
  const [horizonte, setHorizonte] = useState<typeof HORIZONTES[number]['key']>('12')
  const [focoRiesgo, setFocoRiesgo] = useState<string | null>(null)
  const [focoTipo, setFocoTipo] = useState<string | null>(null)
  const [editando, setEditando] = useState<LineaSaldo | 'nuevo' | null>(null)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('inversiones').select('*')
    setLineas((data ?? []) as LineaSaldo[])
    setLoading(false)
  }, [])

  const actualizarCot = useCallback(() => {
    traerCotizaciones().then(c => { setCot(c); setCotAt(new Date()) })
  }, [])

  useEffect(() => { cargar(); actualizarCot() }, [cargar, actualizarCot])

  const base = useMemo(
    () => lineas.filter(l => Number(l.monto) !== 0 && (alcance === 'todo' || !esLiquida(l))),
    [lineas, alcance]
  )
  const valor = (l: LineaSaldo) => aPesos(l, cot)
  const tna = (l: LineaSaldo) => Number(l.tasa_anual) || 0

  const total = base.reduce((s, l) => s + valor(l), 0)
  const rendMes = base.reduce((s, l) => s + valor(l) * (tna(l) / 100 / 12), 0)
  const tnaPromedio = total > 0 ? base.reduce((s, l) => s + valor(l) * tna(l), 0) / total : 0

  const porRiesgo: Porcion[] = (Object.keys(RIESGO) as Riesgo[]).map(r => ({
    key: r, label: `${RIESGO[r].emoji} ${RIESGO[r].label}`, color: RIESGO[r].tono,
    valor: base.filter(l => riesgoDe(l) === r).reduce((s, l) => s + valor(l), 0),
  })).filter(p => p.valor > 0)

  const porTipo: Porcion[] = Object.entries(
    base.reduce<Record<string, number>>((acc, l) => {
      const t = TIPOS[l.tipo] ? l.tipo : 'otro'
      acc[t] = (acc[t] ?? 0) + valor(l)
      return acc
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([key, v], i) => ({ key, label: TIPOS[key] ?? 'Otro', valor: v, color: PALETA[i % PALETA.length] }))

  /* proyección con interés compuesto mensual, usando la TNA de cada activo */
  const meses = Number(horizonte)
  const proyeccion = Array.from({ length: meses + 1 }, (_, m) => {
    const d = new Date()
    d.setMonth(d.getMonth() + m)
    return {
      mes: m === 0 ? 'Hoy' : d.toLocaleDateString('es-AR', { month: 'short' }),
      valor: Math.round(base.reduce((s, l) => s + valor(l) * Math.pow(1 + tna(l) / 100 / 12, m), 0)),
      sinRendir: Math.round(total),
    }
  })
  const finalProy = proyeccion[proyeccion.length - 1]?.valor ?? 0

  const visibles = base
    .filter(l => !focoRiesgo || riesgoDe(l) === focoRiesgo)
    .filter(l => !focoTipo || (TIPOS[l.tipo] ? l.tipo : 'otro') === focoTipo)

  async function borrar(l: LineaSaldo) {
    if (!window.confirm(`¿Borrar "${l.nombre}"?`)) return
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', l.id)
    setEditando(null)
    cargar()
  }

  async function guardar(d: DatosActivo): Promise<string | null> {
    const supabase = createClient()
    const fila = {
      nombre: d.nombre.trim(), app: d.app.trim(), tipo: d.tipo, moneda: d.moneda,
      monto: Number(d.monto), tasa_anual: Number(d.tasa || 0), nivel_riesgo: d.riesgo,
    }
    if (!fila.nombre || !fila.app) return 'Completá el nombre y la app.'
    if (isNaN(fila.monto)) return 'El monto no es válido.'
    if (editando && editando !== 'nuevo') {
      const { error } = await supabase.from('inversiones').update(fila).eq('id', editando.id)
      if (error) return 'No se pudo guardar.'
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'Sesión vencida.'
      const etiqueta = lineas.find(l => l.app === fila.app)?.etiqueta ?? null
      const { error } = await supabase.from('inversiones').insert({ ...fila, user_id: user.id, etiqueta, es_disponible: false })
      if (error) return 'No se pudo agregar.'
    }
    setEditando(null)
    cargar()
    return null
  }

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando portfolio…</p></div>
  }

  const apps = Array.from(new Set(lineas.map(l => l.app))).sort()

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Portfolio</h1>
          <p className="mt-1 text-sm text-secondary">Cuánto tenés invertido, cuánto rinde y cuánto riesgo estás corriendo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cot.dolar && <Chip label="Dólar blue" valor={fmtPesos(cot.dolar)} />}
          {cot.btcUsd && <Chip label="BTC" valor={`US$ ${Math.round(cot.btcUsd).toLocaleString('es-AR')}`} />}
          <button onClick={actualizarCot} aria-label="Actualizar cotizaciones" title={cotAt ? `Actualizado ${cotAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
            className="rounded-xl border p-2.5 text-secondary hover:bg-alternate hover:text-primary">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setEditando('nuevo')}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={16} strokeWidth={2.5} /> Agregar activo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentado
          opciones={[{ key: 'inversiones', label: 'Solo inversiones' }, { key: 'todo', label: 'Todo (con cuentas)' }] as const}
          valor={alcance} onCambio={v => { setAlcance(v); setFocoRiesgo(null); setFocoTipo(null) }}
        />
        <Link href="/dashboard/billeteras" className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">
          Ver por billetera →
        </Link>
      </div>

      {base.length === 0 ? (
        <div className="fa-card p-10 text-center">
          <p className="text-4xl">📈</p>
          <p className="mt-3 font-medium text-secondary">No hay inversiones cargadas</p>
          <p className="mt-1 text-sm text-muted">Tocá “Agregar activo” para empezar.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Total" valor={fmtK(total)} icono={<Wallet size={17} />} tono="var(--accent-positive)" sub={`${base.length} activos`} />
            <Kpi label="Rinde por mes" valor={fmtK(rendMes)} icono={<PiggyBank size={17} />} tono="var(--accent-secondary)" sub="estimado con la TNA" />
            <Kpi label="Rinde por año" valor={fmtK(rendMes * 12)} icono={<TrendingUp size={17} />} tono="var(--accent-violet)" sub="sin reinvertir" />
            <Kpi label="TNA promedio" valor={`${tnaPromedio.toFixed(1).replace('.', ',')}%`} icono={<Percent size={17} />} tono="var(--accent-warning)" sub="ponderada por monto" />
          </div>

          {/* Gráficos */}
          <div className="grid gap-5 xl:grid-cols-3">
            <section className="fa-card p-5">
              <Titulo titulo="Riesgo" sub="Tocá para filtrar los activos" />
              <div className="mt-4 flex flex-col items-center gap-3">
                <Dona datos={porRiesgo} size={150} activo={focoRiesgo} onElegir={k => setFocoRiesgo(f => (f === k ? null : k))}
                  centro={<><span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Total</span><span className="fa-amount text-base text-primary">{fmtK(total)}</span></>} />
                <Leyenda datos={porRiesgo} fmt={fmtK} activo={focoRiesgo} onElegir={k => setFocoRiesgo(f => (f === k ? null : k))} />
              </div>
            </section>

            <section className="fa-card p-5">
              <Titulo titulo="Tipo de activo" sub="FCI, plazo fijo, cripto, CEDEARs…" />
              <div className="mt-4 flex flex-col items-center gap-3">
                <Dona datos={porTipo} size={150} activo={focoTipo} onElegir={k => setFocoTipo(f => (f === k ? null : k))}
                  centro={<><span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Tipos</span><span className="fa-amount text-base text-primary">{porTipo.length}</span></>} />
                <Leyenda datos={porTipo} fmt={fmtK} activo={focoTipo} onElegir={k => setFocoTipo(f => (f === k ? null : k))} max={6} />
              </div>
            </section>

            <section className="fa-card flex flex-col p-5">
              <Titulo titulo="Proyección" sub="Si dejás todo invertido con las tasas actuales"
                derecha={<Segmentado opciones={HORIZONTES} valor={horizonte} onCambio={setHorizonte} />} />
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-secondary">En {meses} meses tendrías</p>
                  <p className="fa-amount text-2xl text-primary">{fmtK(finalProy)}</p>
                </div>
                <p className="rounded-full px-2.5 py-1 text-xs font-bold text-positive" style={{ background: 'var(--riesgo-bajo-tint)' }}>
                  +{fmtK(finalProy - total)}
                </p>
              </div>
              <div className="mt-3 h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={proyeccion} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                    <defs>
                      <linearGradient id="gradProy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-violet)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--accent-violet)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [fmtPesos(v), n === 'valor' ? 'Con rendimiento' : 'Sin rendir']} />
                    <Area type="monotone" dataKey="sinRendir" stroke="var(--text-muted)" strokeDasharray="4 4" fill="none" />
                    <Area type="monotone" dataKey="valor" stroke="var(--accent-violet)" strokeWidth={2.5} fill="url(#gradProy)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Activos */}
          <section className="flex flex-col gap-4 border-t border-line pt-5">
            <Titulo
              titulo="Tus activos"
              sub={focoRiesgo || focoTipo ? 'Filtrado desde los gráficos' : 'Tocá un activo para editarlo'}
              derecha={(focoRiesgo || focoTipo) ? (
                <button onClick={() => { setFocoRiesgo(null); setFocoTipo(null) }} className="rounded-full border px-2.5 py-1 text-[11px] text-secondary hover:bg-alternate">
                  Quitar filtros
                </button>
              ) : undefined}
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...visibles].sort((a, b) => valor(b) - valor(a)).map(l => {
                const r = RIESGO[riesgoDe(l)]
                const v = valor(l)
                const pct = total > 0 ? (v / total) * 100 : 0
                return (
                  <button key={l.id} onClick={() => setEditando(l)}
                    className="fa-card fa-lift group relative flex flex-col overflow-hidden p-4 text-left">
                    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: r.tono }} />
                    <div className="flex items-start gap-3">
                      <IconoActivo l={l} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-primary">{l.nombre}</p>
                        <p className="truncate text-xs text-muted">{l.etiqueta || l.app} · {TIPOS[l.tipo] ?? l.tipo}</p>
                      </div>
                      <Pencil size={14} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className="fa-amount text-lg text-primary">{fmtNativo(l)}</p>
                        {l.moneda !== 'ARS' && <p className="text-[11px] text-muted">≈ {fmtPesos(v)}</p>}
                      </div>
                      <div className="text-right">
                        {tna(l) > 0 && <p className="text-xs font-semibold text-positive">{tna(l)}% TNA</p>}
                        {tna(l) > 0 && <p className="text-[11px] text-muted">~{fmtK(v * tna(l) / 100 / 12)}/mes</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.tono }} />
                      </div>
                      <span className="text-[11px] font-semibold text-muted">{Math.round(pct)}%</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}

      {editando && (
        <EditarActivo
          inicial={editando === 'nuevo' ? undefined : editando}
          apps={apps}
          onGuardar={guardar}
          onBorrar={editando !== 'nuevo' ? () => borrar(editando) : undefined}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function Chip({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-1.5 text-right">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="fa-amount text-sm text-primary">{valor}</p>
    </div>
  )
}

function IconoActivo({ l }: { l: LineaSaldo }) {
  const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold'
  if (l.moneda === 'BTC') return <span className={base} style={{ background: '#F7931A', color: '#fff' }}>₿</span>
  if (l.tipo === 'cripto') return <span className={base} style={{ background: '#26A17B', color: '#fff' }}>₮</span>
  if (l.moneda === 'USD') return <span className={base} style={{ background: 'var(--riesgo-bajo-tint)', color: 'var(--accent-positive)' }}>US$</span>
  if (['acciones', 'cedear'].includes(l.tipo)) return <span className={base} style={{ background: 'var(--bg-alternate)', color: 'var(--accent-violet)' }}><IconoLinea size={16} /></span>
  return <span className={base} style={{ background: 'var(--bg-alternate)', color: 'var(--accent-secondary)' }}><Coins size={16} /></span>
}

/* ── Alta / edición de un activo ─────────────────────────────────── */

interface DatosActivo { nombre: string; app: string; tipo: string; moneda: string; monto: string; tasa: string; riesgo: Riesgo }

function EditarActivo({ inicial, apps, onGuardar, onBorrar, onCerrar }: {
  inicial?: LineaSaldo
  apps: string[]
  onGuardar: (d: DatosActivo) => Promise<string | null>
  onBorrar?: () => void
  onCerrar: () => void
}) {
  const [d, setD] = useState<DatosActivo>({
    nombre: inicial?.nombre ?? '',
    app: inicial?.app ?? '',
    tipo: inicial?.tipo ?? 'fondo_comun',
    moneda: inicial?.moneda ?? 'ARS',
    monto: inicial ? String(Number(inicial.monto)) : '',
    tasa: inicial?.tasa_anual ? String(inicial.tasa_anual) : '',
    riesgo: inicial ? riesgoDe(inicial) : 'conservador',
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const input = 'w-full rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'
  const label = 'mb-1 block text-xs font-semibold text-secondary'

  async function guardar() {
    setGuardando(true)
    const e = await onGuardar(d)
    setGuardando(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo={inicial ? `Editar ${inicial.nombre}` : 'Nuevo activo'} onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={label} htmlFor="a-nombre">Nombre</label>
          <input id="a-nombre" autoFocus value={d.nombre} onChange={e => setD({ ...d, nombre: e.target.value })} placeholder="Ej: Plazo fijo Naranja X" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="a-app">App o broker</label>
          <input id="a-app" list="apps-portfolio" value={d.app} onChange={e => setD({ ...d, app: e.target.value })} placeholder="Ej: IOL" className={input} />
          <datalist id="apps-portfolio">{apps.map(a => <option key={a} value={a} />)}</datalist>
        </div>
        <div>
          <label className={label} htmlFor="a-tipo">Tipo</label>
          <select id="a-tipo" value={d.tipo} onChange={e => setD({ ...d, tipo: e.target.value })} className={input}>
            {Array.from(new Set([...TIPOS_FORM, d.tipo])).map(t => <option key={t} value={t}>{TIPOS[t] ?? t}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="a-moneda">Moneda</label>
          <select id="a-moneda" value={d.moneda} onChange={e => setD({ ...d, moneda: e.target.value })} className={input}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
            <option value="BTC">BTC (cantidad)</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="a-monto">Monto</label>
          <input id="a-monto" type="number" inputMode="decimal" value={d.monto} onChange={e => setD({ ...d, monto: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="a-tasa">TNA % (opcional)</label>
          <input id="a-tasa" type="number" inputMode="decimal" value={d.tasa} onChange={e => setD({ ...d, tasa: e.target.value })} className={input} />
        </div>
        <div>
          <span className={label}>Riesgo</span>
          <div className="flex overflow-hidden rounded-lg border">
            {(Object.keys(RIESGO) as Riesgo[]).map(r => (
              <button key={r} type="button" onClick={() => setD({ ...d, riesgo: r })} title={RIESGO[r].label}
                className="flex-1 py-2.5 text-sm"
                style={d.riesgo === r ? { background: RIESGO[r].tint, color: RIESGO[r].tono, fontWeight: 700 } : { color: 'var(--text-secondary)' }}>
                {RIESGO[r].emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={guardar} disabled={guardando} className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCerrar} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
        {onBorrar && (
          <button onClick={onBorrar} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-negative hover:bg-alternate">
            <Trash2 size={15} /> Borrar
          </button>
        )}
      </div>
    </Modal>
  )
}
