'use client'

/* ── Libro de tus cuentas ─────────────────────────────────────────
   Cada peso que entró o salió de tus cuentas, con el motivo y cómo
   quedó el saldo. Lo escribe la base (no se puede editar a mano), y
   abajo se verifica que la suma del libro dé tus saldos.            */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, CreditCard, LineChart, PenLine, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Confirmar, Encabezado, Toasts, useToasts } from '@/components/resumen/base'
import { EVENTO_DATOS, useAlCambiarDatos } from '@/lib/eventos'
import { cuentasQueNoCuadran, deshacerMovimiento, sePuedeDeshacer, ultimosMovimientos, type Movimiento } from '@/lib/libro'
import type { LineaSaldo } from '@/lib/patrimonio'

const ICONO: Record<string, { Icono: typeof Check; color: string; label: string }> = {
  gasto: { Icono: ArrowUpRight, color: 'var(--accent-negative)', label: 'Gasto' },
  ingreso: { Icono: ArrowDownLeft, color: 'var(--accent-positive)', label: 'Ingreso' },
  transferencia: { Icono: ArrowLeftRight, color: 'var(--accent-secondary)', label: 'Transferencia' },
  inversion: { Icono: LineChart, color: 'var(--accent-violet)', label: 'Inversión' },
  pago_tarjeta: { Icono: CreditCard, color: 'var(--accent-warning)', label: 'Pago de tarjeta' },
  deshacer: { Icono: RotateCcw, color: 'var(--text-muted)', label: 'Deshecho' },
  ajuste: { Icono: PenLine, color: 'var(--text-muted)', label: 'Ajuste manual' },
  apertura: { Icono: Check, color: 'var(--text-muted)', label: 'Saldo inicial' },
  cierre: { Icono: Check, color: 'var(--text-muted)', label: 'Cuenta cerrada' },
}

