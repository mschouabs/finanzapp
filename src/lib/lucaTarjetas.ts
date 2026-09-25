/* ── Luca responde sobre tarjetas ──────────────────────────────────
   "¿cuánto debo de la naranja?", "¿cuándo vence mercado pago?",
   "¿cuánto me queda de límite?", "¿qué cuotas tengo?",
   "¿con cuál conviene pagar hoy?". Se responde con los datos reales,
   sin IA. Si el mensaje trae un monto es un gasto, no una pregunta.  */

import { extraerMonto } from './parser'
import { detectarMedioPago, normalizar } from './tarjetas'
import { diasEntre, etiquetaMes, fmtDiaMes, mejorTarjetaHoy } from './ciclos'
import { comprasEnCuotas, enPesos, type Consumo, type EstadoTarjeta } from './resumenes'

const $ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

const RE_TEMA = /\b(debo|deuda|adeudo|vence|vencimiento|vencen|resumen|cierra|cierre|limite|disponible|cuotas|conviene|tarjetas?)\b/

export function esPreguntaDeTarjetas(texto: string): boolean {
  const t = normalizar(texto)
  if (extraerMonto(texto) !== null) return false
  return RE_TEMA.test(t)
}

export function responderSobreTarjetas(
  texto: string, estados: EstadoTarjeta[], consumos: Consumo[], dolar: number, hoy = new Date(),
): string | null {
  if (!esPreguntaDeTarjetas(texto)) return null
  if (!estados.length) return 'Todavía no tenés tarjetas cargadas. Agregalas en Tarjetas con su día de cierre y vencimiento.'
  const t = normalizar(texto)

  /* ¿de qué tarjeta habla? */
  const medio = detectarMedioPago(texto)
  const elegidas = estados.filter(e => {
    const n = normalizar(e.tarjeta.nombre)
    return (medio && detectarMedioPago(e.tarjeta.nombre) === medio) || t.includes(n) || t.includes(n.split(' ')[0])
  })
  const lista = elegidas.length ? elegidas : estados

  if (/\bconviene\b/.test(t)) {
    const m = mejorTarjetaHoy(estados.map(e => e.tarjeta), hoy)
    return m
      ? `Si comprás hoy, conviene ${m.tarjeta.nombre}: lo pagás el ${fmtDiaMes(m.vence)}, dentro de ${m.dias} días.`
      : 'Cargá el día de cierre y vencimiento de tus tarjetas y te digo con cuál conviene.'
  }

  if (/\bcuotas\b/.test(t)) {
    const cs = comprasEnCuotas(lista.map(e => e.tarjeta), consumos)
    if (!cs.length) return 'No tenés compras en cuotas pendientes. 🎉'
    const total = cs.reduce((s, c) => s + c.restante, 0)
    const detalle = cs.slice(0, 5).map(c => `• ${c.nombre}: cuota ${c.proxima}/${c.cuotasTotal} de ${$(c.montoCuota)} (termina ${etiquetaMes(c.ultimoResumen)})`).join('\n')
    return `Tenés ${cs.length} ${cs.length === 1 ? 'compra' : 'compras'} en cuotas, te quedan ${$(total)} por pagar:\n${detalle}`
  }

  if (/\b(limite|disponible)\b/.test(t)) {
    return lista.map(e => e.limite
      ? `${e.tarjeta.nombre}: te quedan ${$(e.disponible)} disponibles de ${$(e.limite)} (usaste el ${Math.round(e.usoPct)}%).`
      : `${e.tarjeta.nombre}: no tiene límite cargado.`).join('\n')
  }

  if (/\b(cierra|cierre)\b/.test(t)) {
    return lista.map(e => {
      const d = diasEntre(hoy, e.abierto.cierre)
      return `${e.tarjeta.nombre} cierra el ${fmtDiaMes(e.abierto.cierre)} (${d === 0 ? 'hoy' : `en ${d} días`}) y ese resumen vence el ${fmtDiaMes(e.abierto.vencimiento)}.`
    }).join('\n')
  }

  if (/\b(vence|vencimiento|vencen)\b/.test(t)) {
    return lista.map(e => {
      const r = e.aPagar
      if (!r) return `${e.tarjeta.nombre}: no tenés nada pendiente. El próximo resumen vence el ${fmtDiaMes(e.abierto.vencimiento)}.`
      const monto = enPesos({ ars: r.totales.pendArs, usd: r.totales.pendUsd }, dolar)
      const d = diasEntre(hoy, r.vencimiento)
      return d < 0
        ? `${e.tarjeta.nombre}: el resumen de ${$(monto)} venció el ${fmtDiaMes(r.vencimiento)}. ¡Pagalo cuanto antes!`
        : `${e.tarjeta.nombre} vence el ${fmtDiaMes(r.vencimiento)} (${d === 0 ? 'hoy' : `en ${d} días`}): ${$(monto)}.`
    }).join('\n')
  }

  /* deuda / "cuánto debo" / "resumen" */
  const lineas = lista.map(e => {
    if (e.deuda <= 0) return `${e.tarjeta.nombre}: no debés nada. 🎉`
    const partes = [
      e.deudaCerrada > 0 ? `${$(e.deudaCerrada)} del resumen cerrado` : '',
      e.deudaAbierta > 0 ? `${$(e.deudaAbierta)} del resumen actual (vence ${fmtDiaMes(e.abierto.vencimiento)})` : '',
      e.cuotasFuturas > 0 ? `${$(e.cuotasFuturas)} de cuotas futuras` : '',
    ].filter(Boolean)
    return `${e.tarjeta.nombre}: debés ${$(e.deuda)} en total — ${partes.join(' + ')}.`
  })
  if (lista.length > 1) {
    lineas.push(`Total en tarjetas: ${$(lista.reduce((s, e) => s + e.deuda, 0))}.`)
  }
  return lineas.join('\n')
}
