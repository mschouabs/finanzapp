'use client'

import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Pencil, Plus, Rocket, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { Kpi, Titulo, fmtK, tooltipStyle } from '@/components/ui/Piezas'

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

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const formVacioFreelance = () => ({ cliente: '', descripcion: '', monto_total: '', monto_cobrado: '', fecha: new Date().toISOString().split('T')[0] })

export default function TrabajosPage() {
  const [fijos, setFijos] = useState<IngresoFijo[]>([])
  const [freelance, setFreelance] = useState<IngresoFreelance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<'fijo' | 'freelance' | null>(null)
  const [formFijo, setFormFijo] = useState({ nombre: '', monto: '', monto_cobrado: '' })
  const [formFreelance, setFormFreelance] = useState(formVacioFreelance())
  const [editandoFijoId, setEditandoFijoId] = useState<string | null>(null)
  const [editandoFreelanceId, setEditandoFreelanceId] = useState<string | null>(null)
  const [filtroFreelance, setFiltroFreelance] = useState<'todos' | 'pendientes' | 'cobrados'>('todos')

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

    const monto = Number(formFijo.monto)
    const monto_cobrado = formFijo.monto_cobrado ? Number(formFijo.monto_cobrado) : null

    /* Si estamos editando una fila puntual, o si ya existe un sueldo activo
       con el mismo nombre, actualizamos en vez de crear un duplicado. Esto es
       lo que pasaba antes: cada "cobré tal cosa" agregaba una fila nueva en
       vez de actualizar el sueldo del mes. */
    const existente = editandoFijoId
      ? fijos.find(f => f.id === editandoFijoId)
      : fijos.find(f => f.nombre.trim().toLowerCase() === formFijo.nombre.trim().toLowerCase())

    if (existente) {
      await supabase.from('ingresos_fijos').update({ nombre: formFijo.nombre, monto, monto_cobrado }).eq('id', existente.id)
    } else {
      await supabase.from('ingresos_fijos').insert({
        user_id: user.id, nombre: formFijo.nombre, monto, monto_cobrado, activo: true,
      })
    }
    setFormFijo({ nombre: '', monto: '', monto_cobrado: '' })
    setEditandoFijoId(null)
    setShowForm(null)
    loadData()
  }

  function editarFijo(f: IngresoFijo) {
    setFormFijo({ nombre: f.nombre, monto: String(f.monto), monto_cobrado: f.monto_cobrado != null ? String(f.monto_cobrado) : '' })
    setEditandoFijoId(f.id)
    setShowForm('fijo')
  }

  async function addFreelance() {
    if (!formFreelance.cliente || !formFreelance.monto_total) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const datos = {
      cliente: formFreelance.cliente,
      descripcion: formFreelance.descripcion,
      monto_total: Number(formFreelance.monto_total),
      monto_cobrado: Number(formFreelance.monto_cobrado || '0'),
      fecha: formFreelance.fecha,
    }
    if (editandoFreelanceId) {
      await supabase.from('ingresos_freelance').update(datos).eq('id', editandoFreelanceId)
    } else {
      await supabase.from('ingresos_freelance').insert({ user_id: user.id, ...datos })
    }
    setFormFreelance(formVacioFreelance())
    setEditandoFreelanceId(null)
    setShowForm(null)
    loadData()
  }

  function editarFreelance(f: IngresoFreelance) {
    setFormFreelance({
      cliente: f.cliente, descripcion: f.descripcion ?? '',
      monto_total: String(f.monto_total), monto_cobrado: String(f.monto_cobrado),
      fecha: f.fecha,
    })
    setEditandoFreelanceId(f.id)
    setShowForm('freelance')
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
  const totalFreelanceCobrado = freelance.reduce((s, f) => s + f.monto_cobrado, 0)
  const totalFreelancePendiente = freelance.reduce((s, f) => s + Math.max(f.monto_total - f.monto_cobrado, 0), 0)

  /* el encabezado dice "del mes": los fijos son recurrentes, el freelance
     sólo cuenta si se cobró en el mes en curso */
  const mesActual = new Date().toISOString().slice(0, 7)
  const freelanceDelMes = freelance
    .filter(f => (f.fecha || '').startsWith(mesActual))
    .reduce((s, f) => s + f.monto_cobrado, 0)

  /* comparativo mes a mes: el fijo se asume constante (es lo que cobrás
     todos los meses mientras esté activo), el freelance es el real de
     cada mes según la fecha del proyecto. */
  const comparativo = useMemo(() => {
    const meses: { key: string; mes: string; Fijo: number; Freelance: number }[] = []
    const hoy = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      meses.push({ key, mes: `${MESES_CORTO[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`, Fijo: totalFijos, Freelance: 0 })
    }
    for (const f of freelance) {
      const key = (f.fecha || '').slice(0, 7)
      const m = meses.find(x => x.key === key)
      if (m) m.Freelance += f.monto_cobrado
    }
    return meses
  }, [freelance, totalFijos])

  const freelanceVisible = freelance.filter(f => {
    if (filtroFreelance === 'pendientes') return f.monto_cobrado < f.monto_total
    if (filtroFreelance === 'cobrados') return f.monto_cobrado >= f.monto_total && f.monto_total > 0
    return true
  })

  const inputCls = 'rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-muted animate-pulse text-lg">Cargando...</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Trabajos</h1>
          <p className="mt-1 text-sm text-secondary">Sueldos fijos y proyectos freelance.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total del mes" valor={fmtK(totalFijos + freelanceDelMes)} icono={<Wallet size={17} />} tono="var(--accent-positive)" sub="fijo + freelance cobrado" />
        <Kpi label="Sueldos fijos" valor={fmtK(totalFijos)} icono={<Briefcase size={17} />} tono="var(--accent-secondary)" sub={`${fijos.length} activo${fijos.length === 1 ? '' : 's'}`} />
        <Kpi label="Freelance cobrado" valor={fmtK(totalFreelanceCobrado)} icono={<Rocket size={17} />} tono="var(--accent-violet)" sub="histórico" />
        <Kpi label="Freelance pendiente" valor={fmtK(totalFreelancePendiente)} icono={<TrendingUp size={17} />} tono="var(--accent-warning)" sub="por cobrar" />
      </div>

      {/* Comparativo mensual */}
      <section className="fa-card p-5">
        <Titulo titulo="Fijo vs. freelance" sub="Últimos 6 meses" />
        <div className="mt-4 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparativo} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtK(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Fijo" stackId="a" fill="var(--accent-secondary)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Freelance" stackId="a" fill="var(--accent-violet, #A855F7)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Sueldos fijos */}
      <section className="flex flex-col gap-4 border-t border-line pt-5">
        <Titulo
          titulo="💼 Sueldos fijos"
          sub="Relación de dependencia / mensuales"
          derecha={
            <button onClick={() => { setEditandoFijoId(null); setFormFijo({ nombre: '', monto: '', monto_cobrado: '' }); setShowForm(showForm === 'fijo' ? null : 'fijo') }}
              className="flex items-center gap-1.5 rounded-xl bg-confirm px-3.5 py-2 text-xs font-semibold text-white hover:bg-confirm-hover">
              <Plus size={14} strokeWidth={2.5} /> Agregar
            </button>
          }
        />

        {showForm === 'fijo' && (
          <div className="fa-card p-4">
            {editandoFijoId && (
              <p className="mb-2 text-xs text-muted">Editando «{formFijo.nombre}» — se actualiza esta fila, no se crea una nueva.</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input placeholder="Nombre (ej. Trabajo principal)" value={formFijo.nombre}
                onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />
              <input placeholder="Sueldo normal ($)" type="number" value={formFijo.monto}
                onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))} className={inputCls} />
              <input placeholder="Cobrado este mes (opcional)" type="number" value={formFijo.monto_cobrado}
                onChange={e => setFormFijo(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={addFijo} className="rounded-lg bg-confirm px-4 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
                {editandoFijoId ? 'Actualizar' : 'Guardar'}
              </button>
              <button onClick={() => { setShowForm(null); setEditandoFijoId(null) }} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        )}

        {fijos.length === 0 ? (
          <div className="fa-card p-8 text-center">
            <p className="text-3xl">💼</p>
            <p className="mt-2 text-sm text-secondary">Sin sueldos cargados</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {fijos.map(f => {
              const cobrado = f.monto_cobrado ?? f.monto
              const diff = cobrado - f.monto
              return (
                <div key={f.id} className="fa-card fa-lift group relative flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-primary">{f.nombre}</p>
                      <p className="text-xs text-muted">Normal: {fmt(f.monto)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => editarFijo(f)} aria-label="Editar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => deleteFijo(f.id)} aria-label="Borrar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-negative"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="fa-amount text-xl text-primary">{fmt(cobrado)}</p>
                    {diff !== 0 && (
                      <span className={`text-xs font-semibold ${diff > 0 ? 'text-positive' : 'text-negative'}`}>
                        {diff > 0 ? '+' : ''}{fmt(diff)} vs normal
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Freelance */}
      <section className="flex flex-col gap-4 border-t border-line pt-5">
        <Titulo
          titulo="🚀 Freelance / Proyectos"
          sub="Trabajos puntuales y esporádicos"
          derecha={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
                {([['todos', 'Todos'], ['pendientes', 'Pendientes'], ['cobrados', 'Cobrados']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFiltroFreelance(k)}
                    className={`px-2.5 py-1.5 ${filtroFreelance === k ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => { setEditandoFreelanceId(null); setFormFreelance(formVacioFreelance()); setShowForm(showForm === 'freelance' ? null : 'freelance') }}
                className="flex items-center gap-1.5 rounded-xl bg-confirm px-3.5 py-2 text-xs font-semibold text-white hover:bg-confirm-hover">
                <Plus size={14} strokeWidth={2.5} /> Agregar
              </button>
            </div>
          }
        />

        {showForm === 'freelance' && (
          <div className="fa-card p-4">
            {editandoFreelanceId && (
              <p className="mb-2 text-xs text-muted">Editando el proyecto — se actualiza esta fila, no se crea una nueva.</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input placeholder="Cliente" value={formFreelance.cliente}
                onChange={e => setFormFreelance(p => ({ ...p, cliente: e.target.value }))} className={inputCls} />
              <input placeholder="Descripción del proyecto" value={formFreelance.descripcion}
                onChange={e => setFormFreelance(p => ({ ...p, descripcion: e.target.value }))} className={inputCls} />
              <input placeholder="Monto total ($)" type="number" value={formFreelance.monto_total}
                onChange={e => setFormFreelance(p => ({ ...p, monto_total: e.target.value }))} className={inputCls} />
              <input placeholder="Ya cobré ($)" type="number" value={formFreelance.monto_cobrado}
                onChange={e => setFormFreelance(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />
              <input type="date" value={formFreelance.fecha}
                onChange={e => setFormFreelance(p => ({ ...p, fecha: e.target.value }))} className={inputCls} />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={addFreelance} className="rounded-lg bg-confirm px-4 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
                {editandoFreelanceId ? 'Actualizar' : 'Guardar'}
              </button>
              <button onClick={() => { setShowForm(null); setEditandoFreelanceId(null) }} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        )}

        {freelanceVisible.length === 0 ? (
          <div className="fa-card p-8 text-center">
            <p className="text-3xl">🚀</p>
            <p className="mt-2 text-sm text-secondary">Sin proyectos {filtroFreelance !== 'todos' ? `en "${filtroFreelance}"` : 'cargados'}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {freelanceVisible.map(f => {
              const pct = f.monto_total > 0 ? Math.min(100, Math.round((f.monto_cobrado / f.monto_total) * 100)) : 0
              const pendiente = f.monto_total - f.monto_cobrado
              const completo = pendiente <= 0 && f.monto_total > 0
              return (
                <div key={f.id} className="fa-card fa-lift group relative flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-primary">{f.descripcion || f.cliente}</p>
                      <p className="truncate text-xs text-muted">{f.cliente} · {new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => editarFreelance(f)} aria-label="Editar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => deleteFreelance(f.id)} aria-label="Borrar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-negative"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="fa-amount text-xl text-positive">{fmt(f.monto_cobrado)}</p>
                    <span className="text-xs text-muted">de {fmt(f.monto_total)}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: completo ? 'var(--accent-positive)' : 'var(--accent-warning)' }} />
                    </div>
                    <span className="text-[11px] font-semibold text-muted">{pct}%</span>
                  </div>
                  {completo ? (
                    <span className="mt-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold text-positive" style={{ background: 'var(--riesgo-bajo-tint)' }}>Cobrado completo</span>
                  ) : pendiente > 0 && (
                    <span className="mt-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'color-mix(in srgb, var(--accent-warning) 18%, transparent)', color: 'var(--accent-warning)' }}>
                      Pendiente: {fmt(pendiente)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
