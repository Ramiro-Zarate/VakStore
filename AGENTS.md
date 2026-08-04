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
| `RESEND_FROM_EMAIL` | server | Email del sender (ej. `hola@tudominio.com.ar`). **Debe ser de un dominio verificado en Resend** (DKIM + SPF). | Opcional, default `onboarding@resend.dev`. **Configurado pre-launch 2026-08-03 con `hola@vakstoree.com`** después de verificar `vakstoree.com` en Resend + DNS en Cloudflare. |
| `PUBLIC_WHATSAPP_NUMBER` | cliente + server | Número de WhatsApp formato E.164 (ej. `+5491100000000`). Usado para el botón flotante y el CTA de comprobante. | **Crítica**: el botón flotante de WhatsApp (`WhatsAppFloat`) NO se renderiza si esta env var no está seteada. Aplicar a los 3 envs (Production, Preview, Development) en Vercel. |
| `TRANSFER_EXPIRY_HOURS` | server | Horas hasta auto-cancel de una transfer impaga | Opcional, default `72` |
| `CRON_SECRET` | **server only** | Bearer token para `PUT /api/cron/cancel-expired-transfers` | Requerida para que Vercel Cron llame al endpoint. Generar random (ej. `openssl rand -hex 32`). Setear en Vercel (3 envs). |
| `ADMIN_EMAIL` | **server only** | Email destinatario de las notificaciones de nuevas órdenes (Fase 3.7) | Opcional. Si no está seteada, la notif se skipea con warning en consola. Setear en Vercel (3 envs) cuando se quiera activar. |
| `PUBLIC_GA_ID` | cliente | Google Analytics 4 Measurement ID (formato `G-XXXXXXX`). Si está setteado, el `CookieBanner` permite opt-in para analytics y monta `gtag.js` solo si el user acepta. | Opcional. Si no está, el banner se comporta como 2 estados (accept/reject) y no carga analytics. Configurado en Vercel 2026-08-03. |

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

## 6. Plan priorizado (reordenado 2026-07-27)

### 6.1 Estado por sistema (snapshot 2026-07-27)

| Sistema | Estado | Bloqueante para launch |
|---|---|---|
| Auth email | Sin probar E2E | 🟡 probable config |
| Auth Google | No redirige | 🟡 probable config |
| Recovery pass | ✅ Cerrado (R-404) | — |
| Checkout guest + MP | ✅ E2E validado | — |
| Checkout transfer | ⚠️ Email no llega a clientes reales (Resend no verificado) | 🟡 bug 3.5 |
| Tracking | ✅ Sin tracking number (admin setea `shipped` manual) | — |
| Shipping CA + Moto | ✅ CA nacional + Moto CABA/GBA (decisión final 2026-07-30) | — |
| Emails a clientes | ⚠️ Solo llegan a vakindumentaria@gmail.com | 🟡 bug 3.5 |
| Stock decrement | ✅ Validado | — |
| Refund oversell | ✅ Validado | — |
| Páginas legales | ✅ Implementadas (con placeholders del dueño) | — |
| Catálogo + filtros + buscador | ✅ Funciona | — |
| SEO | ⚠️ Falta sitemap, robots.txt, og image, noindex en filtros | 🟢 backlog |

### 6.2 🟥 FASE A — Auth bloqueante (PRÓXIMA SESIÓN, 1-2 hs)

Objetivo: cualquier visitante puede crear cuenta, loguearse, recuperar pass.

| # | Tarea | Esfuerzo | Tipo | Bloqueado por |
|---|---|---|---|---|
| **A1** | Crear `src/pages/auth/update-password.astro` + `src/components/UpdatePasswordForm.tsx` | ✅ cerrado 2026-07-28 | código | — |
| **A2** | Diagnosticar Google OAuth: config Supabase + Google Cloud | 5-20 min (dueño) | config | — |
| **A3** | Probar signup email + recovery E2E | 10 min (dueño) | test | A1 |
| **A4** | Fix config Google OAuth según A2 | 10-20 min (dueño) | config | A2 |

**Cierre de fase**: signup email, login email, login Google, recovery password funcionan E2E. Bugs R-404 y G-OAuth cerrados.

**Diagnóstico Google OAuth (A2 — paso a paso para el dueño):**
1. Supabase Dashboard → Authentication → Providers → Google
   - ¿Está habilitado el toggle? Si no, habilitarlo
   - ¿Hay Client ID y Client Secret cargados?
2. Si faltan credenciales → Google Cloud Console:
   - Crear proyecto (o usar uno existente)
   - Habilitar "Google Identity" API
   - Crear credencial OAuth 2.0 Client (tipo Web)
   - Authorized redirect URI: `https://<tu-project>.supabase.co/auth/v1/callback`
   - Copiar Client ID + Secret a Supabase
3. Supabase → Authentication → URL Configuration:
   - Site URL = `https://vak-store.vercel.app`
   - Redirect URLs debe incluir `/auth/callback`
4. Probar de nuevo y mirar consola del browser

**Por qué no es bug de código**: `src/stores/AuthStore.ts:73-78` usa `signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })`. Eso es correcto. El problema está aguas arriba (Supabase no inicia el OAuth porque el provider no está bien configurado).

### 6.3 🟧 FASE B — Salir a producción (1 sesión, depende del dueño)

Objetivo: mails reales a clientes + notif al admin funcional.

| # | Tarea | Esfuerzo | Tipo | Bloqueado por |
|---|---|---|---|---|
| **B1** | Dueño compra dominio + verifica en Resend (DKIM + SPF) | 30 min (dueño) | dueño | — |
| **B2** | Setear `CRON_SECRET` en Vercel (3 envs) | 2 min (dueño) | config | — |
| **B3** | Setear `ADMIN_EMAIL` en Vercel | 1 min (dueño) | config | — |
| **B4** | URL real Facebook → `src/pages/contacto.astro:11` + `src/components/Footer.astro:24` | 5 min | código | dueño da URL |
| **B5** | Test E2E: comprar real → verificar email al cliente | 10 min (dueño) | test | B1 |

**Cierre de fase**: clientes reciben emails reales (confirmación, transfer, cancelación), admin recibe notif de cada orden, cron de auto-cancel funciona. Bug 3.5 cerrado.

**Pendiente del dueño (no técnico):**
- **🔴 Reemplazar CUIL temporal por CUIT del Monotributo en `src/lib/bankInfo.ts:7`**
  - Valor actual (temporal): `20-47144775-8` (CUIL del dueño)
  - Reemplazar cuando se cree el Monotributo y se obtenga el CUIT
  - Mismo formato `XX-XXXXXXXX-X`, no requiere cambios de código
- **🔴 Completar placeholders de `src/pages/privacidad.astro`**
  - Razón social o nombre del titular (línea 23)
  - CUIT del Monotributo (línea 24)
  - Domicilio comercial (líneas 25 y 114)
  - WhatsApp público formato E.164 (línea 113) — puede ser el mismo `PUBLIC_WHATSAPP_NUMBER` de Vercel
  - Todos visibles al público en la página legal

### 6.4 🟨 FASE C — Shipping (decisión previa, ~1 sesión implementación)

**Origen de la decisión** (sesión 2026-07-27): Andreani se evaluó como muy caro. Se replantea el approach de §3.10.

**Opciones evaluadas:**

