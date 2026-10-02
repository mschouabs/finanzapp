'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, GripVertical, Lightbulb, Pencil, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { detectarCategoria } from '@/lib/parser'
import { borrarConDeshacer, deshacerPago, guardarGastoVariable, pagarConsumos, restaurarGastos } from '@/lib/movimientos'
import { esLiquida, traerCotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { diasEntre, etiquetaMes, fmtDiaMes, mejorTarjetaHoy, resumenDeCompra, sumarMeses } from '@/lib/ciclos'
import {
  COLUMNAS_CONSUMO, avisosDeVencimiento, comprasEnCuotas, compromisosPorMes, enPesos, estadoTarjeta,
  type Consumo, type EstadoTarjeta, type ResumenInfo, type TarjetaInfo,
} from '@/lib/resumenes'
import { GrillaOrdenable, type HandleProps } from '@/components/GrillaOrdenable'
import { SkeletonPagina } from '@/components/ui/Piezas'
import { LucaMensaje } from '@/components/luca/LucaMensaje'
import { AnilloLimite, TarjetaVisual, colorTarjeta, fmt, fmtCorto } from '@/components/tarjetas/TarjetaVisual'
import { EditarTarjeta, PagarResumen, type DatosTarjeta } from '@/components/tarjetas/Modales'
import { DetalleTarjeta } from '@/components/tarjetas/DetalleTarjeta'
import { hoyISO } from '@/lib/fechas'
import { EVENTO_DATOS } from '@/lib/eventos'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import { Confirmar, Encabezado, NumeroAnimado, Toasts, useToasts } from '@/components/resumen/base'


export default function TarjetasPage() {
  const [tarjetas, setTarjetas] = useState<TarjetaInfo[]>([])
  const [consumos, setConsumos] = useState<Consumo[]>([])
  const [lineas, setLineas] = useState<LineaSaldo[]>([])
  const [dolar, setDolar] = useState(1560)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<TarjetaInfo | 'nueva' | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [pagando, setPagando] = useState<{ t: TarjetaInfo; r: ResumenInfo } | null>(null)
  const [consumoForm, setConsumoForm] = useState<string | null>(null)
  const formVacio = { nombre: '', monto: '', moneda: 'ARS' as 'ARS' | 'USD', cuotas: '1', cuotaInicial: '1', fecha: hoyISO() }
  const [form, setForm] = useState(formVacio)
  const toasts = useToasts()
  const [confirmar, setConfirmar] = useState<
    | { tipo: 'tarjeta'; t: TarjetaInfo }
    | { tipo: 'deshacer'; r: ResumenInfo }
    | { tipo: 'compra'; c: Consumo }
    | null
  >(null)
  const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_DATOS))

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ts, error: e1 }, { data: cs, error: e2 }, { data: ls }] = await Promise.all([
      supabase.from('tarjetas_cuentas').select('*').eq('tipo', 'tarjeta')
        .order('orden', { ascending: true, nullsFirst: false }).order('created_at'),
      supabase.from('gastos_variables').select(COLUMNAS_CONSUMO).eq('forma_pago', 'credito'),
      supabase.from('inversiones').select('*'),
    ])
    if (e1 || e2) setError('No se pudieron cargar las tarjetas. Probá recargar.')
    setTarjetas((ts ?? []) as TarjetaInfo[])
    setConsumos((cs ?? []) as Consumo[])
    setLineas(((ls ?? []) as LineaSaldo[]).filter(esLiquida))
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
    traerCotizaciones().then(c => { if (c.dolar) setDolar(c.dolar) })
  }, [cargar])

  const estados = useMemo(() => tarjetas.map(t => estadoTarjeta(t, consumos, dolar)), [tarjetas, consumos, dolar])
  const porId = useMemo(() => new Map(estados.map(e => [e.tarjeta.id, e])), [estados])
  const mejor = useMemo(() => mejorTarjetaHoy(tarjetas), [tarjetas])
  const avisos = useMemo(() => avisosDeVencimiento(estados, dolar, 10), [estados, dolar])
  const compromisos = useMemo(() => compromisosPorMes(tarjetas, consumos, dolar, 6), [tarjetas, consumos, dolar])
  const cuotas = useMemo(() => comprasEnCuotas(tarjetas, consumos), [tarjetas, consumos])

  const deudaTotal = estados.reduce((s, e) => s + e.deuda, 0)
  const limiteTotal = estados.reduce((s, e) => s + e.limite, 0)
  const proximo = estados
    .filter(e => e.aPagar && enPesos({ ars: e.aPagar.totales.pendArs, usd: e.aPagar.totales.pendUsd }, dolar) > 0)
    .sort((a, b) => a.aPagar!.vencimiento.getTime() - b.aPagar!.vencimiento.getTime())[0]

  /* ── acciones ──────────────────────────── */

  async function guardarTarjeta(d: DatosTarjeta): Promise<string | null> {
    const supabase = createClient()
    const fila = {
      nombre: d.nombre.trim(), marca: d.marca, tipo: 'tarjeta',
      limite: Number(d.limite) || 0,
      cierre: Number(d.cierre) || null,
      vencimiento: Number(d.vencimiento) || null,
      ultimos4: d.ultimos4 || null,
    }
    if (editando && editando !== 'nueva') {
      const { error: e } = await supabase.from('tarjetas_cuentas').update(fila).eq('id', editando.id)
      if (e) return 'No se pudo guardar.'
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'Sesión vencida.'
      const { error: e } = await supabase.from('tarjetas_cuentas').insert({ ...fila, user_id: user.id, orden: tarjetas.length })
      if (e) return 'No se pudo crear la tarjeta.'
    }
    setEditando(null)
    cargar()
    return null
  }

  async function borrarTarjeta(t: TarjetaInfo) {
    setConfirmar(null)
    const supabase = createClient()
    await supabase.from('tarjetas_cuentas').delete().eq('id', t.id)
    setEditando(null)
    setDetalle(null)
    await cargar()
    toasts.mostrar({ texto: `Eliminaste ${t.nombre}.` }, 4000)
  }

  const reordenar = useCallback(async (ids: string[]) => {
    setTarjetas(prev => ids.map((id, i) => ({ ...prev.find(t => t.id === id)!, orden: i })))
    const supabase = createClient()
    await Promise.all(ids.map((id, i) => supabase.from('tarjetas_cuentas').update({ orden: i }).eq('id', id)))
  }, [])

  async function registrarConsumo(t: TarjetaInfo) {
    if (!form.nombre.trim() || !form.monto) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: e } = await guardarGastoVariable(supabase, user.id, {
      nombre: form.nombre.trim(),
      monto: Number(form.monto),
      moneda: form.moneda,
      fecha: form.fecha,
      categoria: detectarCategoria(form.nombre),
      medio_pago: t.nombre,
      forma_pago: 'credito',
      cuotas: Number(form.cuotas) || 1,
      cuotaInicial: Number(form.cuotaInicial) || 1,
    })
    if (e) { setError('No se pudo registrar el consumo.'); return }
    const nombre = form.nombre.trim(), cuotasN = Number(form.cuotas) || 1
    setConsumoForm(null)
    setForm(formVacio)
    await cargar()
    avisarCambio()
    toasts.mostrar({ texto: `Consumo registrado en ${t.nombre}: ${nombre}${cuotasN > 1 ? ` en ${cuotasN} cuotas` : ''}` }, 4000)
  }

  async function pagar(lineaARS: string | null, lineaUSD: string | null): Promise<string | null> {
    if (!pagando) return null
    const supabase = createClient()
    const { error: e } = await pagarConsumos(supabase, pagando.r.consumos, lineaARS, lineaUSD)
    if (e) return e
    const nombre = pagando.t.nombre
    setPagando(null)
    await cargar()
    avisarCambio()
    toasts.mostrar({ texto: `Pagaste el resumen de ${nombre}.` }, 4000)
    return null
  }

  async function deshacer(r: ResumenInfo) {
    setConfirmar(null)
    const supabase = createClient()
    await deshacerPago(supabase, r.consumos)
    await cargar()
    avisarCambio()
    toasts.mostrar({ texto: 'Deshiciste el pago: la plata volvió a su cuenta.', tono: 'info' }, 4000)
  }

  async function mover(c: Consumo, tarjetaId: string) {
    const destino = tarjetas.find(t => t.id === tarjetaId)
    if (!destino) return
    const supabase = createClient()
    /* si es una cuota, se mueve la compra entera y cada cuota cae en
       el resumen que le toca en la tarjeta nueva */
    /* solo lo que falta pagar: las cuotas ya pagadas quedan como historia */
    const filas = (c.compra_id ? consumos.filter(x => x.compra_id === c.compra_id) : [c])
      .filter(f => !f.pagado)
      .sort((a, b) => (a.cuota_numero ?? 1) - (b.cuota_numero ?? 1))
    if (!filas.length) return
    const primero = resumenDeCompra(filas[0].fecha, destino)
    const base = filas[0].cuota_numero ?? 1
    await Promise.all(filas.map(f => supabase.from('gastos_variables').update({
      tarjeta_id: destino.id,
      resumen: sumarMeses(primero, (f.cuota_numero ?? 1) - base),
    }).eq('id', f.id)))
    await cargar()
    toasts.mostrar({ texto: `Moviste "${c.nombre}" a ${destino.nombre}.` }, 4000)
  }

  /* una cuota pide confirmación (se borra la compra entera); un consumo
     suelto se borra directo, con "Deshacer" */
  function pedirBorrarConsumo(c: Consumo) {
    if (c.compra_id && (c.cuotas_total ?? 1) > 1) setConfirmar({ tipo: 'compra', c })
    else borrarConsumo(c, false)
  }

  async function borrarConsumo(c: Consumo, compraCompleta: boolean) {
    setConfirmar(null)
    const filas = await borrarConDeshacer(createClient(), { id: c.id, compra_id: c.compra_id }, compraCompleta)
    await cargar()
    avisarCambio()
    toasts.mostrar({
      texto: compraCompleta ? `Borraste la compra "${c.nombre}"` : `Borraste "${c.nombre}"`,
      deshacer: async () => { await restaurarGastos(createClient(), filas); await cargar(); avisarCambio() },
    }, 8000)
  }

  /* ── render ────────────────────────────── */

  if (loading) {
    return <SkeletonPagina kpis={4} />
  }

  const renderTarjeta = (e: EstadoTarjeta, handle: HandleProps) => {
    const t = e.tarjeta
    const r = e.aPagar
    const pend = r ? enPesos({ ars: r.totales.pendArs, usd: r.totales.pendUsd }, dolar) : 0
    const dias = r ? diasEntre(new Date(), r.vencimiento) : 0
    const cerrado = r && r.clave !== e.abierto.clave
    return (
      <div className="fa-panel flex h-full flex-col gap-4 p-4">
        <div className="flex items-center gap-1">
          <button type="button" {...handle} className="rounded p-1 text-muted hover:bg-alternate hover:text-primary"><GripVertical size={16} /></button>
          <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-secondary">{t.nombre}</span>
          <button onClick={() => setEditando(t)} aria-label={`Editar ${t.nombre}`} className="rounded p-1 text-muted hover:bg-alternate hover:text-primary"><Pencil size={14} /></button>
        </div>

        <TarjetaVisual e={e} onAbrir={() => setDetalle(t.id)} />

        {/* estado del pago */}
        {r && pend > 0 ? (
          <div className={`flex items-center justify-between gap-3 rounded-xl p-3 ${cerrado && dias < 0 ? '' : 'bg-alternate'}`}
            style={cerrado && dias < 0 ? { background: 'color-mix(in srgb, var(--accent-negative) 12%, transparent)' } : undefined}>
            <div className="min-w-0">
              <p className="fa-caption">
                {cerrado ? (dias < 0 ? `Vencido hace ${-dias} días` : `A pagar · vence ${fmtDiaMes(r.vencimiento)} (en ${dias} ${dias === 1 ? 'día' : 'días'})`)
                  : `Resumen abierto · vence ${fmtDiaMes(r.vencimiento)}`}
              </p>
              <p className={`fa-num-lg ${cerrado && dias < 0 ? 'text-negative' : 'text-primary'}`}>{fmt(pend)}</p>
            </div>
            <button onClick={() => setPagando({ t, r })}
              className="shrink-0 rounded-lg bg-confirm px-3 py-2 text-xs font-semibold text-white hover:bg-confirm-hover">
              {cerrado ? 'Pagar' : 'Adelantar'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-alternate p-3 text-xs text-secondary">
            <CheckCircle2 size={16} className="text-positive" /> No tenés nada pendiente de pago
          </div>
        )}

        <AnilloLimite e={e} />

        {/* registrar consumo */}
        {consumoForm === t.id ? (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <input autoFocus placeholder="¿Qué compraste?" value={form.nombre}
              onChange={ev => setForm({ ...form, nombre: ev.target.value })}
              className="rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
            <div className="flex gap-2">
              <select value={form.moneda} onChange={ev => setForm({ ...form, moneda: ev.target.value as 'ARS' | 'USD' })}
                aria-label="Moneda" className="rounded-lg border bg-field px-2 py-2 text-sm text-primary">
                <option value="ARS">$</option><option value="USD">US$</option>
              </select>
              <input placeholder="Monto total" type="number" inputMode="decimal" value={form.monto}
                onChange={ev => setForm({ ...form, monto: ev.target.value })}
                className="min-w-0 flex-1 rounded-lg border bg-field px-3 py-2 text-sm text-primary" />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-secondary">
                Cuotas
                <input type="number" min={1} max={48} value={form.cuotas}
                  onChange={ev => {
                    const cuotas = ev.target.value
                    setForm(f => ({ ...f, cuotas, cuotaInicial: Number(f.cuotaInicial) > Number(cuotas) ? cuotas : f.cuotaInicial }))
                  }}
                  className="w-16 rounded-lg border bg-field px-2 py-2 text-sm text-primary" />
              </label>
              {Number(form.cuotas) > 1 && (
                <label className="flex items-center gap-1.5 text-xs text-secondary">
                  Vamos por la
                  <input type="number" min={1} max={Number(form.cuotas) || 1} value={form.cuotaInicial}
                    onChange={ev => setForm({ ...form, cuotaInicial: ev.target.value })}
                    className="w-16 rounded-lg border bg-field px-2 py-2 text-sm text-primary" />
                </label>
              )}
              <input type="date" value={form.fecha} onChange={ev => setForm({ ...form, fecha: ev.target.value })}
                aria-label={Number(form.cuotaInicial) > 1 ? 'Fecha de esta cuota' : 'Fecha de compra'}
                className="min-w-0 flex-1 rounded-lg border bg-field px-2 py-2 text-sm text-primary" />
            </div>
            {Number(form.cuotas) > 1 && Number(form.monto) > 0 && (() => {
              const cuotas = Number(form.cuotas)
              const cuotaInicial = Math.min(cuotas, Math.max(1, Number(form.cuotaInicial) || 1))
              const montoCuota = Number(form.monto) / cuotas
              const signo = form.moneda === 'USD' ? 'US$ ' : '$'
              return (
                <p className="text-[11px] text-secondary">
                  {cuotaInicial > 1
                    ? <>Cuota {cuotaInicial}/{cuotas} de {signo}{montoCuota.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        {' '}· entra en el resumen de {etiquetaMes(resumenDeCompra(form.fecha, t))} · las {cuotaInicial - 1} anteriores no se cargan (ya pagadas)</>
                    : <>{cuotas} cuotas de {signo}{montoCuota.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        {' '}· la primera entra en el resumen de {etiquetaMes(resumenDeCompra(form.fecha, t))}</>}
                </p>
              )
            })()}
            <div className="flex gap-2">
              <button onClick={() => registrarConsumo(t)} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: colorTarjeta(t.marca) }}>Guardar</button>
              <button onClick={() => setConsumoForm(null)} className="rounded-lg border px-3 py-2 text-sm text-secondary hover:bg-alternate">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setConsumoForm(t.id); setForm(formVacio) }}
            className="mt-auto w-full rounded-xl border border-dashed py-2.5 text-sm text-secondary hover:bg-alternate hover:text-primary">
            + Registrar consumo
          </button>
        )}
      </div>
    )
  }

  const detalleEstado = detalle ? porId.get(detalle) : null

  return (
    <div className="fa-page-in mx-auto flex max-w-[1480px] flex-col gap-7 pb-6">
      {/* encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Tarjetas</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-primary lg:text-2xl">Lo que ya gastaste a crédito</h1>
        </div>
        <button onClick={() => setEditando('nueva')}
          className="fa-press flex h-11 items-center gap-1.5 rounded-xl bg-confirm px-4 text-sm font-semibold text-white hover:bg-confirm-hover">
          <Plus size={16} strokeWidth={2.5} /> Agregar tarjeta
        </button>
      </header>

      {error && <p className="text-sm text-negative" role="alert">{error}</p>}

      {tarjetas.length === 0 ? (
        <div className="fa-panel p-8">
          <LucaMensaje variante="vacio" estado="sad" titulo="Todavía no cargaste ninguna tarjeta"
            accion={{ label: '+ Agregar tarjeta', onClick: () => setEditando('nueva') }}>
            Agregá tus tarjetas con su día de cierre y vencimiento para ver tus resúmenes y cuotas.
          </LucaMensaje>
        </div>
      ) : (
        <>
          {/* lo principal: cuánto debés y qué se viene */}
          <section aria-label="Deuda en tarjetas" className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-4">
              <p className="fa-label">Deuda total</p>
              <NumeroAnimado valor={deudaTotal} contarAlInicio className="mt-1 block text-[clamp(2.2rem,3.8vw,3rem)] font-extrabold leading-none tracking-tight tabular-nums text-primary" />
              <p className="mt-2 text-xs text-secondary">Resúmenes abiertos, a pagar y cuotas futuras, en pesos al dólar de hoy.</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:col-span-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">Próximo vencimiento</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-primary">
                  {proximo?.aPagar ? fmt(enPesos({ ars: proximo.aPagar.totales.pendArs, usd: proximo.aPagar.totales.pendUsd }, dolar)) : 'Nada'}
                </p>
                <p className="text-[11px] text-muted">{proximo?.aPagar ? `${proximo.tarjeta.nombre} · ${fmtDiaMes(proximo.aPagar.vencimiento)}` : 'estás al día'}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">Disponible para gastar</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-primary">{limiteTotal ? fmt(limiteTotal - deudaTotal) : '—'}</p>
                {limiteTotal ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                    <div className="fa-grow-x h-full rounded-full" style={{
                      width: `${Math.min(100, (deudaTotal / limiteTotal) * 100)}%`,
                      background: deudaTotal / limiteTotal > 0.8 ? 'var(--accent-negative)' : deudaTotal / limiteTotal > 0.5 ? 'var(--accent-warning)' : 'var(--accent-secondary)',
                    }} />
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">{limiteTotal ? `usás ${Math.round((deudaTotal / limiteTotal) * 100)}% de ${fmtCorto(limiteTotal)}` : 'cargá los límites'}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-secondary">Compras en cuotas</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-primary">{cuotas.length}</p>
                <p className="text-[11px] text-muted">{cuotas.length ? `quedan ${fmtCorto(cuotas.reduce((s, c) => s + (c.moneda === 'USD' ? c.restante * dolar : c.restante), 0))}` : 'ninguna activa'}</p>
              </div>
            </div>
          </section>

          {/* avisos de vencimiento */}
          {avisos.length > 0 && (
            <div className="flex flex-col gap-2">
              {avisos.map(a => (
                <div key={a.tarjeta.id + a.resumen.clave}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm"
                  style={{
                    borderColor: a.dias < 0 ? 'var(--accent-negative)' : 'color-mix(in srgb, var(--accent-warning) 60%, var(--border-color))',
                    background: a.dias < 0 ? 'var(--glow-negative)' : 'color-mix(in srgb, var(--accent-warning) 6%, var(--bg-card))',
                  }}>
                  {a.dias < 0 ? <AlertTriangle size={18} className="text-negative" /> : <CalendarClock size={18} style={{ color: 'var(--accent-warning)' }} />}
                  <span className="flex-1 text-primary">
                    {a.dias < 0
                      ? <>El resumen de <b>{a.tarjeta.nombre}</b> venció hace {-a.dias} días: <b className="tabular-nums">{fmt(a.monto)}</b></>
                      : <><b>{a.tarjeta.nombre}</b> vence {a.dias === 0 ? 'hoy' : `en ${a.dias} ${a.dias === 1 ? 'día' : 'días'}`} ({fmtDiaMes(a.resumen.vencimiento)}): <b className="tabular-nums">{fmt(a.monto)}</b></>}
                  </span>
                  <button onClick={() => setPagando({ t: a.tarjeta, r: a.resumen })}
                    className="fa-press rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover">Pagar</button>
                </div>
              ))}
            </div>
          )}

          {/* Luca: cuotas comprometidas + con qué tarjeta conviene comprar hoy */}
          {(cuotas.length > 0 || (mejor && tarjetas.length > 1)) && (() => {
            const aPesosCuota = (n: number, moneda: string) => (moneda === 'USD' ? n * dolar : n)
            const restanteTotal = cuotas.reduce((s, c) => s + aPesosCuota(c.restante, c.moneda), 0)
            const porMesTotal = cuotas.reduce((s, c) => s + aPesosCuota(c.montoCuota, c.moneda), 0)
            return (
              <div className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: 'color-mix(in srgb, var(--accent-positive) 22%, var(--border-subtle))', background: 'color-mix(in srgb, var(--accent-positive) 4%, var(--bg-card))' }}>
                <LucaAvatar estado="insight" size={30} />
                <div className="space-y-1 text-sm leading-relaxed text-primary">
                  {cuotas.length > 0 && (
                    <p>Tenés <b className="tabular-nums">{fmtCorto(restanteTotal)}</b> comprometidos en {cuotas.length} {cuotas.length === 1 ? 'compra en cuotas' : 'compras en cuotas'}: <b className="tabular-nums">{fmt(porMesTotal)}</b> por mes hasta terminarlas.</p>
                  )}
                  {mejor && tarjetas.length > 1 && (
                    <p className="flex items-start gap-1.5 text-secondary"><Lightbulb size={14} className="mt-1 shrink-0 text-positive" />
                      <span>Si comprás hoy, conviene <b className="text-primary">{mejor.tarjeta.nombre}</b>: lo pagás el {fmtDiaMes(mejor.vence)}, en {mejor.dias} días.</span></p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* tarjetas */}
          <GrillaOrdenable
            ids={estados.map(e => e.tarjeta.id)}
            onReordenar={reordenar}
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
            render={(id, handle) => {
              const e = porId.get(id)
              return e ? renderTarjeta(e, handle) : null
            }}
          />
          <p className="-mt-3 text-center text-xs text-muted">Tocá una tarjeta para ver el detalle · arrastrala desde ⋮⋮ para ordenarlas</p>

          {/* compromisos: barras apiladas por mes, una por tarjeta */}
          <section className="fa-panel p-6" aria-labelledby="t-comp">
            <Encabezado id="t-comp" titulo="Lo que ya tenés comprometido" sub="Resúmenes y cuotas que vencen en los próximos 6 meses · pasá el mouse por una barra" />
            <CompromisosPorMes filas={compromisos} tarjetas={tarjetas} />
          </section>

          {/* cuotas */}
          {cuotas.length > 0 && (
            <section className="fa-panel p-6">
              <h2 className="text-[15px] font-bold text-primary">Compras en cuotas</h2>
              <ul className="mt-3 divide-y divide-line">
                {cuotas.map(c => {
                  const t = tarjetas.find(x => x.id === c.tarjeta_id)
                  const pct = (c.pagadas / c.cuotasTotal) * 100
                  const signo = c.moneda === 'USD' ? 'US$ ' : '$'
                  return (
                    <li key={c.compra_id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: colorTarjeta(t?.marca) }} />
                      <div className="min-w-[160px] flex-1">
                        <p className="truncate text-sm font-medium text-primary">{c.nombre}</p>
                        <p className="text-[11px] text-muted">{t?.nombre} · próxima: cuota {c.proxima}/{c.cuotasTotal} · termina en {etiquetaMes(c.ultimoResumen)}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-color)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorTarjeta(t?.marca) }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="fa-num-sm text-primary">{signo}{Math.round(c.montoCuota).toLocaleString('es-AR')}/mes</p>
                        <p className="fa-caption">faltan {signo}{Math.round(c.restante).toLocaleString('es-AR')} de {signo}{Math.round(c.montoTotal).toLocaleString('es-AR')}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {/* modales */}
      {editando && (
        <EditarTarjeta
          inicial={editando === 'nueva' ? undefined : editando}
          onGuardar={guardarTarjeta}
          onCerrar={() => setEditando(null)}
          onBorrar={editando === 'nueva' ? undefined : () => setConfirmar({ tipo: 'tarjeta', t: editando })}
        />
      )}
      {pagando && (
        <PagarResumen tarjeta={pagando.t} resumen={pagando.r} lineas={lineas}
          onPagar={pagar} onCerrar={() => setPagando(null)} />
      )}
      {detalleEstado && !pagando && (
        <DetalleTarjeta
          e={detalleEstado} tarjetas={tarjetas} dolar={dolar}
          onCerrar={() => setDetalle(null)}
          onPagar={r => setPagando({ t: detalleEstado.tarjeta, r })}
          onDeshacer={r => setConfirmar({ tipo: 'deshacer', r })}
          onMover={mover}
          onBorrar={pedirBorrarConsumo}
        />
      )}
      {confirmar?.tipo === 'tarjeta' && (
        <Confirmar titulo={`¿Eliminar ${confirmar.t.nombre}?`} peligro accion="Eliminar tarjeta"
          detalle="Los consumos no se borran: quedan en Movimientos, pero ya no se ven en ningún resumen."
          onConfirmar={() => borrarTarjeta(confirmar.t)} onCancelar={() => setConfirmar(null)} />
      )}
      {confirmar?.tipo === 'deshacer' && (
        <Confirmar titulo="¿Deshacer el pago?" accion="Deshacer pago"
          detalle="El resumen vuelve a figurar como pendiente y la plata vuelve a la cuenta de la que salió."
          onConfirmar={() => deshacer(confirmar.r)} onCancelar={() => setConfirmar(null)} />
      )}
      {confirmar?.tipo === 'compra' && (
        <Confirmar titulo={`¿Borrar la compra "${confirmar.c.nombre}"?`} peligro accion="Borrar compra"
          detalle={<>Es la cuota {confirmar.c.cuota_numero}/{confirmar.c.cuotas_total}: se borran todas sus cuotas. Vas a poder deshacerlo.</>}
          onConfirmar={() => borrarConsumo(confirmar.c, true)} onCancelar={() => setConfirmar(null)} />
      )}
      <Toasts items={toasts.items} onCerrar={toasts.cerrar} />
    </div>
  )
}

/* ── compromisos por mes (SVG/HTML propio, sin recharts) ── */
function CompromisosPorMes({ filas, tarjetas }: { filas: Record<string, number | string>[]; tarjetas: TarjetaInfo[] }) {
  const [foco, setFoco] = useState<string | null>(null)
  const totales = filas.map(f => tarjetas.reduce((a, t) => a + (Number(f[t.id]) || 0), 0))
  const max = Math.max(...totales, 1)
  if (totales.every(t => t === 0)) {
    return <p className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-xs text-secondary fa-hairline">No tenés nada comprometido para los próximos meses.</p>
  }
  return (
    <div className="mt-4">
      <ul className="space-y-2.5" onMouseLeave={() => setFoco(null)}>
        {filas.map((f, i) => (
          <li key={String(f.mes)} className="grid grid-cols-[56px_1fr_96px] items-center gap-3 text-sm">
            <span className="capitalize text-secondary">{etiquetaMes(String(f.mes))}</span>
            <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
              {tarjetas.map(t => {
                const v = Number(f[t.id]) || 0
                if (v <= 0) return null
                return (
                  <span key={t.id} title={`${t.nombre}: ${fmt(v)}`}
                    onMouseEnter={() => setFoco(t.id)}
                    className="fa-grow-x block h-full"
                    style={{
                      width: `${(v / max) * 100}%`, background: colorTarjeta(t.marca),
                      opacity: foco && foco !== t.id ? 0.3 : 1, transition: 'opacity 140ms ease', animationDelay: `${i * 50}ms`,
                    }} />
                )
              })}
            </span>
            <span className="text-right font-semibold tabular-nums text-primary">{fmt(totales[i])}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
        {tarjetas.map(t => (
          <li key={t.id} onMouseEnter={() => setFoco(t.id)} onMouseLeave={() => setFoco(null)} className="flex cursor-default items-center gap-1.5"
            style={{ opacity: foco && foco !== t.id ? 0.5 : 1 }}>
            <span className="h-2 w-2 rounded-full" style={{ background: colorTarjeta(t.marca) }} />{t.nombre}
          </li>
        ))}
      </ul>
    </div>
  )
}
