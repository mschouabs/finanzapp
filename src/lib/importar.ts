/* ── Parseo de archivos exportados de bancos y billeteras ──────────
   Todo se procesa en el navegador: el archivo nunca sale de tu equipo. */

export interface TablaCruda {
  headers: string[]
  filas: string[][]
}

/** Detecta el separador más probable mirando la primera línea. */
export function detectarSeparador(linea: string): string {
  const candidatos = [';', ',', '\t', '|']
  let mejor = ','
  let max = 0
  for (const sep of candidatos) {
    // no cuenta separadores dentro de comillas
    const n = (linea.match(new RegExp(`\\${sep}(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'g')) || []).length
    if (n > max) { max = n; mejor = sep }
  }
  return mejor
}

/** Parser CSV que respeta comillas dobles y comillas escapadas ("") . */
export function parsearCSV(texto: string): TablaCruda {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const primera = limpio.split('\n').find(l => l.trim() !== '') ?? ''
  const sep = detectarSeparador(primera)

  const filas: string[][] = []
  let campo = ''
  let fila: string[] = []
  let enComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]

    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++ }
        else enComillas = false
      } else campo += ch
      continue
    }

    if (ch === '"') { enComillas = true; continue }
    if (ch === sep) { fila.push(campo.trim()); campo = ''; continue }
    if (ch === '\n') {
      fila.push(campo.trim())
      if (fila.some(c => c !== '')) filas.push(fila)
      fila = []
      campo = ''
      continue
    }
    campo += ch
  }
  fila.push(campo.trim())
  if (fila.some(c => c !== '')) filas.push(fila)

  if (filas.length === 0) return { headers: [], filas: [] }

  const headers = filas[0].map((h, i) => h || `Columna ${i + 1}`)
  return { headers, filas: filas.slice(1).filter(f => f.length === headers.length) }
}

/* ── Interpretación de valores ──────────────────────────────────── */

/** Entiende 1.234,56 (es-AR), 1,234.56 (en-US), $ y paréntesis negativos. */
export function parsearMonto(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  const negativoPorParentesis = /^\(.*\)$/.test(s)
  s = s.replace(/[()]/g, '')

  const negativoPorSigno = s.includes('-')
  s = s.replace(/[^0-9.,]/g, '')
  if (!s) return null

  const ultimaComa = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')

  if (ultimaComa > -1 && ultimoPunto > -1) {
    // el separador decimal es el que aparece último
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (ultimaComa > -1) {
    // una sola coma: decimal si deja 1-2 dígitos, si no es de miles
    const decimales = s.length - ultimaComa - 1
    s = decimales <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimoPunto > -1) {
    const decimales = s.length - ultimoPunto - 1
    if (decimales > 2) s = s.replace(/\./g, '')
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negativoPorParentesis || negativoPorSigno ? -Math.abs(n) : n
}

/** Acepta dd/mm/yyyy, yyyy-mm-dd, dd-mm-yy y variantes. Devuelve yyyy-mm-dd. */
export function parsearFecha(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (dmy) {
    const [, d, m, yRaw] = dmy
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    const dd = Number(d)
    const mm = Number(m)
    // si el primer número no puede ser día, asumimos formato mm/dd
    if (dd > 31 || mm > 12) return null
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

/* ── Adivinar qué columna es cada cosa ──────────────────────────── */

const PISTAS: Record<string, string[]> = {
  fecha: ['fecha', 'date', 'dia', 'día', 'fecha operacion', 'fecha de operacion', 'periodo'],
  monto: ['monto', 'importe', 'amount', 'valor', 'total', 'debito', 'débito', 'credito', 'crédito'],
  descripcion: ['descripcion', 'descripción', 'detalle', 'concepto', 'comercio', 'description', 'referencia', 'motivo'],
  categoria: ['categoria', 'categoría', 'rubro', 'category', 'tipo'],
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Sugiere, para cada destino, el índice de columna más probable. */
export function sugerirMapeo(headers: string[]): Record<string, number> {
  const sug: Record<string, number> = {}
  const usados = new Set<number>()

  for (const [destino, pistas] of Object.entries(PISTAS)) {
    let mejorIdx = -1
    let mejorPuntaje = 0

    headers.forEach((h, i) => {
      if (usados.has(i)) return
      const hn = normalizar(h)
      for (const p of pistas) {
        const pn = normalizar(p)
        const puntaje = hn === pn ? 3 : hn.includes(pn) ? 2 : pn.includes(hn) && hn.length > 2 ? 1 : 0
        if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejorIdx = i }
      }
    })

    if (mejorIdx > -1) { sug[destino] = mejorIdx; usados.add(mejorIdx) }
  }
  return sug
}

export interface FilaPreview {
  fecha: string | null
  monto: number | null
  descripcion: string
  categoria: string
  valida: boolean
  motivo?: string
}

/** Aplica el mapeo a las filas crudas y marca cuáles no se pueden importar. */
export function construirPreview(
  tabla: TablaCruda,
  mapeo: Record<string, number>,
  invertirSigno: boolean
): FilaPreview[] {
  return tabla.filas.map(f => {
    const get = (k: string) => (mapeo[k] != null && mapeo[k] >= 0 ? (f[mapeo[k]] ?? '') : '')

    const fecha = parsearFecha(get('fecha'))
    let monto = parsearMonto(get('monto'))
    if (monto != null && invertirSigno) monto = -monto

    const descripcion = get('descripcion') || 'Sin descripción'
    const categoria = get('categoria') || 'varios'

    let motivo: string | undefined
    if (monto == null) motivo = 'sin monto legible'
    else if (monto === 0) motivo = 'monto en cero'

    return { fecha, monto, descripcion, categoria, valida: !motivo, motivo }
  })
}
