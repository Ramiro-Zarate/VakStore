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
| `PUBLIC_WHATSAPP_NUMBER` | cliente + server | Número de WhatsApp formato E.164 (ej. `+5491100000000`). Usado para el botón flotante y el CTA de comprobante. | **Crítica**: el botón flotante de WhatsApp (`WhatsAppFloat`) NO se renderiza si esta env var no está seteada. Aplicar a los 3 envs (Production, Preview, Development) en Vercel. |
| `TRANSFER_EXPIRY_HOURS` | server | Horas hasta auto-cancel de una transfer impaga | Opcional, default `72` |
| `CRON_SECRET` | **server only** | Bearer token para `PUT /api/cron/cancel-expired-transfers` | Requerida para que Vercel Cron llame al endpoint. Generar random (ej. `openssl rand -hex 32`). Setear en Vercel (3 envs). |
| `ADMIN_EMAIL` | **server only** | Email destinatario de las notificaciones de nuevas órdenes (Fase 3.7) | Opcional. Si no está seteada, la notif se skipea con warning en consola. Setear en Vercel (3 envs) cuando se quiera activar. |

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

### 🎯 Current focus (próximas 2 semanas)

1. **🔴 Comprar dominio y verificarlo en Resend** (sin código, dueño del negocio)
   - Comprar dominio en NIC.ar o Namecheap
   - `resend.com/domains` → wizard DNS (DKIM + SPF)
   - Cambiar `RESEND_FROM_EMAIL` en Vercel (3 envs)
   - Sin esto no salen emails reales a clientes (bug 3.5)
2. **🔴 Reemplazar CUIT placeholder en `src/lib/bankInfo.ts:7`**
   - Necesita CUIT real (formato `XX-XXXXXXXX-X`)
   - Mientras sea `00-00000000-0` las transferencias se rechazan
3. **🟡 Fix espacio al inicio del CBU en `src/lib/bankInfo.ts:5`**
   - Decidido, pendiente de ejecutar (1 línea)
4. **🟡 Batch D+E+F** — sanitize body webhook + log refund + whitelist status (3 fixes en producción)
5. **🟡 Webhook v3 signature (C13)** — debug del manifest format

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
- [x] ~~Validar flow E2E con tarjeta sandbox APRO~~ — N/A: pre-prod bloque eliminado, E2E validado con compra real (ver §10)

### ✅ Fase 3 — Cerrada

> Todos los items originales de Fase 3 fueron cerrados. Ver arriba los checkmarks
> de cada uno y los commits asociados.

Última tarea pendiente cerrada 2026-06-30:

- [x] **🟢 UX — Banner de cookies + página `/privacidad`** — cartel no-bloqueante en el bottom, persistir elección en localStorage, página con términos y política de privacidad. Ley 25.326 no obliga en AR pero es buena práctica + prepara para sumar analytics cuando haga falta.
  - Banner: `src/components/CookieBanner.tsx` (React) + `.module.css`
  - Persistencia: localStorage con keys `cookie-consent`, `cookie-consent-version`, `cookie-consent-date`
  - Versión de política: hardcoded `POLICY_VERSION = '1.0'`. Si cambia, el banner reaparece pidiendo re-consentimiento
  - Página: `src/pages/privacidad.astro` con 9 secciones (introducción, datos, uso, terceros, cookies, derechos Ley 25.326, devoluciones 10 días, cambios, contacto)
  - Integración: `src/layouts/Layout.astro` con `<CookieBanner client:only="react" />`
  - Placeholders en la página: nombre/razón social, CUIT, domicilio, número de WhatsApp. Editar antes de producción real.

**Deuda técnica conocida:** si `refundPayment()` falla y la webhook de MP reintenta, la tabla `webhook_events` bloquea el reprocesamiento y el refund queda pendiente. Solución actual: log + Sentry para detección. Solución futura: agregar columna `refund_status` en `orders` y mover el chequeo de idempotencia a después del refund.

### ✅ Fase 3.5 — Pago por transferencia + métodos de envío

> **Cerrado en código 2026-06-29.** Migración 002 aplicada retroactivamente 2026-06-30 (ver bug crítico arriba). Bloqueado parcialmente por bug 3.5 (emails a clientes reales no salen hasta verificar dominio en Resend). El resto del flow funciona end-to-end.

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
- La constante `SHIPPING_METHOD` en `src/components/CheckoutForm.tsx` está hardcodeada por ahora. Cuando crezca el catálogo, leer de `/api/shipping` o directamente de Supabase.  *(→ resuelto en Fase 3.6 con pricing por zona)*

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
- Múltiples métodos de envío con cálculo por CP/zona  *(→ resuelto en Fase 3.6)*
- Notificación al admin cuando entra una transfer nueva (Slack/email)
- Stock reservation al crear la orden (decrement + release si expira)

