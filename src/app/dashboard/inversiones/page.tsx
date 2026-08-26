'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Inversion {
  id: string
  nombre: string
  app: string
  tipo: string
  moneda: string
  monto: number
  tasa_anual: number
  nivel_riesgo: 'conservador' | 'moderado' | 'alto'
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const RIESGO_CONFIG = {
  conservador: { label: 'Conservador', color: 'bg-green-500', light: 'bg-green-50', border: 'border-green-100', text: 'text-green-700', badge: 'bg-green-100 text-green-700', emoji: 'ð¢' },
  moderado: { label: 'Moderado', color: 'bg-yellow-400', light: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', emoji: 'ð¡' },
  alto: { label: 'Alto riesgo', color: 'bg-red-500', light: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', badge: 'bg-red-100 text-red-700', emoji: 'ð´' },
}

const APPS = ['MercadoPago', 'Naranja X', 'Uala', 'Brubank', 'IOL', 'Binance', 'BingX', 'Lemon', 'Otro']

export default function InversionesPage() {
  const [inversiones, setInversiones] = useState<Inversion[]>([])
  const [loading, setLoading] = useState(true)
  const [dolar, setDolar] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nombre: '', app: 'MercadoPago', tipo: 'fondo', moneda: 'ARS',
    monto: '', tasa_anual: '', nivel_riesgo: 'conservador' as const,
  })

  useEffect(() => { loadData(); fetchDolar() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('inversiones').select('*').eq('user_id', user.id).order('nivel_riesgo')
    setInversiones(data || [])
    setLoading(false)
  }

  async function fetchDolar() {
    try {
      const res = await fetch('/api/dolar')
      const json = await res.json()
      setDolar(json.blue)
    } catch {}
  }

  async function addInversion() {
    if (!form.nombre || !form.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('inversiones').insert({
      user_id: user.id,
      nombre: form.nombre,
      app: form.app,
      tipo: form.tipo,
      moneda: form.moneda,
      monto: Number(form.monto),
      tasa_anual: Number(form.tasa_anual || '0'),
      nivel_riesgo: form.nivel_riesgo,
    })
    setForm({ nombre: '', app: 'MercadoPago', tipo: 'fondo', moneda: 'ARS', monto: '', tasa_anual: '', nivel_riesgo: 'conservador' })
    setShowForm(false)
    loadData()
  }

  async function deleteInversion(id: string) {
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', id)
    loadData()
  }

  function toARS(inv: Inversion) {
    if (inv.moneda === 'USD' && dolar) return inv.monto * dolar
    return inv.monto
  }

  const totalARS = inversiones.reduce((s, inv) => s + toARS(inv), 0)

  const byRiesgo = {
    conservador: inversiones.filter(i => i.nivel_riesgo === 'conservador'),
    moderado: inversiones.filter(i => i.nivel_riesgo === 'moderado'),
    alto: inversiones.filter(i => i.nivel_riesgo === 'alto'),
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 animate-pulse text-lg">Cargando...</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Portfolio</h1>
          <p className="text-slate-500 text-sm">Inversiones y activos</p>
        </div>
        <div className="flex items-center gap-3">
          {dolar && (
            <div className="text-right bg-white border border-slate-200 rounded-xl px-3 py-2">
              <p className="text-xs text-slate-400">USD Blue</p>
              <p className="text-sm font-bold text-blue-600">${dolar.toFixed(0)}</p>
            </div>
          )}
          <div className="text-right bg-white border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-xs text-slate-400">Total ARS</p>
            <p className="text-sm font-bold text-slate-800">{fmt(totalARS)}</p>
          </div>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          + Agregar activo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Nuevo activo de inversiÃ³n</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input placeholder="Nombre (ej. PF Naranja X)" value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={form.app} onChange={e => setForm(p => ({ ...p, app: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {APPS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={form.nivel_riesgo} onChange={e => setForm(p => ({ ...p, nivel_riesgo: e.target.value as 'conservador' | 'moderado' | 'alto' }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="conservador">ð¢ Conservador</option>
              <option value="moderado">ð¡ Moderado</option>
              <option value="alto">ð´ Alto riesgo</option>
            </select>
            <input placeholder="Monto" type="number" value={form.monto}
              onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="ARS">ARS $</option>
              <option value="USD">USD u$s</option>
            </select>
            <input placeholder="Tasa anual % (opcional)" type="number" value={form.tasa_anual}
              onChange={e => setForm(p => ({ ...p, tasa_anual: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={addInversion} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">Guardar</button>
            <button onClick={() => setShowForm(false)} className="text-slate-500 px-4 py-2 rounded-lg text-sm hover:bg-slate-100">Cancelar</button>
          </div>
        </div>
      )}

      {/* By risk level */}
      {(['conservador', 'moderado', 'alto'] as const).map(nivel => {
        const items = byRiesgo[nivel]
        const cfg = RIESGO_CONFIG[nivel]
        const subtotal = items.reduce((s, i) => s + toARS(i), 0)
        const pct = totalARS > 0 ? Math.round((subtotal / totalARS) * 100) : 0
        const rendMensual = items.reduce((s, i) => s + (toARS(i) * (i.tasa_anual / 100) / 12), 0)

        if (items.length === 0 && !showForm) return null

        return (
          <div key={nivel} className={`rounded-2xl border ${cfg.border} ${cfg.light}`}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span>{cfg.emoji}</span>
                  <h2 className={`font-semibold ${cfg.text}`}>{cfg.label}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{pct}%</span>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${cfg.text}`}>{fmt(subtotal)}</p>
                  {rendMensual > 0 && (
                    <p className="text-xs text-slate-400">~{fmt(rendMensual)}/mes estimado</p>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${cfg.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {items.length > 0 && (
              <div className="border-t border-white/50 divide-y divide-white/30">
                {items.map(inv => {
                  const arsVal = toARS(inv)
                  const rendM = inv.tasa_anual > 0 ? arsVal * (inv.tasa_anual / 100) / 12 : 0
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inv.nombre}</p>
                        <p className="text-xs text-slate-400">{inv.app} Â· {inv.moneda}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-slate-700">{inv.moneda === 'USD' ? `u$s ${inv.monto.toLocaleString()}` : fmt(inv.monto)}</p>
                          {inv.moneda === 'USD' && dolar && <p className="text-xs text-slate-400">â {fmt(arsVal)}</p>}
                          {rendM > 0 && <p className="text-xs text-green-600">{inv.tasa_anual}% TNA</p>}
                        </div>
                        <button onClick={() => deleteInversion(inv.id)} className="text-slate-300 hover:text-red-400 text-xl leading-none">Ã</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {inversiones.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl p-10 border border-dashed border-slate-200 text-center">
          <p className="text-4xl mb-3">ð</p>
          <p className="text-slate-600 font-medium">No hay inversiones cargadas</p>
          <p className="text-slate-400 text-sm mt-1">HacÃ© click en "+ Agregar activo" para empezar</p>
        </div>
      )}
    </div>
  )
}
