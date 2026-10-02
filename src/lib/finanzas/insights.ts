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

  return out.sort((a, b) => b.prioridad - a.prioridad)
}

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