### ✅ Fase 3.6 — Envíos por zona + etiqueta + tracking manual

> **Cerrado en código 2026-06-30.** Pendiente: aplicar `scripts/migrations/003_add_tracking.sql` en Supabase Dashboard.

**Decisión clave:** NO se integró EnvioPack. Con <5 envíos/semana y operatoria
de "llevar a la sucursal del carrier", el fee por envío + complejidad de la API
no se justificaban. Se optó por un **"EnvioPack casero"**: pricing por zona +
etiqueta imprimible + tracking manual pegado desde el panel del carrier.

#### Schema (`scripts/migrations/003_add_tracking.sql`, **pendiente de aplicar**)
- `orders.carrier` text, CHECK (`'andreani'` | `'correo_argentino'`, nullable)
- `orders.tracking_number` text, nullable
- `orders.shipped_at` timestamptz, nullable

Las 3 columnas son opcionales (NULL permitido) para no romper órdenes existentes.
El CHECK permite `carrier IS NULL` → compatible con órdenes pre-migración.

#### Pricing por zona (`src/lib/shippingZones.ts`)
- 8 zonas hardcoded por rango de CP argentino + fallback `nacional` $5.000:
  CABA $3.000 · GBA $4.000 · Buenos Aires $5.500 · Centro $6.500 · Litoral $7.000 ·
  NOA $8.000 · Cuyo $8.500 · Patagonia $11.000
- `getZoneForCP(cp)` → strip letras, primeros 4 dígitos, match contra rangos
- Endpoint `GET /api/shipping/quote?cp=...` devuelve `{ detected, options }`
- Checkout: el **server computa el costo desde el zone id** (no confía en el client). Ver C14.
- Tabla `shipping_methods` queda sin uso por ahora; se mantiene para futura integración con EnvioPack

#### Etiqueta imprimible (`src/pages/pedido/[id]/etiqueta.astro`)
- Server-rendered, autenticación id+email en query string (misma que OrderTracking, ver C16/C17)
- Layout 10×15cm con `@page { size: 100mm 150mm; margin: 4mm }`, CSS `@media print` oculta nav/footer/whatsapp-float
- Muestra: remitente, destinatario destacado, CP grande, items, total, ID orden
- Botón "Imprimir" → `window.print()`; botón "Volver al pedido" en pantalla
- Acceso: botón "Imprimir etiqueta de envío" en OrderTracking cuando `status ∈ {paid, processing, shipped, delivered}`

#### Tracking para el cliente
- 2 carriers soportados en `src/lib/carriers.ts`: **Andreani**, **Correo Argentino** (sin OCA)
- `getTrackingUrl(carrierId, nro)` → URL deep-link al tracking del carrier
- `getCarrier(carrierId)` → metadata para mostrar nombre
- Flujo admin: Supabase Dashboard → editar `orders` → setear `carrier='andreani'`, `tracking_number='123456'`, `shipped_at=now()`
- OrderTracking muestra card violeta con carrier + número + link "Rastrear en…" cuando ambos campos están populados

#### Archivos creados
- `src/lib/shippingZones.ts`
- `src/lib/carriers.ts`
- `src/pages/api/shipping/quote.ts`
- `src/pages/pedido/[id]/etiqueta.astro`
- `scripts/migrations/003_add_tracking.sql`

#### Archivos modificados
- `src/lib/checkoutSchema.ts` (quitado `shippingCost` del input, ahora solo `shippingMethod`)
- `src/pages/api/checkout.ts` (server computa `shippingCost` desde `getZoneCost(shippingMethod)`)
- `src/components/CheckoutForm.tsx` (debounced lookup de zona por CP, ver C15)
- `src/components/CheckoutForm.module.css` (estilos `.shippingCard*`, `.summaryBreakdown` con nombre de zona)
- `src/lib/types.ts` (campos `carrier`, `tracking_number`, `shipped_at` en `Order`)
- `src/pages/api/orders/[id].ts` (query extendida con los 3 campos nuevos)
- `src/components/OrderTracking.tsx` (render `trackingCard` + botón "Imprimir etiqueta")
- `src/components/OrderTracking.module.css` (estilos `.tracking*`, `.printButton`)

