'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileUp, History, RotateCcw, Sparkles, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { construirPreview, parsearCSV, sugerirMapeo, type FilaPreview, type TablaCruda } from '@/lib/importar'
import { fmtMonto, type Seccion } from '@/lib/secciones'
import { detectarCategoria } from '@/lib/parser'
import { detectarMedioPago } from '@/lib/tarjetas'
import { fmtK } from '@/components/ui/Piezas'

/* ── Importar ─────────────────────────────────────────────────────
   Paso a paso: subís el archivo, emparejás columnas, revisás (con
   categoría y medio de pago detectados solos y aviso de duplicados)
   e importás. Cada importación se puede deshacer entera.             */

type DestinoFijo = 'gastos_variables' | 'ingresos_freelance'
const DESTINOS_FIJOS: { id: DestinoFijo; label: string; ayuda: string }[] = [
  { id: 'gastos_variables', label: '🛒 Gastos variables', ayuda: 'Consumos del día a día' },
  { id: 'ingresos_freelance', label: '💼 Ingresos freelance', ayuda: 'Cobros y facturación' },
]

const CAMPOS = [
  { key: 'fecha', label: 'Fecha', requerido: false },
  { key: 'monto', label: 'Monto', requerido: true },
  { key: 'descripcion', label: 'Descripción', requerido: false },
  { key: 'categoria', label: 'Categoría', requerido: false },
]

const PASOS = ['Subir', 'Emparejar', 'Revisar', 'Listo']
const HISTORIAL_KEY = 'finanzapp_importaciones'

interface Importacion { id: string; fecha: string; archivo: string; tabla: string; destino: string; ids: string[]; total: number }

/** Fila de la vista previa con lo que detectamos. */
interface FilaRev extends FilaPreview { idx: number; catFinal: string; medio: string | null; duplicado: boolean }

const leerHistorial = (): Importacion[] => {
  try { return JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]') as Importacion[] } catch { return [] }
}
const guardarHistorial = (h: Importacion[]) => {
  try { localStorage.setItem(HISTORIAL_KEY, JSON.stringify(h.slice(0, 10))) } catch { /* sin storage */ }
}
const claveDup = (fecha: string | null, monto: number) => `${fecha ?? ''}|${Math.abs(monto).toFixed(2)}`

