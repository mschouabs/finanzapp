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

/* Cada nivel de riesgo se identifica por su color, tomado de variables de
   tema para que siga funcionando en oscuro y en rosa. */
const RIESGO_CONFIG = {
  conservador: { label: 'Conservador', tono: 'var(--riesgo-bajo)',  tint: 'var(--riesgo-bajo-tint)',  emoji: '🟢' },
  moderado:    { label: 'Moderado',    tono: 'var(--riesgo-medio)', tint: 'var(--riesgo-medio-tint)', emoji: '🟡' },
  alto:        { label: 'Alto riesgo', tono: 'var(--riesgo-alto)',  tint: 'var(--riesgo-alto-tint)',  emoji: '🔴' },
}

const APPS = ['MercadoPago', 'Naranja X', 'Uala', 'Brubank', 'IOL', 'Binance', 'BingX', 'Lemon', 'Otro']

export default function InversionesPage() {
  const [inversiones, setInversiones] = useState<Inversion[]>([])
  const [loading, setLoading] = useState(true)
  const [dolar, setDolar] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nombre: '', app: 'MercadoPago', tipo: 'fondo', moneda: 'ARS',
    monto: '', tasa_anual: '', nivel_riesgo: 'conservador' as 'conservador' | 'moderado' | 'alto',
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
      <div className="text-muted animate-pulse text-lg">Cargando...</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Portfolio</h1>
          <p className="text-secondary text-sm">Inversiones y activos</p>
        </div>
        <div className="flex items-center gap-3">
          {dolar && (
            <div className="text-right bg-card border border-line rounded-xl px-3 py-2">
              <p className="text-xs text-muted">USD Blue</p>
              <p className="text-sm font-bold text-info">${dolar.toFixed(0)}</p>
            </div>
          )}
          <div className="text-right bg-card border border-line rounded-xl px-3 py-2">
            <p className="text-xs text-muted">Total ARS</p>
            <p className="text-sm font-bold text-primary">{fmt(totalARS)}</p>
          </div>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="bg-confirm text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-confirm-hover transition-colors">
          + Agregar activo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-line p-5">
          <h3 className="text-sm font-semibold text-primary mb-4">Nuevo activo de inversión</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input placeholder="Nombre (ej. PF Naranja X)" value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              className="border border-line rounded-lg px-3 py-2 text-sm" />
            <select value={form.app} onChange={e => setForm(p => ({ ...p, app: e.target.value }))}
              className="border border-line rounded-lg px-3 py-2 text-sm">
              {APPS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={form.nivel_riesgo} onChange={e => setForm(p => ({ ...p, nivel_riesgo: e.target.value as 'conservador' | 'moderado' | 'alto' }))}
              className="border border-line rounded-lg px-3 py-2 text-sm">
              <option value="conservador">🟢 Conservador</option>
              <option value="moderado">🟡 Moderado</option>
              <option value="alto">🔴 Alto riesgo</option>
            </select>
            <input placeholder="Monto" type="number" value={form.monto}
              onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
              className="border border-line rounded-lg px-3 py-2 text-sm" />
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))}
              className="border border-line rounded-lg px-3 py-2 text-sm">
              <option value="ARS">ARS $</option>
              <option value="USD">USD u$s</option>
            </select>
            <input placeholder="Tasa anual % (opcional)" type="number" value={form.tasa_anual}
              onChange={e => setForm(p => ({ ...p, tasa_anual: e.target.value }))}
              className="border border-line rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={addInversion} className="bg-confirm text-white px-4 py-2 rounded-lg text-sm hover:bg-confirm-hover">Guardar</button>
            <button onClick={() => setShowForm(false)} className="text-secondary px-4 py-2 rounded-lg text-sm hover:bg-alternate">Cancelar</button>
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
          <div
            key={nivel}
            className="rounded-2xl border"
            style={{ background: cfg.tint, borderColor: cfg.tono }}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span>{cfg.emoji}</span>
                  <h2 className="font-semibold" style={{ color: cfg.tono }}>{cfg.label}</h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: cfg.tint, color: cfg.tono, border: `1px solid ${cfg.tono}` }}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="text-right">
                  <p className="fa-amount" style={{ color: cfg.tono }}>{fmt(subtotal)}</p>
                  {rendMensual > 0 && (
                    <p className="text-xs text-muted">~{fmt(rendMensual)}/mes estimado</p>
                  )}
                </div>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--border-color)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: cfg.tono }}
                />
              </div>
            </div>

            {items.length > 0 && (
              <div className="border-t border-line divide-y divide-line">
                {items.map(inv => {
                  const arsVal = toARS(inv)
                  const rendM = inv.tasa_anual > 0 ? arsVal * (inv.tasa_anual / 100) / 12 : 0
                  return (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-primary">{inv.nombre}</p>
                        <p className="text-xs text-muted">{inv.app} · {inv.moneda}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-primary">{inv.moneda === 'USD' ? `u$s ${inv.monto.toLocaleString()}` : fmt(inv.monto)}</p>
                          {inv.moneda === 'USD' && dolar && <p className="text-xs text-muted">≈ {fmt(arsVal)}</p>}
                          {rendM > 0 && <p className="text-xs text-positive">{inv.tasa_anual}% TNA</p>}
                        </div>
                        <button onClick={() => deleteInversion(inv.id)} className="text-muted hover:text-negative text-xl leading-none">×</button>
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
        <div className="bg-card rounded-2xl p-10 border border-dashed border-line text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-secondary font-medium">No hay inversiones cargadas</p>
          <p className="text-muted text-sm mt-1">Hacé click en "+ Agregar activo" para empezar</p>
        </div>
      )}
    </div>
  )
}
