'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  User, Bell, Palette, DollarSign, Shield, Download,
  LogOut, ChevronRight, Check, Moon, Sun, Monitor, Upload,
} from 'lucide-react'
import { guardarPresupuestos, leerPresupuestosLocal, normalizarPresupuestos } from '@/lib/presupuestos'
import { exportarTodo, importarTodo, leerRespaldo, type ResumenImportacion } from '@/lib/respaldo'
import { ThemeSelector } from '@/components/ThemeSelector'
import { PanelAvisos } from '@/components/PanelAvisos'
import { guardarPrefs, guardarRecordatorios, leerPrefsLocal, leerRecordatoriosLocal, normalizarPrefs, normalizarRecordatorios } from '@/lib/notificaciones/almacen'

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
  const [respaldo, setRespaldo] = useState<{ ocupado: boolean; msg: string | null; error: boolean }>({ ocupado: false, msg: null, error: false })
  const archivoRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

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

  const exportarDatos = async () => {
    setRespaldo({ ocupado: true, msg: 'Preparando tu respaldo…', error: false })
    try {
      const datos = await exportarTodo(supabase, { moneda, notifGastos, notifMetas, notifResumen, presupuestos: leerPresupuestosLocal(), avisos: leerPrefsLocal(), recordatorios: leerRecordatoriosLocal() })
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finanzapp-respaldo-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      const n = Object.values(datos.tablas ?? {}).reduce((t, f) => t + f.length, 0)
      setRespaldo({ ocupado: false, msg: `Listo: exportaste ${n} registros.`, error: false })
    } catch {
      setRespaldo({ ocupado: false, msg: 'No se pudo exportar. Probá de nuevo.', error: true })
    }
  }

  const importarDatos = async (archivo: File) => {
    setRespaldo({ ocupado: true, msg: 'Importando…', error: false })
    try {
      const r = leerRespaldo(await archivo.text())
      const p = r.preferencias ?? {}
      if (typeof p.moneda === 'string') setMoneda(p.moneda)
      if (typeof p.notifGastos === 'boolean') setNotifGastos(p.notifGastos)
      if (typeof p.notifMetas === 'boolean') setNotifMetas(p.notifMetas)
      if (typeof p.notifResumen === 'boolean') setNotifResumen(p.notifResumen)
      if (r.preferencias) { try { localStorage.setItem('fa_prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('fa_prefs') || '{}'), ...r.preferencias })) } catch { /* ignore */ } }
      const pres = normalizarPresupuestos(p.presupuestos)
      if (Object.keys(pres).length) await guardarPresupuestos(supabase, { ...leerPresupuestosLocal(), ...pres })
      if (p.avisos) await guardarPrefs(supabase, normalizarPrefs(p.avisos))
      const recs = normalizarRecordatorios(p.recordatorios)
      if (recs.length) {
        const actuales = leerRecordatoriosLocal()
        await guardarRecordatorios(supabase, [...actuales, ...recs.filter(r => !actuales.some(a => a.id === r.id))])
      }
      let res: ResumenImportacion[] = []
      if (Object.keys(r.tablas ?? {}).length) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Tenés que iniciar sesión.')
        res = await importarTodo(supabase, user.id, r)
      }
      const nuevas = res.reduce((t, x) => t + x.nuevas, 0)
      const errores = res.filter(x => x.error)
      const base = res.length ? `Se agregaron ${nuevas} registros nuevos; los que ya tenías quedaron igual.` : 'Se restauraron tus preferencias.'
      setRespaldo({ ocupado: false, msg: errores.length ? `${base} No se pudo importar: ${errores.map(e => e.tabla).join(', ')}.` : base, error: errores.length > 0 })
    } catch (e) {
      setRespaldo({ ocupado: false, msg: e instanceof Error ? e.message : 'No se pudo importar el archivo.', error: true })
    }
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
              <p className="text-xs text-secondary">Vencimientos, presupuesto y recordatorios</p>
            </div>
          </div>
          <ChevronRight size={16} className={`text-secondary transition-transform ${seccion === 'notif' ? 'rotate-90' : ''}`} />
        </button>
        {seccion === 'notif' && <PanelAvisos />}
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
            <p>Tus datos financieros están encriptados y almacenados de forma segura.</p>
            <p>No compartimos tu información con terceros.</p>
            <p>Podés solicitar la eliminación de tu cuenta y todos tus datos en cualquier momento.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={exportarDatos} disabled={respaldo.ocupado}
                className="fa-press flex items-center gap-2 rounded-control bg-alternate px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
                <Download size={14} /> Exportar todos mis datos
              </button>
              <button onClick={() => archivoRef.current?.click()} disabled={respaldo.ocupado}
                className="fa-press flex items-center gap-2 rounded-control bg-alternate px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50">
                <Upload size={14} /> Importar respaldo
              </button>
              <input ref={archivoRef} type="file" accept="application/json,.json" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importarDatos(f) }} />
            </div>
            <p className="text-xs text-muted">Importar no borra ni cambia nada: solo agrega lo que falta. Sirven también los archivos exportados antes.</p>
            {respaldo.msg && <p role="status" className={`text-xs ${respaldo.error ? 'text-negative' : 'text-secondary'}`}>{respaldo.msg}</p>}
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
        className="w-full py-3 rounded-xl text-negative font-semibold text-sm hover:bg-negative/10 transition-colors flex items-center justify-center gap-2 bg-alternate"
      >
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </div>
  )
}
