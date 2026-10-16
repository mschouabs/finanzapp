import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Metadata } from 'next'
import { DEMO } from '@/lib/demo'
import Landing from '@/components/landing/Landing'

export const metadata: Metadata = {
  title: 'FinanzApp · Toda tu plata, en un solo lugar',
  description: 'Billeteras, tarjetas, cuotas, viajes y metas, con lo que de verdad te queda libre para gastar. Y Luca, que registra tus gastos y te responde con tus números.',
}

export default async function Home() {
  // En modo demo entramos directo al dashboard. Ver src/lib/demo.ts
  if (DEMO) redirect('/dashboard')

  // Dentro de la app de Android (WebView) no se muestra la presentación.
  const ua = (await headers()).get('user-agent') ?? ''
  if (/; wv\)/.test(ua)) redirect('/login')

  // Con sesión iniciada se va directo al resumen.
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return <Landing />
}
