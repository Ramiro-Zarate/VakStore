-- =============================================================
-- Fase X: Motomensajería (CABA/GBA) + drop Andreani
-- =============================================================
-- Reemplaza el CHECK constraint de orders.carrier:
--   Antes:  'andreani' | 'correo_argentino'
--   Después: 'correo_argentino' | 'motomensajeria'
--
-- Procedimiento de aplicación (Supabase Dashboard → SQL Editor):
--   1. New query → pegar este SQL → Run
--   2. New query → NOTIFY pgrst, 'reload schema' → Run
--   3. Esperar 30 segundos
--   4. Verificar con la query de más abajo
-- =============================================================

-- 1. Defensivo: si hay órdenes viejas con carrier='andreani', nulificarlas
--    (no hay tracking URL alternativa; mejor dejarlas en null que con link roto)
UPDATE orders SET carrier = NULL WHERE carrier = 'andreani';

-- 2. Reemplazar el CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_carrier_check;
ALTER TABLE orders ADD CONSTRAINT orders_carrier_check
  CHECK (carrier IS NULL OR carrier IN ('correo_argentino', 'motomensajeria'));

-- 3. Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
