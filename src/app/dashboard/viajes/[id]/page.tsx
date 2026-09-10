'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Pencil, Archive, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ViajeModal } from '@/components/ViajeModal'
import {
  CATEGORIAS_VIAJE,
  ETIQUETA_ESTADO,
  MONEDAS,
  colorPresupuesto,
  duracionDias,
  estadoViaje,
  fmtARS,
  fmtCorto,
  fmtFecha,
  fmtMonedaOriginal,
  fmtRango,
  getCategoriaViaje,
  getMoneda,
  type Viaje,
  type ViajeGasto,
} from '@/lib/viajes'

const hoyISO = () => new Date().toISOString().split('T')[0]

const formVacio = () => ({
  concepto: '',
  monto: '',
  moneda: 'ARS',
  tipo_cambio: '1',
  categoria: 'varios',
  fecha: hoyISO(),
  notas: '',
})

export default function ViajeDetallePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [gastos, setGastos] = useState<ViajeGasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(formVacio())
  const [abierto, setAbierto] = useState(false)
  const [editandoGasto, setEditandoGasto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [editarViaje, setEditarViaje] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  /** Cotización sugerida del dólar, solo como valor inicial editable. */
  const [dolarBlue, setDolarBlue] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()

      const [{ data: v, error: e1 }, { data: gs, error: e2 }] = await Promise.all([
        supabase.from('viajes').select('*').eq('id', id).single(),
        supabase
          .from('viaje_gastos')
          .select('*')
          .eq('viaje_id', id)
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      if (e1) throw e1
      if (e2) throw e2

      setViaje(v as Viaje)
      setGastos((gs ?? []) as ViajeGasto[])
    } catch {
      setViaje(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  // La cotización es solo una sugerencia: si falla, el campo queda en blanco
  // y el usuario pone el cambio que realmente pagó.
  useEffect(() => {
    fetch('/api/dolar')
      .then(r => r.json())
      .then(d => setDolarBlue(d?.blue ?? d?.oficial ?? null))
      .catch(() => setDolarBlue(null))
  }, [])

  /* ── Totales ── */
  const total = useMemo(
    () => gastos.reduce((s, g) => s + (Number(g.monto_ars) || 0), 0),
    [gastos]
  )

  const porCategoria = useMemo(() => {
    const acum: Record<string, number> = {}
    for (const g of gastos) acum[g.categoria] = (acum[g.categoria] ?? 0) + (Number(g.monto_ars) || 0)
    return Object.entries(acum)
      .map(([key, monto]) => ({ ...getCategoriaViaje(key), monto }))
      .sort((a, b) => b.monto - a.monto)
  }, [gastos])

  const equivalenteARS = useMemo(() => {
    const m = Number(form.monto)
    const tc = Number(form.tipo_cambio)
    if (!m || !tc) return null
    return m * tc
  }, [form.monto, form.tipo_cambio])

  /* ── Acciones ── */
  function cambiarMoneda(codigo: string) {
    setForm(f => ({
      ...f,
      moneda: codigo,
      tipo_cambio:
        codigo === 'ARS' ? '1' : codigo === 'USD' && dolarBlue ? String(dolarBlue) : '',
    }))
  }

  function abrirNuevo() {
    setForm(formVacio())
    setEditandoGasto(null)
    setAbierto(true)
  }

  function abrirEdicion(g: ViajeGasto) {
    setForm({
      concepto: g.concepto,
      monto: String(g.monto),
      moneda: g.moneda,
      tipo_cambio: String(g.tipo_cambio),
      categoria: g.categoria,
      fecha: g.fecha,
      notas: g.notas ?? '',
    })
    setEditandoGasto(g.id)
    setAbierto(true)
  }

  async function guardarGasto() {
    if (!form.concepto.trim()) return setError('Poné un concepto.')
    if (!form.monto || Number(form.monto) <= 0) return setError('El monto tiene que ser mayor a cero.')
    const tc = Number(form.tipo_cambio)
    if (!tc || tc <= 0) return setError('Poné el tipo de cambio que pagaste.')

    setGuardando(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión vencida. Volvé a entrar.')

      const fila = {
        concepto: form.concepto.trim(),
        categoria: form.categoria,
        monto: Number(form.monto),
        moneda: form.moneda,
        tipo_cambio: tc,
        fecha: form.fecha || hoyISO(),
        notas: form.notas.trim() || null,
      }

      const { error: err } = editandoGasto
        ? await supabase.from('viaje_gastos').update(fila).eq('id', editandoGasto)
        : await supabase
            .from('viaje_gastos')
            .insert({ ...fila, viaje_id: id, user_id: user.id })

      if (err) throw err

      setForm(formVacio())
      setEditandoGasto(null)
      setAbierto(false)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el gasto.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrarGasto(gastoId: string) {
    const supabase = createClient()
    await supabase.from('viaje_gastos').delete().eq('id', gastoId)
    await cargar()
  }

  async function alternarArchivo() {
    if (!viaje) return
    const supabase = createClient()
    await supabase.from('viajes').update({ archivado: !viaje.archivado }).eq('id', viaje.id)
    await cargar()
  }

  async function borrarViaje() {
    const supabase = createClient()
    await supabase.from('viajes').delete().eq('id', id)
    router.push('/dashboard/viajes')
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div className="fa-card p-8 text-center">
        <p className="text-sm text-secondary">Cargando viaje…</p>
      </div>
    )
  }

  if (!viaje) {
    return (
      <div className="fa-card p-8 text-center">
        <p className="text-sm text-primary">Este viaje no existe.</p>
        <Link href="/dashboard/viajes" className="mt-3 inline-block text-xs text-info">
          Volver a Viajes
        </Link>
      </div>
    )
  }

  const pct = viaje.presupuesto ? (total / viaje.presupuesto) * 100 : 0
  const dias = duracionDias(viaje)
  const promedioDia = dias && dias > 0 ? total / dias : null
  const estado = ETIQUETA_ESTADO[estadoViaje(viaje)]
  const maxCat = porCategoria[0]?.monto ?? 0

  const input =
    'w-full rounded-md border bg-field px-3 py-2 text-sm text-primary placeholder:text-muted'
  const label = 'mb-1.5 block text-[11px] font-semibold text-secondary'

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/viajes"
        className="flex min-h-[44px] w-fit items-center gap-1.5 text-xs font-medium text-secondary hover:text-primary"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Viajes
      </Link>

      {/* Encabezado */}
      <div className="fa-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-3xl">{viaje.emoji}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-extrabold text-primary">{viaje.nombre}</h1>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: estado.color,
                    background: `color-mix(in srgb, ${estado.color} 14%, transparent)`,
                  }}
                >
                  {estado.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-secondary">
                {viaje.destino && `${viaje.destino} · `}
                {fmtRango(viaje.fecha_inicio, viaje.fecha_fin)}
                {dias && ` · ${dias} ${dias === 1 ? 'día' : 'días'}`}
              </p>
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => setEditarViaje(true)}
              aria-label="Editar viaje"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border text-secondary hover:bg-alternate hover:text-primary"
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
            <button
              onClick={alternarArchivo}
              aria-label={viaje.archivado ? 'Desarchivar viaje' : 'Archivar viaje'}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border text-secondary hover:bg-alternate hover:text-primary"
            >
              <Archive size={15} strokeWidth={2} />
            </button>
            <button
              onClick={() => setConfirmarBorrado(true)}
              aria-label="Borrar viaje"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border text-secondary hover:bg-alternate hover:text-negative"
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Borrado: confirmación en línea, sin diálogo del navegador */}
        {confirmarBorrado && (
          <div
            className="mt-4 rounded-md border p-3"
            style={{ borderColor: 'var(--accent-negative)' }}
          >
            <p className="text-xs text-primary">
              Se borra el viaje y sus {gastos.length}{' '}
              {gastos.length === 1 ? 'gasto' : 'gastos'}. No se puede deshacer.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={borrarViaje}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: 'var(--accent-negative)' }}
              >
                Sí, borrar
              </button>
              <button
                onClick={() => setConfirmarBorrado(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-alternate"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Presupuesto */}
        <div className="mt-5 border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
                Gastado
              </div>
              <div className="fa-amount text-2xl text-primary">{fmtARS(total)}</div>
            </div>
            {viaje.presupuesto != null && (
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
                  Presupuesto
                </div>
                <div className="fa-amount text-lg text-secondary">
                  {fmtARS(viaje.presupuesto)}
                </div>
              </div>
            )}
          </div>

          {viaje.presupuesto != null && (
            <>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full"
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
                className="mt-2 text-xs font-medium"
                style={{ color: colorPresupuesto(pct) }}
              >
                {pct > 100
                  ? `Te pasaste ${fmtARS(total - viaje.presupuesto)} (${pct.toFixed(0)}%)`
                  : `Queda ${fmtARS(viaje.presupuesto - total)} (${pct.toFixed(0)}% usado)`}
              </p>
            </>
          )}

          {promedioDia != null && (
            <p className="mt-2 text-[11px] text-muted">
              Promedio {fmtARS(promedioDia)} por día · {gastos.length}{' '}
              {gastos.length === 1 ? 'gasto' : 'gastos'}
            </p>
          )}
        </div>
      </div>

      {/* Desglose por categoría */}
      {porCategoria.length > 0 && (
        <div className="fa-card p-5">
          <h2 className="mb-4 text-xs font-bold text-primary">En qué se fue</h2>
          <div className="flex flex-col gap-3">
            {porCategoria.map(c => (
              <div key={c.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-secondary">
                    {c.emoji} {c.label}
                  </span>
                  <span className="fa-amount text-primary">
                    {fmtCorto(c.monto)}
                    <span className="ml-1.5 font-normal text-muted">
                      {total > 0 ? `${((c.monto / total) * 100).toFixed(0)}%` : ''}
                    </span>
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: 'var(--border-color)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: maxCat > 0 ? `${(c.monto / maxCat) * 100}%` : '0%',
                      background: c.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-negative">{error}</p>}

      {/* Alta de gasto */}
      <div className="fa-card p-5">
        {!abierto ? (
          <button
            onClick={abrirNuevo}
            className="flex min-h-[44px] items-center gap-1.5 rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover"
          >
            <Plus size={15} strokeWidth={2.5} />
            Agregar gasto
          </button>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-primary">
              {editandoGasto ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>

            <div>
              <label className={label} htmlFor="g-concepto">Concepto</label>
              <input
                id="g-concepto"
                className={input}
                value={form.concepto}
                onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Cena en Copacabana"
                autoFocus
              />
            </div>

            {/* Categoría */}
            <div>
              <span className={label}>Categoría</span>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS_VIAJE.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setForm(f => ({ ...f, categoria: c.key }))}
                    className="min-h-[44px] rounded-md border px-3 py-2 text-[11px] font-medium text-secondary transition-colors"
                    style={
                      form.categoria === c.key
                        ? {
                            borderColor: c.color,
                            color: c.color,
                            background: `color-mix(in srgb, ${c.color} 12%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Moneda */}
            <div>
              <span className={label}>Moneda</span>
              <div className="flex flex-wrap gap-1.5">
                {MONEDAS.map(m => (
                  <button
                    key={m.codigo}
                    onClick={() => cambiarMoneda(m.codigo)}
                    className="min-h-[44px] rounded-md border px-3 py-2 text-[11px] font-semibold text-secondary transition-colors"
                    style={
                      form.moneda === m.codigo
                        ? {
                            borderColor: 'var(--accent-confirm)',
                            color: 'var(--accent-confirm)',
                            background:
                              'color-mix(in srgb, var(--accent-confirm) 12%, transparent)',
                          }
                        : undefined
                    }
                  >
                    {m.bandera} {m.codigo}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="g-monto">
                  Monto en {getMoneda(form.moneda).codigo}
                </label>
                <input
                  id="g-monto"
                  type="number"
                  inputMode="decimal"
                  className={input}
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0"
                />
              </div>

              {/* En pesos no hay conversión que hacer, así que el campo no aparece. */}
              {form.moneda !== 'ARS' && (
                <div>
                  <label className={label} htmlFor="g-tc">
                    1 {form.moneda} = ? ARS
                  </label>
                  <input
                    id="g-tc"
                    type="number"
                    inputMode="decimal"
                    className={input}
                    value={form.tipo_cambio}
                    onChange={e => setForm(f => ({ ...f, tipo_cambio: e.target.value }))}
                    placeholder="Tipo de cambio"
                  />
                  {form.moneda === 'USD' && dolarBlue && (
                    <button
                      onClick={() => setForm(f => ({ ...f, tipo_cambio: String(dolarBlue) }))}
                      className="mt-1 text-[10px] text-info hover:underline"
                    >
                      Usar blue de hoy (${dolarBlue.toFixed(0)})
                    </button>
                  )}
                </div>
              )}
            </div>

            {equivalenteARS != null && form.moneda !== 'ARS' && (
              <p className="text-[11px] text-secondary">
                Equivale a{' '}
                <span className="fa-amount text-primary">{fmtARS(equivalenteARS)}</span>
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="g-fecha">Fecha</label>
                <input
                  id="g-fecha"
                  type="date"
                  className={input}
                  value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                />
              </div>
              <div>
                <label className={label} htmlFor="g-notas">Notas</label>
                <input
                  id="g-notas"
                  className={input}
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={guardarGasto}
                disabled={guardando}
                className="min-h-[44px] rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : editandoGasto ? 'Guardar cambios' : 'Agregar'}
              </button>
              <button
                onClick={() => {
                  setAbierto(false)
                  setEditandoGasto(null)
                  setError('')
                }}
                className="min-h-[44px] rounded-md border px-4 py-2 text-xs font-semibold text-secondary hover:bg-alternate"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de gastos */}
      <div className="fa-card overflow-hidden">
        <h2 className="border-b p-5 pb-3 text-xs font-bold text-primary">Gastos</h2>

        {gastos.length === 0 ? (
          <p className="p-8 text-center text-xs text-secondary">
            Todavía no cargaste ningún gasto de este viaje.
          </p>
        ) : (
          <ul>
            {gastos.map(g => {
              const cat = getCategoriaViaje(g.categoria)
              const enOtraMoneda = g.moneda !== 'ARS'
              return (
                <li
                  key={g.id}
                  className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                >
                  <span className="text-lg">{cat.emoji}</span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">{g.concepto}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {fmtFecha(g.fecha)} · {cat.label}
                      {g.notas && ` · ${g.notas}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="fa-amount text-sm text-primary">
                      {fmtARS(Number(g.monto_ars))}
                    </div>
                    {enOtraMoneda && (
                      <div className="text-[10px] text-muted">
                        {getMoneda(g.moneda).bandera}{' '}
                        {fmtMonedaOriginal(Number(g.monto), g.moneda)}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={() => abrirEdicion(g)}
                      aria-label="Editar gasto"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted hover:bg-alternate hover:text-primary"
                    >
                      <Pencil size={14} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => borrarGasto(g.id)}
                      aria-label="Borrar gasto"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted hover:bg-alternate hover:text-negative"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editarViaje && (
        <ViajeModal
          viaje={viaje}
          onClose={() => setEditarViaje(false)}
          onSaved={cargar}
        />
      )}
    </div>
  )
}
