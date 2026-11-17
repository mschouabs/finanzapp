/* Guarda un registro simple que propuso Luca (gasto, gasto fijo, ingreso,
   freelance o inversión). Lo usan el chat y el input único. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardarGastoVariable } from '@/lib/movimientos'
import { guardarIngresoFijo } from '@/lib/ingresos'
import { hoyISO } from '@/lib/fechas'

export type TablaRegistro = 'gasto_variable' | 'gasto_fijo' | 'ingreso_fijo' | 'ingreso_freelance' | 'inversion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Datos = Record<string, any>

/** Devuelve el error (si no se guardó) y un aviso (si se guardó con algo para avisar). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guardarRegistroSimple(supabase: SupabaseClient<any, any, any>, uid: string, tabla: TablaRegistro, datos: Datos): Promise<{ error: string | null; aviso: string | null }> {
  const msg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'No se pudo guardar.')

  if (tabla === 'gasto_variable') {
    /* si Luca detectó con qué app/tarjeta se pagó, el gasto queda asociado a ella */
    const r = await guardarGastoVariable(supabase, uid, {
      nombre: datos.nombre ?? 'Gasto', monto: Number(datos.monto), categoria: datos.categoria ?? 'varios',
      fecha: datos.fecha ?? hoyISO(), medio_pago: datos.medio_pago, forma_pago: datos.forma_pago,
      cuotas: datos.cuotas, moneda: datos.moneda === 'USD' ? 'USD' : 'ARS',
    })
    /* si SE GUARDÓ pero falló el descuento del saldo no es un error (reintentar lo duplicaría) */
    if (r.error && !r.guardado) return { error: r.error, aviso: null }
    return { error: null, aviso: r.error ?? r.avisoSaldoNegativo ?? null }
  }
  if (tabla === 'gasto_fijo') {
    const { error } = await supabase.from('gastos_fijos').insert({
      user_id: uid, nombre: datos.nombre, monto: datos.monto,
      categoria: datos.categoria ?? 'servicios', tipo: datos.tipo === 'suscripcion' ? 'suscripcion' : 'fijo', activo: true,
    })
    return { error: error ? msg(error) : null, aviso: null }
  }
  if (tabla === 'ingreso_fijo') {
    /* si ya hay un sueldo activo con ese nombre, se anota el cobro del mes (no se duplica) */
    const { data: existentes } = await supabase.from('ingresos_fijos').select('id')
      .eq('user_id', uid).eq('activo', true).ilike('nombre', datos.nombre ?? '')
    const { error } = existentes && existentes.length > 0
      ? await guardarIngresoFijo(supabase, { monto_cobrado: datos.monto }, existentes[0].id)
      : await guardarIngresoFijo(supabase, { user_id: uid, nombre: datos.nombre, monto: datos.monto, monto_cobrado: datos.monto, activo: true })
    return { error: error ? msg(error) : null, aviso: null }
  }
  if (tabla === 'ingreso_freelance') {
    const { error } = await supabase.from('ingresos_freelance').insert({
      user_id: uid, cliente: datos.cliente, descripcion: datos.descripcion,
      monto_total: datos.monto_total, monto_cobrado: 0, fecha: datos.fecha,
    })
    return { error: error ? msg(error) : null, aviso: null }
  }
  if (tabla === 'inversion') {
    const { error } = await supabase.from('inversiones').insert({
      user_id: uid, nombre: datos.nombre, monto: datos.monto,
      tipo: datos.tipo ?? 'otro', moneda: datos.moneda ?? 'ARS',
      nivel_riesgo: datos.nivel_riesgo ?? 'conservador', app: 'Otro',
    })
    return { error: error ? msg(error) : null, aviso: null }
  }
  return { error: `Tipo de registro no soportado: ${tabla}`, aviso: null }
}
