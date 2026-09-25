'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, GripVertical, Link2, Pencil, PiggyBank, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { aPesos, traerCotizaciones, type Cotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { GrillaOrdenable, type HandleProps } from '@/components/GrillaOrdenable'
import { AnilloProgreso, fmtK, fmtPesos } from '@/components/ui/Piezas'
import { Modal } from '@/components/tarjetas/Modales'

/* ── Metas ────────────────────────────────────────────────────────
   Arriba, dos metas "automáticas" que salen de tus números (cuánto
   ahorrás y cuánto de tus gastos fijos cubren tus inversiones).
   Abajo, tus metas propias: un viaje, un auto, un fondo de
   emergencia… con su progreso, fecha y a qué ritmo llegás.          */

interface Meta {
  id: string
  nombre: string
  emoji: string | null
  monto_objetivo: number
  moneda: 'ARS' | 'USD'
  aportado: number
  fecha_limite: string | null
  billetera_app: string | null
  orden: number | null
}

const AHORRO_KEY = 'finanzapp_meta_ahorro'
const EMOJIS = ['🎯', '✈️', '🚗', '🏠', '💻', '📱', '🎓', '💍', '🏖️', '🛟', '🎸', '🐶', '👶', '🏋️', '🎁', '💰']
const DIA = 86_400_000

const fmtMoneda = (n: number, moneda: string) =>
  moneda === 'USD' ? `US$ ${Math.round(n).toLocaleString('es-AR')}` : fmtPesos(n)
const fmtFechaLarga = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
const mesAnio = (d: Date) => d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

