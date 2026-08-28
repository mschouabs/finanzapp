import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Sidebar from '@/components/ui/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  if (!user) {
    redirect('/login')
  }

  const userName = user.user_metadata?.nombre || user.email?.split('@')[0] || ''

  return (
    <div className="min-h-screen bg-page">
      <Sidebar userName={userName} />
      {/* el margen deja lugar a la sidebar fija; en mobile no hay sidebar */}
      <main className="lg:ml-64">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
          {children}
        </div>
      </main>
    </div>
  )
}
