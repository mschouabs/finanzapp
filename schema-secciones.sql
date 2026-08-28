-- ═══════════════════════════════════════════════════════════════
--  FinanzApp — Secciones dinámicas
--  Ejecutar completo en Supabase → SQL Editor → New query
--  Es idempotente: podés correrlo más de una vez sin romper nada.
-- ═══════════════════════════════════════════════════════════════

-- ── Tabla: secciones ────────────────────────────────────────────
create table if not exists public.secciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  emoji      text not null default '📁',
  tipo       text not null default 'neutra',
  plantilla  text,
  campos     jsonb not null default '[]'::jsonb,
  orden      integer not null default 0,
  created_at timestamptz not null default now()
);

-- tipo define si la sección suma al resumen y con qué signo
do $$ begin
  alter table public.secciones
    add constraint secciones_tipo_check
    check (tipo in ('ingreso', 'gasto', 'neutra'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.secciones
    add constraint secciones_nombre_no_vacio
    check (length(trim(nombre)) > 0);
exception when duplicate_object then null; end $$;

-- ── Tabla: registros de cada sección ────────────────────────────
create table if not exists public.seccion_registros (
  id         uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references public.secciones(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  datos      jsonb not null default '{}'::jsonb,
  monto      numeric(14,2),
  fecha      date,
  created_at timestamptz not null default now()
);

-- ── Índices ─────────────────────────────────────────────────────
create index if not exists secciones_user_orden_idx
  on public.secciones (user_id, orden, created_at);

create index if not exists seccion_registros_seccion_idx
  on public.seccion_registros (seccion_id, fecha desc);

create index if not exists seccion_registros_user_fecha_idx
  on public.seccion_registros (user_id, fecha);

-- ── Row Level Security ──────────────────────────────────────────
alter table public.secciones          enable row level security;
alter table public.seccion_registros  enable row level security;

drop policy if exists "secciones: dueño lee"     on public.secciones;
drop policy if exists "secciones: dueño crea"    on public.secciones;
drop policy if exists "secciones: dueño edita"   on public.secciones;
drop policy if exists "secciones: dueño borra"   on public.secciones;

create policy "secciones: dueño lee"
  on public.secciones for select
  using (auth.uid() = user_id);

create policy "secciones: dueño crea"
  on public.secciones for insert
  with check (auth.uid() = user_id);

create policy "secciones: dueño edita"
  on public.secciones for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "secciones: dueño borra"
  on public.secciones for delete
  using (auth.uid() = user_id);

drop policy if exists "registros: dueño lee"   on public.seccion_registros;
drop policy if exists "registros: dueño crea"  on public.seccion_registros;
drop policy if exists "registros: dueño edita" on public.seccion_registros;
drop policy if exists "registros: dueño borra" on public.seccion_registros;

create policy "registros: dueño lee"
  on public.seccion_registros for select
  using (auth.uid() = user_id);

create policy "registros: dueño crea"
  on public.seccion_registros for insert
  with check (auth.uid() = user_id);

create policy "registros: dueño edita"
  on public.seccion_registros for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "registros: dueño borra"
  on public.seccion_registros for delete
  using (auth.uid() = user_id);
