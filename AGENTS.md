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

| Variable | Scope | Uso | Estado |
|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | cliente + server | URL del proyecto Supabase | Requerida |
| `PUBLIC_SUPABASE_ANON_KEY` | cliente + server | Cliente público de Supabase (anon) | Requerida |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypass de RLS. Solo en `scripts/` y en endpoints `/api/*` server-side. **Nunca importar en código del cliente.** | Requerida |
| `MP_ACCESS_TOKEN` | **server only** | Token privado de Mercado Pago | Requerida (test o prod) |
| `MP_WEBHOOK_SECRET` | **server only** | Secreto para validar firma de webhooks | Requerida si `MP_MOCK_MODE` está desactivado |
| `MP_MOCK_MODE` | server | `true` = simular pago sin llamar a MP. `false` o vacío = flow real. | Opcional, default `false` |
| `PUBLIC_SITE_URL` | server | URL base para back_urls de MP y redirects del checkout. | Requerida |
| `RESEND_API_KEY` | **server only** | API key de Resend | Opcional, sin esto emails se loggean |
| `RESEND_FROM_EMAIL` | server | Email del sender (ej. `onboarding@resend.dev`) | Opcional, default `onboarding@resend.dev` |
| `UPSTASH_REDIS_REST_URL` | server | Rate limiting (Upstash) | Opcional, sin esto el rate limit deja pasar |
| `UPSTASH_REDIS_REST_TOKEN` | server | Rate limiting (Upstash) | Opcional |
| `SENTRY_DSN` | server | Captura de errores en producción | Opcional, sin esto Sentry se desactiva |
| `SENTRY_AUTH_TOKEN` | server | Auth token para subir source maps a Sentry | Opcional, solo para CI |

**Reglas:**
- `PUBLIC_*` se exponen al cliente. Todo lo demás es server-only.
- `SUPABASE_SERVICE_ROLE_KEY` debe **nunca** aparecer en `src/lib/supabase.ts` ni en componentes. Solo en `src/lib/supabaseAdmin.ts` (server).
- `.env` está en `.gitignore`. Verificar con `git log --all --full-history -- .env` antes de cada release.
- Los servicios opcionales (Upstash, Sentry, Resend) funcionan con configuración parcial: si falta la env var, el código degrada con un warning, no rompe.

---

## 3. Arquitectura

