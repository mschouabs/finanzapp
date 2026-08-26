'use client'
import { useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

interface ParsedExpense {
  nombre: string
  monto: number
  categoria: string
  fecha: string
}

export function LucaWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedExpense | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const parse = async () => {
    if (!input.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data = await res.json()
      if (data.nombre) setParsed(data)
    } catch {
      // silent error
    }
    setLoading(false)
  }

  const confirm = async () => {
    if (!parsed) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('gastos_variables').insert({
        user_id: user?.id,
        nombre: parsed.nombre,
        monto: parsed.monto,
        categoria: parsed.categoria,
        fecha: parsed.fecha,
        es_gasto_hormiga: false,
      })
      setSaved(true)
      setTimeout(() => {
        setParsed(null)
        setInput('')
        setSaved(false)
        setOpen(false)
      }, 1500)
    } catch {
      // silent error
    }
    setSaving(false)
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 64,
    right: 0,
    width: 320,
    background: 'var(--bg-card, #161B22)',
    border: '1px solid var(--border-color, #30363D)',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    color: 'var(--text-primary, #C9D1D9)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    background: 'var(--bg-input, #21262D)',
    border: '1px solid var(--border-color, #30363D)',
    borderRadius: 7,
    color: 'var(--text-primary, #C9D1D9)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '8px 14px',
    background: 'var(--accent-confirm, #238636)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  }

  const btnSecondary: React.CSSProperties = {
    padding: '8px 12px',
    background: 'transparent',
    color: 'var(--text-muted, #6E7681)',
    border: '1px solid var(--border-color, #30363D)',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>ð° Luca</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6E7681)' }}>
              EscribÃ­ naturalmente para registrar un gasto
            </div>
          </div>

          {/* Input state */}
          {!parsed && !saved && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && parse()}
                placeholder='ej: "gastÃ© $500 en uber"'
                disabled={loading}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={parse}
                disabled={loading || !input.trim()}
                style={{ ...btnPrimary, opacity: loading || !input.trim() ? 0.5 : 1 }}
              >
                {loading ? '...' : 'â'}
              </button>
            </div>
          )}

          {/* Saved confirmation */}
          {saved && (
            <div style={{ textAlign: 'center', color: 'var(--accent-positive, #3FB950)', padding: '12px 0', fontSize: 15 }}>
              â Â¡Guardado!
            </div>
          )}

          {/* Result with editable fields */}
          {parsed && !saved && (
            <div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'DescripciÃ³n', key: 'nombre' as const },
                  { label: 'Monto ($)', key: 'monto' as const },
                  { label: 'CategorÃ­a', key: 'categoria' as const },
                  { label: 'Fecha', key: 'fecha' as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6E7681)', marginBottom: 3 }}>
                      {label}
                    </div>
                    <input
                      value={String(parsed[key])}
                      onChange={e =>
                        setParsed(p =>
                          p ? { ...p, [key]: key === 'monto' ? Number(e.target.value) : e.target.value } : p
                        )
                      }
                      type={key === 'monto' ? 'number' : key === 'fecha' ? 'date' : 'text'}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={confirm} disabled={saving} style={{ ...btnPrimary, flex: 1, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : 'â Confirmar'}
                </button>
                <button onClick={() => { setParsed(null); setInput('') }} style={btnSecondary}>
                  â
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => {
          setOpen(o => !o)
          if (!open) setTimeout(() => inputRef.current?.focus(), 150)
        }}
        title="Luca â Registrar gasto"
        aria-label="Abrir Luca"
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open ? 'var(--accent-negative, #FF7B72)' : 'var(--accent-confirm, #238636)',
          color: '#fff',
          border: 'none',
          fontSize: open ? 20 : 24,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 200ms',
        }}
      >
        {open ? 'â' : 'ð°'}
      </button>
    </div>
  )
}
