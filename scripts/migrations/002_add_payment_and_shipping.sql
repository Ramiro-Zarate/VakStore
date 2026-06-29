-- =============================================================
-- Fase 3.5: Pago por transferencia + métodos de envío
-- =============================================================
-- Aplicar manualmente en Supabase Dashboard → SQL Editor.
-- Requisito previo: Fase 0 (RLS) cerrada, tabla `orders` con
-- la estructura base de Fase 2 (email, customer_name, payment_status, etc.)
--
-- Esta migración:
--   1. Agrega columnas nuevas a `orders`
--   2. Crea la tabla `shipping_methods` (catálogo)
--   3. Inserta el seed inicial con un método único: 'nacional' a $5000
--   4. Crea un índice para la query del cron de auto-cancel
-- =============================================================

-- 1. Columnas nuevas en `orders`
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mercadopago',
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric,
  ADD COLUMN IF NOT EXISTS bank_info_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS transfer_expires_at timestamptz;

-- Constraint para payment_method (mercadopago | transfer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('mercadopago', 'transfer'));
  END IF;
END$$;

-- 2. Tabla `shipping_methods` (catálogo de métodos de envío)
CREATE TABLE IF NOT EXISTS shipping_methods (
  id text PRIMARY KEY,
  name text NOT NULL,
  base_cost numeric NOT NULL CHECK (base_cost >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed inicial: un método único a $5000 fijo
INSERT INTO shipping_methods (id, name, base_cost, is_active)
VALUES ('nacional', 'Envío a todo el país', 5000, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_cost = EXCLUDED.base_cost,
  is_active = EXCLUDED.is_active;

-- 4. Índice para la query del cron de auto-cancel
--    (busca órdenes awaiting_payment con transfer_expires_at < now())
CREATE INDEX IF NOT EXISTS idx_orders_transfer_expires
  ON orders (transfer_expires_at)
  WHERE status = 'awaiting_payment' AND transfer_expires_at IS NOT NULL;

-- =============================================================
-- Notas para el operador:
-- =============================================================
-- • payment_method: 'mercadopago' por default (backfill implícito con DEFAULT).
--   Las órdenes existentes quedan como 'mercadopago' sin tocarlas.
-- • shipping_method: nullable. Para órdenes MP existentes queda NULL (no rompemos
--   nada, los pedidos viejos no tenían envío modelado).
-- • bank_info_snapshot: jsonb con { alias, cbu, holder, cuit } al momento de la
--   orden. Permite auditar qué datos se le mostraron al cliente.
-- • transfer_expires_at: solo poblado en órdenes transfer. Las MP quedan NULL.
-- • shipping_methods se lee server-side desde el checkout API. No hay endpoint
--   público por ahora; si el catálogo crece, agregar en /api/shipping.
-- =============================================================
