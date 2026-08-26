'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Meta { id: string; nombre: string; descripcion: string; monto_objetivo: number; monto_actual: number; moneda: string; fecha_objetivo: string | null; emoji: string; completada: boolean }

export default function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showAporte, setShowAporte] = useState<string | null>(null)
  const [montoAporte, setMontoAporte] = useState('')
  const [form, setForm] = useState({ nombre: '', descripcion: '', monto_objetivo: '', moneda: 'ARS', fecha_objetivo: '', emoji: '🎯' })
  const EMOJIS = ['🎯', '🏠', '🚗', '✈️', '💻', '📱', '🎓', '💍', '🏖️', '🎸']

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('metas_ahorro').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setMetas(data ?? []); setLoading(false)
  }

  async function handleAddMeta(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('metas_ahorro').insert({ user_id: user.id, nombre: form.nombre, descripcion: form.descripcion, monto_objetivo: parseFloat(form.monto_objetivo), moneda: form.moneda, fecha_objetivo: form.fecha_objetivo || null, emoji: form.emoji })
    setForm({ nombre: '', descripcion: '', monto_objetivo: '', moneda: 'ARS', fecha_objetivo: '', emoji: '🎯' }); setShowForm(false); loadData()
  }

  async function handleAporte(metaId: string) {
    if (!montoAporte) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('aportes_ahorro').insert({ user_id: user.id, meta_id: metaId, monto: parseFloat(montoAporte), fecha: new Date().toISOString().split('T')[0] })
    setMontoAporte(''); setShowAporte(null); loadData()
  }

  async function eliminarMeta(id: string) { const supabase = createClient(); await supabase.from('metas_ahorro').delete().eq('id', id); loadData() }

  const fmt = (n: number, m: string) => `${m === 'USD' ? 'USD ' : '$'}${n.toLocaleString('es-AR')}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">Metas de Ahorro</h1><p className="text-slate-500">Tus objetivos financieros</p></div>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Nueva meta</button>
      </div>
      {showForm && (
        <form onSubmit={handleAddMeta} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Nueva meta de ahorro</h3>
          <div><p className="text-xs text-slate-500 mb-1">Elegí un emoji</p><div className="flex gap-2 flex-wrap">{EMOJIS.map(e => <button key={e} type="button" onClick={() => setForm({...form, emoji: e})} className={`text-2xl p-1 rounded-lg transition-all ${form.emoji===e?'bg-blue-100 scale-110':'hover:bg-slate-100'}`}>{e}</button>)}</div></div>
          <input type="text" placeholder="Nombre de la meta" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" placeholder="Descripción (opcional)" value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <input type="number" placeholder="Monto objetivo" value={form.monto_objetivo} onChange={e => setForm({...form, monto_objetivo: e.target.value})} required min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
            <select value={form.moneda} onChange={e => setForm({...form, moneda: e.target.value})} className="border border-slate-200 rounded-xl px-3 py-2 text-sm"><option value="ARS">ARS</option><option value="USD">USD</option></select>
          </div>
          <input type="date" value={form.fecha_objetivo} onChange={e => setForm({...form, fecha_objetivo: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm" />
          <div className="flex gap-2"><button type="submit" className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700">Crear meta</button><button type="button" onClick={() => setShowForm(false)} className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button></div>
        </form>
      )}
      {loading ? <p className="text-slate-400 text-center py-8">Cargando...</p> : metas.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><p className="text-5xl mb-3">🎯</p><p className="font-medium">No tenés metas creadas</p><p className="text-sm mt-1">Creá tu primera meta de ahorro</p></div>
      ) : (
        <div className="space-y-4">{metas.map(meta => {
          const pct = Math.min((meta.monto_actual / meta.monto_objetivo) * 100, 100)
          const falta = Math.max(meta.monto_objetivo - meta.monto_actual, 0)
          return (
            <div key={meta.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3"><span className="text-3xl">{meta.emoji}</span><div><h3 className="font-bold text-slate-800">{meta.nombre}</h3>{meta.descripcion&&<p className="text-sm text-slate-400">{meta.descripcion}</p>}{meta.fecha_objetivo&&<p className="text-xs text-slate-400">📅 Objetivo: {meta.fecha_objetivo}</p>}</div></div>
                <button onClick={() => eliminarMeta(meta.id)} className="text-slate-300 hover:text-red-500 text-sm">🗑</button>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 font-medium">{fmt(meta.monto_actual,meta.moneda)}</span><span className="text-slate-400">{fmt(meta.monto_objetivo,meta.moneda)}</span></div>
                <div className="w-full bg-slate-100 rounded-full h-2.5"><div className={`h-2.5 rounded-full transition-all ${pct>=100?'bg-green-500':'bg-blue-600'}`} style={{width:`${pct}%`}} /></div>
                <div className="flex justify-between mt-1"><span className={`text-xs font-medium ${pct>=100?'text-green-600':'text-blue-600'}`}>{pct.toFixed(0)}% completado</span>{falta>0&&<span className="text-xs text-slate-400">Falta {fmt(falta,meta.moneda)}</span>}</div>
              </div>
              {showAporte===meta.id ? (
                <div className="flex gap-2 mt-2">
                  <input type="number" placeholder="¿Cuánto aportás?" value={montoAporte} onChange={e => setMontoAporte(e.target.value)} min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => handleAporte(meta.id)} className="bg-green-500 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-green-600">✓ Aportar</button>
                  <button onClick={() => setShowAporte(null)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600">✕</button>
                </div>
              ) : (
                <button onClick={() => setShowAporte(meta.id)} className="w-full border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl py-2 text-sm font-medium transition-colors">+ Registrar aporte</button>
              )}
            </div>
          )
        })}</div>
      )}
    </div>
  )
}
