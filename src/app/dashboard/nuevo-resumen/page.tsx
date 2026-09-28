import { redirect } from 'next/navigation'

/* El nuevo Resumen ya es el principal: esta ruta queda por los enlaces viejos. */
export default function NuevoResumenRedirect() {
  redirect('/dashboard')
}
