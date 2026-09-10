'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, MapPin, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ViajeModal } from '@/components/ViajeModal'
import {
  ETIQUETA_ESTADO,
  colorPresupuesto,
  duracionDias,
  estadoViaje,
  fmtCorto,
  fmtRango,
  type Viaje,
} from '@/lib/viajes'

export default function ViajesPage() {
  const [viajes, setViajes] = useState<Viaje[]>([])
  /** Gastado por viaje, ya normalizado a ARS por la base. */
  const [gastado, setGastado] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [verArchivados, setVerArchivados] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: vs }, { data: gs }] = await Promise.all([
        supabase
          .from('viajes')
          .select('*')
          .order('fecha_inicio', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase.from('viaje_gastos').select('viaje_id, monto_ars'),
      ])

      setViajes((vs ?? []) as Viaje[])

      const acum: Record<string, number> = {}
      for (const g of gs ?? []) {
        const row = g as { viaje_id: string; monto_ars: number | null }
        acum[row.viaje_id] = (acum[row.viaje_id] ?? 0) + (Number(row.monto_ars) || 0)
      }
      setGastado(acum)
    } catch {
      setViajes([])
      setGastado({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const visibles = viajes.filter(v => (verArchivados ? v.archivado : !v.archivado))
  const totalGastado = visibles.reduce((s, v) => s + (gastado[v.id] ?? 0), 0)
  const hayArchivados = viajes.some(v => v.archivado)

  if (loading) {
    return (
      <div className="fa-card p-8 text-center">
        <p className="text-sm text-secondary">Cargando viajes…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="fa-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-lg font-extrabold text-primary">✈️ Viajes</h1>
          <p className="mt-1 text-xs text-secondary">
            {visibles.length} {visibles.length === 1 ? 'viaje' : 'viajes'}
            {verArchivados && ' archivados'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
            Total gastado
          </div>
          <div className="fa-amount text-2xl text-primary">{fmtCorto(totalGastado)}</div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setModal(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover"
        >
          <Plus size={15} strokeWidth={2.5} />
          Nuevo viaje
        </button>
        {hayArchivados && (
          <button
            onClick={() => setVerArchivados(v => !v)}
            className="min-h-[44px] rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
          >
            {verArchivados ? 'Ver activos' : 'Ver archivados'}
          </button>
        )}
      </div>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div className="fa-card p-10 text-center">
          <div className="text-3xl">🗺️</div>
          <p className="mt-3 text-sm font-semibold text-primary">
            {verArchivados ? 'No hay viajes archivados' : 'Todavía no cargaste ningún viaje'}
          </p>
          {!verArchivados && (
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-secondary">
              Creá un viaje y después cargá cada gasto en la moneda en que lo pagaste.
              FinanzApp lo convierte a pesos para que veas el total real.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibles.map(v => {
            const total = gastado[v.id] ?? 0
            const pct = v.presupuesto ? (total / v.presupuesto) * 100 : 0
            const estado = ETIQUETA_ESTADO[estadoViaje(v)]
            const dias = duracionDias(v)

            return (
              <Link
                key={v.id}
                href={`/dashboard/viajes/${v.id}`}
                className="fa-card block p-5 transition-shadow hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-2xl">{v.emoji}</span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-primary">{v.nombre}</h2>
                      {v.destino && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-secondary">
                          <MapPin size={11} strokeWidth={2} />
                          {v.destino}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: estado.color,
                      background: `color-mix(in srgb, ${estado.color} 14%, transparent)`,
                    }}
                  >
                    {estado.label}
                  </span>
                </div>

                <p className="mt-3 flex items-center gap-1 text-[11px] text-muted">
                  <Calendar size={11} strokeWidth={2} />
                  {fmtRango(v.fecha_inicio, v.fecha_fin)}
                  {dias && ` · ${dias} ${dias === 1 ? 'día' : 'días'}`}
                </p>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="fa-amount text-lg text-primary">{fmtCorto(total)}</span>
                    {v.presupuesto != null && (
                      <span className="text-[11px] text-secondary">
                        de {fmtCorto(v.presupuesto)}
                      </span>
                    )}
                  </div>

                  {v.presupuesto != null && (
                    <>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full"
                        style={{ background: 'var(--border-color)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: colorPresupuesto(pct),
                          }}
                        />
                      </div>
                      <p
                        className="mt-1.5 text-[10px] font-medium"
                        style={{ color: colorPresupuesto(pct) }}
                      >
                        {pct > 100
                          ? `Te pasaste ${fmtCorto(total - v.presupuesto)}`
                          : `Queda ${fmtCorto(v.presupuesto - total)}`}
                      </p>
                    </>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {modal && <ViajeModal onClose={() => setModal(false)} onSaved={cargar} />}
    </div>
  )
}
