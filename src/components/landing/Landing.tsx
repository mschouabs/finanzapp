'use client'

/* Página pública de FinanzApp (para quien todavía no tiene sesión).
   Todo lo que se ve son piezas reales de la interfaz con montos de ejemplo,
   marcados como tales. No hay métricas, clientes ni testimonios inventados. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Check, CreditCard, Eye, EyeOff, Plane, Smartphone, Target } from 'lucide-react'
import { useTheme } from '@/components/ThemeProvider'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/* ── movimiento: aparece al entrar en pantalla (una vez) ── */
function Aparecer({ children, demora = 0, className = '' }: { children: ReactNode; demora?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visto, setVisto] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); io.disconnect() } }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`fl-aparecer ${className}`} data-visto={visto} style={{ transitionDelay: `${demora}ms` }}>
      {children}
    </div>
  )
}

/* ── progreso de scroll de un elemento (0 al entrar, 1 al centro) ── */
function useProgreso<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [p, setP] = useState(1)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const medir = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      setP(Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75))))
    }
    const alScroll = () => { if (!raf) raf = requestAnimationFrame(medir) }
    medir()
    window.addEventListener('scroll', alScroll, { passive: true })
    window.addEventListener('resize', alScroll)
    return () => { window.removeEventListener('scroll', alScroll); window.removeEventListener('resize', alScroll); cancelAnimationFrame(raf) }
  }, [])
  return [ref, p] as const
}

/* ── texto que se enciende palabra por palabra con el scroll ── */
function TextoQueSeEnciende({ texto }: { texto: string }) {
  const [ref, p] = useProgreso<HTMLParagraphElement>()
  const palabras = texto.split(' ')
  return (
    <p ref={ref} className="text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-[1.25] tracking-[-0.02em] text-primary">
      {palabras.map((w, i) => {
        const umbral = i / palabras.length
        const o = Math.min(1, Math.max(0.14, (p * 1.15 - umbral) * 6))
        return <span key={i} style={{ opacity: o, transition: 'opacity 120ms linear' }}>{w} </span>
      })}
    </p>
  )
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
      <nav aria-label="Principal" className="fl-isla flex w-full max-w-3xl items-center gap-2 rounded-full py-2 pl-4 pr-2">
        <Link href="/" className="flex items-center gap-2" aria-label="FinanzApp, inicio">
          <Image src="/logo-f.png" alt="" width={296} height={353} className="h-6 w-auto" priority />
          <span className="text-[15px] font-semibold tracking-tight text-primary">FinanzApp</span>
        </Link>
        <div className="ml-4 hidden items-center gap-5 text-sm text-secondary md:flex">
          <a href="#funciones" className="transition-colors hover:text-primary">Funciones</a>
          <a href="#luca" className="transition-colors hover:text-primary">Luca</a>
          <a href="#app" className="transition-colors hover:text-primary">En el celular</a>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/login" className="rounded-full px-3.5 py-2 text-sm font-medium text-secondary transition-colors hover:text-primary">Ingresar</Link>
          <Link href="/register" className="fl-btn group whitespace-nowrap rounded-full py-2 pl-4 pr-4 text-sm font-semibold sm:pr-1.5">
            Crear cuenta
            <span className="fl-btn-ico ml-2 hidden h-7 w-7 items-center justify-center rounded-full sm:inline-flex"><ArrowUpRight size={15} /></span>
          </Link>
        </div>
      </nav>
    </header>
  )
}

