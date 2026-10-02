'use client'

/* ══ Nuevo Resumen (PREVIEW) ══════════════════════════════════════
   Piloto de la nueva generación de FinanzApp. Convive con el Resumen
   actual (no lo reemplaza) para validar dirección visual, jerarquía,
   interacción y movimiento con datos reales.

   Pregunta de la pantalla: "¿cuál es mi situación financiera ahora?"
   Jerarquía:
     PRIMARIO    patrimonio neto · libre para usar
     SECUNDARIO  el mes (entró / salió / quedó / ahorro) · Luca
     CONTEXTUAL  evolución · en qué se fue · plata comprometida
     OPCIONAL    actividad reciente (detalle de cada movimiento)
   Desktop = centro de control (varias columnas, hover, atajos).
   Mobile  = otra composición, no una versión apretada: primero
   disponible → mes → Luca → actividad → compromisos; el análisis se
   abre a demanda.                                                     */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, ChevronDown, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { esLiquida } from '@/lib/patrimonio'
import { infoResumen, type ResumenInfo, type TarjetaInfo } from '@/lib/resumenes'
import { borrarGastoVariable, guardarGastoVariable, pagarConsumos, repararFechasDeCuotas } from '@/lib/movimientos'
import {
  actividad, guardarFotoPatrimonio, categorias, claveMes, compromisos, flujoDelMes, momentoDelMes, nombreMes,
  patrimonio, progresoMetas, ritmoDeGasto, serieMensual, seriePatrimonio,
  type Compromiso, type Snapshot,
} from '@/lib/finanzas/nucleo'
import { generarInsights } from '@/lib/finanzas/insights'
import { snapshotCompartido } from '@/lib/finanzas/compartido'
import { sumarMeses } from '@/lib/ciclos'
import { AgregarMovimientoModal } from '@/components/AgregarMovimientoModal'
import { PagarResumen } from '@/components/tarjetas/Modales'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { DIAS, Encabezado, Pestanas, Revelar, Toasts, fmt, useMedia, useToasts } from '@/components/resumen/base'
import { LibreParaUsar, PatrimonioHero } from '@/components/resumen/Hero'
import { Categorias, FlujoPeriodo, ListaActividad, ListaCompromisos } from '@/components/resumen/Secciones'
import { CapturaLuca, LucaInsights, type GastoDetectado } from '@/components/resumen/Luca'
import { GraficoMensual, type Modo, type PuntoMes } from '@/components/resumen/GraficoMensual'
import { AccionRapida, type AccionTipo } from '@/components/resumen/AccionRapida'
import { useAlCambiarDatos } from '@/lib/eventos'

const MODOS = [
  { key: 'balance', label: 'Balance' },
  { key: 'flujo', label: 'Ingresos y gastos' },
  { key: 'patrimonio', label: 'Patrimonio' },
] as const
const RANGOS = [{ key: '6', label: '6M' }, { key: '12', label: '12M' }] as const