| Opción | Esfuerzo | Costo | Robustez | Comentario |
|---|---|---|---|---|
| **MercadoEnvíos** (nativo MP) | Bajo (config en panel MP, ~1-2 hs) | 3-5% del envío al vendedor | Alta | MP calcula, rastrea y entrega. Cero integración de carrier. **Recomendado para arrancar.** |
| **EnvioPack** (agregador AR) | Medio (~3-4 hs, 1 API) | ~$50-100/mes + fee/envío | Alta | Ellos manejan varios carriers. Útil si querés ofrecer opciones sin que el cliente use el de MP. |
| **Manual + flat** (lo actual) | 0 hs | 0 | Baja pero funciona | 1 precio fijo, admin coordina con el carrier que quiera. OK hasta ~5 envíos/semana. |
| ~~Hardcoded 2-3 opciones~~ | ~1-2 hs | 0 | Baja | Descartado: precios inventados se desactualizan rápido con inflación. |
| ~~Integración directa Andreani/Correo/OCA~~ | Alto + caro | Caro | Media | Descartado: caro, frágil, requiere mantener. Andreani da la etiqueta desde su panel (no generamos la nuestra). |

**Recomendación**: MercadoEnvíos. Cero código nuevo, MP ya lo integró. Si el volumen crece (>15/semana) o se quiere ofrecer opciones sin pasar por MP, evaluar EnvioPack.

**Estado**: ✅ Cerrado 2026-07-30. Decisión final pre-launch: **Correo Argentino manual "particular" para todo el país + Motomensajería para CABA/GBA** (coordinada por WhatsApp, pago por transferencia). Pricing hardcoded por zona en `src/lib/shippingZones.ts`. Sin API, sin etiqueta auto, sin tracking number real. Admin setea `status='shipped'` manual cuando lleva el paquete al CA. Ver §6.7 "Decisión final de envíos pre-launch (2026-07-30)" para el detalle de implementación, pricing por zona y admin workflow. El plan multi-carrier de §3.10 queda como referencia histórica.

### 6.5 🟩 FASE D — Polish pre-launch (1 sesión, 2-3 hs)

Backlog de Fase 3.9. Resuelve SEO + archivos públicos antes de empezar a posicionar.

| # | Tarea | Esfuerzo | Estado |
|---|---|---|---|
| **D1** | `public/robots.txt` — permitir todo salvo `/api/`, `/pedido/`, `/cuenta/` | 2 min | ✅ cerrado 2026-08-03 |
| **D2** | `src/pages/404.astro` — layout con link a `/` y `/productos` | 20 min | ✅ cerrado 2026-08-03 |
| **D3** | `public/images/og-default.png` (1200×630) — generar o pedir a diseñador | pendiente | 🟡 pendiente pre-launch |
| **D4** | Sitemap (`@astrojs/sitemap` + integration en `astro.config.mjs` con `site: 'https://vakstoree.com'`) | 15 min | ✅ cerrado 2026-08-03 |
| **D5** | `noindex` en `/productos` con filtros (`src/pages/productos.astro:24` → `<Layout ... noindex={Boolean(q || hasFilters)}>`) | 1 min | ✅ cerrado 2026-08-03 |
| **D6** | Verificar migraciones 002/003 aplicadas en prod (query a `information_schema.columns`) | 2 min | pendiente |
| **D7** | Slugs en URLs producto (`src/pages/productos/[slug].astro`, mig 005) | 2-3 hs | pendiente (post-launch) |
| **D8** | Schema.org structured data en producto (`src/components/ProductSchema.tsx`) | 30 min | pendiente (post-launch) |
| **D9** | Analytics — reemplazado por FASE GA4 (Google Analytics 4 con opt-in) | — | ✅ ver FASE GA4 abajo |

**Batch D+E+F webhooks** (originalmente en current focus): reubicado en §6.6 E1.

### ✅ FASE GA4 — Google Analytics 4 con opt-in (cerrada 2026-08-03)

Pre-launch se activó GA4 con consentimiento opt-in (no auto-tracking). El usuario puede aceptar o rechazar analytics desde el CookieBanner.

#### Implementación

- **Env var:** `PUBLIC_GA_ID` (formato `G-XXXXXXX`) en Vercel (3 envs).
- **CookieBanner:** 3 estados (`'pending' | 'accepted' | 'rejected'`). Persiste en localStorage.
- **Script de gtag:** se monta dinámicamente desde `Layout.astro` **solo si** `localStorage.getItem('cookie-consent') === 'accepted'`. Sin consentimiento, no se carga nada.
- **CSP:** `vercel.json` actualizado con allowlist de `googletagmanager.com` (script-src) y `google-analytics.com` (connect-src).
- **Política de privacidad:** `privacidad.astro` documenta el uso condicional de analytics.

#### Archivos modificados

- `src/layouts/Layout.astro` — script gtag condicional
- `src/components/CookieBanner.tsx` — 3 estados + persistencia
- `vercel.json` — CSP allowlist actualizado
- `.env.example` — `PUBLIC_GA_ID` documentado

#### Edge cases

- Si `PUBLIC_GA_ID` no está seteado, el CookieBanner sigue funcionando en 2 estados (accept/reject) y no carga analytics. El sitio no rompe.
- Si el user rechaza analytics, NO se carga gtag.js en ninguna página.
- Si el user acepta, gtag.js se carga con `consent mode = granted` para que las páginas vistas se cuenten desde el momento del consentimiento (no retroactivo).

#### Diferido a fase futura

- Migrar a Plausible o Umami si querés analytics cookieless (más simple, no necesita opt-in)
- Custom events para funnel de checkout (add_to_cart, begin_checkout, purchase)
- Enhanced ecommerce tracking con productos y categorías

### 6.6 🟦 FASE E — Cleanup técnico (post-launch, cuando duela)

| # | Tarea | Tipo |
|---|---|---|
| **E1** | Batch D+E+F webhooks: sanitize body (`JSON.parse(JSON.stringify(body))`) + log refund + whitelist `payment_status` (bugs 2.1, 1.1, 2.5) | código |
| **E2** | Webhook v3 signature debug (C13) — re-habilitar validación HMAC v3 | código + debug |
| **E3** | Cambiar `Order.payment_status` de `string \| null` a union literal con status válidos | código |
| **E4** | `supabase db pull` para versionar schema SQL en repo | infra |
| **E5** | Regenerar tipos con `supabase gen types typescript` (resuelve bug de `astro check` con SDK 2.106+) | infra |

### 6.7 Cambios recientes (cerrados)

