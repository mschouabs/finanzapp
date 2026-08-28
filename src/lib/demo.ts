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
    { id: 'if1', nombre: 'Sueldo', monto: 850000, created_at: mesAtras(0) },
    { id: 'if2', nombre: 'Sueldo', monto: 850000, created_at: mesAtras(1) },
    { id: 'if3', nombre: 'Sueldo', monto: 820000, created_at: mesAtras(2) },
    { id: 'if4', nombre: 'Sueldo', monto: 820000, created_at: mesAtras(3) },
  ],
  ingresos_freelance: [
    { id: 'fr1', nombre: 'Proyecto web', monto: 240000, fecha: iso(6) },
    { id: 'fr2', nombre: 'Consultoría', monto: 180000, fecha: iso(38) },
    { id: 'fr3', nombre: 'Landing page', monto: 95000, fecha: iso(70) },
  ],
  gastos_fijos: [
    { id: 'gf1', nombre: 'Alquiler', monto: 320000, debitado: true, created_at: mesAtras(0) },
    { id: 'gf2', nombre: 'Expensas', monto: 78000, debitado: true, created_at: mesAtras(0) },
    { id: 'gf3', nombre: 'Internet', monto: 32000, debitado: false, created_at: mesAtras(0) },
    { id: 'gf4', nombre: 'Celular', monto: 18500, debitado: false, created_at: mesAtras(0) },
  ],
  gastos_variables: [
    { id: 'gv1', nombre: 'Supermercado', monto: 87400, categoria: 'mercado', fecha: iso(1), es_gasto_hormiga: false },
    { id: 'gv2', nombre: 'Delivery', monto: 18900, categoria: 'comida', fecha: iso(2), es_gasto_hormiga: true },
    { id: 'gv3', nombre: 'Uber', monto: 12500, categoria: 'transporte', fecha: iso(3), es_gasto_hormiga: true },
    { id: 'gv4', nombre: 'Farmacia', monto: 24300, categoria: 'farmacia', fecha: iso(5), es_gasto_hormiga: false },
    { id: 'gv5', nombre: 'Cine', monto: 16000, categoria: 'ocio', fecha: iso(8), es_gasto_hormiga: false },
    { id: 'gv6', nombre: 'Café', monto: 4800, categoria: 'comida', fecha: iso(9), es_gasto_hormiga: true },
    { id: 'gv7', nombre: 'Zapatillas', monto: 145000, categoria: 'ropa', fecha: iso(12), es_gasto_hormiga: false },
    { id: 'gv8', nombre: 'Monotributo', monto: 37000, categoria: 'impuesto', fecha: iso(15), es_gasto_hormiga: false },
    { id: 'gv9', nombre: 'Supermercado', monto: 92000, categoria: 'mercado', fecha: iso(33), es_gasto_hormiga: false },
    { id: 'gv10', nombre: 'Nafta', monto: 45000, categoria: 'transporte', fecha: iso(40), es_gasto_hormiga: false },
  ],
  inversiones: [
    { id: 'iv1', nombre: 'Plazo fijo UVA', app: 'Brubank', moneda: 'ARS', monto: 1200000, tasa_anual: 42, riesgo: 'conservador' },
    { id: 'iv2', nombre: 'FCI Money Market', app: 'MercadoPago', moneda: 'ARS', monto: 450000, tasa_anual: 35, riesgo: 'conservador' },
    { id: 'iv3', nombre: 'CEDEAR AAPL', app: 'IOL', moneda: 'ARS', monto: 380000, tasa_anual: 0, riesgo: 'moderado' },
    { id: 'iv4', nombre: 'Bitcoin', app: 'Binance', moneda: 'USD', monto: 800, tasa_anual: 0, riesgo: 'alto' },
    { id: 'iv5', nombre: 'Ethereum', app: 'Lemon', moneda: 'USD', monto: 350, tasa_anual: 0, riesgo: 'alto' },
  ],
  secciones: [
    {
      id: 'sec1', user_id: USUARIO_DEMO.id, nombre: 'Gastos Fijos', emoji: '🏠',
      tipo: 'gasto', plantilla: 'gastos_fijos', orden: 0, created_at: mesAtras(2),
      campos: [
        { key: 'concepto', label: 'Concepto', tipo: 'text' },
        { key: 'monto', label: 'Monto', tipo: 'number', fijo: true },
        { key: 'fecha', label: 'Fecha', tipo: 'date', fijo: true },
        { key: 'frecuencia', label: 'Frecuencia', tipo: 'select', opciones: ['Mensual', 'Bimestral', 'Anual'] },
      ],
    },
    {
      id: 'sec2', user_id: USUARIO_DEMO.id, nombre: 'Freelance', emoji: '💼',
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
    { id: 'sr1', seccion_id: 'sec1', user_id: USUARIO_DEMO.id, monto: 45000, fecha: iso(4), datos: { concepto: 'Seguro auto', frecuencia: 'Mensual' }, created_at: mesAtras(0) },
    { id: 'sr2', seccion_id: 'sec1', user_id: USUARIO_DEMO.id, monto: 22000, fecha: iso(10), datos: { concepto: 'Gimnasio', frecuencia: 'Mensual' }, created_at: mesAtras(0) },
    { id: 'sr3', seccion_id: 'sec2', user_id: USUARIO_DEMO.id, monto: 130000, fecha: iso(7), datos: { empresa: 'Estudio Nube', descripcion: 'Rediseño' }, created_at: mesAtras(0) },
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