/* Pieza real de la app: "Libre para usar" con montos de ejemplo */
function PiezaLibre({ oculto = false }: { oculto?: boolean }) {
  const m = (n: number) => (oculto ? '***' : fmt(n))
  return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-medium text-secondary">Libre para usar</p>
      <p className="mt-1 text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-none tracking-[-0.03em] text-primary tabular-nums">{m(1022100)}</p>
      <p className="mt-2 text-sm text-secondary">después de los pagos de los próximos 30 días</p>
      <div className="mt-6 space-y-4 text-sm">
        <div>
          <div className="flex justify-between"><span className="text-secondary">Disponible</span><span className="font-semibold tabular-nums text-primary">{m(1575600)}</span></div>
          <div className="mt-2 h-2 rounded-full" style={{ background: 'var(--accent-secondary)' }} />
        </div>
        <div>
          <div className="flex justify-between"><span className="text-secondary">− Comprometido · 30 días</span><span className="font-semibold tabular-nums text-primary">{oculto ? '***' : '−' + fmt(553500)}</span></div>
          <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-alternate)' }}>
            <span className="w-[10%]" style={{ background: 'var(--accent-negative)' }} />
            <span className="w-[18%]" style={{ background: 'var(--accent-warning)' }} />
            <span className="w-[7%]" style={{ background: 'color-mix(in srgb, var(--accent-warning) 60%, transparent)' }} />
          </div>
        </div>
        <div className="flex justify-between pt-1 text-base"><span className="font-semibold text-primary">= Libre</span><span className="font-semibold tabular-nums text-primary">{m(1022100)}</span></div>
      </div>
    </div>
  )
}

function Grafico() {
  return (
    <svg viewBox="0 0 400 120" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 100 C 60 92, 110 86, 170 74 S 260 52, 300 40 S 360 30, 400 58" fill="none" stroke="var(--accent-positive)" strokeWidth="3" strokeLinecap="round" />
      <path d="M0 100 C 60 92, 110 86, 170 74 S 260 52, 300 40 S 360 30, 400 58 L400 120 L0 120 Z" fill="color-mix(in srgb, var(--accent-positive) 12%, transparent)" />
    </svg>
  )
}

