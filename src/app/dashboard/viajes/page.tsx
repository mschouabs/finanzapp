'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight, GripVertical, MapPin, Plane, Plus, Timer, Wallet } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { ViajeModal } from '@/components/ViajeModal'
import { GrillaOrdenable, type HandleProps } from '@/components/GrillaOrdenable'
import { Kpi, PALETA, Segmentado, Titulo, fmtK, tooltipStyle } from '@/components/ui/Piezas'
import {
  colorPresupuesto, duracionDias, estadoViaje, fmtARS, fmtCorto, fmtRango, type Viaje,
} from '@/lib/viajes'

type ViajeOrd = Viaje & { orden?: number | null }
type Filtro = 'todos' | 'activos' | 'realizados'
type Orden = 'recientes' | 'gasto' | 'alfabetico' | 'personal'
interface GastoMin { viaje_id: string; monto_ars: number | null; fecha: string | null }

const ORDEN_KEY = 'viajes_orden'
const DIA = 86_400_000
const hoyISO = () => new Date().toISOString().split('T')[0]
const diasHasta = (iso: string) => Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(hoyISO() + 'T12:00:00').getTime()) / DIA)
const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/* un color estable por viaje, para la tarjeta, el gráfico y la línea de tiempo */
function colorViaje(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}

