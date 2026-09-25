'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { MARCAS } from '@/lib/tarjetas'
import { etiquetaMes, fmtDiaMes } from '@/lib/ciclos'
import type { ResumenInfo, TarjetaInfo } from '@/lib/resumenes'
import type { LineaSaldo } from '@/lib/patrimonio'
import { fmt } from './TarjetaVisual'

/* ── Modal genérico ─────────────────────────────────────────────── */

export function Modal({ titulo, onCerrar, children, ancho = 'max-w-lg' }: {
  titulo: ReactNode; onCerrar: () => void; children: ReactNode; ancho?: string
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev }
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog" aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={`fa-card flex max-h-[92vh] w-full ${ancho} flex-col overflow-hidden rounded-b-none sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 text-base font-bold text-primary">{titulo}</div>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded p-1.5 text-muted hover:bg-alternate hover:text-primary"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

const input = 'w-full rounded-lg border bg-field px-3 py-2.5 text-sm text-primary'
const label = 'mb-1 block text-xs font-semibold text-secondary'

/* ── Crear / editar tarjeta ─────────────────────────────────────── */

export interface DatosTarjeta {
  nombre: string; marca: string; limite: string; cierre: string; vencimiento: string; ultimos4: string
}

export function EditarTarjeta({ inicial, onGuardar, onCerrar, onBorrar }: {
  inicial?: TarjetaInfo
  onGuardar: (d: DatosTarjeta) => Promise<string | null>
  onCerrar: () => void
  onBorrar?: () => void
}) {
  const [d, setD] = useState<DatosTarjeta>({
    nombre: inicial?.nombre ?? '',
    marca: inicial?.marca ?? 'Visa',
    limite: inicial?.limite ? String(inicial.limite) : '',
    cierre: inicial?.cierre ? String(inicial.cierre) : '',
    vencimiento: inicial?.vencimiento ? String(inicial.vencimiento) : '',
    ultimos4: inicial?.ultimos4 ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!d.nombre.trim()) return setError('Poné un nombre.')
    const c = Number(d.cierre), v = Number(d.vencimiento)
    if (d.cierre && (c < 1 || c > 31)) return setError('El día de cierre va de 1 a 31.')
    if (d.vencimiento && (v < 1 || v > 31)) return setError('El día de vencimiento va de 1 a 31.')
    if (d.ultimos4 && !/^\d{4}$/.test(d.ultimos4)) return setError('Los últimos 4 son 4 números.')
    setGuardando(true)
    const e = await onGuardar(d)
    setGuardando(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo={inicial ? `Editar ${inicial.nombre}` : 'Nueva tarjeta'} onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={label} htmlFor="t-nombre">Nombre</label>
          <input id="t-nombre" autoFocus value={d.nombre} onChange={e => setD({ ...d, nombre: e.target.value })} placeholder="Ej: Visa Galicia" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="t-marca">Marca</label>
          <select id="t-marca" value={d.marca} onChange={e => setD({ ...d, marca: e.target.value })} className={input}>
            {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="t-limite">Límite ($)</label>
          <input id="t-limite" type="number" inputMode="numeric" value={d.limite} onChange={e => setD({ ...d, limite: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="t-cierre">Día de cierre</label>
          <input id="t-cierre" type="number" min={1} max={31} value={d.cierre} onChange={e => setD({ ...d, cierre: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="t-venc">Día de vencimiento</label>
          <input id="t-venc" type="number" min={1} max={31} value={d.vencimiento} onChange={e => setD({ ...d, vencimiento: e.target.value })} className={input} />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor="t-u4">Últimos 4 números (opcional)</label>
          <input id="t-u4" inputMode="numeric" maxLength={4} value={d.ultimos4} onChange={e => setD({ ...d, ultimos4: e.target.value.replace(/\D/g, '') })} className={input} />
          <p className="mt-1 text-[11px] text-muted">Solo para reconocerla. Nunca pongas el número completo.</p>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={guardar} disabled={guardando} className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCerrar} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
        {onBorrar && (
          <button onClick={onBorrar} className="ml-auto rounded-lg px-3 py-2.5 text-sm text-negative hover:bg-alternate">Eliminar tarjeta</button>
        )}
      </div>
    </Modal>
  )
}

/* ── Pagar un resumen ───────────────────────────────────────────── */

export function PagarResumen({ tarjeta, resumen, lineas, onPagar, onCerrar }: {
  tarjeta: TarjetaInfo
  resumen: ResumenInfo
  lineas: LineaSaldo[]
  onPagar: (lineaARS: string | null, lineaUSD: string | null) => Promise<string | null>
  onCerrar: () => void
}) {
  const { pendArs, pendUsd } = resumen.totales
  const ars = lineas.filter(l => l.moneda === 'ARS')
  const usd = lineas.filter(l => l.moneda === 'USD' && l.tipo !== 'cripto')
  const propia = (ls: LineaSaldo[]) =>
    ls.find(l => l.app.toLowerCase().replace(/\s/g, '') === tarjeta.nombre.toLowerCase().replace(/\s/g, '') && l.es_disponible)
    ?? ls.find(l => l.es_disponible) ?? ls[0]
  const [lARS, setLARS] = useState<string>(propia(ars)?.id ?? '')
  const [lUSD, setLUSD] = useState<string>(propia(usd)?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pagando, setPagando] = useState(false)

  const opcion = (l: LineaSaldo) => (
    <option key={l.id} value={l.id}>
      {(l.etiqueta || l.app)} · {l.nombre} ({l.moneda === 'USD' ? `US$ ${Number(l.monto).toLocaleString('es-AR')}` : fmt(Number(l.monto))})
    </option>
  )
  const saldoDe = (id: string) => Number(lineas.find(l => l.id === id)?.monto ?? 0)

  async function pagar() {
    setPagando(true)
    const e = await onPagar(pendArs > 0 ? lARS || null : null, pendUsd > 0 ? lUSD || null : null)
    setPagando(false)
    if (e) setError(e)
  }

  return (
    <Modal titulo={`Pagar resumen de ${tarjeta.nombre}`} onCerrar={onCerrar}>
      <p className="text-sm text-secondary">
        Resumen de {etiquetaMes(resumen.clave)} · cerró {fmtDiaMes(resumen.cierre)} · vence {fmtDiaMes(resumen.vencimiento)}
      </p>
      <div className="mt-4 space-y-4">
        {pendArs > 0 && (
          <div>
            <p className="fa-amount text-2xl text-primary">{fmt(pendArs)}</p>
            <label className={label} htmlFor="p-ars">Sale de</label>
            <select id="p-ars" value={lARS} onChange={e => setLARS(e.target.value)} className={input}>
              {ars.map(opcion)}
            </select>
            {lARS && saldoDe(lARS) < pendArs && (
              <p className="mt-1 text-xs text-negative">Esa cuenta tiene menos de lo que vas a pagar: va a quedar en negativo.</p>
            )}
          </div>
        )}
        {pendUsd > 0 && (
          <div>
            <p className="fa-amount text-2xl text-primary">US$ {pendUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</p>
            <label className={label} htmlFor="p-usd">Sale de</label>
            <select id="p-usd" value={lUSD} onChange={e => setLUSD(e.target.value)} className={input}>
              {usd.map(opcion)}
            </select>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">Se descuenta de esa cuenta y el resumen queda como pagado. Si te equivocás, lo podés deshacer desde el detalle de la tarjeta.</p>
      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={pagar} disabled={pagando} className="rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
          {pagando ? 'Pagando…' : 'Confirmar pago'}
        </button>
        <button onClick={onCerrar} className="rounded-lg px-4 py-2.5 text-sm text-secondary hover:bg-alternate">Cancelar</button>
      </div>
    </Modal>
  )
}