export default function MetasPage() {
  const [loading, setLoading] = useState(true)
  const [cot, setCot] = useState<Cotizaciones>({ dolar: null, btcUsd: null })
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [tablaFalta, setTablaFalta] = useState(false)

  const [ingresos, setIngresos] = useState(0)
  const [fijos, setFijos] = useState(0)
  const [variables, setVariables] = useState(0)

  const [metaAhorro, setMetaAhorro] = useState(30)
  const [editAhorro, setEditAhorro] = useState(false)
  const [tempAhorro, setTempAhorro] = useState('30')

  const [editando, setEditando] = useState<Meta | 'nueva' | null>(null)
  const [aportando, setAportando] = useState<string | null>(null)
  const [montoAporte, setMontoAporte] = useState('')

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const hoy = new Date()
    const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    const desde = `${mes}-01`
    const hasta = `${mes}-${String(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

    const [c, { data: iff }, { data: inf }, { data: gf }, { data: gv }, { data: vg }, { data: inv }, metasRes] = await Promise.all([
      traerCotizaciones(),
      supabase.from('ingresos_fijos').select('monto, monto_cobrado, activo'),
      supabase.from('ingresos_freelance').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('gastos_fijos').select('monto, activo'),
      supabase.from('gastos_variables').select('monto, moneda').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('viaje_gastos').select('monto_ars').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('inversiones').select('*'),
      supabase.from('metas').select('*').order('orden', { ascending: true, nullsFirst: false }).order('created_at'),
    ])
    const dolar = c.dolar ?? 1560
    setCot(c)

    type Fila = Record<string, unknown>
    const num = (v: unknown) => Number(v) || 0
    const activos = (rows: Fila[] | null) => (rows ?? []).filter(r => r.activo !== false)
    setIngresos(
      activos(iff as Fila[]).reduce((s, r) => s + num(r.monto_cobrado ?? r.monto), 0) +
      ((inf ?? []) as Fila[]).reduce((s, r) => s + num(r.monto_cobrado ?? r.monto_total ?? r.monto), 0)
    )
    setFijos(activos(gf as Fila[]).reduce((s, r) => s + num(r.monto), 0))
    /* los gastos en dólares se pasan a pesos (antes se sumaban como si fueran pesos) */
    setVariables(
      ((gv ?? []) as Fila[]).reduce((s, r) => s + num(r.monto) * (r.moneda === 'USD' ? dolar : 1), 0) +
      ((vg ?? []) as Fila[]).reduce((s, r) => s + num(r.monto_ars), 0)
    )
    setLineas((inv ?? []) as LineaSaldo[])

    if (metasRes.error) {
      setTablaFalta(true)
      setMetas([])
    } else {
      setTablaFalta(false)
      setMetas((metasRes.data ?? []) as Meta[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
    try {
      const v = Number(localStorage.getItem(AHORRO_KEY))
      if (v > 0) { setMetaAhorro(v); setTempAhorro(String(v)) }
    } catch { /* sin storage */ }
  }, [cargar])

  const dolar = cot.dolar ?? 1560
  const ahorroMes = ingresos - fijos - variables
  const tasaAhorro = ingresos > 0 ? (ahorroMes / ingresos) * 100 : 0
  /* rendimiento de las inversiones, ya convertidas a pesos (antes sumaba BTC y dólares como pesos) */
  const rendMensual = lineas.reduce((s, l) => s + aPesos(l, cot) * ((Number(l.tasa_anual) || 0) / 100 / 12), 0)
  const pctCubierto = fijos > 0 ? (rendMensual / fijos) * 100 : 0

  const saldoApp = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of lineas) m[l.app] = (m[l.app] ?? 0) + aPesos(l, cot)
    return m
  }, [lineas, cot])
  const apps = Object.keys(saldoApp).sort()
  const nombreApp = (app: string) => lineas.find(l => l.app === app && l.etiqueta)?.etiqueta || app

  /** Cuánto lleva juntado una meta, en su moneda. */
  const actualDe = (m: Meta) => {
    if (m.billetera_app) {
      const pesos = saldoApp[m.billetera_app] ?? 0
      return m.moneda === 'USD' ? pesos / dolar : pesos
    }
    return Number(m.aportado) || 0
  }

  function guardarAhorro() {
    const v = Math.min(100, Math.max(1, Number(tempAhorro) || 0))
    setMetaAhorro(v)
    setEditAhorro(false)
    try { localStorage.setItem(AHORRO_KEY, String(v)) } catch { /* sin storage */ }
  }

  async function guardarMeta(d: DatosMeta): Promise<string | null> {
    const supabase = createClient()
    const fila = {
      nombre: d.nombre.trim(),
      emoji: d.emoji,
      monto_objetivo: Number(d.objetivo),
      moneda: d.moneda,
      fecha_limite: d.fecha || null,
      billetera_app: d.app || null,
      aportado: d.app ? 0 : Number(d.aportado) || 0,
    }
    if (!fila.nombre) return 'Poné un nombre.'
    if (!(fila.monto_objetivo > 0)) return 'El monto objetivo tiene que ser mayor a cero.'
    if (editando && editando !== 'nueva') {
      const { error } = await supabase.from('metas').update(fila).eq('id', editando.id)
      if (error) return 'No se pudo guardar.'
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'Sesión vencida.'
      const { error } = await supabase.from('metas').insert({ ...fila, user_id: user.id, orden: metas.length })
      if (error) return 'No se pudo crear la meta.'
    }
    setEditando(null)
    cargar()
    return null
  }

  async function borrarMeta(m: Meta) {
    if (!window.confirm(`¿Borrar la meta "${m.nombre}"?`)) return
    const supabase = createClient()
    await supabase.from('metas').delete().eq('id', m.id)
    setEditando(null)
    cargar()
  }

  async function aportar(m: Meta) {
    const monto = Number(montoAporte.replace(',', '.'))
    if (!monto) return
    const supabase = createClient()
    const nuevo = Math.max(0, (Number(m.aportado) || 0) + monto)
    setMetas(prev => prev.map(x => (x.id === m.id ? { ...x, aportado: nuevo } : x)))
    setAportando(null)
    setMontoAporte('')
    await supabase.from('metas').update({ aportado: nuevo }).eq('id', m.id)
  }

  const reordenar = useCallback(async (ids: string[]) => {
    setMetas(prev => ids.map((id, i) => ({ ...prev.find(m => m.id === id)!, orden: i })))
    const supabase = createClient()
    await Promise.all(ids.map((id, i) => supabase.from('metas').update({ orden: i }).eq('id', id)))
  }, [])

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando metas…</p></div>
  }

  const colorAhorro = tasaAhorro >= metaAhorro ? 'var(--accent-positive)' : tasaAhorro >= metaAhorro / 2 ? 'var(--riesgo-medio)' : 'var(--accent-negative)'
  const colorCubierto = pctCubierto >= 100 ? 'var(--accent-positive)' : pctCubierto >= 50 ? 'var(--riesgo-medio)' : 'var(--accent-secondary)'
  const logradas = metas.filter(m => actualDe(m) >= Number(m.monto_objetivo)).length

  /* ── tarjeta de una meta ─────────────────── */
  const renderMeta = (m: Meta, handle: HandleProps, arrastrando: boolean) => {
    const objetivo = Number(m.monto_objetivo) || 0
    const actual = actualDe(m)
    const pct = objetivo > 0 ? (actual / objetivo) * 100 : 0
    const faltante = Math.max(objetivo - actual, 0)
    const lograda = faltante <= 0
    const diasRestan = m.fecha_limite ? Math.ceil((new Date(m.fecha_limite + 'T12:00:00').getTime() - Date.now()) / DIA) : null
    const vencida = diasRestan !== null && diasRestan < 0 && !lograda
    const mesesRestan = diasRestan !== null && diasRestan > 0 ? diasRestan / 30.44 : null
    const necesitaMes = mesesRestan ? faltante / Math.max(mesesRestan, 1) : null
    const ritmo = m.moneda === 'USD' ? ahorroMes / dolar : ahorroMes
    const mesesARitmo = ritmo > 0 ? Math.ceil(faltante / ritmo) : null
    const llegada = mesesARitmo !== null ? new Date(new Date().getFullYear(), new Date().getMonth() + mesesARitmo, 1) : null
    const llegaTarde = llegada && m.fecha_limite ? llegada.getTime() > new Date(m.fecha_limite + 'T12:00:00').getTime() : false
    const color = lograda ? 'var(--accent-positive)' : vencida ? 'var(--accent-negative)' : pct >= 50 ? 'var(--accent-secondary)' : 'var(--accent-violet)'

    return (
      <div
        className={`fa-card relative flex h-full flex-col p-5 ${arrastrando ? '' : 'fa-lift'}`}
        style={arrastrando
          ? { boxShadow: '0 18px 40px rgba(0,0,0,.35)', outline: `2px solid ${color}` }
          : lograda ? { borderColor: 'var(--accent-positive)' } : undefined}
      >
        <div className="flex items-center gap-2">
          <button type="button" {...handle} className="-ml-1 rounded p-1 text-muted hover:bg-alternate hover:text-primary">
            <GripVertical size={16} />
          </button>
          <span className="text-2xl">{m.emoji || '🎯'}</span>
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{m.nombre}</h3>
          {lograda && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-positive" style={{ background: 'var(--riesgo-bajo-tint)' }}>🎉 LOGRADA</span>}
          <button onClick={() => setEditando(m)} aria-label={`Editar ${m.nombre}`} className="rounded p-1 text-muted hover:bg-alternate hover:text-primary">
            <Pencil size={14} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <AnilloProgreso pct={pct} size={92} grosor={9} color={color}>
            <span className="fa-amount text-lg text-primary">{Math.min(Math.round(pct), 999)}%</span>
          </AnilloProgreso>
          <div className="min-w-0">
            <p className="fa-amount text-xl text-primary">{fmtMoneda(actual, m.moneda)}</p>
            <p className="text-xs text-secondary">de {fmtMoneda(objetivo, m.moneda)}</p>
            {!lograda && <p className="mt-1 text-[11px] text-muted">Faltan {fmtMoneda(faltante, m.moneda)}</p>}
            {m.billetera_app && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-alternate px-2 py-0.5 text-[10px] font-semibold text-secondary">
                <Link2 size={10} /> {nombreApp(m.billetera_app)}
              </p>
            )}
          </div>
        </div>

        {!lograda && (
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
            {m.fecha_limite && (
              <p className={`flex items-center gap-1.5 ${vencida ? 'font-semibold text-negative' : 'text-secondary'}`}>
                {vencida && <span className="fa-latido h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-negative)', color: 'var(--accent-negative)' }} />}
                <CalendarClock size={12} />
                {vencida ? `Venció el ${fmtFechaLarga(m.fecha_limite)}` : `${diasRestan} días · ${fmtFechaLarga(m.fecha_limite)}`}
              </p>
            )}
            {necesitaMes !== null && !vencida && (
              <p className="text-secondary">Necesitás juntar <b className="text-primary">{fmtMoneda(necesitaMes, m.moneda)}</b> por mes</p>
            )}
            <p className={llegaTarde ? 'text-negative' : 'text-muted'}>
              {llegada
                ? `A tu ritmo de este mes llegás en ${mesesARitmo} ${mesesARitmo === 1 ? 'mes' : 'meses'} (${mesAnio(llegada)})${llegaTarde ? ': después de la fecha' : ''}`
                : 'Este mes no te está quedando ahorro para sumarle.'}
            </p>
          </div>
        )}

        {!m.billetera_app && !lograda && (
          <div className="mt-auto pt-4">
            {aportando === m.id ? (
              <div className="flex gap-2">
                <input autoFocus type="number" inputMode="decimal" value={montoAporte} placeholder={m.moneda === 'USD' ? 'US$' : '$'}
                  onChange={e => setMontoAporte(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aportar(m); if (e.key === 'Escape') setAportando(null) }}
                  className="min-w-0 flex-1 rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
                <button onClick={() => aportar(m)} className="rounded-lg bg-confirm px-3 py-2 text-xs font-semibold text-white hover:bg-confirm-hover">Sumar</button>
              </div>
            ) : (
              <button onClick={() => { setAportando(m.id); setMontoAporte('') }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold text-primary hover:bg-alternate">
                <Plus size={14} /> Aportar
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Metas</h1>
          <p className="mt-1 text-sm text-secondary">
            {metas.length > 0 ? `${metas.length} ${metas.length === 1 ? 'meta' : 'metas'} · ${logradas} ${logradas === 1 ? 'lograda' : 'logradas'}` : 'Tus objetivos y a qué ritmo vas'}
          </p>
        </div>
        {!tablaFalta && (
          <button onClick={() => setEditando('nueva')}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={16} strokeWidth={2.5} /> Nueva meta
          </button>
        )}
      </div>

      {/* Metas automáticas */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="fa-card fa-lift flex flex-wrap items-center gap-5 p-5">
          <AnilloProgreso pct={metaAhorro > 0 ? (tasaAhorro / metaAhorro) * 100 : 0} size={110} grosor={11} color={colorAhorro}>
            <span className="fa-amount text-xl text-primary">{Math.round(tasaAhorro)}%</span>
            <span className="text-[10px] text-muted">de {metaAhorro}%</span>
          </AnilloProgreso>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PiggyBank size={16} style={{ color: colorAhorro }} />
              <h2 className="text-sm font-bold text-primary">Ahorro de este mes</h2>
              <button onClick={() => setEditAhorro(v => !v)} className="ml-auto text-xs text-secondary underline underline-offset-2 hover:text-primary">
                {editAhorro ? 'Cancelar' : 'Cambiar objetivo'}
              </button>
            </div>
            {editAhorro ? (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" value={tempAhorro} onChange={e => setTempAhorro(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardarAhorro()}
                  className="w-20 rounded-lg border bg-field px-2 py-1.5 text-sm text-primary" />
                <span className="text-sm text-secondary">% de lo que entra</span>
                <button onClick={guardarAhorro} className="rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white">Guardar</button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-secondary">
                {tasaAhorro >= metaAhorro ? '¡Llegaste al objetivo! 🎉' : `Te falta ${fmtK(Math.max(ingresos * metaAhorro / 100 - ahorroMes, 0))} para el ${metaAhorro}%`}
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Mini label="Entró" valor={fmtK(ingresos)} color="var(--accent-positive)" />
              <Mini label="Salió" valor={fmtK(fijos + variables)} color="var(--accent-negative)" />
              <Mini label="Quedó" valor={fmtK(ahorroMes)} color={ahorroMes >= 0 ? 'var(--accent-secondary)' : 'var(--accent-negative)'} />
            </div>
          </div>
        </section>

        <section className="fa-card fa-lift flex flex-wrap items-center gap-5 p-5">
          <AnilloProgreso pct={pctCubierto} size={110} grosor={11} color={colorCubierto}>
            <span className="fa-amount text-xl text-primary">{Math.round(pctCubierto)}%</span>
            <span className="text-[10px] text-muted">cubierto</span>
          </AnilloProgreso>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: colorCubierto }} />
              <h2 className="text-sm font-bold text-primary">Libertad financiera</h2>
            </div>
            <p className="mt-1 text-xs text-secondary">
              Cuánto de tus gastos fijos pagan solos tus inversiones.
              {fijos > 0 && pctCubierto < 100 && ` Para cubrirlos todos necesitás que rindan ${fmtK(fijos - rendMensual)} más por mes.`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <Mini label="Rinden por mes" valor={fmtK(rendMensual)} color="var(--accent-positive)" />
              <Mini label="Gastos fijos" valor={fmtK(fijos)} color="var(--accent-negative)" />
            </div>
          </div>
        </section>
      </div>

      {/* Metas propias */}
      <section className="flex flex-col gap-4 border-t border-line pt-5">
        <div className="flex items-start gap-3">
          <Target size={20} className="mt-0.5 text-positive" />
          <div>
            <h2 className="text-lg font-bold text-primary">Tus metas</h2>
            <p className="text-xs text-secondary">Arrastralas desde <GripVertical size={11} className="inline" /> para ordenarlas. Si la vinculás a una billetera, el progreso se actualiza solo con ese saldo.</p>
          </div>
        </div>

        {tablaFalta ? (
          <div className="fa-card p-6 text-center text-sm text-secondary">
            Falta crear la tabla de metas en la base de datos. Avisale a Claude 🙂
          </div>
        ) : metas.length === 0 ? (
          <button onClick={() => setEditando('nueva')}
            className="fa-lift flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-10 text-center hover:bg-alternate">
            <span className="text-4xl">🎯</span>
            <span className="text-sm font-semibold text-primary">Creá tu primera meta</span>
            <span className="max-w-sm text-xs text-secondary">Un viaje, un auto, el fondo de emergencia… Poné cuánto necesitás y para cuándo, y te digo a qué ritmo vas.</span>
          </button>
        ) : (
          <GrillaOrdenable
            ids={metas.map(m => m.id)}
            onReordenar={reordenar}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            render={(id, handle, arr) => {
              const m = metas.find(x => x.id === id)
              return m ? renderMeta(m, handle, arr) : null
            }}
          />
        )}
      </section>

      {editando && (
        <EditarMeta
          inicial={editando === 'nueva' ? undefined : editando}
          apps={apps}
          nombreApp={nombreApp}
          onGuardar={guardarMeta}
          onBorrar={editando !== 'nueva' ? () => borrarMeta(editando) : undefined}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function Mini({ label, valor, color }: { label: string; valor: string; color: string }) {
  return (
    <div className="rounded-xl bg-alternate px-2 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="fa-amount text-sm" style={{ color }}>{valor}</p>
    </div>
  )
}

/* ── Crear / editar meta ─────────────────────────────────────────── */

interface DatosMeta { nombre: string; emoji: string; objetivo: string; moneda: 'ARS' | 'USD'; fecha: string; app: string; aportado: string }

function EditarMeta({ inicial, apps, nombreApp, onGuardar, onBorrar, onCerrar }: {
  inicial?: Meta
  apps: string[]
  nombreApp: (app: string) => string
  onGuardar: (d: DatosMeta) => Promise<string | null>
  onBorrar?: () => void
  onCerrar: () => void
}) {
  const [d, setD] = useState<DatosMeta>({
    nombre: inicial?.nombre ?? '',
    emoji: inicial?.emoji ?? '🎯',
    objetivo: inicial ? String(Number(inicial.monto_objetivo)) : '',
    moneda: inicial?.moneda ?? 'ARS',
    fecha: inicial?.fecha_limite ?? '',
    app: inicial?.billetera_app ?? '',
    aportado: inicial ? String(Number(inicial.aportado) || 0) : '0',
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
    <Modal titulo={inicial ? `Editar ${inicial.nombre}` : 'Nueva meta'} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <span className={label}>Ícono</span>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setD({ ...d, emoji: e })}
                className="flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-transform hover:scale-110"
                style={d.emoji === e ? { borderColor: 'var(--accent-confirm)', background: 'color-mix(in srgb, var(--accent-confirm) 14%, transparent)' } : undefined}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label} htmlFor="m-nombre">Nombre</label>
          <input id="m-nombre" autoFocus value={d.nombre} onChange={e => setD({ ...d, nombre: e.target.value })} placeholder="Ej: Viaje a Europa" className={input} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className={label} htmlFor="m-obj">¿Cuánto necesitás?</label>
            <input id="m-obj" type="number" inputMode="decimal" value={d.objetivo} onChange={e => setD({ ...d, objetivo: e.target.value })} className={input} />
          </div>
          <div>
            <span className={label}>Moneda</span>
            <div className="flex overflow-hidden rounded-lg border">
              {(['ARS', 'USD'] as const).map(m => (
                <button key={m} type="button" onClick={() => setD({ ...d, moneda: m })}
                  className={`px-4 py-2.5 text-sm font-semibold ${d.moneda === m ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}>
                  {m === 'ARS' ? '$' : 'US$'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="m-fecha">¿Para cuándo? (opcional)</label>
          <input id="m-fecha" type="date" value={d.fecha} onChange={e => setD({ ...d, fecha: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="m-app">¿Cómo seguís el progreso?</label>
          <select id="m-app" value={d.app} onChange={e => setD({ ...d, app: e.target.value })} className={input}>
            <option value="">Lo voy cargando a mano (botón Aportar)</option>
            {apps.map(a => <option key={a} value={a}>Con el saldo de {nombreApp(a)}</option>)}
          </select>
        </div>
        {!d.app && (
          <div>
            <label className={label} htmlFor="m-aportado">Ya juntaste ({d.moneda === 'USD' ? 'US$' : '$'})</label>
            <input id="m-aportado" type="number" inputMode="decimal" value={d.aportado} onChange={e => setD({ ...d, aportado: e.target.value })} className={input} />
          </div>
        )}
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