#### Cambios en flujo existente
- El submit del checkout ya no manda `shippingCost` (lo calcula el server)
- El summary del checkout ahora muestra `Envío · {nombre de zona}` en vez de solo "Envío"
- `OrderTracking` muestra tracking card cuando hay carrier + tracking_number
- `OrderTracking` muestra botón "Imprimir etiqueta" en estados post-pago

#### Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Tabla de CP desactualizada (nuevos CPs) | Fallback a `nacional` $5.000 cubre el caso |
| Lookup servidor vs cliente desincronizado | Server recalcula siempre, ignora `shippingCost` del client |
| Etiqueta se imprime mal en printers raras | `@page size` configurable, browser fallback a A4 |
| Tracking paste manual → typos | El URL pattern se genera server-side, solo se pastea el número |
| User sin CP o CP inválido | UI muestra "Envío estándar" + hint "Ingresá tu CP para ver el costo exacto" |

#### Diferido a fase futura
- Múltiples etiquetas por hoja A4 (flag `?layout=a4`)
- Webhook de carrier para auto-update de `status='shipped'/'delivered'`
- Multi-carrier en el checkout (la tabla `shipping_methods` ya está lista para esto)
- EnvioPack cuando volumen supere 15/semana sostenidos — `getZoneForCP` se reemplaza por proxy a EnvioPack, OrderTracking recibe webhooks en vez del paste manual
- Ajustar costos de las zonas desde Supabase Dashboard (hoy son hardcoded en `shippingZones.ts` — cuando se justifique, mover a `shipping_methods`)

#### Verificación operativa del tracking post-compra

> **Cuándo usar este checklist**: pre-release que toque `OrderTracking.tsx` / `carriers.ts` / render de la card, o la primera vez que se carga un envío real para un cliente.

##### Pre-condición
- [ ] Orden existente con `status ∈ {paid, processing, shipped, delivered}` y al menos un `order_item`. Si no hay, generar una con `MP_MOCK_MODE=true`.
- [ ] La orden NO debe tener `carrier` ni `tracking_number` (estado limpio).
- [ ] Sesión con acceso a `/pedido/[id]?email=<orderEmail>` (ver C5/C6).

##### Test 1 — Render con Andreani
1. Supabase Dashboard → tabla `orders` → editar la orden:
   - `carrier = 'andreani'`
   - `tracking_number = 'TEST12345'`
   - `shipped_at = now()`
2. Recargar `/pedido/[id]?email=<orderEmail>`.
3. Verificar:
   - [ ] Aparece card violeta con título "Seguimiento de envío"
   - [ ] "Carrier" muestra "Andreani"
   - [ ] "Número de tracking" muestra `TEST12345`
   - [ ] "Enviado el" muestra fecha en formato `es-AR`
   - [ ] Link "Rastrear en Andreani" presente

##### Test 2 — URL del link
- [ ] Click → URL = `https://www.andreani.com/envio/TEST12345`
- [ ] Repetir con `tracking_number='ABC 123/XYZ'` → URL contiene `%20` y `%2F` (`encodeURIComponent` aplica)

##### Test 3 — Repetir con Correo Argentino
1. Misma orden → `carrier='correo_argentino'`, `tracking_number='CA9876'`
2. Recargar `/pedido/[id]?email=<orderEmail>`
3. Card muestra "Correo Argentino" + número
- [ ] URL del link = `https://www.correoargentino.com.ar/consulta-de-envio?nro=CA9876`

##### Test 4 — Gating (regression crítico)
| Estado | Comportamiento esperado |
|---|---|
| `carrier=null` y `tracking_number=null` | NO aparece card |
| `carrier='andreani'` y `tracking_number=null` | NO aparece card (gating requiere ambos) |
| `carrier=null` y `tracking_number='TEST'` | NO aparece card |
| `carrier='oca'` y `tracking_number='TEST'` | Aparece card con nombre fallback "oca" + link roto. **Esperado**: no se valida carrier contra whitelist, se confía en el paste admin. Corregir en Supabase. |

##### Test 5 — Cross-check con etiqueta (Fase 3.6)
- [ ] El botón "Imprimir etiqueta de envío" sigue apareciendo (no se oculta al agregar tracking)

##### Cleanup
- [ ] Restaurar la orden: `carrier=null`, `tracking_number=null`, `shipped_at=null` para no dejar datos de prueba en la DB

