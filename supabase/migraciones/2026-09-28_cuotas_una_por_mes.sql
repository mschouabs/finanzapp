-- ══ Cuotas: una por mes desde la compra ══════════════════════════
-- Antes, la 1ª cuota quedaba con la fecha de compra y las siguientes
-- con el vencimiento de su resumen, y eso dejaba un mes sin cuota
-- (ej: compra del 5/9 con Naranja → sep, [oct vacío], nov, dic...).
-- Esto reescribe SOLO la fecha de las cuotas 2 en adelante de cada
-- compra: la primera cuota cargada queda igual y cada siguiente pasa
-- a ser "misma fecha, un mes después". No toca montos, pagos ni el
-- resumen (que es lo que define cuándo se paga cada cuota).
--
-- Cómo correrlo: Supabase → SQL Editor → pegar → Run.
-- Primero podés correr solo el SELECT de abajo para ver qué cambia.

-- Vista previa (no modifica nada):
with base as (
  select compra_id, min(cuota_numero) as primera
  from gastos_variables
  where compra_id is not null and cuotas_total > 1
  group by compra_id
), inicio as (
  select g.compra_id, b.primera, g.fecha as fecha_primera
  from gastos_variables g join base b on b.compra_id = g.compra_id and g.cuota_numero = b.primera
)
select g.id, g.nombre, g.cuota_numero, g.cuotas_total, g.fecha as fecha_actual,
       (i.fecha_primera + make_interval(months => g.cuota_numero - i.primera))::date as fecha_nueva
from gastos_variables g join inicio i on i.compra_id = g.compra_id
where g.cuota_numero > i.primera
order by g.compra_id, g.cuota_numero;

-- Aplicar el cambio:
with base as (
  select compra_id, min(cuota_numero) as primera
  from gastos_variables
  where compra_id is not null and cuotas_total > 1
  group by compra_id
), inicio as (
  select g.compra_id, b.primera, g.fecha as fecha_primera
  from gastos_variables g join base b on b.compra_id = g.compra_id and g.cuota_numero = b.primera
)
update gastos_variables g
set fecha = (i.fecha_primera + make_interval(months => g.cuota_numero - i.primera))::date
from inicio i
where i.compra_id = g.compra_id and g.cuota_numero > i.primera;