- [x] CBU sin espacio al inicio en `src/lib/bankInfo.ts:5` (mismo número)
- [x] CUIT placeholder reemplazado por CUIL temporal `20-47144775-8`
- [x] Hero hardcodeado "16 Modelos" / "48h Envío" → "Diseños exclusivos" / "Envíos a todo el país" en `src/components/Hero.astro:34-49`
- [x] **🟢 Chore — Eliminar feature de etiqueta imprimible** — Andreani da la etiqueta desde su panel, no necesitamos generar la nuestra. El botón "Imprimir etiqueta" le aparecía al cliente (mala UX). Eliminado `etiqueta.astro` + botón en `OrderTracking.tsx` + CSS `.printRow`/`.printButton`. Defensive checks C16 y C17 removidos (ya no hay endpoint de etiqueta).
- [x] **📝 Documentación — Multi-carrier shipping** — Decisión de sumar Correo Argentino y Uber Flash además de Andreani. Plan completo + 7 preguntas abiertas documentadas en §3.10. Sin código aún, esperando respuestas del dueño.
- [x] **🟢 Reordenamiento del roadmap (2026-07-27)** — Plan priorizado en FASE A→E. Auth (FASE A) pasa a ser prioridad #1. Shipping (FASE C) re-evaluado: MercadoEnvíos reemplaza a multi-carrier hardcoded como opción recomendada. Backlog de Fase 3.9 movido a FASE D. Cleanup técnico a FASE E. Bugs R-404 y G-OAuth agregados a §🐛. Defensive check C27 agregado.
- [x] **🚚 Decisión de envíos + implementación (2026-07-28)** — Reemplaza el plan multi-carrier de §3.10 (desestimado). Decisión: **Correo Argentino para todo el país + Motomensajería exclusiva para CABA/GBA** (coordinada por WhatsApp, pago obligatorio por transferencia). Andreani descartado completamente. Implementación: `src/lib/shippingOptions.ts` (nuevo) + `src/lib/carriers.ts` (drop andreani, add moto) + checkout con N cards según CP + MP desmontado cuando se elige moto + email dedicado con subject "coordinar envío por moto" + OrderTracking con nuevo statusHero `statusHeroMoto` (oculta datos bancarios hasta que admin setee `shipping_cost` post-WA). Migración 005 extiende el CHECK de `orders.carrier` para aceptar `'motomensajeria'` y nulifica `'andreani'` viejo. **El 15% off por transferencia sigue aplicando SOLO al subtotal de productos**, no al envío (ni para Correo Argentino ni para Motomensajería). En moto: subtotal × 0.85 + costo_moto_coordinado (transferencia). Schema sin cambios nuevos. Admin tool para confirmar pago moto: manual en Supabase Dashboard + `npm run confirm-order` (mismo flow que transfer estándar, con paso extra de UPDATE `shipping_cost` y `total_amount` post-coordinación).
- [x] **🔐 Auth: password recovery (FASE A1 cerrado, 2026-07-28)** — Creada página `/auth/update-password` + componente `UpdatePasswordForm` (8 chars min, confirm password, session check on mount → redirect a `/login?error=invalid_recovery_link` si no hay sesión). Submit → `supabase.auth.updateUser({ password })` → redirect a `/login?reset=ok`. LoginForm ahora muestra mensaje contextual para los query params (`?reset=ok` = success verde, `?error=invalid_recovery_link` = error específico). **C27 cerrado junto al bug**: `UPDATE_PASSWORD_PATH` + `AUTH_CALLBACK_PATH` centralizados en `src/lib/auth.ts` con helper `getOrigin()` SSR-safe. AuthStore importa de `auth.ts` en vez de hardcodear. Resuelve R-404. Pendiente: A3 test E2E del dueño, A2/A4 Google OAuth config.
- [x] **🔐 OAuth callback server-side (G-CB cerrado, 2026-07-28)** — Bug distinto a G-OAuth (ese era config). Después de configurar Google OAuth correctamente, el callback fallaba con `PKCE code verifier not found in storage` y dejaba al user en `/login?error=...` sin completar el login. Causa: `src/pages/auth/callback.astro` corría el exchange client-side (en un `<script>`), pero el PKCE code verifier no estaba disponible en el browser storage después del redirect cross-site de Google. Fix: `callback.astro` ahora hace el exchange **server-side** en el frontmatter usando `getSupabaseServer(Astro)` (que ya existía, AGENTS.md §7 convención). Bonus: `src/lib/supabaseServer.ts:33-36` `setAll` ahora pasa las `options` del library (`SameSite`, `Secure`, etc.) en vez de hardcodear `path: '/'` — el library setea `SameSite=None; Secure` en producción para que las cookies de session sobrevivan. También se agregó soporte `?next=` en el callback para redirigir al path original post-login (LoginForm lee `?redirect=` y lo pasa como `?next=` al iniciar el OAuth). C28 y C29 cerrados.
- [x] **🎨 P-Focus cerrado (2026-07-28)** — Bug de UX en `/registro`: el input de contraseña perdía focus al tipear la primera letra, obligando al user a hacer click de nuevo para seguir tipeando (experiencia tosca). Causa raíz: `Field` (`src/components/Primitives/Field.tsx:46-65`) tiene 3 code paths según `Children.toArray(children).length`. El strength meter de RegisterForm se renderizaba con `{password.length > 0 && <div>...</div>}`, cambiando el length de children entre renders. React re-montaba el `PasswordInput` (y su `<input>` interno) → focus perdido. Fix: envolver el strength meter en un `<div>` siempre presente con `style={{ display: password.length > 0 ? 'block' : 'none' }}`. Estructura estable, reconciliación preserva la instancia, focus intacto. C30 cerrado.
- [x] **🎨 P-Strength cerrado (2026-07-28)** — Bug en `RegisterForm.getPasswordStrength`: contraseñas de 1-5 chars se mostraban como "Fuerte" porque el `if (score === 1)` y `if (score === 2)` no matcheaban para `score=0` y la función caía al `return { score: 3, label: 'Fuerte' }` final (fall-through). Fix: agregar caso explícito `if (score === 0) return { score: 0, label: 'Muy débil' }` antes de los otros. C31 cerrado.
- [x] **🔐 V-Login cerrado (2026-07-28)** — Bug de UX en el flow de signup: después de click el link de verificación del email, Supabase redirigía a la Site URL (la home) → user sin loguear, tenía que ir a `/login` manualmente. Causa: `signUp` no seteaba `emailRedirectTo` y `/auth/verificacion.astro` era estática (no procesaba la sesión del hash). Fix: 2 cambios. (1) `emailRedirectTo: ${getOrigin()}/auth/verificacion` en `signUp` (AuthStore + auth.ts). (2) `/auth/verificacion` ahora es un React component (`src/components/Verificacion.tsx`) que detecta la sesión con `supabase.auth.getSession()` en mount — si hay sesión redirige a `/`, si no muestra el mensaje de "revisá tu email". C32 cerrado.
- [x] **📦 Decisión final de envíos pre-launch (2026-07-30) — CA manual "particular"** — Refina la decisión del 2026-07-28. **Modelo final**: Correo Argentino para todo el país (sin API, sin etiqueta auto, sin tracking number real) + Motomensajería exclusiva para CABA/GBA (coordinada por WhatsApp, pago obligatorio por transferencia). Pricing hardcoded por zona en `src/lib/shippingZones.ts`. Status flow (ver tabla completa abajo). Admin workflow: lleva el paquete al CA → `UPDATE orders SET status='shipped', shipped_at=now()` en Supabase Dashboard (sin pegar `tracking_number`). Cuando confirma entrega → `status='delivered'`. El cliente ve "Tu pedido está en camino con Correo Argentino" sin link. **Diferencia clave vs 2026-07-28**: ya no se captura ni se muestra número de tracking. La card violeta con link a la página del carrier queda deshabilitada por gating natural (`tracking_number IS NULL`). Ver `src/lib/shippingZones.ts` para el detalle de zonas y precios, `src/components/OrderTracking.tsx:460-481` para el render de `shipped`, y `src/components/OrderTracking.tsx:292-335` para el flow de moto (que sí se mantiene). **Pendiente a verificar post-launch**: si CA emite algún código/comprobante de admisión en modalidad particular, y si conviene capturarlo y mostrárselo al cliente. No bloquea el launch.
- [x] **🐛 B-Listener-Leak cerrado (2026-08-03)** — `useAuth.ts:22` llamaba `authStore.initialize()` en cada mount de un componente que usaba `useAuth`, acumulando listeners de `onAuthStateChange` (memory leak) y disparando `getSession()` redundante. En una página con 2-3 componentes que usan auth (ej. UserMenu + AuthNav + ProfileForm) se acumulaban 3 listeners. Fix en `src/stores/AuthStore.ts`: (1) `initialize()` ahora es idempotente con `if (this.initialized) return` al inicio. (2) Variable módulo `_onAuthSubscription` guarda la subscription de `onAuthStateChange` para evitar duplicados. Una sola suscripción global por sesión de browser. C33 cerrado.
- [x] **🐛 B-Cart-Debounce cerrado (2026-08-03)** — `CartStore.saveToStorage()` se llamaba sincrónicamente en cada `addToCart`/`removeFromCart`/`updateQuantity`/`clearCart`, escribiendo a `localStorage` N veces por N clicks rápidos. Fix en `src/stores/CartStore.ts`: agregado `saveTimeout: ReturnType<typeof setTimeout> | null = null` como variable módulo, y `saveToStorage()` ahora hace `clearTimeout` + `setTimeout(..., 200)` antes del `localStorage.setItem`. 10 clicks rápidos = 1 write. C34 cerrado.
- [x] **🐛 B-Webhook-Verbose cerrado (2026-08-03)** — 3 `console.log` verbosos en `src/pages/api/webhooks/mercadopago.ts` (líneas 247, ~283, ~326) loggeaban el body completo de MP (PII del payer), headers, y fragmentos de firma HMAC. En producción llenaban Vercel logs con ruido y exponían PII. Fix: los 3 envueltos en `if (process.env.NODE_ENV !== 'production')`. En dev: se loggean. En prod: 0 output. Los `console.warn`/`console.error` críticos se mantienen intactos. C35 cerrado.
- [x] **🟢 Link "Ofertas" roto eliminado (2026-08-03)** — 4 lugares del sitio (`Nav.astro:31`, `Footer.astro:29`, `Hero.astro:26` CTA "Liquidación", `MobileMenu.tsx:21`) apuntaban a `/productos?sale=true`, pero la API de productos no filtraba por `sale`, no había columna `on_sale`/`original_price` en el schema, y no había toggle en FilterSidebar. Usuario clickeaba "Ofertas" → veía todo el catálogo. **Decisión**: sacar los 4 links en vez de implementar ofertas de verdad (3-4 hs con migración + UI). El sitio no promete ofertas que no tiene. Si en el futuro se suman, queda documentado el approach en este entry.
- [x] **🌐 Dominio `vakstoree.com` configurado pre-launch (2026-08-03)** — DNS en Cloudflare. Vercel: dominio custom agregado, SSL auto, `PUBLIC_SITE_URL=https://vakstoree.com` (sin trailing slash). Supabase: Site URL + 4 Redirect URLs (`/auth/callback`, `/auth/verificacion`, `/auth/update-password`, `/auth/recover`) actualizadas. Resend: dominio `vakstoree.com` verificado con DKIM+SPF (3 records en Cloudflare, no DMARC todavía), `RESEND_API_KEY=re_xxxxx` en Vercel (3 envs), `RESEND_FROM_EMAIL=hola@vakstoree.com`. **Validado E2E con compra de prueba por transferencia**: email de instrucciones llegó al inbox con FROM correcto, no cayó en spam. Mercado Pago: webhook URL actualizada a `https://vakstoree.com/api/webhooks/mercadopago`. AGENTS.md §2 (Variables de entorno) actualizado con `PUBLIC_GA_ID` y estado real de `RESEND_FROM_EMAIL`.
- [x] **🔐 Google OAuth cerrado (FASE A2+A4, 2026-08-03)** — Bug G-OAuth del roadmap finalmente cerrado end-to-end. Google Cloud: proyecto `vak-store` creado, Google Identity API habilitada, OAuth 2.0 Client (Web application) generado. Authorized redirect URIs: `https://ykschogmngngdyietggunf.supabase.co/auth/v1/callback` (la de Supabase, no la del sitio). Authorized JavaScript origins: `https://vakstoree.com` + `https://www.vakstoree.com`. Supabase → Authentication → Providers → Google: Client ID + Secret cargados. Site URL + Redirect URLs ya actualizados al nuevo dominio (ver entry anterior). **Validado E2E con login real**: el botón "Continuar con Google" en `/login` y `/registro` funciona correctamente, la sesión se persiste en cookie del dominio custom, el user queda en la tabla `profiles` de Supabase. AGENTS.md §6.2 FASE A2+A4 cerradas.
- [x] **📊 FASE GA4 — Google Analytics 4 con opt-in (cerrada 2026-08-03)** — Activación pre-launch de analytics con consentimiento. Env var `PUBLIC_GA_ID` (formato `G-XXXXXXX`) configurada en Vercel. CookieBanner extendido de 2 a 3 estados (`'pending' | 'accepted' | 'rejected'`). Script de gtag.js se monta dinámicamente desde `Layout.astro` **solo si** `localStorage.getItem('cookie-consent') === 'accepted'` (consent mode = granted). CSP en `vercel.json` actualizado con allowlist de `googletagmanager.com` (script-src) y `google-analytics.com` (connect-src). Política de privacidad (`privacidad.astro`) documenta el uso condicional. Si `PUBLIC_GA_ID` no está seteado, el banner sigue funcionando en 2 estados y no carga nada. Ver §FASE GA4 arriba para detalle completo.
- [x] **📝 SEO pre-launch (FASE D1+D2+D4+D5, 2026-08-03)** — Cerrados 4 de los 9 items de §6.5 FASE D en un solo batch. (D1) `public/robots.txt` creado con `Disallow: /api/`, `/pedido/`, `/cuenta/`, `/login`, `/registro`, `/checkout`, `/auth/`. (D2) `src/pages/404.astro` con Layout + `noindex` + CTA a home y productos, estilo coherente con el resto del sitio. (D4) `astro.config.mjs`: `site: 'https://vakstoree.com'` + integration `@astrojs/sitemap` con filter que excluye páginas privadas. Sitemap generado con 4 URLs públicas (home, contacto, privacidad, productos). (D5) `src/pages/productos.astro:24` ahora pasa `noindex={Boolean(q || hasFilters)}` al Layout. Description ajustada a "camisetas de fútbol **importadas**" (no originales) en home y catálogo. **Pendientes D6, D7, D8**: migraciones 002/003 en prod, slugs en URLs producto, Schema.org structured data. Los 3 son post-launch.
- [x] **📄 `.env.example` creado (2026-08-03)** — Archivo nuevo con las 16 env vars de §2 documentadas: `PUBLIC_*` agrupadas arriba (visibles al cliente), server-only con warning "NUNCA importar en código del cliente", opcionales al final (Sentry, Upstash, mock mode). Referencia para nuevos devs y para verificar qué env vars son necesarias.
- [x] **📚 AGENTS.md actualizado (2026-08-03)** — §2 (Variables de entorno) extendido con `PUBLIC_GA_ID`. `RESEND_FROM_EMAIL` actualizado de `onboarding@resend.dev` (default) al estado real pre-launch. §6.5 FASE D: items D1, D2, D4, D5 marcados como cerrados con fecha. D3, D6, D7, D8 mantienen su estado. D9 marcado como reemplazado por FASE GA4. Nueva sección §FASE GA4 agregada entre FASE D y FASE E. §6.7 Cambios recientes extendido con 8 nuevas entradas (los 3 bugs del Batch A, link "Ofertas" eliminado, dominio, Google OAuth, GA4, SEO, `.env.example`, este mismo update).
- [x] **📊 GA4 implementado en código (2026-08-03)** — Script de gtag.js agregado a `Layout.astro` con carga **condicional al consentimiento** del CookieBanner. El `<script is:inline>` chequea `localStorage.getItem('cookie-consent') === 'accepted'` antes de inyectar dinámicamente el script de `googletagmanager.com`. Antes de cargar, dispara `gtag('consent', 'update', { analytics_storage: 'granted' })` para que el consent mode de GA se actualice. CookieBanner (`src/components/CookieBanner.tsx`) actualizado: el texto ahora menciona que "si aceptás, también cargamos Google Analytics para entender cómo usás el sitio y mejorarlo". CSP en `vercel.json` extendido con allowlist de `googletagmanager.com` (script-src) y `google-analytics.com` (connect-src). `PUBLIC_GA_ID=G-8LQZKZ5FM3` documentado en `.env.example` (pendiente setear en Vercel 3 envs).

