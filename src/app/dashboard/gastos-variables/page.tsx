'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase'
import { borrarGastoVariable, guardarGastoVariable, listarMediosDePago } from '@/lib/movimientos'

interface GastoVariable {
  id: string
  nombre: string
  monto: number
  categoria: string
  fecha: string
  es_gasto_hormiga: boolean
  tarjeta_id: string | null
  forma_pago: 'debito' | 'credito' | null
  billetera_linea_id: string | null
}

interface GastoFijo {
  id: string
  nombre: string
  monto: number
  categoria: string
  activo: boolean
  debitado: boolean
}

const CATEGORIAS = [
  { key: 'mercado', label: 'Mercado', emoji: '🛒', color: '#32D158' },
  { key: 'comida', label: 'Comida', emoji: '🍕', color: '#F5C451' },
  { key: 'transporte', label: 'Transporte', emoji: '🚗', color: '#63A9FF' },
  { key: 'farmacia', label: 'Farmacia', emoji: '💊', color: '#22C55E' },
  { key: 'ocio', label: 'Ocio', emoji: '🎬', color: '#A855F7' },
  { key: 'ropa', label: 'Ropa', emoji: '👕', color: '#FF8A3D' },
  { key: 'personal', label: 'Personal', emoji: '✂️', color: '#DF7897' },
  { key: 'impuesto', label: 'Impuesto', emoji: '📋', color: '#94A3B8' },
  { key: 'tecnologia', label: 'Tecnología', emoji: '💻', color: '#79C0FF' },
  { key: 'regalo', label: 'Regalo', emoji: '🎁', color: '#FF5873' },
  { key: 'servicios', label: 'Servicios', emoji: '💡', color: '#14B8A6' },
  { key: 'varios', label: 'Varios', emoji: '📦', color: '#6E7681' },
]

const getCat = (key: string) =>
  CATEGORIAS.find(c => c.key === key) ?? { key, label: key, emoji: '📦', color: '#6E7681' }

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
const fmtFull = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const hoyISO = () => new Date().toISOString().split('T')[0]
const formVacio = () => ({ nombre: '', monto: '', categoria: 'varios', fecha: hoyISO(), es_gasto_hormiga: false, medio: '', forma: 'debito' as 'debito' | 'credito' })

const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 10, fontSize: 12, color: 'var(--text-primary)',
}

