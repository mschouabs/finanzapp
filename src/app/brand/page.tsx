'use client'

/* ── /brand: tablero de marca ────────────────────────────────────────
   Logo (tres propuestas, en positivo, negativo, rosa y mono, y a 16 px),
   Luca en todos sus estados, colores, tipografía, íconos y componentes.
   Todo sale de los mismos tokens que usa la app.                      */

import { Isotipo, Logotipo, VARIANTES, type VarianteLogo } from '@/components/marca/Logo'
import { LucaAvatar, type LucaEstado } from '@/components/luca/LucaAvatar'
import { ThemeSelector } from '@/components/ThemeSelector'
import { Icono } from '@/components/ui/Icono'
import { Sparkline, Widget } from '@/components/widgets/Widget'
import { CATEGORIAS } from '@/lib/categorias'
import { Check } from 'lucide-react'

const PLACAS = [
  { nombre: 'Positivo', placa: '#0E0E10', tinta: '#F5F5F7', acento: '#6FD3A6', fondo: '#1A1A1D' },
  { nombre: 'Negativo', placa: '#F5F5F7', tinta: '#0E0E10', acento: '#2F7A5E', fondo: '#FFFFFF' },
  { nombre: 'Rosa', placa: '#EFC6D3', tinta: '#2B1A22', acento: '#B04A70', fondo: '#FAF5F2' },
]
const ESTADOS: LucaEstado[] = ['idle', 'listening', 'thinking', 'insight', 'saving', 'success', 'celebration', 'warning', 'sad']
const NOMBRE_ESTADO: Record<LucaEstado, string> = {
  idle: 'En reposo', listening: 'Escuchando', thinking: 'Pensando', insight: 'Tiene un dato', saving: 'Guardando',
  success: 'Listo', celebration: 'Festeja', warning: 'Atención', sad: 'No pudo',
}
const TOKENS = [
  ['Fondo', '--bg-page'], ['Superficie', '--bg-card'], ['Relleno', '--bg-alternate'], ['Línea', '--border-color'],
  ['Texto', '--text-primary'], ['Texto secundario', '--text-secondary'], ['Texto tenue', '--text-muted'],
  ['Acción', '--accent-confirm'], ['Suma', '--accent-positive'], ['Resta', '--accent-negative'],
  ['Información', '--accent-secondary'], ['Aviso', '--accent-warning'], ['Suave', '--accent-soft'],
]
const ESCALA = [['Display', 40, 600], ['Título 1', 32, 600], ['Título 2', 24, 600], ['Título 3', 20, 600], ['Destacado', 17, 500], ['Texto', 15, 400], ['Secundario', 13, 400], ['Etiqueta', 12, 500]] as const
const ICONOS = ['🛒', '🍕', '🚗', '💊', '🎬', '👕', '✂', '📋', '💻', '🎁', '💡', '📦', '✈', '🏠', '💳', '💼', '📊', '🎯', '🔁', '📌', '🧾', '🔍', '📈', '🔒']

