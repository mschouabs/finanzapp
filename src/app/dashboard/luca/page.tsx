'use client'

import { useState, useRef, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { LucaAvatar } from '@/components/luca/LucaAvatar'
import type { LucaEstado } from '@/components/luca/LucaAvatar'

interface Mensaje {
  id: string
  rol: 'user' | 'luca'
  texto: string
  timestamp: number
  gasto?: {
    nombre: string
    monto: number
    categoria: string
    fecha: string
  }
  gastoCargado?: boolean
}

const STORAGE_KEY = 'luca_chat_historial'

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

  // Cargar historial del localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Mensaje[]
        setMensajes(parsed.slice(-50)) // últimos 50
      } else {
        // Mensaje de bienvenida
        setMensajes([{
          id: getId(),
          rol: 'luca',
          texto: '¡Hola! Soy Luca 👋 Podés contarme tus gastos o preguntarme cualquier cosa sobre tus finanzas.',
          timestamp: Date.now(),
        }])
      }
    } catch { /* ignore */ }
  }, [])

  // Guardar historial
  useEffect(() => {
    if (mensajes.length === 0) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mensajes))
    } catch { /* ignore */ }
  }, [mensajes])

  // Scroll al fondo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, loading])

  const enviar = async () => {
    const texto = input.trim()
    if (!texto || loading) return

    const userMsg: Mensaje = {
      id: getId(),
      rol: 'user',
      texto,
      timestamp: Date.now(),
    }

    setMensajes(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setLucaEstado('thinking')

    // Construir historial para el API
    const historialAPI = [...mensajes, userMsg]
      .slice(-10) // últimos 10 mensajes
      .map(m => ({
        role: m.rol === 'user' ? 'user' : 'assistant',
        content: m.texto,
      }))

    try {
      const res = await fetch('/api/luca-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historialAPI }),
      })
      const data = await res.json()

      const lucaMsg: Mensaje = {
        id: getId(),
        rol: 'luca',
        texto: data.mensaje || 'No entendí bien, ¿podés repetirlo?',
        timestamp: Date.now(),
        gasto: data.tipo === 'gasto' ? data.gasto : undefined,
      }

      setMensajes(prev => [...prev, lucaMsg])
      setLucaEstado(data.tipo === 'gasto' ? 'celebration' : 'idle')
    } catch {
      setMensajes(prev => [...prev, {
        id: getId(),
        rol: 'luca',
        texto: 'Ups, algo falló. Intentá de nuevo.',
        timestamp: Date.now(),
      }])
      setLucaEstado('sad')
    }

    setLoading(false)
    setTimeout(() => setLucaEstado('idle'), 3000)
    inputRef.current?.focus()
  }

  const guardarGasto = async (msg: Mensaje) => {
    if (!msg.gasto) return
    setGuardando(msg.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('gastos_variables').insert({
        user_id: user?.id,
        nombre: msg.gasto.nombre,
        monto: msg.gasto.monto,
        categoria: msg.gasto.categoria,
        fecha: msg.gasto.fecha,
        es_gasto_hormiga: false,
      })
      if (error) throw error
      setMensajes(prev =>
        prev.map(m => m.id === msg.id ? { ...m, gastoCargado: true } : m)
      )
      setLucaEstado('celebration')
      setTimeout(() => setLucaEstado('idle'), 2000)
    } catch {
      // silencioso
    }
    setGuardando(null)
  }

  const limpiarHistorial = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setMensajes([{
      id: getId(),
      rol: 'luca',
      texto: '¡Historial limpio! ¿En qué te puedo ayudar?',
      timestamp: Date.now(),
    }])
  }

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
          <p className="text-xs text-confirm font-semibold">● Online</p>
        </div>
        <button
          onClick={limpiarHistorial}
          className="text-xs text-secondary hover:text-negative transition-colors"
        >
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
                <div
                  className={`px-3 py-2.5 rounded-2xl text-xs leading-relaxed ${
                    msg.rol === 'user'
                      ? 'bg-confirm text-white rounded-tr-sm'
                      : 'bg-alternate text-primary rounded-tl-sm'
                  }`}
                >
                  {msg.texto}
                </div>

                {/* Tarjeta de gasto detectado */}
                {msg.gasto && !msg.gastoCargado && (
                  <div className="mt-2 rounded-xl border bg-card p-3 text-xs space-y-1.5">
                    <p className="font-bold text-primary">💸 Gasto detectado</p>
                    <p className="text-secondary">{msg.gasto.nombre}</p>
                    <p className="font-semibold text-primary fa-amount text-sm">
                      ${Number(msg.gasto.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-secondary capitalize">{msg.gasto.categoria} · {msg.gasto.fecha}</p>
                    <button
                      onClick={() => guardarGasto(msg)}
                      disabled={guardando === msg.id}
                      className="w-full mt-1 py-2 rounded-lg bg-confirm text-white font-semibold text-xs hover:bg-confirm-hover disabled:opacity-50 transition-colors"
                    >
                      {guardando === msg.id ? 'Guardando…' : '✓ Guardar gasto'}
                    </button>
                  </div>
                )}

                {msg.gastoCargado && (
                  <p className="mt-1 text-[10px] text-confirm font-semibold">✓ Gasto guardado</p>
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
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
          placeholder="Escribile a Luca…"
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