```
src/
├── components/         # React + Astro components
├── hooks/              # Custom React hooks
├── layouts/            # Layout.astro (único)
├── lib/
│   ├── auth.ts              # Helpers de Supabase Auth
│   ├── supabase.ts          # Cliente anon (universal)
│   ├── supabaseAdmin.ts     # Cliente service_role (server only, lazy init)
│   ├── mp.ts                # SDK Mercado Pago (server only, lazy init)
│   ├── email.ts             # Wrapper de Resend
│   ├── orderProcessing.ts   # Lógica de "pago aprobado" compartida
│   ├── rateLimit.ts         # Rate limiting con Upstash (degrada si no hay config)
│   ├── checkoutSchema.ts    # Zod schemas
│   └── types.ts             # Tipos compartidos + Database
├── pages/
│   ├── api/            # Endpoints server-side
│   │   ├── checkout.ts
│   │   ├── webhooks/mercadopago.ts
│   │   ├── orders/[id].ts
│   │   └── products/...
│   ├── auth/           # Callbacks OAuth, verificación
│   ├── camisetas/      # Detalle de producto
│   ├── checkout.astro  # Form de checkout
│   ├── pedido/         # Tracking de pedido
│   └── *.astro         # Páginas públicas
├── stores/
│   ├── AuthStore.ts    # Singleton auth
│   └── CartStore.ts    # Singleton cart (localStorage con debounce)
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
  ├─ Validar firma con `WebhookSignatureValidator` (SDK v3, HMAC, tolerance 5min)
  ├─ Idempotencia: INSERT en webhook_events con unique(provider, external_id). Si conflicto, 200 sin hacer nada.
  ├─ mercadopago.payment.findById(dataId)
  ├─ external_reference → orderId
  ├─ Si status='approved':
  │    ├─ Por cada order_item: SELECT decrement_stock(variant_id, quantity)
  │    │    └─ Si RPC falla (oversell):
  │    │         ├─ UPDATE orders SET status='cancelled', payment_status='rejected', payment_intent_id=paymentId
  │    │         ├─ MP refund total vía PaymentRefund.total({ payment_id })
  │    │         └─ Email "Pedido cancelado" (Resend) — con nota de reembolso si el refund salió bien
  │    ├─ UPDATE orders SET status='paid', payment_id, payment_status='approved'
  │    └─ Email "Pedido confirmado" (Resend)
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
- [x] **Lazy init** de `mp.ts` y `supabaseAdmin.ts` (fix del build de Vercel con env vars no-PUBLIC)

### ✅ Fase 2 — Pasarela Mercado Pago (cerrado en código)
- [x] Schema: `orders.email`, `orders.customer_name`, `orders.payment_status`, tabla `webhook_events`
- [x] RPC `decrement_stock(p_variant_id uuid, p_qty int)` en Supabase
- [x] Instalar `mercadopago`, `zod`, `resend`
- [x] `POST /api/checkout` con validación Zod + preference
- [x] `POST /api/webhooks/mercadopago` con firma HMAC + idempotencia
- [x] UI `/checkout` con form de datos
- [x] Wire `CartDrawer.checkoutButton` → `/checkout`
- [x] Email confirmación con Resend
- [x] Paginación del catálogo (12 productos por página)
- [x] Rate limiting con Upstash en `/api/checkout` y `/api/orders/[id]`
- [x] Sentry setup (placeholder, se activa con `SENTRY_DSN` en Vercel)
- [x] **Mock mode de MP** (`MP_MOCK_MODE=true`) para testear sin cuenta MP verificada
- [x] Probar con sandbox MP real (pendiente de cuenta MP, ver Fase 2.5)

### ✅ Fase 2.5 — Fixes finales de MP (cerrado)
- [x] Fix typo `MP_ACCES_TOKEN` → `MP_ACCESS_TOKEN` en `.env`
- [x] Webhook firma: migrar de `verifySignature` custom a `WebhookSignatureValidator` oficial de la SDK v3 (dataId del query, tolerance 5min, anti-replay)
- [x] Eliminar import muerto de `node:crypto` en `src/pages/api/webhooks/mercadopago.ts`
- [ ] Validar flow E2E con tarjeta sandbox APRO (`MP_MOCK_MODE=false` + token TEST) — bloqueado por cuenta MP al 50% de onboarding

### ⏳ Fase 3 — Robustez (pendiente)
> **Orden de ejecución sugerido** (por dependencia):
> 1. **Tests Playwright E2E** — habilita validar los demás cambios sin romper prod. Asume Fase 2.5 mergeada.
> 2. **Refund automático por oversell** — depende de los tests para validar el path de error.
> 3. **Upstash + Sentry con keys reales** — independiente de MP.
> 4. **MP onboarding 80%+ y sacar mock mode** — depende de soporte externo de MP. Cuando esto pase, rotar `MP_ACCESS_TOKEN` a producción y setear `MP_MOCK_MODE=false`.
- [x] Refund automático si oversell (vía `PaymentRefund.total({ payment_id })` + email cancelación + Sentry)
- [x] **Idempotencia funcional en `processApprovedPayment`**: early-return si la orden ya está en estado terminal (`paid`/`delivered`). Previene doble decrement de stock cuando MP re-envía webhooks `approved` con `dataId` distinto.
- [ ] Tests Playwright del flow completo
- [ ] Configurar cuentas de Upstash y Sentry con keys reales
- [ ] Completar onboarding de MP al 80%+ y sacar mock mode

**Deuda técnica conocida:** si `refundPayment()` falla y la webhook de MP reintenta, la tabla `webhook_events` bloquea el reprocesamiento y el refund queda pendiente. Solución actual: log + Sentry para detección. Solución futura: agregar columna `refund_status` en `orders` y mover el chequeo de idempotencia a después del refund.

### 🐛 Bugs pendientes (audit post-compra 2026-06-09)

Diagnóstico completo en `/audit/post-compra-2026-06-09.md` (en este mismo repo). Resumen priorizado:

#### 🔴 Alta prioridad (afectan directamente al cliente)
- [x] **1.5** — Validar `customerEmail` antes de `sendOrderConfirmationEmail` y `sendOrderCancelledEmail` (string vacío → Resend falla silenciosamente). Aplicado en `src/lib/email.ts:90-117` y `:145-172`.
- [x] **2.3** — Validar `dataId` con regex `/^\d+$/` antes de `payment.get()` (webhooks de prueba de MP con id `"0"` o vacío → 500). Aplicado en `src/pages/api/webhooks/mercadopago.ts:208-220`.
- [ ] **1.4** — *Descartado.* El bug solo afectaba mock mode (string `MOCK-` rompe MP SDK), no producción real. En prod MP siempre envía IDs numéricos.

#### 🟡 Media prioridad (afectan a producción con volumen)
- [ ] **2.1** — Sanitizar `body` con `JSON.parse(JSON.stringify(body))` antes de insertar en `webhook_events.payload` (evita 500 por valores no-serializables)
- [ ] **1.1** — Loggear `paymentId` previo al refund para detectar reintentos con `dataId` distinto
- [ ] **2.5** — Whitelist de `payment_status` válidos en `markOrderCancelled` (mapear status de MP a enum controlada)

#### 🟢 Baja prioridad (mantenibilidad / deuda técnica)
- [ ] **2.4** — Sentry alert explícito cuando `result.refundStatus === 'failed'`
- [ ] **3.1** — Cambiar `Order.payment_status` de `string | null` a union literal con status válidos
- [ ] **3.2** — `supabase db pull` para versionar schema SQL en repo
- [ ] **3.3** — Check `rpcData == null || rpcData === 0` en `decrement_stock` (evita interpretar `null` como éxito)
- [ ] **3.4** — Regenerar tipos con `supabase gen types typescript` (resuelve el bug de `astro check` con SDK 2.106+)

**Orden de ejecución sugerido:** ~~1.4+1.5+2.3~~ (1.5 y 2.3 aplicados, 1.4 descartado) → 2.1+2.5+1.1 (commit batch producción) → 2.4+3.1+3.3 (commit batch tipos) → 3.2+3.4 (commit batch infra).

### ⏳ Fase 4 — Escalar (cuando duela)
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

---

## 9. Mock mode de Mercado Pago

Para testear el flow completo sin necesidad de tener la cuenta de MP al 80%:

- Setear `MP_MOCK_MODE=true` en Vercel (o localmente en `.env`)
- El endpoint `/api/checkout` NO llama a MP
- Simula el pago aprobado en línea: decrementa stock, manda email, marca order como `paid`
- Redirige al usuario directo a `/pedido/[id]`

**Para volver al flow real:** setear `MP_MOCK_MODE=false` o borrar la env var.

`MP_MOCK_MODE` queda como **fallback opcional** (no dependencia) desde Fase 2.5.

---

## 10. Estado actual de Mercado Pago

- ✅ Código completo: SDK v3, preference, webhook con `WebhookSignatureValidator` oficial + idempotencia
- ✅ Webhook configurado en panel de MP (URL de producción)
- ✅ Refund automático por oversell implementado (`PaymentRefund.total()`)
- ✅ Sentry captura de errores en webhook, checkout y orderProcessing
- ✅ Estructura final lista (Fase 2.5 + Fase 3 refund): typo fixed, webhook validado, refund cableado
- ⚠️ Cuenta de vendedor MP al ~50% de integración — completar "verificación de cobro" + datos del titular
- ⚠️ Test users se crean sin email (bug de MP en esta cuenta)
- 🛠 `MP_MOCK_MODE` no está en Vercel → corre flow real contra sandbox
- 📞 Pendiente: validar flow E2E con tarjeta sandbox APRO + completar onboarding al 80%+ para sacar mock definitivamente

---

## 11. Setup para producción (cuando MP esté destrabado)

1. Crear cuenta en [upstash.com](https://upstash.com), crear Redis DB, pegar:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
2. Crear proyecto en [sentry.io](https://sentry.io), copiar DSN:
   - `SENTRY_DSN`
   - Opcional: `SENTRY_AUTH_TOKEN` para subir source maps
3. Completar onboarding de MP al 80%+
4. Cambiar `MP_ACCESS_TOKEN` de TEST a PRODUCCIÓN
5. Setear `MP_MOCK_MODE=false` o borrar la env var
6. Configurar webhook de MP con la URL de producción

---

## 12. Cómo probar el flow E2E con mock mode

1. Asegurarse que `MP_MOCK_MODE=true` está en Vercel
2. Ir a `https://vak-store.vercel.app/productos`
3. Agregar 1 producto al carrito
4. Click en carrito → "Finalizar compra"
5. Llenar el form
6. Click "Pagar con Mercado Pago"
7. Te redirige directo a `/pedido/[id]` con status `paid`
8. Verificar email de confirmación
9. Verificar stock decrementado en Supabase
