/* ══ MODO DEMO ═══════════════════════════════════════════════════
   Poné DEMO en false para volver a exigir login y usar Supabase real.
   Es el único cambio necesario: nada más depende de esto.

   Con DEMO en true:
     · el dashboard no pide sesión
     · createClient() devuelve un cliente falso en memoria
     · no se toca Supabase, ni se lee ni se escribe nada real
   ════════════════════════════════════════════════════════════════ */

export const DEMO = true

const hoy = new Date()
const iso = (diasAtras: number) =>
  new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras)
    .toISOString().slice(0, 10)
const mesAtras = (m: number) =>
  new Date(hoy.getFullYear(), hoy.getMonth() - m, 15).toISOString()

export const USUARIO_DEMO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@finanzapp.app',
  user_metadata: { nombre: 'Matias' },
}

/* ── Datos de ejemplo ───────────────────────────────────────────── */
const datos: Record<string, Record<string, unknown>[]> = {
  ingresos_fijos: [
    { id: 'if1', user_id: USUARIO_DEMO.id, nombre: 'Sueldo', monto: 850000, monto_cobrado: 850000, activo: true, created_at: mesAtras(3) },
    { id: 'if2', user_id: USUARIO_DEMO.id, nombre: 'Alquiler depto', monto: 180000, monto_cobrado: 180000, activo: true, created_at: mesAtras(2) },
  ],
  ingresos_freelance: [
    { id: 'fr1', user_id: USUARIO_DEMO.id, cliente: 'Estudio Nube', descripcion: 'Proyecto web', monto_total: 240000, monto_cobrado: 240000, fecha: iso(6) },
    { id: 'fr2', user_id: USUARIO_DEMO.id, cliente: 'Grupo Andes', descripcion: 'Consultoría', monto_total: 220000, monto_cobrado: 180000, fecha: iso(38) },
    { id: 'fr3', user_id: USUARIO_DEMO.id, cliente: 'Kilo Café', descripcion: 'Landing page', monto_total: 95000, monto_cobrado: 95000, fecha: iso(70) },
  ],
  gastos_fijos: [
    { id: 'gf1', user_id: USUARIO_DEMO.id, nombre: 'Alquiler', monto: 320000, categoria: 'Vivienda', debitado: true, activo: true, created_at: mesAtras(3) },
    { id: 'gf2', user_id: USUARIO_DEMO.id, nombre: 'Expensas', monto: 78000, categoria: 'Vivienda', debitado: true, activo: true, created_at: mesAtras(3) },
    { id: 'gf3', user_id: USUARIO_DEMO.id, nombre: 'Internet', monto: 32000, categoria: 'Servicios', debitado: false, activo: true, created_at: mesAtras(3) },
    { id: 'gf4', user_id: USUARIO_DEMO.id, nombre: 'Celular', monto: 18500, categoria: 'Servicios', debitado: false, activo: true, created_at: mesAtras(2) },
  ],
  gastos_variables: [
    { id: 'gv1', user_id: USUARIO_DEMO.id, nombre: 'Supermercado', monto: 87400, categoria: 'mercado', fecha: iso(1), es_gasto_hormiga: false },
    { id: 'gv2', user_id: USUARIO_DEMO.id, nombre: 'Delivery', monto: 18900, categoria: 'comida', fecha: iso(2), es_gasto_hormiga: true },
    { id: 'gv3', user_id: USUARIO_DEMO.id, nombre: 'Uber', monto: 12500, categoria: 'transporte', fecha: iso(3), es_gasto_hormiga: true },
    { id: 'gv4', user_id: USUARIO_DEMO.id, nombre: 'Farmacia', monto: 24300, categoria: 'salud', fecha: iso(5), es_gasto_hormiga: false },
    { id: 'gv5', user_id: USUARIO_DEMO.id, nombre: 'Cine', monto: 16000, categoria: 'ocio', fecha: iso(8), es_gasto_hormiga: false },
    { id: 'gv6', user_id: USUARIO_DEMO.id, nombre: 'Café', monto: 4800, categoria: 'comida', fecha: iso(9), es_gasto_hormiga: true },
    { id: 'gv7', user_id: USUARIO_DEMO.id, nombre: 'Zapatillas', monto: 145000, categoria: 'ropa', fecha: iso(12), es_gasto_hormiga: false },
    { id: 'gv8', user_id: USUARIO_DEMO.id, nombre: 'Monotributo', monto: 37000, categoria: 'impuestos', fecha: iso(15), es_gasto_hormiga: false },
    { id: 'gv9', user_id: USUARIO_DEMO.id, nombre: 'Supermercado', monto: 92000, categoria: 'mercado', fecha: iso(33), es_gasto_hormiga: false },
    { id: 'gv10', user_id: USUARIO_DEMO.id, nombre: 'Nafta', monto: 45000, categoria: 'transporte', fecha: iso(40), es_gasto_hormiga: false },
    { id: 'gv11', user_id: USUARIO_DEMO.id, nombre: 'Cena con amigos', monto: 28500, categoria: 'ocio', fecha: iso(62), es_gasto_hormiga: false },
    { id: 'gv12', user_id: USUARIO_DEMO.id, nombre: 'Supermercado', monto: 81000, categoria: 'mercado', fecha: iso(65), es_gasto_hormiga: false },
  ],
  inversiones: [
    { id: 'iv1', user_id: USUARIO_DEMO.id, nombre: 'Plazo fijo UVA', app: 'Brubank', tipo: 'Plazo fijo', moneda: 'ARS', monto: 1200000, tasa_anual: 42, nivel_riesgo: 'conservador' },
    { id: 'iv2', user_id: USUARIO_DEMO.id, nombre: 'FCI Money Market', app: 'Mercado Pago', tipo: 'Fondo común', moneda: 'ARS', monto: 450000, tasa_anual: 35, nivel_riesgo: 'conservador' },
    { id: 'iv3', user_id: USUARIO_DEMO.id, nombre: 'CEDEAR AAPL', app: 'IOL', tipo: 'CEDEAR', moneda: 'ARS', monto: 380000, tasa_anual: 0, nivel_riesgo: 'moderado' },
    { id: 'iv4', user_id: USUARIO_DEMO.id, nombre: 'Bitcoin', app: 'Binance', tipo: 'Cripto', moneda: 'USD', monto: 800, tasa_anual: 0, nivel_riesgo: 'alto' },
    { id: 'iv5', user_id: USUARIO_DEMO.id, nombre: 'Ethereum', app: 'Lemon', tipo: 'Cripto', moneda: 'USD', monto: 350, tasa_anual: 0, nivel_riesgo: 'alto' },
  ],
  secciones: [
    {
      id: 'sec1', user_id: USUARIO_DEMO.id, nombre: 'Suscripciones', emoji: '📺',
      tipo: 'gasto', plantilla: 'gastos_fijos', orden: 0, created_at: mesAtras(2),
      campos: [
        { key: 'concepto', label: 'Concepto', tipo: 'text' },
        { key: 'monto', label: 'Monto', tipo: 'number', fijo: true },
        { key: 'fecha', label: 'Fecha', tipo: 'date', fijo: true },
        { key: 'frecuencia', label: 'Frecuencia', tipo: 'select', opciones: ['Mensual', 'Bimestral', 'Anual'] },
      ],
    },
    {
      id: 'sec2', user_id: USUARIO_DEMO.id, nombre: 'Changas', emoji: '🛠️',
      tipo: 'ingreso', plantilla: 'trabajos', orden: 1, created_at: mesAtras(1),
      campos: [
        { key: 'empresa', label: 'Empresa', tipo: 'text' },
        { key: 'monto', label: 'Monto', tipo: 'number', fijo: true },
        { key: 'fecha', label: 'Fecha', tipo: 'date', fijo: true },
        { key: 'descripcion', label: 'Descripción', tipo: 'text' },
      ],
    },
  ],
  seccion_registros: [
    { id: 'sr1', seccion_id: 'sec1', user_id: USUARIO_DEMO.id, monto: 12900, fecha: iso(4), datos: { concepto: 'Netflix', frecuencia: 'Mensual' }, created_at: mesAtras(0) },
    { id: 'sr2', seccion_id: 'sec1', user_id: USUARIO_DEMO.id, monto: 7500, fecha: iso(10), datos: { concepto: 'Spotify', frecuencia: 'Mensual' }, created_at: mesAtras(0) },
    { id: 'sr3', seccion_id: 'sec2', user_id: USUARIO_DEMO.id, monto: 130000, fecha: iso(7), datos: { empresa: 'Estudio Nube', descripcion: 'Rediseño' }, created_at: mesAtras(0) },
    { id: 'sr4', seccion_id: 'sec2', user_id: USUARIO_DEMO.id, monto: 64000, fecha: iso(41), datos: { empresa: 'Kilo Café', descripcion: 'Menú digital' }, created_at: mesAtras(1) },
  ],
}

