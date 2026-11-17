/* ── Layout del Inicio: qué widgets se ven, en qué orden y de qué tamaño ──
   Se guarda solo: al instante en este dispositivo (localStorage) y, con
   un pequeño retraso, en tu cuenta (metadatos del usuario en Supabase),
   así el orden te sigue a cualquier dispositivo. Sin tablas nuevas.   */

import type { SupabaseClient } from '@supabase/supabase-js'

export type Tam = 'S' | 'M' | 'L'

export interface DefWidget { titulo: string; tamanos: Tam[]; tam: Tam; href?: string }

export const WIDGETS = {
  luca: { titulo: 'Luca', tamanos: ['M', 'L'], tam: 'M' },
  libre: { titulo: 'Libre para usar', tamanos: ['L', 'M'], tam: 'L', href: '/dashboard/tarjetas' },
  patrimonio: { titulo: 'Patrimonio neto', tamanos: ['L', 'M'], tam: 'L', href: '/dashboard/billeteras' },
  mes: { titulo: 'Gasto del mes', tamanos: ['M', 'S', 'L'], tam: 'M', href: '/dashboard/gastos-variables' },
  vencimiento: { titulo: 'Próximo vencimiento', tamanos: ['S', 'M'], tam: 'S', href: '/dashboard/tarjetas' },
  inversiones: { titulo: 'Inversiones', tamanos: ['S', 'M'], tam: 'S', href: '/dashboard/inversiones' },
  metas: { titulo: 'Metas', tamanos: ['M', 'S', 'L'], tam: 'M', href: '/dashboard/metas' },
  flujo: { titulo: 'El mes', tamanos: ['L', 'M'], tam: 'L', href: '/dashboard/historial' },
  insights: { titulo: 'Lo que ve Luca', tamanos: ['L', 'M'], tam: 'L' },
  evolucion: { titulo: 'Evolución', tamanos: ['L', 'M'], tam: 'L', href: '/dashboard/historial' },
  actividad: { titulo: 'Actividad reciente', tamanos: ['L', 'M'], tam: 'L', href: '/dashboard/historial' },
  categorias: { titulo: 'En qué se fue', tamanos: ['M', 'L'], tam: 'M', href: '/dashboard/gastos-variables' },
  compromisos: { titulo: 'Lo que viene', tamanos: ['M', 'L'], tam: 'M', href: '/dashboard/tarjetas' },
} satisfies Record<string, DefWidget>

export type IdWidget = keyof typeof WIDGETS
export const IDS = Object.keys(WIDGETS) as IdWidget[]

export interface Layout { orden: IdWidget[]; ocultos: IdWidget[]; tam: Partial<Record<IdWidget, Tam>> }

export const LAYOUT_DEFECTO: Layout = { orden: [...IDS], ocultos: [], tam: {} }
const CLAVE = 'fa_inicio_layout_v1'

/** Completa y limpia un layout guardado (widgets nuevos al final, ids viejos afuera). */
export function normalizar(l: Partial<Layout> | null | undefined): Layout {
  const valido = (x: unknown): x is IdWidget => typeof x === 'string' && x in WIDGETS
  const orden = (l?.orden ?? []).filter(valido)
  for (const id of IDS) if (!orden.includes(id)) orden.push(id)
  const tam: Layout['tam'] = {}
  for (const [k, v] of Object.entries(l?.tam ?? {})) {
    if (valido(k) && (WIDGETS[k].tamanos as Tam[]).includes(v as Tam)) tam[k] = v as Tam
  }
  return { orden, ocultos: (l?.ocultos ?? []).filter(valido), tam }
}

export const tamDe = (l: Layout, id: IdWidget): Tam => l.tam[id] ?? WIDGETS[id].tam

export function leerLocal(): Layout | null {
  try { const t = localStorage.getItem(CLAVE); return t ? normalizar(JSON.parse(t)) : null } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leerCuenta(supabase: SupabaseClient<any, any, any>): Promise<Layout | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const l = user?.user_metadata?.inicio_layout
    return l ? normalizar(l) : null
  } catch { return null }
}

let espera: ReturnType<typeof setTimeout> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guardar(supabase: SupabaseClient<any, any, any>, l: Layout) {
  try { localStorage.setItem(CLAVE, JSON.stringify(l)) } catch { /* sin storage */ }
  if (espera) clearTimeout(espera)
  espera = setTimeout(() => { supabase.auth.updateUser({ data: { inicio_layout: l } }).catch(() => {}) }, 900)
}
