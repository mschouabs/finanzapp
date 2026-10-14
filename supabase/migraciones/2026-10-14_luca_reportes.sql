-- Ya aplicada en Supabase: reportes de problemas que Luca guarda para revisión
create table if not exists luca_reportes (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), resumen text not null, detalle text, contexto text, estado text not null default 'nuevo', created_at timestamptz not null default now());
alter table luca_reportes enable row level security;
create policy "propios reportes" on luca_reportes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
