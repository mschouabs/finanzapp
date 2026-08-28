'use client'

import { useState, useRef, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import type { LucaEstado } from '@/components/luca/LucaAvatar'

type TipoRegistro = 'gasto_variable' | 'gasto_fijo' | 'ingreso_fijo' | 'ingreso_freelance' | 'inversion'

interface DatosRegistro {
  nombre?: string
  monto?: number
  monto_total?: number
  categoria?: string
  fecha?: string
  es_gasto_hormiga?: boolean
  activo?: boolean
  cliente?: string
  descripcion?: string
  tipo?: string
  moneda?: string
  nivel_riesgo?: string
}

interface Mensaje {
  id: string
  rol: 'user' | 'luca'
  texto: string
  timestamp: number
  tabla?: TipoRegistro
  datos?: DatosRegistro
  guardado?: boolean
}

const STORAGE_KEY = 'luca_chat_historial'
const TIPO_LABELS: Record<TipoRegistro, string> = {
  gasto_variable: '💸 Gasto detectado',
  gasto_fijo: '📋 Gasto fijo detectado',
  ingreso_fijo: '💰 Ingreso fijo detectado',
  ingreso_freelance: '🤝 Ingreso freelance detectado',
  inversion: '📈 Inversión detectada',
}

function getId() {
  return Math.random().toString(36).slice(2)
}

export default function LucaChatPage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lucaEstado, setLucaEstado] = useState<LucaEstado>('idle')
  const [guardando, setGuardando] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setMensajes(JSON.parse(saved).slice(-50))
      } else {
        setMensajes([{
          id: getId(),
          rol: 'luca',
          texto: '¡Hola! Soy Luca 👋 Contame tus gastos, ingresos o inversiones y las registro por vos. Aclaración importante: no doy recomendaciones financieras, solo registro tus movimientos.',
          timestamp: Date.now(),
        }])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!mensajes.length) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mensajes)) } catch { /* ignore */ }
  }, [mensajes])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, loading])

  const enviar = async () => {
    const texto = input.trim()
    if (!texto || loading) return

    const userMsg: Mensaje = { id: getId(), rol: 'user', texto, timestamp: Date.now() }
    setMensajes(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setLucaEstado('thinking')

    const historialAPI = [...mensajes, userMsg]
      .slice(-10)
      .map(m => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto }))

    try {
      const res = await fetch('/api/luca-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historialAPI }),
      })
      const data = await res.json()

      const TIPOS: TipoRegistro[] = ['gasto_variable', 'gasto_fijo', 'ingreso_fijo', 'ingreso_freelance', 'inversion']
      const esRegistro = TIPOS.includes(data.tipo)

      const lucaMsg: Mensaje = {
        id: getId(),
        rol: 'luca',
        texto: data.mensaje || 'No entendí bien, ¿podés repetirlo?',
        timestamp: Date.now(),
        tabla: esRegistro ? data.tipo : undefined,
        datos: esRegistro ? data.datos : undefined,
      }

      setMensajes(prev => [...prev, lucaMsg])
      setLucaEstado(esRegistro ? 'celebration' : 'idle')
    } catch {
      setMensajes(prev => [...prev, {
        id: getId(), rol: 'luca',
        texto: 'Ups, algo falló. Intentá de nuevo.',
        timestamp: Date.now(),
      }])
      setLucaEstado('sad')
    }

    setLoading(false)
    setTimeout(() => setLucaEstado('idle'), 3000)
    inputRef.current?.focus()
  }

  const guardarRegistro = async (msg: Mensaje) => {
    if (!msg.tabla || !msg.datos) return
    setGuardando(msg.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id
      let error

      if (msg.tabla === 'gasto_variable') {
        const { error: e } = await supabase.from('gastos_variables').insert({
          user_id: uid, nombre: msg.datos.nombre, monto: msg.datos.monto,
          categoria: msg.datos.categoria, fecha: msg.datos.fecha, es_gasto_hormiga: false,
        })
        error = e
      } else if (msg.tabla === 'gasto_fijo') {
        const { error: e } = await supabase.from('gastos_fijos').insert({
          user_id: uid, nombre: msg.datos.nombre, monto: msg.datos.monto,
          categoria: msg.datos.categoria ?? 'servicios', activo: true,
        })
        error = e
      } else if (msg.tabla === 'ingreso_fijo') {
        const { error: e } = await supabase.from('ingresos_fijos').insert({
          user_id: uid, nombre: msg.datos.nombre, monto: msg.datos.monto,
          monto_cobrado: 0, activo: true,
        })
        error = e
      } else if (msg.tabla === 'ingreso_freelance') {
        const { error: e } = await supabase.from('ingresos_freelance').insert({
          user_id: uid, cliente: msg.datos.cliente, descripcion: msg.datos.descripcion,
          monto_total: msg.datos.monto_total, monto_cobrado: 0, fecha: msg.datos.fecha,
        })
        error = e
      } else if (msg.tabla === 'inversion') {
        const { error: e } = await supabase.from('inversiones').insert({
          user_id: uid, nombre: msg.datos.nombre, monto: msg.datos.monto,
          tipo: msg.datos.tipo ?? 'otro', moneda: msg.datos.moneda ?? 'ARS',
          nivel_riesgo: msg.datos.nivel_riesgo ?? 'conservador', app: 'Otro',
        })
        error = e
      }

      if (error) throw error
      setMensajes(prev => prev.map(m => m.id === msg.id ? { ...m, guardado: true } : m))
      setLucaEstado('celebration')
      setTimeout(() => setLucaEstado('idle'), 2000)
    } catch { /* silencioso */ }
    setGuardando(null)
  }

  const limpiarHistorial = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setMensajes([{
      id: getId(), rol: 'luca',
      texto: '¡Historial limpio! Contame qué querés registrar.',
      timestamp: Date.now(),
    }])
  }

  const monto = (d: DatosRegistro) => d.monto ?? d.monto_total
  const montoStr = (d: DatosRegistro) =>
    `$${Number(monto(d)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

  return (
    <div className="fa-card flex flex-col" style={{ height: 'calc(100vh - 160px)', minHeight: 500 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b">
        <div className="relative shrink-0">
          <LucaAvatar estado={lucaEstado} size={48} />
          <span className="absolute bottom-0 right-0 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-extrabold text-primary leading-tight">Luca</p>
          <p className="text-xs text-confirm font-semibold">● Online · Solo registra, no recomienda</p>
        </div>
        <button onClick={limpiarHistorial} className="text-xs text-secondary hover:text-negative transition-colors">
          Limpiar
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {mensajes.map(msg => (
          <div key={msg.id} className={`flex ${msg.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] ${msg.rol === 'user' ? '' : 'flex gap-2'}`}>
              {msg.rol === 'luca' && (
                <div className="shrink-0 mt-1">
                  <LucaAvatar estado="idle" size={28} />
                </div>
              )}
              <div>
                <div className={`px-3 py-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.rol === 'user'
                    ? 'bg-confirm text-white rounded-tr-sm'
                    : 'bg-alternate text-primary rounded-tl-sm'
                }`}>
                  {msg.texto}
                </div>

                {/* Tarjeta de registro detectado */}
                {msg.tabla && msg.datos && !msg.guardado && (
                  <div className="mt-2 rounded-xl border bg-card p-3 text-xs space-y-1.5">
                    <p className="font-bold text-primary">{TIPO_LABELS[msg.tabla]}</p>

                    {msg.datos.nombre && <p className="text-secondary">{msg.datos.nombre}</p>}
                    {msg.datos.cliente && <p className="text-secondary">Cliente: {msg.datos.cliente}</p>}
                    {msg.datos.descripcion && <p className="text-secondary">{msg.datos.descripcion}</p>}

                    {monto(msg.datos) != null && (
                      <p className="font-semibold text-primary fa-amount text-sm">{montoStr(msg.datos)}</p>
                    )}

                    <p className="text-secondary capitalize">
                      {[msg.datos.categoria, msg.datos.tipo, msg.datos.moneda, msg.datos.nivel_riesgo, msg.datos.fecha]
                        .filter(Boolean).join(' · ')}
                    </p>

                    <button
                      onClick={() => guardarRegistro(msg)}
                      disabled={guardando === msg.id}
                      className="w-full mt-1 py-2 rounded-lg bg-confirm text-white font-semibold text-xs hover:bg-confirm-hover disabled:opacity-50 transition-colors"
                    >
                      {guardando === msg.id ? 'Guardando…' : '✓ Guardar'}
                    </button>
                  </div>
                )}

                {msg.guardado && (
                  <p className="mt-1 text-[10px] text-confirm font-semibold">✓ Guardado correctamente</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-2 items-center">
              <LucaAvatar estado="thinking" size={28} />
              <div className="bg-alternate rounded-2xl rounded-tl-sm px-4 py-2.5">
                <span className="flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder="Ej: gasté $5000 en el super, cobré $80000 de sueldo…"
          disabled={loading}
          className="flex-1 px-3 py-2.5 text-xs rounded-xl border bg-field text-primary disabled:opacity-60 focus:outline-none focus:border-confirm"
        />
        <button
          onClick={enviar}
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-confirm text-white text-xs font-semibold disabled:opacity-40 hover:bg-confirm-hover transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
