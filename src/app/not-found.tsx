import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
      <p className="fa-kicker">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary">No encontramos esta página</h1>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        El enlace puede estar mal escrito o la página ya no existe.
      </p>
      <Link href="/dashboard" className="fa-press mt-6 rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
        Volver al inicio
      </Link>
    </main>
  )
}
