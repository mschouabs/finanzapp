'use client'

import { useEffect, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, PiggyBank, TrendingDown, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  calcularPatrimonio, esLiquida, mesAnteriorClave, mesClave as claveMes, traerCotizaciones,
  type LineaSaldo,
} from '@/lib/patrimonio'
import {
  COLUMNAS_CONSUMO, avisosDeVencimiento, estadoTarjeta,
  type AvisoVencimiento, type Consumo, type ResumenInfo, type TarjetaInfo,
} from '@/lib/resumenes'
import { fmtDiaMes } from '@/lib/ciclos'
import { pagarConsumos } from '@/lib/movimientos'
import { LucaWidget } from '@/components/LucaWidget'
import { LucaMensaje } from '@/components/luca/LucaMensaje'
import type { LucaEstado } from '@/components/luca/LucaAvatar'
import { PagarResumen } from '@/components/tarjetas/Modales'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts'

/* ── helpers ─────────────────────────────────────── */
const fmt = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

const COLORS = ['#32D158', '#63A9FF', '#A855F7', '#F5C451', '#FF5873', '#22C55E', '#79C0FF', '#DF7897']
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const etiquetaMesClave = (k: string) => `${MESES_CORTO[Number(k.slice(5, 7)) - 1]} '${k.slice(2, 4)}`

const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 10, fontSize: 12, color: 'var(--text-primary)',
}

interface Patrimonio {
  total: number
  liquido: number
  invertido: number
  /** lo que debés en tarjetas (resúmenes + cuotas futuras) */
  deuda: number
  /** patrimonio neto (total - deuda) guardado del mes anterior, si existe */
  anterior: number | null
}

interface PuntoEvolucion { mes: string; neto: number; liquido: number; invertido: number }

interface MovimientoReciente { nombre: string; monto: number; moneda: string; categoria: string; fecha: string }

interface DashboardData {
  totalIngresos: number
  totalGastos: number
  gastosFijosMes: number
  neto: number
  gastosPorCategoria: { name: string; value: number }[]
  comparacionCategorias: { name: string; actual: number; anterior: number }[]
  tendenciaMensual: { mes: string; ingresos: number; gastos: number }[]
  recientes: MovimientoReciente[]
}

