'use client'
/* Ajustes de notificaciones + recordatorios propios (Configuración). */
import { useEffect, useState } from 'react'
import { BellRing, Plus, Repeat, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { PrefsAvisos, Recordatorio } from '@/lib/notificaciones/plan'
import { guardarPrefs, guardarRecordatorios, leerDeCuenta, leerPrefsLocal, leerRecordatoriosLocal } from '@/lib/notificaciones/almacen'
import { esAppNativa, estadoPermiso, mostrarYa, pedirPermiso, type Permiso } from '@/lib/notificaciones/canal'
import { reprogramarAvisos } from '@/components/Notificador'

const OPCIONES: { k: keyof PrefsAvisos; label: string; sub: string }[] = [
  { k: 'vencimientos', label: 'Vencimientos', sub: 'Resúmenes de tarjeta: 3 días antes, 1 día antes y el mismo día' },
  { k: 'presupuesto', label: 'Presupuesto', sub: 'Al llegar al 80% de una categoría y si te pasás del tope' },
  { k: 'recordatorios', label: 'Recordatorios', sub: 'Los que creás vos, abajo' },
  { k: 'semanal', label: 'Resumen semanal', sub: 'Los domingos a las 20' },
  { k: 'sonido', label: 'Sonido', sub: 'Un sonido corto cuando aparece un aviso con la app abierta' },
]

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fechaLinda = (r: Recordatorio) => r.mensual
  ? `Todos los meses, el ${Number(r.fecha.slice(8, 10))} · ${r.hora}`
  : `${new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${r.hora}`

function Interruptor({ on, onCambio, etiqueta }: { on: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={etiqueta} onClick={() => onCambio(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-confirm' : 'bg-alternate'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
        style={{ background: on ? 'var(--texto-sobre-accion, #fff)' : 'var(--text-muted)' }} />
    </button>
  )
}

export function PanelAvisos() {
  const [prefs, setPrefs] = useState<PrefsAvisos>(() => leerPrefsLocal())
  const [recs, setRecs] = useState<Recordatorio[]>(() => leerRecordatoriosLocal())
  const [permiso, setPermiso] = useState<Permiso>('preguntar')
  const [nuevo, setNuevo] = useState({ texto: '', fecha: hoyISO(), hora: '09:00', mensual: false })
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    estadoPermiso().then(setPermiso)
    leerDeCuenta(createClient()).then(r => { if (r) { setPrefs(r.prefs); setRecs(r.recordatorios) } })
  }, [])

  const cambiar = async (k: keyof PrefsAvisos, v: boolean) => {
    const p = { ...prefs, [k]: v }
    setPrefs(p)
    await guardarPrefs(createClient(), p)
    reprogramarAvisos()
  }

  const activar = async () => {
    const r = await pedirPermiso()
    setPermiso(r)
    if (r === 'concedido') reprogramarAvisos()
  }

  const probar = async () => {
    await mostrarYa({ clave: `prueba:${Date.now()}`, titulo: 'Así se ven los avisos', cuerpo: 'Te voy a avisar de vencimientos, presupuesto y tus recordatorios.', cuando: new Date(), href: '/dashboard' }, prefs.sonido)
    setMsg(permiso === 'concedido' ? 'Aviso de prueba enviado.' : 'Sonó el aviso, pero falta activar las notificaciones para verlo.')
  }

  const agregar = async () => {
    const texto = nuevo.texto.trim()
    if (!texto) { setMsg('Escribí qué querés que te recuerde.'); return }
    const r: Recordatorio = { id: `r${Date.now().toString(36)}`, texto, fecha: nuevo.fecha, hora: nuevo.hora, mensual: nuevo.mensual }
    const lista = await guardarRecordatorios(createClient(), [...recs, r])
    setRecs(lista)
    setNuevo(n => ({ ...n, texto: '' }))
    setMsg('Recordatorio guardado.')
    reprogramarAvisos()
  }

  const borrar = async (id: string) => {
    setRecs(await guardarRecordatorios(createClient(), recs.filter(r => r.id !== id)))
    reprogramarAvisos()
  }

  const campo = 'rounded-control bg-field px-3 py-2 text-sm text-primary'
  const hoy = hoyISO()
  const visibles = recs.filter(r => r.mensual || r.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))

  return (
    <div className="mt-4 space-y-5">
      {/* permiso */}
      {permiso !== 'concedido' && (
        <div className="rounded-control bg-alternate p-4">
          <p className="text-sm font-semibold text-primary">
            {permiso === 'denegado' ? 'Las notificaciones están bloqueadas' : permiso === 'no-disponible' ? 'Este dispositivo no permite notificaciones' : 'Activá las notificaciones'}
          </p>
          <p className="mt-1 text-xs text-secondary">
            {permiso === 'denegado'
              ? (esAppNativa() ? 'Habilitalas desde los ajustes del teléfono (Apps → FinanzApp → Notificaciones).' : 'Habilitalas desde el candado que está al lado de la dirección, en el navegador.')
              : permiso === 'no-disponible'
                ? 'Probá desde la app instalada en el celular.'
                : esAppNativa() ? 'Te llegan aunque la app esté cerrada.' : 'En el navegador solo te llegan con la app abierta. En la app del celular llegan siempre.'}
          </p>
          {permiso === 'preguntar' && (
            <button onClick={activar} className="fa-press mt-3 flex items-center gap-2 rounded-control bg-confirm px-3 py-2 text-xs font-semibold text-white hover:bg-confirm-hover">
              <BellRing size={14} /> Activar notificaciones
            </button>
          )}
        </div>
      )}

      {/* qué avisar */}
      <ul className="space-y-4">
        {OPCIONES.map(o => (
          <li key={o.k} className="flex items-center justify-between gap-4">
            <span><span className="block text-sm font-semibold text-primary">{o.label}</span><span className="block text-xs text-secondary">{o.sub}</span></span>
            <Interruptor on={prefs[o.k]} onCambio={v => cambiar(o.k, v)} etiqueta={o.label} />
          </li>
        ))}
      </ul>
      <button onClick={probar} className="fa-press rounded-control bg-alternate px-3 py-2 text-xs font-semibold text-primary">Probar un aviso</button>

      {/* recordatorios */}
      <div>
        <p className="text-sm font-semibold text-primary">Tus recordatorios</p>
        {visibles.length === 0
          ? <p className="mt-1 text-xs text-secondary">Todavía no tenés. Sirven para lo que no tiene fecha en la app, como el alquiler o la patente: “Pagar el alquiler” el día 10 de cada mes.</p>
          : (
            <ul className="mt-2 space-y-1.5">
              {visibles.map(r => (
                <li key={r.id} className="flex items-center gap-3 rounded-control bg-alternate px-3 py-2">
                  {r.mensual && <Repeat size={14} className="shrink-0 text-muted" aria-label="Se repite" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-primary">{r.texto}</span>
                    <span className="block text-[11px] text-muted">{fechaLinda(r)}</span>
                  </span>
                  <button onClick={() => borrar(r.id)} aria-label={`Borrar recordatorio ${r.texto}`} className="fa-press grid h-8 w-8 place-items-center rounded-control text-muted hover:text-negative"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={nuevo.texto} onChange={e => setNuevo(n => ({ ...n, texto: e.target.value }))} placeholder="¿Qué te recuerdo?" maxLength={140}
            aria-label="Texto del recordatorio" className={`${campo} col-span-2`} onKeyDown={e => { if (e.key === 'Enter') agregar() }} />
          <input type="date" value={nuevo.fecha} min={hoy} onChange={e => setNuevo(n => ({ ...n, fecha: e.target.value }))} aria-label="Fecha" className={campo} />
          <input type="time" value={nuevo.hora} onChange={e => setNuevo(n => ({ ...n, hora: e.target.value }))} aria-label="Hora" className={campo} />
          <label className="col-span-2 flex items-center gap-2 text-xs text-secondary">
            <input type="checkbox" checked={nuevo.mensual} onChange={e => setNuevo(n => ({ ...n, mensual: e.target.checked }))} /> Repetir todos los meses
          </label>
          <button onClick={agregar} className="fa-press col-span-2 flex items-center justify-center gap-1.5 rounded-control bg-confirm py-2.5 text-sm font-semibold text-white hover:bg-confirm-hover">
            <Plus size={15} /> Agregar recordatorio
          </button>
        </div>
      </div>
      {msg && <p role="status" className="text-xs text-secondary">{msg}</p>}
    </div>
  )
}
