import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Sidebar from '@/components/ui/Sidebar'
import { Header } from '@/components/ui/Header'
import { Experiencia } from '@/components/ui/Experiencia'
import { DEMO, USUARIO_DEMO } from '@/lib/demo'

async function obtenerUsuario() {
  // En modo demo saltamos la verificación de sesión. Ver src/lib/demo.ts
  if (DEMO) return USUARIO_DEMO

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await obtenerUsuario()

  if (!user) {
    redirect('/login')
  }

  const userName = user.user_metadata?.nombre || user.email?.split('@')[0] || ''

  return (
    <div className="min-h-dvh bg-page">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-confirm focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>
      <Sidebar userName={userName} />
      {/* lg:ml-64 deja lugar a la sidebar fija en desktop */}
      <main id="contenido" className="lg:ml-64">
        <Header />
        <Experiencia />
        <div className="fa-container px-4 pt-4 sm:pt-6 sm:px-6 lg:px-10 pb-bottom-nav">
          {children}
        </div>
      </main>
    </div>
  )
}
