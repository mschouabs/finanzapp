import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lucaPermitido } from '@/lib/servidor/permisos'

test('Luca: sin lista, cualquiera con sesión', () => {
  delete process.env.LUCA_PERMITIDOS
  assert.equal(lucaPermitido('x@y.com'), true)
})
test('Luca: con lista, solo esas cuentas (sin importar mayúsculas ni espacios)', () => {
  process.env.LUCA_PERMITIDOS = ' Uno@Mail.com , dos@mail.com '
  assert.equal(lucaPermitido('uno@mail.com'), true)
  assert.equal(lucaPermitido('DOS@mail.com'), true)
  assert.equal(lucaPermitido('otro@mail.com'), false)
  assert.equal(lucaPermitido(null), false)
  delete process.env.LUCA_PERMITIDOS
})
