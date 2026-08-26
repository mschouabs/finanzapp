'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface ResumenData {
  totalIngresos: number
  totalGastosFijos: number
  totalGastosVariables: number
  saldoMensual: number
  gastosHormiga: number
  dolarBlue: number | null
  dolarOficial: number | null
  tasaAhorro: number
}

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function KpiCard({ label, value, color, bg, border, icon }: {
  label: string; value: string; color: string; bg: string; border: string; icon: string
}) {
  return (
    <div className={`rounded-2xl p-5 border ${bg} ${border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function FlowBar({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-6">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-slate-600">{label}</span>
          <span className="text-xs font-bold text-slate-700">{fmt(value)}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function ResumenPage() {
  const [data, setData] = useState<ResumenData>({
    totalIngresos: 0, totalGastosFijos: 0, totalGastosVariables: 0,
    saldoMensual: 0, gastosHormiga: 0, dolarBlue: null, dolarOficial: null, tasaAhorro: 0
  })
  const [loading, setLoading] = useState(true)
  const [mes] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  useEffect(() => { loadData(); fetchDolar() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const primerDia = `${mes.year}-${String(mes.month).padStart(2, '0')}-01`
    const ultimoDia = new Date(mes.year, mes.month, 0).toISOString().split('T')[0]

    const [{ data: ingresos }, { data: gastosFijos }, { data: gastosVar }] = await Promise.all([
      supabase.from('ingresos_fijos').select('monto').eq('user_id', user.id).eq('activo', true),
      supabase.from('gastos_fijos').select('monto').eq('user_id', user.id).eq('activo', true),
      supabase.from('gastos_variables').select('monto, es_gasto_hormiga').eq('user_id', user.id).gte('fecha', primerDia).lte('fecha', ultimoDia),
    ])

    const totalIngresos = ingresos?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const totalGastosFijos = gastosFijos?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const totalGastosVariables = gastosVar?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const gastosHormiga = gastosVar?.filter(g => g.es_gasto_hormiga).reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const saldoMensual = totalIngresos - totalGastosFijos - totalGastosVariables
    const tasaAhorro = totalIngresos > 0 ? (saldoMensual / totalIngresos) * 100 : 0

    setData(prev => ({ ...prev, totalIngresos, totalGastosFijos, totalGastosVariables, saldoMensual, gastosHormiga, tasaAhorro }))
    setLoading(false)
  }

  async function fetchDolar() {
    try {
      const res = await fetch('/api/dolar')
      const json = await res.json()
      setData(prev => ({ ...prev, dolarBlue: json.blue, dolarOficial: json.oficial }))
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 animate-pulse text-lg">Cargando...</div>
      </div>
    )
  }

  const insights: string[] = []
  if (data.tasaAhorro >= 50) insights.push(`🟢 Tu tasa de ahorro es ${data.tasaAhorro.toFixed(0)}% — superás la meta del 50%.`)
  else if (data.tasaAhorro > 0) insights.push(`🟡 Tu tasa de ahorro es ${data.tasaAhorro.toFixed(0)}%. La meta es llegar al 50%.`)
  if (data.gastosHormiga > 0 && data.totalIngresos > 0) {
    insights.push(`🐜 Los gastos hormiga suman ${fmt(data.gastosHormiga)} (${((data.gastosHormiga / data.totalIngresos) * 100).toFixed(1)}% de tus ingresos).`)
  }
  if (data.saldoMensual < 0) insights.push(`🔴 Gastos mayores a ingresos este mes. Diferencia: ${fmt(Math.abs(data.saldoMensual))}.`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Resumen</h1>
          <p className="text-slate-500 text-sm">{meses[mes.month - 1]} {mes.year}</p>
        </div>
        {data.dolarBlue && (
          <div className="flex gap-4 bg-white border border-slate-200 rounded-xl px-4 py-2">
            <div className="text-center">
              <p className="text-xs text-slate-400 font-medium">Oficial</p>
              <p className="text-sm font-bold text-slate-700">${data.dolarOficial?.toFixed(0)}</p>
            </div>
            <div className="w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-xs text-slate-400 font-medium">Blue</p>
              <p className="text-sm font-bold text-blue-600">${data.dolarBlue?.toFixed(0)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos del mes" value={fmt(data.totalIngresos)} color="text-green-600" bg="bg-white" border="border-slate-100" icon="💚" />
        <KpiCard label="Gastos fijos" value={fmt(data.totalGastosFijos)} color="text-red-500" bg="bg-white" border="border-slate-100" icon="🔴" />
        <KpiCard label="Gastos variables" value={fmt(data.totalGastosVariables)} color="text-orange-500" bg="bg-white" border="border-slate-100" icon="🛒" />
        <KpiCard
          label="Disponible"
          value={fmt(data.saldoMensual)}
          color={data.saldoMensual >= 0 ? 'text-green-700' : 'text-red-600'}
          bg={data.saldoMensual >= 0 ? 'bg-green-50' : 'bg-red-50'}
          border={data.saldoMensual >= 0 ? 'border-green-100' : 'border-red-100'}
          icon="💰"
        />
      </div>

      {data.totalIngresos > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Flujo del mes</h2>
          <div className="space-y-3">
            <FlowBar label="Ingresos" value={data.totalIngresos} max={data.totalIngresos} color="bg-green-500" icon="💚" />
            <FlowBar label="Gastos fijos" value={data.totalGastosFijos} max={data.totalIngresos} color="bg-red-500" icon="📌" />
            <FlowBar label="Gastos variables" value={data.totalGastosVariables} max={data.totalIngresos} color="bg-orange-400" icon="🛒" />
            <FlowBar label="Disponible" value={Math.max(data.saldoMensual, 0)} max={data.totalIngresos} color="bg-blue-500" icon="✅" />
          </div>
          {data.totalIngresos > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Tasa de ahorro</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${data.tasaAhorro >= 50 ? 'bg-green-500' : data.tasaAhorro >= 25 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(Math.max(data.tasaAhorro, 0), 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${data.tasaAhorro >= 50 ? 'text-green-600' : data.tasaAhorro >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                  {data.tasaAhorro.toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-blue-800 mb-3">💡 Insights del mes</h2>
          <ul className="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} className="text-sm text-blue-700">{ins}</li>
            ))}
          </ul>
        </div>
      )}

      {data.gastosHormiga > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🐜</span>
            <div>
              <h3 className="font-semibold text-yellow-800 text-sm">Gastos hormiga</h3>
              <p className="text-yellow-700 text-sm mt-1">
                Gastaste <strong>{fmt(data.gastosHormiga)}</strong> en pequeños gastos frecuentes
                {data.totalIngresos > 0 && <> — <strong>{((data.gastosHormiga / data.totalIngresos) * 100).toFixed(1)}%</strong> de tus ingresos</>}.
              </p>
            </div>
          </div>
        </div>
      )}

      {data.totalIngresos === 0 && data.totalGastosFijos === 0 && (
        <div className="bg-white rounded-2xl p-10 border border-dashed border-slate-200 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-slate-600 font-medium">No hay datos cargados todavía</p>
          <p className="text-slate-400 text-sm mt-1">Agregá ingresos y gastos en la sección <strong>Trabajos</strong> y <strong>Gastos & CC</strong></p>
        </div>
      )}
    </div>
  )
}