export default function ImportarPage() {
  const [paso, setPaso] = useState(1)
  const [tabla, setTabla] = useState<TablaCruda | null>(null)
  const [archivo, setArchivo] = useState('')
  const [mapeo, setMapeo] = useState<Record<string, number>>({})
  const [invertir, setInvertir] = useState(false)
  const [destino, setDestino] = useState<string>('gastos_variables')
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [autoCat, setAutoCat] = useState(true)
  const [autoMedio, setAutoMedio] = useState(true)
  const [omitidas, setOmitidas] = useState<Set<number>>(new Set())
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [verSolo, setVerSolo] = useState<'todas' | 'duplicadas'>('todas')
  const [arrastrando, setArrastrando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [ultima, setUltima] = useState<Importacion | null>(null)
  const [historial, setHistorial] = useState<Importacion[]>([])
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHistorial(leerHistorial())
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('secciones').select('*').order('orden')
        setSecciones((data ?? []) as Seccion[])
      } catch { setSecciones([]) }
    })()
  }, [])

  const leerArchivo = useCallback(async (file: File) => {
    setError('')
    setOmitidas(new Set())
    setUltima(null)
    if (file.name.match(/\.xlsx?$/i)) {
      setError('Por ahora leo CSV. Abrí el Excel y usá "Guardar como → CSV", después subilo acá.')
      return
    }
    try {
      const t = parsearCSV(await file.text())
      if (!t.headers.length || !t.filas.length) { setError('El archivo está vacío o no pude reconocer las columnas.'); return }
      setTabla(t)
      setArchivo(file.name)
      setMapeo(sugerirMapeo(t.headers))
      setPaso(2)
    } catch {
      setError('No pude leer el archivo.')
    }
  }, [])

  const esGastoVar = destino === 'gastos_variables'
  const destinoEsGasto = esGastoVar ||
    (destino.startsWith('seccion:') && secciones.find(x => x.id === destino.slice(8))?.tipo === 'gasto')
  const nombreDestino = DESTINOS_FIJOS.find(d => d.id === destino)?.label
    ?? (() => { const s = secciones.find(x => x.id === destino.slice(8)); return s ? `${s.emoji} ${s.nombre}` : destino })()

  const preview: FilaPreview[] = useMemo(() => (tabla ? construirPreview(tabla, mapeo, invertir) : []), [tabla, mapeo, invertir])

  /* lo que se va a importar, con categoría/medio detectados y duplicados marcados */
  const filas: FilaRev[] = useMemo(() => {
    const vistos = new Set<string>()
    return preview.map((f, idx) => {
      const sinCat = !f.categoria || f.categoria.toLowerCase() === 'varios'
      const catFinal = esGastoVar && autoCat && sinCat ? detectarCategoria(f.descripcion) : f.categoria
      const medio = esGastoVar ? detectarMedioPago(f.descripcion) : null
      const k = claveDup(f.fecha, f.monto ?? 0)
      const duplicado = f.valida && (existentes.has(k) || vistos.has(k + '|' + f.descripcion))
      vistos.add(k + '|' + f.descripcion)
      return { ...f, idx, catFinal, medio, duplicado }
    })
  }, [preview, esGastoVar, autoCat, existentes])

  const aImportar = filas.filter(f => f.valida && !omitidas.has(f.idx))
  const invalidas = filas.filter(f => !f.valida).length
  const duplicadas = filas.filter(f => f.duplicado).length
  const totalImportar = aImportar.reduce((s, f) => s + Math.abs(f.monto ?? 0), 0)
  const fechas = aImportar.map(f => f.fecha).filter(Boolean).sort() as string[]
  const porCat = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const f of aImportar) acc[f.catFinal] = (acc[f.catFinal] ?? 0) + Math.abs(f.monto ?? 0)
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [aImportar])

  /* al pasar a "Revisar" buscamos lo que ya está cargado en esas fechas */
  async function irARevisar() {
    if (mapeo.monto == null || mapeo.monto < 0) { setError('Elegí qué columna tiene el monto.'); return }
    setError('')
    const fs = preview.map(f => f.fecha).filter(Boolean).sort() as string[]
    const supabase = createClient()
    const set = new Set<string>()
    try {
      const tablaDest = destino.startsWith('seccion:') ? 'seccion_registros' : destino
      let q = supabase.from(tablaDest).select('*')
      if (destino.startsWith('seccion:')) q = q.eq('seccion_id', destino.slice(8))
      if (fs.length) q = q.gte('fecha', fs[0]).lte('fecha', fs[fs.length - 1])
      const { data } = await q.limit(5000)
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const m = Number(r.monto ?? r.monto_total ?? r.monto_cobrado) || 0
        set.add(claveDup((r.fecha as string) ?? null, m))
      }
    } catch { /* si falla, seguimos sin chequeo de duplicados */ }
    setExistentes(set)
    /* los duplicados arrancan descartados (se pueden incluir igual) */
    const dup = new Set<number>()
    const vistos = new Set<string>()
    preview.forEach((f, i) => {
      const k = claveDup(f.fecha, f.monto ?? 0)
      if (f.valida && (set.has(k) || vistos.has(k + '|' + f.descripcion))) dup.add(i)
      vistos.add(k + '|' + f.descripcion)
    })
    setOmitidas(dup)
    setPaso(3)
  }

  const toggleFila = (i: number) => setOmitidas(s => {
    const n = new Set(s)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })

  async function importar() {
    if (!aImportar.length) return
    setImportando(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('sin sesión')
      const hoy = new Date().toISOString().slice(0, 10)

      /* medio de pago: solo se vincula a cuentas que ya existen, sin tocar saldos */
      const tarjetaPorMedio = new Map<string, string>()
      if (esGastoVar && autoMedio) {
        const { data: ts } = await supabase.from('tarjetas_cuentas').select('id, nombre')
        for (const t of (ts ?? []) as { id: string; nombre: string }[]) {
          const m = detectarMedioPago(t.nombre)
          if (m && !tarjetaPorMedio.has(m)) tarjetaPorMedio.set(m, t.id)
        }
      }

      let tablaDestino: string
      let rows: Record<string, unknown>[]
      if (destino.startsWith('seccion:')) {
        tablaDestino = 'seccion_registros'
        rows = aImportar.map(f => ({
          seccion_id: destino.slice(8), user_id: user.id,
          datos: { descripcion: f.descripcion, categoria: f.catFinal },
          monto: Math.abs(f.monto ?? 0), fecha: f.fecha ?? hoy,
        }))
      } else if (destino === 'ingresos_freelance') {
        tablaDestino = 'ingresos_freelance'
        rows = aImportar.map(f => ({ user_id: user.id, nombre: f.descripcion, monto: Math.abs(f.monto ?? 0), fecha: f.fecha ?? hoy }))
      } else {
        tablaDestino = 'gastos_variables'
        rows = aImportar.map(f => ({
          user_id: user.id, nombre: f.descripcion, monto: Math.abs(f.monto ?? 0),
          categoria: f.catFinal || 'varios', fecha: f.fecha ?? hoy, es_gasto_hormiga: false,
          ...(f.medio && tarjetaPorMedio.get(f.medio) ? { tarjeta_id: tarjetaPorMedio.get(f.medio) } : {}),
        }))
      }

      const ids: string[] = []
      for (let i = 0; i < rows.length; i += 200) {
        const { data, error: e } = await supabase.from(tablaDestino).insert(rows.slice(i, i + 200)).select('id')
        if (e) throw e
        for (const r of (data ?? []) as { id: string }[]) ids.push(r.id)
      }

      const imp: Importacion = {
        id: `${Date.now()}`, fecha: new Date().toISOString(), archivo, tabla: tablaDestino,
        destino: nombreDestino, ids, total: totalImportar,
      }
      const nuevo = [imp, ...leerHistorial()]
      guardarHistorial(nuevo)
      setHistorial(nuevo.slice(0, 10))
      setUltima(imp)
      setPaso(4)
      setTabla(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('Falló la importación. Puede que falte alguna columna en la tabla destino. No se guardó nada de la tanda que falló.')
    }
    setImportando(false)
  }

  async function deshacer(imp: Importacion) {
    if (!window.confirm(`¿Borrar los ${imp.ids.length} registros que importaste de "${imp.archivo}"?`)) return
    setDeshaciendo(imp.id)
    const supabase = createClient()
    for (let i = 0; i < imp.ids.length; i += 100) {
      await supabase.from(imp.tabla).delete().in('id', imp.ids.slice(i, i + 100))
    }
    const nuevo = leerHistorial().filter(h => h.id !== imp.id)
    guardarHistorial(nuevo)
    setHistorial(nuevo)
    if (ultima?.id === imp.id) setUltima(null)
    setDeshaciendo(null)
  }

  function reiniciar() {
    setTabla(null); setArchivo(''); setMapeo({}); setOmitidas(new Set()); setExistentes(new Set())
    setUltima(null); setError(''); setPaso(1)
    if (fileRef.current) fileRef.current.value = ''
  }

  const visibles = verSolo === 'duplicadas' ? filas.filter(f => f.duplicado) : filas

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">📥 Importar movimientos</h1>
        <p className="mt-1 text-sm text-secondary">Subí el CSV del banco o la billetera. Se procesa en tu navegador: el archivo no se sube a ningún servidor.</p>
      </div>

      {/* Stepper */}
      <ol className="fa-card flex items-center gap-2 overflow-x-auto p-4">
        {PASOS.map((p, i) => {
          const n = i + 1
          const hecho = paso > n
          const actual = paso === n
          return (
            <li key={p} className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all"
                style={hecho
                  ? { background: 'var(--accent-positive)', color: '#fff' }
                  : actual
                  ? { background: 'var(--accent-confirm)', color: '#fff', boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent-confirm) 25%, transparent)' }
                  : { background: 'var(--bg-alternate)', color: 'var(--text-muted)' }}>
                {hecho ? <Check size={15} /> : n}
              </span>
              <span className={`whitespace-nowrap text-xs font-semibold ${actual ? 'text-primary' : 'text-muted'}`}>{p}</span>
              {n < PASOS.length && <span className="mx-1 h-0.5 min-w-[16px] flex-1 rounded" style={{ background: hecho ? 'var(--accent-positive)' : 'var(--border-color)' }} />}
            </li>
          )
        })}
      </ol>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border p-4 text-sm" style={{ background: 'var(--riesgo-medio-tint)', borderColor: 'var(--riesgo-medio)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--riesgo-medio)' }} className="mt-0.5 shrink-0" />
          <span className="text-primary">{error}</span>
        </div>
      )}

      {/* Paso 1: subir */}
      {paso === 1 && (
        <label
          onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) leerArchivo(f) }}
          className="fa-aparecer flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition-all"
          style={arrastrando
            ? { borderColor: 'var(--accent-confirm)', background: 'color-mix(in srgb, var(--accent-confirm) 8%, transparent)', transform: 'scale(1.01)' }
            : { borderColor: 'var(--border-color)' }}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--accent-confirm) 14%, transparent)', color: 'var(--accent-confirm)' }}>
            {arrastrando ? <FileUp size={30} /> : <Upload size={30} />}
          </span>
          <span className="text-base font-semibold text-primary">{arrastrando ? 'Soltalo acá' : 'Arrastrá tu archivo CSV acá'}</span>
          <span className="text-xs text-secondary">o tocá para elegirlo · Mercado Pago, bancos, planillas propias</span>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f) }} />
        </label>
      )}

      {/* Paso 2: emparejar + destino */}
      {paso === 2 && tabla && (
        <div className="fa-aparecer flex flex-col gap-5">
          <div className="fa-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-primary">Emparejá las columnas</h2>
              <span className="rounded-full bg-alternate px-2.5 py-1 text-[11px] text-secondary">{archivo} · {tabla.filas.length} filas</span>
            </div>
            <p className="mt-1 text-xs text-secondary">Adiviné por el nombre de cada columna. Corregí lo que haga falta.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAMPOS.map(c => {
                const idx = mapeo[c.key] ?? -1
                const ejemplo = idx >= 0 ? tabla.filas[0]?.[idx] : ''
                return (
                  <div key={c.key} className="rounded-xl border border-line p-3">
                    <label className="mb-1.5 block text-xs font-semibold text-secondary">
                      {c.label}{c.requerido && <span className="text-negative"> *</span>}
                    </label>
                    <select value={idx} onChange={e => setMapeo(m => ({ ...m, [c.key]: Number(e.target.value) }))}
                      className="w-full rounded-lg border bg-field px-3 py-2 text-sm text-primary">
                      <option value={-1}>— ninguna —</option>
                      {tabla.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                    <p className="mt-1.5 truncate text-[11px] text-muted">{ejemplo ? `Ej: ${ejemplo}` : 'Sin ejemplo'}</p>
                  </div>
                )
              })}
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-secondary">
              <input type="checkbox" checked={invertir} onChange={e => setInvertir(e.target.checked)} className="h-3.5 w-3.5" />
              Invertir el signo (si tu banco exporta los gastos en positivo)
            </label>
          </div>

          <div className="fa-card p-5">
            <h2 className="text-sm font-bold text-primary">¿Dónde van?</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...DESTINOS_FIJOS.map(d => ({ id: d.id as string, label: d.label, ayuda: d.ayuda })),
                ...secciones.map(s => ({ id: `seccion:${s.id}`, label: `${s.emoji} ${s.nombre}`, ayuda: 'Sección propia' }))].map(d => (
                <button key={d.id} onClick={() => setDestino(d.id)}
                  className={`fa-lift rounded-xl border p-3 text-left ${destino === d.id ? 'bg-alternate' : ''}`}
                  style={destino === d.id ? { borderColor: 'var(--accent-confirm)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent-confirm) 18%, transparent)' } : undefined}>
                  <div className="text-sm font-bold text-primary">{d.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{d.ayuda}</div>
                </button>
              ))}
            </div>
            {esGastoVar && (
              <div className="mt-4 flex flex-col gap-2 rounded-xl bg-alternate p-3 text-xs text-secondary">
                <p className="flex items-center gap-1.5 font-semibold text-primary"><Sparkles size={14} className="text-positive" /> Como lo hace Luca</p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={autoCat} onChange={e => setAutoCat(e.target.checked)} className="h-3.5 w-3.5" />
                  Categorizar solo lo que venga sin categoría (&quot;PedidosYa&quot; → comida, &quot;Uber&quot; → transporte…)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={autoMedio} onChange={e => setAutoMedio(e.target.checked)} className="h-3.5 w-3.5" />
                  Vincular el medio de pago si aparece en la descripción (no cambia ningún saldo)</label>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2">
            <button onClick={reiniciar} className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm text-secondary hover:bg-alternate"><ArrowLeft size={15} /> Otro archivo</button>
            <button onClick={irARevisar} className="flex items-center gap-1.5 rounded-xl bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">Revisar <ArrowRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Paso 3: revisar */}
      {paso === 3 && tabla && (
        <div className="fa-aparecer flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Resumen label="A importar" valor={String(aImportar.length)} sub={`a ${nombreDestino}`} tono="var(--accent-confirm)" />
            <Resumen label="Total" valor={fmtK(totalImportar)} sub={fechas.length ? `${fechas[0]} → ${fechas[fechas.length - 1]}` : 'sin fechas: van con la de hoy'} tono="var(--accent-secondary)" />
            <Resumen label="Posibles duplicados" valor={String(duplicadas)} sub={duplicadas ? 'ya los tenías: arrancan descartados' : 'ninguno 👌'} tono={duplicadas ? 'var(--riesgo-medio)' : 'var(--accent-positive)'} />
            <Resumen label="No se pueden leer" valor={String(invalidas)} sub={invalidas ? 'sin monto o en cero' : 'todas bien'} tono={invalidas ? 'var(--accent-negative)' : 'var(--accent-positive)'} />
          </div>

          {porCat.length > 0 && (
            <div className="fa-card p-5">
              <h2 className="text-sm font-bold text-primary">Así queda por categoría</h2>
              <ul className="mt-3 space-y-2">
                {porCat.map(([cat, v]) => (
                  <li key={cat} className="text-xs">
                    <div className="flex justify-between"><span className="capitalize text-secondary">{cat}</span><span className="fa-amount text-primary">{fmtK(v)}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(v / porCat[0][1]) * 100}%`, background: 'var(--accent-secondary)' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="fa-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-xs text-secondary">
                {aImportar.length} listas{omitidas.size > 0 && ` · ${omitidas.size} descartadas`} · tocá una fila para incluirla o descartarla
              </p>
              {duplicadas > 0 && (
                <div className="flex gap-1 rounded-lg bg-alternate p-1 text-xs">
                  {(['todas', 'duplicadas'] as const).map(v => (
                    <button key={v} onClick={() => setVerSolo(v)} className="rounded-md px-2.5 py-1 font-semibold capitalize"
                      style={verSolo === v ? { background: 'var(--bg-card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}>{v}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-[460px] overflow-auto border-t border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-[1] bg-alternate text-[10px] uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="px-3 py-2.5" />
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Categoría</th>
                    <th className="px-3 py-2.5 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.slice(0, 400).map(f => {
                    const incluida = f.valida && !omitidas.has(f.idx)
                    return (
                      <tr key={f.idx} onClick={() => f.valida && toggleFila(f.idx)}
                        className={`border-t border-line transition-colors ${f.valida ? 'cursor-pointer hover:bg-alternate' : ''} ${incluida ? '' : 'opacity-45'}`}>
                        <td className="px-3 py-2.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded border"
                            style={incluida ? { background: 'var(--accent-confirm)', borderColor: 'var(--accent-confirm)', color: '#fff' } : undefined}>
                            {incluida && <Check size={11} />}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-primary">{f.fecha ?? <span className="text-muted">hoy</span>}</td>
                        <td className="px-3 py-2.5 text-primary">
                          {f.descripcion}
                          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                            {f.duplicado && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--riesgo-medio-tint)', color: 'var(--riesgo-medio)' }}>ya cargado</span>}
                            {f.medio && autoMedio && <span className="rounded bg-alternate px-1.5 py-0.5 text-[10px] text-secondary">💳 {f.medio}</span>}
                            {!f.valida && <span className="text-[10px] text-muted">{f.motivo}</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 capitalize text-secondary">
                          {f.catFinal}{f.catFinal !== f.categoria && <Sparkles size={10} className="ml-1 inline text-positive" />}
                        </td>
                        <td className={`fa-amount whitespace-nowrap px-3 py-2.5 text-right ${destinoEsGasto || (f.monto ?? 0) < 0 ? 'text-negative' : 'text-positive'}`}>
                          {f.monto == null ? '—' : fmtMonto(f.monto)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visibles.length > 400 && <p className="p-3 text-center text-[11px] text-muted">Mostrando 400 de {visibles.length}. Se importan todas las marcadas.</p>}
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <button onClick={() => setPaso(2)} className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm text-secondary hover:bg-alternate"><ArrowLeft size={15} /> Atrás</button>
            <button onClick={importar} disabled={importando || !aImportar.length}
              className="flex items-center gap-1.5 rounded-xl bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover disabled:opacity-50">
              {importando ? 'Importando…' : <>Importar {aImportar.length} <Check size={15} /></>}
            </button>
          </div>
        </div>
      )}

      {/* Paso 4: listo */}
      {paso === 4 && ultima && (
        <div className="fa-card fa-aparecer flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-3xl" style={{ background: 'var(--riesgo-bajo-tint)' }}>✅</span>
          <p className="text-lg font-bold text-primary">Importaste {ultima.ids.length} {ultima.ids.length === 1 ? 'registro' : 'registros'}</p>
          <p className="text-sm text-secondary">{fmtK(ultima.total)} a {ultima.destino}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href={ultima.tabla === 'gastos_variables' ? '/dashboard/gastos-variables' : ultima.tabla === 'ingresos_freelance' ? '/dashboard/ingresos-gastos' : '/dashboard/historial'}
              className="rounded-xl bg-confirm px-4 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">Ver movimientos</Link>
            <button onClick={reiniciar} className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-primary hover:bg-alternate">Importar otro</button>
            <button onClick={() => deshacer(ultima)} disabled={deshaciendo === ultima.id}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm text-negative hover:bg-alternate disabled:opacity-50">
              <RotateCcw size={14} /> {deshaciendo === ultima.id ? 'Deshaciendo…' : 'Deshacer'}
            </button>
          </div>
        </div>
      )}

      {/* Historial de importaciones */}
      {historial.length > 0 && (
        <section className="fa-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line p-4">
            <History size={16} className="text-secondary" />
            <h2 className="text-sm font-bold text-primary">Importaciones recientes</h2>
            <span className="text-[11px] text-muted">· las podés deshacer desde este dispositivo</span>
          </div>
          <ul className="divide-y divide-line">
            {historial.map(h => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-alternate">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-primary">{h.archivo}</span>
                  <span className="text-[11px] text-muted">
                    {new Date(h.fecha).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.ids.length} registros · {fmtK(h.total)} · {h.destino}
                  </span>
                </span>
                <button onClick={() => deshacer(h)} disabled={deshaciendo === h.id}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-negative hover:bg-card disabled:opacity-50">
                  <RotateCcw size={13} /> {deshaciendo === h.id ? 'Deshaciendo…' : 'Deshacer'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Resumen({ label, valor, sub, tono }: { label: string; valor: string; sub: string; tono: string }) {
  return (
    <div className="fa-card fa-lift relative overflow-hidden p-4">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: tono }} />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className="fa-amount mt-1 text-2xl text-primary">{valor}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>
    </div>
  )
}
