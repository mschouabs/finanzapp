'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Viaje } from '@/lib/viajes'

const EMOJIS = ['✈️', '🏖️', '🏔️', '🗺️', '🚗', '🚢', '🎒', '🏝️', '🗼', '🎿', '🛶', '🏕️']

/* Crea o edita un viaje. Si recibe `viaje`, arranca en modo edición. */
export function ViajeModal({
  viaje,
  onClose,
  onSaved,
}: {
  viaje?: Viaje
  onClose: () => void
  onSaved: () => void
}) {
  const editando = Boolean(viaje)

  const [nombre, setNombre] = useState(viaje?.nombre ?? '')
  const [emoji, setEmoji] = useState(viaje?.emoji ?? '✈️')
  const [destino, setDestino] = useState(viaje?.destino ?? '')
  const [inicio, setInicio] = useState(viaje?.fecha_inicio ?? '')
  const [fin, setFin] = useState(viaje?.fecha_fin ?? '')
  const [presupuesto, setPresupuesto] = useState(
    viaje?.presupuesto != null ? String(viaje.presupuesto) : ''
  )
  const [notas, setNotas] = useState(viaje?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!nombre.trim()) {
      setError('Poné un nombre al viaje.')
      return
    }
    if (inicio && fin && fin < inicio) {
      setError('La fecha de vuelta no puede ser anterior a la de ida.')
      return
    }

    setGuardando(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión vencida. Volvé a entrar.')

      const fila = {
        nombre: nombre.trim(),
        emoji,
        destino: destino.trim() || null,
        fecha_inicio: inicio || null,
        fecha_fin: fin || null,
        presupuesto: presupuesto ? Number(presupuesto) : null,
        notas: notas.trim() || null,
      }

      const { error: err } = editando
        ? await supabase.from('viajes').update(fila).eq('id', viaje!.id)
        : await supabase.from('viajes').insert({ ...fila, user_id: user.id })

      if (err) throw err

      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const input =
    'w-full rounded-md border bg-field px-3 py-2 text-sm text-primary placeholder:text-muted'
  const label = 'mb-1.5 block text-[11px] font-semibold text-secondary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10"
      onClick={onClose}
    >
      <div className="fa-card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-primary">
            {editando ? 'Editar viaje' : 'Nuevo viaje'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-1 text-secondary hover:bg-alternate hover:text-primary"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Emoji */}
          <div>
            <span className={label}>Ícono</span>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border text-lg transition-colors"
                  style={
                    emoji === e
                      ? {
                          borderColor: 'var(--accent-confirm)',
                          background: 'color-mix(in srgb, var(--accent-confirm) 14%, transparent)',
                        }
                      : undefined
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label} htmlFor="viaje-nombre">Nombre</label>
            <input
              id="viaje-nombre"
              className={input}
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Brasil 2026"
              autoFocus
            />
          </div>

          <div>
            <label className={label} htmlFor="viaje-destino">Destino</label>
            <input
              id="viaje-destino"
              className={input}
              value={destino}
              onChange={e => setDestino(e.target.value)}
              placeholder="Río de Janeiro"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="viaje-inicio">Ida</label>
              <input
                id="viaje-inicio"
                type="date"
                className={input}
                value={inicio}
                onChange={e => setInicio(e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="viaje-fin">Vuelta</label>
              <input
                id="viaje-fin"
                type="date"
                className={input}
                value={fin}
                onChange={e => setFin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="viaje-presupuesto">Presupuesto (ARS)</label>
            <input
              id="viaje-presupuesto"
              type="number"
              inputMode="decimal"
              className={input}
              value={presupuesto}
              onChange={e => setPresupuesto(e.target.value)}
              placeholder="1500000"
            />
            <p className="mt-1 text-[10px] text-muted">
              Opcional. Los gastos en otras monedas se convierten a pesos para compararlos.
            </p>
          </div>

          <div>
            <label className={label} htmlFor="viaje-notas">Notas</label>
            <textarea
              id="viaje-notas"
              className={`${input} min-h-[64px] resize-y`}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Vuelo AR1234, hotel reservado…"
            />
          </div>

          {error && <p className="text-xs text-negative">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear viaje'}
            </button>
            <button
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
