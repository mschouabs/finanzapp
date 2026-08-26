'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface GastoVariable {
  id: string
  nombre: string
  monto: number
  categoria: string
  fecha: string
  es_gasto_hormiga: boolean
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
  { key: 'mercado', label: 'Mercado', emoji: 'ð' },
  { key: 'comida', label: 'Comida', emoji: 'ð' },
  { key: 'transporte', label: 'Transporte', emoji: 'ð' },
  { key: 'farmacia', label: 'Farmacia', emoji: 'ð' },
  { key: 'ocio', label: 'Ocio', emoji: 'ð¬' },
  { key: 'ropa', label: 'Ropa', emoji: 'ð' },
  { key: 'personal', label: 'Personal', emoji: 'âï¸' },
  { key: 'impuesto', label: 'Impuesto', emoji: 'ð' },
  { key: 'tecnologia', label: 'TecnologÃ­a', emoji: 'ð»' },
  { key: 'regalo', label: 'Regalo', emoji: 'ð' },
  { key: 'varios', label: 'Varios', emoji: 'ð¦' },
]

function getCatEmoji(cat: string) {
  return CATEGORIAS.find(c => c.key === cat)?.emoji || 'ð¦'
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function GastosPage() {
  const [gastosVar, setGastosVar] = useState<GastoVariable[]>([])
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  // IA input
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Manual form
  const [showManual, setShowManual] = useState(false)
  const [formManual, setFormManual] = useState({ nombre: '', monto: '', categoria: 'varios', fecha: new Date().toISOString().split('T')[0], es_gasto_hormiga: false })

  // Gasto fijo form
  const [showFijoForm, setShowFijoForm] = useState(false)
  const [formFijo, setFormFijo] = useState({ nombre: '', monto: '', categoria: 'varios' })

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [mes])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const primerDia = `${mes.year}-${String(mes.month).padStart(2, '0')}-01`
    const ultimoDia = new Date(mes.year, mes.month, 0).toISOString().split('T')[0]

    const [{ data: varData }, { data: fijoData }] = await Promise.all([
      supabase.from('gastos_variables').select('*').eq('user_id', user.id).gte('fecha', primerDia).lte('fecha', ultimoDia).order('fecha', { ascending: false }),
      supabase.from('gastos_fijos').select('*').eq('user_id', user.id).eq('activo', true).order('nombre'),
    ])

    setGastosVar(varData || [])
    setGastosFijos(fijoData || [])
    setLoading(false)
  }

  async function parseWithAI() {
    if (!aiText.trim()) return
    setAiLoading(true)
    setAiMsg(null)
    try {
      const res = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      })
      const json = await res.json()

      if (json.monto && json.monto > 0) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('gastos_variables').insert({
            user_id: user.id,
            nombre: json.nombre,
            monto: json.monto,
            categoria: json.categoria || 'varios',
            fecha: json.fecha || new Date().toISOString().split('T')[0],
            es_gasto_hormiga: false,
          })
          setAiMsg({ text: `${getCatEmoji(json.categoria || 'varios')} "${json.nombre}" â ${fmt(json.monto)} guardado`, ok: true })
          setAiText('')
          loadData()
        }
      } else {
        // Open manual form pre-filled
        setFormManual(p => ({ ...p, nombre: json.nombre || '', categoria: json.categoria || 'varios' }))
        setShowManual(true)
        setAiMsg({ text: 'No pude determinar el monto. Completalo manualmente.', ok: false })
      }
    } catch {
      setFormManual(p => ({ ...p, nombre: aiText }))
      setShowManual(true)
      setAiMsg({ text: 'Error al procesar. CargÃ¡ manualmente.', ok: false })
    }
    setAiLoading(false)
  }

  async function saveManual() {
    if (!formManual.nombre || !formManual.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('gastos_variables').insert({
      user_id: user.id,
      nombre: formManual.nombre,
      monto: Number(formManual.monto),
      categoria: formManual.categoria,
      fecha: formManual.fecha,
      es_gasto_hormiga: formManual.es_gasto_hormiga,
    })
    setShowManual(false)
    setFormManual({ nombre: '', monto: '', categoria: 'varios', fecha: new Date().toISOString().split('T')[0], es_gasto_hormiga: false })
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
    setFormFijo({ nombre: '', monto: '', categoria: 'varios' })
    loadData()
  }

  async function deleteVar(id: string) {
    const supabase = createClient()
    await supabase.from('gastos_variables').delete().eq('id', id)
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

  // Group variables by date
  const grouped = gastosVar.reduce<Record<string, GastoVariable[]>>((acc, g) => {
    if (!acc[g.fecha]) acc[g.fecha] = []
    acc[g.fecha].push(g)
    return acc
  }, {})

  // Hormiga detection
  const gastosHormiga = gastosVar.filter(g => g.es_gasto_hormiga)
  const totalVar = gastosVar.reduce((s, g) => s + g.monto, 0)
  const totalFijos = gastosFijos.reduce((s, g) => s + g.monto, 0)

  const prevMes = () => {
    setMes(prev => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 }
      return { ...prev, month: prev.month - 1 }
    })
  }
  const nextMes = () => {
    setMes(prev => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 }
      return { ...prev, month: prev.month + 1 }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gastos & CC</h1>
          <p className="text-slate-500 text-sm">Gastos fijos, variables y tarjetas</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
          <button onClick={prevMes} className="text-slate-400 hover:text-slate-600 px-1">â¹</button>
          <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">{meses[mes.month - 1]} {mes.year}</span>
          <button onClick={nextMes} className="text-slate-400 hover:text-slate-600 px-1">âº</button>
        </div>
      </div>

      {/* AI Input */}
      <div className="bg-blue-600 rounded-2xl p-5">
        <p className="text-blue-100 text-xs font-medium mb-2">â¨ CargÃ¡ un gasto en lenguaje natural</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={aiText}
            onChange={e => setAiText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && parseWithAI()}
            placeholder='Ej: "gastÃ© 3500 en delivery" o "paguÃ© el monotributo"'
            className="flex-1 rounded-xl px-4 py-2.5 text-sm bg-white/10 text-white placeholder:text-blue-200 border border-white/20 focus:outline-none focus:border-white/50"
          />
          <button onClick={parseWithAI} disabled={aiLoading}
            className="bg-white text-blue-600 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap">
            {aiLoading ? '...' : 'Guardar'}
          </button>
        </div>
        {aiMsg && (
          <p className={`text-xs mt-2 ${aiMsg.ok ? 'text-blue-100' : 'text-yellow-200'}`}>{aiMsg.text}</p>
        )}
        <button onClick={() => setShowManual(!showManual)}
          className="text-xs text-blue-200 hover:text-white mt-2 underline underline-offset-2">
          Carga manual
        </button>
      </div>

      {/* Manual form */}
      {showManual && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Carga manual de gasto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Nombre del gasto" value={formManual.nombre}
              onChange={e => setFormManual(p => ({ ...p, nombre: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Monto ($)" type="number" value={formManual.monto}
              onChange={e => setFormManual(p => ({ ...p, monto: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={formManual.categoria} onChange={e => setFormManual(p => ({ ...p, categoria: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
            <input type="date" value={formManual.fecha}
              onChange={e => setFormManual(p => ({ ...p, fecha: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={formManual.es_gasto_hormiga}
              onChange={e => setFormManual(p => ({ ...p, es_gasto_hormiga: e.target.checked }))}
              className="rounded" />
            ð Marcar como gasto hormiga
          </label>
          <div className="flex gap-2 mt-3">
            <button onClick={saveManual} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">Guardar</button>
            <button onClick={() => setShowManual(false)} className="text-slate-500 px-4 py-2 rounded-lg text-sm hover:bg-slate-100">Cancelar</button>
          </div>
        </div>
      )}

      {/* Gastos fijos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">ð Gastos fijos</h2>
            <p className="text-xs text-slate-400 mt-0.5">Suscripciones y recurrentes â {fmt(totalFijos)}/mes</p>
          </div>
          <button onClick={() => setShowFijoForm(!showFijoForm)}
            className="text-sm bg-slate-700 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            + Agregar
          </button>
        </div>

        {showFijoForm && (
          <div className="p-5 bg-slate-50 border-b border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder="Nombre (ej. Gimnasio)" value={formFijo.nombre}
                onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Monto mensual ($)" type="number" value={formFijo.monto}
                onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <select value={formFijo.categoria} onChange={e => setFormFijo(p => ({ ...p, categoria: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveFijo} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">Guardar</button>
              <button onClick={() => setShowFijoForm(false)} className="text-slate-500 px-4 py-2 rounded-lg text-sm hover:bg-slate-100">Cancelar</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-50">
          {gastosFijos.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Sin gastos fijos cargados</p>}
          {gastosFijos.map(g => (
            <div key={g.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-lg">{getCatEmoji(g.categoria)}</span>
                <div>
                  <p className="font-medium text-slate-800 text-sm">{g.nombre}</p>
                  <p className="text-xs text-slate-400 capitalize">{g.categoria}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-700">{fmt(g.monto)}</span>
                <button onClick={() => toggleDebitado(g.id, g.debitado)}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${g.debitado ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {g.debitado ? 'â Pagado' : 'Pendiente'}
                </button>
                <button onClick={() => deleteFijo(g.id)} className="text-slate-300 hover:text-red-400 text-xl leading-none">Ã</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gastos variables del mes */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">ð Gastos variables</h2>
          <p className="text-xs text-slate-400 mt-0.5">{meses[mes.month - 1]} {mes.year} â Total: {fmt(totalVar)}</p>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-400 text-center animate-pulse">Cargando...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="p-6 text-sm text-slate-400 text-center">Sin gastos este mes</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {Object.entries(grouped).map(([fecha, gastos]) => {
              const total = gastos.reduce((s, g) => s + g.monto, 0)
              const [, mm, dd] = fecha.split('-')
              return (
                <div key={fecha}>
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                    <span className="text-xs font-semibold text-slate-500">{dd}/{mm}</span>
                    <span className="text-xs font-bold text-slate-600">{fmt(total)}</span>
                  </div>
                  {gastos.map(g => (
                    <div key={g.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base">{getCatEmoji(g.categoria)}</span>
                        <div>
                          <p className="text-sm text-slate-800">{g.nombre}</p>
                          {g.es_gasto_hormiga && <span className="text-xs text-orange-500">ð hormiga</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{fmt(g.monto)}</span>
                        <button onClick={() => deleteVar(g.id)} className="text-slate-300 hover:text-red-400 text-xl leading-none">Ã</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gastos hormiga */}
      {gastosHormiga.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <h3 className="font-semibold text-yellow-800 text-sm mb-2">ð Gastos hormiga del mes</h3>
          <p className="text-yellow-700 text-sm">
            {gastosHormiga.length} gastos chicos suman <strong>{fmt(gastosHormiga.reduce((s, g) => s + g.monto, 0))}</strong>
          </p>
        </div>
      )}
    </div>
  )
}
