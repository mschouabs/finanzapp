export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando">
      <div className="fa-hero h-40 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="fa-card h-28 animate-pulse" />
        <div className="fa-card h-28 animate-pulse" />
      </div>
      <div className="fa-panel h-56 animate-pulse" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
