import test from 'node:test'
import assert from 'node:assert/strict'
import { aISO, estadoResumen, fechasDeResumen, resumenDeCompra, sumarMeses, diasEntre } from '@/lib/ciclos'

const visa = { cierre: 27, vencimiento: 10 }      // vence el mes siguiente al cierre
const mp = { cierre: 5, vencimiento: 17 }          // vence el mismo mes del cierre

test('compra antes del cierre entra al resumen que vence el mes siguiente', () => {
  assert.equal(resumenDeCompra('2026-09-05', visa), '2026-10')
  assert.equal(resumenDeCompra('2026-09-27', visa), '2026-10')
})
test('compra después del cierre pasa al resumen siguiente', () => {
  assert.equal(resumenDeCompra('2026-09-28', visa), '2026-11')
})
test('tarjeta que cierra y vence el mismo mes', () => {
  assert.equal(resumenDeCompra('2026-10-05', mp), '2026-10')
  assert.equal(resumenDeCompra('2026-10-06', mp), '2026-11')
})
test('cambio de año', () => {
  assert.equal(resumenDeCompra('2026-12-28', visa), '2027-02')
  assert.equal(sumarMeses('2026-11', 3), '2027-02')
  assert.equal(sumarMeses('2026-01', -1), '2025-12')
})
test('sin ciclo cargado: el resumen es el mes de la compra', () => {
  assert.equal(resumenDeCompra('2026-09-28', { cierre: null, vencimiento: null }), '2026-09')
})
test('fechas del resumen', () => {
  const f = fechasDeResumen('2026-10', visa)
  assert.deepEqual([aISO(f.desde), aISO(f.cierre), aISO(f.vencimiento)], ['2026-08-28', '2026-09-27', '2026-10-10'])
})
test('día de cierre 31 se recorta en meses cortos', () => {
  const f = fechasDeResumen('2026-03', { cierre: 31, vencimiento: 10 })
  assert.equal(aISO(f.cierre), '2026-02-28')
})
test('toda compra cae dentro de las fechas de su resumen', () => {
  for (const t of [visa, mp, { cierre: 31, vencimiento: 15 }, { cierre: 1, vencimiento: 28 }]) {
    for (let d = new Date(2026, 0, 1); d < new Date(2027, 2, 1); d.setDate(d.getDate() + 1)) {
      const f = fechasDeResumen(resumenDeCompra(d, t), t)
      assert.ok(d >= f.desde && d <= f.cierre, `${aISO(d)} fuera de su resumen (cierre ${t.cierre})`)
    }
  }
})
test('estado del resumen', () => {
  const hoy = (s) => new Date(s + 'T12:00:00')
  assert.equal(estadoResumen('2026-10', visa, 0, 0, hoy('2026-09-10')), 'vacio')
  assert.equal(estadoResumen('2026-10', visa, 100, 100, hoy('2026-09-10')), 'abierto')
  assert.equal(estadoResumen('2026-10', visa, 100, 100, hoy('2026-10-05')), 'a_pagar')
  assert.equal(estadoResumen('2026-10', visa, 100, 100, hoy('2026-10-11')), 'vencido')
  assert.equal(estadoResumen('2026-10', visa, 0, 100, hoy('2026-10-11')), 'pagado')
  assert.equal(estadoResumen('2026-12', visa, 100, 100, hoy('2026-09-10')), 'futuro')
})
test('días entre fechas ignora la hora', () => {
  assert.equal(diasEntre(new Date(2026, 9, 1, 23), new Date(2026, 9, 3, 1)), 2)
})
