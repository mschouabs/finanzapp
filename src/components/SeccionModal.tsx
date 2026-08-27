'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  PLANTILLAS,
  normalizarCampos,
  esCampoFijo,
  labelAKey,
  type Campo,
  type CampoTipo,
  type Plantilla,
  type SeccionTipo,
} from '@/lib/secciones'

const EMOJIS = ['📁', '💼', '🏠', '💳', '📊', '🎯', '🚗', '🍽️', '✈️', '🏥', '🎓', '🛒']

const TIPOS: { id: SeccionTipo; label: string; ayuda: string }[] = [
  { id: 'ingreso', label: 'Ingreso', ayuda: 'Suma a tus ingresos en el resumen' },
  { id: 'gasto', label: 'Gasto', ayuda: 'Resta en el resumen' },
  { id: 'neutra', label: 'Neutra', ayuda: 'No afecta los totales' },
]

const TIPOS_CAMPO: { id: CampoTipo; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'number', label: 'Número' },
  { id: 'date', label: 'Fecha' },
  { id: 'select', label: 'Lista' },
  { id: 'textarea', label: 'Texto largo' },
]

export function SeccionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [paso, setPaso] = useState<1 | 2>(1)
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null)
  const [nombre, setNombre] = useState('')
  const [emoji, setEmoji] = useState('📁')
  const [tipo, setTipo] = useState<SeccionTipo>('neutra')
  const [campos, setCampos] = useState<Campo[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const elegirPlantilla = (p: Plantilla) => {
    setPlantilla(p)
    setNombre(p.nombre)
    setEmoji(p.emoji)
    setTipo(p.tipo)
    setCampos(p.campos.map(c => ({ ...c })))
    setPaso(2)
  }

  const renombrarCampo = (i: number, label: string) =>
    setCampos(cs => cs.map((c, j) => (j === i ? { ...c, label } : c)))

  const cambiarTipoCampo = (i: number, t: CampoTipo) =>
    setCampos(cs => cs.map((c, j) => (j === i ? { ...c, tipo: t } : c)))

  const cambiarOpciones = (i: number, raw: string) =>
    setCampos(cs =>
      cs.map((c, j) =>
        j === i ? { ...c, opciones: raw.split(',').map(s => s.trim()).filter(Boolean) } : c
      )
    )

  const borrarCampo = (i: number) =>
    setCampos(cs => cs.filter((_, j) => j !== i))

  const agregarCampo = () =>
    setCampos(cs => [...cs, { key: `campo_${cs.length + 1}`, label: '', tipo: 'text' }])

  const guardar = async () => {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) {
      setError('Poné un nombre para la sección.')
      return
    }
    const sinEtiqueta = campos.some(c => !esCampoFijo(c.key) && !c.label.trim())
    if (sinEtiqueta) {
      setError('Hay campos sin nombre. Completalos o borralos.')
      return
    }

    setGuardando(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('sin sesión')

      const { count } = await supabase
        .from('secciones')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { error: dbError } = await supabase.from('secciones').insert({
        user_id: user.id,
        nombre: nombreLimpio,
        emoji,
        tipo,
        plantilla: plantilla?.id ?? null,
        campos: normalizarCampos(campos),
        orden: count ?? 0,
      })
      if (dbError) throw dbError

      onCreated()
      onClose()
    } catch {
      setError('No se pudo crear la sección. Revisá que hayas corrido el SQL en Supabase.')
    }
    setGuardando(false)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fa-card w-full max-w-2xl p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-primary">
              {paso === 1 ? 'Nueva sección' : `${emoji} ${nombre || 'Nueva sección'}`}
            </h2>
            <p className="mt-1 text-xs text-secondary">
              {paso === 1
                ? 'Elegí desde dónde arrancar. Después podés cambiar todo.'
                : 'Ajustá el nombre, el tipo y los campos.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-1 text-secondary hover:bg-alternate hover:text-primary"
          >
            ✕
          </button>
        </div>

        {/* ── Paso 1: plantilla ── */}
        {paso === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {PLANTILLAS.map(p => (
              <button
                key={p.id}
                onClick={() => elegirPlantilla(p)}
                className="rounded-md border bg-alternate p-4 text-left transition-colors hover:border-confirm"
              >
                <div className="text-sm font-bold text-primary">
                  {p.emoji} {p.nombre}
                </div>
                <div className="mt-1 text-xs text-secondary">{p.descripcion}</div>
                <div className="mt-2 text-[10px] text-muted">
                  {p.campos.map(c => c.label).join(' · ')}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Paso 2: detalle ── */}
        {paso === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-secondary">
                  Nombre
                </label>
                <input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full rounded-md border bg-field px-3 py-2 text-xs text-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-secondary">
                  Ícono
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`h-8 w-8 rounded-md border text-sm transition-colors ${
                        emoji === e ? 'border-confirm bg-alternate' : 'hover:bg-alternate'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-secondary">
                ¿Cómo afecta al resumen?
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {TIPOS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      tipo === t.id ? 'border-confirm bg-alternate' : 'hover:bg-alternate'
                    }`}
                  >
                    <div className="text-xs font-bold text-primary">{t.label}</div>
                    <div className="mt-0.5 text-[10px] text-muted">{t.ayuda}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-secondary">Campos</label>
                <button
                  onClick={agregarCampo}
                  className="rounded-md border px-2.5 py-1 text-[10px] font-semibold text-secondary hover:bg-alternate"
                >
                  + Agregar campo
                </button>
              </div>

              <div className="space-y-2">
                {campos.map((c, i) => {
                  const fijo = esCampoFijo(c.key)
                  return (
                    <div key={i} className="rounded-md border bg-alternate p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={c.label}
                          onChange={e => renombrarCampo(i, e.target.value)}
                          disabled={fijo}
                          placeholder="Nombre del campo"
                          className="min-w-0 flex-1 rounded border bg-field px-2 py-1.5 text-xs text-primary disabled:opacity-60"
                        />
                        <select
                          value={c.tipo}
                          onChange={e => cambiarTipoCampo(i, e.target.value as CampoTipo)}
                          disabled={fijo}
                          className="rounded border bg-field px-2 py-1.5 text-xs text-primary disabled:opacity-60"
                        >
                          {TIPOS_CAMPO.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                        {fijo ? (
                          <span className="px-1 text-[10px] text-muted">obligatorio</span>
                        ) : (
                          <button
                            onClick={() => borrarCampo(i)}
                            aria-label={`Borrar campo ${c.label || i + 1}`}
                            className="rounded px-2 py-1 text-xs text-negative hover:bg-card"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {c.tipo === 'select' && !fijo && (
                        <input
                          value={(c.opciones ?? []).join(', ')}
                          onChange={e => cambiarOpciones(i, e.target.value)}
                          placeholder="Opciones separadas por coma"
                          className="mt-2 w-full rounded border bg-field px-2 py-1.5 text-[11px] text-primary"
                        />
                      )}

                      {!fijo && c.label.trim() && (
                        <div className="mt-1.5 text-[10px] text-muted">
                          se guarda como <code>{labelAKey(c.label)}</code>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {error && <p className="text-xs text-negative">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
              >
                {guardando ? 'Creando…' : '✓ Crear sección'}
              </button>
              <button
                onClick={() => setPaso(1)}
                className="rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
              >
                ← Cambiar plantilla
              </button>
              <button
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
