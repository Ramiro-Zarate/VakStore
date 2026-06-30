-- =============================================================
-- Fase 3.6: Tracking manual de envíos (Andreani / Correo Argentino)
-- =============================================================
-- Aplicar manualmente en Supabase Dashboard → SQL Editor.
-- Requisito previo: Fase 2 + Fase 3.5 aplicadas.
--
-- Esta migración:
--   1. Agrega columnas para guardar el carrier + número de tracking
--   2. Agrega timestamp shipped_at para distinguir órdenes despachadas
--   3. CHECK constraint sobre carrier
-- =============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS province text;

-- Constraint para carrier (solo valores conocidos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_carrier_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_carrier_check
      CHECK (carrier IS NULL OR carrier IN ('andreani', 'correo_argentino'));
  END IF;
END$$;

-- =============================================================
-- Notas para el operador:
-- =============================================================
-- • carrier: lo setea el admin en Supabase Dashboard cuando despacha
--   el paquete en la sucursal del carrier. Valores: 'andreani',
--   'correo_argentino'. NULL hasta que se despache.
-- • tracking_number: el número de guía que devuelve el carrier.
--   String libre. Si está NULL, el cliente todavía no ve tracking.
-- • shipped_at: timestamp del despacho. Se usa para mostrar el badge
--   "Enviado" en OrderTracking.
-- • phone: teléfono de contacto del cliente. Requerido en el form de
--   checkout (validado en Zod), pero NULL permitido en DB para
--   órdenes existentes pre-migración. Los carriers (Andreani, Correo
--   Argentino) lo usan para coordinar la entrega.
-- • province: jurisdicción de envío (1 de las 24 provincias + CABA).
--   Pre-seleccionada en el form desde el CP, pero siempre editable
--   por el cliente. NULL permitido para órdenes pre-migración.
-- • Las 5 columnas son opcionales (NULL permitido) para no romper
--   órdenes existentes. Las nuevas órdenes pasan validación Zod que
--   exige phone y province no vacíos.
-- • CHECK permite carrier NULL → no rompe órdenes pre-migración.
-- =============================================================