export default function ViajesPage() {
  const router = useRouter()
  const [viajes, setViajes] = useState<ViajeOrd[]>([])
  const [gastos, setGastos] = useState<GastoMin[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<Orden>('recientes')
  const [vistaGrafico, setVistaGrafico] = useState<'total' | 'dia'>('total')
  const [anio, setAnio] = useState(new Date().getFullYear())

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: vs }, { data: gs }] = await Promise.all([
        supabase.from('viajes').select('*')
          .order('fecha_inicio', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase.from('viaje_gastos').select('viaje_id, monto_ars, fecha'),
      ])
      setViajes((vs ?? []) as ViajeOrd[])
      setGastos((gs ?? []) as GastoMin[])
    } catch {
      setViajes([])
      setGastos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    try {
      const o = localStorage.getItem(ORDEN_KEY) as Orden | null
      if (o && ['recientes', 'gasto', 'alfabetico', 'personal'].includes(o)) setOrden(o)
    } catch { /* sin storage */ }
  }, [cargar])

  const cambiarOrden = (o: Orden) => {
    setOrden(o)
    try { localStorage.setItem(ORDEN_KEY, o) } catch { /* sin storage */ }
  }

  /* ── cálculos ─────────────────────────── */
  const gastado = useMemo(() => {
    const acum: Record<string, number> = {}
    for (const g of gastos) acum[g.viaje_id] = (acum[g.viaje_id] ?? 0) + (Number(g.monto_ars) || 0)
    return acum
  }, [gastos])

  const filtrados = viajes.filter(v => (filtro === 'activos' ? !v.archivado : filtro === 'realizados' ? !!v.archivado : true))
  const visibles = [...filtrados].sort((a, b) => {
    if (orden === 'gasto') return (gastado[b.id] ?? 0) - (gastado[a.id] ?? 0)
    if (orden === 'alfabetico') return a.nombre.localeCompare(b.nombre)
    if (orden === 'personal') return (a.orden ?? 999) - (b.orden ?? 999)
    return 0 /* recientes: ya vienen así de la consulta */
  })

  const anioActual = new Date().getFullYear()
  const gastadoAnio = gastos
    .filter(g => (g.fecha ?? '').startsWith(String(anioActual)))
    .reduce((s, g) => s + (Number(g.monto_ars) || 0), 0)
  const conGasto = viajes.filter(v => (gastado[v.id] ?? 0) > 0)
  const promedioViaje = conGasto.length ? conGasto.reduce((s, v) => s + gastado[v.id], 0) / conGasto.length : 0
  const conDias = conGasto.filter(v => duracionDias(v))
  const costoDia = conDias.length
    ? conDias.reduce((s, v) => s + gastado[v.id], 0) / conDias.reduce((s, v) => s + (duracionDias(v) ?? 0), 0)
    : 0

  const enCurso = viajes.find(v => !v.archivado && estadoViaje(v) === 'en_curso')
  const proximo = viajes
    .filter(v => !v.archivado && estadoViaje(v) === 'proximo' && v.fecha_inicio)
    .sort((a, b) => a.fecha_inicio!.localeCompare(b.fecha_inicio!))[0]

  const datosGrafico = conGasto
    .map(v => {
      const dias = duracionDias(v)
      return {
        id: v.id,
        nombre: `${v.emoji} ${v.nombre}`,
        valor: vistaGrafico === 'total' ? gastado[v.id] : dias ? gastado[v.id] / dias : 0,
        color: colorViaje(v.id),
      }
    })
    .filter(d => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  const reordenar = useCallback(async (ids: string[]) => {
    setViajes(prev => prev.map(v => (ids.includes(v.id) ? { ...v, orden: ids.indexOf(v.id) } : v)))
    cambiarOrden('personal')
    const supabase = createClient()
    await Promise.all(ids.map((id, i) => supabase.from('viajes').update({ orden: i }).eq('id', id)))
  }, [])

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando viajes…</p></div>
  }

  const arrastrable = filtro === 'todos' && visibles.length > 1

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">✈️ Viajes</h1>
          <p className="mt-1 text-sm text-secondary">
            {viajes.length} {viajes.length === 1 ? 'viaje' : 'viajes'} · cada gasto en su moneda, convertido a pesos
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover"
        >
          <Plus size={16} strokeWidth={2.5} /> Nuevo viaje
        </button>
      </div>

      {/* Viaje en curso / próximo */}
      {(enCurso || proximo) && (
        <BannerViaje v={(enCurso ?? proximo)!} gastado={gastado[(enCurso ?? proximo)!.id] ?? 0} />
      )}

      {/* KPIs */}
      {viajes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={`Gastado en ${anioActual}`} valor={fmtK(gastadoAnio)} icono={<Wallet size={17} />} tono="var(--accent-negative)"
            sub={`${gastos.filter(g => (g.fecha ?? '').startsWith(String(anioActual))).length} gastos`} />
          <Kpi label="Promedio por viaje" valor={fmtK(promedioViaje)} icono={<Plane size={17} />} tono="var(--accent-secondary)"
            sub={`${conGasto.length} con gastos`} />
          <Kpi label="Costo por día" valor={fmtK(costoDia)} icono={<Calendar size={17} />} tono="var(--accent-violet)"
            sub="promedio de todos tus viajes" />
          <Kpi label={enCurso ? 'Estás de viaje' : 'Próximo viaje'} icono={<Timer size={17} />} tono="var(--accent-positive)"
            valor={enCurso ? enCurso.nombre : proximo ? `${diasHasta(proximo.fecha_inicio!)} días` : '—'}
            sub={enCurso ? 'que lo disfrutes 🌴' : proximo ? `${proximo.emoji} ${proximo.nombre}` : 'ninguno cargado'} />
        </div>
      )}

      {/* Gráficos */}
      {datosGrafico.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <section className="fa-card p-5">
            <Titulo
              titulo="Cuánto costó cada viaje"
              sub={vistaGrafico === 'total' ? 'Total en pesos' : 'Promedio por día de viaje'}
              derecha={<Segmentado opciones={[{ key: 'total', label: 'Total' }, { key: 'dia', label: 'Por día' }] as const} valor={vistaGrafico} onCambio={setVistaGrafico} />}
            />
            <div className="mt-4" style={{ height: Math.max(160, datosGrafico.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datosGrafico} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-alternate)' }} formatter={(v: number) => [fmtARS(v), vistaGrafico === 'total' ? 'Total' : 'Por día']} />
                  <Bar dataKey="valor" radius={[0, 6, 6, 0]} barSize={18} onClick={(d: unknown) => { const x = d as { id?: string; payload?: { id?: string } } | null; const id = x?.id ?? x?.payload?.id; if (id) router.push(`/dashboard/viajes/${id}`) }} style={{ cursor: 'pointer' }}>
                    {datosGrafico.map(d => <Cell key={d.id} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <LineaDeTiempo viajes={viajes} anio={anio} setAnio={setAnio} gastado={gastado} />
        </div>
      )}

      {/* Filtros */}
      {viajes.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmentado
            opciones={[{ key: 'todos', label: 'Todos' }, { key: 'activos', label: 'Activos' }, { key: 'realizados', label: 'Realizados' }] as const}
            valor={filtro} onCambio={setFiltro}
          />
          <div className="flex items-center gap-2">
            {arrastrable && <span className="hidden text-[11px] text-muted sm:inline">Arrastrá desde <GripVertical size={11} className="inline" /> para ordenarlos a mano</span>}
            <select value={orden} onChange={e => cambiarOrden(e.target.value as Orden)}
              className="rounded-lg border bg-field px-2.5 py-1.5 text-xs text-secondary">
              <option value="recientes">Más recientes</option>
              <option value="gasto">Mayor gasto</option>
              <option value="alfabetico">Alfabético</option>
              <option value="personal">Mi orden</option>
            </select>
          </div>
        </div>
      )}

      {/* Lista */}
      {visibles.length === 0 ? (
        <div className="fa-card p-10 text-center">
          <div className="text-4xl">🗺️</div>
          <p className="mt-3 text-sm font-semibold text-primary">
            {viajes.length === 0 ? 'Todavía no cargaste ningún viaje' : 'Sin viajes para este filtro'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-secondary">
            {viajes.length === 0
              ? 'Creá un viaje y después cargá cada gasto en la moneda en que lo pagaste. FinanzApp lo convierte a pesos para que veas el total real.'
              : 'Probá con otro filtro.'}
          </p>
        </div>
      ) : arrastrable ? (
        <GrillaOrdenable
          ids={visibles.map(v => v.id)}
          onReordenar={reordenar}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          render={(id, handle, arr) => {
            const v = visibles.find(x => x.id === id)
            return v ? <TarjetaViaje v={v} total={gastado[v.id] ?? 0} handle={handle} arrastrando={arr} /> : null
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map(v => <TarjetaViaje key={v.id} v={v} total={gastado[v.id] ?? 0} />)}
        </div>
      )}

      {modal && <ViajeModal onClose={() => setModal(false)} onSaved={cargar} />}
    </div>
  )
}

/* ── Estado visible de un viaje ─────────────────────────────────── */

function badgeDe(v: Viaje) {
  if (v.archivado) return { label: 'REALIZADO', color: 'var(--text-muted)', late: false }
  const e = estadoViaje(v)
  if (e === 'en_curso') return { label: 'EN CURSO', color: 'var(--accent-positive)', late: true }
  if (e === 'proximo') return { label: 'PRÓXIMO', color: 'var(--accent-secondary)', late: false }
  return { label: 'ACTIVO', color: 'var(--accent-positive)', late: false }
}

/* ── Tarjeta de viaje (estilo pase de abordar) ───────────────────── */

function TarjetaViaje({ v, total, handle, arrastrando }: { v: Viaje; total: number; handle?: HandleProps; arrastrando?: boolean }) {
  const color = colorViaje(v.id)
  const dias = duracionDias(v)
  const pct = v.presupuesto ? (total / v.presupuesto) * 100 : 0
  const badge = badgeDe(v)
  const estado = estadoViaje(v)
  const faltan = estado === 'proximo' && v.fecha_inicio ? diasHasta(v.fecha_inicio) : null
  const diaActual = estado === 'en_curso' && v.fecha_inicio ? -diasHasta(v.fecha_inicio) + 1 : null

  return (
    <div
      className={`fa-card relative flex h-full flex-col overflow-hidden ${arrastrando ? '' : 'fa-lift'}`}
      style={{
        ...(v.archivado ? { opacity: 0.8 } : {}),
        ...(arrastrando ? { boxShadow: '0 18px 40px rgba(0,0,0,.35)', outline: `2px solid ${color}` } : {}),
      }}
    >
      {/* franja superior con el color del viaje */}
      <div className="relative px-4 pb-3 pt-4 text-white"
        style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)` }}>
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 text-[96px] leading-none opacity-15">{v.emoji}</span>
        <div className="relative flex items-start gap-2">
          {handle && (
            <button type="button" {...handle} className="-ml-1 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
              <GripVertical size={15} />
            </button>
          )}
          <Link href={`/dashboard/viajes/${v.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-3xl drop-shadow">{v.emoji}</span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold">{v.nombre}</span>
              {v.destino && (
                <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/80">
                  <MapPin size={11} /> {v.destino}
                </span>
              )}
            </span>
          </Link>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur">
            {badge.late && <span className="fa-latido h-1.5 w-1.5 rounded-full" style={{ background: '#fff', color: '#fff' }} />}
            {badge.label}
          </span>
        </div>
      </div>

      {/* "troquel" del pase */}
      <div aria-hidden="true" className="relative h-0 border-t border-dashed border-line">
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full" style={{ background: 'var(--bg-page)' }} />
        <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full" style={{ background: 'var(--bg-page)' }} />
      </div>

      <Link href={`/dashboard/viajes/${v.id}`} className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><Calendar size={11} /> {fmtRango(v.fecha_inicio, v.fecha_fin)}</span>
          {dias && <span>{dias} {dias === 1 ? 'día' : 'días'}</span>}
        </div>

        {faltan !== null && (
          <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--accent-secondary)' }}>
            ⏳ {faltan === 0 ? '¡Sale hoy!' : faltan === 1 ? 'Sale mañana' : `Faltan ${faltan} días`}
          </p>
        )}
        {diaActual !== null && dias && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-positive">Día {Math.min(diaActual, dias)} de {dias}</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min((diaActual / dias) * 100, 100)}%`, background: 'var(--accent-positive)' }} />
            </div>
          </div>
        )}

        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Gastado</p>
              <p className="fa-amount text-xl text-primary">{fmtCorto(total)}</p>
            </div>
            {dias && total > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Por día</p>
                <p className="fa-amount text-sm text-secondary">{fmtCorto(total / dias)}</p>
              </div>
            )}
          </div>

          {v.presupuesto != null && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: colorPresupuesto(pct), transition: 'width .6s' }} />
              </div>
              <p className="mt-1.5 text-[10px] font-medium" style={{ color: colorPresupuesto(pct) }}>
                {pct > 100 ? `Te pasaste ${fmtCorto(total - v.presupuesto)}` : `Queda ${fmtCorto(v.presupuesto - total)} de ${fmtCorto(v.presupuesto)}`}
              </p>
            </>
          )}
        </div>
      </Link>
    </div>
  )
}

