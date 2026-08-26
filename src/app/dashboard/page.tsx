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
}

export default function ResumenPage() {
  const [data, setData] = useState<ResumenData>({ totalIngresos: 0, totalGastosFijos: 0, totalGastosVariables: 0, saldoMensual: 0, gastosHormiga: 0, dolarBlue: null, dolarOficial: null })
  const [loading, setLoading] = useState(true)
  const [mes] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() + 1 } })

  useEffect(() => { loadData(); fetchDolar() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const primerDia = `${mes.year}-${String(mes.month).padStart(2, '0')}-01`
    const ultimoDia = new Date(mes.year, mes.month, 0).toISOString().split('T')[0]
    const { data: ingresos } = await supabase.from('ingresos_fijos').select('monto').eq('user_id', user.id).eq('activo', true)
    const { data: gastosFijos } = await supabase.from('gastos_fijos').select('monto').eq('user_id', user.id).eq('activo', true)
    const { data: gastosVar } = await supabase.from('gastos_variables').select('monto, es_gasto_hormiga').eq('user_id', user.id).gte('fecha', primerDia).lte('fecha', ultimoDia)
    const totalIngresos = ingresos?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const totalGastosFijos = gastosFijos?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const totalGastosVariables = gastosVar?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const gastosHormiga = gastosVar?.filter(g => g.es_gasto_hormiga).reduce((s, i) => s + Number(i.monto), 0) ?? 0
    setData(prev => ({ ...prev, totalIngresos, totalGastosFijos, totalGastosVariables, saldoMensual: totalIngresos - totalGastosFijos - totalGastosVariables, gastosHormiga }))
    setLoading(false)
  }

  async function fetchDolar() {
    try { const res = await fetch('/api/dolar'); const json = await res.json(); setData(prev => ({ ...prev, dolarBlue: json.blue, dolarOficial: json.oficial })) } catch {}
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-slate-400 text-lg">Cargando...</div></div>

  return (
    <div>
      <div className="mb-6"><h1 className="text-2xl font-bold text-slate-800">Resumen</h1><p className="text-slate-500">{meses[mes.month - 1]} {mes.year}</p></div>
      {data.dolarBlue && (
        <div className="bg-blue-600 text-white rounded-2xl p-4 mb-6 flex gap-8">
          <div><p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Dólar Oficial</p><p className="text-2xl font-bold">${data.dolarOficial?.toFixed(2)}</p></div>
          <div><p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Dólar Blue</p><p className="text-2xl font-bold">${data.dolarBlue?.toFixed(2)}</p></div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><p className="text-slate-500 text-sm">💚 Ingresos del mes</p><p className="text-2xl font-bold text-green-600 mt-1">{fmt(data.totalIngresos)}</p></div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><p className="text-slate-500 text-sm">🔴 Gastos fijos</p><p className="text-2xl font-bold text-red-500 mt-1">{fmt(data.totalGastosFijos)}</p></div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><p className="text-slate-500 text-sm">🛒 Gastos variables</p><p className="text-2xl font-bold text-orange-500 mt-1">{fmt(data.totalGastosVariables)}</p></div>
        <div className={`rounded-2xl p-5 shadow-sm border ${data.saldoMensual >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}><p className="text-slate-500 text-sm">💰 Saldo del mes</p><p className={`text-2xl font-bold mt-1 ${data.saldoMensual >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(data.saldoMensual)}</p></div>
      </div>
      {data.gastosHormiga > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🐜</span>
            <div>
              <h3 className="font-semibold text-yellow-800">Gastos Hormiga del mes</h3>
              <p className="text-yellow-700 text-sm mt-1">Gastaste <strong>{fmt(data.gastosHormiga)}</strong> en pequeños gastos frecuentes.{data.totalIngresos > 0 && <> Eso es el <strong>{((data.gastosHormiga / data.totalIngresos) * 100).toFixed(1)}%</strong> de tus ingresos.</>}</p>
              <p className="text-yellow-600 text-xs mt-2">💡 Los gastos hormiga son compras pequeñas y frecuentes que suman sin que te des cuenta.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