function Bloque({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-primary">{titulo}</h2>
        {sub && <p className="mt-1 max-w-2xl text-sm text-secondary">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Placa({ v, p, mono = false }: { v: VarianteLogo; p: typeof PLACAS[number]; mono?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-control p-5" style={{ background: p.fondo }}>
      <div style={{ color: p.placa, ['--logo-tinta' as string]: p.tinta, ['--logo-acento' as string]: p.acento }} className="flex items-end gap-3">
        <Isotipo variante={v} size={64} mono={mono} />
        <Isotipo variante={v} size={32} mono={mono} />
        <Isotipo variante={v} size={16} mono={mono} />
      </div>
      <span className="text-xs" style={{ color: p.tinta === '#0E0E10' || p.tinta === '#2B1A22' ? '#6B5560' : '#A1A1AA' }}>{p.nombre}</span>
    </div>
  )
}

export default function BrandPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-secondary">Sistema "Objeto"</p>
          <h1 className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.035em] text-primary">Marca</h1>
        </div>
        <ThemeSelector />
      </header>

      <Bloque titulo="Logo · tres propuestas" sub="Isotipos abstractos, sin letras: funcionan con cualquier nombre. Grilla de 64, un solo acento. Cada uno en positivo, negativo, rosa y monocromático, y a 64, 32 y 16 px.">
        <div className="space-y-6">
          {VARIANTES.map(v => (
            <div key={v.id} className="fa-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-primary">{v.nombre}</h3>
                  <p className="mt-1 max-w-xl text-sm text-secondary">{v.idea}</p>
                </div>
                <span style={{ ['--logo-tinta' as string]: 'var(--bg-page)', ['--logo-acento' as string]: 'var(--accent-positive)' }} className="text-primary">
                  <Logotipo variante={v.id} nombre="Nombre" size={36} />
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {PLACAS.map(p => <Placa key={p.nombre} v={v.id} p={p} />)}
                <div className="flex flex-col items-center gap-3 rounded-control bg-alternate p-5">
                  <div className="flex items-end gap-3 text-primary">
                    <Isotipo variante={v.id} size={64} mono fondo={false} />
                    <Isotipo variante={v.id} size={32} mono fondo={false} />
                    <Isotipo variante={v.id} size={16} mono fondo={false} />
                  </div>
                  <span className="text-xs text-secondary">Monocromático</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Luca" sub="La misma placa redondeada del logo, con una pantalla. Los estados cambian solo los ojos, la boca y el punto de la antena.">
        <div className="fa-card grid grid-cols-3 gap-6 p-6 sm:grid-cols-5 lg:grid-cols-9">
          {ESTADOS.map(e => (
            <div key={e} className="flex flex-col items-center gap-2 text-center">
              <LucaAvatar estado={e} size={56} />
              <span className="text-xs text-secondary">{NOMBRE_ESTADO[e]}</span>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Color" sub="Monocromía con un acento por tema. Verde menta y rojo solo cuando el dato suma o resta. Cambiá el tema arriba para ver la otra paleta.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {TOKENS.map(([n, v]) => (
            <div key={v} className="overflow-hidden rounded-control bg-card shadow-card">
              <div className="h-16" style={{ background: `var(${v})` }} />
              <div className="p-3"><p className="text-xs font-medium text-primary">{n}</p><p className="text-[11px] text-muted">{v}</p></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map(c => (
            <span key={c.key} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-primary" style={{ background: `color-mix(in srgb, ${c.color} 16%, transparent)` }}>
              <span style={{ color: c.color }}><Icono nombre={c.emoji} size={14} /></span>{c.label}
            </span>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Tipografía" sub="Geist en una sola familia: 600 para títulos, 400–500 para texto. Montos siempre con cifras tabulares, para que las columnas alineen.">
        <div className="fa-card divide-y p-6" style={{ ['--tw-divide-opacity' as string]: 1 }}>
          {ESCALA.map(([n, px, w]) => (
            <div key={n} className="flex items-baseline justify-between gap-4 py-3">
              <span style={{ fontSize: px, fontWeight: w, letterSpacing: px >= 24 ? '-0.03em' : px >= 17 ? '-0.01em' : 0 }} className="truncate text-primary">Tu plata, en orden</span>
              <span className="shrink-0 text-xs text-muted">{n} · {px} px · {w}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-[32px] font-semibold tracking-[-0.03em] tabular-nums text-primary">$1.022.100</span>
            <span className="text-xs text-muted">Monto · tabular</span>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Íconos" sub="Un solo set (Lucide), trazo 1.5 sobre grilla de 24 px.">
        <div className="fa-card grid grid-cols-6 gap-4 p-6 text-primary sm:grid-cols-12">
          {ICONOS.map(e => <div key={e} className="grid h-12 place-items-center rounded-control bg-alternate"><Icono nombre={e} size={22} /></div>)}
        </div>
      </Bloque>

      <Bloque titulo="Componentes" sub="Botones, estados, avisos y widgets: la misma forma en toda la app.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="fa-card space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <button className="fa-press h-11 rounded-control bg-confirm px-5 text-sm font-semibold">Confirmar</button>
              <button className="fa-press h-11 rounded-control bg-alternate px-5 text-sm font-medium text-primary">Cancelar</button>
              <button className="h-11 px-3 text-sm font-medium text-info">Ver todo</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['Pagado', 'var(--accent-positive)'], ['Pendiente', 'var(--accent-warning)'], ['Vencido', 'var(--accent-negative)'], ['Abierto', 'var(--accent-secondary)']].map(([t, c]) => (
                <span key={t} className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-control bg-alternate p-3 text-sm text-primary" style={{ boxShadow: 'var(--shadow-pop)' }}>
              <Check size={16} className="text-positive" /> Gasto registrado: Súper · $18.500
              <button className="ml-auto text-xs font-semibold text-info">Deshacer</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Widget titulo="Gasto del mes" href="#">
              <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-primary">$814.800</p>
              <div className="mt-3"><Sparkline valores={[420, 510, 470, 600, 585, 815]} /></div>
            </Widget>
            <Widget titulo="Próximo vencimiento" estado="cargando" />
            <Widget titulo="Metas" estado="vacio" vacio="Ponete un objetivo y seguí el avance." />
            <Widget titulo="Inversiones" estado="error" onReintentar={() => {}} />
          </div>
        </div>
      </Bloque>
    </main>
  )
}