##### Edge cases a recordar
| Caso | Comportamiento |
|---|---|
| `carrier` con typo (`'andriani'`) | Card muestra el string raw como nombre + link roto a `andreani.com/envio/...`. Corregir en Supabase. |
| `tracking_number` con espacios/slashes | `encodeURIComponent` los maneja → URL válida. |
| `shipped_at` en timezone raro | `toLocaleDateString('es-AR')` normaliza al timezone del browser del cliente. |
| Status `cancelled` con carrier pegado | La card SÍ se renderiza (gating es solo por carrier+tracking_number, no por status). Decisión consciente: útil ver el tracking aunque el pedido se canceló. |

### ✅ Fase 3.7 — Validaciones post-checkout + notificación al admin

> **Cerrado en código + DB 2026-06-30.** Migración 003 aplicada (5 columnas: carrier, tracking_number, shipped_at, phone, province). Migración 002 aplicada retroactivamente ese mismo día (ver bug crítico). Bug 3.5 (Resend) sigue bloqueando el email real al admin hasta que se verifique un dominio.

Cierra los 3 gaps de alto impacto del flujo post-venta que quedaron en Fase 3.6:
- Teléfono del cliente (crítico para que el carrier coordine la entrega)
- Provincia (explícita en la orden, no implícita del CP)
- Warning CP vs ciudad (mismatch visible antes de submit)
- Notificación al admin (email en cada nueva orden)

#### Schema (modificación de `scripts/migrations/003_add_tracking.sql`)
- `orders.phone text` (nullable, requerido en el form)
- `orders.province text` (nullable, requerido en el form)

#### Form (`src/components/CheckoutForm.tsx`)
- Campo `phone` nuevo: `type="tel"`, `inputMode="tel"`, validado `^[\d\s+\-()]{8,20}$`, hint "Para que el courier coordine la entrega"
- Campo `province` nuevo: `<select>` con 24 jurisdicciones (pre-llenado desde CP via `getProvinceFromCP(cp)`), siempre editable
- **Warning card** cuando `isCPMismatch(cp, city)` → muestra "Tu CP (1414) corresponde a CABA pero tu ciudad dice Bariloche (que está en Río Negro). ¿Es correcto?"
- Validación client-side: phone (8-20 chars formato libre), province (no vacía)
- Submit bloquea solo por errores de validación; el warning NO bloquea

#### Lookup de provincias (`src/lib/provinces.ts`)
- `PROVINCES`: array de 24 entradas (CABA + 23 provincias) con `cpRanges` rough
- `getProvinceFromCP(cp)`: pre-fill desde CP
- `detectProvinceFromCity(city)`: keyword match contra lista de ciudades por provincia
- `isCPMismatch(cp, city)`: helper que combina ambos lookups
- Las keywords son las ciudades más conocidas por provincia (mínimo viable, no exhaustivo). El usuario puede editar la provincia si está mal.

#### Notificación al admin (`src/lib/email.ts`)
- Nueva función `sendAdminOrderNotification`:
  - Lee `ADMIN_EMAIL` de env vars
  - Si no existe → log warning + skip (no rompe el checkout)
  - Si Resend no está configurado → log con el subject, skip
  - Si falla el envío → log error, no rompe el checkout (fire-and-forget)
- Llamada desde `src/pages/api/checkout.ts` después de insertar `order_items` (cubre MP y transfer)
- Subject: `Nuevo pedido #ABC12345 — $XXXXX`
- Body: customer, teléfono, dirección completa, items, total, link a Supabase Dashboard
- **Fire-and-forget**: `void sendAdminOrderNotification(...)` — no await, no bloquea el checkout

#### Archivos creados
- `src/lib/provinces.ts`

#### Archivos modificados
- `scripts/migrations/003_add_tracking.sql` (agregadas columnas `phone`, `province`)
- `src/lib/types.ts` (`Order` con `phone` + `province`)
- `src/lib/checkoutSchema.ts` (`phone` y `province` requeridos)
- `src/lib/email.ts` (función `sendAdminOrderNotification` + `AdminOrderEmailData` interface)
- `src/pages/api/checkout.ts` (guarda phone/province en `orderInsert`, llama `sendAdminOrderNotification` fire-and-forget)
- `src/components/CheckoutForm.tsx` (campos phone/province, warning de mismatch, validación)
- `src/components/CheckoutForm.module.css` (estilos `.warningCard*`)
- `src/pages/pedido/[id]/etiqueta.astro` (muestra phone y province en la etiqueta)
- `src/pages/api/orders/[id].ts` (query extendida con phone, province)

