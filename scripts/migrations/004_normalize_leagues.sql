-- =============================================================
-- Fase 3.8: Normalización de ligas en product_variants
-- =============================================================
-- Aplicar manualmente en Supabase Dashboard → SQL Editor.
-- Requisito previo: Fases 0–3.7 aplicadas.
--
-- Esta migración:
--   1. Normaliza typos en product_variants.league
--   2. Documenta la convención de categorías en products.category
-- =============================================================

-- 1a. Typo en DB: 'Seleccioones' (3 oes) → 'Selecciones'
UPDATE product_variants
SET league = 'Selecciones'
WHERE league = 'Seleccioones';

-- 1b. Typo en DB: 'Premier' (sin 'League') → 'Premier League'
UPDATE product_variants
SET league = 'Premier League'
WHERE league = 'Premier';

-- =============================================================
-- Notas para el operador:
-- =============================================================
-- • Aplicado manualmente el 2026-07-01 durante la sesión de
--   "Single source of truth en filtros" (Fase 3.8).
-- • Después de aplicar, correr:
--     NOTIFY pgrst, 'reload schema';
--   Y esperar 30s antes de testear.
-- • Verificar con:
--     SELECT DISTINCT league FROM product_variants ORDER BY league;
--   Debe devolver 6 valores limpios:
--     Bundesliga, La Liga, Liga Italiana, Ligue 1,
--     Premier League, Selecciones
-- =============================================================
-- Convención de categorías (products.category):
-- =============================================================
-- • Usar SIEMPRE plurales desde el día 1:
--     'camisetas', 'shorts', 'camperas'
-- • NO usar singulares: 'camiseta', 'short', 'campera'.
-- • El seed (scripts/seed.ts:20-24) tiene un categoryMap
--   que mapea singular→plural, pero el Excel de stock
--   debería venir con plurales directamente.
-- • Si en el futuro se cargan productos con category
--   en singular, aplicar:
--     UPDATE products SET category='shorts' WHERE category='short';
--     UPDATE products SET category='camperas' WHERE category='campera';
--   (No se aplica ahora porque no hay filas activas con
--   esos valores al momento de la migración.)
