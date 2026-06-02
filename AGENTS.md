# AGENTS.md — Vak Store

Guía operativa para el desarrollo del proyecto. Cubre arquitectura, decisiones
tomadas, convenciones y roadmap.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 6 (SSR via `@astrojs/vercel`) |
| UI islands | React 19 (`@astrojs/react`) |
| Auth + DB | Supabase (`@supabase/supabase-js`) |
| Pasarela de pagos | **Mercado Pago** (`mercadopago` SDK) |
| Validación | Zod |
| Email transaccional | **Resend** (free tier) |
| Despliegue | Vercel |
| Lenguaje | TypeScript (strict) |

Node: `>=22.12.0`.

---

## 2. Variables de entorno

| Variable | Scope | Uso |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | cliente + server | URL del proyecto Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | cliente + server | Cliente público de Supabase (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypass de RLS. Solo en `scripts/` y en endpoints `/api/*` server-side. **Nunca importar en código del cliente.** |
| `MP_ACCESS_TOKEN` | **server only** | Token privado de Mercado Pago |
| `MP_PUBLIC_KEY` | cliente | Llave pública (solo si se usa Bricks embebido) |
| `MP_WEBHOOK_SECRET` | **server only** | Secreto para validar firma de webhooks |
| `RESEND_API_KEY` | **server only** | API key de Resend |

**Reglas:**
- `PUBLIC_*` se exponen al cliente. Todo lo demás es server-only.
- `SUPABASE_SERVICE_ROLE_KEY` debe **nunca** aparecer en `src/lib/supabase.ts` ni en componentes. Solo en `src/lib/supabaseAdmin.ts` (server).
- `.env` está en `.gitignore`. Verificar con `git log --all --full-history -- .env` antes de cada release.

---

## 3. Arquitectura

```
src/
├── components/         # React + Astro components
├── hooks/              # Custom React hooks
├── layouts/            # Layout.astro (único)
├── lib/
│   ├── auth.ts         # Helpers de Supabase Auth
│   ├── supabase.ts     # Cliente anon (universal)
│   ├── supabaseAdmin.ts# Cliente service_role (server only)
│   ├── email.ts        # Wrapper de Resend
│   └── types.ts        # Tipos compartidos + Database
├── pages/
│   ├── api/            # Endpoints server-side
│   │   ├── checkout.ts
│   │   ├── webhooks/mercadopago.ts
│   │   ├── orders/[id].ts
│   │   └── products/...
│   ├── auth/           # Callbacks OAuth, verificación
│   ├── camisetas/      # Detalle de producto
│   ├── pedido/         # Tracking de pedido
│   └── *.astro         # Páginas públicas
├── stores/
│   ├── AuthStore.ts    # Singleton auth
│   └── CartStore.ts    # Singleton cart (localStorage)
└── styles/global.css   # Estilos globales
```

### Stores
- **CartStore:** singleton con patrón subscribe/getSnapshot. Persiste en localStorage con debounce. Fuente de verdad para la UI del carrito. La versión "real" la trae la DB al hacer checkout.
- **AuthStore:** singleton que envuelve Supabase Auth. Un solo `onAuthStateChange` para toda la app.

### Supabase RLS (asumido)
- `products`, `product_variants`: SELECT público con `is_active = true`. INSERT/UPDATE/DELETE solo service_role.
- `profiles`: SELECT/UPDATE solo `auth.uid() = id`.
- `orders`, `order_items`: todas las operaciones solo service_role. El cliente NUNCA escribe directo.
- `webhook_events`: solo service_role.

**Auditar policies en Supabase Dashboard antes de cada release.**

---

## 4. Decisiones de producto

| Decisión | Elegido | Por qué |
|---|---|---|
| Pasarela de pagos | **Mercado Pago** | Adopción AR, Rapipago/Pago Fácil, mejor para el mercado local |
| Tipo de checkout | **Checkout Pro (redirect)** | Menos código, MP maneja PCI. Migrar a Bricks si hace falta UX embebida |
| Stock | **Descontar al confirmar pago** (webhook `approved`) | Evita reservas muertas. RPC atómica `decrement_stock` evita oversell |
| Compras como invitado | **Sí**, con email | Mejor conversión. Tracking por id+email |
| Auth | Supabase Auth (email/pass + Google) | Ya implementado |
| Carrito | localStorage (Fase 1). DB persistente (Fase 4) | Suficiente para v1, mejorar después |
| Email transaccional | Resend free tier (3.000/mes) | $0 vs $25 de Supabase Pro. Auth usa Supabase default |

---

## 5. Flow de checkout (guest + Mercado Pago)

```
[CartDrawer] "Finalizar compra"
     ↓
[Checkout page] Form: email, nombre, dirección, ciudad, CP
     ↓
POST /api/checkout
  ├─ Validar body con Zod
  ├─ SELECT price, stock_quantity FROM product_variants WHERE id IN (...)
  ├─ Verificar stock_quantity >= quantity para todos
  ├─ INSERT order { status: 'pending', email, customer_name, total_amount, ... }
  ├─ INSERT order_items
  ├─ mercadopago.preferences.create({ items, payer, external_reference: orderId, back_urls, notification_url })
  └─ return { init_point, orderId }
     ↓
window.location = init_point
     ↓
Usuario paga en MP
     ↓
POST /api/webhooks/mercadopago
  ├─ Validar firma (HMAC con MP_WEBHOOK_SECRET)
  ├─ Idempotencia: INSERT en webhook_events con unique(provider, external_id). Si conflicto, 200 sin hacer nada.
  ├─ mercadopago.payment.findById(dataId)
  ├─ external_reference → orderId
  ├─ Si status='approved':
  │    ├─ UPDATE orders SET status='paid', payment_id, payment_status='approved'
  │    ├─ Por cada order_item: SELECT decrement_stock(variant_id, quantity)
  │    │    └─ Si RPC falla (oversell): UPDATE order status='cancelled', disparar refund
  │    └─ Encolar email "Pedido confirmado" (Resend)
  ├─ Si status='rejected'/'cancelled': UPDATE order status='cancelled'
  └─ return 200
     ↓
MP redirige a back_urls.success → /pedido/[orderId]
     ↓
[OrderTracking] Pide email → valida server-side en GET /api/orders/[id]
  (Endpoint usa service_role; valida id+email con comparación timing-safe)
```

---

## 6. Roadmap

### ✅ Fase 0 — RLS fix (cerrado)
- [x] Drop policies existentes (`Users can insert/view own orders`, etc.)
- [x] Recreate policies: `products`/`variants` público con `is_active=true`, `profiles` con `auth.uid()=id`, `cart_items` con `auth.uid()=user_id`
- [x] `orders` y `order_items`: sin policies = service_role only
- [x] Columna `is_featured` agregada a `products`

### ✅ Fase 1 — Quick wins (cerrado)
- [x] Verificar `.env` no está en git history
- [x] Crear `AGENTS.md`
- [x] Quitar `@import` duplicado de fonts + agregar `preconnect`
- [x] Mover filtros de productos al server con Supabase query
- [x] `loading="lazy"` + `decoding="async"` en todas las imágenes
- [x] `client:visible` en `ProductGrid` y `FilterSidebar`
- [x] Debounce del `saveToStorage` en `CartStore`
- [x] `Cache-Control` en `/api/products`
- [x] Headers de seguridad en `vercel.json`
- [x] Mover `OrderTracking` a endpoint server-side con id+email

### ✅ Fase 2 — Pasarela Mercado Pago (cerrado)
- [x] Schema: `orders.email`, `orders.customer_name`, `orders.payment_status`, tabla `webhook_events`
- [x] RPC `decrement_stock(p_variant_id uuid, p_qty int)` en Supabase
- [x] Instalar `mercadopago`, `zod`, `resend`
- [x] `POST /api/checkout` con validación Zod + preference
- [x] `POST /api/webhooks/mercadopago` con firma HMAC + idempotencia
- [x] UI `/checkout` con form de datos
- [x] Wire `CartDrawer.checkoutButton` → `/checkout`
- [x] Email confirmación con Resend
- [ ] Probar con sandbox MP (manual con `npm run dev` + ngrok)

### ⏳ Fase 3 — Robustez
- [ ] Paginación en catálogo
- [ ] Rate limiting (Upstash) en `/api/checkout` y auth
- [ ] Refund automático si oversell
- [ ] Sentry
- [ ] Tests Playwright del flow completo

### ⏳ Fase 4 — Escalar
- [ ] Imágenes en Supabase Storage + Image Optimization
- [ ] Búsqueda full-text
- [ ] Panel admin propio
- [ ] Carrito persistente en DB
- [ ] Bricks MP para checkout embebido

---

## 7. Convenciones de código

- **No agregar comentarios** salvo que el usuario lo pida.
- **TypeScript strict.** Tipos en `src/lib/types.ts` para entidades de DB.
- **Endpoints `/api/*`:** siempre `export const prerender = false`. Validar body con Zod. Errores con `Response` JSON y status code apropiado.
- **Componentes React:** preferir `client:visible` sobre `client:load` salvo que sea visible above-the-fold.
- **CSS Modules** para componentes React. CSS global solo en `src/pages/styles/global.css`.
- **Stores:** singletons con `subscribe` + `getSnapshot` para usar con `useSyncExternalStore` si migramos.
- **Supabase:** SIEMPRE filtrar `is_active = true` en queries públicas. Validar stock en server, nunca confiar en el cliente.
- **Secrets:** nunca loggear keys, tokens o passwords. Sanitizar errores antes de devolver al cliente.

---

## 8. Comandos

```bash
npm run dev          # dev server
npm run build        # build de producción
npm run preview      # preview local del build
npm run seed         # sembrar DB desde scripts/data/stock.xlsx (requiere service_role)
npm run create-sample# generar scripts/data/stock-sample.xlsx de ejemplo
```