#### Tabla de status (modelo final 2026-07-30)

| Status | Quién lo setea | Cuándo | Lo que ve el cliente |
|---|---|---|---|
| `pending` | `api/checkout.ts:183` | Cliente eligió MP, aún no pagó | "Esperando confirmación del pago" |
| `awaiting_payment` | `api/checkout.ts:183` | Cliente eligió transfer | "Coordinamos tu envío por WhatsApp" (moto) o "Mandá el comprobante" (CA + transfer) |
| `paid` | Webhook MP o `npm run confirm-order` (transfer) | Pago confirmado | "Pago confirmado — estamos preparando tu pedido" |
| `processing` | Manual (Supabase Dashboard) | Admin está armando el paquete | "Preparando tu pedido — lo despachamos en las próximas horas" |
| `shipped` | Manual (Supabase Dashboard) | Admin llevó el paquete al CA / moto coordinada | "Tu pedido está en camino con Correo Argentino" (sin link) o "Coordinado por moto" |
| `delivered` | Manual (Supabase Dashboard) | Pedido entregado | "Pedido entregado — ¡gracias por tu compra!" |
| `cancelled` | Webhook / cron / checkout | Pago rechazado / transfer expiró / MP preference falló | "Pedido cancelado" |

#### Admin workflow resumido (shipping)