function Hero() {
  const [ref, p] = useProgreso<HTMLDivElement>()
  const escala = 0.9 + 0.1 * p
  return (
    <section className="relative px-4 pb-10 pt-32 md:pb-16 md:pt-44">
      <div className="mx-auto max-w-6xl text-center">
        <Aparecer>
          <h1 className="mx-auto max-w-5xl text-balance text-[clamp(2.6rem,6.2vw,5.5rem)] font-semibold leading-[1.0] tracking-[-0.035em] text-primary">
            Toda tu plata,
            <span className="fl-pastilla mx-3 inline-flex h-[0.78em] w-[1.9em] translate-y-[-0.06em] items-end overflow-hidden rounded-full align-middle" aria-hidden="true"><Grafico /></span>
            en un solo lugar.
          </h1>
        </Aparecer>
        <Aparecer demora={90}>
          <p className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-secondary md:text-xl">
            Billeteras, tarjetas, cuotas, viajes y metas, con lo que de verdad te queda libre para gastar. Y Luca, que registra tus gastos y te responde con tus números.
          </p>
        </Aparecer>
        <Aparecer demora={180}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="fl-btn group w-full rounded-full py-3 pl-6 pr-2 text-base font-semibold sm:w-auto">
              Crear cuenta gratis
              <span className="fl-btn-ico ml-3 inline-flex h-9 w-9 items-center justify-center rounded-full"><ArrowUpRight size={18} /></span>
            </Link>
            <Link href="/login" className="fl-btn-sec w-full rounded-full px-6 py-3.5 text-base font-semibold sm:w-auto">Ya tengo cuenta</Link>
          </div>
        </Aparecer>
      </div>

      {/* vista previa: piezas reales de la app con datos de ejemplo */}
      <div ref={ref} className="mx-auto mt-16 max-w-5xl md:mt-24" style={{ transform: `scale(${escala})`, transformOrigin: '50% 0%' }}>
        <div className="fl-marco rounded-[2rem] p-2">
          <div className="grid gap-px overflow-hidden rounded-[calc(2rem-0.5rem)] md:grid-cols-12" style={{ background: 'var(--border-subtle)' }}>
            <div className="p-6 md:col-span-7 md:p-9" style={{ background: 'var(--bg-card)' }}>
              <p className="text-[13px] font-medium text-secondary">Patrimonio neto</p>
              <p className="mt-1 text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-none tracking-[-0.03em] text-primary tabular-nums">{fmt(4616800)}</p>
              <div className="mt-6 h-28 md:h-36"><Grafico /></div>
              <div className="mt-5 flex h-2.5 overflow-hidden rounded-full">
                <span className="w-[28%]" style={{ background: 'var(--accent-secondary)' }} />
                <span className="w-[54%]" style={{ background: 'var(--accent-violet)' }} />
                <span className="w-[18%]" style={{ background: 'var(--accent-negative)' }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-secondary">
                <span>Disponible</span><span>Invertido</span><span>Deuda en tarjetas</span>
              </div>
            </div>
            <div className="p-6 md:col-span-5 md:p-9" style={{ background: 'var(--bg-card)' }}>
              <PiezaLibre />
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted">Montos de ejemplo.</p>
      </div>
    </section>
  )
}

function Bento() {
  const [oculto, setOculto] = useState(false)
  const { theme, toggleTheme } = useTheme()
  return (
    <section id="funciones" className="scroll-mt-24 px-4 py-28 md:py-40">
      <div className="mx-auto max-w-6xl">
        <Aparecer>
          <h2 className="max-w-3xl text-balance text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-primary">
            Lo que importa, sin hojas de cálculo.
          </h2>
        </Aparecer>

        <div className="mt-14 grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
          {/* A: 4x2 */}
          <Aparecer className="md:col-span-4 md:row-span-2">
            <article className="fl-celda group h-full rounded-[1.75rem] p-7 md:p-10">
              <h3 className="text-xl font-semibold tracking-tight text-primary">Sabés cuánto podés gastar de verdad</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-secondary">Lo que tenés, menos lo que ya está comprometido en tarjetas, cuotas y gastos fijos del próximo mes.</p>
              <div className="mt-8 rounded-[1.25rem] p-6 transition-transform duration-700 ease-out group-hover:scale-[1.02]" style={{ background: 'var(--bg-alternate)' }}>
                <PiezaLibre oculto={oculto} />
              </div>
            </article>
          </Aparecer>

          {/* B: 2x1 */}
          <Aparecer className="md:col-span-2" demora={80}>
            <article className="fl-celda h-full rounded-[1.75rem] p-7">
              <CreditCard size={22} className="text-primary" />
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-primary">Tarjetas y cuotas</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">Cada resumen con su cierre y vencimiento, y las cuotas que vienen.</p>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-alternate)' }}><span className="text-secondary">Visa · vence 10/11</span><span className="font-semibold tabular-nums text-primary">{oculto ? '***' : fmt(150000)}</span></div>
                <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-alternate)' }}><span className="text-secondary">Cuota 3 de 6</span><span className="font-semibold tabular-nums text-primary">{oculto ? '***' : fmt(48300)}</span></div>
              </div>
            </article>
          </Aparecer>

          {/* C: 2x1 — se prueba acá mismo */}
          <Aparecer className="md:col-span-2" demora={140}>
            <article className="fl-celda h-full rounded-[1.75rem] p-7">
              <button onClick={() => setOculto(v => !v)} aria-pressed={oculto}
                className="fl-btn-sec inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold">
                {oculto ? <EyeOff size={18} /> : <Eye size={18} />} {oculto ? 'Mostrar montos' : 'Ocultar montos'}
              </button>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-primary">Modo privado</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">Un toque y cada monto pasa a <span className="font-semibold text-primary">***</span>, sin pistas de cuántos dígitos tiene. Probalo: cambia esta página.</p>
            </article>
          </Aparecer>

          {/* D: 3x1 */}
          <Aparecer className="md:col-span-3">
            <article className="fl-celda h-full rounded-[1.75rem] p-7">
              <div className="flex gap-2 text-primary"><Plane size={22} /><Target size={22} /></div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-primary">Viajes y metas</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">Presupuesto por viaje, gastos en cualquier moneda pasados a pesos, y cuánto te falta para cada meta.</p>
              <div className="mt-5">
                <div className="flex justify-between text-sm"><span className="text-secondary">Fondo de emergencia</span><span className="font-semibold tabular-nums text-primary">88%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-alternate)' }}>
                  <div className="h-full w-[88%] rounded-full" style={{ background: 'var(--accent-positive)' }} />
                </div>
              </div>
            </article>
          </Aparecer>

          {/* E: 3x1 — cambia el tema de verdad */}
          <Aparecer className="md:col-span-3" demora={80}>
            <article className="fl-celda h-full rounded-[1.75rem] p-7">
              <div className="flex gap-2">
                {(['dark', 'rosa'] as const).map(t => (
                  <button key={t} onClick={() => theme !== t && toggleTheme()} aria-pressed={theme === t}
                    aria-label={t === 'dark' ? 'Tema oscuro' : 'Tema rosa'}
                    className="flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors"
                    style={{ background: theme === t ? 'var(--bg-alternate)' : 'transparent', color: 'var(--text-primary)', boxShadow: theme === t ? 'inset 0 0 0 1px var(--border-color)' : 'none' }}>
                    <span className="h-4 w-4 rounded-full" style={{ background: t === 'dark' ? '#0D1117' : '#D61F6E', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' }} />
                    {t === 'dark' ? 'Oscuro' : 'Rosa'}
                  </button>
                ))}
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-primary">Dos temas</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">Oscuro o rosa, con contraste cuidado en los dos. Tocá uno y mirá cómo cambia todo.</p>
            </article>
          </Aparecer>
        </div>
        <p className="mt-4 text-xs text-muted">Montos de ejemplo.</p>
      </div>
    </section>
  )
}

