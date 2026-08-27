'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  esCampoFijo,
  fmtMonto,
  formatearValor,
  type Campo,
  type Registro,
  type Seccion,
} from '@/lib/secciones'

type Borrador = Record<string, string>

const vacio = (campos: Campo[]): Borrador =>
  Object.fromEntries(campos.map(c => [c.key, '']))

export default function SeccionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [seccion, setSeccion] = useState<Seccion | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState<Borrador>({})
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()

      const { data: sec, error: e1 } = await supabase
        .from('secciones')
        .select('*')
        .eq('id', id)
        .single()
      if (e1 || !sec) throw e1 ?? new Error('no existe')

      const { data: regs, error: e2 } = await supabase
        .from('seccion_registros')
        .select('*')
        .eq('seccion_id', id)
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (e2) throw e2

      setSeccion(sec as Seccion)
      setRegistros((regs ?? []) as Registro[])
      setForm(vacio((sec as Seccion).campos))
    } catch {
      setError('No pude cargar esta sección.')
    }
    setLoading(false)
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  const resetForm = () => {
    if (seccion) setForm(vacio(seccion.campos))
    setEditando(null)
    setAbierto(false)
  }

  const guardar = async () => {
    if (!seccion) return
    setGuardando(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const datos: Record<string, string> = {}
      for (const c of seccion.campos) {
        if (!esCampoFijo(c.key)) datos[c.key] = form[c.key] ?? ''
      }

      const fila = {
        seccion_id: seccion.id,
        user_id: user?.id,
        datos,
        monto: form.monto === '' || form.monto == null ? null : Number(form.monto),
        fecha: form.fecha || null,
      }

      const { error: dbError } = editando
        ? await supabase.from('seccion_registros').update(fila).eq('id', editando)
        : await supabase.from('seccion_registros').insert(fila)
      if (dbError) throw dbError

      resetForm()
      await cargar()
    } catch {
      setError('No se pudo guardar el registro.')
    }
    setGuardando(false)
  }

  const editar = (r: Registro) => {
    if (!seccion) return
    const b: Borrador = {}
    for (const c of seccion.campos) {
      if (c.key === 'monto') b.monto = r.monto == null ? '' : String(r.monto)
      else if (c.key === 'fecha') b.fecha = r.fecha ?? ''
      else b[c.key] = String(r.datos?.[c.key] ?? '')
    }
    setForm(b)
    setEditando(r.id)
    setAbierto(true)
  }

  const borrar = async (rid: string) => {
    setError('')
    try {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('seccion_registros')
        .delete()
        .eq('id', rid)
      if (dbError) throw dbError
      setRegistros(rs => rs.filter(r => r.id !== rid))
    } catch {
      setError('No se pudo borrar el registro.')
    }
  }

  const borrarSeccion = async () => {
    if (!seccion) return
    setError('')
    try {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('secciones')
        .delete()
        .eq('id', seccion.id)
      if (dbError) throw dbError
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('No se pudo borrar la sección.')
    }
  }

  if (loading) {
    return <p className="p-12 text-center text-sm text-muted">Cargando…</p>
  }

  if (!seccion) {
    return (
      <div className="fa-card p-8 text-center">
        <p className="text-sm text-primary">Esta sección no existe.</p>
        <p className="mt-2 text-xs text-secondary">
          Puede que la hayas borrado desde otra pestaña.
        </p>
      </div>
    )
  }

  const total = registros.reduce((s, r) => s + (Number(r.monto) || 0), 0)
  const signo = seccion.tipo === 'gasto' ? 'text-negative' : seccion.tipo === 'ingreso' ? 'text-positive' : 'text-primary'

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="fa-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h1 className="text-lg font-extrabold text-primary">
            {seccion.emoji} {seccion.nombre}
          </h1>
          <p className="mt-1 text-xs text-secondary">
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
            {seccion.tipo !== 'neutra' && ` · cuenta como ${seccion.tipo} en el resumen`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
            Total
          </div>
          <div className={`fa-amount text-2xl ${signo}`}>{fmtMonto(total)}</div>
        </div>
      </div>

      {error && <p className="text-xs text-negative">{error}</p>}

      {/* Alta / edición */}
      <div className="fa-card p-5">
        {!abierto ? (
          <button
            onClick={() => setAbierto(true)}
            className="rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover"
          >
            + Agregar registro
          </button>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-primary">
              {editando ? 'Editar registro' : 'Nuevo registro'}
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {seccion.campos.map(c => (
                <div key={c.key} className={c.tipo === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">
                    {c.label}
                  </label>

                  {c.tipo === 'select' ? (
                    <select
                      value={form[c.key] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                      className="w-full rounded-md border bg-field px-3 py-2 text-xs text-primary"
                    >
                      <option value="">—</option>
                      {(c.opciones ?? []).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : c.tipo === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={form[c.key] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                      className="w-full rounded-md border bg-field px-3 py-2 text-xs text-primary"
                    />
                  ) : (
                    <input
                      type={c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'text'}
                      step={c.tipo === 'number' ? '0.01' : undefined}
                      value={form[c.key] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                      className="w-full rounded-md border bg-field px-3 py-2 text-xs text-primary"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : editando ? '✓ Guardar cambios' : '✓ Agregar'}
              </button>
              <button
                onClick={resetForm}
                className="rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="fa-card overflow-hidden">
        {registros.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted">
            Todavía no cargaste nada acá.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-alternate">
                <tr>
                  {seccion.campos.map(c => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap border-b px-3 py-3 font-semibold text-secondary ${
                        c.key === 'monto' ? 'text-right' : ''
                      }`}
                    >
                      {c.label.toUpperCase()}
                    </th>
                  ))}
                  <th className="border-b px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} className="hover:bg-alternate">
                    {seccion.campos.map(c => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap border-b px-3 py-3 text-primary ${
                          c.key === 'monto' ? `fa-amount text-right ${signo}` : ''
                        }`}
                      >
                        {formatearValor(c, r)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap border-b px-3 py-3 text-right">
                      <button
                        onClick={() => editar(r)}
                        className="rounded px-2 py-1 text-secondary hover:bg-card hover:text-primary"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => borrar(r.id)}
                        className="ml-1 rounded px-2 py-1 text-negative hover:bg-card"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zona de peligro */}
      <details className="fa-card p-4">
        <summary className="cursor-pointer text-xs font-semibold text-secondary">
          Opciones de la sección
        </summary>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={borrarSeccion}
            className="rounded-md border px-3 py-2 text-xs font-semibold text-negative hover:bg-alternate"
          >
            Borrar sección
          </button>
          <span className="text-[10px] text-muted">
            Se borran también sus {registros.length} registros. No se puede deshacer.
          </span>
        </div>
      </details>
    </div>
  )
}