- **Cliente eligió CA + MP**: admin lleva al CA → `UPDATE orders SET status='shipped', shipped_at=now() WHERE id=...`. No se setea `tracking_number`. Cuando confirma entrega → `status='delivered'`.
- **Cliente eligió CA + transfer**: admin recibe comprobante por WA → corre `npm run confirm-order <id>` → status `paid`. Después mismo flow que MP.
- **Cliente eligió moto**: admin coordina por WA → edita `shipping_cost` + `total_amount` en Supabase (post-coordinación) → `npm run confirm-order <id>` → status `paid`. Mismo flow de shipping después.

#### Lo que NO hay (por diseño)

- Sin auto-tracking (no se pega número del CA al sistema)
- Sin webhook del CA (admin hace todo manual desde el panel del CA)
- Sin etiqueta auto-generada (admin usa la del panel del CA)
- Sin integración API del CA (todo manual, precios hardcoded)

### ⏳ Fase 3.10 — Multi-carrier shipping (DESESTIMADO 2026-07-28)

**Origen:** sesión 2026-07-XX con el dueño. Andreani se evaluó como muy
caro para CABA/GBA. Se decidió sumar Correo Argentino (económico) y Uber
Flash (express) para tener 3 opciones por zona y dar flexibilidad de precio.

#### Estado
🔴 **Desestimado 2026-07-28.** Reemplazado por decisión más simple:
**Correo Argentino para todo el país + Motomensajería exclusiva para CABA/GBA**
(coordinada por WhatsApp, pago obligatorio por transferencia). Andreani
completamente fuera. Ver §6.7 "Decisión de envíos + implementación" para
el detalle de la nueva arquitectura. Este documento se conserva solo como
referencia histórica de la evolución de la decisión.
ni datos de precios concretos. Estimado: 1 sesión de 2-3 hs (Opción A
hardcoded) o 3-4 hs (Opción B DB-driven).

#### Preguntas abiertas (responder antes de implementar)

1. **Precios:** ¿Tenés los precios concretos ya de Andreani/Correo/Uber Flash, o arranco con placeholders y ajustamos después?
2. **Carriers:** ¿Confirmás la lista final Andreani + Correo Argentino + Uber Flash? ¿Sumás OCA, MercadoEnvíos, o algún otro?
3. **Express:** ¿Dónde hay Uber Flash? (Solo CABA+GBA, también capitales como Córdoba/Rosario, o todas las zonas)
4. **Tracking de Correo Argentino:** ¿Soportar el link de tracking aunque el sitio de ellos sea lento/lento, o mostrar "consultar por WhatsApp"?
5. **Default pre-seleccionado en el checkout:** ¿El más barato (recomendado), el más rápido, o Andreani fijo?
6. **Storage:** ¿Hardcoded en código (rápido, ~1-2 hs) o tabla DB (más flexible, ~3-4 hs)?
7. **Timing:** ¿Implementar ANTES del launch (ventaja competitiva desde día 1) o DESPUÉS (lanzamos con Andreani solo y sumamos en 1-2 semanas)?

#### Diseño acordado (resumen)

**Data layer — Opción A (hardcoded, recomendado para v1):**
- `src/lib/shippingOptions.ts` (nuevo) — array de ~15-20 opciones
- Cada opción: `{ id, zoneId, carrier, serviceType, name, description, price, eta, displayOrder }`
- Helpers: `getOptionsForZone(zoneId)`, `getOptionById(id)`, `getZoneForOptionId(id)`

**Data layer — Opción B (DB-driven, para Fase 4+):**
- Reutilizar tabla `shipping_methods` con columnas adicionales: `zone_id`, `carrier`, `service_type`, `eta`, `display_order`
- Editar precios desde Supabase Dashboard sin redeploy

**Carriers (`src/lib/carriers.ts`):**
- Agregar `'uber_flash'` al `CarrierId` union type
- Uber Flash NO tiene tracking URL público (el conductor te llama) → `getTrackingUrl()` devuelve `null` para ese carrier
- Decidir: ¿mostrar "Sin seguimiento online" en la card de tracking o no mostrar card?

**API (`src/pages/api/shipping/quote.ts`):**
- Cambiar firma: de `{ detected, options: zones[] }` a `{ detected, options: shippingOptions[] }`
- Devuelve TODAS las opciones activas para la zona del CP (no la lista de zonas como hoy)
- Fallback: si no hay opciones para la zona, devuelve las opciones de `nacional`

**Checkout UI (`src/components/CheckoutForm.tsx`):**
- Sección 3 ("Método de envío") pasa de 1 card a N cards (1 por opción disponible para la zona)
- Cada card muestra: nombre del carrier + service type (ej. "Andreani Estándar" / "Correo Argentino" / "Uber Flash (moto)"), ETA (ej. "24-48h hábiles" / "Mismo día"), precio
- Default preseleccionado: el más barato (configurable)
- El `shippingMethod` que se manda al server ahora es el `option.id` (ej. `caba-andreani-std`)

**Server validation (`src/pages/api/checkout.ts:54-61`, C14):**
- Validar que el `optionId` exista en `SHIPPING_OPTIONS`. Si no, 400.
- Extraer del option: `price`, `carrier`, `zoneId`, `serviceType`
- Guardar en la order: `shipping_method = optionId`, `shipping_cost = price`, `carrier = carrier` (¡campo que ya existe!), `shipping_zone = zoneId` (campo nuevo, opcional), `shipping_service_type = serviceType` (campo nuevo, opcional)
- **Importante:** cambia la semántica de `shipping_method` — antes era zoneId, ahora es optionId. Backwards compatible porque las órdenes viejas tienen NULL.

**OrderTracking (`src/components/OrderTracking.tsx:506`):**
- Cambiar "Envío · {zone name}" a "Envío · {carrier name} ({service type}) · {eta}"
- Si `carrier === 'uber_flash'` y no hay tracking number, mostrar "Express — el conductor te contacta"

