import Image from 'next/image'

/**
 * Marco de login/registro: dos campos de color planos (marca a la izquierda,
 * formulario a la derecha). Sin tarjeta, sombra ni bordes: la separación es
 * un cambio de tono.
 */
export default function AuthShell({
  titulo,
  bajada,
  children,
}: {
  titulo: string
  bajada: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-page lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-card px-6 pb-10 pt-10 sm:px-10 lg:px-16 lg:py-16">
        <div className="flex items-center gap-3">
          <Image src="/logo-f.png" alt="" width={296} height={353} priority className="h-10 w-auto lg:h-12" />
          <span className="text-lg font-semibold tracking-tight text-primary">FinanzApp</span>
        </div>
        <div className="mt-12 lg:mt-0">
          <h1 className="max-w-[12ch] text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-primary sm:text-6xl lg:text-7xl">
            {titulo}
          </h1>
          <p className="mt-5 max-w-sm text-base text-secondary">{bajada}</p>
        </div>
      </section>
      <main className="flex items-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}
