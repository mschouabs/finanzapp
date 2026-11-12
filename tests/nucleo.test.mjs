import test from 'node:test'
import assert from 'node:assert/strict'
import { compromisos, flujoDelMes, patrimonio } from '@/lib/finanzas/nucleo'

const linea = (o) => ({ id: o.nombre, app: o.nombre, tipo: 'cuenta', moneda: 'ARS', tasa_anual: null, nivel_riesgo: null, es_disponible: true, ...o })
const consumo = (o) => ({ id: o.nombre, moneda: 'ARS', categoria: 'varios', resumen: null, pagado: false, pago_linea_id: null, compra_id: null, cuota_numero: null, cuotas_total: null, monto_total: null, fecha_compra: null, ...o })
const gasto = (o) => ({ id: o.nombre, moneda: 'ARS', categoria: 'varios', created_at: o.fecha, tarjeta_id: null, forma_pago: 'debito', billetera_linea_id: null, compra_id: null, cuota_numero: null, cuotas_total: null, fecha_compra: null, es_gasto_hormiga: false, ...o })

const visa = { id: 'visa', nombre: 'Visa', marca: 'visa', limite: 1_000_000, cierre: 27, vencimiento: 10 }

/** Foto de ejemplo al 16/10/2026, dólar a 1.000 para que las cuentas sean obvias. */
const foto = (extra = {}) => ({
  hoy: new Date(2026, 9, 16, 12),
  cot: { dolar: 1000, btcUsd: 50_000 },
  dolar: 1000,
  lineas: [
    linea({ nombre: 'Mercado Pago', monto: 500_000 }),
    linea({ nombre: 'Banco', monto: 200, moneda: 'USD', tipo: 'divisa', es_disponible: false }),
    linea({ nombre: 'Binance', monto: 0.01, moneda: 'BTC', tipo: 'cripto', es_disponible: false }),
  ],
  tarjetas: [visa],
  nombreCuenta: new Map(),
  consumosImpagos: [
    consumo({ nombre: 'Super', monto: 100_000, fecha: '2026-09-10', tarjeta_id: 'visa' }),   // resumen oct: vencido el 10/10
    consumo({ nombre: 'Nafta', monto: 50_000, fecha: '2026-10-05', tarjeta_id: 'visa' }),    // resumen nov: vence 10/11
    consumo({ nombre: 'Hotel', monto: 30, moneda: 'USD', fecha: '2026-10-29', tarjeta_id: 'visa' }), // resumen dic
  ],
  gastos: [], fijos: [], ingresosFijos: [], freelance: [], deudasFreelance: [], meDeben: [],
  viajes: [], registros: [], historial: [{ mes: '2026-09', neto: 1_000_000, liquido: 0, invertido: 0 }], metas: [],
  ...extra,
})

test('patrimonio: líquido, invertido, deuda y neto', () => {
  const p = patrimonio(foto())
  assert.equal(p.liquido, 500_000 + 200 * 1000)
  assert.equal(p.invertido, 0.01 * 50_000 * 1000)
  assert.equal(p.deuda, 100_000 + 50_000 + 30 * 1000)
  assert.equal(p.neto, p.liquido + p.invertido - p.deuda)
  assert.equal(p.anterior, 1_000_000)
})

test('patrimonio: lo pagado no cuenta como deuda', () => {
  const s = foto()
  s.consumosImpagos[0].pagado = true
  assert.equal(patrimonio(s).deuda, 80_000)
})

test('compromisos: separa lo que vence en 30 días de lo futuro', () => {
  const c = compromisos(foto(), 30)
  assert.equal(c.total, 150_000)       // resumen vencido de oct + resumen de nov
  assert.equal(c.futuro, 30_000)       // resumen de dic
  assert.equal(c.hasta, '2026-12')
  assert.equal(c.items.find(i => i.id === 'visa:2026-10')?.vencido, true)
  assert.equal(c.items.find(i => i.id === 'visa:2026-11')?.vencido, false)
})

test('compromisos: los fijos sin debitar entran, los debitados no', () => {
  const fijos = [
    { id: 'a', nombre: 'Alquiler', monto: 300_000, categoria: 'vivienda', debitado: false, created_at: '2026-01-01', tipo: 'fijo' },
    { id: 'b', nombre: 'Netflix', monto: 10_000, categoria: 'ocio', debitado: true, created_at: '2026-01-01', tipo: 'suscripcion' },
  ]
  assert.equal(compromisos(foto({ fijos }), 30).total, 150_000 + 300_000)
})

test('flujo del mes: ingresos, gastos, cuotas y balance', () => {
  const s = foto({
    ingresosFijos: [{ id: 's', nombre: 'Sueldo', monto: 1_000_000, monto_cobrado: null, created_at: '2026-01-01' }],
    freelance: [{ id: 'f', titulo: 'Render', monto: 200_000, fecha: '2026-10-03', created_at: '2026-10-03' }],
    fijos: [{ id: 'a', nombre: 'Alquiler', monto: 300_000, categoria: 'vivienda', debitado: false, created_at: '2026-01-01', tipo: 'fijo' }],
    gastos: [
      gasto({ nombre: 'Super', monto: 100_000, fecha: '2026-10-02' }),
      gasto({ nombre: 'Curso', monto: 20, moneda: 'USD', fecha: '2026-10-04' }),
      gasto({ nombre: 'Tele 1/3', monto: 50_000, fecha: '2026-09-15', compra_id: 'tele', cuota_numero: 1, cuotas_total: 3, fecha_compra: '2026-09-15' }),
      gasto({ nombre: 'Tele 2/3', monto: 50_000, fecha: '2026-09-15', compra_id: 'tele', cuota_numero: 2, cuotas_total: 3, fecha_compra: '2026-09-15' }),
      gasto({ nombre: 'Viejo', monto: 999, fecha: '2026-08-01' }),
    ],
    viajes: [{ id: 'v', viaje: 'Río', concepto: 'Cena', categoria: 'comida', monto: 40_000, fecha: '2026-10-14' }],
  })
  const f = flujoDelMes(s, '2026-10')
  assert.deepEqual(f.ingresos, { fijos: 1_000_000, extra: 200_000, secciones: 0, total: 1_200_000 })
  assert.equal(f.gastos.variables, 100_000 + 20 * 1000)
  assert.equal(f.gastos.cuotas, 50_000)          // la 2ª cuota cae en octubre
  assert.equal(f.gastos.fijos, 300_000)
  assert.equal(f.gastos.viajes, 40_000)
  assert.equal(f.gastos.total, 510_000)
  assert.equal(f.balance, 690_000)
  assert.ok(Math.abs(f.tasaAhorro - 57.5) < 1e-9)
  assert.equal(flujoDelMes(s, '2026-09').gastos.variables, 50_000)   // la 1ª cuota es consumo de septiembre
})

test('flujo de un mes vacío: sin ingresos no hay tasa de ahorro', () => {
  const f = flujoDelMes(foto(), '2026-10')
  assert.equal(f.tasaAhorro, null)
  assert.equal(f.conDatos, false)
})
