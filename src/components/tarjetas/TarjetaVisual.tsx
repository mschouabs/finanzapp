'use client'

/* ── Tarjeta "física" que se da vuelta + anillo de uso del límite ──
   Frente: marca, nombre, últimos 4, consumo del resumen abierto.
   Dorso: cierre, vencimiento, límite, disponible y deuda.
   Diseño genérico con el color de la marca (sin logos).             */

import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { COLORES_MARCA } from '@/lib/tarjetas'
import { diasEntre, fmtDiaMes } from '@/lib/ciclos'
import type { EstadoTarjeta } from '@/lib/resumenes'

export const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtCorto = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  : Math.abs(n) >= 1_000 ? `$${Math.round(n / 1_000)}K` : fmt(n)

export const colorTarjeta = (marca: string | null | undefined) => COLORES_MARCA[marca ?? ''] || '#475569'

export function TarjetaVisual({ e, onAbrir }: { e: EstadoTarjeta; onAbrir: () => void }) {
  const [dada, setDada] = useState(false)
  const t = e.tarjeta
  const color = colorTarjeta(t.marca)
  const hoy = new Date()
  const diasCierre = diasEntre(hoy, e.abierto.cierre)
  const fondo = `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)`

  const cara: React.CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: 16, padding: 18, color: '#fff',
    background: fondo, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
    boxShadow: '0 10px 28px rgba(0,0,0,.28)', overflow: 'hidden',
  }

  return (
    <div style={{ perspective: 1200 }} className="w-full">
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio: '1.586 / 1',
          transformStyle: 'preserve-3d', transition: 'transform .55s cubic-bezier(.2,.8,.2,1)',
          transform: dada ? 'rotateY(180deg)' : 'none',
        }}
      >
        {/* frente */}
        <button type="button" onClick={onAbrir} style={cara} className="text-left" aria-label={`Ver detalle de ${t.nombre}`}>
          {/* brillo decorativo */}
          <span aria-hidden="true" style={{ position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-75">{t.marca ?? 'Tarjeta'}</p>
              <p className="mt-0.5 text-lg font-bold leading-tight">{t.nombre}</p>
            </div>
            <span aria-hidden="true" style={{ width: 34, height: 26, borderRadius: 6, background: 'linear-gradient(135deg,#f5d77a,#c9a441)', opacity: .9 }} />
          </div>
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
            <p className="text-[10px] uppercase tracking-wide opacity-75">Resumen actual</p>
            <p className="fa-amount text-2xl">{fmt(e.abierto.totales.ars)}{e.abierto.totales.usd > 0 && <span className="text-sm"> + US$ {e.abierto.totales.usd.toLocaleString('es-AR')}</span>}</p>
            <div className="mt-1 flex items-center justify-between text-[11px] opacity-85">
              <span>{diasCierre >= 0 ? `Cierra en ${diasCierre} ${diasCierre === 1 ? 'día' : 'días'}` : 'Cerrado'} · vence {fmtDiaMes(e.abierto.vencimiento)}</span>
              <span className="font-mono tracking-widest">•••• {t.ultimos4 || '····'}</span>
            </div>
          </div>
        </button>

        {/* dorso */}
        <div style={{ ...cara, transform: 'rotateY(180deg)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 34, background: 'rgba(0,0,0,.45)' }} />
          <dl className="relative mt-12 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <Dato k="Cierre" v={fmtDiaMes(e.abierto.cierre)} />
            <Dato k="Vencimiento" v={fmtDiaMes(e.abierto.vencimiento)} />
            <Dato k="Límite" v={e.limite ? fmt(e.limite) : 'Sin cargar'} />
            <Dato k="Disponible" v={e.limite ? fmt(e.disponible) : '—'} />
            <Dato k="Deuda total" v={fmt(e.deuda)} />
            <Dato k="Cuotas futuras" v={fmt(e.cuotasFuturas)} />
          </dl>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDada(v => !v)}
        className="mx-auto mt-2 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted hover:bg-alternate hover:text-primary"
      >
        <RotateCw size={12} /> {dada ? 'Ver frente' : 'Dar vuelta'}
      </button>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="opacity-70">{k}</dt>
      <dd className="fa-amount text-sm">{v}</dd>
    </div>
  )
}

/* ── Anillo de uso del límite ─────────────────────────────────── */

export function AnilloLimite({ e, size = 108 }: { e: EstadoTarjeta; size?: number }) {
  const r = size / 2 - 9
  const circ = 2 * Math.PI * r
  const limite = e.limite || e.deuda || 1
  const segs = [
    { v: e.deudaCerrada, color: 'var(--accent-negative)', label: 'Resumen cerrado' },
    { v: e.deudaAbierta, color: 'var(--accent-warning, #F5C451)', label: 'Resumen actual' },
    { v: e.cuotasFuturas, color: 'var(--accent-violet, #8B5CF6)', label: 'Cuotas futuras' },
  ]
  let acum = 0
  const alerta = e.limite > 0 && e.usoPct >= 80

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={e.limite ? `Usaste ${Math.round(e.usoPct)}% del límite` : 'Sin límite cargado'}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-color)" strokeWidth="12" />
          {segs.map((s, i) => {
            const largo = Math.max(0, Math.min(s.v / limite, 1 - acum / circ)) * circ
            const el = largo > 0 ? (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="12"
                strokeDasharray={`${largo} ${circ}`} strokeDashoffset={-acum}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            ) : null
            acum += largo
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`fa-amount text-lg ${alerta ? 'text-negative' : 'text-primary'}`}>
            {e.limite ? `${Math.round(e.usoPct)}%` : '—'}
          </span>
          <span className="text-[10px] text-muted">del límite</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {segs.filter(s => s.v > 0).map(s => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate text-secondary">{s.label}</span>
            <span className="fa-amount text-primary">{fmtCorto(s.v)}</span>
          </li>
        ))}
        {e.limite > 0 && (
          <li className="flex items-center gap-2 border-t border-line pt-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--border-color)' }} />
            <span className="flex-1 truncate text-secondary">Disponible</span>
            <span className={`fa-amount ${e.disponible < 0 ? 'text-negative' : 'text-primary'}`}>{fmtCorto(e.disponible)}</span>
          </li>
        )}
        {alerta && <li className="text-[11px] font-semibold text-negative">⚠️ Usaste más del 80% del límite</li>}
      </ul>
    </div>
  )
}
