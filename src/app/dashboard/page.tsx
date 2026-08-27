'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LucaWidget } from '@/components/LucaWidget'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'

/* ── helpers ─────────────────────────────────────── */
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

const COLORS = [
  '#3FB950', '#58A6FF', '#F78166', '#D2A8FF',
  '#FFA657', '#79C0FF', '#56D364', '#FF7B72',
]

/* ── types ───────────────────────────────────────── */
interface DashboardData {
  totalIngresos: number
  totalGastos: number
  neto: number
  gastosPorCategoria: { name: string; value: number }[]
  tendenciaMensual: { mes: string; ingresos: number; gastos: number }[]
}

/* ── main component ──────────────────────────────── */
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

    const [{ data: gv }, { data: gf }, { data: iff }, { data: inf }] =
      await Promise.all([
        supabase.from('gastos_variables').select('*'),
        supabase.from('gastos_fijos').select('*'),
        supabase.from('ingresos_fijos').select('*'),
        supabase.from('ingresos_freelance').select('*'),
      ])

    /* totales */
    const totalIngresos =
      (iff || []).reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0) +
      (inf || []).reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0)

    const totalGastos =
      (gv || []).reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0) +
      (gf || []).reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0)

    /* gastos por categoría (donut) */
    const catMap: Record<string, number> = {}
    ;(gv || []).forEach((r: Record<string, unknown>) => {
      const cat = (r.categoria as string) || 'Sin categoría'
      catMap[cat] = (catMap[cat] || 0) + (r.monto as number || 0)
    })
    ;(gf || []).forEach((r: Record<string, unknown>) => {
      catMap['Fijos'] = (catMap['Fijos'] || 0) + (r.monto as number || 0)
    })
    const gastosPorCategoria = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    /* tendencia mensual (últimos 6 meses) */
    const now = new Date()
    const meses: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('es-AR', { month: 'short' })
      meses.push({ key, label })
    }

    const tendenciaMensual = meses.map(({ key, label }) => {
      const ing =
        (iff || []).filter((r: Record<string, unknown>) => ((r.created_at as string) || '').startsWith(key))
          .reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0) +
        (inf || []).filter((r: Record<string, unknown>) => ((r.fecha as string) || '').startsWith(key))
          .reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0)

      const gas =
        (gv || []).filter((r: Record<string, unknown>) => ((r.fecha as string) || '').startsWith(key))
          .reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0) +
        (gf || []).filter((r: Record<string, unknown>) => ((r.created_at as string) || '').startsWith(key))
          .reduce((s: number, r: Record<string, unknown>) => s + (r.monto as number || 0), 0)

      return { mes: label, ingresos: ing, gastos: gas }
    })

    setData({ totalIngresos, totalGastos, neto: totalIngresos - totalGastos, gastosPorCategoria, tendenciaMensual })
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        Cargando...
      </div>
    )
  }

  const d = data!
  const ahorro = d.totalIngresos > 0 ? Math.round((d.neto / d.totalIngresos) * 100) : 0

  const kpis = [
    { label: 'Ingresos', val: fmt(d.totalIngresos), color: 'var(--accent-positive)', emoji: '📈' },
    { label: 'Gastos', val: fmt(d.totalGastos), color: 'var(--accent-negative)', emoji: '📉' },
    { label: 'Neto', val: fmt(d.neto), color: d.neto >= 0 ? 'var(--accent-positive)' : 'var(--accent-negative)', emoji: '💰' },
    { label: 'Tasa de ahorro', val: ahorro + '%', color: 'var(--text-primary)', emoji: '🎯' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          📊 Resumen
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
          Tu panorama financiero actual
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {kpis.map(k => (
          <div
            key={k.label}
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                {k.label}
              </p>
              <span style={{ fontSize: 18 }}>{k.emoji}</span>
            </div>
            <p style={{ color: k.color, fontSize: 22, fontWeight: 700, margin: 0, fontFamily: 'Courier New, monospace' }}>
              {k.val}
            </p>
          </div>
        ))}
      </div>

      {/* Luca — registro de gastos por lenguaje natural */}
      <LucaWidget onSaved={cargar} />

      {/* Flow bar */}
      {d.totalIngresos > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Distribución ingreso / gasto
          </p>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <div style={{ flex: d.totalIngresos, background: 'var(--accent-positive)', borderRadius: 6 }} />
            <div style={{ flex: d.totalGastos, background: 'var(--accent-negative)', borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--accent-positive)' }}>↑ Ingresos {fmt(d.totalIngresos)}</span>
            <span style={{ fontSize: 12, color: 'var(--accent-negative)' }}>↓ Gastos {fmt(d.totalGastos)}</span>
          </div>
        </div>
      )}

      {/* Charts grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

        {/* Donut — gastos por categoría */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Gastos por categoría
          </p>
          {d.gastosPorCategoria.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={d.gastosPorCategoria}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {d.gastosPorCategoria.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-color)', borderRadius: 8, fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
            {d.gastosPorCategoria.map((cat, i) => (
              <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Line chart — tendencia mensual */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Tendencia mensual (6m)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.tendenciaMensual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} width={40} />
              <Tooltip
                formatter={(v: number) => fmt(v)}
                contentStyle={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-color)', borderRadius: 8, fontSize: 13 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="var(--accent-positive)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="gastos" name="Gastos" stroke="var(--accent-negative)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insight rápido */}
      {d.neto !== 0 && (
        <div style={{
          background: d.neto >= 0 ? 'rgba(63,185,80,0.06)' : 'rgba(255,123,114,0.06)',
          border: `0.5px solid ${d.neto >= 0 ? 'rgba(63,185,80,0.25)' : 'rgba(255,123,114,0.25)'}`,
          borderRadius: 'var(--radius)',
          padding: '14px 18px',
          fontSize: 14,
          color: 'var(--text-primary)',
        }}>
          {d.neto >= 0
            ? `✅ Cerrás el período con un superávit de ${fmt(d.neto)} — ahorrando el ${ahorro}% de tus ingresos.`
            : `⚠️ Cerrás el período con un déficit de ${fmt(Math.abs(d.neto))}. Revisá el historial para identificar qué ajustar.`}
        </div>
      )}
    </div>
  )
}