export default function ResumenPage() {
  const router = useRouter()
  const desktop = useMedia('(min-width: 1024px)', true)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const snapRef = useRef<Snapshot | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [mesSel, setMesSel] = useState(() => claveMes(new Date()))
  const [modo, setModo] = useState<Modo>('balance')
  const [rango, setRango] = useState<'6' | '12'>('6')
  const [focoComp, setFocoComp] = useState<string | null>(null)
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [nuevos, setNuevos] = useState<Set<string>>(new Set())
  const [agregar, setAgregar] = useState<'gasto' | 'ingreso' | null>(null)
  const [pagando, setPagando] = useState<{ t: TarjetaInfo; r: ResumenInfo } | null>(null)
  const [hoja, setHoja] = useState(false)
  const [analisis, setAnalisis] = useState(false)
  const [verPatrimonio, setVerPatrimonio] = useState(false)
  const toasts = useToasts()

  /* carga: la primera con skeleton; las siguientes en silencio, para
     que los números "viajen" del valor viejo al nuevo */
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setEstado('cargando')
    try {
      const s = await snapshotCompartido(true)
      const prev = snapRef.current
      if (prev && silencioso) {
        /* lo que llegó recién se resalta en Actividad */
        const antes = new Set(actividad(prev, 40).map(a => a.id))
        const llegaron = actividad(s, 40).filter(a => !antes.has(a.id)).map(a => a.id)
        if (llegaron.length) {
          setNuevos(new Set(llegaron))
          setTimeout(() => setNuevos(new Set()), 2000)
        }
      }
      snapRef.current = s
      setSnap(s)
      /* foto mensual del patrimonio (la usa el gráfico de evolución) */
      guardarFotoPatrimonio(createClient(), s).catch(() => {})
      setEstado('listo')
    } catch {
      if (!silencioso) setEstado('error')
      else toasts.mostrar({ texto: 'No pude actualizar los datos. Probá recargar.', tono: 'error' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    cargar()
    /* una sola vez: corrige las cuotas cargadas con el criterio viejo */
    let hecho = false
    try { hecho = localStorage.getItem('fa_cuotas_por_mes_v1') === 'ok' } catch { /* sin storage */ }
    if (!hecho) {
      repararFechasDeCuotas(createClient()).then(n => {
        try { localStorage.setItem('fa_cuotas_por_mes_v1', 'ok') } catch { /* sin storage */ }
        if (n > 0) cargar(true)
      }).catch(() => {})
    }
  }, [cargar])
  useAlCambiarDatos(useCallback(() => { cargar(true) }, [cargar]))

  /* ── todo lo derivado sale del núcleo ─────────────────────────── */
  const d = useMemo(() => {
    if (!snap) return null
    const p = patrimonio(snap)
    const comp = compromisos(snap, 30)
    const actual = claveMes(snap.hoy)
    const flujoActual = flujoDelMes(snap, actual)
    const serie = serieMensual(snap, 12)
    const ritmo = ritmoDeGasto(snap)
    const catsActual = categorias(snap, actual)
    const metas = progresoMetas(snap)
    const m = momentoDelMes(snap.hoy)
    return {
      p, comp, actual, serie, ritmo, metas, m,
      seriePat: seriePatrimonio(snap, p),
      insights: generarInsights({ s: snap, p, flujo: flujoActual, ritmo, comp, cats: catsActual, metas, momento: m.momento }),
      primerMes: serie[0]?.mes ?? actual,
    }
  }, [snap])

  const flujo = useMemo(() => (snap ? flujoDelMes(snap, mesSel) : null), [snap, mesSel])
  const cats = useMemo(() => (snap ? categorias(snap, mesSel) : []), [snap, mesSel])
  const act = useMemo(() => (snap ? actividad(snap, desktop ? 8 : 5, catFiltro) : []), [snap, desktop, catFiltro])

  /* ── acciones ─────────────────────────────────────────────────── */
  async function guardarDesdeLuca(g: GastoDetectado): Promise<string | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Tu sesión venció. Volvé a entrar.'
    const r = await guardarGastoVariable(supabase, user.id, {
      nombre: g.nombre, monto: Number(g.monto), categoria: g.categoria, fecha: g.fecha,
      medio_pago: g.medio_pago, forma_pago: g.forma_pago,
      cuotas: g.forma_pago === 'credito' ? g.cuotas : undefined,
      moneda: g.moneda === 'USD' ? 'USD' : 'ARS',
    })
    if (r.error && !r.guardado) return 'No se pudo guardar el gasto.'
    setHoja(false)
    await cargar(true)
    const guardado = r.guardado
    toasts.mostrar({
      texto: `Gasto registrado: ${g.nombre} · ${fmt(g.monto)}`,
      deshacer: guardado?.id ? async () => {
        await borrarGastoVariable(createClient(), guardado, !!guardado.compra_id)
        await cargar(true)
        toasts.mostrar({ texto: 'Listo, lo deshice.', tono: 'info' }, 3000)
      } : undefined,
    }, 8000)
    if (r.avisoSaldoNegativo) toasts.mostrar({ texto: r.avisoSaldoNegativo, tono: 'info' }, 9000)
    if (r.error) toasts.mostrar({ texto: r.error, tono: 'error' }, 9000)
    return null
  }

  function abrirPago(c: Compromiso | null) {
    if (!snap) return
    if (!c || c.tipo !== 'tarjeta') { router.push('/dashboard/tarjetas'); return }
    const [tid, clave] = c.id.split(':')
    const t = snap.tarjetas.find(x => x.id === tid)
    if (!t) { router.push('/dashboard/tarjetas'); return }
    setPagando({ t, r: infoResumen(clave, t, snap.consumosImpagos, snap.dolar) })
  }

  async function pagar(lineaARS: string | null, lineaUSD: string | null) {
    if (!pagando) return null
    const { error } = await pagarConsumos(createClient(), pagando.r.consumos, lineaARS, lineaUSD)
    if (error) return error
    const nombre = pagando.t.nombre
    setPagando(null)
    await cargar(true)
    toasts.mostrar({ texto: `Pagaste el resumen de ${nombre}.` })
    return null
  }

  function accion(a: AccionTipo) {
    if (a === 'gasto' || a === 'ingreso') setAgregar(a)
    else if (a === 'transferencia') router.push('/dashboard/billeteras')
    else if (a === 'inversion') router.push('/dashboard/inversiones')
    else abrirPago(d?.comp.items.find(i => i.tipo === 'tarjeta') ?? null)
  }

  /* ── estados de carga / error ─────────────────────────────────── */
  if (estado === 'error') {
    return (
      <div className="fa-page-in mx-auto mt-10 max-w-md rounded-2xl border p-8 text-center fa-hairline">
        <LucaAvatar estado="sad" size={56} className="mx-auto" />
        <p className="mt-4 font-semibold text-primary">No pude traer tus datos</p>
        <p className="mt-1 text-sm text-secondary">Puede ser la conexión. Tus datos están a salvo.</p>
        <button onClick={() => cargar()} className="fa-press mt-5 rounded-lg bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover">Reintentar</button>
      </div>
    )
  }
  if (estado === 'cargando' || !snap || !d || !flujo) return <SkeletonNuevoResumen desktop={desktop} />

  const { p, comp, serie, ritmo, m } = d
  const esActual = mesSel === d.actual
  const datosGrafico: PuntoMes[] = (modo === 'patrimonio'
    ? d.seriePat.map((x): PuntoMes => ({ mes: x.mes, patrimonio: x.neto }))
    : serie.map((f): PuntoMes => ({ mes: f.mes, ingresos: f.ingresos.total, gastos: f.gastos.total, balance: f.balance }))
  ).slice(-Number(rango))
  const hoy = snap.hoy
  const contexto = m.momento === 'inicio' ? 'Arranque de mes' : m.momento === 'cierre' ? `Cierre de mes · ${m.restan === 0 ? 'último día' : `faltan ${m.restan} ${m.restan === 1 ? 'día' : 'días'}`}` : 'Mitad de mes'
  const proximaTarjeta = comp.items.find(i => i.tipo === 'tarjeta')
  const vacio = snap.lineas.length === 0 && serie.every(f => !f.conDatos)

  const flujoProps = {
    flujo, esActual, ritmo,
    puedeAtras: mesSel > d.primerMes,
    puedeAdelante: mesSel < d.actual,
    onMover: (dir: -1 | 1) => setMesSel(k => sumarMeses(k, dir)),
    onHoy: () => setMesSel(d.actual),
  }

  const evolucion = (
    <section aria-labelledby="t-evo" className="min-w-0">
      <Encabezado id="t-evo" titulo="Evolución"
        sub={modo === 'balance' ? '¿Cerré cada mes en positivo? · click en un mes para verlo arriba'
          : modo === 'flujo' ? '¿Entra más de lo que sale?' : '¿Cómo evolucionó lo que tengo? (foto de cada fin de mes)'}
        derecha={<div className="flex flex-wrap gap-2">
          <Pestanas etiqueta="Qué mostrar" opciones={MODOS} valor={modo} onCambio={setModo} />
          <Pestanas etiqueta="Período" opciones={RANGOS} valor={rango} onCambio={setRango} />
        </div>} />
      {modo === 'flujo' && (
        <div className="mt-3 flex gap-4 text-xs text-secondary" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: 'var(--accent-positive)' }} />Ingresos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: 'var(--accent-negative)' }} />Gastos</span>
        </div>
      )}
      <div className="mt-3">
        {datosGrafico.length >= 2 ? (
          <GraficoMensual key={`${modo}-${rango}`} datos={datosGrafico} modo={modo}
            mesSel={modo === 'patrimonio' ? null : mesSel}
            onElegir={modo === 'patrimonio' ? undefined : k => setMesSel(k)} alto={desktop ? 290 : 210} />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-secondary fa-hairline">
            {modo === 'patrimonio' ? 'La evolución del patrimonio arranca con la foto de cada mes: el mes que viene vas a ver la primera línea.' : 'Con dos meses de datos aparece la evolución.'}
          </p>
        )}
      </div>
      <TablaAccesible datos={datosGrafico} modo={modo} />
    </section>
  )

  const categoriasBloque = (
    <Categorias cats={cats} mes={mesSel} esActual={esActual} seleccion={catFiltro}
      onSeleccion={c => { setCatFiltro(c); if (c) setTimeout(() => document.getElementById('t-act')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60) }} />
  )

  return (
    <div className="fa-page-in mx-auto flex max-w-[1480px] flex-col gap-6 pb-6 lg:gap-7">
      {/* ── contexto + acciones ── */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Resumen</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-primary lg:text-2xl">
            <span className="capitalize">{DIAS[hoy.getDay()]}</span> {hoy.getDate()} de {nombreMes(claveMes(hoy))}
          </h1>
          <p className="text-xs text-secondary">{contexto}{proximaTarjeta?.fecha ? ` · próximo vencimiento: ${proximaTarjeta.titulo.replace('Resumen ', '')}` : ''}</p>
          <Link href="/dashboard/resumen-clasico" className="mt-1 inline-block text-[11px] text-muted hover:text-primary">Ver el Resumen clásico</Link>
        </div>
        {desktop ? (
          <div className="flex w-full items-start gap-3 xl:w-auto xl:min-w-[560px]">
            <div className="min-w-0 flex-1"><CapturaLuca onGuardar={guardarDesdeLuca} flotante /></div>
            <AccionRapida onAccion={accion} pagoHint={proximaTarjeta ? `${proximaTarjeta.titulo} · ${fmt(proximaTarjeta.monto)}` : null} />
          </div>
        ) : (
          <button onClick={() => setHoja(true)}
            className="fa-press flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm text-muted fa-hairline"
            style={{ background: 'var(--bg-input)' }}>
            <LucaAvatar estado="idle" size={26} />
            <span className="flex-1">Contale a Luca un gasto…</span>
            <MessageCircle size={16} />
          </button>
        )}
      </header>

      {vacio ? (
        <div className="rounded-2xl border p-10 text-center fa-hairline">
          <LucaAvatar estado="idle" size={64} className="mx-auto" />
          <p className="mt-4 font-semibold text-primary">Empecemos por tu plata de hoy</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-secondary">Cargá tus billeteras (cuánto tenés en cada una) y tu primer gasto: con eso ya te muestro patrimonio, disponible y el mes.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/dashboard/billeteras" className="fa-press rounded-lg bg-confirm px-4 py-2 text-sm font-semibold text-white">Cargar billeteras</Link>
            <button onClick={() => setAgregar('gasto')} className="fa-press rounded-lg border px-4 py-2 text-sm font-semibold text-primary fa-hairline">Registrar un gasto</button>
          </div>
        </div>
      ) : desktop ? (
        /* ════════ DESKTOP: centro de control ════════ */
        <>
          <Revelar>
            <div className="fa-panel grid grid-cols-12 overflow-hidden">
              <div className="col-span-7 p-7"><PatrimonioHero p={p} serie={d.seriePat} /></div>
              <div className="col-span-5 border-l p-7 fa-hairline" style={{ background: 'color-mix(in srgb, var(--bg-alternate) 45%, var(--bg-card))' }}>
                <LibreParaUsar p={p} comp={comp} foco={focoComp} onFoco={setFocoComp} />
              </div>
            </div>
          </Revelar>

          <div className="grid grid-cols-12 gap-7">
            <Revelar className="col-span-7 px-1 pt-1"><FlujoPeriodo {...flujoProps} /></Revelar>
            <Revelar className="col-span-5" demora={60}><LucaInsights insights={d.insights} /></Revelar>
          </div>

          <div className="grid grid-cols-12 gap-7">
            <Revelar className="fa-panel col-span-8 p-6">{evolucion}</Revelar>
            <Revelar className="fa-panel col-span-4 p-6" demora={60} id="categorias">{categoriasBloque}</Revelar>
          </div>

          <div className="grid grid-cols-12 gap-7">
            <Revelar className="col-span-5 px-1"><ListaCompromisos comp={comp} foco={focoComp} onFoco={setFocoComp} onPagar={abrirPago} /></Revelar>
            <Revelar className="col-span-7 px-1" demora={60}>
              <ListaActividad items={act} filtro={catFiltro} onLimpiar={() => setCatFiltro(null)} nuevos={nuevos} />
            </Revelar>
          </div>
        </>
      ) : (
        /* ════════ MOBILE: prioridades de una mano ════════ */
        <>
          <section className="fa-panel p-5">
            <LibreParaUsar p={p} comp={comp} foco={focoComp} onFoco={setFocoComp} />
            <button onClick={() => setVerPatrimonio(v => !v)} aria-expanded={verPatrimonio}
              className="fa-press mt-4 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm fa-hairline">
              <span className="text-secondary">Patrimonio neto</span>
              <span className="flex items-center gap-2 font-semibold tabular-nums text-primary">{fmt(p.neto)}
                <ChevronDown size={15} className="text-muted" style={{ transform: verPatrimonio ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} /></span>
            </button>
            <div className="fa-colapsable" data-abierto={verPatrimonio}>
              <div><div className="pt-4">{verPatrimonio && <PatrimonioHero p={p} serie={d.seriePat} compacto />}</div></div>
            </div>
          </section>

          <section className="px-1"><FlujoPeriodo {...flujoProps} compacto /></section>

          <LucaInsights insights={d.insights} />

          <Revelar className="px-1">
            <ListaActividad items={act} filtro={catFiltro} onLimpiar={() => setCatFiltro(null)} nuevos={nuevos} />
          </Revelar>

          <Revelar className="px-1">
            <ListaCompromisos comp={comp} foco={focoComp} onFoco={setFocoComp} onPagar={abrirPago} />
          </Revelar>

          <section className="fa-panel overflow-hidden">
            <button onClick={() => setAnalisis(v => !v)} aria-expanded={analisis}
              className="fa-press flex w-full items-center gap-3 px-5 py-4 text-left">
              <BarChart3 size={18} className="text-info" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-primary">Análisis</span>
                <span className="block text-xs text-secondary">Evolución y en qué se fue la plata</span>
              </span>
              <ChevronDown size={16} className="text-muted" style={{ transform: analisis ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur-std) var(--ease-out)' }} />
            </button>
            <div className="fa-colapsable" data-abierto={analisis}>
              <div>
                {analisis && (
                  <div className="space-y-8 border-t px-5 pb-6 pt-5 fa-hairline">
                    {evolucion}
                    <div id="categorias">{categoriasBloque}</div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── hoja de captura (mobile) ── */}
      {hoja && !desktop && (
        <div className="fixed inset-0 z-[55] flex items-end" role="dialog" aria-modal="true" aria-label="Contale a Luca">
          <button className="fa-fade-in absolute inset-0 bg-black/60" aria-label="Cerrar" onClick={() => setHoja(false)} />
          <div className="fa-sheet-up relative w-full rounded-t-3xl border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] fa-hairline"
            style={{ background: 'var(--bg-card)' }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: 'var(--border-color)' }} />
            <p className="mb-3 text-sm font-semibold text-primary">Contale a Luca</p>
            <CapturaLuca onGuardar={guardarDesdeLuca} autoFoco />
            <p className="mt-3 text-[11px] text-muted">Ej: “uber 4500”, “super 32 mil con naranja en 3 cuotas”.</p>
          </div>
        </div>
      )}

      {agregar && (
        <AgregarMovimientoModal defaultTab={agregar} onClose={() => setAgregar(null)}
          onSaved={() => { cargar(true); toasts.mostrar({ texto: agregar === 'gasto' ? 'Gasto guardado.' : 'Ingreso guardado.' }) }} />
      )}
      {pagando && (
        <PagarResumen tarjeta={pagando.t} resumen={pagando.r} lineas={snap.lineas.filter(esLiquida)}
          onPagar={pagar} onCerrar={() => setPagando(null)} />
      )}

      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}

/* ── tabla accesible del gráfico (lectores de pantalla / quien prefiera números) ── */
function TablaAccesible({ datos, modo }: { datos: PuntoMes[]; modo: Modo }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setVer(v => !v)} aria-expanded={ver} className="text-[11px] font-semibold text-muted hover:text-primary">
        {ver ? 'Ocultar tabla' : 'Ver como tabla'}
      </button>
      <div className="fa-colapsable" data-abierto={ver}>
        <div>
          {ver && (
            <table className="mt-2 w-full text-xs tabular-nums">
              <thead className="text-muted">
                <tr><th className="py-1 text-left font-medium">Mes</th>
                  {modo === 'patrimonio' ? <th className="text-right font-medium">Patrimonio</th> : <>
                    <th className="text-right font-medium">Entró</th><th className="text-right font-medium">Salió</th><th className="text-right font-medium">Quedó</th></>}
                </tr>
              </thead>
              <tbody className="text-primary">
                {datos.map(x => (
                  <tr key={x.mes} className="border-t fa-hairline">
                    <td className="py-1 capitalize">{nombreMes(x.mes)} {x.mes.slice(2, 4)}</td>
                    {modo === 'patrimonio' ? <td className="text-right">{fmt(x.patrimonio ?? 0)}</td> : <>
                      <td className="text-right">{fmt(x.ingresos ?? 0)}</td><td className="text-right">{fmt(x.gastos ?? 0)}</td><td className="text-right font-semibold">{fmt(x.balance ?? 0)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── skeleton con la forma real de la pantalla ── */
function SkeletonNuevoResumen({ desktop }: { desktop: boolean }) {
  const B = ({ c }: { c: string }) => <div className={`animate-pulse rounded-lg ${c}`} style={{ background: 'var(--bg-alternate)' }} />
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-7" aria-busy="true" aria-label="Cargando tu resumen">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2"><B c="h-4 w-24" /><B c="h-7 w-64" /><B c="h-3 w-40" /></div>
        {desktop && <><B c="h-12 w-[420px] rounded-2xl" /><B c="h-11 w-32 rounded-xl" /></>}
      </div>
      <div className="fa-panel grid grid-cols-12 gap-6 p-7">
        <div className="col-span-12 space-y-3 lg:col-span-7">
          <div className="flex items-center gap-3"><LucaAvatar estado="thinking" size={22} /><B c="h-3 w-28" /></div>
          <B c="h-14 w-72" /><B c="h-4 w-48" /><B c="mt-4 h-2.5 w-full" /><div className="grid grid-cols-3 gap-3 pt-2"><B c="h-12" /><B c="h-12" /><B c="h-12" /></div>
        </div>
        {desktop && <div className="col-span-5 space-y-3"><B c="h-3 w-28" /><B c="h-10 w-48" /><B c="h-2 w-full" /><B c="h-2 w-3/4" /><B c="h-6 w-full" /></div>}
      </div>
      <div className="grid grid-cols-12 gap-7">
        <div className="col-span-12 grid grid-cols-2 gap-4 lg:col-span-7 xl:grid-cols-4"><B c="h-20" /><B c="h-20" /><B c="h-20" /><B c="h-20" /></div>
        <B c="col-span-12 h-44 rounded-2xl lg:col-span-5" />
      </div>
      {desktop && <div className="grid grid-cols-12 gap-7"><B c="col-span-8 h-72 rounded-2xl" /><B c="col-span-4 h-72 rounded-2xl" /></div>}
    </div>
  )
}