/* ── Banner del viaje en curso o del próximo ─────────────────────── */

function BannerViaje({ v, gastado }: { v: Viaje; gastado: number }) {
  const color = colorViaje(v.id)
  const estado = estadoViaje(v)
  const faltan = v.fecha_inicio ? diasHasta(v.fecha_inicio) : null
  const dias = duracionDias(v)
  return (
    <Link href={`/dashboard/viajes/${v.id}`}
      className="fa-lift fa-aparecer relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl p-5 text-white"
      style={{ background: `linear-gradient(120deg, ${color} 0%, color-mix(in srgb, ${color} 45%, #000) 100%)`, boxShadow: '0 12px 30px rgba(0,0,0,.25)' }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-8 text-[140px] leading-none opacity-15">{v.emoji}</span>
      <span className="text-4xl">{v.emoji}</span>
      <div className="relative min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
          {estado === 'en_curso' ? 'Estás de viaje' : 'Tu próximo viaje'}
        </p>
        <p className="truncate text-xl font-extrabold">{v.nombre}{v.destino ? ` · ${v.destino}` : ''}</p>
        <p className="text-xs text-white/80">{fmtRango(v.fecha_inicio, v.fecha_fin)}{dias ? ` · ${dias} días` : ''}</p>
      </div>
      <div className="relative text-right">
        {estado === 'proximo' && faltan !== null ? (
          <>
            <p className="fa-amount text-4xl leading-none">{faltan}</p>
            <p className="text-xs text-white/80">{faltan === 1 ? 'día' : 'días'} para salir</p>
          </>
        ) : (
          <>
            <p className="fa-amount text-2xl leading-none">{fmtCorto(gastado)}</p>
            <p className="text-xs text-white/80">gastado hasta ahora</p>
          </>
        )}
      </div>
    </Link>
  )
}

/* ── Línea de tiempo del año ─────────────────────────────────────── */

function LineaDeTiempo({ viajes, anio, setAnio, gastado }: {
  viajes: Viaje[]; anio: number; setAnio: (a: number) => void; gastado: Record<string, number>
}) {
  const inicioAnio = new Date(anio, 0, 1).getTime()
  const finAnio = new Date(anio + 1, 0, 1).getTime()
  const largoAnio = finAnio - inicioAnio

  const delAnio = viajes
    .filter(v => v.fecha_inicio)
    .map(v => {
      const ini = new Date(v.fecha_inicio! + 'T00:00:00').getTime()
      const fin = new Date((v.fecha_fin ?? v.fecha_inicio)! + 'T23:59:59').getTime()
      return { v, ini, fin }
    })
    .filter(x => x.fin >= inicioAnio && x.ini < finAnio)
    .sort((a, b) => a.ini - b.ini)

  /* carriles: si dos viajes se pisan, van en filas distintas */
  const carriles: number[] = []
  const conCarril = delAnio.map(x => {
    let c = carriles.findIndex(fin => fin < x.ini)
    if (c === -1) { c = carriles.length; carriles.push(x.fin) } else carriles[c] = x.fin
    return { ...x, carril: c }
  })
  const nCarriles = Math.max(1, carriles.length)
  const hoyPct = ((Date.now() - inicioAnio) / largoAnio) * 100
  const anios = Array.from(new Set(viajes.filter(v => v.fecha_inicio).map(v => Number(v.fecha_inicio!.slice(0, 4)))))

  return (
    <section className="fa-card p-5">
      <Titulo
        titulo="Línea de tiempo"
        sub={`${delAnio.length} ${delAnio.length === 1 ? 'viaje' : 'viajes'} en ${anio}`}
        derecha={
          <div className="flex items-center gap-1 rounded-lg bg-alternate p-1">
            <button onClick={() => setAnio(anio - 1)} aria-label="Año anterior" className="rounded-md p-1 text-secondary hover:bg-card hover:text-primary"><ChevronLeft size={15} /></button>
            <span className="min-w-[44px] text-center text-xs font-semibold text-primary">{anio}</span>
            <button onClick={() => setAnio(anio + 1)} aria-label="Año siguiente" className="rounded-md p-1 text-secondary hover:bg-card hover:text-primary"><ChevronRight size={15} /></button>
          </div>
        }
      />

      <div className="relative mt-5">
        {/* meses */}
        <div className="grid grid-cols-12 text-center text-[10px] font-semibold text-muted">
          {MESES.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div className="relative mt-1 rounded-lg" style={{ height: nCarriles * 30 + 12, background: 'var(--bg-alternate)' }}>
          {/* separadores de mes */}
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className="absolute bottom-0 top-0 w-px" style={{ left: `${((i + 1) / 12) * 100}%`, background: 'var(--border-color)', opacity: 0.6 }} />
          ))}
          {/* hoy */}
          {hoyPct > 0 && hoyPct < 100 && (
            <span className="absolute -top-1 bottom-0 w-0.5 rounded" style={{ left: `${hoyPct}%`, background: 'var(--accent-negative)' }} title="Hoy" />
          )}
          {conCarril.map(({ v, ini, fin, carril }) => {
            const left = Math.max(0, ((ini - inicioAnio) / largoAnio) * 100)
            const right = Math.min(100, ((fin - inicioAnio) / largoAnio) * 100)
            const color = colorViaje(v.id)
            return (
              <Link
                key={v.id}
                href={`/dashboard/viajes/${v.id}`}
                title={`${v.nombre} · ${fmtRango(v.fecha_inicio, v.fecha_fin)} · ${fmtARS(gastado[v.id] ?? 0)}`}
                className="absolute flex items-center overflow-hidden rounded-md px-1 text-[11px] font-semibold text-white transition-transform hover:z-10 hover:scale-y-110"
                style={{
                  left: `${left}%`, width: `max(${right - left}%, 22px)`, top: 6 + carril * 30, height: 24,
                  background: color, boxShadow: '0 4px 10px rgba(0,0,0,.25)',
                }}
              >
                <span className="truncate">{v.emoji} {v.nombre}</span>
              </Link>
            )
          })}
          {delAnio.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-muted">Sin viajes con fechas en {anio}</p>
          )}
        </div>
      </div>
      {anios.length > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          Tenés viajes en {anios.sort().join(', ')} · la línea roja es hoy
        </p>
      )}
    </section>
  )
}