#### Env vars necesarias
- `ADMIN_EMAIL` — server-only, sin default. Si no está, la notif se skipea.

#### Riesgos
| Riesgo | Mitigación |
|---|---|
| `ADMIN_EMAIL` no seteado | Log warning + skip. No rompe el checkout. |
| Resend falla o no configurado | Log error. No rompe el checkout. |
| Email al admin rebota | Bug 3.5: dominio no verificado. Mismo blocker que emails a clientes. |
| User ignora el warning CP vs ciudad | La provincia puede corregirse después manualmente en Supabase. |
| Keyword de ciudad no matchea (ej. pueblo chico) | El warning no aparece, pero el user puede cambiar la provincia manualmente. |

#### Diferido a fase futura
- Notificación a Slack/Discord (reemplaza email)
- Campo "instrucciones especiales de entrega"
- Validar que el CP exista con API externa (no factible sin servicio pago)
- Notificación separada al admin cuando entra una transfer (hoy usa el mismo path)

### ✅ Post-Fase 3.7 — Quick wins de UX (2026-06-30)

Mejoras menores aplicadas después del cierre de Fase 3.7, antes del
lanzamiento público. Sin cambios de schema ni de flujo, solo UX/polish.

- **Nueva página `/contacto`** (`src/pages/contacto.astro`): grid 2x2 con 4 cards (WhatsApp, Email, Instagram, Facebook). Datos: WA lee de `PUBLIC_WHOTSAPP_NUMBER`, email `vakindumentaria@gmail.com`, Instagram `@vak.storee`, Facebook placeholder. Reemplaza el link roto `/cuenta#contacto` (la sección `#contacto` nunca existió en `/cuenta`). Nav link: `Contacto` ahora apunta a `/contacto`.

- **Fix Nav active state** (`src/components/Nav.astro`): `isCurrent()` ahora valida query params del href (no solo `pathname.startsWith(path)`). Antes, el link "Ofertas" (`/productos?sale=true`) quedaba activo en cualquier `/productos/*`. Bonus: el `split('#')` resuelve el bug latente del link "Contacto" que nunca quedaba activo (el `pathname` no incluye el hash).

- **Fix tipografía del @ en Instagram** (`src/pages/contacto.astro`): el `@` se renderiza en Inter bold rojo (color accent) en vez de Space Mono (donde el glifo se confundía con otro carácter). CSS: `.at-prefix`.

- **Fix z-index WhatsApp float** (`src/components/WhatsAppFloat.module.css`): el botón verde quedaba tapado por el cookie banner (`z-index: 100`) en la primera visita. Subido a `z-index: 200` (por encima del banner, por debajo de modales futuros). **Crítico:** `PUBLIC_WHOTSAPP_NUMBER` debe estar seteada en Vercel (Production, Preview, Development) o el botón no se renderiza en absoluto.

### 🐛 Bugs pendientes (audit post-compra 2026-06-11)

> Diagnóstico histórico en `audit/post-compra-2026-06-11.md` (en este mismo repo).
> Resumen priorizado:

#### 🔴 Crítico — Migración 002 (Fase 3.5) nunca aplicada a la DB de producción (2026-06-30)

**Síntoma:** Al testear Fase 3.7 (commit 41e3a41) en producción, POST `/api/checkout` con `paymentMethod='transfer'` fallaba con `PGRST204: Could not find the 'bank_info_snapshot' column of 'orders' in the schema cache`.

**Causa raíz:** La migración 002 (`scripts/migrations/002_add_payment_and_shipping.sql`) que agrega `payment_method`, `shipping_method`, `shipping_cost`, `bank_info_snapshot`, `transfer_expires_at` **nunca se había corrido** en la DB de producción. El código de Fase 3.5 (commit 8d6a799, 2026-06-29) asumía que las columnas existían pero la DB no las tenía. Cualquier orden de transfer creada entre el commit de Fase 3.5 y la fecha de hoy (2026-06-30) debe haber fallado silenciosamente (o con error 500 que se perdió en logs).

**Fix aplicado 2026-06-30:** correr el SQL de la 002 (idempotente) + `NOTIFY pgrst, 'reload schema'` + esperar 30s. Las columnas de Fase 3.5 ahora existen en producción.

