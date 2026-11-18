// Genera las claves para los avisos con la app cerrada (Web Push).
// Uso:  node scripts/generar-claves-avisos.mjs
// Copiá cada línea como variable de entorno en Vercel (Settings → Environment Variables).
// No las compartas con nadie ni las subas a GitHub.
import { createECDH, randomBytes } from 'node:crypto'
const e = createECDH('prime256v1'); e.generateKeys()
const b64u = b => Buffer.from(b).toString('base64url')
console.log('\nCargá estas 3 variables en Vercel:\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY = ${b64u(e.getPublicKey())}`)
console.log(`VAPID_PRIVATE_KEY = ${b64u(e.getPrivateKey())}`)
console.log(`CRON_SECRET = ${randomBytes(24).toString('base64url')}`)
console.log('\nY si todavía no está: SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role).\n')
