'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { guardarGastoVariable, listarMediosDePago } from '@/lib/movimientos'
import { LucaAvatar } from './luca/LucaAvatar'
import type { LucaEstado } from './luca/LucaAvatar'
import { Mic } from 'lucide-react'

interface ParsedExpense {
  nombre: string
  monto: number
  categoria: string
  fecha: string
  medio_pago?: string
  forma_pago?: 'debito' | 'credito'
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
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const supabase = createClient()
  const [medios, setMedios] = useState<string[]>([])

  useEffect(() => {
    listarMediosDePago(supabase).then(setMedios).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function toggleVoz() {
    if (grabando) {
      mediaRecorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setGrabando(false)
        setTranscribiendo(true)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const fd = new FormData()
          fd.append('audio', blob, 'audio.webm')
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
          const json = await res.json()
          if (json.text) {
            setInput(json.text)
            setTimeout(() => inputRef.current?.focus(), 50)
          }
        } catch { /* silencioso */ }
        setTranscribiendo(false)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setGrabando(true)
    } catch { /* sin permiso */ }
  }

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
      const res = await fetch('/api/ai', {
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
      if (!user) throw new Error('sin sesión')
      const { error: dbError } = await guardarGastoVariable(supabase, user.id, {
        nombre: parsed.nombre,
        monto: Number(parsed.monto),
        categoria: parsed.categoria,
        fecha: parsed.fecha,
        medio_pago: parsed.medio_pago,
        forma_pago: parsed.forma_pago,
      })
      if (dbError) throw new Error(dbError)
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

      {/* Transcribiendo indicator */}
      {transcribiendo && (
        <p className="mb-2 text-xs text-secondary animate-pulse">Transcribiendo audio…</p>
      )}

      {/* Entrada */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="flex flex-1 gap-2">
          <button
            onClick={toggleVoz}
            disabled={loading || !!parsed || transcribiendo}
            title={grabando ? 'Detener grabación' : 'Grabar audio'}
            className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
              grabando
                ? 'border-red-500 bg-red-500/10 text-red-500 animate-pulse'
                : 'border-border text-secondary hover:bg-alternate'
            }`}
          >
            <Mic size={16} />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && !parsed && parse()}
            placeholder="Ej: Gasté $87 en supermercado"
            disabled={loading || !!parsed}
            className="flex-1 px-3 py-3 text-xs rounded-md border bg-field text-primary disabled:opacity-60"
          />
        </div>
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
            {/* Con qué pagaste */}
            <div className="flex items-center gap-4 border-t py-2.5">
              <dt className="text-secondary w-24 shrink-0">Pagado con:</dt>
              <dd className="flex flex-1 flex-wrap items-center gap-2 text-primary">
                <select
                  value={parsed.medio_pago ?? ''}
                  onChange={e => setParsed(p => p ? {
                    ...p,
                    medio_pago: e.target.value || undefined,
                    forma_pago: e.target.value ? (p.forma_pago ?? 'debito') : undefined,
                  } : p)}
                  className="rounded border bg-field px-2 py-1.5 text-xs text-primary"
                >
                  <option value="">Efectivo / sin especificar</option>
                  {Array.from(new Set([...(parsed.medio_pago ? [parsed.medio_pago] : []), ...medios])).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {parsed.medio_pago && (
                  <div className="flex overflow-hidden rounded border text-[10px] font-semibold">
                    {(['debito', 'credito'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setParsed(p => p ? { ...p, forma_pago: f } : p)}
                        className={`px-2 py-1.5 ${(parsed.forma_pago ?? 'debito') === f ? 'bg-confirm text-white' : 'text-secondary hover:bg-card'}`}
                      >
                        {f === 'debito' ? 'Débito / saldo' : 'Crédito'}
                      </button>
                    ))}
                  </div>
                )}
              </dd>
            </div>
          </dl>

          {parsed.medio_pago && (parsed.forma_pago ?? 'debito') === 'debito' && (
            <p className="mt-2 text-[11px] text-secondary">
              Se descuenta del saldo disponible de {parsed.medio_pago}.
            </p>
          )}

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
