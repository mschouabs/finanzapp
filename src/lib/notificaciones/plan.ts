/* ── Qué avisar y cuándo ───────────────────────────────────────────────
   Lógica pura (sin Android ni navegador), así se puede testear.
   · Vencimientos: 3 días antes, 1 día antes y el mismo día, a las 9.
   · Recordatorios propios: el día y la hora que elegiste (o todos los
     meses ese día).
   · Resumen semanal: los domingos a las 20.
   · Presupuesto: al llegar al 80 % y al pasarse del tope (una vez por
     mes y categoría).                                                 */

export interface PrefsAvisos {
  vencimientos: boolean
  presupuesto: boolean
  recordatorios: boolean
  semanal: boolean
  sonido: boolean
}

export const PREFS_DEFECTO: PrefsAvisos = { vencimientos: true, presupuesto: true, recordatorios: true, semanal: true, sonido: true }

export interface Recordatorio {
  id: string
  texto: string
  /** YYYY-MM-DD (si es mensual, se usa solo el día) */
  fecha: string
  /** HH:MM */
  hora: string
  mensual: boolean
}

export interface Vencimiento { id: string; titulo: string; monto: number; fecha: Date; href: string }

export interface Aviso {
  clave: string
  titulo: string
  cuerpo: string
  cuando: Date
  href: string
}

const HORA_AVISO = 9
const pad = (n: number) => String(n).padStart(2, '0')
const claveDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const enDia = (d: Date, delta: number, hora = HORA_AVISO, min = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, hora, min)

export function planificar({ hoy, vencimientos, recordatorios, prefs, fmt, dias = 35 }: {
  hoy: Date
  vencimientos: Vencimiento[]
  recordatorios: Recordatorio[]
  prefs: PrefsAvisos
  fmt: (n: number) => string
  dias?: number
}): Aviso[] {
  const limite = enDia(hoy, dias, 23, 59)
  const out: Aviso[] = []
  const agregar = (a: Aviso) => { if (a.cuando > hoy && a.cuando <= limite) out.push(a) }

  if (prefs.vencimientos) {
    for (const v of vencimientos) {
      const monto = v.monto > 0 ? ` ${fmt(v.monto)}` : ''
      const textos: [number, string, string][] = [
        [-3, `Vence en 3 días: ${v.titulo}`, `Tenés que pagar${monto} el ${v.fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}.`],
        [-1, `Vence mañana: ${v.titulo}`, `Acordate de pagar${monto}.`],
        [0, `Vence hoy: ${v.titulo}`, `Hoy es el último día para pagar${monto}.`],
      ]
      for (const [delta, titulo, cuerpo] of textos) {
        agregar({ clave: `venc:${v.id}:${claveDia(v.fecha)}:${delta}`, titulo, cuerpo, cuando: enDia(v.fecha, delta), href: v.href })
      }
    }
  }

  if (prefs.recordatorios) {
    for (const r of recordatorios) {
      const [h, m] = (r.hora || '09:00').split(':').map(Number)
      const [y, mo, d] = r.fecha.split('-').map(Number)
      if (!y || !mo || !d) continue
      const fechas: Date[] = []
      if (r.mensual) {
        for (let i = 0; i <= 2; i++) {
          const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + i + 1, 0).getDate()
          fechas.push(new Date(hoy.getFullYear(), hoy.getMonth() + i, Math.min(d, ultimo), h || 0, m || 0))
        }
      } else fechas.push(new Date(y, mo - 1, d, h || 0, m || 0))
      for (const f of fechas) {
        agregar({ clave: `rec:${r.id}:${claveDia(f)}`, titulo: 'Recordatorio', cuerpo: r.texto, cuando: f, href: '/dashboard/configuracion' })
      }
    }
  }

  if (prefs.semanal) {
    for (let i = 0; i <= dias; i++) {
      const d = enDia(hoy, i, 20)
      if (d.getDay() === 0) agregar({ clave: `sem:${claveDia(d)}`, titulo: 'Tu semana', cuerpo: 'Mirá cuánto gastaste esta semana y en qué se fue.', cuando: d, href: '/dashboard/gastos-variables' })
    }
  }

  return out.sort((a, b) => a.cuando.getTime() - b.cuando.getTime())
}

/** Avisos de presupuesto para mandar ya. `avisados` evita repetir el mismo aviso. */
export function avisosPresupuesto({ gastado, topes, mes, avisados, nombre, fmt, ahora }: {
  gastado: Record<string, number>
  topes: Record<string, number>
  mes: string
  avisados: Set<string>
  nombre: (clave: string) => string
  fmt: (n: number) => string
  ahora: Date
}): Aviso[] {
  const out: Aviso[] = []
  for (const [cat, tope] of Object.entries(topes)) {
    const g = gastado[cat] ?? 0
    if (!(tope > 0)) continue
    const base = { cuando: ahora, href: '/dashboard/gastos-variables' }
    if (g > tope) {
      const clave = `pres:${mes}:${cat}:100`
      if (!avisados.has(clave)) out.push({ ...base, clave, titulo: `Te pasaste en ${nombre(cat)}`, cuerpo: `Llevás ${fmt(g)} de ${fmt(tope)} este mes (${fmt(g - tope)} de más).` })
    } else if (g >= tope * 0.8) {
      const clave = `pres:${mes}:${cat}:80`
      if (!avisados.has(clave)) out.push({ ...base, clave, titulo: `${nombre(cat)}: ya usaste el ${Math.floor((g / tope) * 100)}%`, cuerpo: `Te quedan ${fmt(tope - g)} de ${fmt(tope)} para el mes.` })
    }
  }
  return out
}

/** Id numérico estable para Android (31 bits). */
export function idNumerico(clave: string): number {
  let h = 2166136261
  for (let i = 0; i < clave.length; i++) { h ^= clave.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) % 2147483647 || 1
}
