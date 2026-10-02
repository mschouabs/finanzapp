'use client'

/* ── Snapshot compartido ──────────────────────────────────────────
   El encabezado (búsqueda + avisos de Luca) y el Resumen usan los
   mismos datos. En vez de pedirlos dos veces, se comparte la misma
   carga durante un minuto. Cualquier cambio de datos (EVENTO_DATOS)
   la invalida.                                                      */

import { createClient } from '@/lib/supabase'
import { EVENTO_DATOS } from '@/lib/eventos'
import { cargarSnapshot, type Snapshot } from './nucleo'

const VIGENCIA = 60_000
let cache: { t: number; p: Promise<Snapshot> } | null = null

/** Devuelve el snapshot vigente o lo carga. `fresco` fuerza una carga nueva. */
export function snapshotCompartido(fresco = false): Promise<Snapshot> {
  if (!fresco && cache && Date.now() - cache.t < VIGENCIA) return cache.p
  const p = cargarSnapshot(createClient())
  const entrada = { t: Date.now(), p }
  cache = entrada
  p.catch(() => { if (cache === entrada) cache = null })
  return p
}

export function invalidarSnapshot() { cache = null }

if (typeof window !== 'undefined') window.addEventListener(EVENTO_DATOS, invalidarSnapshot)
