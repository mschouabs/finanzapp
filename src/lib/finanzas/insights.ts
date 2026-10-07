/* ══ Insights de Luca ═════════════════════════════════════════════
   Luca como capa de inteligencia: mira las métricas del núcleo y
   devuelve observaciones breves, con el número real y una acción.
   Reglas: nunca inventa datos (si no hay con qué comparar, no dice
   nada), cada insight explica de dónde sale el número ("¿por qué?")
   y el orden cambia según el momento del mes.                        */

import type { LucaEstado } from '@/components/luca/LucaAvatar'
import {
  categorias as categoriasDe, compromisos as compromisosDe, flujoDelMes, momentoDelMes, patrimonio as patrimonioDe,
  progresoMetas, ritmoDeGasto,
  nombreMes, type Compromisos, type Flujo, type Momento, type Patrimonio, type ProgresoMeta, type Ritmo,
  type Categoria, type Snapshot, claveMes, isoLocal, mesDeISO,
} from './nucleo'

export type TipoInsight = 'atencion' | 'oportunidad' | 'progreso' | 'dato'

export interface Insight {
  id: string
  tipo: TipoInsight
  /** una línea, con el número */
  titulo: string
  /** el "¿por qué?": de dónde sale y qué conviene mirar */
  detalle: string
  accion?: { label: string; href: string }
  prioridad: number
  estado: LucaEstado
}

const $ = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
const pct = (n: number) => `${Math.round(Math.abs(n))}%`

interface Entrada {
  s: Snapshot
  p: Patrimonio
  flujo: Flujo
  ritmo: Ritmo
  comp: Compromisos
  cats: Categoria[]
  metas: ProgresoMeta[]
  momento: Momento
}