/* ── Cliente falso ──────────────────────────────────────────────────
   Imita lo justo del builder de Supabase que usa la app: los métodos
   encadenables devuelven el mismo objeto, y el objeto es "thenable"
   para que `await` reciba { data, error } como el cliente real.      */

type Fila = Record<string, unknown>

function nuevaId() {
  return 'demo-' + Math.random().toString(36).slice(2, 10)
}

function consulta(tabla: string) {
  let filas: Fila[] = [...(datos[tabla] ?? [])]

  const q = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return Promise.resolve({ data: null, error: null, count: filas.length })
      }
      return q
    },
    eq: (col: string, val: unknown) => {
      // el user_id no aplica: en demo hay un solo usuario
      if (col === 'user_id') return q
      filas = filas.filter(f => f[col] === val)
      return q
    },
    neq: (col: string, val: unknown) => {
      filas = filas.filter(f => f[col] !== val)
      return q
    },
    in: (col: string, vals: unknown[]) => {
      filas = filas.filter(f => vals.includes(f[col]))
      return q
    },
    gte: (col: string, val: string) => {
      filas = filas.filter(f => String(f[col] ?? '') >= val)
      return q
    },
    lte: (col: string, val: string) => {
      filas = filas.filter(f => String(f[col] ?? '') <= val)
      return q
    },
    like: (col: string, patron: string) => {
      const re = new RegExp('^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$')
      filas = filas.filter(f => re.test(String(f[col] ?? '')))
      return q
    },
    ilike: (col: string, patron: string) => {
      const re = new RegExp('^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i')
      filas = filas.filter(f => re.test(String(f[col] ?? '')))
      return q
    },
    range: (desde: number, hasta: number) => {
      filas = filas.slice(desde, hasta + 1)
      return q
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const asc = opts?.ascending !== false
      filas.sort((a, b) => {
        const x = a[col] as string | number ?? ''
        const y = b[col] as string | number ?? ''
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
      return q
    },
    limit: (n: number) => {
      filas = filas.slice(0, n)
      return q
    },
    single: () => Promise.resolve({ data: filas[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: filas[0] ?? null, error: null }),

    insert: (nuevas: Fila | Fila[]) => {
      const arr = Array.isArray(nuevas) ? nuevas : [nuevas]
      datos[tabla] = [
        ...arr.map(f => ({ id: nuevaId(), created_at: new Date().toISOString(), ...f })),
        ...(datos[tabla] ?? []),
      ]
      return Promise.resolve({ data: null, error: null })
    },
    update: (cambios: Fila) => ({
      eq: (col: string, val: unknown) => {
        datos[tabla] = (datos[tabla] ?? []).map(f =>
          f[col] === val ? { ...f, ...cambios } : f
        )
        return Promise.resolve({ data: null, error: null })
      },
    }),
    delete: () => ({
      eq: (col: string, val: unknown) => {
        datos[tabla] = (datos[tabla] ?? []).filter(f => f[col] !== val)
        return Promise.resolve({ data: null, error: null })
      },
    }),

    // hace que `await q` devuelva { data, error }
    then: (
      resolver: (r: { data: Fila[]; error: null }) => unknown,
    ) => Promise.resolve({ data: filas, error: null }).then(resolver),
  }

  return q
}

export function clienteDemo() {
  return {
    from: (tabla: string) => consulta(tabla),
    auth: {
      getUser: () => Promise.resolve({ data: { user: USUARIO_DEMO }, error: null }),
      getSession: () =>
        Promise.resolve({ data: { session: { user: USUARIO_DEMO } }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () =>
        Promise.resolve({ data: { user: USUARIO_DEMO }, error: null }),
      signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
    },
  }
}
