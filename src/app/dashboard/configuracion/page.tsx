'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  User, Bell, Palette, DollarSign, Shield, Download,
  LogOut, ChevronRight, Check, Moon, Sun, Monitor,
} from 'lucide-react'
import { ThemeSelector } from '@/components/ThemeSelector'

const MONEDAS = ['ARS', 'USD', 'EUR', 'BRL', 'UYU']

export default function ConfiguracionPage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [notifGastos, setNotifGastos] = useState(true)
  const [notifMetas, setNotifMetas] = useState(true)
  const [notifResumen, setNotifResumen] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [seccion, setSeccion] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email || '')
      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
      try {
        const prefs = JSON.parse(localStorage.getItem('fa_prefs') || '{}')
        if (prefs.moneda) setMoneda(prefs.moneda)
        if (prefs.notifGastos !== undefined) setNotifGastos(prefs.notifGastos)
        if (prefs.notifMetas !== undefined) setNotifMetas(prefs.notifMetas)
        if (prefs.notifResumen !== undefined) setNotifResumen(prefs.notifResumen)
      } catch { /* ignore */ }
    }
    cargar()
  }, [])

  const guardarPreferencias = () => {
    try {
      localStorage.setItem('fa_prefs', JSON.stringify({ moneda, notifGastos, notifMetas, notifResumen }))
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch { /* ignore */ }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const exportarDatos = () => {
    const datos = {
      exportadoEn: new Date().toISOString(),
      preferencias: { moneda, notifGastos, notifMetas, notifResumen },
    }
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finanzapp-config-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-primary">Configuración</h1>
        <p className="text-xs text-secondary mt-0.5">Personalizá tu experiencia en FinanzApp</p>
      </div>

      {/* Perfil */}
      <div className="fa-card">
        <button
          onClick={() => setSeccion(seccion === 'perfil' ? null : 'perfil')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-confirm/10 flex items-center justify-center">
              <User size={16} className="text-confirm" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-primary">Perfil</p>
              <p className="text-xs text-secondary">{userName || userEmail}</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'perfil' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'perfil' && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div>
              <label className="text-xs font-semibold text-secondary block mb-1">Nombre</label>
              <input
                value={userName}
                onChange={e => setUserName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-field text-primary focus:outline-none focus:border-confirm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary block mb-1">Email</label>
              <input
                value={userEmail}
                disabled
                className="w-full px-3 py-2 text-sm rounded-lg border bg-field text-secondary opacity-60 cursor-not-allowed"
              />
            </div>
          </div>
        )}
      </div>

      {/* Apariencia */}
      <div className="fa-card">
        <button
          onClick={() => setSeccion(seccion === 'apariencia' ? null : 'apariencia')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-confirm/10 flex items-center justify-center">
              <Palette size={16} className="text-confirm" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-primary">Apariencia</p>
              <p className="text-xs text-secondary">Tema claro, oscuro o automático</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'apariencia' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'apariencia' && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-semibold text-secondary mb-3">Seleccioná el tema</p>
            <ThemeSelector />
          </div>
        )}
      </div>

      {/* Moneda */}
      <div className="fa-card">
        <button
          onClick={() => setSeccion(seccion === 'moneda' ? null : 'moneda')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-confirm/10 flex items-center justify-center">
              <DollarSign size={16} className="text-confirm" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-primary">Moneda</p>
              <p className="text-xs text-secondary">Moneda predeterminada: {moneda}</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'moneda' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'moneda' && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-semibold text-secondary mb-3">Seleccioná tu moneda</p>
            <div className="grid grid-cols-3 gap-2">
              {MONEDAS.map(m => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-colors ${
                    moneda === m
                      ? 'border-confirm text-confirm bg-confirm/10'
                      : 'border-border text-secondary hover:bg-alternate'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notificaciones */}
      <div className="fa-card">
        <button
          onClick={() => setSeccion(seccion === 'notif' ? null : 'notif')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-confirm/10 flex items-center justify-center">
              <Bell size={16} className="text-confirm" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-primary">Notificaciones</p>
              <p className="text-xs text-secondary">Alertas y recordatorios</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'notif' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'notif' && (
          <div className="mt-4 pt-4 border-t space-y-4">
            {[
              { label: 'Alertas de gastos', sub: 'Cuando registrás un gasto nuevo', val: notifGastos, set: setNotifGastos },
              { label: 'Progreso de metas', sub: 'Cuando avanzás hacia una meta', val: notifMetas, set: setNotifMetas },
              { label: 'Resumen mensual', sub: 'Resumen de tus finanzas al final del mes', val: notifResumen, set: setNotifResumen },
            ].map(({ label, sub, val, set }) => (
              <div key={label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">{label}</p>
                  <p className="text-xs text-secondary">{sub}</p>
                </div>
                <button
                  onClick={() => set(!val)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${val ? 'bg-confirm' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${val ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacidad */}
      <div className="fa-card">
        <button
          onClick={() => setSeccion(seccion === 'privacidad' ? null : 'privacidad')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-confirm/10 flex items-center justify-center">
              <Shield size={16} className="text-confirm" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-primary">Privacidad</p>
              <p className="text-xs text-secondary">Tus datos y seguridad</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'privacidad' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'privacidad' && (
          <div className="mt-4 pt-4 border-t space-y-3 text-sm text-secondary leading-relaxed">
            <p>🔒 Tus datos financieros están encriptados y almacenados de forma segura.</p>
            <p>📊 No compartimos tu información con terceros.</p>
            <p>🗑️ Podés solicitar la eliminación de tu cuenta y todos tus datos en cualquier momento.</p>
            <button
              onClick={exportarDatos}
              className="mt-2 flex items-center gap-2 text-xs font-semibold text-confirm hover:underline"
            >
              <Download size={14} />
              Exportar mis datos
            </button>
          </div>
        )}
      </div>

      {/* Guardar */}
      <button
        onClick={guardarPreferencias}
        className="w-full py-3 rounded-xl bg-confirm text-white font-semibold text-sm hover:bg-confirm-hover transition-colors flex items-center justify-center gap-2"
      >
        {guardado ? <><Check size={16} /> ¡Guardado!</> : 'Guardar cambios'}
      </button>

      {/* Cerrar sesión */}
      <button
        onClick={cerrarSesion}
        className="w-full py-3 rounded-xl border text-negative font-semibold text-sm hover:bg-negative/10 transition-colors flex items-center justify-center gap-2"
      >
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </div>
  )
}
