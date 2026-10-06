/* ── Lo que Luca sabe de vos ───────────────────────────────────────
   Resume tu situación real (la misma que ves en el Resumen) en texto
   corto para que Claude responda con tus números. No inventa nada:
   todo sale del snapshot compartido. Incluye los ids de cuentas y
   tarjetas para que, al proponer una acción, Claude use el correcto. */

import {
  actividad, categorias, claveMes, compromisos, flujoDelMes, isoLocal, nombreMes, patrimonio, progresoMetas, ritmoDeGasto,
  type Snapshot,
} from '@/lib/finanzas/nucleo'
import { insightsDe } from '@/lib/finanzas/insights'
import { enPesos } from '@/lib/resumenes'

const $ = (n: number) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('es-AR')
const num = (n: number, moneda: string) =>
  moneda === 'USD' ? `US$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  : moneda === 'BTC' ? `${n} BTC` : $(n)
const dia = (d: Date | null | undefined) => (d ? isoLocal(d) : 's/f')

export function construirContexto(s: Snapshot): string {
  const mes = claveMes(s.hoy)
  const p = patrimonio(s)
  const f = flujoDelMes(s, mes)
  const r = ritmoDeGasto(s)
  const comp = compromisos(s, 30)
  const cats = categorias(s, mes).slice(0, 8)
  const L: string[] = []

  L.push(`HOY: ${isoLocal(s.hoy)}. Dólar blue: ${$(s.dolar)}.`)

  L.push('\nCUENTAS Y SALDOS (id | cuenta | moneda | saldo):')
  for (const l of s.lineas) {
    L.push(`${l.id} | ${(l.etiqueta || l.app)} · ${l.nombre} | ${l.moneda} | ${num(Number(l.monto), l.moneda)}${l.es_disponible ? ' | disponible' : ''}`)
  }

  L.push(`\nPATRIMONIO: líquido ${$(p.liquido)}, invertido ${$(p.invertido)}, deuda de tarjetas ${$(p.deuda)}, neto ${$(p.neto)}.`)

  L.push('\nTARJETAS (id | nombre | cierre/vencimiento | a pagar ahora | deuda total | límite disponible):')
  for (const e of p.estados) {
    const a = e.aPagar
    const pagar = a ? `${$(a.totales.pendArs)}${a.totales.pendUsd ? ` + US$${a.totales.pendUsd}` : ''} (vence ${dia(a.vencimiento)})` : 'nada'
    L.push(`${e.tarjeta.id} | ${e.tarjeta.nombre} | día ${e.tarjeta.cierre ?? '?'}/${e.tarjeta.vencimiento ?? '?'} | ${pagar} | ${$(e.deuda)} | ${$(e.disponible)}`)
  }

  L.push(`\nMES ${nombreMes(mes)}: ingresos ${$(f.ingresos.total)} (fijos ${$(f.ingresos.fijos)}, extra ${$(f.ingresos.extra)}), gastos ${$(f.gastos.total)} (fijos ${$(f.gastos.fijos)}, variables ${$(f.gastos.variables)}, cuotas ${$(f.gastos.cuotas)}, viajes ${$(f.gastos.viajes)}), balance ${$(f.balance)}${f.tasaAhorro != null ? `, ahorro ${Math.round(f.tasaAhorro)}%` : ''}.`)
  if (cats.length) L.push('Gasto por categoría este mes: ' + cats.map(c => `${c.nombre} ${$(c.monto)}`).join(', ') + '.')
  L.push(`Ritmo: día ${r.dia}/${r.diasMes}, gasto del día a día ${$(r.acumulado)}${r.promedio != null ? ` (promedio de meses anteriores a esta altura ${$(r.promedio)}, ${r.variacion != null ? Math.round(r.variacion) + '%' : ''})` : ''}.`)

  L.push(`\nCOMPROMISOS próximos 30 días: total ${$(comp.total)}. Después: ${$(comp.futuro)}${comp.hasta ? ` hasta ${comp.hasta}` : ''}.`)
  for (const c of comp.items.slice(0, 10)) L.push(`- ${c.titulo}: ${$(c.monto)} (${c.fecha ? dia(c.fecha) : 'este mes'}${c.vencido ? ', vencido' : ''})`)

  if (s.deudasFreelance.length) {
    L.push('\nFREELANCE PENDIENTE DE COBRO: ' + s.deudasFreelance.map(d => `${d.cliente} ${$(d.pendiente)} (${d.fecha})`).join('; ') + '.')
  }

  const metas = progresoMetas(s)
  if (metas.length) L.push('\nMETAS: ' + metas.map(m => `${m.nombre} ${Math.round(m.pct)}% (${num(m.actual, m.moneda)} de ${num(m.objetivo, m.moneda)})`).join('; ') + '.')

  const ins = insightsDe(s).slice(0, 6)
  if (ins.length) {
    L.push('\nAVISOS QUE LUCA YA CALCULÓ:')
    for (const i of ins) L.push(`- ${i.titulo} — ${i.detalle}`)
  }

  const act = actividad(s, 8)
  if (act.length) {
    L.push('\nÚLTIMOS MOVIMIENTOS:')
    for (const a of act) L.push(`- ${a.fecha} ${a.tipo === 'ingreso' ? '+' : '-'}${$(a.monto)} ${a.titulo}${a.cuenta ? ` (${a.cuenta})` : ''}`)
  }

  /* referencia por si Claude necesita convertir deudas a pesos */
  const usd = p.estados.reduce((t, e) => t + (e.aPagar?.totales.pendUsd ?? 0), 0)
  if (usd) L.push(`\nNota: hay US$${usd} a pagar en tarjetas (≈ ${$(enPesos({ ars: 0, usd }, s.dolar))}).`)

  return L.join('\n').slice(0, 9000)
}