**Lección:** Siempre correr `NOTIFY pgrst, 'reload schema'` después de cualquier migración y verificar con `information_schema.columns` que las columnas/tablas esperadas existen. NO confiar en el mensaje "Success" del SQL Editor — eso solo significa que el SQL corrió sin error de sintaxis, no que la cache de PostgREST está sincronizada con la DB.

**Procedimiento estándar de migraciones (aplica a TODAS las futuras, no solo la 002):**
1. Abrir Supabase SQL Editor → New query
2. Pegar el SQL de la migración (de `scripts/migrations/00X_*.sql`)
3. Run → esperar "Success. No rows returned"
4. **OBLIGATORIO**: correr `NOTIFY pgrst, 'reload schema';` → Run
5. **OBLIGATORIO**: esperar 30 segundos (PostgREST tarda en procesar el reload)
6. **OBLIGATORIO**: verificar con query a `information_schema.columns` que las columnas/tablas esperadas existen
7. Recién entonces testear en la app

Si te ahorrás el NOTIFY, vas a perder tiempo debuggeando errores "column not found" para columnas que ya están agregadas.

**Pre-migration checklist (revisar ANTES de escribir el SQL):**
- [ ] ¿La migración agrega valores a un enum/literal de TypeScript (`src/lib/types.ts`)? → Si sí, **actualizar también la CHECK constraint del DB en la misma migración** (mismo bug que la 002 + `orders_status_check`).
- [ ] ¿La migración agrega columnas con `NOT NULL`? → Definir un `DEFAULT` compatible con datos existentes o hacer nullable.
- [ ] ¿Documenté los valores válidos en el comentario del archivo SQL?
- [ ] ¿El SQL es idempotente? (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- [ ] ¿Los CHECK constraints usan `IF NOT EXISTS` (vía DO block) para ser re-ejecutables?

#### 🔴 Crítico — CHECK constraint `orders_status_check` no incluye `'awaiting_payment'` (2026-06-30)

**Síntoma:** Después de aplicar la 002 + 003, POST `/api/checkout` con `paymentMethod='transfer'` falla con error `23514`:
```
new row for relation "orders" violates check constraint "orders_status_check"
```

**Causa raíz:** El `Order` type en `src/lib/types.ts` se actualizó en Fase 3.5 para incluir `status='awaiting_payment'`, pero la CHECK constraint `orders_status_check` (creada en una migración anterior) no se actualizó en la misma migración. El type permitía el valor pero el DB lo rechazaba.

**Fix aplicado 2026-06-30:** DROP + ADD CONSTRAINT con la lista completa de 7 statuses (`pending`, `awaiting_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`) + `NOTIFY pgrst, 'reload schema'` + esperar 30s.

**Lección:** Cuando agregás un valor a un literal/union de TypeScript, **SIEMPRE verificar si existe un CHECK constraint en el DB para esa columna**. Si existe, agregarlo en la misma migración. Ver el "Pre-migration checklist" arriba.

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
| **C14** | `src/pages/api/checkout.ts:54-61` | Server-side lookup de `shippingMethod` (zone id) → `getZoneById` + `getZoneCost`. Si la zone no existe, 400. | El client ya no manda `shippingCost`; el server lo computa desde el zone id para evitar que un client mande un shippingMethod arbitrario con costo trucado. El zone id es validado contra `SHIPPING_ZONES` (constante hardcoded, no DB) → no se puede inyectar. |
| **C15** | `src/components/CheckoutForm.tsx:50-66` | Debounce 400ms del fetch a `/api/shipping/quote` cuando cambia `postalCode` | Evita N requests por cada tecla tipeada en el CP. Cleanup del timer en el `return` del `useEffect` para no actualizar state después de unmount. |
| **C16** | `src/pages/pedido/[id]/etiqueta.astro:13-14` | `UUID_REGEX` + `EMAIL_REGEX` antes de cualquier query a la DB | Mismo patrón que C6. Si el id o el email no pasan el regex, redirect a `/pedido/[id]?error=invalid_request` sin tocar Supabase. |
| **C17** | `src/pages/pedido/[id]/etiqueta.astro:48-54` | `timingSafeEqual` + dummy call cuando los buffers difieren en length | Anti-timing-attack en la verificación de email, mismo patrón que C5. El `timingSafeEqual(ab, ab)` mantiene tiempo constante si los emails tienen largo distinto. |
| **C18** | `src/pages/api/checkout.ts:225-242` | `void sendAdminOrderNotification(...)` (fire-and-forget) | Notificación al admin no bloquea el checkout. Si Resend falla, el cliente igual completa la compra. |
| **C19** | `src/lib/provinces.ts:detectProvinceFromCity` | Normalización NFD + lowercase antes de keyword match | "Córdoba" y "cordoba" matchean el mismo keyword. Resiliente a tildes y mayúsculas. |
| **C20** | `src/components/CheckoutForm.tsx:60-76` | Province auto-fill solo si `!form.province` (no sobrescribe selección manual del user) | El user puede cambiar la provincia si la detección del CP está mal, y la app no la pisa. |
| **C21** | `src/components/Nav.astro:8-22` | `isCurrent()` valida query params del href (no solo `pathname.startsWith(path)`) | Sin esto, links con query string (ej. `/productos?sale=true`) se marcan activos en cualquier página que matchee el path. También incluye `split('#')` para que links con hash (ej. `/cuenta#contacto`) matcheen correctamente. |
| **C22** | `src/components/WhatsAppFloat.module.css:5` | `z-index: 200` (por encima del cookie banner que tiene 100) | El WhatsApp float quedaba visualmente tapado por el banner de cookies en la primera visita. Si se baja el z-index, vuelve el bug. |
| **C23** | `src/styles/reset.css:9-23` | `scroll-padding-top: var(--header-height)` en `<html>` | Sin esto, los anchor links quedaban tapados por el Nav sticky (72px desktop / 64px mobile). El browser scrollea al anchor pero el header lo cubre. Ver Fase 3.8. |
| **C24** | `src/styles/a11y.css:1-26` | Skip-link con `opacity:0` + `pointer-events:none` y solo `:focus-visible` (no `:focus`) | El patrón `transform: translateY(-200%)` + `:focus` hacía que el skip-link apareciera al volver con back/forward del browser o cargar con `#hash` en URL. Ver Fase 3.8. |
| **C25** | `src/pages/api/products/index.ts:18-23` | Sanitización de `q` (search query): trim + slice 100 chars + remover `,."()\\` antes de pasar a PostgREST `.or()` | Defensivo contra inputs raros. `%` y `_` se mantienen como wildcards de ILIKE (feature). El `.or()` parsea el string con sintaxis PostgREST, por eso hay que remover los chars que romperían el parse. Ver Fase 3.8. |
| **C26** | `src/components/SearchBar.tsx:36-41` | Submit hace `window.location.href` (no `pushState` + `setFilters`) | El SearchBar está en el Nav y no escucha `filterschange`. Si se removiera `q` desde el FilterSidebar con `pushState`, el input del Nav quedaría desincronizado. `window.location.href` recarga la página y sincroniza todo. |

### ✅ Fase 3.8 — Buscador + Single Source of Truth en ligas + cleanup UX (2026-07-01)

Sesión de cleanup + feature: el footer apuntaba a links rotos, los
anchors quedaban tapados por el Nav sticky, el skip-link aparecía de
vez en cuando, los filtros estaban hardcodeados desincronizados con la
DB, y faltaba un buscador básico.

#### Cambios

- **Footer** (`src/components/Footer.astro:55-59`) — 3 links reales:
  - Contacto → `/contacto` (link roto: `/cuenta#contacto`)
  - Cambios y devoluciones → `/privacidad#7.politica-de-devoluciones`
  - Términos y condiciones → `/privacidad` (top)
  - Eliminados Envíos y FAQs (no tenían destino real).
- **`src/pages/privacidad.astro:93`** — `id="7.politica-de-devoluciones"` agregado al `<h2>` de la sección 7. Habilita el deep-link desde el footer.
- **`src/styles/reset.css:17, 19-23`** — `scroll-padding-top: var(--header-height)` en `<html>` (+ media query mobile). Bug global de anchors tapados por Nav sticky. Ver C23.
- **`src/styles/a11y.css:1-26`** — skip-link migrado de `transform: translateY(-200%)` a `opacity:0 + pointer-events:none`. Selector de focus de `:focus,:focus-visible` a solo `:focus-visible`. Resuelve el bug de "skip-link aparece de vez en cuando" al hacer back/forward o cargar con `#hash`. Ver C24.
- **Filtros Single Source of Truth** (parcial):
  - `src/lib/leagues.ts` (nuevo) — `getLeagues()` server-side con caché en memoria 60s + fallback (6 ligas normalizadas). Query: `supabase.from('product_variants').select('league, products!inner(is_active)').eq('products.is_active', true)`.
  - `src/components/FilterSidebar.tsx` — prop `leagues?: string[]`. Solo ligas dinámicas. `CATEGORIES` y `SIZES` restaurados hardcoded (talles en orden natural: S → M → L → XL → XXL, no lexicográfico).
  - `src/components/Footer.astro` — sin helper, 3 links de categorías hardcoded.
  - `src/lib/types.ts:5` — `category: 'camisetas' | 'shorts' | 'camperas'` (literal type restaurado, da autocomplete).
  - **Decisión de scope**: solo ligas se hidratan. Categorías y talles son sets casi-fijos conocidos; el .sort() alfabético rompe el orden natural de talles. Hidratar contra la DB no aporta cuando el set es chico y conocido.
- **Migración 004** (`scripts/migrations/004_normalize_leagues.sql`) — aplicada manualmente 2026-07-01:
  - `UPDATE product_variants SET league='Selecciones' WHERE league='Seleccioones'`
  - `UPDATE product_variants SET league='Premier League' WHERE league='Premier'`
  - Documenta convención: categorías en `products.category` siempre plurales (`'shorts'`, `'camperas'`, no singulares).
- **Buscador type text**:
  - `src/components/SearchBar.tsx` (nuevo, React island, `client:load`) — input en el Nav top. Submit (Enter) → `window.location.href = '/productos?q=' + encodeURIComponent(trimmed)`. Botón de clear (×). Sincroniza con `?q=` de la URL al montar.
  - `src/components/SearchBar.module.css` (nuevo) — estilos con mobile responsive: en desktop input inline, en mobile colapsa a ícono de lupa que abre un overlay fijo en el top.
  - `src/components/Nav.astro` — `<SearchBar client:load />` en `.searchSlot` (nueva div) entre `.primaryNav` y `.actions`. Grid del `.inner` cambió de 3 a 4 columnas (`auto 1fr auto auto`).
  - `src/components/Nav.module.css:11-19, 106-108` — grid actualizada + mobile override (`.searchSlot { justify-content: flex-end; }`).
  - `src/pages/api/products/index.ts:24-27, 64, 88` — soporte para `q`. Trim + slice 100 chars + sanitizar `,."()\\` (defensivo contra PostgREST `.or()`). Aplica `name.ilike.%q%,description.ilike.%q%` vía `.or()`.
  - `src/pages/productos.astro:11, 32` — lee `q` de `searchParams` y lo pasa a `<ProductGrid q={q} />`.
  - `src/components/ProductGrid.tsx:10, 17, 32-33, 39, 69, 44, 140` — prop `q?: string`, incluido en `getFiltersFromURL`, en el fetch, y en empty state diferenciado (`No hay productos que coincidan con "X"`).
  - `src/components/FilterSidebar.tsx:11, 49, 64` — `q` agregado al interface `Filters` y a `FILTER_LABELS` como "Búsqueda". Tag removable: al remover, `window.location.href` recarga para sincronizar el SearchBar del Nav. Ver C26.

#### Verificación

- [x] Build limpio (`npm run build` ~20s, sin warnings nuevos)
- [x] Footer links funcionan (Contacto, Cambios con scroll-padding correcto, Términos)
- [x] Skip-link ya no aparece fantasma (solo con Tab)
- [x] Sidebar de `/productos`: Categoría (3 hardcoded) + Talle (5 hardcoded en orden) + Liga (6 dinámicas desde DB)
- [x] `/api/products?q=foo` busca en `name` y `description` con ILIKE
- [x] Tag removable de `Búsqueda` en FilterSidebar sincroniza con el input del Nav
- [x] Mobile: SearchBar colapsa a ícono de lupa con overlay

#### Diferido a fase futura

- Búsqueda también en `product_variants.club` (ej. "Real Madrid" cuando el name del producto es "Camiseta Titular 24/25")
- Full-text search con `tsvector` (cuando el catálogo crezca y ILIKE quede lento)
- Autocomplete live en el Nav (sin submit)
- Búsqueda fuzzy (typos)
- Historial de búsquedas

---

### ⏳ Fase 4 — Escalar (cuando duela)
- [ ] Imágenes en Supabase Storage + Image Optimization
- [x] ~~Búsqueda full-text~~ — Búsqueda con ILIKE implementada (Fase 3.8). Full-text con `tsvector` queda diferido para cuando duela el O(n).
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
