'use client'

/* ── Luca en la barra lateral ─────────────────────────────────────
   En vez de un saludo fijo, muestra lo más importante que Luca ve hoy
   (el mismo insight que encabeza el Resumen), con su acción.          */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LucaAvatar } from './LucaAvatar'
import { useAlCambiarDatos } from '@/lib/eventos'
import { snapshotCompartido } from '@/lib/finanzas/compartido'
import { insightsDe } from '@/lib/finanzas/insights'
import type { Snapshot } from '@/lib/finanzas/nucleo'

export function LucaLateral() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const cargar = useCallback(() => { snapshotCompartido().then(setSnap).catch(() => {}) }, [])
  useEffect(() => { cargar() }, [cargar])
  useAlCambiarDatos(cargar)

  const top = useMemo(() => (snap ? insightsDe(snap).sort((a, b) => b.prioridad - a.prioridad)[0] : null), [snap])
  const href = top?.accion ? (top.accion.href.startsWith('#') ? `/dashboard${top.accion.href}` : top.accion.href) : null

  return (
    <div className="fa-panel mt-6 p-4">
      <div className="flex items-center gap-2.5">
        <LucaAvatar estado={top?.estado ?? 'idle'} size={40} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-primary">Luca</p>
          <p className="text-[10px] text-secondary">{top ? 'Lo más importante hoy' : 'Revisando tus números…'}</p>
        </div>
      </div>
      {top && (
        <p className="mt-3 text-xs leading-snug text-primary">{top.titulo}</p>
      )}
      {top && href && (
        <Link href={href} className="mt-1.5 inline-block text-[11px] font-semibold text-info hover:underline">{top.accion!.label} →</Link>
      )}
      <Link href="/dashboard/luca"
        className="fa-press mt-3 block rounded-lg border px-3 py-2 text-center text-xs font-semibold hover:bg-alternate"
        style={{ borderColor: 'var(--accent-confirm)', color: 'var(--accent-confirm)' }}>
        Hablar con Luca
      </Link>
    </div>
  )
}
