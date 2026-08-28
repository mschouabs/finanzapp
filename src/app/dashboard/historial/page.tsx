'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Movimiento {
  id: string
  tipo: 'ingreso-fijo' | 'ingreso-freelance' | 'gasto-fijo' | 'gasto-variable'
  descripcion: string
  monto: number
  fecha: string
  categoria?: string
}

const tipoLabel: Record<string, string> = {
  'ingreso-fijo': 'Ingreso fijo',
  'ingreso-freelance': 'Freelance',
  'gasto-fijo': 'Gasto fijo',
  'gasto-variable': 'Gasto variable',
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0 })

const formatDate = (d: string) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default function HistorialPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  useEffect(() => {
    cargarMovimientos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarMovimientos() {
    setLoading(true)
    const supabase = createClient()

    const [{ data: gv }, { data: gf }, { data: iff }, { data: inf }] =
      await Promise.all([
        supabase.from('gastos_variables').select('*'),
        supabase.from('gastos_fijos').select('*'),
        supabase.from('ingresos_fijos').select('*'),
        supabase.from('ingresos_freelance').select('*'),
      ])

    const todos: Movimiento[] = [
      ...(gv || []).map((r: Record<string, unknown>) => ({
        id: 'gv-' + r.id,
        tipo: 'gasto-variable' as const,
        descripcion: (r.nombre as string) || (r.descripcion as string) || '',
        monto: r.monto as number,
        fecha: (r.fecha as string) || ((r.created_at as string) ?? '').split('T')[0],
        categoria: r.categoria as string | undefined,
      })),
      ...(gf || []).map((r: Record<string, unknown>) => ({
        id: 'gf-' + r.id,
        tipo: 'gasto-fijo' as const,
        descripcion: (r.nombre as string) || '',
        monto: r.monto as number,
        fecha: ((r.created_at as string) ?? '').split('T')[0],
        categoria: 'Fijo',
      })),
      ...(iff || []).map((r: Record<string, unknown>) => ({
        id: 'iff-' + r.id,
        tipo: 'ingreso-fijo' as const,
        descripcion: (r.nombre as string) || (r.descripcion as string) || '',
        monto: ((r.monto_cobrado as number) ?? (r.monto as number)) || 0,
        fecha: ((r.created_at as string) ?? '').split('T')[0],
        categoria: 'Ingreso fijo',
      })),
      ...(inf || []).map((r: Record<string, unknown>) => ({
        id: 'inf-' + r.id,
        tipo: 'ingreso-freelance' as const,
        descripcion: (r.descripcion as string) || (r.cliente as string) || '',
        monto: ((r.monto_cobrado as number) ?? (r.monto_total as number) ?? (r.monto as number)) || 0,
        fecha: (r.fecha as string) || ((r.created_at as string) ?? '').split('T')[0],
        categoria: 'Freelance',
      })),
    ]

    todos.sort((a, b) => b.fecha.localeCompare(a.fecha))
    setMovimientos(todos)
    setLoading(false)
  }

  const filtrados = movimientos.filter((m) => {
    if (filtroTipo !== 'todos' && !m.tipo.includes(filtroTipo)) return false
    if (busqueda && !m.descripcion.toLowerCase().includes(busqueda.toLowerCase()))
      return false
    if (fechaDesde && m.fecha < fechaDesde) return false
    if (fechaHasta && m.fecha > fechaHasta) return false
    return true
  })

  const totalIngresos = filtrados
    .filter((m) => m.tipo.startsWith('ingreso'))
    .reduce((s, m) => s + m.monto, 0)
  const totalGastos = filtrados
    .filter((m) => m.tipo.startsWith('gasto'))
    .reduce((s, m) => s + m.monto, 0)

  function exportarCSV() {
    const headers = ['Fecha', 'Tipo', 'Descripcion', 'Categoria', 'Monto']
    const rows = filtrados.map((m) => [
      m.fecha,
      tipoLabel[m.tipo] || m.tipo,
      m.descripcion.replace(/"/g, '""'),
      (m.categoria || '').replace(/"/g, '""'),
      m.monto.toString(),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historial-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setBusqueda('')
    setFiltroTipo('todos')
    setFechaDesde('')
    setFechaHasta('')
  }

  const hasFilters = busqueda || filtroTipo !== 'todos' || fechaDesde || fechaHasta

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '0.5px solid var(--border-color)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            📋 Historial
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              margin: '4px 0 0',
              fontSize: 14,
            }}
          >
            Todos tus movimientos financieros
          </p>
        </div>
        <button
          onClick={exportarCSV}
          style={{
            background: 'var(--accent-confirm)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 18px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ↓ Exportar CSV
        </button>
      </div>

      {/* KPI summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
        }}
      >
        {[
          {
            label: 'Total registros',
            val: filtrados.length.toString(),
            color: 'var(--text-primary)',
          },
          {
            label: 'Ingresos',
            val: fmt(totalIngresos),
            color: 'var(--accent-positive)',
          },
          {
            label: 'Gastos',
            val: fmt(totalGastos),
            color: 'var(--accent-negative)',
          },
          {
            label: 'Neto',
            val: fmt(totalIngresos - totalGastos),
            color:
              totalIngresos - totalGastos >= 0
                ? 'var(--accent-positive)'
                : 'var(--accent-negative)',
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
            }}
          >
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 12,
                margin: '0 0 6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {k.label}
            </p>
            <p
              style={{
                color: k.color,
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                fontFamily: 'Courier New, monospace',
              }}
            >
              {k.val}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: 16,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Buscar descripción..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          style={inputStyle}
        >
          <option value="todos">Todos los tipos</option>
          <option value="ingreso">Solo ingresos</option>
          <option value="gasto">Solo gastos</option>
          <option value="ingreso-fijo">Ingreso fijo</option>
          <option value="ingreso-freelance">Freelance</option>
          <option value="gasto-fijo">Gasto fijo</option>
          <option value="gasto-variable">Gasto variable</option>
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          style={inputStyle}
          title="Desde"
        />
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          style={inputStyle}
          title="Hasta"
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: 'none',
              border: '0.5px solid var(--border-color)',
              color: 'var(--text-secondary)',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}
          >
            Cargando movimientos...
          </div>
        ) : filtrados.length === 0 ? (
          <div
            style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}
          >
            {movimientos.length === 0
              ? 'No hay movimientos registrados'
              : 'Sin resultados para los filtros aplicados'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border-color)' }}>
                  {['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Monto'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 16px',
                          textAlign: h === 'Monto' ? 'right' : 'left',
                          color: 'var(--text-secondary)',
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m, i) => {
                  const esIngreso = m.tipo.startsWith('ingreso')
                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '0.5px solid var(--border-color)',
                        background:
                          i % 2 === 0
                            ? 'transparent'
                            : 'rgba(128,128,128,0.02)',
                      }}
                    >
                      <td
                        style={{
                          padding: '11px 16px',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(m.fecha)}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span
                          style={{
                            background: esIngreso
                              ? 'rgba(63,185,80,0.12)'
                              : 'rgba(255,123,114,0.12)',
                            color: esIngreso
                              ? 'var(--accent-positive)'
                              : 'var(--accent-negative)',
                            padding: '3px 10px',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tipoLabel[m.tipo] || m.tipo}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '11px 16px',
                          color: 'var(--text-primary)',
                          fontSize: 14,
                        }}
                      >
                        {m.descripcion || '—'}
                      </td>
                      <td
                        style={{
                          padding: '11px 16px',
                          color: 'var(--text-secondary)',
                          fontSize: 13,
                        }}
                      >
                        {m.categoria || '—'}
                      </td>
                      <td
                        style={{
                          padding: '11px 16px',
                          textAlign: 'right',
                          color: esIngreso
                            ? 'var(--accent-positive)'
                            : 'var(--accent-negative)',
                          fontFamily: 'Courier New, monospace',
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {esIngreso ? '+' : '-'}
                        {fmt(m.monto)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtrados.length > 0 && (
          <div
            style={{
              padding: '10px 16px',
              color: 'var(--text-muted)',
              fontSize: 12,
              borderTop: '0.5px solid var(--border-color)',
            }}
          >
            {filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}
            {hasFilters ? ' (filtrado)' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
