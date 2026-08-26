'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Item { id: string; descripcion: string; monto: number; moneda: string; categoria?: string; activo: boolean }

export default function IngresosGastosPage() {
  const [ingresos, setIngresos] = useState<Item[]>([])
  const [gastos, setGastos] = useState<Item[]>([])
  const [tab, setTab] = useState<'ingresos' | 'gastos'>('ingresos')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ descripcion: '', monto: '', moneda: 'ARS', categoria: 'Otros' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: ing }, { data: gas }] = await Promise.all([
      supabase.from('ingresos_fijos').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('gastos_fijos').select('*').eq('user_id', user.id).order('created_at'),
    ])
    setIngresos(ing ?? []); setGastos(gas ?? []); setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const tabla = tab === 'ingresos' ? 'ingresos_fijos' : 'gastos_fijos'
    await supabase.from(tabla).insert({ user_id: user.id, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, ...(tab === 'gastos' && { categoria: form.categoria }) })
    setForm({ descripcion: '', monto: '', moneda: 'ARS', categoria: 'Otros' }); setShowForm(false); loadData()
  }

  async function toggleActivo(id: string, tabla: string, activo: boolean) {
    const supabase = createClient(); await supabase.from(tabla).update({ activo: !activo }).eq('id', id); loadData()
  }

  async function eliminar(id: string, tabla: string) {
    const supabase = createClient(); await supabase.from(tabla).delete().eq('id', id); loadData()
  }

  const fmt = (n: number, m: string) => `${m === 'USD' ? 'USD' : '$'}${n.toLocaleString('es-AR')}`
  const lista = tab === 'ingresos' ? ingresos : gastos
  const tabla = tab === 'ingresos' ? 'ingresos_fijos' : 'gastos_fijos'
  const total = lista.filter(i => i.activo).reduce((s, i) => s + i.monto, 0)
  const categoriasGastos = ['Alquiler', 'Servicios', 'Suscripciones', 'Cuotas', 'Seguros', 'Otros']

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">Ingresos y Gastos Fijos</h1><p className="text-slate-500">Ingresos y gastos que se repiten cada mes</p></div>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Agregar</button>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setTab('ingresos'); setShowForm(false) }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'ingresos' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>💚 Ingresos</button>
        <button onClick={() => { setTab('gastos'); setShowForm(false) }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'gastos' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>🔴 Gastos</button>
      </div>
      <div className={`rounded-2xl p-4 mb-4 ${tab === 'ingresos' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
        <p className="text-sm text-slate-500">Total mensual ({tab})</p>
        <p className={`text-3xl font-bold ${tab === 'ingresos' ? 'text-green-700' : 'text-red-600'}`}>${total.toLocaleString('es-AR')}</p>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Nuevo {tab === 'ingresos' ? 'ingreso' : 'gasto'} fijo</h3>
          <input type="text" placeholder="Descripción" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} required className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <input type="number" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} required min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
            <select value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })} className="border border-slate-200 rounded-xl px-3 py-2 text-sm"><option value="ARS">ARS</option><option value="USD">USD</option></select>
          </div>
          {tab === 'gastos' && <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm">{categoriasGastos.map(c => <option key={c} value={c}>{c}</option>)}</select>}
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button>
          </div>
        </form>
      )}
      {loading ? <p className="text-slate-400 text-center py-8">Cargando...</p> : lista.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><p className="text-4xl mb-2">{tab === 'ingresos' ? '💚' : '🔴'}</p><p>No hay {tab} fijos cargados</p></div>
      ) : (
        <div className="space-y-2">{lista.map(item => (
          <div key={item.id} className={`bg-white rounded-xl px-5 py-4 shadow-sm border flex items-center justify-between ${!item.activo ? 'opacity-50' : 'border-slate-100'}`}>
            <div><p className="font-medium text-slate-800">{item.descripcion}</p>{item.categoria && <p className="text-xs text-slate-400">{item.categoria}</p>}</div>
            <div className="flex items-center gap-4">
              <p className={`font-bold ${tab === 'ingresos' ? 'text-green-600' : 'text-red-500'}`}>{fmt(item.monto, item.moneda)}</p>
              <div className="flex gap-2">
                <button onClick={() => toggleActivo(item.id, tabla, item.activo)} className="text-xs text-slate-400 hover:text-slate-600">{item.activo ? '⏸' : '▶'}</button>
                <button onClick={() => eliminar(item.id, tabla)} className="text-xs text-slate-400 hover:text-red-500">🗑</button>
              </div>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  )
}
