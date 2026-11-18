'use client'
/* Programa los avisos cada vez que se abre la app o cambian los datos.
   No dibuja nada. */
import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAlCambiarDatos } from '@/lib/eventos'
import { snapshotCompartido } from '@/lib/finanzas/compartido'
import { categorias, claveMes, compromisos } from '@/lib/finanzas/nucleo'
import { getCat } from '@/lib/categorias'
import { leerPresupuestosCuenta, leerPresupuestosLocal } from '@/lib/presupuestos'
import { avisosPresupuesto, planificar, type Aviso } from '@/lib/notificaciones/plan'
import { leerAvisados, leerDeCuenta, leerPrefsLocal, leerRecordatoriosLocal, marcarAvisados } from '@/lib/notificaciones/almacen'
import { alTocar, esAppNativa, estadoPermiso, mostrarYa, programar } from '@/lib/notificaciones/canal'

export const EVENTO_AVISOS = 'finanzapp:avisos-cambiaron'
export const reprogramarAvisos = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_AVISOS)) }

const fmt = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')

export function Notificador() {
  const router = useRouter()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const cuentaLeida = useRef(false)

  const correr = useCallback(async () => {
    try {
      const supabase = createClient()
      if (!cuentaLeida.current) { cuentaLeida.current = true; await leerDeCuenta(supabase); await leerPresupuestosCuenta(supabase) }
      const prefs = leerPrefsLocal()
      const s = await snapshotCompartido()
      const hoy = new Date()

      const vencimientos = compromisos(s, 40).items
        .filter(i => i.fecha && !i.vencido)
        .map(i => ({ id: i.id, titulo: i.titulo, monto: i.monto, fecha: i.fecha as Date, href: i.href }))
      const plan = planificar({ hoy, vencimientos, recordatorios: leerRecordatoriosLocal(), prefs, fmt })

      const permiso = await estadoPermiso()
      if (esAppNativa()) await programar(plan)
      else {
        /* en el navegador solo se puede avisar con la app abierta: lo que cae en las próximas horas */
        timers.current.forEach(clearTimeout); timers.current = []
        if (permiso === 'concedido') {
          for (const a of plan) {
            const ms = a.cuando.getTime() - Date.now()
            if (ms > 0 && ms < 12 * 3600_000) timers.current.push(setTimeout(() => mostrarYa(a, prefs.sonido), ms))
          }
        }
      }

      if (prefs.presupuesto) {
        const topes = leerPresupuestosLocal()
        if (Object.keys(topes).length) {
          const mes = claveMes(hoy)
          const gastado = Object.fromEntries(categorias(s, mes).map(c => [c.clave, c.monto]))
          const nuevos: Aviso[] = avisosPresupuesto({ gastado, topes, mes, avisados: leerAvisados(), nombre: c => (c === 'viajes' ? 'Viajes' : getCat(c).label), fmt, ahora: hoy })
          if (nuevos.length) {
            marcarAvisados(nuevos.map(a => a.clave))
            for (const a of nuevos) await mostrarYa(a, prefs.sonido)
          }
        }
      }
    } catch { /* sin datos: se reintenta en el próximo cambio */ }
  }, [])

  useEffect(() => {
    correr()
    const h = () => correr()
    window.addEventListener(EVENTO_AVISOS, h)
    const quitar = alTocar(href => router.push(href))
    return () => { window.removeEventListener(EVENTO_AVISOS, h); quitar(); timers.current.forEach(clearTimeout) }
  }, [correr, router])
  useAlCambiarDatos(correr)

  return null
}