export default function GastosPage() {
  const [gastosVar, setGastosVar] = useState<GastoVariable[]>([])
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([])
  const [tarjetas, setTarjetas] = useState<Record<string, string>>({})
  const [medios, setMedios] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [filtroCat, setFiltroCat] = useState<string | null>(null)

  // Carga en lenguaje natural
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Carga manual
  const [showManual, setShowManual] = useState(false)
  const [formManual, setFormManual] = useState(formVacio())

  // Gasto fijo
  const [showFijoForm, setShowFijoForm] = useState(false)
  const [formFijo, setFormFijo] = useState({ nombre: '', monto: '', categoria: 'servicios' })

  const inputRef = useRef<HTMLInputElement>(null)
  const manualRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [mes])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const primerDia = `${mes.year}-${String(mes.month).padStart(2, '0')}-01`
    const ultimoDia = `${mes.year}-${String(mes.month).padStart(2, '0')}-${String(new Date(mes.year, mes.month, 0).getDate()).padStart(2, '0')}`

    const [{ data: varData }, { data: fijoData }, { data: ts }, ms] = await Promise.all([
      supabase.from('gastos_variables').select('*').eq('user_id', user.id).gte('fecha', primerDia).lte('fecha', ultimoDia).order('fecha', { ascending: false }),
      supabase.from('gastos_fijos').select('*').eq('user_id', user.id).eq('activo', true).order('nombre'),
      supabase.from('tarjetas_cuentas').select('id, nombre'),
      listarMediosDePago(supabase).catch(() => [] as string[]),
    ])

    setGastosVar((varData || []) as GastoVariable[])
    setGastosFijos((fijoData || []) as GastoFijo[])
    setTarjetas(Object.fromEntries((ts || []).map((t: { id: string; nombre: string }) => [t.id, t.nombre])))
    setMedios(ms)
    setLoading(false)
  }

  async function parseWithAI() {
    if (!aiText.trim()) return
    setAiLoading(true)
    setAiMsg(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      })
      const json = await res.json()

      if (json.monto && json.monto > 0) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { error } = await guardarGastoVariable(supabase, user.id, {
            nombre: json.nombre,
            monto: json.monto,
            categoria: json.categoria || 'varios',
            fecha: json.fecha || hoyISO(),
            medio_pago: json.medio_pago,
            forma_pago: json.forma_pago,
          })
          if (error) throw new Error(error)
          const con = json.medio_pago ? ` con ${json.medio_pago}${json.forma_pago === 'credito' ? ' (crédito)' : ''}` : ''
          setAiMsg({ text: `${getCat(json.categoria || 'varios').emoji} "${json.nombre}" — ${fmtFull(json.monto)}${con} guardado`, ok: true })
          setAiText('')
          loadData()
        }
      } else {
        setFormManual(p => ({ ...p, nombre: json.nombre || '', categoria: json.categoria || 'varios', medio: json.medio_pago || '' }))
        abrirManual()
        setAiMsg({ text: 'No pude determinar el monto. Completalo abajo.', ok: false })
      }
    } catch {
      setFormManual(p => ({ ...p, nombre: aiText }))
      abrirManual()
      setAiMsg({ text: 'Error al procesar. Cargalo a mano abajo.', ok: false })
    }
    setAiLoading(false)
  }

  function abrirManual() {
    setShowManual(true)
    setTimeout(() => manualRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  async function saveManual() {
    if (!formManual.nombre || !formManual.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await guardarGastoVariable(supabase, user.id, {
      nombre: formManual.nombre,
      monto: Number(formManual.monto),
      categoria: formManual.categoria,
      fecha: formManual.fecha,
      es_gasto_hormiga: formManual.es_gasto_hormiga,
      medio_pago: formManual.medio || null,
      forma_pago: formManual.medio ? formManual.forma : null,
    })
    if (error) { setAiMsg({ text: error, ok: false }); return }
    setShowManual(false)
    setFormManual(formVacio())
    setAiMsg(null)
    loadData()
  }

  async function saveFijo() {
    if (!formFijo.nombre || !formFijo.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('gastos_fijos').insert({
      user_id: user.id,
      nombre: formFijo.nombre,
      monto: Number(formFijo.monto),
      categoria: formFijo.categoria,
      activo: true,
      debitado: false,
    })
    setShowFijoForm(false)
    setFormFijo({ nombre: '', monto: '', categoria: 'servicios' })
    loadData()
  }

  async function deleteVar(g: GastoVariable) {
    const supabase = createClient()
    await borrarGastoVariable(supabase, g)
    loadData()
  }

  async function deleteFijo(id: string) {
    const supabase = createClient()
    await supabase.from('gastos_fijos').update({ activo: false }).eq('id', id)
    loadData()
  }

  async function toggleDebitado(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('gastos_fijos').update({ debitado: !current }).eq('id', id)
    loadData()
  }

  /* ── datos para los gráficos ─────────────────────────────── */
  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of gastosVar) m[g.categoria] = (m[g.categoria] || 0) + Number(g.monto)
    return Object.entries(m)
      .map(([key, value]) => ({ key, name: getCat(key).label, value, color: getCat(key).color, emoji: getCat(key).emoji }))
      .sort((a, b) => b.value - a.value)
  }, [gastosVar])

  const porDia = useMemo(() => {
    const dias = new Date(mes.year, mes.month, 0).getDate()
    const arr = Array.from({ length: dias }, (_, i) => ({ dia: String(i + 1), monto: 0 }))
    for (const g of gastosVar) {
      if (filtroCat && g.categoria !== filtroCat) continue
      const d = Number(g.fecha.split('-')[2])
      if (arr[d - 1]) arr[d - 1].monto += Number(g.monto)
    }
    return arr
  }, [gastosVar, mes, filtroCat])

  const porMedio = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of gastosVar) {
      if (filtroCat && g.categoria !== filtroCat) continue
      const nombre = g.tarjeta_id && tarjetas[g.tarjeta_id]
        ? `${tarjetas[g.tarjeta_id]}${g.forma_pago === 'credito' ? ' (crédito)' : ''}`
        : 'Efectivo / sin especificar'
      m[nombre] = (m[nombre] || 0) + Number(g.monto)
    }
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [gastosVar, tarjetas, filtroCat])

  const visibles = filtroCat ? gastosVar.filter(g => g.categoria === filtroCat) : gastosVar
  const grouped = visibles.reduce<Record<string, GastoVariable[]>>((acc, g) => {
    if (!acc[g.fecha]) acc[g.fecha] = []
    acc[g.fecha].push(g)
    return acc
  }, {})

  const gastosHormiga = gastosVar.filter(g => g.es_gasto_hormiga)
  const totalVar = gastosVar.reduce((s, g) => s + Number(g.monto), 0)
  const totalVisibles = visibles.reduce((s, g) => s + Number(g.monto), 0)
  const totalFijos = gastosFijos.reduce((s, g) => s + Number(g.monto), 0)

  const prevMes = () => setMes(prev => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { ...prev, month: prev.month - 1 })
  const nextMes = () => setMes(prev => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { ...prev, month: prev.month + 1 })

  const inputCls = 'rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Movimientos</h1>
          <p className="text-secondary text-sm">Gastos fijos y variables del mes</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-line rounded-xl px-3 py-1.5">
          <button onClick={prevMes} aria-label="Mes anterior" className="text-muted hover:text-secondary px-2 text-lg">‹</button>
          <span className="text-sm font-medium text-primary min-w-[120px] text-center">{meses[mes.month - 1]} {mes.year}</span>
          <button onClick={nextMes} aria-label="Mes siguiente" className="text-muted hover:text-secondary px-2 text-lg">›</button>
        </div>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Variables" valor={fmtFull(totalVar)} />
        <Kpi label="Fijos" valor={fmtFull(totalFijos)} />
        <Kpi label="Total del mes" valor={fmtFull(totalVar + totalFijos)} fuerte />
      </div>

      {/* Carga por lenguaje natural */}
      <div className="fa-card p-5">
        <p className="text-xs font-semibold text-primary mb-3">
          ✨ Contame un gasto como se lo dirías a alguien
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && parseWithAI()}
            placeholder='Ej: "gasté 3500 en delivery con mercado pago"'
            className="flex-1 rounded-xl border bg-field px-4 py-2.5 text-sm text-primary"
          />
          <button onClick={parseWithAI} disabled={aiLoading}
            className="whitespace-nowrap rounded-xl bg-confirm px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50">
            {aiLoading ? 'Pensando…' : 'Guardar'}
          </button>
        </div>
        {aiMsg && (
          <p className={`mt-2 text-xs ${aiMsg.ok ? 'text-positive' : 'text-negative'}`}>{aiMsg.text}</p>
        )}
      </div>

      {/* Gráficos */}
      {porCategoria.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <section className="fa-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-primary">¿En qué se te va la plata?</h2>
                <p className="mt-0.5 text-xs text-secondary">Tocá una categoría para filtrar</p>
              </div>
              {filtroCat && (
                <button onClick={() => setFiltroCat(null)} className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-secondary hover:bg-alternate">
                  <X size={12} /> Quitar filtro
                </button>
              )}
            </div>

            <div className="relative mt-2 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porCategoria}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    onClick={(d: { key?: string; payload?: { key?: string } }) => {
                      const k = d?.payload?.key ?? d?.key
                      if (k) setFiltroCat(f => (f === k ? null : k))
                    }}
                  >
                    {porCategoria.map(c => (
                      <Cell key={c.key} fill={c.color} opacity={filtroCat && filtroCat !== c.key ? 0.25 : 1} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtFull(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted">{filtroCat ? getCat(filtroCat).label : 'Total'}</span>
                <span className="fa-amount text-base text-primary">{fmt(filtroCat ? totalVisibles : totalVar)}</span>
              </div>
            </div>

            <ul className="mt-3 space-y-1">
              {porCategoria.map(c => {
                const pct = totalVar > 0 ? Math.round((c.value / totalVar) * 100) : 0
                const activa = filtroCat === c.key
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => setFiltroCat(f => (f === c.key ? null : c.key))}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-alternate ${activa ? 'bg-alternate' : ''}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="min-w-0 flex-1 truncate text-secondary">{c.emoji} {c.name}</span>
                      <span className="fa-amount shrink-0 text-primary">{fmtFull(c.value)}</span>
                      <span className="w-9 shrink-0 text-right text-muted">{pct}%</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="flex flex-col gap-5">
            <section className="fa-card p-5">
              <h2 className="text-base font-bold text-primary">Gasto por día</h2>
              <p className="mt-0.5 text-xs text-secondary">
                {filtroCat ? `Solo ${getCat(filtroCat).label.toLowerCase()}` : 'Todos los gastos variables'} · {meses[mes.month - 1]}
              </p>
              <div className="mt-3 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porDia} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtFull(v), 'Gastado']} labelFormatter={(l: string) => `Día ${l}`} cursor={{ fill: 'var(--bg-alternate, rgba(127,127,127,.12))' }} />
                    <Bar dataKey="monto" radius={[4, 4, 0, 0]} fill={filtroCat ? getCat(filtroCat).color : 'var(--accent-negative)'} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="fa-card p-5">
              <h2 className="text-base font-bold text-primary">¿Con qué pagaste?</h2>
              <ul className="mt-3 space-y-2.5">
                {porMedio.map(m => {
                  const total = porMedio.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? (m.value / total) * 100 : 0
                  return (
                    <li key={m.name}>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate text-secondary">{m.name}</span>
                        <span className="fa-amount shrink-0 text-primary">{fmtFull(m.value)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent-secondary)' }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
        </div>
      )}

      {/* Gastos variables del mes */}
      <div className="bg-card rounded-2xl border border-line shadow-sm" ref={manualRef}>
        <div className="flex items-center justify-between gap-3 p-5 border-b border-line">
          <div>
            <h2 className="font-semibold text-primary">🛒 Gastos variables</h2>
            <p className="text-xs text-muted mt-0.5">
              {meses[mes.month - 1]} {mes.year} — {filtroCat ? `${getCat(filtroCat).label}: ${fmtFull(totalVisibles)} de ${fmtFull(totalVar)}` : `Total: ${fmtFull(totalVar)}`}
            </p>
          </div>
          <button
            onClick={() => (showManual ? setShowManual(false) : abrirManual())}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-confirm-hover"
          >
            <Plus size={16} strokeWidth={2.5} /> Agregar gasto
          </button>
        </div>

        {showManual && (
          <div className="p-5 bg-alternate border-b border-line">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input autoFocus placeholder="¿Qué compraste?" value={formManual.nombre}
                onChange={e => setFormManual(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />
              <input placeholder="Monto ($)" type="number" inputMode="decimal" value={formManual.monto}
                onChange={e => setFormManual(p => ({ ...p, monto: e.target.value }))} className={inputCls} />
              <select value={formManual.categoria} onChange={e => setFormManual(p => ({ ...p, categoria: e.target.value }))} className={inputCls}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
              <input type="date" value={formManual.fecha}
                onChange={e => setFormManual(p => ({ ...p, fecha: e.target.value }))} className={inputCls} />
              <select value={formManual.medio} onChange={e => setFormManual(p => ({ ...p, medio: e.target.value }))} className={inputCls}>
                <option value="">💵 Efectivo / sin especificar</option>
                {medios.map(m => <option key={m} value={m}>💳 {m}</option>)}
              </select>
              {formManual.medio && (
                <div className="flex overflow-hidden rounded-lg border text-sm">
                  {(['debito', 'credito'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setFormManual(p => ({ ...p, forma: f }))}
                      className={`flex-1 px-3 py-2.5 font-medium ${formManual.forma === f ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}>
                      {f === 'debito' ? 'Débito / saldo' : 'Crédito'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-secondary cursor-pointer">
              <input type="checkbox" checked={formManual.es_gasto_hormiga}
                onChange={e => setFormManual(p => ({ ...p, es_gasto_hormiga: e.target.checked }))} className="rounded" />
              🐜 Marcar como gasto hormiga
            </label>
            {formManual.medio && formManual.forma === 'debito' && (
              <p className="mt-2 text-xs text-secondary">Se descuenta del saldo disponible de {formManual.medio}.</p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={saveManual} className="bg-confirm text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-confirm-hover">Guardar gasto</button>
              <button onClick={() => setShowManual(false)} className="text-secondary px-4 py-2.5 rounded-lg text-sm hover:bg-card">Cancelar</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="p-6 text-sm text-muted text-center animate-pulse">Cargando...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="p-6 text-sm text-muted text-center">{filtroCat ? 'Sin gastos en esta categoría' : 'Sin gastos este mes'}</p>
        ) : (
          <div className="divide-y divide-line">
            {Object.entries(grouped).map(([fecha, gastos]) => {
              const total = gastos.reduce((s, g) => s + Number(g.monto), 0)
              const [, mm, dd] = fecha.split('-')
              return (
                <div key={fecha}>
                  <div className="flex items-center justify-between px-4 py-2 bg-alternate">
                    <span className="text-xs font-semibold text-secondary">{dd}/{mm}</span>
                    <span className="text-xs font-bold text-secondary">{fmtFull(total)}</span>
                  </div>
                  {gastos.map(g => {
                    const medio = g.tarjeta_id ? tarjetas[g.tarjeta_id] : null
                    return (
                      <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="text-base">{getCat(g.categoria).emoji}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-primary">{g.nombre}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {medio && (
                                <span className="rounded bg-alternate px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                                  💳 {medio}{g.forma_pago === 'credito' ? ' · crédito' : g.forma_pago === 'debito' ? ' · débito' : ''}
                                </span>
                              )}
                              {g.es_gasto_hormiga && <span className="text-xs text-orange-500">🐜 hormiga</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-medium text-primary">{fmtFull(Number(g.monto))}</span>
                          <button onClick={() => deleteVar(g)} aria-label={`Borrar ${g.nombre}`} className="text-muted hover:text-negative text-xl leading-none">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gastos fijos */}
      <div className="bg-card rounded-2xl border border-line shadow-sm">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-line">
          <div>
            <h2 className="font-semibold text-primary">📌 Gastos fijos</h2>
            <p className="text-xs text-muted mt-0.5">Suscripciones y recurrentes — {fmtFull(totalFijos)}/mes</p>
          </div>
          <button onClick={() => setShowFijoForm(!showFijoForm)}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-confirm-hover">
            <Plus size={16} strokeWidth={2.5} /> Agregar fijo
          </button>
        </div>

        {showFijoForm && (
          <div className="p-5 bg-alternate border-b border-line">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder="Nombre (ej. Gimnasio)" value={formFijo.nombre}
                onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />
              <input placeholder="Monto mensual ($)" type="number" value={formFijo.monto}
                onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))} className={inputCls} />
              <select value={formFijo.categoria} onChange={e => setFormFijo(p => ({ ...p, categoria: e.target.value }))} className={inputCls}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveFijo} className="bg-confirm text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-confirm-hover">Guardar</button>
              <button onClick={() => setShowFijoForm(false)} className="text-secondary px-4 py-2.5 rounded-lg text-sm hover:bg-card">Cancelar</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-line">
          {gastosFijos.length === 0 && <p className="p-6 text-sm text-muted text-center">Sin gastos fijos cargados</p>}
          {gastosFijos.map(g => (
            <div key={g.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-lg">{getCat(g.categoria).emoji}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-primary text-sm">{g.nombre}</p>
                  <p className="text-xs text-muted capitalize">{g.categoria}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-bold text-primary">{fmtFull(Number(g.monto))}</span>
                <button onClick={() => toggleDebitado(g.id, g.debitado)}
                  className={`text-xs px-2 py-1 rounded-full font-medium border ${g.debitado ? 'bg-alternate text-positive' : 'bg-alternate text-secondary'}`}
                  style={g.debitado ? { borderColor: 'var(--accent-positive)' } : undefined}>
                  {g.debitado ? '✓ Pagado' : 'Pendiente'}
                </button>
                <button onClick={() => deleteFijo(g.id)} aria-label={`Quitar ${g.nombre}`} className="text-muted hover:text-negative text-xl leading-none">×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gastos hormiga */}
      {gastosHormiga.length > 0 && (
        <div className="rounded-2xl border p-5" style={{ background: 'var(--riesgo-medio-tint)', borderColor: 'var(--riesgo-medio)' }}>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--riesgo-medio)' }}>🐜 Gastos hormiga del mes</h3>
          <p className="text-sm text-primary">
            {gastosHormiga.length} gastos chicos suman <strong>{fmtFull(gastosHormiga.reduce((s, g) => s + Number(g.monto), 0))}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="fa-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className={`fa-amount ${fuerte ? 'text-xl' : 'text-lg'} text-primary`}>{valor}</p>
    </div>
  )
}
