-- Avisos con la app cerrada (Web Push). Correr una vez en Supabase → SQL Editor.
-- No toca ninguna tabla existente.

-- Dónde mandarle los avisos a cada celular / navegador
create table if not exists push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  ultimo_envio timestamptz
);
alter table push_suscripciones enable row level security;
create policy "propias suscripciones" on push_suscripciones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Avisos ya mandados (para no repetir los de presupuesto). Solo la usa el servidor.
create table if not exists push_enviados (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null,
  enviado timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table push_enviados enable row level security;
