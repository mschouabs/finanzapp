'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { guardarGastoVariable, ingresarABilletera, listarMediosDePago } from '@/lib/movimientos'
import { CATEGORIAS } from '@/lib/categorias'

type Tab = 'gasto' | 'ingreso'
type SubIngreso = 'freelance' | 'fijo'

const hoyISO = () => new Date().toISOString().split('T')[0]

const formGastoVacio = () => ({
  nombre: '', monto: '', categoria: 'varios', fecha: hoyISO(),
  es_gasto_hormiga: false, medio: '', forma: 'debito' as 'debito' | 'credito',
  cuotas: '1', moneda: 'ARS' as 'ARS' | 'USD',
})

const formFreelanceVacio = () => ({
  cliente: '', descripcion: '', monto_total: '', monto_cobrado: '', fecha: hoyISO(), billetera: '', moneda: 'ARS' as 'ARS' | 'USD',
})

const formFijoVacio = () => ({ nombre: '', monto: '', monto_cobrado: '', billetera: '', moneda: 'ARS' as 'ARS' | 'USD' })

const inputCls = 'rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'

export function AgregarMovimientoModal({
  onClose,
  onSaved,
  defaultTab = 'gasto',
}: {
  onClose: () => void
  onSaved?: () => void
  defaultTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [subIngreso, setSubIngreso] = useState<SubIngreso>('freelance')
  const [medios, setMedios] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [formGasto, setFormGasto] = useState(formGastoVacio())
  const [formFreelance, setFormFreelance] = useState(formFreelanceVacio())
  const [formFijo, setFormFijo] = useState(formFijoVacio())

  useEffect(() => {
    const supabase = createClient()
    listarMediosDePago(supabase, true).then(setMedios).catch(() => {})
  }, [])

  async function guardarGasto() {
    if (!formGasto.nombre || !formGasto.monto) return
    setSaving(true)
    setError('')
    setAviso('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error: err, avisoSaldoNegativo } = await guardarGastoVariable(supabase, user.id, {
      nombre: formGasto.nombre,
      monto: Number(formGasto.monto),
      categoria: formGasto.categoria,
      fecha: formGasto.fecha,
      es_gasto_hormiga: formGasto.es_gasto_hormiga,
      medio_pago: formGasto.medio || null,
      forma_pago: formGasto.medio ? formGasto.forma : null,
      cuotas: formGasto.medio && formGasto.forma === 'credito' ? Number(formGasto.cuotas) || 1 : 1,
      moneda: formGasto.moneda,
    })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved?.()
    if (avisoSaldoNegativo) {
      /* el gasto se guardó bien: solo avisamos, no bloqueamos el cierre */
      setAviso(avisoSaldoNegativo)
      setFormGasto(formGastoVacio())
      return
    }
    onClose()
  }

  async function guardarFreelance() {
    if (!formFreelance.cliente || !formFreelance.monto_total) return
    setSaving(true)
    setError('')
    setAviso('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const cobrado = Number(formFreelance.monto_cobrado || '0')
    const { error: err } = await supabase.from('ingresos_freelance').insert({
      user_id: user.id,
      cliente: formFreelance.cliente,
      descripcion: formFreelance.descripcion,
      monto_total: Number(formFreelance.monto_total),
      monto_cobrado: cobrado,
      fecha: formFreelance.fecha,
    })
    if (err) { setSaving(false); setError('No se pudo guardar el ingreso.'); return }

    if (formFreelance.billetera && cobrado > 0) {
      const { error: errBill } = await ingresarABilletera(supabase, user.id, {
        app: formFreelance.billetera, monto: cobrado, moneda: formFreelance.moneda,
      })
      if (errBill) { setSaving(false); setAviso(errBill); onSaved?.(); return }
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  async function guardarFijo() {
    if (!formFijo.nombre || !formFijo.monto) return
    setSaving(true)
    setError('')
    setAviso('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const monto = Number(formFijo.monto)
    const monto_cobrado = formFijo.monto_cobrado ? Number(formFijo.monto_cobrado) : null

    /* si ya existe un sueldo activo con el mismo nombre, lo actualizamos
       en vez de crear un duplicado (mismo criterio que en Trabajos). */
    const { data: existentes } = await supabase
      .from('ingresos_fijos')
      .select('id, nombre, monto, monto_cobrado')
      .eq('user_id', user.id)
      .eq('activo', true)

    const existente = (existentes || []).find(
      (f: { id: string; nombre: string }) => f.nombre.trim().toLowerCase() === formFijo.nombre.trim().toLowerCase()
    )

    const { error: err } = existente
      ? await supabase.from('ingresos_fijos').update({ nombre: formFijo.nombre, monto, monto_cobrado }).eq('id', existente.id)
      : await supabase.from('ingresos_fijos').insert({ user_id: user.id, nombre: formFijo.nombre, monto, monto_cobrado, activo: true })

    if (err) { setSaving(false); setError('No se pudo guardar el ingreso.'); return }

    /* acreditamos solo la diferencia contra lo que ya se había cobrado,
       para no duplicar plata si estás "actualizando" el mismo sueldo. */
    const cobradoAntes = existente ? (existente.monto_cobrado ?? existente.monto) : 0
    const cobradoAhora = monto_cobrado ?? monto
    const delta = cobradoAhora - cobradoAntes

    if (formFijo.billetera && delta > 0) {
      const { error: errBill } = await ingresarABilletera(supabase, user.id, {
        app: formFijo.billetera, monto: delta, moneda: formFijo.moneda,
      })
      if (errBill) { setSaving(false); setAviso(errBill); onSaved?.(); return }
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 fa-fade-in" onClick={onClose} />
      <div className="fa-card relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-primary">Nuevo movimiento</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-secondary hover:bg-alternate hover:text-primary">
            <X size={18} />
          </button>
        </div>

        {/* tabs */}
        <div className="mb-4 flex overflow-hidden rounded-lg border text-sm font-semibold">
          <button
            onClick={() => setTab('gasto')}
            className={`flex-1 px-3 py-2.5 ${tab === 'gasto' ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}
          >
            💸 Gasto
          </button>
          <button
            onClick={() => setTab('ingreso')}
            className={`flex-1 px-3 py-2.5 ${tab === 'ingreso' ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}
          >
            💰 Ingreso
          </button>
        </div>

        {tab === 'gasto' && (
          <div className="flex flex-col gap-3">
            <input autoFocus placeholder="¿Qué compraste?" value={formGasto.nombre}
              onChange={e => setFormGasto(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />

            <div className="flex gap-2">
              <input placeholder={formGasto.moneda === 'USD' ? 'Monto (US$)' : 'Monto ($)'} type="number" inputMode="decimal"
                value={formGasto.monto} onChange={e => setFormGasto(p => ({ ...p, monto: e.target.value }))}
                className={`${inputCls} flex-1`} />
              <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
                {(['ARS', 'USD'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setFormGasto(p => ({ ...p, moneda: m }))}
                    className={`px-2.5 ${formGasto.moneda === m ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <select value={formGasto.categoria} onChange={e => setFormGasto(p => ({ ...p, categoria: e.target.value }))} className={inputCls}>
              {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>

            <input type="date" value={formGasto.fecha}
              onChange={e => setFormGasto(p => ({ ...p, fecha: e.target.value }))} className={inputCls} />

            <select value={formGasto.medio} onChange={e => setFormGasto(p => ({ ...p, medio: e.target.value }))} className={inputCls}>
              <option value="">Efectivo / sin especificar</option>
              {medios.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {formGasto.medio && (
              <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
                {(['debito', 'credito'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setFormGasto(p => ({ ...p, forma: f }))}
                    className={`flex-1 px-3 py-2.5 ${formGasto.forma === f ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}>
                    {f === 'debito' ? 'Débito / saldo' : 'Crédito'}
                  </button>
                ))}
              </div>
            )}

            {formGasto.medio && formGasto.forma === 'credito' && (
              <div className="flex items-center gap-2 text-xs text-secondary">
                <span>Cuotas:</span>
                <input type="number" min={1} max={48} value={formGasto.cuotas}
                  onChange={e => setFormGasto(p => ({ ...p, cuotas: e.target.value }))}
                  className="w-16 rounded border bg-field px-2 py-1.5 text-xs text-primary" />
              </div>
            )}

            {formGasto.medio && formGasto.forma === 'debito' && (
              <p className="text-xs text-secondary">Se descuenta del saldo disponible de {formGasto.medio}.</p>
            )}

            <label className="flex items-center gap-2 text-xs text-secondary">
              <input type="checkbox" checked={formGasto.es_gasto_hormiga}
                onChange={e => setFormGasto(p => ({ ...p, es_gasto_hormiga: e.target.checked }))} />
              Es un gasto hormiga
            </label>

            {error && <p className="text-xs text-negative">{error}</p>}

            {aviso ? (
              <>
                <p className="rounded-lg border p-3 text-xs text-secondary" style={{ borderColor: 'var(--accent-warning, #F5C451)' }}>
                  ⚠️ {aviso}
                </p>
                <div className="mt-1 flex gap-2">
                  <button onClick={onClose} className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
                    Listo
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-1 flex gap-2">
                <button onClick={guardarGasto} disabled={saving || !formGasto.nombre || !formGasto.monto}
                  className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar gasto'}
                </button>
                <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
              </div>
            )}
          </div>
        )}

        {tab === 'ingreso' && (
          <div className="flex flex-col gap-3">
            <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
              <button onClick={() => setSubIngreso('freelance')}
                className={`flex-1 px-3 py-2 ${subIngreso === 'freelance' ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}>
                🚀 Freelance / puntual
              </button>
              <button onClick={() => setSubIngreso('fijo')}
                className={`flex-1 px-3 py-2 ${subIngreso === 'fijo' ? 'bg-confirm text-white' : 'text-secondary hover:bg-alternate'}`}>
                💼 Sueldo fijo
              </button>
            </div>

            {subIngreso === 'freelance' ? (
              <>
                <input autoFocus placeholder="Cliente" value={formFreelance.cliente}
                  onChange={e => setFormFreelance(p => ({ ...p, cliente: e.target.value }))} className={inputCls} />
                <input placeholder="Descripción del proyecto (opcional)" value={formFreelance.descripcion}
                  onChange={e => setFormFreelance(p => ({ ...p, descripcion: e.target.value }))} className={inputCls} />
                <input placeholder="Monto total ($)" type="number" value={formFreelance.monto_total}
                  onChange={e => setFormFreelance(p => ({ ...p, monto_total: e.target.value }))} className={inputCls} />
                <input placeholder="Ya cobré ($) — opcional" type="number" value={formFreelance.monto_cobrado}
                  onChange={e => setFormFreelance(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />
                <input type="date" value={formFreelance.fecha}
                  onChange={e => setFormFreelance(p => ({ ...p, fecha: e.target.value }))} className={inputCls} />

                <div className="flex gap-2">
                  <select value={formFreelance.billetera} onChange={e => setFormFreelance(p => ({ ...p, billetera: e.target.value }))} className={`${inputCls} flex-1`}>
                    <option value="">Se deposita en… (opcional)</option>
                    {medios.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
                    {(['ARS', 'USD'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setFormFreelance(p => ({ ...p, moneda: m }))}
                        className={`px-2.5 ${formFreelance.moneda === m ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {formFreelance.billetera && (
                  <p className="text-xs text-secondary">Lo que marques como "ya cobré" se suma al saldo de {formFreelance.billetera}.</p>
                )}

                {error && <p className="text-xs text-negative">{error}</p>}
                {aviso && <p className="text-xs text-negative">{aviso}</p>}

                <div className="mt-1 flex gap-2">
                  <button onClick={guardarFreelance} disabled={saving || !formFreelance.cliente || !formFreelance.monto_total}
                    className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
                    {saving ? 'Guardando…' : 'Guardar ingreso'}
                  </button>
                  <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <input autoFocus placeholder="Nombre (ej. Trabajo principal)" value={formFijo.nombre}
                  onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))} className={inputCls} />
                <input placeholder="Sueldo normal ($)" type="number" value={formFijo.monto}
                  onChange={e => setFormFijo(p => ({ ...p, monto: e.target.value }))} className={inputCls} />
                <input placeholder="Cobrado este mes (opcional)" type="number" value={formFijo.monto_cobrado}
                  onChange={e => setFormFijo(p => ({ ...p, monto_cobrado: e.target.value }))} className={inputCls} />

                <div className="flex gap-2">
                  <select value={formFijo.billetera} onChange={e => setFormFijo(p => ({ ...p, billetera: e.target.value }))} className={`${inputCls} flex-1`}>
                    <option value="">Se deposita en… (opcional)</option>
                    {medios.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div className="flex overflow-hidden rounded-lg border text-xs font-semibold">
                    {(['ARS', 'USD'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setFormFijo(p => ({ ...p, moneda: m }))}
                        className={`px-2.5 ${formFijo.moneda === m ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-secondary">
                  Si ya existe un sueldo activo con este nombre, se actualiza en vez de duplicarse
                  {formFijo.billetera && ' (solo se acredita la diferencia contra lo ya cobrado antes)'}.
                </p>

                {error && <p className="text-xs text-negative">{error}</p>}
                {aviso && <p className="text-xs text-negative">{aviso}</p>}

                <div className="mt-1 flex gap-2">
                  <button onClick={guardarFijo} disabled={saving || !formFijo.nombre || !formFijo.monto}
                    className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
                    {saving ? 'Guardando…' : 'Guardar ingreso'}
                  </button>
                  <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
