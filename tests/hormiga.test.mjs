import test from 'node:test'
import assert from 'node:assert/strict'
import { contextoHormiga, esHormiga } from '@/lib/finanzas/hormiga'

const hoy = new Date(2026, 10, 17, 12)
const g = (nombre, monto, categoria = 'varios', dias = 1, extra = {}) => {
  const d = new Date(2026, 10, 17 - dias)
  return { nombre, monto, categoria, moneda: 'ARS', fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, ...extra }
}
/* historia: muchos gastos chicos y algunos grandes */
const base = [
  g('Café', 3500, 'comida', 1), g('Kiosco', 2800, 'mercado', 2), g('Uber', 6500, 'transporte', 3),
  g('Supermercado', 87000, 'mercado', 4), g('Alquiler', 450000, 'varios', 5), g('Nafta', 9000, 'transporte', 6),
  g('Zapatillas', 145000, 'ropa', 8), g('Cine', 16000, 'ocio', 9), g('Farmacia', 5200, 'farmacia', 10),
  g('Café', 3800, 'comida', 12), g('Café', 4000, 'comida', 20), g('Monotributo', 37000, 'impuesto', 15),
]
const ctx = contextoHormiga(base, 1000, hoy)

test('el umbral sale de tus propios gastos (no es un monto fijo)', () => {
  assert.ok(ctx.umbral >= 3500 && ctx.umbral <= 9000, `umbral ${ctx.umbral}`)
})
test('café, kiosco y Uber chicos son hormiga', () => {
  assert.equal(esHormiga(base[0], ctx, 1000), true)
  assert.equal(esHormiga(base[1], ctx, 1000), true)
  assert.equal(esHormiga(g('Uber', 4200, 'transporte'), ctx, 1000), true)
})
test('lo necesario o grande nunca es hormiga', () => {
  assert.equal(esHormiga(base[3], ctx, 1000), false)                  // súper grande
  assert.equal(esHormiga(g('Nafta', 3000, 'transporte'), ctx, 1000), false)
  assert.equal(esHormiga(g('SUBE', 2000, 'transporte'), ctx, 1000), false)
  assert.equal(esHormiga(base[8], ctx, 1000), false)                  // farmacia
  assert.equal(esHormiga(g('Tasa municipal', 3000, 'impuesto'), ctx, 1000), false)
})
test('las cuotas no son hormiga', () => {
  assert.equal(esHormiga(g('Café', 2000, 'comida', 1, { cuotas_total: 3 }), ctx, 1000), false)
})
test('lo que se repite seguido cuenta aunque no tenga una palabra conocida', () => {
  assert.ok(ctx.repetidos.has('cafe'))
  const otros = [...base, g('Chino', 2500, 'mercado', 2), g('Chino', 2600, 'mercado', 9), g('Chino', 2400, 'mercado', 16)]
  const c = contextoHormiga(otros, 1000, hoy)
  assert.equal(esHormiga(g('Chino', 2500, 'mercado'), c, 1000), true)
})
test('lo marcado a mano se respeta', () => {
  assert.equal(esHormiga(g('Algo raro', 90000, 'varios', 1, { es_gasto_hormiga: true }), ctx, 1000), true)
})
test('con pocos datos no adivina', () => {
  const c = contextoHormiga(base.slice(0, 3), 1000, hoy)
  assert.equal(esHormiga(base[0], c, 1000), false)
})
