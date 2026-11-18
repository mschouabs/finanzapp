/* Preferencias de avisos y recordatorios propios: se guardan en tu
   cuenta (metadatos del usuario) y en el dispositivo. Sin tablas nuevas. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PREFS_DEFECTO, type PrefsAvisos, type Recordatorio } from './plan'

const K_PREFS = 'fa_avisos_prefs_v1'
const K_REC = 'fa_recordatorios_v1'
const K_AVISADOS = 'fa_avisos_enviados_v1'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export function normalizarPrefs(p: unknown): PrefsAvisos {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
  const b = (k: keyof PrefsAvisos) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : PREFS_DEFECTO[k])
  return { vencimientos: b('vencimientos'), presupuesto: b('presupuesto'), recordatorios: b('recordatorios'), semanal: b('semanal'), sonido: b('sonido') }
}

export function normalizarRecordatorios(r: unknown): Recordatorio[] {
  if (!Array.isArray(r)) return []
  return r.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.texto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha))
    .map(x => ({ id: x.id, texto: x.texto.slice(0, 140), fecha: x.fecha, hora: /^\d{2}:\d{2}$/.test(x.hora) ? x.hora : '09:00', mensual: !!x.mensual }))
}

const leer = <T,>(k: string, f: (v: unknown) => T): T => { try { return f(JSON.parse(localStorage.getItem(k) || 'null')) } catch { return f(null) } }
const escribir = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin storage */ } }

export const leerPrefsLocal = () => leer(K_PREFS, normalizarPrefs)
export const leerRecordatoriosLocal = () => leer(K_REC, normalizarRecordatorios)

export async function leerDeCuenta(supabase: Cliente): Promise<{ prefs: PrefsAvisos; recordatorios: Recordatorio[] } | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const m = user?.user_metadata
    if (!m || (!m.avisos && !m.recordatorios)) return null
    const r = { prefs: normalizarPrefs(m.avisos), recordatorios: normalizarRecordatorios(m.recordatorios) }
    escribir(K_PREFS, r.prefs); escribir(K_REC, r.recordatorios)
    return r
  } catch { return null }
}

export async function guardarPrefs(supabase: Cliente | null, p: PrefsAvisos) {
  escribir(K_PREFS, p)
  if (supabase) { try { await supabase.auth.updateUser({ data: { avisos: p } }) } catch { /* queda local */ } }
}

export async function guardarRecordatorios(supabase: Cliente | null, r: Recordatorio[]) {
  const limpio = normalizarRecordatorios(r)
  escribir(K_REC, limpio)
  if (supabase) { try { await supabase.auth.updateUser({ data: { recordatorios: limpio } }) } catch { /* queda local */ } }
  return limpio
}

/** Avisos inmediatos ya mandados (para no repetir los de presupuesto). */
export const leerAvisados = () => new Set(leer(K_AVISADOS, v => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])))
export function marcarAvisados(claves: string[]) {
  const s = leerAvisados(); claves.forEach(c => s.add(c))
  escribir(K_AVISADOS, Array.from(s).slice(-300))
}
