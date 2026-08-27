'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface IngresoFijo {
  id: string
  nombre: string
  monto: number
  monto_cobrado: number | null
  activo: boolean
}

interface IngresoFreelance {
  id: string
  cliente: string
  descripcion: string
  monto_total: number
  monto_cobrado: number
  fecha: string
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default function TrabajosPage() {
  const [fijos, setFijos] = useState<IngresoFijo[]>([])
  const [freelance, setFreelance] = useState<IngresoFreelance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<'fijo' | 'freelance' | null>(null)
  const [formFijo, setFormFijo] = useState({ nombre: '', monto: '', monto_cobrado: '' })
  const [formFreelance, setFormFreelance] = useState({ cliente: '', descripcion: '', monto_total: '', monto_cobrado: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: fijosData }, { data: freelanceData }] = await Promise.all([
      supabase.from('ingresos_fijos').select('*').eq('user_id', user.id).eq('activo', true).order('nombre'),
      supabase.from('ingresos_freelance').select('*').eq('user_id', user.id).order('fecha', { ascending: false }),
    ])
    setFijos(fijosData || [])
    setFreelance(freelanceData || [])
    setLoading(false)
  }

  async function addFijo() {
    if (!formFijo.nombre || !formFijo.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('ingresos_fijos').insert({
      user_id: user.id, nombre: formFijo.nombre,
      monto: Number(formFijo.monto),
      monto_cobrado: formFijo.monto_cobrado ? Number(formFijo.monto_cobrado) : null,
      activo: true,
    })
    setFormFijo({ nombre: '', monto: '', monto_cobrado: '' })
    setShowForm(null)
    loadData()
  }

  async function addFreelance() {
    if (!formFreelance.cliente || !formFreelance.monto_total) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('ingresos_freelance').insert({
      user_id: user.id, cliente: formFreelance.cliente,
      descripcion: formFreelance.descripcion,
      monto_total: Number(formFreelance.monto_total),
      monto_cobrado: Number(formFreelance.monto_cobrado || '0'),
      fecha: new Date().toISOString().split('T')[0],
    })
    setFormFreelance({ cliente: '', descripcion: '', monto_total: '', monto_cobrado: '' })
    setShowForm(null)
    loadData()
  }

  async function deleteFijo(id: string) {
    const supabase = createClient()
    await supabase.from('ingresos_fijos').update({ activo: false }).eq('id', id)
    loadData()
  }

  async function deleteFreelance(id: string) {
    const supabase = createClient()
    await supabase.from('ingresos_freelance').delete().eq('id', id)
    loadData()
  }

  const totalFijos = fijos.reduce((s, f) => s + (f.monto_cobrado ?? f.monto), 0)
  const totalFreelance = freelance.reduce((s, f) => s + f.monto_cobrado, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-muted animate-pulse text-lg">Cargando...</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Trabajos</h1>
          <p className="text-secondary text-sm">Ingresos del mes</p>
        </div>
        <div className="bg-alternate border border-line rounded-xl px-4 py-2 text-right">
          <p className="text-xs text-positive font-medium">Total del mes</p>
          <p className="text-xl font-bold text-positive">{fmt(totalFijos + totalFreelance)}</p>
        </div>
      </div>

      {/* Sueldos fijos */}
      <div className="bg-card rounded-2xl border border-line shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div>
            <h2 className="font-semibold text-primary">💼 Sueldos fijos</h2>
            <p className="text-xs text-muted mt-0.5">Relación de dependencia / mensuales</p>
          </div>
          <button onClick={() => setShowForm(showForm === 'fijo' ? null : 'fijo')}
            className="text-sm bg-confirm text-white px-3 py-1.5 rounded-lg hover:bg-confirm-hover transition-colors">
            + Agregar
          </button>
        </div>

        {showForm === 'fijo' && (
          <div className="p-5 bg-alternate border-b border-line">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder="Nombre (ej. Trabajo principal)" value={formFijo.nombre}
                onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Sueldo normal ($)" type="number" value={formFijo.monto}
                onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Cobrado este mes (opcional)" type="number" value={formFijo.monto_cobrado}
                onChange={e => setFormFijo(p => ({ ...p, monto_cobrado: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addFijo} className="bg-confirm text-white px-4 py-2 rounded-lg text-sm hover:bg-confirm-hover">Guardar</button>
              <button onClick={() => setShowForm(null)} className="text-secondary px-4 py-2 rounded-lg text-sm hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-line">
          {fijos.length === 0 && <p className="p-6 text-sm text-muted text-center">Sin sueldos cargados</p>}
          {fijos.map(f => {
            const cobrado = f.monto_cobrado ?? f.monto
            const diff = cobrado - f.monto
            return (
              <div key={f.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-primary text-sm">{f.nombre}</p>
                  <p className="text-xs text-muted">Sueldo normal: {fmt(f.monto)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-primary">{fmt(cobrado)}</p>
                    {diff !== 0 && (
                      <p className={`text-xs ${diff > 0 ? 'text-positive' : 'text-negative'}`}>
                        {diff > 0 ? '+' : ''}{fmt(diff)} vs normal
                      </p>
                    )}
                  </div>
                  <button onClick={() => deleteFijo(f.id)} className="text-muted hover:text-negative text-xl leading-none ml-1">×</button>
                </div>
              </div>
            )
          })}
        </div>
        {fijos.length > 0 && (
          <div className="px-4 py-3 border-t border-line flex justify-between bg-alternate rounded-b-2xl">
            <span className="text-sm text-secondary">Subtotal fijos</span>
            <span className="font-bold text-primary">{fmt(totalFijos)}</span>
          </div>
        )}
      </div>

      {/* Freelance */}
      <div className="bg-card rounded-2xl border border-line shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div>
            <h2 className="font-semibold text-primary">🚀 Freelance / Proyectos</h2>
            <p className="text-xs text-muted mt-0.5">Trabajos puntuales y esporádicos</p>
          </div>
          <button onClick={() => setShowForm(showForm === 'freelance' ? null : 'freelance')}
            className="text-sm bg-confirm text-white px-3 py-1.5 rounded-lg hover:bg-confirm-hover transition-colors">
            + Agregar
          </button>
        </div>

        {showForm === 'freelance' && (
          <div className="p-5 bg-alternate border-b border-line">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder="Cliente" value={formFreelance.cliente}
                onChange={e => setFormFreelance(p => ({ ...p, cliente: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Descripción del proyecto" value={formFreelance.descripcion}
                onChange={e => setFormFreelance(p => ({ ...p, descripcion: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Monto total del proyecto ($)" type="number" value={formFreelance.monto_total}
                onChange={e => setFormFreelance(p => ({ ...p, monto_total: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Ya cobré ($)" type="number" value={formFreelance.monto_cobrado}
                onChange={e => setFormFreelance(p => ({ ...p, monto_cobrado: e.target.value }))}
                className="border border-line rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addFreelance} className="bg-confirm text-white px-4 py-2 rounded-lg text-sm hover:bg-confirm-hover">Guardar</button>
              <button onClick={() => setShowForm(null)} className="text-secondary px-4 py-2 rounded-lg text-sm hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-line">
          {freelance.length === 0 && <p className="p-6 text-sm text-muted text-center">Sin proyectos cargados</p>}
          {freelance.map(f => {
            const pct = f.monto_total > 0 ? Math.round((f.monto_cobrado / f.monto_total) * 100) : 0
            const pendiente = f.monto_total - f.monto_cobrado
            return (
              <div key={f.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-primary text-sm">{f.descripcion || f.cliente}</p>
                    <p className="text-xs text-muted">{f.cliente}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-positive">{fmt(f.monto_cobrado)}</p>
                      <p className="text-xs text-muted">de {fmt(f.monto_total)}</p>
                    </div>
                    <button onClick={() => deleteFreelance(f.id)} className="text-muted hover:text-negative text-xl leading-none">×</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-alternate rounded-full overflow-hidden">
                    <div className="h-full bg-confirm rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-secondary w-8 text-right">{pct}%</span>
                  {pendiente > 0 && <span className="text-xs text-orange-500 ml-1">Pendiente: {fmt(pendiente)}</span>}
                </div>
              </div>
            )
          })}
        </div>
        {freelance.length > 0 && (
          <div className="px-4 py-3 border-t border-line flex justify-between bg-alternate rounded-b-2xl">
            <span className="text-sm text-secondary">Subtotal freelance cobrado</span>
            <span className="font-bold text-primary">{fmt(totalFreelance)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
