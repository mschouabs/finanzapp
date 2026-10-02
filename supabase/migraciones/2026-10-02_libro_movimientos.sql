-- Ya aplicada (2026-10-02). Libro de movimientos, etapa 1.
-- · tabla movimientos (solo lectura para el dueño; la escribe el trigger)
-- · trigger en inversiones: cada cambio de saldo queda anotado con su motivo
-- · ajustar_saldo_ctx(cuenta, delta, contexto): ajusta y anota el motivo
-- · transferir(...) y pagar_consumos(...): operaciones atómicas (todo o nada)
-- · vista movimientos_control: verifica que la suma del libro dé cada saldo
-- · punto de partida: una fila "apertura" por cuenta con el saldo del día

create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  cuenta_id uuid not null,
  fecha timestamptz not null default now(),
  tipo text not null default 'ajuste',
  delta numeric not null,
  saldo_resultante numeric not null,
  moneda text not null default 'ARS',
  descripcion text,
  origen_tabla text,
  origen_id uuid,
  grupo uuid,
  created_at timestamptz not null default now(),
  constraint movimientos_tipo_ok check (tipo in
    ('apertura','cierre','ajuste','gasto','ingreso','transferencia','inversion','pago_tarjeta','deshacer'))
);
create index if not exists movimientos_user_fecha on public.movimientos (user_id, fecha desc);
create index if not exists movimientos_cuenta_fecha on public.movimientos (cuenta_id, fecha desc);
create index if not exists movimientos_grupo on public.movimientos (grupo) where grupo is not null;
alter table public.movimientos enable row level security;
create policy "movimientos: dueño lee" on public.movimientos for select using (auth.uid() = user_id);

-- funciones: ver definiciones en la base (_ctx_movimiento, registrar_movimiento_cuenta,
-- ajustar_saldo_ctx, transferir, pagar_consumos) y la vista movimientos_control.
-- trigger: inversiones_movimientos (after insert / update of monto / delete).

-- Etapa 2 (ya aplicada): deshacer_movimiento(id) deshace transferencias (las dos
-- patas), ajustes manuales y gastos (borra el gasto y devuelve la plata), una sola vez.
-- grant select on movimientos / movimientos_control to authenticated.
