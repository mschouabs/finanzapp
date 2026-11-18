import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoPresupuesto, normalizarPresupuestos } from '@/lib/presupuestos'
const f = n => `$${n}`

test('normaliza: descarta vacíos, negativos y basura', () => {
  assert.deepEqual(normalizarPresupuestos({ comida: '50000', ocio: 0, ropa: -3, x: 'abc' }), { comida: 50000 })
  assert.deepEqual(normalizarPresupuestos(null), {})
  assert.deepEqual(normalizarPresupuestos([1]), {})
})
test('pasado del tope', () => {
  const e = estadoPresupuesto(120, 100, 0.5, f)
  assert.equal(e.tono, 'negativo'); assert.equal(e.texto, 'Te pasaste $20')
})
test('va rápido a mitad de mes', () => {
  assert.equal(estadoPresupuesto(80, 100, 0.5, f).tono, 'advertencia')
})
test('va bien', () => {
  const e = estadoPresupuesto(40, 100, 0.5, f)
  assert.equal(e.tono, 'positivo'); assert.equal(e.texto, 'Quedan $60')
})
test('mes cerrado sin pasarse = bien', () => {
  assert.equal(estadoPresupuesto(95, 100, 1, f).tono, 'positivo')
})
