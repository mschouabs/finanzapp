import test from 'node:test'
import assert from 'node:assert/strict'
import { extraerCuotas, extraerMonto, detectarMoneda, parsear } from '@/lib/parser'

test('montos en formato argentino', () => {
  assert.equal(extraerMonto('gasté 18.500 en el súper'), 18500)
  assert.equal(extraerMonto('uber 4500'), 4500)
  assert.equal(extraerMonto('super 32 mil'), 32000)
  assert.equal(extraerMonto('pagué 5mil de luz'), 5000)
})
test('moneda', () => {
  assert.equal(detectarMoneda('uber 4500'), 'ARS')
  assert.equal(detectarMoneda('hotel 120 dolares'), 'USD')
})
test('cuotas', () => {
  assert.equal(extraerCuotas('zapatillas 90 mil en 3 cuotas')?.cuotas, 3)
  assert.equal(extraerCuotas('uber 4500'), null)
})
test('un gasto simple se entiende completo', () => {
  const r = parsear('gasté 18.500 en el súper', new Date(2026, 9, 16, 12))
  assert.equal(r.tipo, 'gasto_variable')
  assert.equal(r.datos?.monto, 18500)
  assert.equal(r.datos?.fecha, '2026-10-16')
})
test('texto sin monto no inventa un movimiento', () => {
  assert.equal(parsear('hola luca', new Date(2026, 9, 16)).tipo, 'texto')
})
