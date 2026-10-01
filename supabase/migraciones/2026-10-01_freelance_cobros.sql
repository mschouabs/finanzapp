-- Ya aplicada. Cobros parciales de proyectos freelance, para contar cada cobro en su mes.
alter table public.ingresos_freelance add column if not exists cobros jsonb not null default '[]'::jsonb;
