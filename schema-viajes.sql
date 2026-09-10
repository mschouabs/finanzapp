-- ═══════════════════════════════════════════════════════════════
--  FinanzApp — Sección Viajes
--  Ejecutar completo en Supabase → SQL Editor → New query
--  Es idempotente: podés correrlo más de una vez sin romper nada.
-- ═══════════════════════════════════════════════════════════════

-- ── Tabla: viajes ───────────────────────────────────────────────
create table if not exists public.viajes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  nombre       text not null,
  emoji        text not null default '✈️',
  destino      text,
  fecha_inicio date,
  fecha_fin    date,
  -- El presupuesto se guarda siempre en ARS para poder compararlo
  -- contra la suma de gastos, que también se normaliza a ARS.
  presupuesto  numeric(14,2),
  notas        text,
  archivado    boolean not null default false,
  created_at   timestamptz not null default now()
);

do $$ begin
  alter table public.viajes
    add constraint viajes_nombre_no_vacio
    check (length(trim(nombre)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.viajes
    add constraint viajes_fechas_ordenadas
    check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio);
exception when duplicate_object then null; end $$;

-- ── Tabla: gastos de cada viaje ─────────────────────────────────
--  monto  → importe en la moneda en que se pagó
--  moneda → código ISO de esa moneda
--  tipo_cambio → cuántos ARS vale 1 unidad de `moneda` (ARS ⇒ 1)
--  monto_ars → columna generada: el equivalente en pesos. Se calcula
--              en la base para que nunca quede desincronizado y para
--              que el dashboard pueda sumar sin convertir en el cliente.
create table if not exists public.viaje_gastos (
  id          uuid primary key default gen_random_uuid(),
  viaje_id    uuid not null references public.viajes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  concepto    text not null,
  categoria   text not null default 'varios',
  monto       numeric(14,2) not null,
  moneda      text not null default 'ARS',
  tipo_cambio numeric(14,6) not null default 1,
  monto_ars   numeric(16,2) generated always as (monto * tipo_cambio) stored,
  fecha       date not null default current_date,
  notas       text,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.viaje_gastos
    add constraint viaje_gastos_tipo_cambio_positivo
    check (tipo_cambio > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.viaje_gastos
    add constraint viaje_gastos_concepto_no_vacio
    check (length(trim(concepto)) > 0);
exception when duplicate_object then null; end $$;

-- ── Índices ─────────────────────────────────────────────────────
create index if not exists viajes_user_idx
  on public.viajes (user_id, archivado, fecha_inicio desc nulls last);

create index if not exists viaje_gastos_viaje_idx
  on public.viaje_gastos (viaje_id, fecha desc);

-- El dashboard filtra por usuario y rango de fechas: este índice es
-- el que sostiene esa consulta mensual.
create index if not exists viaje_gastos_user_fecha_idx
  on public.viaje_gastos (user_id, fecha);

-- ── Row Level Security ──────────────────────────────────────────
alter table public.viajes        enable row level security;
alter table public.viaje_gastos  enable row level security;

drop policy if exists "viajes: dueño lee"   on public.viajes;
drop policy if exists "viajes: dueño crea"  on public.viajes;
drop policy if exists "viajes: dueño edita" on public.viajes;
drop policy if exists "viajes: dueño borra" on public.viajes;

create policy "viajes: dueño lee"
  on public.viajes for select
  using (auth.uid() = user_id);

create policy "viajes: dueño crea"
  on public.viajes for insert
  with check (auth.uid() = user_id);

create policy "viajes: dueño edita"
  on public.viajes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "viajes: dueño borra"
  on public.viajes for delete
  using (auth.uid() = user_id);

drop policy if exists "viaje_gastos: dueño lee"   on public.viaje_gastos;
drop policy if exists "viaje_gastos: dueño crea"  on public.viaje_gastos;
drop policy if exists "viaje_gastos: dueño edita" on public.viaje_gastos;
drop policy if exists "viaje_gastos: dueño borra" on public.viaje_gastos;

create policy "viaje_gastos: dueño lee"
  on public.viaje_gastos for select
  using (auth.uid() = user_id);

create policy "viaje_gastos: dueño crea"
  on public.viaje_gastos for insert
  with check (auth.uid() = user_id);

create policy "viaje_gastos: dueño edita"
  on public.viaje_gastos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "viaje_gastos: dueño borra"
  on public.viaje_gastos for delete
  using (auth.uid() = user_id);
