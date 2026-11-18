import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerRespaldo, filasNuevas } from '@/lib/respaldo'

test('lee respaldo viejo (solo preferencias)', () => {
  const r = leerRespaldo(JSON.stringify({ exportadoEn: '2026-01-01', preferencias: { moneda: 'ARS' } }))
  assert.equal(r.version, 1)
  assert.deepEqual(r.tablas, {})
  assert.equal(r.preferencias.moneda, 'ARS')
})
test('lee respaldo completo e ignora tablas desconocidas', () => {
  const r = leerRespaldo(JSON.stringify({ version: 2, tablas: { metas: [{ id: 'a' }], hackeo: [{ id: 'x' }] } }))
  assert.deepEqual(Object.keys(r.tablas), ['metas'])
})
test('rechaza archivos inválidos', () => {
  assert.throws(() => leerRespaldo('no json'))
  assert.throws(() => leerRespaldo('[]'))
  assert.throws(() => leerRespaldo('{}'))
})
test('solo agrega filas nuevas y las asigna al usuario actual', () => {
  const n = filasNuevas([{ id: 'a', user_id: 'viejo' }, { id: 'b', user_id: 'viejo' }, { nombre: 'sin id' }], new Set(['a']), 'yo')
  assert.deepEqual(n, [{ id: 'b', user_id: 'yo' }])
})
