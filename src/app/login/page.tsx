'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
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
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/logo-f.png"
            alt=""
            width={296}
            height={353}
            priority
            className="mx-auto mb-3 h-14 w-auto"
          />
          <h1 className="text-3xl font-bold text-primary">FinanzApp</h1>
          <p className="text-secondary mt-1">Controlá tus finanzas personales</p>
        </div>

        <div className="bg-card rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-primary mb-6">Iniciar sesión</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-card border border-line rounded-xl px-4 py-3 text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-confirm"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-card border border-line rounded-xl px-4 py-3 text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-confirm"
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
              className="w-full bg-confirm hover:bg-confirm-hover disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
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
        </div>
      </div>
    </div>
  )
}