export function generarInsights({ s, p, flujo, ritmo, comp, cats, metas, momento }: Entrada): Insight[] {
  const out: Insight[] = []
  const libre = p.liquido - comp.total

  /* 1. compromisos que superan lo disponible */
  if (comp.total > 0 && libre < 0) {
    out.push({
      id: 'libre-negativo',
      tipo: 'atencion',
      titulo: `Tus pagos de los próximos ${comp.horizonte} días superan tu disponible por ${$(libre)}`,
      detalle: `Tenés ${$(p.liquido)} disponibles y ${$(comp.total)} ya comprometidos (resúmenes de tarjeta y gastos fijos pendientes). Revisá si falta cargar algún saldo o qué pago conviene priorizar.`,
      accion: { label: 'Ver compromisos', href: '#compromisos' },
      prioridad: 100,
      estado: 'warning',
    })
  }

  /* 2. vencimientos de tarjeta encima */
  const tarjetas = comp.items.filter(i => i.tipo === 'tarjeta' && i.fecha)
  const vencido = tarjetas.find(i => i.vencido)
  const proximo = tarjetas.find(i => !i.vencido && i.fecha && (i.fecha.getTime() - s.hoy.getTime()) / 86_400_000 <= 5)
  if (vencido) {
    out.push({
      id: `vencido-${vencido.id}`,
      tipo: 'atencion',
      titulo: `${vencido.titulo} está vencido: ${$(vencido.monto)}`,
      detalle: 'Un resumen impago después del vencimiento genera intereses y punitorios. Si ya lo pagaste, marcalo como pagado en Tarjetas para que los números queden al día.',
      accion: { label: 'Ir a Tarjetas', href: vencido.href },
      prioridad: 95,
      estado: 'warning',
    })
  } else if (proximo && proximo.fecha) {
    const dias = Math.max(0, Math.round((proximo.fecha.getTime() - s.hoy.getTime()) / 86_400_000))
    out.push({
      id: `proximo-${proximo.id}`,
      tipo: 'atencion',
      titulo: `${proximo.titulo} vence ${dias === 0 ? 'hoy' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`}: ${$(proximo.monto)}`,
      detalle: `Después de pagarlo te quedarían ${$(p.liquido - proximo.monto)} disponibles.`,
      accion: { label: 'Pagar resumen', href: proximo.href },
      prioridad: momento === 'cierre' || momento === 'inicio' ? 90 : 80,
      estado: 'warning',
    })
  }

  /* 3. ritmo de gasto vs. meses anteriores (solo si hay con qué comparar) */
  if (ritmo.variacion !== null && ritmo.mesesComparados >= 2 && ritmo.dia >= 5 && Math.abs(ritmo.variacion) >= 15) {
    const sube = ritmo.variacion > 0
    out.push({
      id: 'ritmo',
      tipo: sube ? 'atencion' : 'oportunidad',
      titulo: `Vas gastando ${pct(ritmo.variacion)} ${sube ? 'más' : 'menos'} que tu promedio a esta altura del mes`,
      detalle: `Del 1 al ${ritmo.dia} llevás ${$(ritmo.acumulado)} en consumos del día a día; en tus últimos ${ritmo.mesesComparados} meses, a esta misma altura, el promedio era ${$(ritmo.promedio ?? 0)}. No incluye gastos fijos ni cuotas de compras anteriores.`,
      accion: { label: 'Ver movimientos', href: '/dashboard/gastos-variables' },
      prioridad: sube ? (momento === 'mitad' ? 85 : 70) : 60,
      estado: sube ? 'warning' : 'celebration',
    })
  }

  /* 4. la categoría que más creció (comparando al mismo día del mes) */
  const suba = cats
    .filter(c => c.clave !== 'fijos' && c.anterior > 0)
    .map(c => ({ c, delta: c.monto - c.anterior }))
    .filter(x => x.delta > 0 && x.delta >= Math.max(10_000, flujo.gastos.total * 0.04) && x.delta / x.c.anterior >= 0.25)
    .sort((a, b) => b.delta - a.delta)[0]
  if (suba) {
    out.push({
      id: `cat-${suba.c.clave}`,
      tipo: 'oportunidad',
      titulo: `En ${suba.c.nombre} llevás ${$(suba.delta)} más que el mes pasado`,
      detalle: `${$(suba.c.monto)} en ${suba.c.movimientos} ${suba.c.movimientos === 1 ? 'movimiento' : 'movimientos'}, contra ${$(suba.c.anterior)} a esta misma altura de ${nombreMes(claveMes(new Date(s.hoy.getFullYear(), s.hoy.getMonth() - 1, 1)))}.`,
      accion: { label: 'Ver categoría', href: '#categorias' },
      prioridad: 65,
      estado: 'idle',
    })
  }

  /* 5. gastos hormiga del mes (marcados como tales al cargarlos) */
  const mes = claveMes(s.hoy)
  const hormiga = s.gastos.filter(g => g.es_gasto_hormiga && mesDeISO(g.fecha) === mes && g.fecha <= isoLocal(s.hoy))
  if (hormiga.length >= 5) {
    const total = hormiga.reduce((a, g) => a + (g.moneda === 'USD' ? g.monto * s.dolar : g.monto), 0)
    out.push({
      id: 'hormiga',
      tipo: 'oportunidad',
      titulo: `${hormiga.length} gastos hormiga este mes suman ${$(total)}`,
      detalle: `Son los gastos chicos que marcaste como "hormiga". Juntos equivalen al ${pct((total / Math.max(flujo.gastos.total, 1)) * 100)} de lo que gastaste en el mes.`,
      accion: { label: 'Ver movimientos', href: '/dashboard/gastos-variables' },
      prioridad: 50,
      estado: 'idle',
    })
  }

  /* 6. balance del mes: ahorro o déficit */
  if (flujo.ingresos.total > 0) {
    if (flujo.balance < 0) {
      out.push({
        id: 'deficit',
        tipo: 'atencion',
        titulo: `Este mes salió ${$(flujo.balance)} más de lo que entró`,
        detalle: `Entraron ${$(flujo.ingresos.total)} y salieron ${$(flujo.gastos.total)}. Lo más grande: ${[
          ['gastos fijos', flujo.gastos.fijos], ['día a día', flujo.gastos.variables], ['cuotas', flujo.gastos.cuotas], ['viajes', flujo.gastos.viajes],
        ].sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 2).map(([n, v]) => `${n} (${$(v as number)})`).join(' y ')}.`,
        accion: { label: 'Ver en qué se fue', href: '#categorias' },
        prioridad: momento === 'cierre' ? 88 : 72,
        estado: 'sad',
      })
    } else if ((flujo.tasaAhorro ?? 0) >= 20 && momento !== 'inicio') {
      out.push({
        id: 'ahorro',
        tipo: 'progreso',
        titulo: `Estás ahorrando el ${pct(flujo.tasaAhorro ?? 0)} de lo que entró`,
        detalle: `De ${$(flujo.ingresos.total)} que entraron, quedan ${$(flujo.balance)}. ${momento === 'cierre' ? 'Buen momento para moverlo a una meta o a una inversión.' : 'Si mantenés el ritmo, cerrás el mes en positivo.'}`,
        accion: { label: 'Ver metas', href: '/dashboard/metas' },
        prioridad: momento === 'cierre' ? 75 : 55,
        estado: 'celebration',
      })
    }
  }

  /* 7. cuotas que siguen después del mes que viene */
  if (comp.futuro > 0 && comp.hasta) {
    out.push({
      id: 'cuotas-futuras',
      tipo: 'dato',
      titulo: `Tenés ${$(comp.futuro)} comprometidos en tarjetas más allá de los próximos ${comp.horizonte} días`,
      detalle: `${comp.comprasEnCuotas > 0 ? `${comp.comprasEnCuotas} ${comp.comprasEnCuotas === 1 ? 'compra en cuotas' : 'compras en cuotas'}; ` : ''}lo último vence en ${nombreMes(comp.hasta)}. Es plata de ingresos futuros que ya tiene destino.`,
      accion: { label: 'Ver tarjetas', href: '/dashboard/tarjetas' },
      prioridad: 45,
      estado: 'idle',
    })
  }

  /* 8. patrimonio vs. el mes pasado */
  if (p.anterior !== null && p.anterior !== 0) {
    const d = p.neto - p.anterior
    if (Math.abs(d / p.anterior) >= 0.03) {
      out.push({
        id: 'patrimonio',
        tipo: d > 0 ? 'progreso' : 'dato',
        titulo: `Tu patrimonio neto ${d > 0 ? 'creció' : 'bajó'} ${$(d)} desde fin de ${nombreMes(claveMes(new Date(s.hoy.getFullYear(), s.hoy.getMonth() - 1, 1)))}`,
        detalle: `Pasó de ${$(p.anterior)} a ${$(p.neto)} (${d > 0 ? '+' : '−'}${pct((d / Math.abs(p.anterior)) * 100)}). Incluye cambios de cotización del dólar y cripto, no solo lo que ahorraste.`,
        prioridad: 40,
        estado: d > 0 ? 'celebration' : 'idle',
      })
    }
  }

  /* 9. una meta a punto de cumplirse */
  const cerca = metas.find(m => m.pct >= 85 && m.pct < 100)
  if (cerca) {
    out.push({
      id: `meta-${cerca.id}`,
      tipo: 'progreso',
      titulo: `${cerca.emoji} ${cerca.nombre} está al ${pct(cerca.pct)}`,
      detalle: `Te faltan ${cerca.moneda === 'USD' ? 'US$ ' + Math.round(cerca.objetivo - cerca.actual).toLocaleString('es-AR') : $(cerca.objetivo - cerca.actual)} para completarla.`,
      accion: { label: 'Ver meta', href: '/dashboard/metas' },
      prioridad: 58,
      estado: 'celebration',
    })
  }

  /* ── reglas que miran tus cuentas y tus hábitos ─────────────── */
  const hoyISO = isoLocal(s.hoy)
  const diaMes = s.hoy.getDate()
  const diasMes = new Date(s.hoy.getFullYear(), s.hoy.getMonth() + 1, 0).getDate()
  const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

  /* 10. una cuenta quedó en negativo (casi siempre falta cargar algo) */
  const negativa = s.lineas
    .filter(l => Number(l.monto) < -0.5 && ['efectivo', 'ahorro', 'divisa', 'cuenta'].includes(l.tipo))
    .sort((a, b) => Number(a.monto) - Number(b.monto))[0]
  if (negativa) {
    const nombre = `${negativa.etiqueta || negativa.app}${negativa.nombre ? ` (${negativa.nombre})` : ''}`
    out.push({
      id: `negativa-${negativa.id}`,
      tipo: 'atencion',
      titulo: `${nombre} quedó con saldo negativo: ${negativa.moneda === 'USD' ? 'US$ ' + Math.abs(Math.round(Number(negativa.monto))).toLocaleString('es-AR') : '−' + $(Number(negativa.monto))}`,
      detalle: 'Una cuenta no puede tener menos de cero: seguramente falta cargar un ingreso o una transferencia, o el saldo real es otro. Corregilo y el resto de los números se acomoda solo.',
      accion: { label: 'Ir a Billeteras', href: '/dashboard/billeteras' },
      prioridad: 92,
      estado: 'warning',
    })
  }

  /* 11. ¿el disponible llega a fin de mes al ritmo de gasto diario? */
  const desde30 = isoLocal(new Date(s.hoy.getFullYear(), s.hoy.getMonth(), s.hoy.getDate() - 30))
  const recientes = s.gastos.filter(g => g.fecha > desde30 && g.fecha <= hoyISO && g.forma_pago !== 'credito' && !(g.cuotas_total && g.cuotas_total > 1))
  const diasConDatos = new Set(recientes.map(g => g.fecha)).size
  const porDia = recientes.reduce((a, g) => a + (g.moneda === 'USD' ? g.monto * s.dolar : g.monto), 0) / 30
  const quedan = diasMes - diaMes
  const sueldoPorCobrar = s.ingresosFijos
    .filter(i => i.cobrado_mes !== undefined && i.cobrado_mes !== mesActual(s))
    .reduce((a, i) => a + i.monto, 0)
  const alcanza = libre + sueldoPorCobrar
  if (libre >= 0 && diasConDatos >= 12 && porDia > 0 && quedan >= 5 && alcanza < porDia * quedan) {
    const dias = Math.max(0, Math.floor(alcanza / porDia))
    out.push({
      id: 'no-alcanza',
      tipo: 'atencion',
      titulo: `Al ritmo de ${$(porDia)} por día, tu plata libre alcanza para ${dias} ${dias === 1 ? 'día' : 'días'} más`,
      detalle: `Faltan ${quedan} días para fin de mes. Libre hoy: ${$(libre)} (disponible menos pagos ya comprometidos)${sueldoPorCobrar > 0 ? `, más ${$(sueldoPorCobrar)} de sueldo que todavía no marcaste como cobrado` : ''}. El ritmo sale de tus gastos con débito y efectivo de los últimos 30 días.`,
      accion: { label: 'Ver movimientos', href: '/dashboard/gastos-variables' },
      prioridad: 86,
      estado: 'warning',
    })
  }

  /* 12. te deben plata hace más de un mes */
  const atrasadas = s.deudasFreelance
    .map(d => ({ ...d, dias: Math.round((s.hoy.getTime() - new Date(d.fecha + 'T12:00:00').getTime()) / 86_400_000) }))
    .filter(d => d.dias >= 30)
    .sort((a, b) => b.pendiente - a.pendiente)
  if (atrasadas.length) {
    const total = atrasadas.reduce((a, d) => a + d.pendiente, 0)
    const d0 = atrasadas[0]
    out.push({
      id: 'cobros-atrasados',
      tipo: 'atencion',
      titulo: `Te deben ${$(total)} hace más de un mes`,
      detalle: `${d0.cliente} te debe ${$(d0.pendiente)} desde hace ${d0.dias} días${atrasadas.length > 1 ? `, y hay ${atrasadas.length - 1} ${atrasadas.length === 2 ? 'proyecto más' : 'proyectos más'} en la misma situación` : ''}. Si ya te pagaron, registrá el cobro en Trabajos.`,
      accion: { label: 'Ir a Trabajos', href: '/dashboard/ingresos-gastos' },
      prioridad: 68,
      estado: 'warning',
    })
  }

  /* 12b. plata que te deben otras personas (no suma al patrimonio) */
  if (s.meDeben.length) {
    const aPesos = (d: { moneda: string; monto: number; cobrado: number }) => (d.monto - d.cobrado) * (d.moneda === 'USD' ? s.dolar : 1)
    const total = s.meDeben.reduce((a, d) => a + aPesos(d), 0)
    const vencidas = s.meDeben.filter(d => d.vence && d.vence < hoyISO)
    const personas = Array.from(new Set(s.meDeben.map(d => d.persona)))
    out.push({
      id: 'me-deben',
      tipo: vencidas.length ? 'atencion' : 'dato',
      titulo: `Te deben ${$(total)}${personas.length > 1 ? ` entre ${personas.length} personas` : ` (${personas[0]})`}`,
      detalle: `${vencidas.length ? `${vencidas.length} ${vencidas.length === 1 ? 'ya pasó' : 'ya pasaron'} la fecha que anotaste. ` : ''}Es plata que ya gastaste y te van a devolver: no suma a tu patrimonio hasta que la cobres. Cuando te paguen, registrá el cobro para que entre a la cuenta correcta.`,
      accion: { label: 'Ver quién te debe', href: '/dashboard/me-deben' },
      prioridad: vencidas.length ? 69 : 35,
      estado: vencidas.length ? 'warning' : 'idle',
    })
  }

  /* 13. un gasto que se repite todos los meses y no está entre los fijos */
  const fijosNombres = new Set(s.fijos.map(f => normal(f.nombre)))
  const porNombre = new Map<string, { nombre: string; meses: Map<string, number> }>()
  for (const g of s.gastos) {
    if (g.cuotas_total && g.cuotas_total > 1) continue
    if (g.fecha > hoyISO) continue
    const k = normal(g.nombre)
    if (!k || fijosNombres.has(k)) continue
    const e = porNombre.get(k) ?? { nombre: g.nombre, meses: new Map<string, number>() }
    const m = mesDeISO(g.fecha)
    e.meses.set(m, (e.meses.get(m) ?? 0) + (g.moneda === 'USD' ? g.monto * s.dolar : g.monto))
    porNombre.set(k, e)
  }
  const ultimos4 = [1, 2, 3, 4].map(i => claveMes(new Date(s.hoy.getFullYear(), s.hoy.getMonth() - i, 1)))
  const recurrente = Array.from(porNombre.values())
    .map(e => {
      const montos = ultimos4.map(m => e.meses.get(m)).filter((v): v is number => v !== undefined)
      return { e, montos }
    })
    /* una vez por mes, con un monto parecido, en al menos 3 de los últimos 4 meses */
    .filter(({ e, montos }) => montos.length >= 3 && Math.max(...montos) <= Math.min(...montos) * 1.25
      && ultimos4.every(m => !e.meses.has(m) || s.gastos.filter(g => normal(g.nombre) === normal(e.nombre) && mesDeISO(g.fecha) === m).length === 1))
    .map(({ e, montos }) => ({ nombre: e.nombre, prom: montos.reduce((a, b) => a + b, 0) / montos.length, n: montos.length }))
    .sort((a, b) => b.prom - a.prom)
  if (recurrente.length) {
    const r0 = recurrente[0]
    out.push({
      id: `recurrente-${normal(r0.nombre)}`,
      tipo: 'oportunidad',
      titulo: `${r0.nombre} se repite todos los meses: unos ${$(r0.prom)}`,
      detalle: `Lo pagaste en ${r0.n} de los últimos 4 meses, siempre por un monto parecido${recurrente.length > 1 ? ` (también ${recurrente.slice(1, 3).map(x => x.nombre).join(' y ')})` : ''}. Si es un gasto fijo, cargalo como fijo: así tu plata libre del mes ya lo descuenta.`,
      accion: { label: 'Ver movimientos', href: '/dashboard/gastos-variables' },
      prioridad: 52,
      estado: 'insight',
    })
  }

  /* 14. un sueldo sin cobro marcado ya entrado el mes */
  if (diaMes >= 10) {
    const sinCobro = s.ingresosFijos.filter(i => i.cobrado_mes !== undefined && i.cobrado_mes !== mesActual(s))
    if (sinCobro.length) {
      out.push({
        id: 'sueldo-sin-cobro',
        tipo: 'dato',
        titulo: `¿Ya cobraste ${sinCobro.map(i => i.nombre).join(' y ')}?`,
        detalle: 'Todavía no está marcado como cobrado este mes. Marcalo en Trabajos (y elegí en qué cuenta entró) para que tu disponible esté al día.',
        accion: { label: 'Ir a Trabajos', href: '/dashboard/ingresos-gastos' },
        prioridad: 48,
        estado: 'idle',
      })
    }
  }

  return out.sort((a, b) => b.prioridad - a.prioridad)
}

const mesActual = (s: Snapshot) => claveMes(s.hoy)

/** Los insights de hoy a partir del snapshot (mismo cálculo que el Resumen). */
export function insightsDe(s: Snapshot): Insight[] {
  const p = patrimonioDe(s)
  const comp = compromisosDe(s, 30)
  const actual = claveMes(s.hoy)
  return generarInsights({
    s, p, comp, flujo: flujoDelMes(s, actual), ritmo: ritmoDeGasto(s), cats: categoriasDe(s, actual),
    metas: progresoMetas(s), momento: momentoDelMes(s.hoy).momento,
  })
}
