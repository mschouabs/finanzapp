-- ══ Ingresos fijos: "cobrado" pasa a ser de un mes ═══════════════
-- Antes monto_cobrado no se reiniciaba nunca. Esta columna guarda en
-- qué mes se registró el cobro; los meses siguientes vuelven a contar
-- el monto nominal hasta que registres el cobro nuevo.
-- La app ya está preparada: funciona con y sin esta columna.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar → Run.

alter table ingresos_fijos add column if not exists cobrado_mes text;

-- lo que ya estaba cargado como "cobrado" se toma como cobrado este mes
update ingresos_fijos
set cobrado_mes = to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM')
where monto_cobrado is not null and cobrado_mes is null;