const RANGOS = [
  { key: '3', label: '3M' },
  { key: '6', label: '6M' },
  { key: '12', label: '12M' },
  { key: 'todo', label: 'Todo' },
] as const

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [patrimonio, setPatrimonio] = useState<Patrimonio | null>(null)
  const [avisos, setAvisos] = useState<AvisoVencimiento[]>([])
  const [evolucion, setEvolucion] = useState<PuntoEvolucion[]>([])
  const [rango, setRango] = useState<typeof RANGOS[number]['key']>('6')
  const [vistaCategoria, setVistaCategoria] = useState<'torta' | 'comparar'>('torta')
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [pagando, setPagando] = useState<{ t: TarjetaInfo; r: ResumenInfo } | null>(null)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Patrimonio: suma de todos los saldos (billeteras + inversiones) en
     pesos. Cada vez que se abre el Resumen se guarda la foto del mes,
     así el mes que viene se puede comparar contra este. */
  async function cargarPatrimonio() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: ls }, cot, { data: previo }, { data: ts }, { data: cs }, { data: historial }] = await Promise.all([
      supabase.from('inversiones').select('*'),
      traerCotizaciones(),
      supabase.from('patrimonio_mensual').select('total_ars, detalle').eq('mes', mesAnteriorClave()).maybeSingle(),
      supabase.from('tarjetas_cuentas').select('*').eq('tipo', 'tarjeta'),
      supabase.from('gastos_variables').select(COLUMNAS_CONSUMO).eq('forma_pago', 'credito').eq('pagado', false),
      supabase.from('patrimonio_mensual').select('mes, total_ars, detalle').order('mes', { ascending: true }).limit(24),
    ])
    const p = calcularPatrimonio((ls ?? []) as LineaSaldo[], cot)
    const dolar = cot.dolar ?? 1560
    const estados = ((ts ?? []) as TarjetaInfo[]).map(t => estadoTarjeta(t, (cs ?? []) as Consumo[], dolar))
    const deuda = estados.reduce((s, e) => s + e.deuda, 0)
    setAvisos(avisosDeVencimiento(estados, dolar, 7))
    setLineas(((ls ?? []) as LineaSaldo[]).filter(esLiquida))
    /* la comparación es de patrimonio neto; los meses viejos sin ese dato usan el total */
    const prevNeto = previo
      ? Number((previo.detalle as { neto?: number } | null)?.neto ?? previo.total_ars)
      : null
    setPatrimonio({ ...p, deuda, anterior: prevNeto })

    setEvolucion((historial ?? []).map(h => {
      const det = h.detalle as { neto?: number; liquido?: number; invertido?: number } | null
      return {
        mes: h.mes as string,
        neto: Math.round(det?.neto ?? (h.total_ars as number)),
        liquido: Math.round(det?.liquido ?? 0),
        invertido: Math.round(det?.invertido ?? 0),
      }
    }))

    if ((ls ?? []).length > 0) {
      await supabase.from('patrimonio_mensual').upsert(
        {
          user_id: user.id, mes: claveMes(), total_ars: Math.round(p.total),
          detalle: {
            liquido: Math.round(p.liquido), invertido: Math.round(p.invertido),
            deuda_tarjetas: Math.round(deuda), neto: Math.round(p.total - deuda),
            dolar: cot.dolar, btc_usd: cot.btcUsd,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,mes' },
      )
    }
  }

  async function pagar(lineaARS: string | null, lineaUSD: string | null): Promise<string | null> {
    if (!pagando) return null
    const supabase = createClient()
    const { error: e } = await pagarConsumos(supabase, pagando.r.consumos, lineaARS, lineaUSD)
    if (e) return e
    setPagando(null)
    cargar()
    return null
  }

  async function cargar() {
    setLoading(true)
    cargarPatrimonio().catch(() => {})
    const supabase = createClient()
    const dolarRef = (await traerCotizaciones()).dolar ?? 1560

    const [{ data: gv }, { data: gf }, { data: iff }, { data: inf }, { data: secs }, { data: vg }] =
      await Promise.all([
        supabase.from('gastos_variables').select('*'),
        supabase.from('gastos_fijos').select('*'),
        supabase.from('ingresos_fijos').select('*'),
        supabase.from('ingresos_freelance').select('*'),
        supabase.from('secciones').select('id, nombre, tipo'),
        // monto_ars ya viene convertido por la base, sin importar la moneda
        supabase.from('viaje_gastos').select('monto_ars, fecha'),
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
    /* consumos en dólares (tarjeta) se pasan a pesos con el blue del archivo si no hay cotización */
    const montoGv = (r: Record<string, unknown>) => ((r.monto as number) || 0) * (r.moneda === 'USD' ? dolarRef : 1)

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
      (gv || []).filter(r => enMesClave(r, mesActual)), montoGv
    )

    /* Los gastos de viaje son gastos reales del mes: entran al total
       igual que los variables, ya convertidos a pesos por la base. */
    const viajesEnMes = (key: string) =>
      suma(
        (vg || []).filter(r => enMesClave(r, key)),
        r => (r.monto_ars as number) || 0
      )
    const viajesMes = viajesEnMes(mesActual)

    const totalIngresos =
      ingresosFijosMes + freelanceMes +
      sumaSecciones('ingreso', r => enMesClave(r, mesActual))

    const totalGastos =
      gastosFijosMes + variablesMes + viajesMes +
      sumaSecciones('gasto', r => enMesClave(r, mesActual))

    /* gastos por categoría — junta variables + tarjeta (ya están en gv),
       fijos y viajes en un solo mapa, para un mes dado */
    const mapaCategorias = (key: string) => {
      const m: Record<string, number> = {}
      ;(gv || []).filter(r => enMesClave(r, key)).forEach(r => {
        const cat = (r.categoria as string) || 'Sin categoría'
        m[cat] = (m[cat] || 0) + montoGv(r)
      })
      if (gastosFijosMes > 0) m['Fijos'] = (m['Fijos'] || 0) + gastosFijosMes
      const vj = viajesEnMes(key)
      if (vj > 0) m['Viajes'] = (m['Viajes'] || 0) + vj
      regsSecciones
        .filter(r => tipoPorSeccion.get(r.seccion_id as string) === 'gasto')
        .filter(r => enMesClave(r, key))
        .forEach(r => {
          const cat = nombrePorSeccion.get(r.seccion_id as string) || 'Sección'
          m[cat] = (m[cat] || 0) + ((r.monto as number) || 0)
        })
      return m
    }
    const catMap = mapaCategorias(mesActual)
    /* mostramos las 7 más grandes y agrupamos el resto en "Otros",
       así el total del anillo coincide con los gastos del mes */
    const catOrdenadas = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
    const resto = catOrdenadas.slice(7).reduce((s, c) => s + c.value, 0)
    const gastosPorCategoria = resto > 0
      ? [...catOrdenadas.slice(0, 7), { name: 'Otros', value: resto }]
      : catOrdenadas

    /* comparación este mes vs. el mes pasado, por categoría */
    const mesAnteriorKey = mesClave(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const catMapAnt = mapaCategorias(mesAnteriorKey)
    const categoriasTop = catOrdenadas.slice(0, 6).map(c => c.name)
    const comparacionCategorias = categoriasTop.map(name => ({
      name, actual: catMap[name] || 0, anterior: catMapAnt[name] || 0,
    }))

    /* movimientos de los últimos 7 días, para el vistazo rápido */
    const hace7 = new Date(now); hace7.setDate(hace7.getDate() - 7)
    const recientes: MovimientoReciente[] = (gv || [])
      .filter((r: Record<string, unknown>) => {
        const f = (r.fecha as string) || ''
        return f && new Date(f) >= hace7 && new Date(f) <= now
      })
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, 8)
      .map((r: Record<string, unknown>) => ({
        nombre: (r.nombre as string) || 'Gasto',
        monto: (r.monto as number) || 0,
        moneda: (r.moneda as string) || 'ARS',
        categoria: (r.categoria as string) || 'Sin categoría',
        fecha: (r.fecha as string) || '',
      }))

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
        suma((gv || []).filter(r => enMesClave(r, key)), montoGv) +
        viajesEnMes(key) +
        sumaSecciones('gasto', r => enMesClave(r, key)),
    }))

    setData({
      totalIngresos, totalGastos, gastosFijosMes,
      neto: totalIngresos - totalGastos,
      gastosPorCategoria, comparacionCategorias, tendenciaMensual, recientes,
    })
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
        <h1 className="text-2xl font-extrabold text-primary">{saludar()} 👋</h1>
        <p className="mt-1 text-sm text-secondary">Este es tu panorama financiero actual.</p>
      </header>

      {/* vencimientos de tarjeta */}
      {avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {avisos.map(a => (
            <div key={a.tarjeta.id + a.resumen.clave}
              className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
              style={{ borderColor: a.dias < 0 ? 'var(--accent-negative)' : 'var(--accent-warning, #F5C451)' }}>
              <span>{a.dias < 0 ? '⚠️' : '📅'}</span>
              <span className="flex-1 text-primary">
                {a.dias < 0
                  ? <>El resumen de <b>{a.tarjeta.nombre}</b> venció hace {-a.dias} días: {fmt(Math.round(a.monto))}</>
                  : <><b>{a.tarjeta.nombre}</b> vence {a.dias === 0 ? 'hoy' : `en ${a.dias} ${a.dias === 1 ? 'día' : 'días'}`} ({fmtDiaMes(a.resumen.vencimiento)}): {fmt(Math.round(a.monto))}</>}
              </span>
              <button
                onClick={() => setPagando({ t: a.tarjeta, r: a.resumen })}
                className="rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover"
              >
                Pagar ahora
              </button>
              <Link href="/dashboard/tarjetas" className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">
                Ver detalle →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* patrimonio total */}
      {patrimonio && patrimonio.total !== 0 && <TarjetaPatrimonio p={patrimonio} />}

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
            <Link href="/dashboard/ingresos-gastos" className="rounded-lg -m-1 p-1 hover:bg-alternate">
              <Mini icono={<TrendingUp size={16} />} tono="var(--accent-positive)" label="Ingresos" valor={fmt(d.totalIngresos)} />
            </Link>
            <Link href="/dashboard/gastos-variables" className="rounded-lg -m-1 p-1 hover:bg-alternate">
              <Mini icono={<TrendingDown size={16} />} tono="var(--accent-negative)" label="Gastos" valor={fmt(d.totalGastos)} />
            </Link>
            <Mini icono={<PiggyBank size={16} />} tono="var(--accent-secondary)" label="Tasa de ahorro" valor={`${tasaAhorro}%`} />
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

      {/* salud financiera: cuánto de lo que entra ya está comprometido en gastos fijos */}
      {d.totalIngresos > 0 && <SaludFinanciera fijos={d.gastosFijosMes} ingresos={d.totalIngresos} />}

      {/* Luca */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <LucaWidget onSaved={cargar} />
        <LucaMensaje estado={estadoLuca(sinDatos, tasaAhorro)}>
          {mensajeLuca(sinDatos, tasaAhorro, d.totalGastos)}
        </LucaMensaje>
      </div>

      {/* esta semana */}
      {d.recientes.length > 0 && <EstaSemana movimientos={d.recientes} />}

      {/* evolución del patrimonio neto */}
      {evolucion.length >= 2 && (
        <section className="fa-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-primary">Evolución del patrimonio</h2>
              <p className="mt-0.5 text-xs text-secondary">Patrimonio neto, foto de fin de cada mes</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-alternate p-1">
              {RANGOS.map(r => (
                <button key={r.key} onClick={() => setRango(r.key)}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={rango === r.key
                    ? { background: 'var(--bg-card)', color: 'var(--text-primary)' }
                    : { color: 'var(--text-secondary)' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rango === 'todo' ? evolucion : evolucion.slice(-Number(rango))}
                margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={etiquetaMesClave} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
                    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
                    return `$${v}`
                  }}
                />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={etiquetaMesClave} formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="neto" name="Patrimonio neto" stroke="var(--accent-secondary)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

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
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
                    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
                    return `$${v}`
                  }}
                />
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-primary">Gastos por categoría</h2>
              <p className="mt-0.5 text-xs text-secondary">{vistaCategoria === 'torta' ? 'Este mes' : 'Este mes vs. el pasado'}</p>
            </div>
            {d.gastosPorCategoria.length > 0 && (
              <div className="flex gap-1 rounded-lg bg-alternate p-1">
                <button onClick={() => setVistaCategoria('torta')}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={vistaCategoria === 'torta' ? { background: 'var(--bg-card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}>
                  Torta
                </button>
                <button onClick={() => setVistaCategoria('comparar')}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={vistaCategoria === 'comparar' ? { background: 'var(--bg-card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}>
                  Comparar
                </button>
              </div>
            )}
          </div>

          {d.gastosPorCategoria.length === 0 ? (
            <LucaMensaje
              variante="vacio"
              estado="sad"
              titulo="Todavía no registraste gastos"
              accion={{ label: 'Registrar gasto', href: '/dashboard/gastos-variables' }}
            >
              Registrá tu primer gasto con Luca y empezá a ver tus categorías.
            </LucaMensaje>
          ) : vistaCategoria === 'comparar' ? (
            <div className="mt-3 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.comparacionCategorias} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
                  <Bar dataKey="anterior" name="Mes pasado" fill="var(--border-color)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Este mes" fill="var(--accent-secondary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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

      {pagando && (
        <PagarResumen
          tarjeta={pagando.t}
          resumen={pagando.r}
          lineas={lineas}
          onPagar={pagar}
          onCerrar={() => setPagando(null)}
        />
      )}
    </div>
  )
}

/* ── helpers de UI ──────────────────────────────── */

function saludar() {
  const h = new Date().getHours()
  if (h < 12) return '¡Buenos días!'
  if (h < 19) return '¡Buenas tardes!'
  return '¡Buenas noches!'
}

/* ── piezas ──────────────────────────────────────── */

const MESES_NOMBRE = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function TarjetaPatrimonio({ p }: { p: Patrimonio }) {
  const hoy = new Date()
  const mesAnt = MESES_NOMBRE[(hoy.getMonth() + 11) % 12]
  const mesSig = MESES_NOMBRE[(hoy.getMonth() + 1) % 12]
  const neto = p.total - p.deuda
  const diff = p.anterior !== null ? neto - p.anterior : null
  const pct = diff !== null && p.anterior ? Math.round((diff / Math.abs(p.anterior)) * 1000) / 10 : null
  const sube = (diff ?? 0) >= 0
  const tono = sube ? 'var(--accent-positive)' : 'var(--accent-negative)'

  return (
    <section className="fa-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-secondary">Patrimonio neto</h2>
          <p className="fa-amount mt-1 text-4xl text-primary">{fmt(Math.round(neto))}</p>
          {p.deuda > 0 && (
            <p className="mt-0.5 text-xs text-secondary">
              {fmt(Math.round(p.total))} en tus cuentas − {fmt(Math.round(p.deuda))} que debés en tarjetas
            </p>
          )}
          {diff !== null ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-sm">
              {sube ? <ArrowUpRight size={16} style={{ color: tono }} /> : <ArrowDownRight size={16} style={{ color: tono }} />}
              <span className="font-semibold" style={{ color: tono }}>
                {sube ? '+' : '-'}{fmt(Math.abs(Math.round(diff)))}{pct !== null ? ` (${sube ? '+' : ''}${pct}%)` : ''}
              </span>
              <span className="text-secondary">
                vs. fin de {mesAnt} — {sube ? 'tenés más que el mes pasado 🎉' : 'tenés menos que el mes pasado'}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-secondary">
              Guardé la foto de este mes. A partir de {mesSig} te muestro si tenés más o menos que el mes anterior.
            </p>
          )}
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-secondary">🏦 Disponible</p>
            <p className="fa-amount text-lg text-primary">{fmt(Math.round(p.liquido))}</p>
          </div>
          <div>
            <p className="text-xs text-secondary">📈 Invertido</p>
            <p className="fa-amount text-lg text-primary">{fmt(Math.round(p.invertido))}</p>
          </div>
          {p.deuda > 0 && (
            <div>
              <p className="text-xs text-secondary">💳 Deuda tarjetas</p>
              <p className="fa-amount text-lg text-negative">−{fmt(Math.round(p.deuda))}</p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
        <div style={{ width: `${p.total > 0 ? (p.liquido / p.total) * 100 : 0}%`, background: 'var(--accent-secondary)' }} />
        <div style={{ width: `${p.total > 0 ? (p.invertido / p.total) * 100 : 0}%`, background: 'var(--accent-positive)' }} />
      </div>
      <div className="mt-3 flex gap-4">
        <Link href="/dashboard/billeteras" className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">
          Ver billeteras →
        </Link>
        {p.deuda > 0 && (
          <Link href="/dashboard/tarjetas" className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">
            Ver tarjetas →
          </Link>
        )}
      </div>
    </section>
  )
}

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

function SaludFinanciera({ fijos, ingresos }: { fijos: number; ingresos: number }) {
  const pct = Math.round((fijos / ingresos) * 100)
  const [color, texto] = pct <= 50
    ? ['var(--accent-positive)', 'Tus gastos fijos están controlados.']
    : pct <= 70
    ? ['var(--accent-warning, #F5C451)', 'Tus gastos fijos ocupan buena parte de lo que entra.']
    : ['var(--accent-negative)', 'Tus gastos fijos se comen casi todo el ingreso.']
  return (
    <section className="fa-card flex flex-wrap items-center gap-4 p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
        {pct}%
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">Salud financiera: gastos fijos vs. ingresos</p>
        <p className="mt-0.5 text-xs text-secondary">{texto}</p>
      </div>
      <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full sm:w-40" style={{ background: 'var(--border-color)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </section>
  )
}

function EstaSemana({ movimientos }: { movimientos: MovimientoReciente[] }) {
  return (
    <section className="fa-card p-5">
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-secondary" />
        <h2 className="text-base font-bold text-primary">Esta semana</h2>
      </div>
      <p className="mt-0.5 text-xs text-secondary">Tus últimos movimientos, de un vistazo</p>
      <ul className="mt-3 divide-y divide-line">
        {movimientos.map((m, i) => (
          <li key={i} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-primary">{m.nombre}</span>
            <span className="shrink-0 rounded-full bg-alternate px-2 py-0.5 text-[11px] capitalize text-secondary">{m.categoria}</span>
            <span className="shrink-0 text-xs text-muted">{fmtDiaMes(new Date(m.fecha + 'T00:00:00'))}</span>
            <span className="fa-amount shrink-0 text-primary">
              {m.moneda === 'USD' ? `US$ ${m.monto.toLocaleString('es-AR')}` : fmt(m.monto)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/dashboard/gastos-variables" className="mt-3 inline-block text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary">
        Ver todos los movimientos →
      </Link>
    </section>
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