function fmtMonto(n: number, moneda: string, signo = false) {
  const s = signo ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''
  const abs = Math.abs(n)
  if (moneda === 'USD') return `${s}US$ ${abs.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  if (moneda === 'BTC') return `${s}₿ ${abs.toLocaleString('es-AR', { maximumFractionDigits: 8 })}`
  return `${s}$${Math.round(abs).toLocaleString('es-AR')}`
}

function cuando(iso: string) {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora}`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function LibroCuentas({ lineas, oculto = false }: { lineas: LineaSaldo[]; oculto?: boolean }) {
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [disponible, setDisponible] = useState(true)
  const [noCuadran, setNoCuadran] = useState<number | null>(null)
  const [cuenta, setCuenta] = useState('')
  const [limite, setLimite] = useState(15)
  const [aDeshacer, setADeshacer] = useState<Movimiento | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const toasts = useToasts()

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [r, n] = await Promise.all([
      ultimosMovimientos(supabase, { cuentaId: cuenta || undefined, limite }),
      cuentasQueNoCuadran(supabase),
    ])
    setMovs(r.movimientos); setDisponible(r.disponible); setNoCuadran(n)
  }, [cuenta, limite])
  useEffect(() => { cargar() }, [cargar])
  useAlCambiarDatos(cargar)

  const nombre = useMemo(() => {
    const m = new Map(lineas.map(l => [l.id, `${l.etiqueta || l.app} · ${l.nombre}`]))
    return (id: string) => m.get(id) ?? 'Cuenta eliminada'
  }, [lineas])

  async function confirmarDeshacer(m: Movimiento) {
    setTrabajando(true)
    const { error } = await deshacerMovimiento(createClient(), m.id)
    setTrabajando(false)
    setADeshacer(null)
    if (error) { toasts.mostrar({ texto: error, tono: 'error' }, 6000); return }
    toasts.mostrar({ texto: m.tipo === 'gasto' ? 'Listo: borré el gasto y la plata volvió a la cuenta.' : 'Listo: los saldos volvieron a como estaban.' }, 5000)
    window.dispatchEvent(new Event(EVENTO_DATOS))
  }

  if (!disponible) return null

  return (
    <section aria-labelledby="t-libro" className="flex flex-col gap-3">
      <Encabezado id="t-libro" titulo="Libro de tus cuentas"
        sub="Cada movimiento de plata, con su motivo y cómo quedó el saldo"
        derecha={
          <>
            <label htmlFor="libro-cuenta" className="sr-only">Cuenta</label>
            <select id="libro-cuenta" value={cuenta} onChange={e => { setCuenta(e.target.value); setLimite(15) }}
              className="h-9 max-w-[220px] rounded-lg border bg-field px-2.5 text-xs text-secondary">
              <option value="">Todas las cuentas</option>
              {lineas.map(l => <option key={l.id} value={l.id}>{l.etiqueta || l.app} · {l.nombre}</option>)}
            </select>
          </>
        } />

      <div className="fa-panel overflow-hidden">
        {movs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-secondary">Todavía no hay movimientos registrados{cuenta ? ' en esta cuenta' : ''}.</p>
        ) : (
          <ul className="divide-y fa-hairline">
            {movs.map(m => {
              const i = ICONO[m.tipo] ?? ICONO.ajuste
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-hidden="true"
                    style={{ background: `color-mix(in srgb, ${i.color} 14%, transparent)`, color: i.color }}>
                    <i.Icono size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-primary">{m.descripcion || i.label}</p>
                    <p className="truncate text-[11px] text-muted">{cuando(m.fecha)} · {cuenta ? i.label : nombre(m.cuenta_id)}</p>
                  </div>
                  {sePuedeDeshacer(m, movs) && (
                    <button onClick={() => setADeshacer(m)} aria-label={`Deshacer: ${m.descripcion || i.label}`} title="Deshacer"
                      className="fa-press grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-alternate hover:text-primary">
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold tabular-nums ${m.delta > 0 && m.tipo !== 'apertura' ? 'text-positive' : 'text-primary'}`}>
                      {oculto ? '••••' : fmtMonto(Number(m.delta), m.moneda, true)}
                    </p>
                    <p className="text-[10px] tabular-nums text-muted">quedó {oculto ? '••••' : fmtMonto(Number(m.saldo_resultante), m.moneda)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs fa-hairline">
          {noCuadran === 0 ? (
            <span className="flex items-center gap-1.5 text-positive"><Check size={13} strokeWidth={3} /> Todo cuadra: la suma del libro da tus saldos</span>
          ) : noCuadran ? (
            <span style={{ color: 'var(--accent-warning)' }}>{noCuadran} {noCuadran === 1 ? 'cuenta no cuadra' : 'cuentas no cuadran'} con el libro</span>
          ) : <span />}
          {movs.length >= limite && (
            <button onClick={() => setLimite(n => n + 30)} className="fa-press h-8 rounded-lg px-3 font-semibold text-info hover:bg-alternate">Ver más</button>
          )}
        </div>
      </div>

      {aDeshacer && (
        <Confirmar titulo="¿Deshacer este movimiento?" accion={trabajando ? 'Deshaciendo…' : 'Deshacer'} peligro={aDeshacer.tipo === 'gasto'}
          detalle={aDeshacer.tipo === 'transferencia'
            ? <>La plata vuelve a la cuenta de origen ({fmtMonto(Math.abs(Number(aDeshacer.delta)), aDeshacer.moneda)}).</>
            : aDeshacer.tipo === 'gasto'
              ? <>Se borra el gasto «{aDeshacer.descripcion}» y {fmtMonto(Math.abs(Number(aDeshacer.delta)), aDeshacer.moneda)} vuelven a {nombre(aDeshacer.cuenta_id)}.</>
              : <>El saldo de {nombre(aDeshacer.cuenta_id)} vuelve a como estaba antes de este ajuste.</>}
          onConfirmar={() => { if (!trabajando) confirmarDeshacer(aDeshacer) }} onCancelar={() => setADeshacer(null)} />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </section>
  )
}
