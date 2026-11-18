/* ── Web Push sin dependencias ─────────────────────────────────────────
   Cifrado "aes128gcm" (RFC 8291) y firma VAPID (RFC 8292) con el módulo
   crypto de Node. Solo corre en el servidor.                          */
import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign } from 'node:crypto'

export interface Suscripcion { endpoint: string; p256dh: string; auth: string }
export interface Vapid { publica: string; privada: string; sujeto: string }

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
export const deB64u = (s: string) => Buffer.from(s, 'base64url')

const hmac = (clave: Buffer, datos: Buffer) => createHmac('sha256', clave).update(datos).digest()

/** Cifra el mensaje para una suscripción. `fijos` es solo para tests. */
export function cifrar(texto: string, sus: Pick<Suscripcion, 'p256dh' | 'auth'>, fijos?: { privadaServidor: Buffer; sal: Buffer }): Buffer {
  const uaPublica = deB64u(sus.p256dh)
  const secretoAuth = deB64u(sus.auth)
  const ecdh = createECDH('prime256v1')
  if (fijos) ecdh.setPrivateKey(fijos.privadaServidor); else ecdh.generateKeys()
  const asPublica = ecdh.getPublicKey()
  const secreto = ecdh.computeSecret(uaPublica)
  const sal = fijos?.sal ?? randomBytes(16)

  const prkClave = hmac(secretoAuth, secreto)
  const ikm = hmac(prkClave, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublica, asPublica, Buffer.from([1])]))
  const prk = hmac(sal, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12)

  const c = createCipheriv('aes-128-gcm', cek, nonce)
  const cifrado = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()])
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return Buffer.concat([sal, rs, Buffer.from([asPublica.length]), asPublica, cifrado])
}

/** Encabezado Authorization de VAPID para el servicio de push del endpoint. */
export function firmaVapid(endpoint: string, v: Vapid, ahora = Math.floor(Date.now() / 1000)): string {
  const pub = deB64u(v.publica)
  const clave = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' })
  const cab = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const cuerpo = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: ahora + 12 * 3600, sub: v.sujeto })))
  const firma = sign('sha256', Buffer.from(`${cab}.${cuerpo}`), { key: clave, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${cab}.${cuerpo}.${b64u(firma)}, k=${v.publica}`
}

/** Manda un push. Devuelve el código HTTP (404/410 = la suscripción ya no existe). */
export async function enviarPush(sus: Suscripcion, datos: unknown, v: Vapid): Promise<number> {
  const r = await fetch(sus.endpoint, {
    method: 'POST',
    headers: {
      Authorization: firmaVapid(sus.endpoint, v),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(20 * 3600),
      Urgency: 'normal',
    },
    body: new Uint8Array(cifrar(JSON.stringify(datos), sus)),
  })
  return r.status
}

/** Genera un par de claves VAPID nuevo. */
export function generarVapid() {
  const e = createECDH('prime256v1'); e.generateKeys()
  return { publica: b64u(e.getPublicKey()), privada: b64u(e.getPrivateKey()) }
}
