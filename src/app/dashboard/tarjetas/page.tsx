'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/* ── helpers ─────────────────────────────── */
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

const MES_ACTUAL = new Date().toISOString().slice(0, 7) // "2026-08"

/* ── tipos ───────────────────────────────── */
interface Tarjeta {
  id: string
  nombre: string
  tipo: string
  limite: number
  cierre: number
}

interface GastoMes {
  id: string
  nombre: string
  monto: number
  fecha: string
  categoria: string
}

const TIPOS = ['Visa', 'Mastercard', 'Naranja X', 'Mercado Pago', 'AMEX', 'Cabal', 'Otra']

const colores: Record<string, string> = {
  'Visa': '#1A1F71',
  'Mastercard': '#EB001B',
  'Naranja X': '#F47920',
  'Mercado Pago': '#009EE3',
  'AMEX': '#007BC1',
  'Cabal': '#004A97',
  'Otra': '#6E7681',
}

/* ── storage helpers ─────────────────────── */
const STORAGE_KEY = 'tarjetas_v1'

function loadTarjetas(): Tarjeta[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveTarjetas(t: Tarjeta[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
  } catch {}
}

/* ── component ───────────────────────────── */
export default function TarjetasPage() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([])
  const [gastosMes, setGastosMes] = useState<GastoMes[]>([])
  const [loading, setLoading] = useState(true)

  /* form nueva tarjeta */
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', tipo: 'Visa', limite: '', cierre: '10' })

  /* form nuevo gasto en tarjeta */
  const [gastoTarjeta, setGastoTarjeta] = useState<string | null>(null)
  const [gastoForm, setGastoForm] = useState({ nombre: '', monto: '', fecha: new Date().toISOString().slice(0, 10) })

  useEffect(() => {
    setTarjetas(loadTarjetas())
    cargarGastos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarGastos() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('gastos_variables')
      .select('id, nombre, monto, fecha, categoria')
      .like('fecha', MES_ACTUAL + '%')
    setGastosMes(data || [])
    setLoading(false)
  }

  /* gastos de una tarjeta en el mes = categoria == "CC: {nombre}" */
  function gastosDeTarjeta(t: Tarjeta): GastoMes[] {
    return gastosMes.filter(g => g.categoria === `CC: ${t.nombre}`)
  }

  function totalDeTarjeta(t: Tarjeta): number {
    return gastosDeTarjeta(t).reduce((s, g) => s + g.monto, 0)
  }

  /* agregar tarjeta */
  function agregarTarjeta() {
    if (!form.nombre.trim()) return
    const nueva: Tarjeta = {
      id: Date.now().toString(),
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      limite: parseFloat(form.limite) || 0,
      cierre: parseInt(form.cierre) || 10,
    }
    const updated = [...tarjetas, nueva]
    setTarjetas(updated)
    saveTarjetas(updated)
    setForm({ nombre: '', tipo: 'Visa', limite: '', cierre: '10' })
    setShowForm(false)
  }

  /* eliminar tarjeta */
  function eliminarTarjeta(id: string) {
    const updated = tarjetas.filter(t => t.id !== id)
    setTarjetas(updated)
    saveTarjetas(updated)
  }

  /* registrar gasto en tarjeta */
  async function registrarGasto(tarjeta: Tarjeta) {
    if (!gastoForm.nombre.trim() || !gastoForm.monto) return
    const supabase = createClient()
    await supabase.from('gastos_variables').insert({
      nombre: gastoForm.nombre.trim(),
      monto: parseFloat(gastoForm.monto),
      fecha: gastoForm.fecha,
      categoria: `CC: ${tarjeta.nombre}`,
      es_gasto_hormiga: false,
    })
    setGastoTarjeta(null)
    setGastoForm({ nombre: '', monto: '', fecha: new Date().toISOString().slice(0, 10) })
    await cargarGastos()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '0.5px solid var(--border-color)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            💳 Tarjetas
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
            Gastos del mes actual por tarjeta
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: 'var(--accent-confirm)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 18px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          + Agregar tarjeta
        </button>
      </div>

      {/* Formulario nueva tarjeta */}
      {showForm && (
        <div style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <p style={{ color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>Nueva tarjeta</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <input
              placeholder="Nombre (ej: Visa Galicia)"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              style={inputStyle}
            />
            <select
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value })}
              style={inputStyle}
            >
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              placeholder="Límite ($)"
              type="number"
              value={form.limite}
              onChange={e => setForm({ ...form, limite: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Día cierre"
              type="number"
              min="1"
              max="31"
              value={form.cierre}
              onChange={e => setForm({ ...form, cierre: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={agregarTarjeta}
              style={{ background: 'var(--accent-confirm)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}
            >
              Guardar
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: 'none', border: '0.5px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tarjetas */}
      {tarjetas.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: 48,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 15,
        }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>💳</p>
          <p style={{ margin: 0 }}>No tenés tarjetas configuradas.<br />Agregá una para trackear tus gastos.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {tarjetas.map(t => {
            const total = totalDeTarjeta(t)
            const porcentaje = t.limite > 0 ? Math.min(100, Math.round((total / t.limite) * 100)) : 0
            const movimientos = gastosDeTarjeta(t)
            const color = colores[t.tipo] || '#6E7681'

            return (
              <div
                key={t.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '0.5px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                {/* Card header */}
                <div style={{ background: color, padding: '20px 20px 16px', position: 'relative' }}>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    {t.tipo}
                  </p>
                  <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>{t.nombre}</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '0 0 2px' }}>Gastado este mes</p>
                  <p style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: 0, fontFamily: 'Courier New, monospace' }}>
                    {fmt(total)}
                  </p>
                  {t.limite > 0 && (
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '4px 0 0' }}>
                      de {fmt(t.limite)} ({porcentaje}%)
                    </p>
                  )}
                  <button
                    onClick={() => eliminarTarjeta(t.id)}
                    style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Progress bar */}
                {t.limite > 0 && (
                  <div style={{ height: 4, background: 'var(--border-color)' }}>
                    <div style={{
                      height: '100%',
                      width: porcentaje + '%',
                      background: porcentaje > 80 ? 'var(--accent-negative)' : porcentaje > 60 ? '#FFA657' : color,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                {/* Body */}
                <div style={{ padding: 16 }}>
                  {/* Cierre */}
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 12px' }}>
                    Cierre: día {t.cierre} de cada mes
                  </p>

                  {/* Movimientos del mes */}
                  {loading ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>
                  ) : movimientos.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin movimientos este mes</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {movimientos.slice(0, 5).map(g => (
                        <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{g.nombre}</span>
                          <span style={{ fontSize: 13, color: 'var(--accent-negative)', fontFamily: 'Courier New, monospace', fontWeight: 600 }}>
                            -{fmt(g.monto)}
                          </span>
                        </div>
                      ))}
                      {movimientos.length > 5 && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                          +{movimientos.length - 5} más en historial
                        </p>
                      )}
                    </div>
                  )}

                  {/* Agregar gasto */}
                  {gastoTarjeta === t.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        placeholder="Descripción"
                        value={gastoForm.nombre}
                        onChange={e => setGastoForm({ ...gastoForm, nombre: e.target.value })}
                        style={{ ...inputStyle, fontSize: 13 }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          placeholder="Monto"
                          type="number"
                          value={gastoForm.monto}
                          onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })}
                          style={{ ...inputStyle, fontSize: 13, flex: 1 }}
                        />
                        <input
                          type="date"
                          value={gastoForm.fecha}
                          onChange={e => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                          style={{ ...inputStyle, fontSize: 13, flex: 1 }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => registrarGasto(t)}
                          style={{ flex: 1, background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13 }}
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setGastoTarjeta(null)}
                          style={{ background: 'none', border: '0.5px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setGastoTarjeta(t.id); setGastoForm({ nombre: '', monto: '', fecha: new Date().toISOString().slice(0, 10) }) }}
                      style={{ width: '100%', background: 'none', border: '0.5px dashed var(--border-color)', color: 'var(--text-secondary)', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13 }}
                    >
                      + Registrar gasto
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
