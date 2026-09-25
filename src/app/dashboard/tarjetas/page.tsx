'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, GripVertical, Lightbulb, Pencil, Plus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { detectarCategoria } from '@/lib/parser'
import { borrarGastoVariable, deshacerPago, guardarGastoVariable, pagarConsumos } from '@/lib/movimientos'
import { esLiquida, traerCotizaciones, type LineaSaldo } from '@/lib/patrimonio'
import { diasEntre, etiquetaMes, fmtDiaMes, mejorTarjetaHoy, resumenDeCompra, sumarMeses } from '@/lib/ciclos'
import {
  COLUMNAS_CONSUMO, avisosDeVencimiento, comprasEnCuotas, compromisosPorMes, enPesos, estadoTarjeta,
  type Consumo, type EstadoTarjeta, type ResumenInfo, type TarjetaInfo,
} from '@/lib/resumenes'
import { GrillaOrdenable, type HandleProps } from '@/components/GrillaOrdenable'
import { LucaMensaje } from '@/components/luca/LucaMensaje'
import { AnilloLimite, TarjetaVisual, colorTarjeta, fmt, fmtCorto } from '@/components/tarjetas/TarjetaVisual'
import { EditarTarjeta, PagarResumen, type DatosTarjeta } from '@/components/tarjetas/Modales'
import { DetalleTarjeta } from '@/components/tarjetas/DetalleTarjeta'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const tooltipStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 10, fontSize: 12, color: 'var(--text-primary)',
}

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
    if (!window.confirm(`¿Eliminar ${t.nombre}? Los consumos no se borran, quedan sin tarjeta.`)) return
    const supabase = createClient()
    await supabase.from('tarjetas_cuentas').delete().eq('id', t.id)
    setEditando(null)
    setDetalle(null)
    cargar()
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
    setConsumoForm(null)
    setForm(formVacio)
    cargar()
  }

  async function pagar(lineaARS: string | null, lineaUSD: string | null): Promise<string | null> {
    if (!pagando) return null
    const supabase = createClient()
    const { error: e } = await pagarConsumos(supabase, pagando.r.consumos, lineaARS, lineaUSD)
    if (e) return e
    setPagando(null)
    cargar()
    return null
  }

  async function deshacer(r: ResumenInfo) {
    if (!window.confirm('¿Deshacer el pago? La plata vuelve a la cuenta de la que salió.')) return
    const supabase = createClient()
    await deshacerPago(supabase, r.consumos)
    cargar()
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
    cargar()
  }

  async function borrarConsumo(c: Consumo) {
    const cuota = c.compra_id && (c.cuotas_total ?? 1) > 1
    const msg = cuota
      ? `"${c.nombre}" es la cuota ${c.cuota_numero}/${c.cuotas_total}. ¿Borrar la compra completa (todas las cuotas)?`
      : `¿Borrar "${c.nombre}"?`
    if (!window.confirm(msg)) return
    const supabase = createClient()
    await borrarGastoVariable(supabase, { id: c.id, monto: c.monto, compra_id: c.compra_id }, !!cuota)
    cargar()
  }

  /* ── render ────────────────────────────── */

  if (loading) {
    return <div className="fa-card p-8 text-center"><p className="text-sm text-secondary">Cargando tarjetas…</p></div>
  }

  const renderTarjeta = (e: EstadoTarjeta, handle: HandleProps) => {
    const t = e.tarjeta
    const r = e.aPagar
    const pend = r ? enPesos({ ars: r.totales.pendArs, usd: r.totales.pendUsd }, dolar) : 0
    const dias = r ? diasEntre(new Date(), r.vencimiento) : 0
    const cerrado = r && r.clave !== e.abierto.clave
    return (
      <div className="fa-card flex h-full flex-col gap-4 p-4">
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
              <p className="text-[11px] text-secondary">
                {cerrado ? (dias < 0 ? `Vencido hace ${-dias} días` : `A pagar · vence ${fmtDiaMes(r.vencimiento)} (en ${dias} ${dias === 1 ? 'día' : 'días'})`)
                  : `Resumen abierto · vence ${fmtDiaMes(r.vencimiento)}`}
              </p>
              <p className={`fa-amount text-lg ${cerrado && dias < 0 ? 'text-negative' : 'text-primary'}`}>{fmt(pend)}</p>
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
    <div className="flex flex-col gap-6">
      {/* encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Tarjetas de crédito</h1>
          <p className="mt-1 text-sm text-secondary">Resúmenes, cuotas y cuánto te queda disponible</p>
        </div>
        <button onClick={() => setEditando('nueva')}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-confirm px-4 py-2 text-sm font-semibold text-white hover:bg-confirm-hover">
          <Plus size={16} strokeWidth={2.5} /> Agregar tarjeta
        </button>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {tarjetas.length === 0 ? (
        <div className="fa-card p-8">
          <LucaMensaje variante="vacio" estado="sad" titulo="Todavía no cargaste ninguna tarjeta"
            accion={{ label: '+ Agregar tarjeta', onClick: () => setEditando('nueva') }}>
            Agregá tus tarjetas con su día de cierre y vencimiento para ver tus resúmenes y cuotas.
          </LucaMensaje>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Deuda total en tarjetas" valor={fmt(deudaTotal)} detalle="resúmenes + cuotas futuras" />
            <Kpi label="Disponible para gastar" valor={limiteTotal ? fmt(limiteTotal - deudaTotal) : '—'}
              detalle={limiteTotal ? `de ${fmtCorto(limiteTotal)} de límite` : 'cargá los límites'} />
            <Kpi label="Próximo vencimiento"
              valor={proximo?.aPagar ? fmt(enPesos({ ars: proximo.aPagar.totales.pendArs, usd: proximo.aPagar.totales.pendUsd }, dolar)) : 'Nada'}
              detalle={proximo?.aPagar ? `${proximo.tarjeta.nombre} · ${fmtDiaMes(proximo.aPagar.vencimiento)}` : 'estás al día'} />
            <Kpi label="Compras en cuotas" valor={String(cuotas.length)}
              detalle={cuotas.length ? `quedan ${fmtCorto(cuotas.reduce((s, c) => s + c.restante, 0))}` : 'ninguna activa'} />
          </div>

          {/* avisos */}
          {avisos.length > 0 && (
            <div className="flex flex-col gap-2">
              {avisos.map(a => (
                <div key={a.tarjeta.id + a.resumen.clave}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
                  style={{ borderColor: a.dias < 0 ? 'var(--accent-negative)' : 'var(--accent-warning, #F5C451)' }}>
                  {a.dias < 0 ? <AlertTriangle size={18} className="text-negative" /> : <CalendarClock size={18} style={{ color: 'var(--accent-warning, #F5C451)' }} />}
                  <span className="flex-1 text-primary">
                    {a.dias < 0
                      ? <>El resumen de <b>{a.tarjeta.nombre}</b> venció hace {-a.dias} días: {fmt(a.monto)}</>
                      : <><b>{a.tarjeta.nombre}</b> vence {a.dias === 0 ? 'hoy' : `en ${a.dias} ${a.dias === 1 ? 'día' : 'días'}`} ({fmtDiaMes(a.resumen.vencimiento)}): {fmt(a.monto)}</>}
                  </span>
                  <button onClick={() => setPagando({ t: a.tarjeta, r: a.resumen })}
                    className="rounded-lg bg-confirm px-3 py-1.5 text-xs font-semibold text-white hover:bg-confirm-hover">Pagar</button>
                </div>
              ))}
            </div>
          )}

          {/* con cuál conviene */}
          {mejor && tarjetas.length > 1 && (
            <div className="flex items-start gap-3 rounded-xl p-3 text-sm"
              style={{ background: 'color-mix(in srgb, var(--accent-positive) 10%, transparent)' }}>
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-positive" />
              <p className="text-primary">
                Si comprás hoy, conviene <b>{mejor.tarjeta.nombre}</b>: lo pagás el {fmtDiaMes(mejor.vence)}, dentro de {mejor.dias} días.
              </p>
            </div>
          )}

          {/* tarjetas */}
          <GrillaOrdenable
            ids={estados.map(e => e.tarjeta.id)}
            onReordenar={reordenar}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            render={(id, handle) => {
              const e = porId.get(id)
              return e ? renderTarjeta(e, handle) : null
            }}
          />
          <p className="-mt-3 text-center text-xs text-muted">Tocá una tarjeta para ver el detalle · arrastrala desde ⋮⋮ para ordenarlas</p>

          {/* compromisos */}
          <section className="fa-card p-5">
            <h2 className="text-base font-bold text-primary">Lo que ya tenés comprometido</h2>
            <p className="mt-0.5 text-xs text-secondary">Resúmenes y cuotas que vencen en los próximos 6 meses</p>
            <div className="mt-4 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compromisos.map(c => ({ ...c, etiqueta: etiquetaMes(c.mes as string) }))} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCorto(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [fmt(v), tarjetas.find(t => t.id === name)?.nombre ?? name]}
                    cursor={{ fill: 'rgba(127,127,127,.12)' }} />
                  <Legend formatter={(v: string) => tarjetas.find(t => t.id === v)?.nombre ?? v} wrapperStyle={{ fontSize: 12 }} />
                  {tarjetas.map((t, i) => (
                    <Bar key={t.id} dataKey={t.id} stackId="a" fill={colorTarjeta(t.marca)}
                      radius={i === tarjetas.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* cuotas */}
          {cuotas.length > 0 && (
            <section className="fa-card p-5">
              <h2 className="text-base font-bold text-primary">Compras en cuotas</h2>
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
                        <p className="fa-amount text-sm text-primary">{signo}{Math.round(c.montoCuota).toLocaleString('es-AR')}/mes</p>
                        <p className="text-[11px] text-muted">faltan {signo}{Math.round(c.restante).toLocaleString('es-AR')} de {signo}{Math.round(c.montoTotal).toLocaleString('es-AR')}</p>
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
          onBorrar={editando === 'nueva' ? undefined : () => borrarTarjeta(editando)}
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
          onDeshacer={deshacer}
          onMover={mover}
          onBorrar={borrarConsumo}
        />
      )}
    </div>
  )
}

function Kpi({ label, valor, detalle }: { label: string; valor: string; detalle: string }) {
  return (
    <div className="fa-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className="fa-amount mt-0.5 text-xl text-primary">{valor}</p>
      <p className="truncate text-[11px] text-muted">{detalle}</p>
    </div>
  )
}
