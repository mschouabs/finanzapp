import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planificar, avisosPresupuesto, idNumerico, PREFS_DEFECTO } from '@/lib/notificaciones/plan'
const fmt = n => `$${n}`
const hoy = new Date(2026, 10, 18, 12, 0) // miércoles 18/11/2026 12:00

test('vencimiento: 3 días antes, 1 antes y el mismo día a las 9', () => {
  const a = planificar({ hoy, fmt, prefs: { ...PREFS_DEFECTO, semanal: false }, recordatorios: [],
    vencimientos: [{ id: 'visa', titulo: 'Visa', monto: 150000, fecha: new Date(2026, 10, 25), href: '/t' }] })
  assert.deepEqual(a.map(x => [x.cuando.getDate(), x.cuando.getHours()]), [[22, 9], [24, 9], [25, 9]])
  assert.match(a[2].titulo, /Vence hoy: Visa/)
  assert.match(a[0].cuerpo, /\$150000/)
})
test('aviso de 1 día antes que ya pasó no se programa', () => {
  const a = planificar({ hoy, fmt, prefs: { ...PREFS_DEFECTO, semanal: false }, recordatorios: [],
    vencimientos: [{ id: 'x', titulo: 'X', monto: 1, fecha: new Date(2026, 10, 19), href: '/' }] })
  assert.deepEqual(a.map(x => x.cuando.getDate()), [19])
})
test('respeta las preferencias apagadas', () => {
  const a = planificar({ hoy, fmt, prefs: { ...PREFS_DEFECTO, vencimientos: false, semanal: false }, recordatorios: [],
    vencimientos: [{ id: 'v', titulo: 'V', monto: 1, fecha: new Date(2026, 10, 25), href: '/' }] })
  assert.equal(a.length, 0)
})
test('recordatorio mensual se repite y ajusta fin de mes', () => {
  const a = planificar({ hoy, fmt, prefs: { ...PREFS_DEFECTO, semanal: false }, vencimientos: [],
    recordatorios: [{ id: 'r', texto: 'Patente', fecha: '2026-01-31', hora: '10:30', mensual: true }], dias: 60 })
  assert.deepEqual(a.map(x => `${x.cuando.getMonth() + 1}/${x.cuando.getDate()} ${x.cuando.getHours()}:${x.cuando.getMinutes()}`), ['11/30 10:30', '12/31 10:30'])
})
test('resumen semanal los domingos a las 20', () => {
  const a = planificar({ hoy, fmt, prefs: PREFS_DEFECTO, vencimientos: [], recordatorios: [], dias: 14 })
  assert.ok(a.length >= 2 && a.every(x => x.cuando.getDay() === 0 && x.cuando.getHours() === 20))
})
test('presupuesto: 80% y pasado, sin repetir', () => {
  const base = { topes: { comida: 100, ocio: 100, ropa: 100 }, mes: '2026-11', nombre: c => c, fmt, ahora: hoy }
  const a = avisosPresupuesto({ ...base, gastado: { comida: 85, ocio: 120, ropa: 10 }, avisados: new Set() })
  assert.deepEqual(a.map(x => x.clave), ['pres:2026-11:comida:80', 'pres:2026-11:ocio:100'])
  const b = avisosPresupuesto({ ...base, gastado: { comida: 85, ocio: 120 }, avisados: new Set(a.map(x => x.clave)) })
  assert.equal(b.length, 0)
})
test('ids numéricos estables y positivos', () => {
  assert.equal(idNumerico('a'), idNumerico('a'))
  assert.notEqual(idNumerico('a'), idNumerico('b'))
  assert.ok(idNumerico('xyz') > 0 && idNumerico('xyz') < 2 ** 31)
})
