'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LucaMensaje } from '@/components/luca/LucaMensaje'
import { detectarCategoria } from '@/lib/parser'
import { guardarGastoVariable } from '@/lib/movimientos'
import { COLORES_MARCA, MARCAS, type Tarjeta } from '@/lib/tarjetas'

/* ── helpers ─────────────────────────────── */
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const MES_ACTUAL = new Date().toISOString().slice(0, 7) // "2026-09"

/** Primer y último día del mes actual, en formato YYYY-MM-DD. */
function rangoMesActual(): { desde: string; hasta: string } {
  const hoy = new Date()
  const desde = `${MES_ACTUAL}-01`
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const hasta = `${MES_ACTUAL}-${String(ultimoDia).padStart(2, '0')}`
  return { desde, hasta }
}

interface GastoMes {
  id: string
  nombre: string
  monto: number
  fecha: string
  categoria: string
  tarjeta_id: string | null
  forma_pago: string | null
}

/* Tarjetas que quedaron guardadas en el navegador antes de que
   existiera la tabla. Se suben una sola vez y se borra la clave. */
const LEGACY_KEY = 'tarjetas_v1'
interface TarjetaLegacy { nombre: string; tipo: string; limite: number; cierre: number }

/* ── component ───────────────────────────── */
export default function TarjetasPage() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([])
  const [gastosMes, setGastosMes] = useState<GastoMes[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* form nueva tarjeta */
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', marca: 'Visa', limite: '', cierre: '10' })

  /* form nuevo gasto en tarjeta */
  const [gastoTarjeta, setGastoTarjeta] = useState<string | null>(null)
  const [gastoForm, setGastoForm] = useState({ nombre: '', monto: '', fecha: new Date().toISOString().slice(0, 10) })

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const primera = await supabase
      .from('tarjetas_cuentas')
      .select('*')
      .order('created_at', { ascending: true })
    let ts = primera.data
    const e1 = primera.error

    /* Migración única desde localStorage */
    try {
      const legacy: TarjetaLegacy[] = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
      if (legacy.length) {
        const existentes = new Set((ts ?? []).map(t => (t as Tarjeta).nombre.toLowerCase()))
        const nuevas = legacy
          .filter(l => l.nombre && !existentes.has(l.nombre.toLowerCase()))
          .map(l => ({
            user_id: user.id, nombre: l.nombre, tipo: 'tarjeta', marca: l.tipo,
            limite: l.limite || 0, cierre: l.cierre || null,
          }))
        if (nuevas.length) {
          await supabase.from('tarjetas_cuentas').insert(nuevas)
          const again = await supabase.from('tarjetas_cuentas').select('*').order('created_at', { ascending: true })
          ts = again.data
        }
        localStorage.removeItem(LEGACY_KEY)
      }
    } catch { /* storage no disponible: no pasa nada */ }

    const { desde, hasta } = rangoMesActual()
    const { data: gs, error: e2 } = await supabase
      .from('gastos_variables')
      .select('id, nombre, monto, fecha, categoria, tarjeta_id, forma_pago')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })

    if (e1 || e2) setError('No se pudieron cargar las tarjetas. Probá recargar la página.')
    /* Las cuentas que solo se usan con débito (ej: Ualá) viven en
       Billeteras; acá van las que tienen tarjeta de crédito. */
    setTarjetas(((ts ?? []) as Tarjeta[]).filter(t => t.tipo === 'tarjeta'))
    setGastosMes((gs ?? []) as GastoMes[])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /* Un gasto es de la tarjeta si apunta a ella por id, o (datos viejos)
     si su categoría es "CC: {nombre}". */
  function gastosDeTarjeta(t: Tarjeta): GastoMes[] {
    /* Solo consumos a crédito: lo pagado con débito sale del saldo de
       la billetera y se ve en Billeteras, no en el resumen de la tarjeta. */
    return gastosMes.filter(g =>
      (g.tarjeta_id === t.id && g.forma_pago !== 'debito') ||
      (!g.tarjeta_id && g.categoria === `CC: ${t.nombre}`),
    )
  }

  const totalDeTarjeta = (t: Tarjeta) =>
    gastosDeTarjeta(t).reduce((s, g) => s + Number(g.monto), 0)

  /* agregar tarjeta */
  async function agregarTarjeta() {
    if (!form.nombre.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: e } = await supabase.from('tarjetas_cuentas').insert({
      user_id: user.id,
      nombre: form.nombre.trim(),
      tipo: 'tarjeta',
      marca: form.marca,
      limite: parseFloat(form.limite) || 0,
      cierre: parseInt(form.cierre) || null,
    })
    if (e) { setError('No se pudo guardar la tarjeta.'); return }
    setForm({ nombre: '', marca: 'Visa', limite: '', cierre: '10' })
    setShowForm(false)
    cargar()
  }

  /* eliminar tarjeta (los gastos quedan, solo se desvinculan) */
  async function eliminarTarjeta(t: Tarjeta) {
    if (!window.confirm(`¿Eliminar ${t.nombre}? Los gastos no se borran.`)) return
    const supabase = createClient()
    await supabase.from('tarjetas_cuentas').delete().eq('id', t.id)
    cargar()
  }

  /* registrar gasto en tarjeta */
  async function registrarGasto(t: Tarjeta) {
    if (!gastoForm.nombre.trim() || !gastoForm.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const nombre = gastoForm.nombre.trim()
    const { error: e } = await guardarGastoVariable(supabase, user.id, {
      nombre,
      monto: parseFloat(gastoForm.monto),
      fecha: gastoForm.fecha,
      categoria: detectarCategoria(nombre),
      medio_pago: t.nombre,
      forma_pago: 'credito',
    })
    if (e) { setError('No se pudo registrar el gasto.'); return }
    setGastoTarjeta(null)
    setGastoForm({ nombre: '', monto: '', fecha: new Date().toISOString().slice(0, 10) })
    cargar()
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

  const totalMes = tarjetas.reduce((s, t) => s + totalDeTarjeta(t), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            💳 Tarjetas de crédito
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
            Consumos del mes a crédito{tarjetas.length > 0 && ` · Total ${fmt(totalMes)}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: 'var(--accent-confirm)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
          }}
        >
          + Agregar tarjeta
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--accent-negative)', fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {/* Formulario nueva tarjeta */}
      {showForm && (
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border-color)',
          borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
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
              value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value })}
              style={inputStyle}
            >
              {MARCAS.map(t => <option key={t} value={t}>{t}</option>)}
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
              type="number" min="1" max="31"
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
      {loading ? (
        <div className="fa-card p-8 text-center">
          <p className="text-sm text-secondary">Cargando tarjetas…</p>
        </div>
      ) : tarjetas.length === 0 ? (
        <div className="fa-card p-8">
          <LucaMensaje
            variante="vacio"
            estado="sad"
            titulo="Todavía no cargaste ninguna tarjeta"
            accion={{ label: '+ Agregar tarjeta', onClick: () => setShowForm(true) }}
          >
            Agregá tus tarjetas para ver cuánto consumiste con cada una este mes.
            También podés decirle a Luca &quot;gasté 10 lucas con la visa&quot; y la crea sola.
          </LucaMensaje>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {tarjetas.map(t => {
            const total = totalDeTarjeta(t)
            const limite = Number(t.limite) || 0
            const porcentaje = limite > 0 ? Math.min(100, Math.round((total / limite) * 100)) : 0
            const movimientos = gastosDeTarjeta(t)
            const color = COLORES_MARCA[t.marca ?? ''] || '#6E7681'

            return (
              <div
                key={t.id}
                style={{
                  background: 'var(--bg-card)', border: '0.5px solid var(--border-color)',
                  borderRadius: 'var(--radius)', overflow: 'hidden',
                }}
              >
                {/* Card header */}
                <div style={{ background: color, padding: '20px 20px 16px', position: 'relative' }}>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    {t.marca ?? t.tipo}
                  </p>
                  <p style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>{t.nombre}</p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '0 0 2px' }}>Gastado este mes</p>
                  <p style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: 0, fontFamily: 'Courier New, monospace' }}>
                    {fmt(total)}
                  </p>
                  {limite > 0 && (
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '4px 0 0' }}>
                      de {fmt(limite)} ({porcentaje}%)
                    </p>
                  )}
                  <button
                    onClick={() => eliminarTarjeta(t)}
                    aria-label={`Eliminar ${t.nombre}`}
                    style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Progress bar */}
                {limite > 0 && (
                  <div style={{ height: 4, background: 'var(--border-color)' }}>
                    <div style={{
                      height: '100%', width: porcentaje + '%',
                      background: porcentaje > 80 ? 'var(--accent-negative)' : porcentaje > 60 ? '#FFA657' : color,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                {/* Body */}
                <div style={{ padding: 16 }}>
                  {(t.cierre || t.vencimiento) && (
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 12px' }}>
                      {t.cierre && `Cierre: día ${t.cierre}`}
                      {t.cierre && t.vencimiento && ' · '}
                      {t.vencimiento && `Vence: día ${t.vencimiento}`}
                    </p>
                  )}

                  {movimientos.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin movimientos este mes</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {movimientos.slice(0, 6).map(g => (
                        <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nombre}</span>
                          <span style={{ fontSize: 13, color: 'var(--accent-negative)', fontFamily: 'Courier New, monospace', fontWeight: 600, flexShrink: 0 }}>
                            -{fmt(Number(g.monto))}
                          </span>
                        </div>
                      ))}
                      {movimientos.length > 6 && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                          +{movimientos.length - 6} más en Movimientos
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
                          placeholder="Monto" type="number"
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
