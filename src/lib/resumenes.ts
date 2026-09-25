/* ── Resúmenes de tarjeta ──────────────────────────────────────────
   Agrupa los consumos a crédito por resumen y calcula lo que importa:
   cuánto hay que pagar y cuándo, cuánto límite queda, qué cuotas
   faltan y qué se viene en los próximos meses. Funciones puras: las
   usan Tarjetas, el Resumen y Luca.                                   */

import {
  diasEntre, estadoResumen, fechasDeResumen, mesClaveDe, resumenAbierto, resumenDeCompra, sumarMeses,
  type EstadoResumen,
} from './ciclos'

export interface TarjetaInfo {
  id: string
  nombre: string
  marca: string | null
  limite: number | null
  cierre: number | null
  vencimiento: number | null
  ultimos4?: string | null
  orden?: number | null
}

export interface Consumo {
  id: string
  nombre: string
  monto: number
  moneda: string | null
  categoria: string
  fecha: string
  tarjeta_id: string | null
  resumen: string | null
  pagado: boolean | null
  pago_linea_id: string | null
  compra_id: string | null
  cuota_numero: number | null
  cuotas_total: number | null
  monto_total: number | null
  fecha_compra: string | null
}

export const COLUMNAS_CONSUMO =
  'id, nombre, monto, moneda, categoria, fecha, tarjeta_id, resumen, pagado, pago_linea_id, compra_id, cuota_numero, cuotas_total, monto_total, fecha_compra'

export const resumenDe = (c: Consumo, t: TarjetaInfo) => c.resumen ?? resumenDeCompra(c.fecha, t)

export interface Totales { ars: number; usd: number; pendArs: number; pendUsd: number }

export function totalesDe(cs: Consumo[]): Totales {
  const t = { ars: 0, usd: 0, pendArs: 0, pendUsd: 0 }
  for (const c of cs) {
    const m = Number(c.monto) || 0
    if (c.moneda === 'USD') { t.usd += m; if (!c.pagado) t.pendUsd += m }
    else { t.ars += m; if (!c.pagado) t.pendArs += m }
  }
  return t
}

export const enPesos = (t: { ars: number; usd: number }, dolar: number) => t.ars + t.usd * dolar

export interface ResumenInfo {
  clave: string
  consumos: Consumo[]
  totales: Totales
  estado: EstadoResumen
  desde: Date
  cierre: Date
  vencimiento: Date
}

export function infoResumen(clave: string, t: TarjetaInfo, consumos: Consumo[], dolar: number, hoy = new Date()): ResumenInfo {
  const cs = consumos.filter(c => resumenDe(c, t) === clave)
  const totales = totalesDe(cs)
  const f = fechasDeResumen(clave, t)
  return {
    clave, consumos: cs, totales,
    estado: estadoResumen(clave, t, enPesos({ ars: totales.pendArs, usd: totales.pendUsd }, dolar), enPesos(totales, dolar), hoy),
    ...f,
  }
}

export interface EstadoTarjeta {
  tarjeta: TarjetaInfo
  consumos: Consumo[]
  abierto: ResumenInfo
  anterior: ResumenInfo
  /** El resumen que corresponde pagar ahora (cerrado impago o, si no hay, el abierto). */
  aPagar: ResumenInfo | null
  /** Deuda total (resumen cerrado impago + abierto + cuotas futuras), en pesos. */
  deuda: number
  deudaCerrada: number
  deudaAbierta: number
  cuotasFuturas: number
  limite: number
  disponible: number
  usoPct: number
}

export function estadoTarjeta(t: TarjetaInfo, todos: Consumo[], dolar: number, hoy = new Date()): EstadoTarjeta {
  const consumos = todos.filter(c => c.tarjeta_id === t.id)
  const kAbierto = resumenAbierto(t, hoy)
  const abierto = infoResumen(kAbierto, t, consumos, dolar, hoy)
  const anterior = infoResumen(sumarMeses(kAbierto, -1), t, consumos, dolar, hoy)

  let deudaCerrada = 0, deudaAbierta = 0, cuotasFuturas = 0
  for (const c of consumos) {
    if (c.pagado) continue
    const v = c.moneda === 'USD' ? Number(c.monto) * dolar : Number(c.monto)
    const k = resumenDe(c, t)
    if (k < kAbierto) deudaCerrada += v
    else if (k === kAbierto) deudaAbierta += v
    else cuotasFuturas += v
  }
  const deuda = deudaCerrada + deudaAbierta + cuotasFuturas
  const limite = Number(t.limite) || 0

  /* resumen a pagar: el más viejo cerrado con saldo; si no, el abierto */
  let aPagar: ResumenInfo | null = null
  if (deudaCerrada > 0) {
    const claves = Array.from(new Set(consumos.filter(c => !c.pagado).map(c => resumenDe(c, t)))).filter(k => k < kAbierto).sort()
    if (claves.length) aPagar = infoResumen(claves[0], t, consumos, dolar, hoy)
  } else if (deudaAbierta > 0) {
    aPagar = abierto
  }

  return {
    tarjeta: t, consumos, abierto, anterior, aPagar,
    deuda, deudaCerrada, deudaAbierta, cuotasFuturas,
    limite,
    disponible: limite > 0 ? limite - deuda : 0,
    usoPct: limite > 0 ? Math.min(100, (deuda / limite) * 100) : 0,
  }
}

