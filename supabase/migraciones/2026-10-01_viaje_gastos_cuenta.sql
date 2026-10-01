-- Ya aplicada. Cuenta de la que salió cada gasto de viaje (para descontar y devolver el saldo).
alter table public.viaje_gastos add column if not exists billetera_linea_id uuid;
alter table public.viaje_gastos add column if not exists monto_descontado numeric;
