'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Crypto { id: string; simbolo: string; nombre: string; cantidad: number; precio_compra: number }
interface Otra { id: string; nombre: string; tipo: string; monto_invertido: number; valor_actual: number; moneda: string }
interface PreciosCrypto { [key: string]: { usd: number; usd_24h_change: number } }
const CRYPTO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', BNB: 'binancecoin', SOL: 'solana', ADA: 'cardano', XRP: 'ripple', USDC: 'usd-coin' }

export default function InversionesPage() {
  const [cryptos, setCryptos] = useState<Crypto[]>([])
  const [otras, setOtras] = useState<Otra[]>([])
  const [precios, setPrecios] = useState<PreciosCrypto>({})
  const [tab, setTab] = useState<'crypto' | 'otras'>('crypto')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formCrypto, setFormCrypto] = useState({ simbolo: 'BTC', nombre: 'Bitcoin', cantidad: '', precio_compra: '' })
  const [formOtra, setFormOtra] = useState({ nombre: '', tipo: 'acciones', monto_invertido: '', valor_actual: '', moneda: 'ARS' })

  useEffect(() => { loadData(); fetchPrecios() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: cry }, { data: ot }] = await Promise.all([supabase.from('inversiones_crypto').select('*').eq('user_id', user.id), supabase.from('inversiones_otras').select('*').eq('user_id', user.id)])
    setCryptos(cry ?? []); setOtras(ot ?? []); setLoading(false)
  }

  async function fetchPrecios() {
    try { const res = await fetch(`/api/crypto?ids=${Object.values(CRYPTO_IDS).join(',')}`); setPrecios(await res.json()) } catch {}
  }

  async function addCrypto(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('inversiones_crypto').insert({ user_id: user.id, simbolo: formCrypto.simbolo, nombre: formCrypto.nombre, cantidad: parseFloat(formCrypto.cantidad), precio_compra: parseFloat(formCrypto.precio_compra) || 0 })
    setShowForm(false); loadData()
  }

  async function addOtra(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('inversiones_otras').insert({ user_id: user.id, nombre: formOtra.nombre, tipo: formOtra.tipo, monto_invertido: parseFloat(formOtra.monto_invertido), valor_actual: parseFloat(formOtra.valor_actual) || parseFloat(formOtra.monto_invertido), moneda: formOtra.moneda })
    setShowForm(false); loadData()
  }

  async function eliminar(id: string, tabla: string) { const supabase = createClient(); await supabase.from(tabla).delete().eq('id', id); loadData() }

  const getPrecio = (s: string) => { const id = CRYPTO_IDS[s.toUpperCase()]; return id && precios[id] ? precios[id].usd : null }
  const getChange = (s: string) => { const id = CRYPTO_IDS[s.toUpperCase()]; return id && precios[id] ? precios[id].usd_24h_change : null }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">Inversiones</h1><p className="text-slate-500">Crypto y otras inversiones — precios automáticos</p></div>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Agregar</button>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setTab('crypto'); setShowForm(false) }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'crypto' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>₿ Crypto</button>
        <button onClick={() => { setTab('otras'); setShowForm(false) }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'otras' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>📈 Otras</button>
      </div>
      {showForm && tab === 'crypto' && (
        <form onSubmit={addCrypto} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Agregar crypto</h3>
          <div className="flex gap-2">
            <select value={formCrypto.simbolo} onChange={e => { const s = e.target.value; const n: Record<string,string> = {BTC:'Bitcoin',ETH:'Ethereum',USDT:'Tether',BNB:'BNB',SOL:'Solana',ADA:'Cardano',XRP:'XRP',USDC:'USD Coin'}; setFormCrypto({...formCrypto, simbolo: s, nombre: n[s]||s}) }} className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm">{Object.keys(CRYPTO_IDS).map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input type="number" placeholder="Cantidad" value={formCrypto.cantidad} onChange={e => setFormCrypto({...formCrypto, cantidad: e.target.value})} required step="any" min="0" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
          </div>
          <input type="number" placeholder="Precio de compra (USD, opcional)" value={formCrypto.precio_compra} onChange={e => setFormCrypto({...formCrypto, precio_compra: e.target.value})} step="any" min="0" className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm" />
          <div className="flex gap-2"><button type="submit" className="bg-orange-500 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-orange-600">Guardar</button><button type="button" onClick={() => setShowForm(false)} className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button></div>
        </form>
      )}
      {showForm && tab === 'otras' && (
        <form onSubmit={addOtra} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Agregar inversión</h3>
          <input type="text" placeholder="Nombre (ej: GGAL, Plazo fijo)" value={formOtra.nombre} onChange={e => setFormOtra({...formOtra, nombre: e.target.value})} required className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm" />
          <select value={formOtra.tipo} onChange={e => setFormOtra({...formOtra, tipo: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm"><option value="acciones">Acciones</option><option value="plazo_fijo">Plazo Fijo</option><option value="fondo_comun">Fondo Común de Inversión</option><option value="bono">Bono</option><option value="otro">Otro</option></select>
          <div className="flex gap-2">
            <input type="number" placeholder="Monto invertido" value={formOtra.monto_invertido} onChange={e => setFormOtra({...formOtra, monto_invertido: e.target.value})} required min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
            <input type="number" placeholder="Valor actual" value={formOtra.valor_actual} onChange={e => setFormOtra({...formOtra, valor_actual: e.target.value})} min="0" step="0.01" className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm" />
            <select value={formOtra.moneda} onChange={e => setFormOtra({...formOtra, moneda: e.target.value})} className="border border-slate-200 rounded-xl px-3 py-2 text-sm"><option value="ARS">ARS</option><option value="USD">USD</option></select>
          </div>
          <div className="flex gap-2"><button type="submit" className="bg-purple-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-purple-700">Guardar</button><button type="button" onClick={() => setShowForm(false)} className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button></div>
        </form>
      )}
      {loading ? <p className="text-slate-400 text-center py-8">Cargando...</p> : tab === 'crypto' ? (
        cryptos.length === 0 ? <div className="text-center py-12 text-slate-400"><p className="text-4xl mb-2">₿</p><p>No tenés crypto cargada</p></div> : (
          <div className="space-y-3">{cryptos.map(c => { const pa=getPrecio(c.simbolo); const ch=getChange(c.simbolo); const va=pa?c.cantidad*pa:null; const vc=c.precio_compra?c.cantidad*c.precio_compra:null; const gan=va&&vc?va-vc:null; return (<div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><h3 className="font-bold text-slate-800">{c.simbolo}</h3><span className="text-slate-400 text-sm">{c.nombre}</span>{ch!==null&&<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ch>=0?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>{ch>=0?'▲':'▼'} {Math.abs(ch).toFixed(2)}%</span>}</div><p className="text-slate-500 text-sm mt-1">{c.cantidad} {c.simbolo}{pa&&<> · Precio: <strong>${pa.toLocaleString('en-US')}</strong></>}</p></div><div className="text-right">{va&&<p className="font-bold text-slate-800">${va.toLocaleString('en-US',{maximumFractionDigits:2})}</p>}{gan!==null&&<p className={`text-sm font-medium ${gan>=0?'text-green-600':'text-red-500'}`}>{gan>=0?'+':''}${gan.toFixed(2)}</p>}<button onClick={()=>eliminar(c.id,'inversiones_crypto')} className="text-slate-300 hover:text-red-500 text-xs mt-1">🗑</button></div></div></div>)})}</div>
        )
      ) : (
        otras.length === 0 ? <div className="text-center py-12 text-slate-400"><p className="text-4xl mb-2">📈</p><p>No tenés inversiones cargadas</p></div> : (
          <div className="space-y-3">{otras.map(o => { const gan=o.valor_actual-o.monto_invertido; const pct=o.monto_invertido>0?(gan/o.monto_invertido)*100:0; return (<div key={o.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-800">{o.nombre}</h3><p className="text-slate-400 text-xs capitalize">{o.tipo.replace('_',' ')} · {o.moneda}</p></div><div className="text-right"><p className="font-bold text-slate-800">${o.valor_actual.toLocaleString('es-AR')}</p><p className={`text-sm font-medium ${gan>=0?'text-green-600':'text-red-500'}`}>{gan>=0?'+':''}{pct.toFixed(1)}%</p><button onClick={()=>eliminar(o.id,'inversiones_otras')} className="text-slate-300 hover:text-red-500 text-xs mt-1">🗑</button></div></div></div>)})}</div>
        )
      )}
    </div>
  )
}