function Burbuja({ quien, children }: { quien: 'yo' | 'luca'; children: ReactNode }) {
  return (
    <div className={`flex ${quien === 'yo' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-[1.25rem] px-4 py-3 text-[15px] leading-relaxed ${quien === 'yo' ? 'fl-burbuja-yo' : 'fl-burbuja-luca'}`}>
        {children}
      </div>
    </div>
  )
}

function SeccionLuca() {
  return (
    <section id="luca" className="scroll-mt-24 px-4 py-28 md:py-40" style={{ background: 'color-mix(in srgb, var(--bg-card) 55%, var(--bg-page))' }}>
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-32">
            <Image src="/logo-f.png" alt="" width={296} height={353} className="h-10 w-auto" />
            <h2 className="mt-6 text-balance text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-primary">
              Luca entiende cómo hablás.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-secondary">Escribile como le escribirías a alguien. Lee toda tu app para responderte, y nada se guarda sin que lo confirmes.</p>
          </div>
        </div>
        <div className="space-y-16 lg:col-span-7">
          <TextoQueSeEnciende texto="Contale “gasté 18.500 en el súper con Mercado Pago” y lo registra en la cuenta correcta. Preguntale cuánto gastaste en viajes, si te alcanza para algo o por qué un saldo no cuadra: busca la causa y te propone cómo arreglarlo." />
          <Aparecer>
            <div className="fl-marco rounded-[2rem] p-2">
              <div className="space-y-3 rounded-[calc(2rem-0.5rem)] p-5 md:p-7" style={{ background: 'var(--bg-card)' }}>
                <Burbuja quien="yo">gasté 18.500 en el súper con mercado pago</Burbuja>
                <Burbuja quien="luca">
                  <span className="block text-secondary">Te dejo esto para confirmar:</span>
                  <span className="mt-2 flex items-center justify-between gap-4 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-alternate)' }}>
                    <span><span className="block font-semibold text-primary">Súper</span><span className="text-xs text-secondary">Mercado Pago · débito · hoy</span></span>
                    <span className="font-semibold tabular-nums text-primary">{fmt(18500)}</span>
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold fl-btn"><Check size={14} /> Confirmar</span>
                </Burbuja>
                <Burbuja quien="yo">¿cuánto llevo gastado en viajes este año?</Burbuja>
                <Burbuja quien="luca">Llevás <b className="text-primary">{fmt(1595500)}</b> en 2 viajes. En el que estás ahora vas {fmt(301000)} debajo del presupuesto.</Burbuja>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Conversación de ejemplo.</p>
          </Aparecer>
        </div>
      </div>
    </section>
  )
}

