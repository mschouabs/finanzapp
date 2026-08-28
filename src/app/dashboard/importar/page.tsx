'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  construirPreview,
  parsearCSV,
  sugerirMapeo,
  type FilaPreview,
  type TablaCruda,
} from '@/lib/importar'
import { fmtMonto, type Seccion } from '@/lib/secciones'

/* Los destinos fijos escriben en las tablas que ya existían.
   Una sección dinámica escribe en seccion_registros. */
type DestinoFijo = 'gastos_variables' | 'ingresos_freelance'

const DESTINOS_FIJOS: { id: DestinoFijo; label: string; ayuda: string }[] = [
  { id: 'gastos_variables', label: '🛒 Gastos variables', ayuda: 'Consumos del día a día' },
  { id: 'ingresos_freelance', label: '💼 Ingresos freelance', ayuda: 'Cobros y facturación' },
]

const CAMPOS_MAPEABLES = [
  { key: 'fecha', label: 'Fecha', requerido: false },
  { key: 'monto', label: 'Monto', requerido: true },
  { key: 'descripcion', label: 'Descripción', requerido: false },
  { key: 'categoria', label: 'Categoría', requerido: false },
]

export default function ImportarPage() {
  const [tabla, setTabla] = useState<TablaCruda | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [mapeo, setMapeo] = useState<Record<string, number>>({})
  const [invertir, setInvertir] = useState(false)
  const [destino, setDestino] = useState<string>('gastos_variables')
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [omitidas, setOmitidas] = useState<Set<number>>(new Set())
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('secciones').select('*').order('orden')
        setSecciones((data ?? []) as Seccion[])
      } catch {
        setSecciones([])
      }
    })()
  }, [])

  const leerArchivo = useCallback(async (file: File) => {
    setError('')
    setResultado('')
    setOmitidas(new Set())

    if (file.name.match(/\.xlsx?$/i)) {
      setError(
        'Por ahora solo leo CSV. Abrí el Excel y usá "Guardar como → CSV", después subilo acá.'
      )
      return
    }

    try {
      const texto = await file.text()
      const t = parsearCSV(texto)
      if (t.headers.length === 0 || t.filas.length === 0) {
        setError('El archivo está vacío o no pude reconocer las columnas.')
        return
      }
      setTabla(t)
      setNombreArchivo(file.name)
      setMapeo(sugerirMapeo(t.headers))
    } catch {
      setError('No pude leer el archivo.')
    }
  }, [])

  /* para pintar los montos con el color correcto en la vista previa */
  const destinoEsGasto =
    destino === 'gastos_variables' ||
    (destino.startsWith('seccion:') &&
      secciones.find(x => x.id === destino.slice('seccion:'.length))?.tipo === 'gasto')

  const preview: FilaPreview[] = useMemo(
    () => (tabla ? construirPreview(tabla, mapeo, invertir) : []),
    [tabla, mapeo, invertir]
  )

  const aImportar = preview.filter((f, i) => f.valida && !omitidas.has(i))
  const invalidas = preview.filter(f => !f.valida).length

  const toggleFila = (i: number) =>
    setOmitidas(s => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  const importar = async () => {
    if (aImportar.length === 0) return
    setImportando(true)
    setError('')
    setResultado('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('sin sesión')

      const hoy = new Date().toISOString().slice(0, 10)
      const esSeccion = destino.startsWith('seccion:')

      let filas: Record<string, unknown>[]
      let tablaDestino: string

      if (esSeccion) {
        const seccionId = destino.slice('seccion:'.length)
        tablaDestino = 'seccion_registros'
        filas = aImportar.map(f => ({
          seccion_id: seccionId,
          user_id: user.id,
          datos: { descripcion: f.descripcion, categoria: f.categoria },
          monto: Math.abs(f.monto ?? 0),
          fecha: f.fecha ?? hoy,
        }))
      } else if (destino === 'ingresos_freelance') {
        tablaDestino = 'ingresos_freelance'
        filas = aImportar.map(f => ({
          user_id: user.id,
          nombre: f.descripcion,
          monto: Math.abs(f.monto ?? 0),
          fecha: f.fecha ?? hoy,
        }))
      } else {
        tablaDestino = 'gastos_variables'
        filas = aImportar.map(f => ({
          user_id: user.id,
          nombre: f.descripcion,
          monto: Math.abs(f.monto ?? 0),
          categoria: f.categoria,
          fecha: f.fecha ?? hoy,
          es_gasto_hormiga: false,
        }))
      }

      // en tandas, para no pasarse del límite de la request
      let insertadas = 0
      for (let i = 0; i < filas.length; i += 200) {
        const tanda = filas.slice(i, i + 200)
        const { error: dbError } = await supabase.from(tablaDestino).insert(tanda)
        if (dbError) throw dbError
        insertadas += tanda.length
      }

      setResultado(`✓ Importaste ${insertadas} ${insertadas === 1 ? 'registro' : 'registros'}.`)
      setTabla(null)
      setNombreArchivo('')
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('Falló la importación. Puede que falte alguna columna en la tabla destino.')
    }
    setImportando(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="fa-card p-5">
        <h1 className="text-lg font-extrabold text-primary">📥 Importar movimientos</h1>
        <p className="mt-1 text-xs text-secondary">
          Subí el CSV que exportaste del banco o la billetera. El archivo se procesa
          en tu navegador — no se sube a ningún servidor.
        </p>
      </div>

      {/* Paso 1: archivo */}
      <div className="fa-card p-5">
        <h2 className="mb-3 text-xs font-bold text-primary">1 · Elegí el archivo</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f) }}
          className="block w-full text-xs text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-confirm file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-confirm-hover"
        />
        {nombreArchivo && (
          <p className="mt-2 text-[11px] text-muted">
            {nombreArchivo} · {tabla?.filas.length ?? 0} filas leídas
          </p>
        )}
      </div>

      {error && (
        <div
          className="rounded-md border p-4 text-xs"
          style={{ background: 'var(--riesgo-medio-tint)', borderColor: 'var(--riesgo-medio)', color: 'var(--text-primary)' }}
        >
          {error}
        </div>
      )}

      {resultado && (
        <div
          className="rounded-md border p-4 text-xs font-semibold text-positive"
          style={{ background: 'var(--riesgo-bajo-tint)', borderColor: 'var(--accent-positive)' }}
        >
          {resultado}
        </div>
      )}

      {tabla && (
        <>
          {/* Paso 2: mapeo */}
          <div className="fa-card p-5">
            <h2 className="mb-1 text-xs font-bold text-primary">2 · Emparejá las columnas</h2>
            <p className="mb-4 text-[11px] text-secondary">
              Adiviné por el nombre de cada columna. Corregí lo que haga falta.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_MAPEABLES.map(c => (
                <div key={c.key}>
                  <label className="mb-1 block text-[11px] font-semibold text-secondary">
                    {c.label}{c.requerido && <span className="text-negative"> *</span>}
                  </label>
                  <select
                    value={mapeo[c.key] ?? -1}
                    onChange={e =>
                      setMapeo(m => ({ ...m, [c.key]: Number(e.target.value) }))
                    }
                    className="w-full rounded-md border bg-field px-3 py-2 text-xs text-primary"
                  >
                    <option value={-1}>— ninguna —</option>
                    {tabla.headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={invertir}
                onChange={e => setInvertir(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Invertir el signo (si tu banco exporta los gastos en positivo)
            </label>
          </div>

          {/* Paso 3: destino */}
          <div className="fa-card p-5">
            <h2 className="mb-3 text-xs font-bold text-primary">3 · ¿Dónde van?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {DESTINOS_FIJOS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDestino(d.id)}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    destino === d.id ? 'bg-alternate' : 'hover:bg-alternate'
                  }`}
                  style={destino === d.id ? { borderColor: 'var(--accent-confirm)' } : undefined}
                >
                  <div className="text-xs font-bold text-primary">{d.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted">{d.ayuda}</div>
                </button>
              ))}

              {secciones.map(s => {
                const id = `seccion:${s.id}`
                return (
                  <button
                    key={s.id}
                    onClick={() => setDestino(id)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      destino === id ? 'bg-alternate' : 'hover:bg-alternate'
                    }`}
                    style={destino === id ? { borderColor: 'var(--accent-confirm)' } : undefined}
                  >
                    <div className="text-xs font-bold text-primary">
                      {s.emoji} {s.nombre}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted">Sección propia</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Paso 4: revisión */}
          <div className="fa-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="text-xs font-bold text-primary">4 · Revisá antes de confirmar</h2>
                <p className="mt-1 text-[11px] text-secondary">
                  {aImportar.length} listas para importar
                  {omitidas.size > 0 && ` · ${omitidas.size} descartadas por vos`}
                  {invalidas > 0 && ` · ${invalidas} no se pueden leer`}
                </p>
              </div>
              <button
                onClick={importar}
                disabled={importando || aImportar.length === 0}
                className="rounded-md bg-confirm px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
              >
                {importando ? 'Importando…' : `✓ Importar ${aImportar.length}`}
              </button>
            </div>

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-alternate">
                  <tr>
                    <th className="border-b px-3 py-2.5 font-semibold text-secondary">FECHA</th>
                    <th className="border-b px-3 py-2.5 font-semibold text-secondary">DESCRIPCIÓN</th>
                    <th className="border-b px-3 py-2.5 font-semibold text-secondary">CATEGORÍA</th>
                    <th className="border-b px-3 py-2.5 text-right font-semibold text-secondary">MONTO</th>
                    <th className="border-b px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 300).map((f, i) => {
                    const fuera = omitidas.has(i) || !f.valida
                    return (
                      <tr key={i} className={fuera ? 'opacity-40' : 'hover:bg-alternate'}>
                        <td className="whitespace-nowrap border-b px-3 py-2.5 text-primary">
                          {f.fecha ?? <span className="text-muted">hoy</span>}
                        </td>
                        <td className="border-b px-3 py-2.5 text-primary">{f.descripcion}</td>
                        <td className="border-b px-3 py-2.5 text-secondary">{f.categoria}</td>
                        <td className={`fa-amount whitespace-nowrap border-b px-3 py-2.5 text-right ${
                          destinoEsGasto || (f.monto ?? 0) < 0 ? 'text-negative' : 'text-positive'
                        }`}>
                          {f.monto == null ? '—' : fmtMonto(f.monto)}
                        </td>
                        <td className="whitespace-nowrap border-b px-3 py-2.5 text-right">
                          {f.valida ? (
                            <button
                              onClick={() => toggleFila(i)}
                              className="rounded px-2 py-1 text-secondary hover:bg-card hover:text-primary"
                            >
                              {omitidas.has(i) ? 'Incluir' : 'Descartar'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted">{f.motivo}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {preview.length > 300 && (
                <p className="p-3 text-center text-[10px] text-muted">
                  Mostrando las primeras 300 de {preview.length}. Se importan todas las válidas.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
