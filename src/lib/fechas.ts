/* ── Fechas en hora local ─────────────────────────────────────────
   `new Date().toISOString()` da la fecha en UTC: en Argentina, desde
   las 21 hs ya es "mañana". Toda la app usa estas funciones para
   "hoy" y "este mes".                                               */

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD de una fecha, en hora local. */
export const isoLocal = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Hoy (YYYY-MM-DD) en hora local del dispositivo. */
export const hoyISO = () => isoLocal(new Date())

/** Mes actual (YYYY-MM) en hora local. */
export const mesActualISO = () => hoyISO().slice(0, 7)

/** Hoy en Argentina, para código que corre en el servidor (Vercel está en UTC). */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
