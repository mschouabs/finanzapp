'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import AuthShell from '@/components/ui/AuthShell'
import OAuthButtons from '@/components/ui/OAuthButtons'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } }
    })

    if (error) {
      setError(error.message === 'User already registered'
        ? 'Ya existe una cuenta con ese email'
        : 'Error al registrarse. Intentá de nuevo.'
      )
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <AuthShell titulo="Revisá tu email." bajada="Un último paso para activar tu cuenta">
        <div>
            <h2 className="mb-2 text-xl font-semibold text-primary">Te enviamos un link</h2>
            <p className="text-secondary">
              Te enviamos un link de confirmación a <strong>{email}</strong>.
              Hacé click en el link para activar tu cuenta.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-info hover:underline font-medium"
            >
              Volver al login
            </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Empezá a ordenar tu plata." bajada="Creá tu cuenta gratis">
        <>
          <h2 className="mb-6 text-xl font-semibold text-primary">Registrarse</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium text-secondary mb-1">Nombre</label>
              <input
                id="nombre"
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                className="w-full rounded-xl bg-alternate px-4 py-3 text-primary placeholder-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-confirm"
                placeholder="Tu nombre"
              />
            </div>

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
                placeholder="Mínimo 6 caracteres"
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
              {loading ? 'Registrando...' : 'Crear cuenta'}
            </button>
          </form>

          <OAuthButtons />

          <p className="text-center text-sm text-secondary mt-6">
            ¿Ya tenés cuenta?{' '}
            <Link href="/login" className="text-info hover:underline font-medium">
              Inicià sesión
            </Link>
          </p>
        </>
    </AuthShell>
  )
}