**Migración DB (`scripts/migrations/006_multi_carrier_shipping.sql`):**
- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone text` (nullable, no rompe órdenes viejas)
- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_type text` (nullable)
- `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_carrier_check` + nueva constraint que acepte `'andreani' | 'correo_argentino' | 'uber_flash'`
- Aplicar con `NOTIFY pgrst, 'reload schema'` + verificar con `information_schema.columns`

**Admin workflow:**
- Cliente eligió Andreani o Correo Argentino → flow actual (admin carga en el panel del carrier, pega tracking)
- Cliente eligió Uber Flash → el admin marca `status='shipped'` y luego `status='delivered'` directamente (no hay tracking number que pegar)
- Esto último requiere un panel admin mínimo O seguir editando a mano en Supabase Dashboard

#### Edge cases a tener en cuenta

| Caso | Comportamiento esperado |
|---|---|
| Zona con 0 opciones | Fallback a opciones de `nacional` |
| Cliente cambia CP entre zonas (mismo checkout) | Refrescar lista de opciones automáticamente |
| Express no disponible en zona (ej. Patagonia) | No incluir Uber Flash para esa zona, solo 1-2 opciones estándar |
| Uber Flash no tiene tracking | Mostrar mensaje "Express — el conductor te contacta por WhatsApp" en lugar de card violeta de tracking |
| Cliente eligió Uber Flash y el admin confirma manualmente | `status='shipped'` → `status='delivered'` directo, sin pegar tracking number |
| Cambio de opción de envío post-orden | Fuera de scope. Si el cliente quiere cambiar, se cancela la orden y se crea una nueva. |

#### Estructura del array `SHIPPING_OPTIONS` (ejemplo parcial)

```ts
// ~15-20 entries de este estilo
{ id: 'caba-andreani-std', zoneId: 'caba', carrier: 'andreani',
  serviceType: 'standard', name: 'Andreani Estándar',
  description: 'Entrega en domicilio',
  price: 3000, eta: '24-48h hábiles', displayOrder: 1 }
{ id: 'caba-oca-std', zoneId: 'caba', carrier: 'correo_argentino',
  serviceType: 'standard', name: 'Correo Argentino',
  description: 'Entrega en domicilio, opción económica',
  price: 2500, eta: '3-5 días hábiles', displayOrder: 2 }
{ id: 'caba-uber-flash', zoneId: 'caba', carrier: 'uber_flash',
  serviceType: 'express', name: 'Uber Flash (moto)',
  description: 'Envío express, mismo día',
  price: 5500, eta: '2-4 horas', displayOrder: 3 }
```

#### Diferido a fase futura

- Migración a Opción B (DB-driven) cuando volumen supere ~15 envíos/semana
- Integración con EnvioPack para auto-quote (cuando supere 15-20 envíos/semana)
- Multi-carrier en checkout con MercadoEnvíos (envío nativo de Mercado Pago)
- Panel admin propio para editar precios y gestionar órdenes (hoy Supabase Dashboard + CLI)
- Auto-update de `status='shipped'/'delivered'` vía webhooks del carrier (hoy paste manual)

### 📮 Integración futura con API de MiCorreo (pendiente de API key)

**Estado**: 🟡 Bloqueado. Esperando que el dueño obtenga la API key de MiCorreo
(API moderna B2C de Correo Argentino). Cuando llegue, se reemplaza el pricing
hardcoded de `shippingZones.ts` por cotización en vivo desde la API.

#### Decisiones tomadas (2026-07-28)
- **API específica**: MiCorreo (la plataforma B2C moderna de Correo Argentino).
  Necesitamos el doc de la API cuando llegue la key (probablemente Bearer token,
  request con CP + peso + dimensiones, response con precio + ETA).
- **Pesos por categoría** (Opción C): camiseta, short y campera con pesos distintos
  definidos en una constante. Medidas estándar (a definir cuando se sepa la API).
- **Alcance v1**: solo cotización en checkout. Tracking + etiqueta se quedan manuales
  (admin sigue operando desde el panel de CA). Cuando el volumen lo justifique, sumar
  tracking y generación de etiqueta.
- **Fallback si la API falla**: tratar como moto flow. La UI muestra "No pudimos
  calcular el envío, coordinamos por WhatsApp" y obliga a pagar con transferencia
  (mismo patrón que motomensajería). El admin coordina por WA y edita
  `shipping_cost` y `total_amount` en Supabase Dashboard. Decisión del dueño
  2026-07-28: "mejor coordinar por WhatsApp" antes que degradar a precios hardcoded.

#### Decisiones pendientes
- **Caching**: TBD. 24h en memoria vs Redis vs sin cache.
- **Tracking + label integration**: diferido. Admin sigue pegando `tracking_number` a
  mano en Supabase Dashboard (flow actual de Fase 3.6).

#### Plan tentativo (cuando llegue la key)

1. `src/lib/correoArgentino.ts` — cliente MiCorreo API + tipos.
2. `src/lib/correoArgentinoCache.ts` — cache CP+weight → price (TTL ~24h, opcional).
3. Env var: `CORREO_ARGENTINO_API_KEY` (server only).
4. Modificar `/api/shipping/quote`:
   - Intentar MiCorreo API primero.
   - Si falla → cambiar el resultado a "fallback mode": la option de correo muestra
     `price: null` (igual que moto) + flag `source: 'fallback'`. El checkout muestra
     la UI de "coordinar por WhatsApp" en lugar del precio.
   - Forzar `paymentMethod='transfer'` si la option es fallback.
5. UI: mostrar "Precio real de Correo Argentino" si la API responde OK, o
   "Coordinamos por WhatsApp" si la API falla. Mismo render que moto.
6. Logging de fallos para detectar rate limits / downtime.
7. (Opcional) Cron que refresca precios cada 24h para tener cache caliente.

#### Impacto en código actual
- `shippingOptions.ts` se mantiene tal cual (capa "1 zona → N carriers"). Agregar
  un flag opcional `source?: 'api' | 'fallback' | 'hardcoded'` en `ShippingOption`.
- `shippingZones.ts` pasa a ser **fuente secundaria** (precio "hardcoded" cuando
  la API está OK pero para fallback y zonas no soportadas por MiCorreo).
- El checkout UI necesita un nuevo branch: si la option tiene `source='fallback'`,
  mostrar la misma card que moto (dashed border ámbar, "A coordinar").
- El OrderTracking ya tiene el statusHeroMoto que se puede reutilizar para
  fallback (mismo flow: coordinar por WA, transfer, admin edita shipping_cost).
- El email ya tiene el branch `mode: 'moto'` que se puede reutilizar para fallback.
  Considerar agregar un `mode: 'moto' | 'fallback'` o unificar todo bajo un solo
  `mode: 'coordinate_by_wa'`.
- Moto no se toca (es flow aparte, no pasa por CA).

#### Diferido a fase futura
- Webhook de MiCorreo para auto-update de `status='shipped'/'delivered'` (hoy paste
  manual en Supabase Dashboard, flow de Fase 3.6).
- Auto-generación de etiqueta PDF desde la API (hoy la da el panel de CA).
- Migración a `product_variants.weight` + `product_variants.dimensions` (Opción B del
  Q2) si se necesita más precisión que las medidas estándar por categoría.

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

### ✅ Fase 3.6 — Envíos por zona + tracking manual

> **Cerrado en código 2026-06-30.** Pendiente: aplicar `scripts/migrations/003_add_tracking.sql` en Supabase Dashboard.

**Decisión clave:** NO se integró EnvioPack. Con <5 envíos/semana y operatoria
de "llevar a la sucursal del carrier", el fee por envío + complejidad de la API
no se justificaban. Se optó por un **"EnvioPack casero"**: pricing por zona +
tracking manual pegado desde el panel del carrier. La etiqueta física la entrega
el propio carrier al momento de cargar el envío; no generamos etiqueta propia.

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
- `scripts/migrations/003_add_tracking.sql`

