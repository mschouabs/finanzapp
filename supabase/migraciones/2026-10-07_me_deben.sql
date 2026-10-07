-- Ya aplicada. Plata que otras personas te deben (por ejemplo, la parte de un Airbnb).
create table if not exists public.me_deben (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  persona text not null,
  concepto text not null default '',
  monto numeric not null check (monto > 0),
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  cobrado numeric not null default 0 check (cobrado >= 0),
  fecha date not null default current_date,
  vence date,
  nota text,
  created_at timestamptz not null default now()
);
alter table public.me_deben enable row level security;
create policy "me_deben: dueño" on public.me_deben for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.me_deben to authenticated;
revoke all on public.me_deben from anon;
create index if not exists me_deben_user_idx on public.me_deben (user_id, fecha desc);
