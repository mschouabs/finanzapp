import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import TopNav from '@/components/ui/TopNav'
import { ThemeSelector } from '@/components/ThemeSelector'
import { LucaWidget } from '@/components/LucaWidget'

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
    <div className="min-h-screen bg-slate-50">
      <TopNav userName={userName} />
      {/* Theme selector - fixed top right */}
      <div style={{ position: 'fixed', top: 14, right: 16, zIndex: 100 }}>
        <ThemeSelector />
      </div>
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
      {/* Luca - floating AI expense recorder */}
      <LucaWidget />
    </div>
  )
}
