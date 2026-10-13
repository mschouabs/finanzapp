-- Ya aplicada en Supabase: diferencia suscripciones de gastos fijos
alter table gastos_fijos add column if not exists tipo text not null default 'fijo';
-- tipo: 'fijo' | 'suscripcion'
