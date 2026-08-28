'use client'
import { useState, useRef } from 'react'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { LucaAvatar, type LucaEstado } from '@/components/luca/LucaAvatar'

interface ParsedExpense {
  nombre: string
  monto: number
  categoria: string
  fecha: string
}

const FIELDS = [
  { label: 'Descripción', key: 'nombre' as const, type: 'text' },
  { label: 'Monto', key: 'monto' as const, type: 'number' },
  { label: 'Categoría', key: 'categoria' as const, type: 'text' },
  { label: 'Fecha', key: 'fecha' as const, type: 'date' },
]

const EJEMPLOS = [
  'Cobré $850.000 de sueldo',
  'Gasté $32.000 en supermercado',
  'Pagué $45.000 de tarjeta',
]

export function LucaWidget({ onSaved }: { onSaved?: () => void }) {
  const [input, setInput] = useState('')
  const [estado, setEstado] = useState<LucaEstado>('idle')
  const [parsed, setParsed] = useState<ParsedExpense | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  const cargando = estado === 'thinking' || estado === 'saving'

  const reset = () => {
    setParsed(null)
    setInput('')
    setEditando(false)
    setError('')
    setEstado('idle')
  }

  const parse = async () => {
    if (!input.trim()) return
    setEstado('thinking')
    setError('')
    try {
      const res = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data = await res.json()
      if (data?.nombre) {
        setParsed(data)
        setEstado('success')
      } else {
        setError('No pude entender ese movimiento. Probá con más detalle.')
        setEstado('error')
      }
    } catch {
      setError('No pude conectarme. Revisá tu conexión e intentá otra vez.')
      setEstado('error')
    }
  }

  const confirmar = async () => {
    if (!parsed) return
    setEstado('saving')
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: dbError } = await supabase.from('gastos_variables').insert({
        user_id: user?.id,
        nombre: parsed.nombre,
        monto: parsed.monto,
        categoria: parsed.categoria,
        fecha: parsed.fecha,
        es_gasto_hormiga: false,
      })
      if (dbError) throw dbError
      setEstado('celebration')
      onSaved?.()
      setTimeout(reset, 1900)
    } catch {
      setError('No se pudo guardar el movimiento.')
      setEstado('error')
    }
  }

  return (
    <section className="fa-card p-5">
      <div className="flex items-start gap-3">
        <LucaAvatar estado={estado} size={44} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-primary">Decile a Luca</h2>
          <p className="mt-0.5 text-xs text-secondary">
            Registrá gastos, ingresos o movimientos como si le hablaras a un amigo.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !cargando && !parsed && parse()}
          onFocus={() => estado === 'idle' && setEstado('listening')}
          onBlur={() => estado === 'listening' && setEstado('idle')}
          placeholder="Ej: Gasté $18.500 en una cena con amigos"
          disabled={cargando || !!parsed}
          className="min-w-0 flex-1 rounded-xl border bg-field px-4 py-3 text-sm text-primary disabled:opacity-60"
        />
        <button
          onClick={parse}
          disabled={cargando || !input.trim() || !!parsed}
          className="flex items-center justify-center gap-2 rounded-xl bg-confirm px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
        >
          <Send size={15} />
          {estado === 'thinking' ? 'Pensando…' : 'Enviar'}
        </button>
      </div>

      {!parsed && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted">Ejemplos:</span>
          {EJEMPLOS.map(ej => (
            <button
              key={ej}
              onClick={() => { setInput(ej); inputRef.current?.focus() }}
              className="rounded-full border px-3 py-1.5 text-[11px] text-secondary transition-colors hover:bg-alternate hover:text-primary"
            >
              + {ej}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-negative">{error}</p>}

      {estado === 'celebration' && (
        <p className="mt-3 text-xs font-semibold text-positive">✓ ¡Guardado!</p>
      )}

      {parsed && estado !== 'celebration' && (
        <div className="mt-4 rounded-xl border bg-alternate p-4">
          <p className="mb-3 text-sm text-primary">Luca entiende:</p>

          <dl className="text-xs">
            {FIELDS.map(({ label, key, type }, i) => (
              <div
                key={key}
                className={`flex items-center gap-4 py-2.5 ${i < FIELDS.length - 1 ? 'border-b' : ''}`}
              >
                <dt className="w-24 shrink-0 text-secondary">{label}:</dt>
                <dd className="min-w-0 flex-1 text-primary">
                  {editando ? (
                    <input
                      type={type}
                      value={String(parsed[key])}
                      onChange={e =>
                        setParsed(p =>
                          p ? { ...p, [key]: key === 'monto' ? Number(e.target.value) : e.target.value } : p
                        )
                      }
                      className="w-full rounded-lg border bg-field px-2 py-1.5 text-xs text-primary"
                    />
                  ) : key === 'monto' ? (
                    <span className="fa-amount">
                      ${Number(parsed.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    String(parsed[key])
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={confirmar}
              disabled={estado === 'saving'}
              className="rounded-lg bg-confirm px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
            >
              {estado === 'saving' ? 'Guardando…' : '✓ Confirmar'}
            </button>
            <button
              onClick={() => setEditando(e => !e)}
              className="rounded-lg border px-3.5 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-card"
            >
              {editando ? 'Listo' : 'Editar'}
            </button>
            <button
              onClick={reset}
              className="rounded-lg border px-3.5 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-card"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