#### Archivos modificados
- `src/lib/checkoutSchema.ts` (quitado `shippingCost` del input, ahora solo `shippingMethod`)
- `src/pages/api/checkout.ts` (server computa `shippingCost` desde `getZoneCost(shippingMethod)`)
- `src/components/CheckoutForm.tsx` (debounced lookup de zona por CP, ver C15)
- `src/components/CheckoutForm.module.css` (estilos `.shippingCard*`, `.summaryBreakdown` con nombre de zona)
- `src/lib/types.ts` (campos `carrier`, `tracking_number`, `shipped_at` en `Order`)
- `src/pages/api/orders/[id].ts` (query extendida con los 3 campos nuevos)
- `src/components/OrderTracking.tsx` (render `trackingCard`)
- `src/components/OrderTracking.module.css` (estilos `.tracking*`)

#### Cambios en flujo existente
- El submit del checkout ya no manda `shippingCost` (lo calcula el server)
- El summary del checkout ahora muestra `Envío · {nombre de zona}` en vez de solo "Envío"
- `OrderTracking` muestra tracking card cuando hay carrier + tracking_number

#### Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Tabla de CP desactualizada (nuevos CPs) | Fallback a `nacional` $5.000 cubre el caso |
| Lookup servidor vs cliente desincronizado | Server recalcula siempre, ignora `shippingCost` del client |
| Tracking paste manual → typos | El URL pattern se genera server-side, solo se pastea el número |
| User sin CP o CP inválido | UI muestra "Envío estándar" + hint "Ingresá tu CP para ver el costo exacto" |

#### Diferido a fase futura
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
- [x] **R-404** — *Cerrado 2026-07-28.* Creado `src/pages/auth/update-password.astro` + `src/components/UpdatePasswordForm.tsx` (8 chars min, confirm password, session check on mount → redirect a `/login?error=invalid_recovery_link` sin sesión). LoginForm ahora muestra mensaje contextual para `?reset=ok` (success) y `?error=invalid_recovery_link` (error específico). C27 también cerrado: `UPDATE_PASSWORD_PATH` + `AUTH_CALLBACK_PATH` centralizados en `src/lib/auth.ts`, AuthStore importa de ahí en vez de hardcodear. Pendiente: A3 test E2E del dueño, A2/A4 config Google OAuth.
- [ ] **G-OAuth** — *Descubierto 2026-07-27.* Click "Continuar con Google" en `/login` no redirige a Google. El código parece OK (`AuthStore.ts:73-78` usa `signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })` + `callback.astro` hace `exchangeCodeForSession`). 99% problema de config aguas arriba:
  **Fix:** ver FASE A2+A4 del §6.2 para paso a paso. Sin cambios de código. Estimado dueño: 5-20 min según estado actual de la config.