/* ── Compromisos por mes (lo que vence cada mes, todavía impago) ── */

export function compromisosPorMes(ts: TarjetaInfo[], consumos: Consumo[], dolar: number, meses = 6, hoy = new Date()) {
  /* si lo de este mes ya está todo pagado, arrancamos desde el que viene */
  const esteMes = mesClaveDe(hoy)
  const hayAlgoEsteMes = consumos.some(c => {
    const t = ts.find(x => x.id === c.tarjeta_id)
    return t && !c.pagado && resumenDe(c, t) <= esteMes
  })
  const inicio = hayAlgoEsteMes ? esteMes : sumarMeses(esteMes, 1)
  const claves = Array.from({ length: meses }, (_, i) => sumarMeses(inicio, i))
  return claves.map(k => {
    const fila: Record<string, number | string> = { mes: k }
    for (const t of ts) {
      fila[t.id] = consumos
        .filter(c => c.tarjeta_id === t.id && !c.pagado && resumenDe(c, t) === k)
        .reduce((s, c) => s + (c.moneda === 'USD' ? Number(c.monto) * dolar : Number(c.monto)), 0)
    }
    /* lo que ya quedó atrasado se suma al primer mes */
    if (k === inicio) {
      for (const t of ts) {
        fila[t.id] = (fila[t.id] as number) + consumos
          .filter(c => c.tarjeta_id === t.id && !c.pagado && resumenDe(c, t) < k)
          .reduce((s, c) => s + (c.moneda === 'USD' ? Number(c.monto) * dolar : Number(c.monto)), 0)
      }
    }
    return fila
  })
}

/* ── Compras en cuotas que todavía tienen cuotas por pagar ── */

export interface CompraEnCuotas {
  compra_id: string
  nombre: string
  tarjeta_id: string
  cuotasTotal: number
  pagadas: number
  proxima: number | null
  montoCuota: number
  montoTotal: number
  restante: number
  ultimoResumen: string
  moneda: string
}

export function comprasEnCuotas(ts: TarjetaInfo[], consumos: Consumo[]): CompraEnCuotas[] {
  const porCompra = new Map<string, Consumo[]>()
  for (const c of consumos) {
    if (!c.compra_id || (c.cuotas_total ?? 1) < 2) continue
    porCompra.set(c.compra_id, [...(porCompra.get(c.compra_id) ?? []), c])
  }
  const res: CompraEnCuotas[] = []
  for (const [compra_id, cs] of porCompra) {
    const t = ts.find(x => x.id === cs[0].tarjeta_id)
    if (!t) continue
    const orden = [...cs].sort((a, b) => (a.cuota_numero ?? 0) - (b.cuota_numero ?? 0))
    const total = orden[0].cuotas_total ?? orden.length
    const impagas = orden.filter(c => !c.pagado)
    if (!impagas.length) continue
    /* cuotas anteriores a las cargadas cuentan como pagadas */
    const primeraCargada = orden[0].cuota_numero ?? 1
    const pagadas = primeraCargada - 1 + orden.filter(c => c.pagado).length
    res.push({
      compra_id,
      nombre: orden[0].nombre,
      tarjeta_id: t.id,
      cuotasTotal: total,
      pagadas,
      proxima: impagas[0].cuota_numero,
      montoCuota: Number(impagas[0].monto),
      montoTotal: Number(orden[0].monto_total ?? 0) || orden.reduce((s, c) => s + Number(c.monto), 0),
      restante: impagas.reduce((s, c) => s + Number(c.monto), 0),
      ultimoResumen: resumenDe(orden[orden.length - 1], t),
      moneda: orden[0].moneda ?? 'ARS',
    })
  }
  return res.sort((a, b) => b.restante - a.restante)
}

/* ── Avisos para el Resumen: vencimientos cercanos o vencidos ── */

export interface AvisoVencimiento {
  tarjeta: TarjetaInfo
  resumen: ResumenInfo
  monto: number
  dias: number
}

export function avisosDeVencimiento(estados: EstadoTarjeta[], dolar: number, diasAviso = 10, hoy = new Date()): AvisoVencimiento[] {
  const avisos: AvisoVencimiento[] = []
  for (const e of estados) {
    const r = e.aPagar
    if (!r) continue
    const monto = enPesos({ ars: r.totales.pendArs, usd: r.totales.pendUsd }, dolar)
    if (monto <= 0) continue
    const dias = diasEntre(hoy, r.vencimiento)
    if (dias <= diasAviso) avisos.push({ tarjeta: e.tarjeta, resumen: r, monto, dias })
  }
  return avisos.sort((a, b) => a.dias - b.dias)
}
