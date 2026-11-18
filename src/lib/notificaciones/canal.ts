'use client'
/* ── Por dónde salen los avisos ────────────────────────────────────────
   · App Android (Capacitor): notificaciones locales programadas. Llegan
     aunque la app esté cerrada, con el sonido de notificación del
     teléfono. Requiere el plugin @capacitor/local-notifications.
   · Navegador: notificaciones del sistema mientras la app está abierta.
   · Dentro de la app: un sonido corto al aparecer un aviso.           */
import { idNumerico, type Aviso } from './plan'

interface PluginNotif {
  checkPermissions(): Promise<{ display: string }>
  requestPermissions(): Promise<{ display: string }>
  schedule(o: { notifications: unknown[] }): Promise<unknown>
  getPending(): Promise<{ notifications: { id: number }[] }>
  cancel(o: { notifications: { id: number }[] }): Promise<void>
  createChannel?(c: Record<string, unknown>): Promise<void>
  addListener(ev: string, fn: (a: { notification: { extra?: { href?: string } } }) => void): Promise<{ remove(): void }> | { remove(): void }
}

const CANAL = 'finanzapp-avisos'

function plugin(): PluginNotif | null {
  if (typeof window === 'undefined') return null
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return (cap.Plugins?.LocalNotifications as PluginNotif | undefined) ?? null
}

export type Permiso = 'concedido' | 'denegado' | 'preguntar' | 'no-disponible'

export function esAppNativa() { return plugin() !== null }

export async function estadoPermiso(): Promise<Permiso> {
  const p = plugin()
  if (p) {
    try { const r = await p.checkPermissions(); return r.display === 'granted' ? 'concedido' : r.display === 'denied' ? 'denegado' : 'preguntar' } catch { return 'no-disponible' }
  }
  if (typeof Notification === 'undefined') return 'no-disponible'
  return Notification.permission === 'granted' ? 'concedido' : Notification.permission === 'denied' ? 'denegado' : 'preguntar'
}

export async function pedirPermiso(): Promise<Permiso> {
  const p = plugin()
  if (p) {
    try {
      const r = await p.requestPermissions()
      await p.createChannel?.({ id: CANAL, name: 'Avisos', description: 'Vencimientos, presupuesto y recordatorios', importance: 4, visibility: 1, vibration: true })
      return r.display === 'granted' ? 'concedido' : 'denegado'
    } catch { return 'no-disponible' }
  }
  if (typeof Notification === 'undefined') return 'no-disponible'
  const r = await Notification.requestPermission()
  return r === 'granted' ? 'concedido' : r === 'denied' ? 'denegado' : 'preguntar'
}

const aNativo = (a: Aviso, at?: Date) => ({
  id: idNumerico(a.clave), title: a.titulo, body: a.cuerpo, channelId: CANAL,
  ...(at ? { schedule: { at, allowWhileIdle: true } } : {}),
  extra: { href: a.href, clave: a.clave },
})

/** Reemplaza todo lo programado por esta lista (solo en la app Android). */
export async function programar(avisos: Aviso[]): Promise<number> {
  const p = plugin()
  if (!p) return 0
  try {
    const { display } = await p.checkPermissions()
    if (display !== 'granted') return 0
    const { notifications } = await p.getPending()
    if (notifications.length) await p.cancel({ notifications: notifications.map(n => ({ id: n.id })) })
    const lista = avisos.slice(0, 60).map(a => aNativo(a, a.cuando))
    if (lista.length) await p.schedule({ notifications: lista })
    return lista.length
  } catch { return 0 }
}

/** Muestra un aviso ahora (Android o navegador). */
export async function mostrarYa(a: Aviso, sonido: boolean) {
  if (sonido) sonar()
  const p = plugin()
  if (p) {
    try { await p.schedule({ notifications: [aNativo(a, new Date(Date.now() + 1000))] }) } catch { /* sin permiso */ }
    return
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const opciones = { body: a.cuerpo, icon: '/icon-192.png', badge: '/icon-192.png', tag: a.clave, data: { href: a.href } }
    /* en Chrome del celular (y en la app instalada desde Chrome) solo funciona desde el service worker */
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
      if (reg) { await reg.showNotification(a.titulo, opciones); return }
    } catch { /* sigue con el método común */ }
    try {
      const n = new Notification(a.titulo, opciones)
      n.onclick = () => { window.focus(); window.location.href = a.href }
    } catch { /* este navegador no permite notificaciones */ }
  }
}

/** Al tocar una notificación en Android, ir a la pantalla que corresponde. */
export function alTocar(ir: (href: string) => void): () => void {
  const p = plugin()
  if (!p) return () => {}
  let quitar: (() => void) | null = null
  Promise.resolve(p.addListener('localNotificationActionPerformed', a => { const h = a.notification.extra?.href; if (h) ir(h) }))
    .then(l => { quitar = () => l.remove() }).catch(() => {})
  return () => quitar?.()
}

/** Sonido corto y suave (dos notas), generado en el momento: no hace falta archivo. */
let ctx: AudioContext | null = null
export function sonar() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = ctx ?? new AC()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t0 = ctx.currentTime
    for (const [i, f] of [[0, 880], [1, 1318.5]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      const t = t0 + i * 0.12
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(t); o.stop(t + 0.4)
    }
  } catch { /* sin audio */ }
}

/* ── Avisos con la app cerrada en el navegador (Web Push) ─────────────
   El celular se anota una vez; después el servidor manda los avisos del
   día todas las mañanas, aunque la app esté cerrada.                  */
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export const pushDisponible = () =>
  typeof window !== 'undefined' && !esAppNativa() && !!CLAVE_PUBLICA && 'serviceWorker' in navigator && 'PushManager' in window

function aBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

/** Anota este dispositivo para recibir avisos con la app cerrada. Devuelve true si quedó anotado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activarPush(supabase: { from: (t: string) => any }): Promise<boolean> {
  if (!pushDisponible() || Notification.permission !== 'granted') return false
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
    await navigator.serviceWorker.ready
    const sus = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE_PUBLICA) }))
    const j = sus.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return false
    const { error } = await supabase.from('push_suscripciones')
      .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
    return !error
  } catch { return false }
}

/** ¿Este dispositivo ya está anotado? */
export async function pushActivo(): Promise<boolean> {
  if (!pushDisponible()) return false
  try { return !!(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()) } catch { return false }
}
