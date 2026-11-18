/* Qué mandarle hoy a un usuario (lo usa el envío diario de push). */
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarSnapshot, categorias, claveMes, compromisos, isoLocal } from '@/lib/finanzas/nucleo'
import { getCat } from '@/lib/categorias'
import { normalizarPresupuestos } from '@/lib/presupuestos'
import { avisosPresupuesto, planificar, type Aviso } from '@/lib/notificaciones/plan'
import { normalizarPrefs, normalizarRecordatorios } from '@/lib/notificaciones/almacen'

const fmt = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
const pad = (n: number) => String(n).padStart(2, '0')

/** "Ahora" con la hora de Argentina, expresado en la hora local del servidor. */
export function ahoraArgentina(ms = Date.now()) {
  const d = new Date(ms - 3 * 3600_000)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
}

/** Cliente que solo ve las filas de un usuario (el de servicio ve todo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function soloDe(admin: SupabaseClient<any, any, any>, uid: string): SupabaseClient {
  return new Proxy(admin, {
    get(t, k) {
      if (k !== 'from') return Reflect.get(t, k)
      return (tabla: string) => {
        const q = t.from(tabla)
        return new Proxy(q, { get: (o, kk) => (kk === 'select' ? (...a: unknown[]) => (o.select as unknown as (...x: unknown[]) => { eq: (c: string, v: string) => unknown }).apply(o, a).eq('user_id', uid) : Reflect.get(o, kk)) })
      }
    },
  }) as SupabaseClient
}

export async function avisosDelDia({ cliente, metadatos, enviados, hoy }: {
  cliente: SupabaseClient
  metadatos: Record<string, unknown>
  /** claves de presupuesto ya mandadas */
  enviados: Set<string>
  hoy: Date
}): Promise<Aviso[]> {
  const prefs = normalizarPrefs(metadatos.avisos)
  const s = await cargarSnapshot(cliente, hoy)
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const hoyISO = isoLocal(hoy)

  const vencimientos = compromisos(s, 10).items.filter(i => i.fecha && !i.vencido)
    .map(i => ({ id: i.id, titulo: i.titulo, monto: i.monto, fecha: i.fecha as Date, href: i.href }))
  const plan = planificar({ hoy: new Date(inicio.getTime() - 1), vencimientos, recordatorios: normalizarRecordatorios(metadatos.recordatorios), prefs, fmt, dias: 1 })
    .filter(a => isoLocal(a.cuando) === hoyISO)
    .map(a => {
      if (a.clave.startsWith('rec:')) return { ...a, titulo: `Hoy a las ${pad(a.cuando.getHours())}:${pad(a.cuando.getMinutes())}`, cuerpo: a.cuerpo }
      if (a.clave.startsWith('sem:')) {
        const desde = isoLocal(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() - 6))
        const total = s.gastos.filter(g => g.fecha >= desde && g.fecha <= hoyISO).reduce((t, g) => t + (g.moneda === 'USD' ? g.monto * s.dolar : g.monto), 0)
        return { ...a, cuerpo: total > 0 ? `En los últimos 7 días gastaste ${fmt(total)} en el día a día. Tocá para ver en qué.` : a.cuerpo }
      }
      return a
    })

  const out = [...plan]
  if (prefs.presupuesto) {
    const topes = normalizarPresupuestos(metadatos.presupuestos)
    if (Object.keys(topes).length) {
      const mes = claveMes(hoy)
      const gastado = Object.fromEntries(categorias(s, mes).map(c => [c.clave, c.monto]))
      out.push(...avisosPresupuesto({ gastado, topes, mes, avisados: enviados, nombre: c => (c === 'viajes' ? 'Viajes' : getCat(c).label), fmt, ahora: hoy }))
    }
  }
  return out
}
