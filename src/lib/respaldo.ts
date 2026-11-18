/* ── Respaldo completo (exportar / importar JSON) ──────────────────────
   Exporta todas tus tablas en un solo archivo. Importar NUNCA borra ni
   pisa nada: solo agrega las filas cuyo id todavía no existe (así se
   puede restaurar un respaldo sin duplicar). Los archivos viejos, que
   solo traían "preferencias", se siguen pudiendo importar.          */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Orden de padres a hijos, para respetar las referencias al importar. */
export const TABLAS_RESPALDO = [
  'tarjetas_cuentas', 'inversiones', 'secciones', 'viajes', 'metas',
  'ingresos_fijos', 'ingresos_freelance', 'gastos_fijos', 'gastos_variables',
  'viaje_gastos', 'seccion_registros', 'me_deben', 'patrimonio_mensual',
  'movimientos', 'movimientos_control',
] as const

export interface Respaldo {
  app?: string
  version?: number
  exportadoEn?: string
  preferencias?: Record<string, unknown>
  tablas?: Record<string, Record<string, unknown>[]>
}

export interface ResumenImportacion { tabla: string; nuevas: number; existentes: number; error?: string }

/** Lee un archivo de respaldo (v1 = solo preferencias, v2 = completo). */
export function leerRespaldo(texto: string): Respaldo {
  let d: unknown
  try { d = JSON.parse(texto) } catch { throw new Error('El archivo no es un JSON válido.') }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('El archivo no tiene el formato de un respaldo de la app.')
  const r = d as Respaldo
  if (!r.preferencias && !r.tablas) throw new Error('El archivo no tiene datos para importar.')
  const tablas: Record<string, Record<string, unknown>[]> = {}
  for (const [k, v] of Object.entries(r.tablas ?? {})) {
    if ((TABLAS_RESPALDO as readonly string[]).includes(k) && Array.isArray(v)) tablas[k] = v.filter(x => x && typeof x === 'object')
  }
  return { ...r, version: r.version ?? 1, tablas }
}

/** Filas a insertar: las que no existen todavía, a nombre del usuario actual. */
export function filasNuevas(filas: Record<string, unknown>[], existentes: Set<string>, uid: string) {
  return filas.filter(f => typeof f.id === 'string' && !existentes.has(f.id)).map(f => ('user_id' in f ? { ...f, user_id: uid } : f))
}

export async function exportarTodo(supabase: SupabaseClient, preferencias: Record<string, unknown>): Promise<Respaldo> {
  const tablas: Record<string, Record<string, unknown>[]> = {}
  for (const t of TABLAS_RESPALDO) {
    const filas: Record<string, unknown>[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from(t).select('*').range(desde, desde + 999)
      if (error || !data) break
      filas.push(...data)
      if (data.length < 1000) break
    }
    tablas[t] = filas
  }
  return { app: 'finanzapp', version: 2, exportadoEn: new Date().toISOString(), preferencias, tablas }
}

export async function importarTodo(supabase: SupabaseClient, uid: string, r: Respaldo): Promise<ResumenImportacion[]> {
  const out: ResumenImportacion[] = []
  for (const t of TABLAS_RESPALDO) {
    const filas = r.tablas?.[t]
    if (!filas?.length) continue
    const ids = filas.map(f => f.id).filter((x): x is string => typeof x === 'string')
    const existentes = new Set<string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from(t).select('id').in('id', ids.slice(i, i + 200))
      for (const x of data ?? []) existentes.add(String((x as { id: string }).id))
    }
    const nuevas = filasNuevas(filas, existentes, uid)
    let error: string | undefined
    for (let i = 0; i < nuevas.length && !error; i += 200) {
      const { error: e } = await supabase.from(t).insert(nuevas.slice(i, i + 200))
      if (e) error = e.message
    }
    out.push({ tabla: t, nuevas: error ? 0 : nuevas.length, existentes: existentes.size, error })
  }
  return out
}
