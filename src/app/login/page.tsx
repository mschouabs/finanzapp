'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import AuthShell from '@/components/ui/AuthShell'
import OAuthButtons from '@/components/ui/OAuthButtons'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <AuthShell titulo="Tu plata, en orden." bajada="Controlá tus finanzas personales">
        <>
          <h2 className="mb-6 text-xl font-semibold text-primary">Iniciar sesión</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-secondary mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full rounded-xl bg-alternate px-4 py-3 text-primary placeholder-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-confirm"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-secondary mb-1">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full rounded-xl bg-alternate px-4 py-3 text-primary placeholder-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-confirm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-alternate text-negative text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="fa-press w-full rounded-full bg-confirm py-3 font-semibold text-white transition-colors hover:bg-confirm-hover disabled:opacity-50"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <OAuthButtons />

          <p className="text-center text-sm text-secondary mt-6">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="text-info hover:underline font-medium">
              Registrate
            </Link>
          </p>
        </>
    </AuthShell>
  )
}