- [x] **G-CB** — *Cerrado 2026-07-28.* Después de configurar Google OAuth (G-OAuth resuelto por el dueño), el callback fallaba con `PKCE code verifier not found in storage` y dejaba al user en `/login?error=...` sin completar el login. Causa raíz: `src/pages/auth/callback.astro` corría el `exchangeCodeForSession` en un `<script>` client-side, pero el PKCE code verifier no estaba disponible en el browser storage después del redirect cross-site de Google. Fix: `callback.astro` ahora hace el exchange **server-side** en el frontmatter usando `getSupabaseServer(Astro)` (que ya existía, AGENTS.md §7 convención). Bonus: `src/lib/supabaseServer.ts:33-36` `setAll` ahora pasa las `options` del library (`SameSite`, `Secure`, etc.) en vez de hardcodear `path: '/'` — el library setea `SameSite=None; Secure` en producción para que las cookies de session sobrevivan el redirect. También se agregó soporte `?next=` en el callback (LoginForm lee `?redirect=` y lo pasa como `?next=` al iniciar el OAuth). C28 y C29 cerrados.
- [x] **P-Focus** — *Cerrado 2026-07-28.* En `/registro`, el input de contraseña perdía focus al tipear la primera letra, obligando al user a hacer click de nuevo para seguir tipeando (experiencia tosca). Causa raíz: `Field` (`src/components/Primitives/Field.tsx:46-65`) tiene 3 code paths según `Children.toArray(children).length` (0, 1, 2+). El strength meter de `RegisterForm.tsx:148-158` se renderizaba como `{password.length > 0 && <div>...</div>}`, cambiando el length de children de 1 a 2 entre renders. React re-montaba el `PasswordInput` (y su `<input>` interno), perdiendo el focus. Fix: envolver el strength meter en un `<div>` siempre presente con `style={{ display: password.length > 0 ? 'block' : 'none' }}`. Estructura estable (siempre 2 children), reconciliación preserva la instancia, focus intacto. C30 cerrado.
- [x] **P-Strength** — *Cerrado 2026-07-28.* `getPasswordStrength` en `RegisterForm.tsx:12-21` mostraba "Fuerte" para contraseñas de 1-5 chars. Causa: los 3 checks de score fallaban (no llegaba a 6 chars) → `score=0`. El `if (score === 1)` y `if (score === 2)` no matcheaban, entonces caía al `return { score: 3, label: 'Fuerte' }` final (fall-through cubría score 0). Fix: agregar caso explícito `if (score === 0) return { score: 0, label: 'Muy débil' }` antes de los otros. C31 cerrado.
- [x] **V-Login** — *Cerrado 2026-07-28.* Después de verificar el email, Supabase redirigía a la Site URL (la home) en vez de una página que manejara la sesión. Resultado: el user quedaba sin loguear, tenía que ir manualmente a `/login`. Causa: `signUp` en `AuthStore.ts` y `auth.ts` no seteaba `emailRedirectTo`, y `/auth/verificacion.astro` era una página estática sin lógica de auth. Fix: 2 cambios. (1) `signUp` ahora setea `emailRedirectTo: ${origin}/auth/verificacion` para que el redirect post-confirm vaya a una página controlable. (2) `/auth/verificacion` ahora es un React component (`src/components/Verificacion.tsx`) que llama `supabase.auth.getSession()` en mount — si hay sesión (post-confirm) redirige a `/`, si no muestra "Revisá tu email". C32 cerrado. Pendiente: customizar el template del email en Supabase Dashboard (ver pregunta del dueño sobre "como tocamso los templates del mail").
- [x] **1.5** — Validar `customerEmail` antes de `sendOrderConfirmationEmail` y `sendOrderCancelledEmail` (string vacío → Resend falla silenciosamente). Aplicado en `src/lib/email.ts:90-117` y `:145-172`.
- [x] **2.3** — Validar `dataId` con regex `/^\d+$/` antes de `payment.get()` (webhooks de prueba de MP con id `"0"` o vacío → 500). Aplicado en `src/pages/api/webhooks/mercadopago.ts:208-220`.
- [ ] **3.5** — **Resend no manda emails a clientes reales (descubierto 2026-06-29)**. `RESEND_FROM_EMAIL=vakindumentaria@gmail.com` no es viable: Resend requiere un dominio propio verificado (gmail.com no se puede verificar). Descubierto durante validación del path oversell: el refund salió OK pero el email de cancelación nunca llegó (403 validation_error). **Fix:** comprar/registrar un dominio (NIC.ar, Namecheap, etc.), agregarlo en resend.com/domains, seguir el wizard de verificación DNS (DKIM + SPF), y cambiar `RESEND_FROM_EMAIL` a `algo@<dominio>`. No requiere cambios de código. Bloquea Fase 3.5 (transfer + shipping) que depende de emails a clientes. **Estado al cierre de Fase 3.5:** código cerrado, la card de datos bancarios en `/pedido/[id]` muestra la info client-side, pero el email con las instrucciones no llega a clientes reales hasta resolver bug 3.5. Resuelve FASE B1.
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
- [ ] **CA-código** — *Agregado 2026-07-30.* Verificar post-launch si Correo Argentino emite **código/comprobante de admisión** cuando se entrega un paquete en modalidad "particular" (no es número de tracking, es el recibo que da el CA al admitir el paquete). Si emite y es estable: capturar en `orders.ca_admission_code` (migración nueva) y mostrarlo en la card de `shipped` para que el cliente tenga una referencia. Si CA no emite nada en esa modalidad, dejar como está (cliente solo ve "en camino"). No bloquea el launch.
- [ ] **C28** — *Descubierto 2026-07-28.* Posible bug de hydration en el carrito. Reportado en
  local: el cart aparece vacío en `/checkout` (early return `if (items.length === 0)` en
  `CheckoutForm.tsx:128`) incluso después de agregar items. El cart store, el hook y el
  CartIsland no fueron tocados en la refactorización de envíos (Fase X), así que es un bug
  pre-existente o un artefacto del HMR del dev server. Diagnosticar con:
  (1) DevTools → Application → Local Storage → `http://localhost:4321` → key `vak-cart`,
      ¿existe? ¿tiene items?
  (2) DevTools → Console → ¿errores rojos?
  (3) Hard refresh (Ctrl+Shift+R) → ¿se arregla?
  Fix preventivo propuesto: agregar patrón `hasMounted` en `CheckoutForm.tsx` para no
  renderizar el empty state hasta confirmar que el cart está realmente vacío del lado
  del cliente (~15 líneas).

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
| **C18** | `src/pages/api/checkout.ts:225-242` | `void sendAdminOrderNotification(...)` (fire-and-forget) | Notificación al admin no bloquea el checkout. Si Resend falla, el cliente igual completa la compra. |
| **C19** | `src/lib/provinces.ts:detectProvinceFromCity` | Normalización NFD + lowercase antes de keyword match | "Córdoba" y "cordoba" matchean el mismo keyword. Resiliente a tildes y mayúsculas. |
| **C20** | `src/components/CheckoutForm.tsx:60-76` | Province auto-fill solo si `!form.province` (no sobrescribe selección manual del user) | El user puede cambiar la provincia si la detección del CP está mal, y la app no la pisa. |
| **C21** | `src/components/Nav.astro:8-22` | `isCurrent()` valida query params del href (no solo `pathname.startsWith(path)`) | Sin esto, links con query string (ej. `/productos?sale=true`) se marcan activos en cualquier página que matchee el path. También incluye `split('#')` para que links con hash (ej. `/cuenta#contacto`) matcheen correctamente. |
| **C22** | `src/components/WhatsAppFloat.module.css:5` | `z-index: 200` (por encima del cookie banner que tiene 100) | El WhatsApp float quedaba visualmente tapado por el banner de cookies en la primera visita. Si se baja el z-index, vuelve el bug. |
| **C23** | `src/styles/reset.css:9-23` | `scroll-padding-top: var(--header-height)` en `<html>` | Sin esto, los anchor links quedaban tapados por el Nav sticky (72px desktop / 64px mobile). El browser scrollea al anchor pero el header lo cubre. Ver Fase 3.8. |
| **C24** | `src/styles/a11y.css:1-26` | Skip-link con `opacity:0` + `pointer-events:none` y solo `:focus-visible` (no `:focus`) | El patrón `transform: translateY(-200%)` + `:focus` hacía que el skip-link apareciera al volver con back/forward del browser o cargar con `#hash` en URL. Ver Fase 3.8. |
| **C25** | `src/pages/api/products/index.ts:18-23` | Sanitización de `q` (search query): trim + slice 100 chars + remover `,."()\\` antes de pasar a PostgREST `.or()` | Defensivo contra inputs raros. `%` y `_` se mantienen como wildcards de ILIKE (feature). El `.or()` parsea el string con sintaxis PostgREST, por eso hay que remover los chars que romperían el parse. Ver Fase 3.8. |
| **C26** | `src/components/SearchBar.tsx:36-41` | Submit hace `window.location.href` (no `pushState` + `setFilters`) | El SearchBar está en el Nav y no escucha `filterschange`. Si se removiera `q` desde el FilterSidebar con `pushState`, el input del Nav quedaría desincronizado. `window.location.href` recarga la página y sincroniza todo. |
| **C27** | `src/lib/auth.ts` (constantes) | `UPDATE_PASSWORD_PATH` + `AUTH_CALLBACK_PATH` exportadas | Resuelto junto a R-404 (2026-07-28). AuthStore importa de `auth.ts` en vez de hardcodear. Helper `getOrigin()` agregado (SSR-safe: `window.location.origin` en cliente, `PUBLIC_SITE_URL` en server). |
| **C28** | `src/lib/supabaseServer.ts:33-36` | `setAll` ahora pasa `options` del library (`SameSite`, `Secure`, etc.) en vez de descartar y setear solo `path: '/'` | Resuelto junto a G-CB (2026-07-28). Antes el `setAll` ignoraba las options que `@supabase/ssr` recomienda, dejando las cookies de session con defaults que pueden no sobrevivir redirects cross-site. |
| **C29** | `src/pages/auth/callback.astro` | OAuth callback debe ser server-side, no client-side | Resuelto junto a G-CB (2026-07-28). El `<script>` original corría `exchangeCodeForSession` en el browser, donde el PKCE code verifier no estaba disponible después del redirect de Google. El fix: frontmatter server-side usa `getSupabaseServer(Astro)` para que el server lea las cookies del request y complete el exchange. Soporta `?next=` para redirigir post-login. |
| **C30** | `src/components/Primitives/Field.tsx:46-65` | Field con children condicionales debe mantener estructura estable | Descubierto al diagnosticar P-Focus (2026-07-28). El bug: `Field` tiene 3 code paths según `Children.toArray(children).length` (0, 1, 2+). Si el parent pasa children condicionales (`{x && <Foo />}`), el length cambia entre renders y React re-monta los children (perdiendo focus en inputs). Fix: envolver children condicionales en un div siempre presente con `display: none` condicional. La estructura queda estable (siempre N children) → reconciliación preserva instancias. |
| **C31** | `src/components/RegisterForm.tsx:12-21` | Funciones de score/rating deben cubrir explícitamente todos los casos, no usar fall-through | Descubierto al diagnosticar P-Strength (2026-07-28). `getPasswordStrength` usaba `if (score === 1) ... if (score === 2) ... return score 3` como fall-through, lo que hacía que `score=0` (contraseñas de 1-5 chars) se mostrara como "Fuerte". Patrón general: si una función tiene un set discreto de valores posibles (score 0-3, enum, etc.), cubrir cada uno con un `if`/`switch` explícito. El `return` final solo debería cubrir el caso por defecto esperado, no valores "no pensados". |
| **C32** | `src/pages/auth/verificacion.astro` | Páginas de auth flow deben detectar sesión post-redirect | Resuelto junto a V-Login (2026-07-28). Después del email confirmation, Supabase redirige al `emailRedirectTo` con la sesión en el URL hash. La página `/auth/verificacion` debe ser un React component que llame `supabase.auth.getSession()` en mount; si hay sesión → `window.location.href = '/'`, si no → mostrar el mensaje de "revisá tu email". Mismo patrón que OAuth callback. El static Astro page no procesaba el hash → user quedaba sin loguear. |

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
