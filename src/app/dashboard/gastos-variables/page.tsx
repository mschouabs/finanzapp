'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Gasto { id: string; descripcion: string; monto: number; moneda: string; categoria: string; fecha: string; es_gasto_hormiga: boolean }
const CATEGORIAS = ['Comida', 'Transporte', 'Entretenimiento', 'Ropa', 'Salud', 'Educación', 'Hogar', 'Otros']

export default function GastosVariablesPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [form, setForm] = useState({ descripcion: '', monto: '', moneda: 'ARS', categoria: 'Otros', fecha: new Date().toISOString().split('T')[0], es_gasto_hormiga: false })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const now = new Date()
    const primerDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data } = await supabase.from('gastos_variables').select('*').eq('user_id', user.id).gte('fecha', primerDia).order('fecha', { ascending: false })
    setGastos(data ?? []); setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('gastos_variables').insert({ user_id: user.id, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, categoria: form.categoria, fecha: form.fecha, es_gasto_hormiga: form.es_gasto_hormiga })
    setForm({ descripcion: '', monto: '', moneda: 'ARS', categoria: 'Otros', fecha: new Date().toISOString().split('T')[0], es_gasto_hormiga: false })
    setShowForm(false); loadData()
  }

  async function eliminar(id: string) {
    const supabase = createClient(); await supabase.from('gastos_variables').delete().eq('id', id); loadData()
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`
  const gastosFiltrados = filtro === 'hormiga' ? gastos.filter(g => g.es_gasto_hormiga) : gastos
  const totalMes = gastos.reduce((s, g) => s + g.monto, 0)
  const totalHormiga = gastos.filter(g => g.es_gasto_hormiga).reduce((s, g) => s + g.monto, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">Gastos Variables</h1><p className="text-slate-500">Gastos del mes en curso</p></div>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Agregar gasto</button>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100"><p className="text-sm text-slate-500">Total del mes</p><p className="text-2xl font-bold text-orange-500">{fmt(totalMes)}</p></div>
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-sm border border-yellow-100"><p className="text-sm text-slate-500">🐜 Gastos hormiga</p><p className="text-2xl font-bold text-yellow-600">{fmt(totalHormiga)}</p></div>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Nuevo gasto variable</h3>
          <input type="text" placeholder="¿En qué gastaste?" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} required className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <input type="number" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} required min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
            <select value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })} className="border border-slate-200 rounded-xl px-3 py-2 text-sm"><option value="ARS">ARS</option><option value="USD">USD</option></select>
          </div>
          <div className="flex gap-2">
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm">{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.es_gasto_hormiga} onChange={e => setForm({ ...form, es_gasto_hormiga: e.target.checked })} className="rounded" />🐜 Es un gasto hormiga</label>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button>
          </div>
        </form>
      )}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFiltro('todos')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filtro === 'todos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>Todos</button>
        <button onClick={() => setFiltro('hormiga')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filtro === 'hormiga' ? 'bg-yellow-500 text-white' : 'bg-white text-slate-600'}`}>🐜 Solo hormiga</button>
      </div>
      {loading ? <p className="text-slate-400 text-center py-8">Cargando...</p> : gastosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><p className="text-4xl mb-2">🛒</p><p>No hay gastos cargados este mes</p></div>
      ) : (
        <div className="space-y-2">{gastosFiltrados.map(g => (
          <div key={g.id} className="bg-white rounded-xl px-5 py-3 shadow-sm border border-slate-100 flex items-center justify-between">
            <div><div className="flex items-center gap-2"><p className="font-medium text-slate-800 text-sm">{g.descripcion}</p>{g.es_gasto_hormiga && <span className="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5">🐜</span>}</div><p className="text-xs text-slate-400">{g.categoria} · {g.fecha}</p></div>
            <div className="flex items-center gap-3"><p className="font-bold text-orange-500">${g.monto.toLocaleString('es-AR')}</p><button onClick={() => eliminar(g.id)} className="text-slate-300 hover:text-red-500 text-sm">🗑</button></div>
          </div>
        ))}</div>
      )}
    </div>
  )
}
