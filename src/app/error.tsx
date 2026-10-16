'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center" role="alert">
      <p className="fa-kicker">Algo salió mal</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary">No pudimos cargar esta pantalla</h1>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        Tus datos están a salvo. Probá de nuevo; si sigue fallando, volvé al inicio.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="fa-press rounded-lg bg-confirm px-5 py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
          Reintentar
        </button>
        <a href="/dashboard" className="fa-press rounded-lg px-5 py-2.5 text-sm font-medium text-secondary hover:text-primary">
          Ir al inicio
        </a>
      </div>
    </main>
  )
}
