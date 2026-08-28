'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

/* `color` es un valor CSS (típicamente una var de tema), no una clase de
   Tailwind: así la barra sigue el tema activo en vez de un color fijo. */
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  return (
    <div
      className="h-2 rounded-full overflow-hidden"
      style={{ background: 'var(--border-color)' }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  )
}

/* Verde cuando llegaste, ámbar a mitad de camino, rojo si estás lejos. */
const colorProgreso = (pct: number, objetivo: number) =>
  pct >= objetivo
    ? 'var(--accent-positive)'
    : pct >= objetivo / 2
      ? 'var(--riesgo-medio)'
      : 'var(--accent-negative)'

export default function MetasPage() {
  const [loading, setLoading] = useState(true)
  const [dolar, setDolar] = useState<number | null>(null)

  // Financial data
  const [totalIngresos, setTotalIngresos] = useState(0)
  const [totalGastosFijos, setTotalGastosFijos] = useState(0)
  const [totalGastosVar, setTotalGastosVar] = useState(0)
  const [totalInversiones, setTotalInversiones] = useState(0)
  const [rendMensual, setRendMensual] = useState(0)

  // Meta configs (editable)
  const [metaAhorro, setMetaAhorro] = useState(50) // % objetivo
  const [metaCompraUSD, setMetaCompraUSD] = useState(20000) // USD
  const [metaCompraLabel, setMetaCompraLabel] = useState('Auto')
  const [editingAhorro, setEditingAhorro] = useState(false)
  const [editingCompra, setEditingCompra] = useState(false)
  const [tempAhorro, setTempAhorro] = useState('50')
  const [tempCompraUSD, setTempCompraUSD] = useState('20000')
  const [tempCompraLabel, setTempCompraLabel] = useState('Auto')

  useEffect(() => { loadData(); fetchDolar() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date()
    const primerDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const [{ data: ingresos }, { data: gastosFijos }, { data: gastosVar }, { data: inversiones }] = await Promise.all([
      supabase.from('ingresos_fijos').select('monto, monto_cobrado').eq('user_id', user.id).eq('activo', true),
      supabase.from('gastos_fijos').select('monto').eq('user_id', user.id).eq('activo', true),
      supabase.from('gastos_variables').select('monto').eq('user_id', user.id).gte('fecha', primerDia).lte('fecha', ultimoDia),
      supabase.from('inversiones').select('monto, moneda, tasa_anual').eq('user_id', user.id),
    ])

    const tIngresos = ingresos?.reduce((s, i) => s + Number(i.monto_cobrado ?? i.monto), 0) ?? 0
    const tGFijos = gastosFijos?.reduce((s, i) => s + Number(i.monto), 0) ?? 0
    const tGVar = gastosVar?.reduce((s, i) => s + Number(i.monto), 0) ?? 0

    setTotalIngresos(tIngresos)
    setTotalGastosFijos(tGFijos)
    setTotalGastosVar(tGVar)

    // Inversiones — will recalculate in ARS once dolar loads
    // Store raw for now
    const rawInv = inversiones || []
    const rawTotal = rawInv.reduce((s, i) => s + Number(i.monto), 0)
    setTotalInversiones(rawTotal)

    // Rendimiento mensual estimado
    const rend = rawInv.reduce((s, i) => s + (Number(i.monto) * (Number(i.tasa_anual) / 100) / 12), 0)
    setRendMensual(rend)

    setLoading(false)
  }

  async function fetchDolar() {
    try {
      const res = await fetch('/api/dolar')
      const json = await res.json()
      setDolar(json.blue)
    } catch {}
  }

  const saldoMensual = totalIngresos - totalGastosFijos - totalGastosVar
  const tasaAhorro = totalIngresos > 0 ? (saldoMensual / totalIngresos) * 100 : 0

  // Meta compra grande
  const metaCompraARS = dolar ? metaCompraUSD * dolar : null
  const pctCompra = metaCompraARS && totalInversiones > 0 ? (totalInversiones / metaCompraARS) * 100 : 0
  const mesesFaltanAhorro50 = metaCompraARS && totalIngresos > 0
    ? Math.ceil((metaCompraARS - totalInversiones) / (totalIngresos * 0.5)) : null
  const mesesFaltanAhorro65 = metaCompraARS && totalIngresos > 0
    ? Math.ceil((metaCompraARS - totalInversiones) / (totalIngresos * 0.65)) : null

  // Meta rendimientos pasivos
  const pctGastosCubiertos = totalGastosFijos > 0 ? (rendMensual / totalGastosFijos) * 100 : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-muted animate-pulse text-lg">Cargando...</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Metas</h1>
        <p className="text-secondary text-sm">Seguimiento de objetivos financieros</p>
      </div>

      {/* Meta 1: Tasa de ahorro */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-primary">🎯 Meta de ahorro mensual</h2>
            <p className="text-xs text-muted mt-0.5">Objetivo: ahorrar {metaAhorro}% de tus ingresos</p>
          </div>
          <button onClick={() => { setEditingAhorro(!editingAhorro); setTempAhorro(String(metaAhorro)) }}
            className="text-xs text-info hover:underline">
            {editingAhorro ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editingAhorro && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-alternate rounded-xl">
            <input type="number" value={tempAhorro} onChange={e => setTempAhorro(e.target.value)}
              className="border border-line rounded-lg px-3 py-1.5 text-sm w-24" placeholder="% objetivo" />
            <span className="text-sm text-secondary">%</span>
            <button onClick={() => { setMetaAhorro(Number(tempAhorro)); setEditingAhorro(false) }}
              className="bg-confirm text-white px-3 py-1.5 rounded-lg text-sm">Guardar</button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-alternate rounded-xl">
            <p className="text-xs text-muted mb-1">Ingresos</p>
            <p className="font-bold text-positive">{fmt(totalIngresos)}</p>
          </div>
          <div className="text-center p-3 bg-alternate rounded-xl">
            <p className="text-xs text-muted mb-1">Gastos</p>
            <p className="font-bold text-negative">{fmt(totalGastosFijos + totalGastosVar)}</p>
          </div>
          <div className={`text-center p-3 rounded-xl ${saldoMensual >= 0 ? 'bg-alternate' : 'bg-alternate'}`}>
            <p className="text-xs text-muted mb-1">Disponible</p>
            <p className={`font-bold ${saldoMensual >= 0 ? 'text-info' : 'text-negative'}`}>{fmt(saldoMensual)}</p>
          </div>
        </div>

        <ProgressBar pct={tasaAhorro} color={colorProgreso(tasaAhorro, metaAhorro)} />
        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted">0%</span>
          <span className={`text-sm font-bold ${tasaAhorro >= metaAhorro ? 'text-positive' : 'text-secondary'}`}>
            {tasaAhorro.toFixed(0)}% {tasaAhorro >= metaAhorro ? '✓ Meta alcanzada!' : `/ ${metaAhorro}% objetivo`}
          </span>
          <span className="text-xs text-muted">{metaAhorro}%</span>
        </div>
      </div>

      {/* Meta 2: Compra grande */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-primary">🚗 Meta de compra grande</h2>
            <p className="text-xs text-muted mt-0.5">{metaCompraLabel} — u$s {metaCompraUSD.toLocaleString()}</p>
          </div>
          <button onClick={() => {
            setEditingCompra(!editingCompra)
            setTempCompraUSD(String(metaCompraUSD))
            setTempCompraLabel(metaCompraLabel)
          }} className="text-xs text-info hover:underline">
            {editingCompra ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editingCompra && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-alternate rounded-xl flex-wrap">
            <input value={tempCompraLabel} onChange={e => setTempCompraLabel(e.target.value)}
              className="border border-line rounded-lg px-3 py-1.5 text-sm" placeholder="Nombre (ej. Auto)" />
            <input type="number" value={tempCompraUSD} onChange={e => setTempCompraUSD(e.target.value)}
              className="border border-line rounded-lg px-3 py-1.5 text-sm w-32" placeholder="USD" />
            <button onClick={() => { setMetaCompraUSD(Number(tempCompraUSD)); setMetaCompraLabel(tempCompraLabel); setEditingCompra(false) }}
              className="bg-confirm text-white px-3 py-1.5 rounded-lg text-sm">Guardar</button>
          </div>
        )}

        {metaCompraARS ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-alternate rounded-xl">
                <p className="text-xs text-muted mb-1">Objetivo en ARS</p>
                <p className="font-bold text-info">{fmt(metaCompraARS)}</p>
                <p className="text-xs text-muted">al blue ${dolar?.toFixed(0)}</p>
              </div>
              <div className="text-center p-3 bg-alternate rounded-xl">
                <p className="text-xs text-muted mb-1">Patrimonio actual</p>
                <p className="font-bold text-primary">{fmt(totalInversiones)}</p>
              </div>
            </div>

            <ProgressBar pct={pctCompra} color="var(--accent-confirm)" />
            <div className="flex justify-between mt-2 mb-4">
              <span className="text-xs text-muted">0%</span>
              <span className="text-sm font-bold text-primary">{pctCompra.toFixed(1)}% alcanzado</span>
              <span className="text-xs text-muted">100%</span>
            </div>

            {pctCompra < 100 && totalIngresos > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-alternate rounded-xl p-3 text-center">
                  <p className="text-xs text-muted mb-1">Ahorrando 50% del sueldo</p>
                  <p className="font-bold text-primary">{mesesFaltanAhorro50 ?? '–'} meses</p>
                </div>
                <div className="bg-alternate rounded-xl p-3 text-center">
                  <p className="text-xs text-muted mb-1">Ahorrando 65% del sueldo</p>
                  <p className="font-bold text-primary">{mesesFaltanAhorro65 ?? '–'} meses</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted text-center py-4">Cargando cotización del dólar...</p>
        )}
      </div>

      {/* Meta 3: Rendimientos pasivos */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-6">
        <h2 className="font-semibold text-primary mb-1">📊 Rendimientos pasivos</h2>
        <p className="text-xs text-muted mb-4">Cuánto generan tus inversiones sin tocar el capital</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-alternate rounded-xl">
            <p className="text-xs text-muted mb-1">Rendimiento mensual est.</p>
            <p className="font-bold text-positive">{fmt(rendMensual)}</p>
            <p className="text-xs text-muted">de tus inversiones</p>
          </div>
          <div className="text-center p-3 bg-alternate rounded-xl">
            <p className="text-xs text-muted mb-1">Gastos fijos</p>
            <p className="font-bold text-negative">{fmt(totalGastosFijos)}</p>
            <p className="text-xs text-muted">por mes</p>
          </div>
        </div>

        <ProgressBar pct={pctGastosCubiertos} color={colorProgreso(pctGastosCubiertos, 100)} />
        <p className="text-center mt-2 text-sm font-bold text-primary">
          {pctGastosCubiertos.toFixed(1)}% de tus gastos fijos cubiertos por rendimientos
        </p>

        {totalGastosFijos === 0 && (
          <p className="text-xs text-muted text-center mt-2">Cargá gastos fijos en la sección Gastos & CC para ver este cálculo</p>
        )}
        {rendMensual === 0 && (
          <p className="text-xs text-muted text-center mt-2">Cargá inversiones con tasa anual en Portfolio para ver rendimientos</p>
        )}
      </div>
    </div>
  )
}
