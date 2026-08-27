'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
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
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-card rounded-2xl shadow-lg p-8">
            <div className="text-5xl mb-4">✉️</div>
            <h2 className="text-xl font-semibold text-primary mb-2">¡Revisá tu email!</h2>
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">💰</div>
          <h1 className="text-3xl font-bold text-primary">FinanzApp</h1>
          <p className="text-secondary mt-1">Creá tu cuenta gratis</p>
        </div>

        <div className="bg-card rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-primary mb-6">Registrarse</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                className="w-full bg-card border border-line rounded-xl px-4 py-3 text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-confirm"
                placeholder="Tu nombre"
              />
            </div>

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
              className="w-full bg-confirm hover:bg-confirm-hover disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
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
        </div>
      </div>
    </div>
  )
}
