import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH, createHmac, createDecipheriv, verify, createPublicKey } from 'node:crypto'
import { cifrar, firmaVapid, generarVapid, deB64u, b64u } from '@/lib/servidor/webpush'

test('cifrado igual al ejemplo del RFC 8291', () => {
  const sus = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }
  const out = cifrar('When I grow up, I want to be a watermelon', sus, {
    privadaServidor: deB64u('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), sal: deB64u('DGv6ra1nlYgDCS1FRnbzlw'),
  })
  assert.equal(b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN')
})

test('el celular puede descifrar lo que mandamos', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys()
  const auth = Buffer.from('0123456789abcdef')
  const out = cifrar('{"titulo":"hola"}', { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) })
  const sal = out.subarray(0, 16), largo = out[20], asPub = out.subarray(21, 21 + largo), datos = out.subarray(21 + largo)
  const h = (k, d) => createHmac('sha256', k).update(d).digest()
  const ikm = h(h(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]))
  const prk = h(sal, ikm)
  const d = createDecipheriv('aes-128-gcm', h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16), h(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12))
  d.setAuthTag(datos.subarray(-16))
  const plano = Buffer.concat([d.update(datos.subarray(0, -16)), d.final()])
  assert.equal(plano.subarray(0, -1).toString(), '{"titulo":"hola"}')
  assert.equal(plano.at(-1), 2)
})

test('firma VAPID válida', () => {
  const v = { ...generarVapid(), sujeto: 'https://ejemplo.app' }
  const h = firmaVapid('https://fcm.googleapis.com/fcm/send/abc', v, 1000)
  const [, jwt] = h.match(/t=([^,]+)/)
  const [a, b, c] = jwt.split('.')
  assert.deepEqual(JSON.parse(deB64u(b)), { aud: 'https://fcm.googleapis.com', exp: 1000 + 43200, sub: 'https://ejemplo.app' })
  const pub = deB64u(v.publica)
  const clave = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' })
  assert.ok(verify('sha256', Buffer.from(`${a}.${b}`), { key: clave, dsaEncoding: 'ieee-p1363' }, deB64u(c)))
  assert.match(h, new RegExp(`k=${v.publica}$`))
})
