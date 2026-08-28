'use client'

import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, PiggyBank, TrendingDown, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { LucaWidget } from '@/components/LucaWidget'
import { LucaMensaje } from '@/components/luca/LucaMensaje'
import type { LucaEstado } from '@/components/luca/LucaAvatar'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'

/* ── helpers ─────────────────────────────────────── */
const fmt = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

const COLORS = ['#32D158', '#63A9FF', '#A855F7', '#F5C451', '#FF5873', '#22C55E', '#79C0FF', '#DF7897']

interface DashboardData {
  totalIngresos: number
  totalGastos: number
  neto: number
  gastosPorCategoria: { name: string; value: number }[]
  tendenciaMensual: { mes: string; ingresos: number; gastos: number }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setLoading(true)
    const supabase = createClient()

    const [{ data: gv }, { data: gf }, { data: iff }, { data: inf }, { data: secs }] =
      await Promise.all([
        supabase.from('gastos_variables').select('*'),
        supabase.from('gastos_fijos').select('*'),
        supabase.from('ingresos_fijos').select('*'),
        supabase.from('ingresos_freelance').select('*'),
        supabase.from('secciones').select('id, nombre, tipo'),
      ])

    /* registros de secciones dinámicas (las neutras no cuentan) */
    const secsContables = (secs || []).filter(
      (s: Record<string, unknown>) => s.tipo === 'ingreso' || s.tipo === 'gasto'
    )
    const tipoPorSeccion = new Map<string, string>(
      secsContables.map((s: Record<string, unknown>) => [s.id as string, s.tipo as string])
    )
    const nombrePorSeccion = new Map<string, string>(
      secsContables.map((s: Record<string, unknown>) => [s.id as string, s.nombre as string])
    )

    let regsSecciones: Record<string, unknown>[] = []
    if (secsContables.length > 0) {
      const { data: regs } = await supabase
        .from('seccion_registros')
        .select('seccion_id, monto, fecha')
        .in('seccion_id', Array.from(tipoPorSeccion.keys()))
      regsSecciones = regs || []
    }

    const sumaSecciones = (tipo: string, filtro?: (r: Record<string, unknown>) => boolean) =>
      regsSecciones
        .filter(r => tipoPorSeccion.get(r.seccion_id as string) === tipo)
        .filter(r => (filtro ? filtro(r) : true))
        .reduce((s, r) => s + ((r.monto as number) || 0), 0)

    /* ── criterios de monto ──────────────────────────
       Los fijos son recurrentes: cuentan una vez por mes.
       Los variables/freelance/secciones cuentan en su mes. */
    const activos = (rows: Record<string, unknown>[] | null) =>
      (rows || []).filter(r => r.activo !== false)

    const montoFijo = (r: Record<string, unknown>) =>
      (r.monto_cobrado as number) ?? (r.monto as number) ?? 0
    const montoFreelance = (r: Record<string, unknown>) =>
      (r.monto_cobrado as number) ?? (r.monto_total as number) ?? (r.monto as number) ?? 0
    const suma = (rows: Record<string, unknown>[], f: (r: Record<string, unknown>) => number) =>
      rows.reduce((s, r) => s + (f(r) || 0), 0)

    const mesClave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const now = new Date()
    const mesActual = mesClave(now)
    const enMesClave = (r: Record<string, unknown>, key: string) =>
      ((r.fecha as string) || (r.created_at as string) || '').startsWith(key)

    const iffActivos = activos(iff)
    const gfActivos = activos(gf)

    /* recurrentes: mismo importe todos los meses */
    const ingresosFijosMes = suma(iffActivos, montoFijo)
    const gastosFijosMes = suma(gfActivos, r => (r.monto as number) || 0)

    /* totales del mes en curso */
    const freelanceMes = suma(
      (inf || []).filter(r => enMesClave(r, mesActual)), montoFreelance
    )
    const variablesMes = suma(
      (gv || []).filter(r => enMesClave(r, mesActual)), r => (r.monto as number) || 0
    )

    const totalIngresos =
      ingresosFijosMes + freelanceMes +
      sumaSecciones('ingreso', r => enMesClave(r, mesActual))

    const totalGastos =
      gastosFijosMes + variablesMes +
      sumaSecciones('gasto', r => enMesClave(r, mesActual))