const SECCIONES = ['Billeteras', 'Tarjetas y cuotas', 'Gastos fijos', 'Suscripciones', 'Me deben', 'Viajes', 'Metas', 'Inversiones', 'Historial', 'Importar', 'Modo privado', 'Luca']

function Cinta() {
  const fila = [...SECCIONES, ...SECCIONES]
  return (
    <div className="overflow-hidden py-8 md:py-12" aria-label="Secciones de la app">
      <div className="fl-cinta flex w-max gap-10 whitespace-nowrap text-[clamp(1.75rem,3.4vw,3rem)] font-semibold tracking-[-0.03em]">
        {fila.map((s, i) => (
          <span key={i} aria-hidden={i >= SECCIONES.length} className={i % 2 ? 'text-muted' : 'text-primary'}>{s}</span>
        ))}
      </div>
    </div>
  )
}

function EnElCelular() {
  return (
    <section id="app" className="scroll-mt-24 px-4 py-28 md:py-40">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Aparecer>
          <Smartphone size={28} className="text-primary" />
          <h2 className="mt-5 text-balance text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-primary">Llevala en el celular.</h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-secondary">Abrí FinanzApp desde el navegador del celu e instalala: queda con su ícono, a pantalla completa, sin pasar por ninguna tienda.</p>
        </Aparecer>
        <Aparecer demora={100}>
          <ol className="space-y-3">
            {[
              ['Android', 'Tocá “Instalar app” cuando te lo ofrezca, o el menú ⋮ → Instalar app.'],
              ['iPhone', 'En Safari, Compartir → Agregar a inicio.'],
              ['Computadora', 'Funciona en cualquier navegador, sin instalar nada.'],
            ].map(([t, d]) => (
              <li key={t} className="fl-celda rounded-[1.5rem] p-6">
                <p className="font-semibold text-primary">{t}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-secondary">{d}</p>
              </li>
            ))}
          </ol>
        </Aparecer>
      </div>
    </section>
  )
}

function Cierre() {
  return (
    <section className="px-4 pb-10 pt-20 md:pt-28">
      <div className="fl-cierre mx-auto max-w-6xl rounded-[2.25rem] px-6 py-20 text-center md:py-28">
        <h2 className="mx-auto max-w-4xl text-balance text-[clamp(2.4rem,6vw,5rem)] font-semibold leading-[1.0] tracking-[-0.035em] text-primary">Empezá a ordenar tu plata.</h2>
        <p className="mx-auto mt-5 max-w-md text-lg text-secondary">Creá tu cuenta gratis y cargá tus billeteras en un par de minutos.</p>
        <Link href="/register" className="fl-btn group mt-10 inline-flex rounded-full py-3.5 pl-7 pr-2 text-lg font-semibold">
          Crear cuenta gratis
          <span className="fl-btn-ico ml-3 inline-flex h-10 w-10 items-center justify-center rounded-full"><ArrowUpRight size={20} /></span>
        </Link>
      </div>
      <footer className="mx-auto mt-16 max-w-6xl">
        <p className="select-none pb-[0.12em] text-[clamp(3.5rem,15vw,12rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-primary" aria-hidden="true">FinanzApp</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] text-sm text-secondary">
          <Link href="/login" className="hover:text-primary">Ingresar</Link>
          <Link href="/register" className="hover:text-primary">Crear cuenta</Link>
          <span className="ml-auto text-muted">© {new Date().getFullYear()} FinanzApp</span>
        </div>
      </footer>
    </section>
  )
}

export default function Landing() {
  return (
    <main className="fl-pagina w-full max-w-full overflow-x-clip">
      <Nav />
      <Hero />
      <Cinta />
      <Bento />
      <SeccionLuca />
      <EnElCelular />
      <Cierre />
    </main>
  )
}
