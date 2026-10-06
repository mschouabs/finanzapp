/* ── Acciones que Luca propone ──────────────────────────────────────
   Claude propone, vos confirmás. Acá se valida cada propuesta contra
   tus datos reales (ids de cuentas y tarjetas) y se arma la tarjeta
   de confirmación. Al confirmar, se ejecuta con las mismas funciones
   que usa el resto de la app (libro, pagos atómicos, etc.), así que
   todo queda anotado en el libro y se puede deshacer.                */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from '@/lib/finanzas/nucleo'
import { estadoTarjeta } from '@/lib/resumenes'
import { deshacerMovimiento, sePuedeDeshacer, transferirEntreCuentas, ultimosMovimientos } from '@/lib/libro'
import { pagarConsumos } from '@/lib/movimientos'
import { hoyISO } from '@/lib/fechas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export interface AccionPropuesta { tool: string; input: Record<string, unknown> }

/** Lo que se muestra en la tarjeta de confirmación. */
export interface Vista {
  titulo: string
  lineas: string[]
  peligro?: boolean
  /** si no se puede ejecutar, el motivo (la tarjeta solo informa) */
  error?: string
}

/** Tipos que ya resuelve la tarjeta "Guardar" del chat (registro simple). */
export type RegistroSimple = {
  tabla: 'gasto_variable' | 'gasto_fijo' | 'ingreso_fijo' | 'ingreso_freelance'
  datos: Record<string, unknown>
  mensaje: string
}

