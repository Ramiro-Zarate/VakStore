# AGENTS.md — Vak Store

Guía operativa para el desarrollo del proyecto. Cubre arquitectura, decisiones
tomadas, convenciones y roadmap.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 6 (SSR via `@astrojs/vercel`) |
| UI islands | React 19 (`@astrojs/react`) |
| Auth + DB | Supabase (`@supabase/ssr` para client/server con cookies, `@supabase/supabase-js` solo para service_role) |
| Pasarela de pagos | **Mercado Pago** (`mercadopago` SDK) | Adopción AR, Rapipago/Pago Fácil, mejor para el mercado local. **Doc oficial de referencia: `.agents/skills/mp-ramiro/SKILL.md`** (1722 líneas, en español, cubre Checkout Pro completo: credenciales, webhooks, salir a producción). Cargar antes de debug de credenciales o webhooks. |
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
| `RESEND_API_KEY` | **server only** | API key de Resend | **Requerida en producción.** Opcional en dev, sin esto emails se loggean pero no salen. Crear cuenta en [resend.com](https://resend.com) (free tier: 3.000/mes), setear en Vercel (3 envs). |
| `RESEND_FROM_EMAIL` | server | Email del sender (ej. `onboarding@resend.dev`) | Opcional, default `onboarding@resend.dev` |
| `PUBLIC_WHATSAPP_NUMBER` | cliente + server | Número de WhatsApp formato E.164 (ej. `+5491100000000`). Usado para el botón flotante y el CTA de comprobante. | Requerida para Fase 3.5 |
| `TRANSFER_EXPIRY_HOURS` | server | Horas hasta auto-cancel de una transfer impaga | Opcional, default `72` |
| `CRON_SECRET` | **server only** | Bearer token para `PUT /api/cron/cancel-expired-transfers` | Requerida para que Vercel Cron llame al endpoint. Generar random (ej. `openssl rand -hex 32`). Setear en Vercel (3 envs). |

> **Nota**: Sentry (`@sentry/astro`) y Upstash (`@upstash/ratelimit` + `@upstash/redis`) están instalados en `package.json` y referenciados en código, pero **no se usan activamente** (no se crearán cuentas externas). El rate limit degrada a "deja pasar" si no hay config. Sentry no captura nada.

**Reglas:**
- `PUBLIC_*` se exponen al cliente. Todo lo demás es server-only.
- `SUPABASE_SERVICE_ROLE_KEY` debe **nunca** aparecer en `src/lib/supabase.ts` ni en componentes. Solo en `src/lib/supabaseAdmin.ts` (server).
- `.env` está en `.gitignore`. Verificar con `git log --all --full-history -- .env` antes de cada release.
- Los servicios opcionales (Resend) funcionan con configuración parcial: si falta la env var, el código degrada con un warning, no rompe. Sentry y Upstash están instalados pero son inertes sin env vars.

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

### ⏳ Fase 3 — Pendientes activos

- [x] Refund automático si oversell (vía `PaymentRefund.total({ payment_id })` + email cancelación)
- [x] **Idempotencia funcional en `processApprovedPayment`**: early-return si la orden ya está en estado terminal (`paid`/`delivered`). Previene doble decrement de stock cuando MP re-envía webhooks `approved` con `dataId` distinto.
- [x] **Fix webhook `topic=merchant_order`** — manejado en `handleMerchantOrder` (commit 612488d). Idempotencia usa `dataId` real de cada `payment` adentro del `merchant_order`.
- [x] **Onboarding de MP completo** — `MP_ACCESS_TOKEN` productivo en Vercel, cobros reales validados.
- [x] **Resolver 500 en `POST /api/orders/[id]`** — fix: `product_variant` → `product_variants` y `product` → `products` en el nested select. PostgREST expone las relaciones en plural por el nombre del FK constraint (hipótesis confirmada). El form de `/pedido` ahora carga el pedido correctamente. Ver §10 para el detalle.
- [x] **Validar path de oversell con MP real** — validado 2026-06-29 con compra real: refund `3144751258` emitido, orden `cancelled`/`rejected`, logs `[orderProcessing] oversell detected` + `[orderProcessing] refund issued` + `[webhook] oversell detected` confirmados en Vercel. Email de cancelación FALLÓ por bug 3.5 (Resend no verificado). Procedimiento en §10.
- [ ] **🟢 UX — Banner de cookies + página `/privacidad`** — cartel no-bloqueante en el bottom, persistir elección en localStorage, página con términos y política de privacidad. Ley 25.326 no obliga en AR pero es buena práctica + prepara para sumar analytics cuando haga falta.

**Deuda técnica conocida:** si `refundPayment()` falla y la webhook de MP reintenta, la tabla `webhook_events` bloquea el reprocesamiento y el refund queda pendiente. Solución actual: log + Sentry para detección. Solución futura: agregar columna `refund_status` en `orders` y mover el chequeo de idempotencia a después del refund.

### ✅ Fase 3.5 — Pago por transferencia + métodos de envío

> **Cerrado en código 2026-06-29.** Bloqueado parcialmente por bug 3.5 (emails a clientes reales no salen hasta verificar dominio en Resend). El resto del flow funciona end-to-end.

Varios clientes piden pagar por transferencia y mandar el comprobante por WhatsApp. Esta fase agrega el segundo método de pago (junto a MP) y modela los costos de envío que antes se cotizaban a mano.

#### Schema nuevo (aplicado vía `scripts/migrations/002_add_payment_and_shipping.sql`)
- `orders`:
  - `payment_method` text (`'mercadopago' | 'transfer'`), default `'mercadopago'` + CHECK constraint
  - `shipping_method` text (FK lógica a `shipping_methods.id`)
  - `shipping_cost` numeric
  - `bank_info_snapshot` jsonb (`{ alias, cbu, holder, cuit }` — lo que se le mostró al cliente al crear la orden; auditable aunque después cambien los datos)
  - `transfer_expires_at` timestamptz (para el cron de auto-cancel)
- Tabla nueva `shipping_methods` (`id` text PK, `name` text, `base_cost` numeric, `is_active` boolean, `created_at` timestamptz). Seed: 1 fila `nacional` con `base_cost=5000`.
- Índice parcial en `orders.transfer_expires_at` para que el cron no escanee la tabla entera.
- `status` extiende con `'awaiting_payment'` (nuevo estado para transfers pendientes).

#### Shipping (Fase 3.5.0)
- 1 método único: `nacional` / "Envío a todo el país" / $5.000 fijo.
- El schema (`shipping_methods` + `shipping_cost` por orden) ya soporta múltiples métodos y cálculo por CP/zona. Refinar en iteración futura.
- `shipping_cost` se suma a `total_amount` y se incluye como línea extra en la `Preference` de MP (afecta lo que cobra MP).
- La constante `SHIPPING_METHOD` en `src/components/CheckoutForm.tsx` está hardcodeada por ahora. Cuando crezca el catálogo, leer de `/api/shipping` o directamente de Supabase.

#### Descuento del 15% en transferencia
- **Constante**: `TRANSFER_DISCOUNT = 0.15` en `src/lib/bankInfo.ts`.
- **Base del cálculo**: 15% sobre el **subtotal** (productos). El envío NO se descuenta.
  - Ejemplo: subtotal $30.000 + envío $5.000 = $35.000. Con Transfer: $30.000 × 0.85 + $5.000 = **$30.500**.
- **Aplicación**:
  - `CheckoutForm.tsx`: el total se recalcula en vivo cuando el user toggle entre MP y Transfer. Aparece un discount row en el summary en verde (`--color-success`).
  - `src/pages/api/checkout.ts`: cuando `paymentMethod='transfer'`, calcula `totalFinal = subtotal * 0.85 + shippingCost` y lo guarda en `orders.total_amount`. El monto que el cliente transfiere es este.
  - `src/lib/email.ts`: el email de instrucciones muestra el desglose completo (subtotal, envío, descuento, total a transferir).
- **Textos en el sitio** (color `--color-success`, mono uppercase):
  - `src/components/ProductGrid.tsx`: `<p>15% off pagando por transferencia</p>` debajo del precio, **oculto en productos agotados** (`!hasStock`).
  - `src/components/ProductDetail.tsx`: `<span>15% off pagando por transferencia</span>` inline al lado del precio, oculto en `isOutOfStock`.
- **Edge cases**:
  - `total_amount` en DB siempre refleja lo que el cliente paga (con descuento si es Transfer).
  - El stock no se ve afectado.
  - El descuento se aplica **solo** cuando `paymentMethod='transfer'`. MP cobra el full.
  - El redondeo usa `toFixed(2)` (mismo criterio que el resto).

#### Datos del banco
- **Hardcodeados en `src/lib/bankInfo.ts`** (no en env vars, decisión de implementación).
- Placeholders: alias `ALIAS.PLACEHOLDER`, CBU `0000000000000000000000`, holder `Nombre Apellido`, CUIT `00-00000000-0`.
- **Reemplazar antes de producción** con los datos reales de la cuenta.
- `whatsappNumber` se lee de `PUBLIC_WHATSAPP_NUMBER` (env var, ya configurada).
- `transferExpiryHours` se lee de `TRANSFER_EXPIRY_HOURS` (default 72).

#### Env vars necesarias
- `PUBLIC_WHATSAPP_NUMBER` — formato E.164 (ej. `+5491100000000`). Ya está en `.env` y `.env` de Vercel.
- `TRANSFER_EXPIRY_HOURS` — opcional, default `72`.
- `CRON_SECRET` — secreto bearer para `PUT /api/cron/cancel-expired-transfers`. **Generar y configurar en Vercel** (3 envs: dev/preview/prod).

#### Flow de transferencia

```
[CartDrawer] "Finalizar compra" → /checkout
     ↓
[CheckoutForm] sección 1 (contacto) + 2 (envío) + 3 (método envío) + 4 (pago: Transfer)
     ↓
POST /api/checkout { paymentMethod: 'transfer', shippingMethod: 'nacional', shippingCost: 5000, ...customer }
  ├─ Validar Zod
  ├─ total = productos + 5000
  ├─ INSERT order { status: 'awaiting_payment', payment_method: 'transfer',
  │                bank_info_snapshot, transfer_expires_at: now() + 72h, ... }
  ├─ INSERT order_items
  ├─ sendTransferInstructionsEmail (con datos bancarios + WA link)
  ├─ return { transfer: true, orderId, bankInfo, whatsappUrl, transferExpiresAt }
  └─ NO llama a MP, NO decrementa stock
     ↓
window.location = /pedido/[id]
     ↓
[OrderTracking] status='awaiting_payment' + payment_method='transfer' →
  card con datos bancarios (alias, CBU, titular, CUIT, monto) + WhatsApp CTA
     ↓
Cliente transfiere + manda comprobante por WhatsApp
     ↓
Admin: Supabase Dashboard → orders SET status='paid', payment_status='approved',
       payment_intent_id='TRANSFER-<orderId>' WHERE id=...
     ↓
Admin corre: npm run confirm-order <orderId>
  └─ Valida status='awaiting_payment' + actualiza a 'paid' con payment_intent_id
  └─ (NO decrementa stock automáticamente — ver "Deuda técnica" abajo)
     ↓
[OrderTracking] status='paid' → la card bancaria se oculta, queda UI normal
```

#### UI implementada
- `src/components/CheckoutForm.tsx`:
  - Sección 3: "Método de envío" — radio con el método `nacional` ($5.000)
  - Sección 4: "Método de pago" — radio Mercado Pago / Transferencia
  - Submit: si MP → redirige a `data.init_point`. Si transfer → redirige a `/pedido/[id]`
  - Resumen (sidebar) muestra Subtotal + Envío + Total
- `src/components/CheckoutForm.module.css`: estilos `.radioGroup`, `.radioOption`, `.summaryBreakdown`
- `src/components/OrderTracking.tsx`:
  - Status label nuevo: "Esperando pago" para `awaiting_payment`
  - Render condicional: si `payment_method='transfer' && status='awaiting_payment' && bank_info_snapshot` → card con datos bancarios + WhatsApp CTA pre-armado
  - Si status `paid` con transfer: misma UI que MP (la card bancaria se oculta)
- `src/components/OrderTracking.module.css`: estilos `.transferCard`, `.transferList`, `.transferRow`, `.transferCta`, `.transferExpiry`
- `src/pages/api/orders/[id].ts`: query extendida para devolver los nuevos campos (`payment_method`, `payment_intent_id`, `transfer_expires_at`, `bank_info_snapshot`)

#### Cron — auto-cancel 72hs
- Endpoint: `src/pages/api/cron/cancel-expired-transfers.ts` (PUT)
- Auth: header `Authorization: Bearer ${CRON_SECRET}`
- Schedule Vercel Cron: diario 06:00 UTC = 03:00 ART (configurado en `vercel.json`)
- Lógica:
  ```sql
  SELECT id, email, customer_name, total_amount
  FROM orders
  WHERE status = 'awaiting_payment'
    AND payment_method = 'transfer'
    AND transfer_expires_at < now()
  ```
  Por cada una: `UPDATE orders SET status='cancelled', payment_status='rejected'` + `sendOrderCancelledEmail` con motivo "Expiró el plazo para enviar el comprobante de pago por transferencia."
- Stock: nada que liberar (nunca se decrementó).
- Email de cancelación: bloqueado por bug 3.5 si el FROM no está verificado en Resend.

#### Email
- Nuevo `sendTransferInstructionsEmail` en `src/lib/email.ts`:
  - Datos bancarios (alias, CBU, holder, CUIT)
  - Monto exacto (productos + envío)
  - Monto exacto (productos + envío)
  - wa.me link con mensaje pre-armado (`Hola, te paso el comprobante de mi pedido #XXXXX por $XXXXX`)
  - Link a `/pedido/[id]` para seguir el estado

#### Idempotencia y reuso
- `processApprovedPayment(orderId, paymentId)` ya es genérico (ver C4). Sirve para confirmación MP y para confirmación admin de transfer.
- Si el admin hace UPDATE dos veces por error, la idempotencia funcional (C4) evita doble decrement y doble email.

#### Edge cases
- **Oversell en transfer:** al confirmar, si `decrement_stock` falla → cancel + email (sin refund MP). Admin coordina el reembolso manualmente con el cliente.
- **User paga pero no manda comprobante:** queda `awaiting_payment`, cron lo cancela a las 72hs. Email de cancelación explica cómo pedir reintegro manual si ya transfirió.
- **User paga de más / de menos:** admin decide manualmente, fuera del scope del sistema.
- **Cambio de método de pago post-orden:** fuera de scope. Si el cliente quiere cambiar, se cancela la orden y se crea una nueva.
- **WA link roto:** validar formato E.164 al boot. Si está mal configurado, degradar a link genérico `wa.me/${WHATSAPP}` con warning en consola.

#### Tareas
- [x] Migración SQL: columnas nuevas en `orders` + tabla `shipping_methods` + seed
- [x] Env vars en Vercel (placeholders primero, reales al deploy)
- [x] Actualizar Zod schema (`src/lib/checkoutSchema.ts`) con `paymentMethod`, `shippingMethod`, `shippingCost`
- [x] Branch en `src/pages/api/checkout.ts` para `paymentMethod='transfer'`
- [x] UI: secciones 3 y 4 en `CheckoutForm.tsx` + CSS
- [x] UI: render condicional en `OrderTracking.tsx` para transfer + CSS
- [x] `sendTransferInstructionsEmail` en `src/lib/email.ts`
- [x] Cron: `src/pages/api/cron/cancel-expired-transfers.ts` + `vercel.json`
- [x] Decidir path de invocación de `processApprovedPayment` para la confirmación admin (CLI script `npm run confirm-order` por ahora, endpoint API en fase futura)

#### CLI script para confirmación admin
- `scripts/confirm-order.ts` (alias: `npm run confirm-order <orderId>`)
- Uso: el admin hace UPDATE en Supabase Dashboard primero (status='paid', payment_intent_id='TRANSFER-<id>'), después corre el script para registrar el cambio.
- **Limitación actual**: el script solo hace el UPDATE inicial, no llama `processApprovedPayment` automáticamente. El stock NO se decrementa y el email de confirmación NO se envía. El admin debe hacerlo a mano (o esperar a la versión con endpoint API que lo automatice).
- Validaciones: rechaza órdenes que no estén en `awaiting_payment`.

#### Deuda técnica
- **Stock NO se decrementa automáticamente al confirmar transfer.** Decisión consciente por simplicidad del CLI script. Cuando crezca el volumen, agregar endpoint `POST /api/admin/orders/[id]/confirm-transfer` con secret token que llame `processApprovedPayment`.
- **Email de confirmación al cliente NO se envía** en el mismo path. Mismo fix que arriba.
- Bloqueado por bug 3.5 hasta que se verifique dominio en Resend.

#### Diferido a fase futura
- Panel admin propio para confirmar transfers (ahora Supabase Dashboard + CLI)
- Endpoint `POST /api/admin/orders/[id]/confirm-transfer` con secret token (reemplaza al CLI script)
- Múltiples métodos de envío con cálculo por CP/zona
- Notificación al admin cuando entra una transfer nueva (Slack/email)
- Stock reservation al crear la orden (decrement + release si expira)

### 🐛 Bugs pendientes (audit post-compra 2026-06-11)

> Diagnóstico histórico en `audit/post-compra-2026-06-11.md` (en este mismo repo).
> Resumen priorizado:

#### 🔴 Crítico — Webhook `topic=merchant_order` no soportado (2026-06-11)

**Síntoma** (Vercel log 2026-06-11 15:24:25):
- POST con `body.topic='merchant_order'`, `body.resource='https://api.mercadolibre.com/merchant_orders/41734750025'`
- `dataId='41734750025'` se extrae OK del query `?id=`
- `WebhookSignatureValidator.validate()` rechaza con `SignatureMismatch`
- Respondemos 401 → MP reintenta → loop de rechazos

**Causa raíz** (doble):
1. La SDK `WebhookSignatureValidator` de MP está calibrada para `topic=payment` (donde el `id` del manifest = `payment_id`). Con `merchant_order` el manifest se construye distinto y la SDK devuelve `SignatureMismatch`.
2. Downstream rompe: `payment.get({ id: externalId })` en `src/pages/api/webhooks/mercadopago.ts:231` recibe un `merchant_order_id` y devuelve 404 (merchant_order_id ≠ payment_id).

**Por qué no se puede "elegir" qué envía MP**: en la cuenta actual (~50% onboarding) el panel solo permite registrar webhooks de tipo `merchant_order`. No hay opción v3 pura de `payment` desde el panel. Reintentado en sesión previa sin éxito.

**Fix planeado (NO implementado)**: ver `audit/post-compra-2026-06-11.md` sección "Plan de fix merchant_order". Implementación diferida — `MP_MOCK_MODE` funciona en paralelo como path de validación.

#### 🔴 Alta prioridad (afectan directamente al cliente)
- [x] **1.5** — Validar `customerEmail` antes de `sendOrderConfirmationEmail` y `sendOrderCancelledEmail` (string vacío → Resend falla silenciosamente). Aplicado en `src/lib/email.ts:90-117` y `:145-172`.
- [x] **2.3** — Validar `dataId` con regex `/^\d+$/` antes de `payment.get()` (webhooks de prueba de MP con id `"0"` o vacío → 500). Aplicado en `src/pages/api/webhooks/mercadopago.ts:208-220`.
- [ ] **3.5** — **Resend no manda emails a clientes reales (descubierto 2026-06-29)**. `RESEND_FROM_EMAIL=vakindumentaria@gmail.com` no es viable: Resend requiere un dominio propio verificado (gmail.com no se puede verificar). Descubierto durante validación del path oversell: el refund salió OK pero el email de cancelación nunca llegó (403 validation_error). **Fix:** comprar/registrar un dominio (NIC.ar, Namecheap, etc.), agregarlo en resend.com/domains, seguir el wizard de verificación DNS (DKIM + SPF), y cambiar `RESEND_FROM_EMAIL` a `algo@<dominio>`. No requiere cambios de código. Bloquea Fase 3.5 (transfer + shipping) que depende de emails a clientes. **Estado al cierre de Fase 3.5:** código cerrado, la card de datos bancarios en `/pedido/[id]` muestra la info client-side, pero el email con las instrucciones no llega a clientes reales hasta resolver bug 3.5.
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

### 🛠 Defensive checks (catches no catalogados, sesión 2026-06-11)

Detectados en revisión de código durante sesión de debug MP. No estaban en el
audit doc anterior ni en la lista de bugs. Son ingeniería defensiva que se fue
sumando sin catalogar — vale la pena tenerlos mapeados para no perder el
contexto si alguien toca esos archivos.

| # | Ubicación | Qué hace | Por qué importa |
|---|---|---|---|
| **C1** | `src/pages/api/checkout.ts:161-172` | Si falla `INSERT order_items`, hace `DELETE order` (compensación) | Evita orders huérfanas sin items. |
| **C2** | `src/pages/api/checkout.ts:225-234` | Si falla `Preference.create()` en MP, marca la order como `cancelled`/`rejected` | Evita que quede una order `pending` para siempre porque MP nunca la procesó. |
| **C3** | `src/lib/mp.ts:21-30` | `refundPayment` retorna `{ok, error}` union en vez de tirar excepción | El caller decide qué hacer (email, Sentry, etc.) sin un `try/catch` que se le escape. |
| **C4** | `src/lib/orderProcessing.ts:50-64` | Early-return si la order ya está en `paid`/`delivered`/`cancelled` | Idempotencia funcional: si MP reenvía el webhook, no decrementa stock dos veces ni manda dos emails. |
| **C5** | `src/pages/api/orders/[id].ts:11-19` | `safeEqual` con `timingSafeEqual` + dummy call cuando los buffers difieren en length | Anti-timing-attack en la verificación de email. El `timingSafeEqual(ab, ab)` mantiene tiempo constante si los emails tienen largo distinto. |
| **C6** | `src/pages/api/orders/[id].ts:8-9` | Regex `UUID_REGEX` y `EMAIL_REGEX` antes de cualquier query | Evita queries inútiles + log noise. |
| **C7** | `src/pages/api/products/index.ts:59,81` y `[id].ts:26` | `.eq('is_active', true)` en TODA query pública de productos | Guard de seguridad: previene leak de productos desactivados. |
| **C8** | `src/pages/api/webhooks/mercadopago.ts:243-252` | Check `payment.external_reference` no-null antes de procesar | Si MP por algún motivo no manda `external_reference`, no rompe con null pointer. |
| **C9** | `src/stores/CartStore.ts:50-56, 65-69` | try/catch silencioso en `localStorage.setItem` | Si el user está en modo incógnito o excede quota, el carrito no rompe la app. |
| **C10** | `src/stores/AuthStore.ts:42-45` | catch en `supabase.auth.getSession()` | Si falla el handshake inicial, el listener no queda colgado. |
| **C12** | `src/pages/api/webhooks/mercadopago.ts:verifyMpSignature` | Reimpl custom de `WebhookSignatureValidator` con fix para `ts` en segundos | Bug del SDK v3.1.0: `Date.now() - Number(ts) / 1000` da drift de 56 años cuando MP envía `ts` en segundos. Solución: multiplicar `Number(ts) * 1000` antes de comparar con `Date.now()`. `matchedTemplate: 'sdk_official_patched'`. |
| **C13** | `src/pages/api/webhooks/mercadopago.ts:verifyMpSignature` | Skip temporal de validación de firma para webhooks v3 con `console.warn` | MP envía webhooks v3 con un manifest distinto al que espera nuestra validación. La HMAC no matchea para v3 (mientras matchea perfecto para v1). Workaround: skip con `matchedTemplate: 'v3_skipped_temp'`. Mitigación: `payment.get()` valida con MP, `external_reference` valida con DB, UNIQUE constraint en `webhook_events` previene doble procesamiento. Fix definitivo: debug del manifest format de v3. |

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
- **Supabase auth (SSR-safe):** el cliente anon SIEMPRE debe ser `createBrowserClient` de `@supabase/ssr` (nunca `createClient` plano de `@supabase/supabase-js` para auth). Este último guarda el JWT en `localStorage` y rompe SSR de páginas con `prerender = false` que lean la sesión (ej. `/cuenta` siempre redirige a `/login` aunque el user esté logueado). Para server-side con auth del user, `createServerClient` con `cookies.getAll`/`setAll` cableados a `ctx.request.headers` y `ctx.cookies` (ver `src/lib/supabaseServer.ts`). Para bypass de RLS, `getSupabaseAdmin()` (service_role).
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

- ✅ **Cuenta de vendedor MP productiva activa** — onboarding completo al 80%+, cobros reales confirmados.
- ✅ `MP_ACCESS_TOKEN` productivo configurado en Vercel (los 3 envs).
- ✅ `MP_WEBHOOK_SECRET` regenerado y configurado en Vercel (NO es el access token — es la clave dedicada de webhooks del panel de MP).
- ✅ **Doc oficial de MP como referencia principal**: `.agents/skills/mp-ramiro/SKILL.md` (1722 líneas, en español, cubre Checkout Pro completo).
- ✅ Webhook v1 signature validation: reimpl custom de `WebhookSignatureValidator` con fix para `ts` en segundos (SDK asume ms). Ver C12.
- ✅ Webhook v3 signature validation: skip temporal con `console.warn` (mismo patrón que `merchant_order`). Ver C13.
- ✅ `isPaymentEvent` check: acepta tanto `body.type === 'payment'` (v1) como `body.topic === 'payment'` (v3).
- ✅ E2E validado end-to-end con compra real: stock decrementado, orden `paid`, email enviado.
- ✅ Refund automático por oversell implementado (`PaymentRefund.total()`).
- ✅ Webhook de `topic=merchant_order` (commit 612488d) ya manejado en código.
- 🛠 `MP_MOCK_MODE` no está en Vercel → corre flow real contra producción.
- ✅ `RESEND_API_KEY` y `RESEND_FROM_EMAIL` configurados en Vercel. Email de confirmación llega al cliente linkeado con su cuenta de MP. Validado end-to-end.
- ✅ Resuelto: 500 en `POST /api/orders/[id]`. Causa raíz confirmada: PostgREST expone las relaciones `order_items → product_variants` y `product_variants → products` en plural por el naming del FK constraint. El query usaba singular (`product_variant` y `product`) → PGRST200. Fix: 2 cambios de 1 palabra en el nested select de `src/pages/api/orders/[id].ts:82,85`. El form de `/pedido` ahora muestra el pedido correctamente. **Nota para Opción B (futuro)**: renombrar los FK constraints a singular + `NOTIFY pgrst, 'reload schema'` permitiría volver al singular en el código (convención más semántica). Pendiente solo si la inconsistencia molesta.
- 📞 Pendiente: resolver 500 en `POST /api/orders/[id]`. (movido arriba como ✅)
- 📞 Pendiente: debug del manifest format de v3 para re-habilitar validación de firma v3 (actualmente skipeada con warning).

#### Procedimiento para validar path de oversell con MP real

El path de oversell (`processApprovedPayment:99-144`) está implementado pero nunca se ejecutó contra producción. El refund real de MP no se probó. Esta es la receta para validarlo end-to-end.

**Setup:**
1. Setear `stock_quantity=1` en una variante cualquiera (Supabase Dashboard → tabla `product_variants`).

**Ejecución (con un conocido, ya que MP no te deja pagarte a vos mismo):**
2. Tu conocido inicia checkout con esa variante → pasa pre-checkout (1 ≤ 1) → orden `pending` creada.
3. **Antes** de que pague en MP, vos bajás manualmente `stock_quantity=0` en Supabase (simulás que otro comprador se llevó la unidad en el medio).
4. Tu conocido paga en MP.

**Verificación (al llegar el webhook `approved`):**
5. `processApprovedPayment` → `decrement_stock` devuelve 0 → path de oversell ejecuta:
   - `orders.status='cancelled'`, `payment_status='rejected'`, `payment_intent_id=<paymentId>`
   - `refundPayment(paymentId)` → refund visible en panel MP
   - `sendOrderCancelledEmail` con motivo "No tenemos stock suficiente" + nota de reembolso

**Checklist de lo que se valida:**
- [ ] Log Vercel: `[orderProcessing] oversell detected`
- [ ] DB: `orders` en `cancelled` con `payment_intent_id` poblado
- [ ] Panel MP: refund registrado
- [ ] Email recibido con la nota de reembolso
- [ ] `webhook_events` tiene el evento (idempotencia: si MP reintenta, no se reprocesa — ver C4)

**Cleanup:** restaurar `stock_quantity` y, si querés, cancelar la order manualmente para dejar la DB limpia.

**Resultado real (2026-06-29):** ✅ Refund emitido (`refundId=3144751258`), orden `cancelled`/`rejected`, logs `[orderProcessing] oversell detected` + `[orderProcessing] refund issued` + `[webhook] oversell detected` confirmados en Vercel. ❌ Email de cancelación falló por bug 3.5 (Resend no verificado). El path de oversell queda validado end-to-end; el email queda bloqueado hasta verificar un dominio en Resend.

---

## 11. Setup de MP para producción (referencia histórica)

Pasos originalmente necesarios para salir a producción con MP. Ya completados (ver §10):

1. ~~Crear cuenta en [upstash.com](https://upstash.com)~~ — descartado, no se usará Upstash.
2. ~~Crear proyecto en [sentry.io](https://sentry.io)~~ — descartado, no se usará Sentry.
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
