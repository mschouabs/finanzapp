'use client'
import { useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { LucaAvatar } from './luca/LucaAvatar'
import type { LucaEstado } from './luca/LucaAvatar'

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

export function LucaWidget({ onSaved }: { onSaved?: () => void }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedExpense | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Estado del avatar según el estado del widget
  const lucaEstado: LucaEstado = saved
    ? 'celebration'
    : error
    ? 'sad'
    : loading || saving
    ? 'thinking'
    : parsed
    ? 'idle'
    : 'idle'

  const reset = () => {
    setParsed(null)
    setInput('')
    setEditing(false)
    setError('')
  }

  const parse = async () => {
    if (!input.trim()) return
    setLoading(true)
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
      } else {
        setError('No pude entender ese gasto. Probá de nuevo con más detalle.')
      }
    } catch {
      setError('No pude conectarme. Revisá tu conexión e intentá otra vez.')
    }
    setLoading(false)
  }

  const confirm = async () => {
    if (!parsed) return
    setSaving(true)
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
      setSaved(true)
      onSaved?.()
      setTimeout(() => {
        reset()
        setSaved(false)
      }, 1800)
    } catch {
      setError('No se pudo guardar el gasto.')
    }
    setSaving(false)
  }

  return (
    <section className="fa-card p-6">
      {/* Avatar Luca */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative shrink-0">
          <LucaAvatar estado={lucaEstado} size={72} />
          {/* Indicador online */}
          <span className="absolute bottom-1 right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-primary leading-tight">Decile a Luca</h2>
          <p className="text-xs text-secondary mt-0.5">
            {saved
              ? '¡Guardado! 🎉'
              : error
              ? 'Mmm, no entendí bien...'
              : loading || saving
              ? 'Estoy pensando...'
              : parsed
              ? '¿Esto es correcto?'
              : 'Tu asistente de gastos IA'}
          </p>
        </div>
      </div>

      {/* Entrada */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && !parsed && parse()}
          placeholder="Ej: Gasté $87 en supermercado"
          disabled={loading || !!parsed}
          className="flex-1 px-3 py-3 text-xs rounded-md border bg-field text-primary disabled:opacity-60"
        />
        <div className="flex gap-3">
          <button
            onClick={parse}
            disabled={loading || !input.trim() || !!parsed}
            className="px-5 py-3 text-xs font-semibold rounded-md text-white bg-confirm hover:bg-confirm-hover disabled:opacity-50 transition-colors"
          >
            {loading ? 'Pensando…' : '✓ Enviar'}
          </button>
          <button
            onClick={reset}
            disabled={!input && !parsed}
            className="px-5 py-3 text-xs font-semibold rounded-md border text-secondary hover:bg-alternate disabled:opacity-40 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-xs text-negative">{error}</p>
      )}

      {saved && (
        <p className="mt-4 text-xs font-semibold text-positive">✓ ¡Guardado!</p>
      )}

      {/* Resultado interpretado */}
      {parsed && !saved && (
        <div className="mt-4 rounded-md border bg-alternate p-4">
          <p className="text-sm text-primary mb-3">💸 Luca entiende:</p>

          <dl className="text-xs">
            {FIELDS.map(({ label, key, type }, i) => (
              <div
                key={key}
                className={`flex items-center gap-4 py-2.5 ${
                  i < FIELDS.length - 1 ? 'border-b' : ''
                }`}
              >
                <dt className="text-secondary w-24 shrink-0">{label}:</dt>
                <dd className="flex-1 text-primary">
                  {editing ? (
                    <input
                      type={type}
                      value={String(parsed[key])}
                      onChange={e =>
                        setParsed(p =>
                          p
                            ? { ...p, [key]: key === 'monto' ? Number(e.target.value) : e.target.value }
                            : p
                        )
                      }
                      className="w-full px-2 py-1.5 rounded border bg-field text-primary text-xs"
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

          <div className="flex gap-2 mt-4">
            <button
              onClick={confirm}
              disabled={saving}
              className="px-3 py-2 text-[10px] font-semibold rounded-md text-white bg-confirm hover:bg-confirm-hover disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : '✓ Confirmar'}
            </button>
            <button
              onClick={() => setEditing(e => !e)}
              className="px-3 py-2 text-[10px] font-semibold rounded-md border text-secondary hover:bg-card transition-colors"
            >
              {editing ? 'Listo' : 'Editar'}
            </button>
            <button
              onClick={reset}
              className="px-3 py-2 text-[10px] font-semibold rounded-md border text-secondary hover:bg-card transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