const $ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const monto = (n: number, moneda: string) => (moneda === 'USD' ? `US$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : $(n))
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const nro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN }

/** ¿La acción se guarda con la tarjeta de registro de siempre? Devuelve esa forma. */
export function comoRegistroSimple(a: AccionPropuesta): RegistroSimple | null {
  const i = a.input
  if (a.tool === 'registrar_gasto') {
    const m = nro(i.monto)
    if (!(m > 0) || !str(i.nombre)) return null
    const cuotas = Math.round(nro(i.cuotas)) || undefined
    return {
      tabla: 'gasto_variable',
      mensaje: 'Gasto para confirmar:',
      datos: {
        nombre: str(i.nombre), monto: m, moneda: i.moneda === 'USD' ? 'USD' : 'ARS',
        categoria: str(i.categoria) || 'varios', fecha: str(i.fecha) || hoyISO(),
        medio_pago: str(i.medio_pago) || undefined,
        forma_pago: i.forma_pago === 'credito' || i.forma_pago === 'debito' ? i.forma_pago : undefined,
        cuotas: cuotas && cuotas > 1 ? cuotas : undefined,
      },
    }
  }
  if (a.tool === 'registrar_gasto_fijo') {
    const m = nro(i.monto)
    if (!(m > 0) || !str(i.nombre)) return null
    return { tabla: 'gasto_fijo', mensaje: 'Gasto fijo para confirmar:', datos: { nombre: str(i.nombre), monto: m, categoria: str(i.categoria) || 'servicios', activo: true } }
  }
  if (a.tool === 'registrar_ingreso') {
    const m = nro(i.monto)
    if (!(m > 0) || !str(i.nombre)) return null
    if (i.clase === 'freelance') {
      return { tabla: 'ingreso_freelance', mensaje: 'Proyecto freelance para confirmar:', datos: { cliente: str(i.nombre), descripcion: str(i.descripcion) || str(i.nombre), monto_total: m, monto: m, fecha: str(i.fecha) || hoyISO() } }
    }
    return { tabla: 'ingreso_fijo', mensaje: 'Ingreso para confirmar:', datos: { nombre: str(i.nombre), monto: m, activo: true } }
  }
  return null
}

const nombreCuenta = (s: Snapshot, id: string) => {
  const l = s.lineas.find(x => x.id === id)
  return l ? `${l.etiqueta || l.app} · ${l.nombre}` : null
}

/** Valida la propuesta y arma lo que ve el usuario. Async por "deshacer" (mira el libro). */
export async function prepararAccion(supabase: Cliente, s: Snapshot, a: AccionPropuesta): Promise<Vista> {
  const i = a.input

  if (a.tool === 'transferir') {
    const d = s.lineas.find(l => l.id === i.desde_id)
    const h = s.lineas.find(l => l.id === i.hacia_id)
    const sale = nro(i.monto_sale), llega = nro(i.monto_llega)
    if (!d || !h) return { titulo: 'Transferencia', lineas: [], error: 'No reconocí alguna de las cuentas. Decime de cuál a cuál.' }
    if (d.id === h.id) return { titulo: 'Transferencia', lineas: [], error: 'La cuenta de origen y la de destino son la misma.' }
    if (!(sale > 0) || !(llega > 0)) return { titulo: 'Transferencia', lineas: [], error: 'Falta el monto.' }
    const lineas = [`De ${nombreCuenta(s, d.id)}: −${monto(sale, d.moneda)}`, `A ${nombreCuenta(s, h.id)}: +${monto(llega, h.moneda)}`]
    if (Number(d.monto) < sale) lineas.push(`Ojo: ${nombreCuenta(s, d.id)} tiene ${monto(Number(d.monto), d.moneda)}, quedaría en negativo.`)
    if (str(i.nota)) lineas.push(str(i.nota))
    return { titulo: '🔁 Transferencia', lineas }
  }

  if (a.tool === 'pagar_tarjeta') {
    const t = s.tarjetas.find(x => x.id === i.tarjeta_id)
    if (!t) return { titulo: 'Pago de tarjeta', lineas: [], error: 'No reconocí la tarjeta.' }
    const est = estadoTarjeta(t, s.consumosImpagos, s.dolar, s.hoy)
    const r = est.aPagar
    const pend = r?.consumos.filter(c => !c.pagado) ?? []
    if (!r || !pend.length) return { titulo: `Pago de ${t.nombre}`, lineas: [], error: `${t.nombre} no tiene un resumen pendiente.` }
    const ars = pend.filter(c => c.moneda !== 'USD').reduce((x, c) => x + Number(c.monto), 0)
    const usd = pend.filter(c => c.moneda === 'USD').reduce((x, c) => x + Number(c.monto), 0)
    const cp = s.lineas.find(l => l.id === i.cuenta_pesos_id)
    const cu = s.lineas.find(l => l.id === i.cuenta_usd_id)
    if (ars && !cp) return { titulo: `Pago de ${t.nombre}`, lineas: [`Resumen: ${$(ars)}${usd ? ` + US$${usd}` : ''}`], error: 'Decime de qué cuenta en pesos sale el pago.' }
    if (usd && !cu) return { titulo: `Pago de ${t.nombre}`, lineas: [`Resumen: ${$(ars)} + US$${usd}`], error: 'El resumen tiene dólares: decime de qué cuenta en dólares sale.' }
    const lineas = [`Resumen que vence ${r.vencimiento.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`]
    if (ars && cp) lineas.push(`${$(ars)} salen de ${nombreCuenta(s, cp.id)}`)
    if (usd && cu) lineas.push(`US$${usd} salen de ${nombreCuenta(s, cu.id)}`)
    if (ars && cp && Number(cp.monto) < ars) lineas.push(`Ojo: esa cuenta tiene ${$(Number(cp.monto))}, quedaría en negativo.`)
    return { titulo: `💳 Pagar ${t.nombre}`, lineas }
  }

  if (a.tool === 'deshacer_ultimo_movimiento') {
    const { movimientos, disponible } = await ultimosMovimientos(supabase, { limite: 20 })
    if (!disponible) return { titulo: 'Deshacer', lineas: [], error: 'El libro de movimientos no está disponible.' }
    const m = movimientos.find(x => sePuedeDeshacer(x, movimientos) && x.tipo !== 'apertura' && x.tipo !== 'cierre')
    if (!m) return { titulo: 'Deshacer', lineas: [], error: 'No hay movimientos recientes que se puedan deshacer desde acá.' }
    const cuenta = nombreCuenta(s, m.cuenta_id) ?? 'una cuenta'
    return {
      titulo: '↩️ Deshacer el último movimiento', peligro: m.tipo === 'gasto',
      lineas: [
        `${m.descripcion || m.tipo} (${cuenta}): ${monto(Number(m.delta), m.moneda)}`,
        m.tipo === 'gasto' ? 'Se borra el gasto y la plata vuelve a la cuenta.' : 'Los saldos vuelven a como estaban.',
      ],
    }
  }

  return { titulo: 'Acción', lineas: [], error: 'No sé hacer eso todavía.' }
}

/** Ejecuta una acción ya confirmada. Devuelve el mensaje de resultado o un error. */
export async function ejecutarAccion(supabase: Cliente, s: Snapshot, a: AccionPropuesta): Promise<{ ok: string | null; error: string | null }> {
  const i = a.input

  if (a.tool === 'transferir') {
    const d = s.lineas.find(l => l.id === i.desde_id), h = s.lineas.find(l => l.id === i.hacia_id)
    if (!d || !h) return { ok: null, error: 'No reconocí las cuentas.' }
    const { error } = await transferirEntreCuentas(supabase, d.id, h.id, nro(i.monto_sale), nro(i.monto_llega), str(i.nota) || undefined)
    return error ? { ok: null, error } : { ok: 'Transferencia hecha.', error: null }
  }

  if (a.tool === 'pagar_tarjeta') {
    const t = s.tarjetas.find(x => x.id === i.tarjeta_id)
    if (!t) return { ok: null, error: 'No reconocí la tarjeta.' }
    const r = estadoTarjeta(t, s.consumosImpagos, s.dolar, s.hoy).aPagar
    if (!r) return { ok: null, error: 'No hay resumen para pagar.' }
    const { error } = await pagarConsumos(supabase, r.consumos, str(i.cuenta_pesos_id) || null, str(i.cuenta_usd_id) || null)
    return error ? { ok: null, error } : { ok: `Pagaste el resumen de ${t.nombre}.`, error: null }
  }

  if (a.tool === 'deshacer_ultimo_movimiento') {
    const { movimientos } = await ultimosMovimientos(supabase, { limite: 20 })
    const m = movimientos.find(x => sePuedeDeshacer(x, movimientos) && x.tipo !== 'apertura' && x.tipo !== 'cierre')
    if (!m) return { ok: null, error: 'Ya no hay nada para deshacer.' }
    const { error } = await deshacerMovimiento(supabase, m.id)
    return error ? { ok: null, error } : { ok: 'Listo, lo deshice.', error: null }
  }

  return { ok: null, error: 'Acción no soportada.' }
}