    /* gastos por categoría (mes en curso) */
    const catMap: Record<string, number> = {}
    ;(gv || []).filter(r => enMesClave(r, mesActual)).forEach(r => {
      const cat = (r.categoria as string) || 'Sin categoría'
      catMap[cat] = (catMap[cat] || 0) + ((r.monto as number) || 0)
    })
    if (gastosFijosMes > 0) catMap['Fijos'] = (catMap['Fijos'] || 0) + gastosFijosMes
    regsSecciones
      .filter(r => tipoPorSeccion.get(r.seccion_id as string) === 'gasto')
      .filter(r => enMesClave(r, mesActual))
      .forEach(r => {
        const cat = nombrePorSeccion.get(r.seccion_id as string) || 'Sección'
        catMap[cat] = (catMap[cat] || 0) + ((r.monto as number) || 0)
      })
    const gastosPorCategoria = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    /* tendencia de los últimos 6 meses */
    const meses: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses.push({ key: mesClave(d), label: d.toLocaleDateString('es-AR', { month: 'short' }) })
    }

    const tendenciaMensual = meses.map(({ key, label }) => ({
      mes: label,
      ingresos:
        ingresosFijosMes +
        suma((inf || []).filter(r => enMesClave(r, key)), montoFreelance) +
        sumaSecciones('ingreso', r => enMesClave(r, key)),
      gastos:
        gastosFijosMes +
        suma((gv || []).filter(r => enMesClave(r, key)), r => (r.monto as number) || 0) +
        sumaSecciones('gasto', r => enMesClave(r, key)),
    }))

    setData({ totalIngresos, totalGastos, neto: totalIngresos - totalGastos, gastosPorCategoria, tendenciaMensual })
    setLoading(false)
  }

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Cargando…</p>
  }

  const d = data!
  const totalCategorias = d.gastosPorCategoria.reduce((s, c) => s + c.value, 0)
  const tasaAhorro = d.totalIngresos > 0 ? Math.round((d.neto / d.totalIngresos) * 100) : 0

  /* variación del neto contra el mes anterior */
  const serie = d.tendenciaMensual
  const netoMes = (i: number) => (serie[i] ? serie[i].ingresos - serie[i].gastos : 0)
  const actual = netoMes(serie.length - 1)
  const previo = netoMes(serie.length - 2)
  const variacion = previo !== 0 ? Math.round(((actual - previo) / Math.abs(previo)) * 100) : null

  const sinDatos = d.totalIngresos === 0 && d.totalGastos === 0

  return (
    <div className="flex flex-col gap-5">
      {/* saludo */}
      <header>
        <h1 className="text-2xl font-extrabold text-primary">¡Buenas! 👋</h1>
        <p className="mt-1 text-sm text-secondary">Este es tu panorama financiero actual.</p>
      </header>

      {/* balance + tasa de ahorro */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="fa-card p-5">
          <h2 className="text-sm font-semibold text-secondary">Balance del mes</h2>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p
                className="fa-amount text-4xl"
                style={{ color: d.neto >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)' }}
              >
                {fmt(d.neto)}
              </p>
              {variacion !== null && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-secondary">
                  {variacion >= 0
                    ? <ArrowUpRight size={14} style={{ color: 'var(--accent-positive)' }} />
                    : <ArrowDownRight size={14} style={{ color: 'var(--accent-negative)' }} />}
                  <span style={{ color: variacion >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)' }}>
                    {Math.abs(variacion)}%
                  </span>
                  respecto al mes anterior
                </p>
              )}
            </div>
            <Sparkline valores={serie.map((_, i) => netoMes(i))} />
          </div>

          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
            <Mini icono={<TrendingUp size={16} />} tono="var(--accent-positive)" label="Ingresos" valor={fmt(d.totalIngresos)} />
            <Mini icono={<TrendingDown size={16} />} tono="var(--accent-negative)" label="Gastos" valor={fmt(d.totalGastos)} />
            <Mini icono={<PiggyBank size={16} />} tono="var(--accent-secondary)" label="Ahorro" valor={fmt(d.neto)} />
          </div>
        </section>

        <section className="fa-card flex flex-col items-center justify-center p-5">
          <h2 className="text-sm font-semibold text-secondary">Tasa de ahorro</h2>
          <Anillo pct={tasaAhorro} />
          <p className="mt-3 text-center text-xs text-secondary">
            {tasaAhorro >= 30 ? '¡Excelente! Seguí así 🚀'
              : tasaAhorro > 0 ? 'Vas bien, hay margen para más'
              : 'Todavía no estás ahorrando este mes'}
          </p>
        </section>
      </div>

      {/* Luca */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <LucaWidget onSaved={cargar} />
        <LucaMensaje estado={estadoLuca(sinDatos, tasaAhorro)}>
          {mensajeLuca(sinDatos, tasaAhorro, d.totalGastos)}
        </LucaMensaje>
      </div>

      {/* gráficos */}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <section className="fa-card p-5">
          <h2 className="text-base font-bold text-primary">Evolución de tus finanzas</h2>
          <p className="mt-0.5 text-xs text-secondary">Ingresos vs. gastos, últimos 6 meses</p>

          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                  formatter={(v: number) => fmt(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="var(--accent-positive)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="gastos" name="Gastos" stroke="var(--accent-negative)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="fa-card p-5">
          <h2 className="text-base font-bold text-primary">Gastos por categoría</h2>
          <p className="mt-0.5 text-xs text-secondary">Este mes</p>

          {d.gastosPorCategoria.length === 0 ? (
            <LucaMensaje
              variante="vacio"
              estado="sad"
              titulo="Todavía no registraste gastos"
              accion={{ label: 'Registrar gasto', href: '/dashboard/gastos-variables' }}
            >
              Registrá tu primer gasto con Luca y empezá a ver tus categorías.
            </LucaMensaje>
          ) : (
            <>
              <div className="relative mt-2 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={d.gastosPorCategoria}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {d.gastosPorCategoria.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        fontSize: 12,
                        color: 'var(--text-primary)',
                      }}
                      formatter={(v: number) => fmt(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* total en el centro del anillo */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Total</span>
                  <span className="fa-amount text-base text-primary">{fmt(totalCategorias)}</span>
                </div>
              </div>

              {/* referencias: sin esto el anillo no se entiende */}
              <ul className="mt-3 space-y-1.5">
                {d.gastosPorCategoria.slice(0, 5).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate capitalize text-secondary">{c.name}</span>
                    <span className="fa-amount shrink-0 text-primary">{fmt(c.value)}</span>
                    <span className="w-9 shrink-0 text-right text-muted">
                      {totalCategorias > 0 ? Math.round((c.value / totalCategorias) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/* ── piezas ──────────────────────────────────────── */

function Mini({ icono, tono, label, valor }: { icono: React.ReactNode; tono: string; label: string; valor: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tono} 16%, transparent)`, color: tono }}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-secondary">{label}</p>
        <p className="fa-amount truncate text-lg text-primary">{valor}</p>
      </div>
    </div>
  )
}

function Anillo({ pct }: { pct: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const visible = (Math.min(Math.max(pct, 0), 100) / 100) * circ
  return (
    <div className="relative mt-3">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border-color)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke="var(--accent-positive)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${visible} ${circ}`}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <span className="fa-amount absolute inset-0 flex items-center justify-center text-2xl text-primary">
        {pct}%
      </span>
    </div>
  )
}

function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const w = 160
  const h = 48
  const puntos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * w},${h - ((v - min) / rango) * h}`)
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={puntos}
        fill="none"
        stroke="var(--accent-positive)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── copy de Luca ────────────────────────────────── */

function estadoLuca(sinDatos: boolean, tasa: number): LucaEstado {
  if (sinDatos) return 'sad'
  if (tasa >= 30) return 'celebration'
  if (tasa <= 0) return 'warning'
  return 'idle'
}

function mensajeLuca(sinDatos: boolean, tasa: number, gastos: number) {
  if (sinDatos) {
    return (
      <>
        Todavía no hay movimientos cargados.
        <br />
        <span className="text-secondary">Contame tu primer gasto o ingreso acá al lado.</span>
      </>
    )
  }
  if (gastos === 0) {
    return (
      <>
        Tranqui, todavía no te patinaste la guita 😎
        <br />
        <span className="text-secondary">Seguí registrando tus movimientos.</span>
      </>
    )
  }
  if (tasa >= 30) {
    return (
      <>
        Estás ahorrando el {tasa}% de lo que entra. 🎉
        <br />
        <span className="text-secondary">Muy buen mes.</span>
      </>
    )
  }
  if (tasa <= 0) {
    return (
      <>
        Este mes gastaste más de lo que entró.
        <br />
        <span className="text-secondary">Mirá Gastos &amp; CC para ver dónde se fue.</span>
      </>
    )
  }
  return (
    <>
      Vas ahorrando un {tasa}% de tus ingresos.
      <br />
      <span className="text-secondary">Hay margen para estirarlo un poco más.</span>
    </>
  )
}
