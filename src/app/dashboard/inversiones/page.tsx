'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Coins, LineChart as IconoLinea, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { aPesos, esLiquida, traerCotizaciones, type Cotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { Dona, Leyenda, PALETA, SkeletonPagina, fmtK, fmtPesos, type Porcion } from '@/components/ui/Piezas'
import { Encabezado, NumeroAnimado, Pestanas, Revelar, Toasts, useToasts } from '@/components/resumen/base'
import { GraficoMensual } from '@/components/resumen/GraficoMensual'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { EVENTO_DATOS } from '@/lib/eventos'
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
  const toasts = useToasts()

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
    const k = new Date(d.getFullYear(), d.getMonth() + m, 1)
    return {
      mes: `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}`,
      valor: Math.round(base.reduce((s, l) => s + valor(l) * Math.pow(1 + tna(l) / 100 / 12, m), 0)),
    }
  })
  const finalProy = proyeccion[proyeccion.length - 1]?.valor ?? 0

  const visibles = base
    .filter(l => !focoRiesgo || riesgoDe(l) === focoRiesgo)
    .filter(l => !focoTipo || (TIPOS[l.tipo] ? l.tipo : 'otro') === focoTipo)

  async function borrar(l: LineaSaldo) {
    const supabase = createClient()
    const { data: fila } = await supabase.from('inversiones').select('*').eq('id', l.id).single()
    await supabase.from('inversiones').delete().eq('id', l.id)
    setEditando(null)
    await cargar()
    toasts.mostrar({
      texto: `Borraste "${l.nombre}"`,
      deshacer: fila ? async () => { await createClient().from('inversiones').insert(fila); await cargar() } : undefined,
    }, 8000)
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
      /* si la plata salió de una cuenta, se descuenta de ahí (antes la
         inversión se sumaba sin restar nada y el patrimonio se duplicaba) */
      if (d.origen) {
        const { error: e2 } = await supabase.rpc('ajustar_saldo', { p_id: d.origen, p_delta: -fila.monto })
        if (e2) toasts.mostrar({ texto: 'La inversión se guardó, pero no se pudo descontar de la cuenta de origen.', tono: 'error' }, 8000)
      }
    }
    const nuevo = editando === 'nuevo'
    setEditando(null)
    await cargar()
    window.dispatchEvent(new Event(EVENTO_DATOS))
    toasts.mostrar({ texto: nuevo ? `Agregaste ${fila.nombre}${d.origen ? ' y se descontó de tu cuenta' : ''}.` : 'Cambios guardados.' }, 4000)
    return null
  }

  if (loading) {
    return <SkeletonPagina kpis={4} />
  }

  const apps = Array.from(new Set(lineas.map(l => l.app))).sort()

  return (
    <div className="fa-page-in mx-auto flex max-w-[1480px] flex-col gap-7 pb-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Portfolio</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-primary lg:text-2xl">Tus inversiones</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cot.dolar && <Chip label="Dólar blue" valor={fmtPesos(cot.dolar)} />}
          {cot.btcUsd && <Chip label="BTC" valor={`US$ ${Math.round(cot.btcUsd).toLocaleString('es-AR')}`} />}
          <button onClick={actualizarCot} aria-label="Actualizar cotizaciones" title={cotAt ? `Actualizado ${cotAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
            className="fa-press flex h-11 w-11 items-center justify-center rounded-xl border text-secondary hover:bg-alternate hover:text-primary fa-hairline">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setEditando('nuevo')}
            className="fa-press flex h-11 items-center gap-1.5 rounded-xl bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={16} strokeWidth={2.5} /> Agregar activo
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pestanas etiqueta="Qué incluir"
          opciones={[{ key: 'inversiones', label: 'Solo inversiones' }, { key: 'todo', label: 'Todo (con cuentas)' }] as const}
          valor={alcance} onCambio={v => { setAlcance(v); setFocoRiesgo(null); setFocoTipo(null) }} />
        <Link href="/dashboard/billeteras" className="text-xs font-semibold text-info hover:underline">Ver por billetera →</Link>
      </div>

      {base.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center fa-hairline">
          <LucaAvatar estado="idle" size={56} className="mx-auto" />
          <p className="mt-3 font-semibold text-primary">Todavía no cargaste inversiones</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-secondary">Plazos fijos, FCI, CEDEARs o cripto: cargalos con su TNA y te muestro cuánto rinden y cuánto riesgo corrés.</p>
          <button onClick={() => setEditando('nuevo')} className="fa-press mt-4 rounded-lg bg-confirm px-4 py-2 text-sm font-semibold text-white">Agregar activo</button>
        </div>
      ) : (
        <>
          {/* lo principal */}
          <section aria-label="Resumen del portfolio" className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-4">
              <p className="fa-label">{alcance === 'todo' ? 'Total (con cuentas)' : 'Total invertido'}</p>
              <NumeroAnimado valor={total} contarAlInicio className="mt-1 block text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold leading-none tracking-tight tabular-nums text-primary" />
              <p className="mt-2 text-xs text-secondary">{base.length} activos · en pesos al dólar de hoy</p>
            </div>
            <div className="grid grid-cols-3 gap-x-6 lg:col-span-8">
              {[
                { l: 'Rinde por mes', v: fmtK(rendMes), s: 'estimado con la TNA' },
                { l: 'Rinde por año', v: fmtK(rendMes * 12), s: 'sin reinvertir' },
                { l: 'TNA promedio', v: `${tnaPromedio.toFixed(1).replace('.', ',')}%`, s: 'ponderada por monto' },
              ].map(x => (
                <div key={x.l}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">{x.l}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-primary">{x.v}</p>
                  <p className="text-[11px] text-muted">{x.s}</p>
                </div>
              ))}
            </div>
          </section>

          {porTipo[0] && total > 0 && (() => {
            const pctTop = Math.round((porTipo[0].valor / total) * 100)
            const alto = porRiesgo.find(r => r.key === 'alto')
            const pctAlto = alto ? Math.round((alto.valor / total) * 100) : 0
            const sinRendir = base.filter(l => tna(l) === 0 && !['acciones', 'cedear', 'cripto'].includes(l.tipo)).reduce((a, l) => a + valor(l), 0)
            return (
              <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: 'color-mix(in srgb, var(--accent-positive) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-positive) 4%, var(--bg-card))' }}>
                <LucaAvatar estado={pctTop >= 60 || pctAlto >= 50 ? 'warning' : 'insight'} size={30} />
                <div className="space-y-1 text-sm leading-relaxed text-primary">
                  <p>Tu mayor exposición está en <b>{porTipo[0].label}</b>: {pctTop}% del portfolio ({fmtK(porTipo[0].valor)}){pctTop >= 60 ? '. Está bastante concentrado.' : '.'}</p>
                  {pctAlto > 0 && <p className="text-secondary">El {pctAlto}% está en activos de riesgo alto.</p>}
                  {sinRendir > 0 && <p className="text-secondary">{fmtK(sinRendir)} figuran sin TNA cargada: si rinden algo, cargala para que la proyección sea real.</p>}
                </div>
              </div>
            )
          })()}

          {/* análisis */}
          <div className="grid gap-7 xl:grid-cols-12">
            <Revelar className="fa-panel p-6 xl:col-span-3">
              <Encabezado titulo="Riesgo" sub="Tocá para filtrar los activos" />
              <div className="mt-4 flex flex-col items-center gap-3">
                <Dona datos={porRiesgo} size={150} activo={focoRiesgo} onElegir={k => setFocoRiesgo(f => (f === k ? null : k))}
                  centro={<><span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Total</span><span className="fa-amount text-base text-primary">{fmtK(total)}</span></>} />
                <Leyenda datos={porRiesgo} fmt={fmtK} activo={focoRiesgo} onElegir={k => setFocoRiesgo(f => (f === k ? null : k))} />
              </div>
            </Revelar>

            <Revelar className="fa-panel p-6 xl:col-span-3" demora={40}>
              <Encabezado titulo="Tipo de activo" sub="FCI, plazo fijo, cripto, CEDEARs…" />
              <div className="mt-4 flex flex-col items-center gap-3">
                <Dona datos={porTipo} size={150} activo={focoTipo} onElegir={k => setFocoTipo(f => (f === k ? null : k))}
                  centro={<><span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Tipos</span><span className="fa-amount text-base text-primary">{porTipo.length}</span></>} />
                <Leyenda datos={porTipo} fmt={fmtK} activo={focoTipo} onElegir={k => setFocoTipo(f => (f === k ? null : k))} max={6} />
              </div>
            </Revelar>

            <Revelar className="fa-panel flex flex-col p-6 xl:col-span-6" demora={80}>
              <Encabezado titulo="Proyección" sub="Si dejás todo invertido con las tasas actuales"
                derecha={<Pestanas etiqueta="Horizonte" opciones={HORIZONTES} valor={horizonte} onCambio={setHorizonte} />} />
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-secondary">En {meses} meses tendrías</p>
                  <NumeroAnimado valor={finalProy} className="block text-2xl font-extrabold tabular-nums text-primary" />
                </div>
                <p className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums text-positive" style={{ background: 'var(--glow-positive)' }}>
                  +{fmtK(finalProy - total)}
                </p>
              </div>
              <div className="mt-3">
                <GraficoMensual key={horizonte} datos={proyeccion.map(p => ({ mes: p.mes, patrimonio: p.valor }))} modo="patrimonio" etiquetaSerie="Proyectado" alto={190} />
              </div>
              <p className="fa-caption mt-2">Proyección matemática con interés compuesto y la TNA actual de cada activo. No es un resultado garantizado: tasas y mercados cambian.</p>
            </Revelar>
          </div>

          {/* Activos */}
          <section className="flex flex-col gap-4">
            <Encabezado
              titulo="Tus activos"
              sub={focoRiesgo || focoTipo ? 'Filtrado desde los gráficos' : 'Tocá un activo para editarlo'}
              derecha={(focoRiesgo || focoTipo) ? (
                <button onClick={() => { setFocoRiesgo(null); setFocoTipo(null) }} className="fa-press rounded-full border px-2.5 py-1 text-xs text-secondary hover:bg-alternate fa-hairline">
                  Quitar filtros ×
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
                    className="fa-panel fa-lift group relative flex flex-col overflow-hidden p-4 text-left">
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
          cuentas={lineas.filter(l => esLiquida(l) && l.moneda !== 'BTC')}
          onGuardar={guardar}
          onBorrar={editando !== 'nuevo' ? () => borrar(editando) : undefined}
          onCerrar={() => setEditando(null)}
        />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
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

interface DatosActivo { nombre: string; app: string; tipo: string; moneda: string; monto: string; tasa: string; riesgo: Riesgo; origen: string }

function EditarActivo({ inicial, apps, cuentas, onGuardar, onBorrar, onCerrar }: {
  inicial?: LineaSaldo
  apps: string[]
  /** cuentas líquidas de las que puede salir la plata (solo al crear) */
  cuentas: LineaSaldo[]
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
    origen: '',
  })
  const cuentasMoneda = cuentas.filter(c => c.moneda === d.moneda)
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
        {!inicial && (
          <div className="col-span-2">
            <label className={label} htmlFor="a-origen">¿De dónde sale la plata?</label>
            <select id="a-origen" value={d.origen} onChange={e => setD({ ...d, origen: e.target.value })} className={input}>
              <option value="">No descontar (ya la tenía invertida)</option>
              {cuentasMoneda.map(c => (
                <option key={c.id} value={c.id}>{c.etiqueta || c.app} · {c.nombre} ({fmtNativo(c)})</option>
              ))}
            </select>
            {d.origen && <p className="mt-1 text-[11px] text-muted">Se descuenta de esa cuenta, así tu patrimonio no se cuenta dos veces.</p>}
          </div>
        )}
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
