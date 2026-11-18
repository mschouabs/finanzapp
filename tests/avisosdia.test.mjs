import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDelDia, ahoraArgentina, soloDe } from '@/lib/servidor/avisosDelDia'
import { clienteDemo, USUARIO_DEMO } from '@/lib/demo'

test('hora de Argentina', () => {
  const d = ahoraArgentina(Date.UTC(2026, 10, 22, 12, 0))
  assert.equal(d.getHours(), 9); assert.equal(d.getDate(), 22)
})

test('avisos del día con datos de ejemplo: presupuesto, recordatorio y resumen del domingo', async () => {
  const hoy = new Date()
  const domingo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + ((7 - hoy.getDay()) % 7), 9, 0)
  const iso = `${domingo.getFullYear()}-${String(domingo.getMonth() + 1).padStart(2, '0')}-${String(domingo.getDate()).padStart(2, '0')}`
  const avisos = await avisosDelDia({
    cliente: soloDe(clienteDemo(), USUARIO_DEMO.id),
    metadatos: { presupuestos: { ropa: 1000 }, recordatorios: [{ id: 'r', texto: 'Pagar alquiler', fecha: iso, hora: '15:30', mensual: false }] },
    enviados: new Set(), hoy: domingo,
  })
  const claves = avisos.map(a => a.clave.split(':')[0])
  assert.ok(claves.includes('rec'), 'recordatorio')
  assert.ok(claves.includes('sem'), 'semanal')
  assert.equal(avisos.find(a => a.clave.startsWith('rec')).titulo, 'Hoy a las 15:30')
})

test('cada consulta del envío diario se filtra por el usuario', async () => {
  const filtros = []
  const espia = { from: t => { const q = clienteDemo().from(t); return new Proxy(q, { get: (o, k) => k === 'select' ? (...a) => { const r = o.select(...a); return new Proxy(r, { get: (oo, kk) => kk === 'eq' ? (c, v) => { filtros.push([t, c, v]); return oo.eq(c, v) } : oo[kk] }) } : o[k] }) } }
  await avisosDelDia({ cliente: soloDe(espia, 'u1'), metadatos: {}, enviados: new Set(), hoy: new Date() })
  const tablas = new Set(filtros.map(f => f[0]))
  const conUsuario = new Set(filtros.filter(f => f[1] === 'user_id' && f[2] === 'u1').map(f => f[0]))
  assert.ok(tablas.size >= 10)
  assert.deepEqual([...tablas].filter(t => !conUsuario.has(t)), [])
})
