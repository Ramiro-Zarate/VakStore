# Audit post-debug MP — 2026-06-11

Sesión de debug sobre rechazos de webhook en Vercel. Reemplaza el audit doc
anterior (`post-compra-2026-06-09.md`, que no estaba en el repo).

---

## 1. Contexto

- **Fecha**: 2026-06-11
- **Trigger**: Vercel log mostrando rechazos por `SignatureMismatch` en
  webhooks de MP. Loop de 401 → MP reintenta → 401.
- **Cuenta de MP**: ~50% de onboarding. El panel de notificaciones solo permite
  registrar webhooks de tipo `merchant_order` (no `payment`). Esto se intentó
  cambiar en sesiones previas sin éxito.
- **Estado del código al momento del bug**: Fase 2.5 cerrada (SDK v3 oficial,
  `WebhookSignatureValidator`, idempotencia, refund oversell). El webhook
  asumía `topic=payment`.

---

## 2. Bug crítico: Webhook `topic=merchant_order` no soportado

### 2.1 Log raw (Vercel, 2026-06-11 15:24:25)

```
[info] [webhook] raw inputs {
  url: 'https://vak-store.vercel.app/api/webhooks/mercadopago?id=41734750025&topic=merchant_order',
  apiVersion: 'v3',
  bodyKeys: [ 'resource', 'topic' ],
  bodyData: undefined,
  body: { resource: 'https://api.mercadolibre.com/merchant_orders/41734750025', topic: 'merchant_order' }
}
[info] [webhook] validating signature {
  apiVersion: 'v3',
  dataId: '41734750025',
  dataIdSource: 'query_id',
  xSignatureLength: 81,
  xSignaturePrefix: 'ts=1781191465,v1=6a4',
  xRequestId: 'e751f0cd-260f-42fb-91f0-d18dfdcf1fda',
  bodyLength: 96
}
[error] [webhook] sdk signature rejected {
  reason: 'SignatureMismatch',
  xRequestId: 'e751f0cd-260f-42fb-91f0-d18dfdcf1fda',
  dataId: '41734750025',
  ts: '1781191465',
  xSignatureLength: 81
}
[warning] [webhook] signature rejected { reason: 'SignatureMismatch', dataId: '41734750025', ... }
```

### 2.2 Causa raíz (doble)

**Causa 1 — Firma rechazada por la SDK**:
- `WebhookSignatureValidator.validate()` de la SDK de MP está calibrada para
  `topic=payment`. El `id` que espera en el manifest HMAC es un `payment_id`.
- Cuando llega `topic=merchant_order`, el `id=41734750025` del query es un
  `merchant_order_id`. La SDK calcula HMAC contra ese id, pero la firma de MP
  está calculada de forma distinta (probablemente contra el resource URL
  completo o un manifest específico de merchant_order).
- Resultado: `SignatureMismatch`. La SDK no revela más detalle (anti-oráculo).
- **Hipótesis alternativa**: que `MP_WEBHOOK_SECRET` en Vercel no matchee con
  el configurado en el panel de MP. No se descarta sin probar.

**Causa 2 — Downstream rompe aunque la firma pasara**:
- `src/pages/api/webhooks/mercadopago.ts:231` llama
  `payment.get({ id: externalId })` donde `externalId = '41734750025'`.
- MP devuelve 404: ese id es una merchant_order, no un payment.
- El código nunca llega al `processApprovedPayment` y la order queda
  `pending` para siempre.

### 2.3 Por qué no se puede "elegir" qué envía MP

En la cuenta actual, el panel de notificaciones de MP solo permite registrar
webhooks de tipo `merchant_order`. No hay opción v3 pura de `payment` desde
el panel. Se reintentó en sesiones previas (borrar y recrear webhook, cambiar
URL, etc.) sin éxito. La única forma documentada de forzar `topic=payment` es
vía API (`/v1/webhooks`) y requiere permisos que esta cuenta no tiene.

---

## 3. Plan de fix `merchant_order` (NO implementado)

### 3.1 Cambios en `src/pages/api/webhooks/mercadopago.ts`

Estructura target del handler:

```
POST /api/webhooks/mercadopago
  1. parse rawBody + JSON
  2. detectar apiVersion
  3. extraer dataId (igual que hoy)
  4. validar firma HMAC
     - si topic='payment' → SDK oficial (como hoy)
     - si topic='merchant_order' → skip firma (temporal, hasta investigar SDK)
       + log warning a Sentry
  5. branch por tipo de evento:
     - if (body.topic === 'merchant_order' || body.type === 'merchant_order'):
         const mo = await new MerchantOrder(getMpClient()).get({ merchant_order_id: dataId })
         for (const p of mo.payments ?? []) {
           if (!p.id) continue
           if (await alreadyProcessed(p.id)) continue
           await markProcessed(p.id)  // INSERT webhook_events
           const payment = await new Payment(getMpClient()).get({ id: p.id })
           const orderId = payment.external_reference
           if (payment.status === 'approved') {
             await processApprovedPayment(orderId, String(payment.id))
           } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
             await markOrderCancelled(orderId, String(payment.id), payment.status)
           }
         }
         return 200
     - else if (body.type === 'payment'):  // código actual
         ...
  6. return 200
```

### 3.2 Cambios en schema (`webhook_events`)

Cambiar la UNIQUE constraint. Hoy es:

```sql
UNIQUE(provider, external_id)
```

Donde `external_id` se setea con el `dataId` del query (merchant_order_id con
el bug actual). Después del fix, `external_id` será el `payment_id` real:

```sql
-- Migration:
ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_provider_external_id_key;
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_provider_payment_id_key
  UNIQUE(provider, external_id);  -- external_id ahora = payment_id
```

**Por qué**: si `external_id` sigue siendo el merchant_order_id, MP puede
reenviar la misma merchant_order 5 veces y la idempotencia no funciona
(payments internos son los mismos, MO es la misma).

### 3.3 Cambios en panel de MP

- **Nada**. No se puede cambiar el tipo de webhook desde el panel de esta
  cuenta. Se acepta recibir `topic=merchant_order` y se normaliza a nivel
  código.

### 3.4 Testing manual del fix (cuando se implemente)

1. **Happy path — 1 pago aprobado**:
   - Sandbox con tarjeta APRO.
   - Esperar: llega `topic=merchant_order` → handler normaliza → itera 1
     payment con `status='approved'` → `processApprovedPayment` corre → email
     confirmación + stock decrementado.
   - Verificar en Vercel logs: "[webhook] merchant_order received, X payments".

2. **Happy path — multipago** (raro en Vak Store, pero MP lo soporta):
   - 2+ pagos dentro de la misma merchant_order con statuses mixtos
     (1 approved, 1 rejected).
   - Esperar: el approved dispara `processApprovedPayment`, el rejected
     dispara `markOrderCancelled`. El comportamiento compuesto depende del
     orden de procesamiento.

3. **Idempotencia**:
   - MP reenvía el mismo webhook 2 veces.
   - Esperar: segundo intento responde 200 con `already_processed: true`.
   - Verificar en DB: solo 1 row en `webhook_events` con ese `payment_id`.

4. **Refund de un payment dentro de merchant_order**:
   - Pago aprobado → después se solicita refund desde panel de MP.
   - Esperar: MP notifica de nuevo la merchant_order con el payment en
     status `cancelled` (MP no manda payment.cancelled para refunds, solo
     merchant_order) → nuestro handler itera → `markOrderCancelled`.

5. **Firma merchant_order** (sub-tarea aparte):
   - Si se quiere validar firma para merchant_order, hay que implementar la
     validación HMAC manual (no usar la SDK), siguiendo el manifest que MP
     construye para este tipo. Documentación: MP "Webhooks notification
     v1" + spec del manifest.
   - Trabajo estimado: 2-4 horas de investigación + testing.

### 3.5 Riesgos identificados

- **Firma no validada para merchant_order** (temporal): si alguien descubre
  la URL del webhook puede inyectar merchant_orders falsas y disparar
  `processApprovedPayment` para orders que no pagó. Mitigación: el
  `external_reference` se valida contra una order real en DB, y el handler
  aborta si no hay match.
- **Race condition en multipago**: si llegan 2 webhooks merchant_order
  simultáneos con los mismos `payment_id` adentro, el UNIQUE constraint
  protege (segundo insert rompe con 23505).
- **MP puede mandar merchant_order antes que payment**: hoy, con solo el
  branch de payment, el flujo funciona. Con el nuevo branch, el orden de
  eventos no importa: iteramos todos los payments del MO y procesamos cada
  uno.

---

## 4. Catches defensivos no documentados previamente

Detectados en revisión de código durante esta sesión. Listado completo en
`AGENTS.md` sección "🛠 Defensive checks". Resumen:

| # | Ubicación | Resumen |
|---|---|---|
| C1 | `src/pages/api/checkout.ts:161-172` | Compensación: DELETE order si falla INSERT order_items |
| C2 | `src/pages/api/checkout.ts:225-234` | Cancelar order si falla `Preference.create()` en MP |
| C3 | `src/lib/mp.ts:21-30` | `refundPayment` retorna `{ok, error}` union |
| C4 | `src/lib/orderProcessing.ts:50-64` | Idempotencia: early-return en estados terminales |
| C5 | `src/pages/api/orders/[id].ts:11-19` | `timingSafeEqual` con dummy call anti-timing-attack |
| C6 | `src/pages/api/orders/[id].ts:8-9` | Regex UUID/email pre-query |
| C7 | `src/pages/api/products/*` | `.eq('is_active', true)` siempre |
| C8 | `src/pages/api/webhooks/mercadopago.ts:243-252` | Check `external_reference` no-null |
| C9 | `src/stores/CartStore.ts:50-56, 65-69` | try/catch silencioso en localStorage |
| C10 | `src/stores/AuthStore.ts:42-45` | catch en `getSession()` |

---

## 5. Cambios aplicados a `AGENTS.md` en esta sesión

1. Bug list intro actualizada: `post-compra-2026-06-09.md` → `post-compra-2026-06-11.md`.
2. Nuevo bloque "🔴 Crítico — Webhook `topic=merchant_order` no soportado" al
   tope del bug list, con síntoma, causa raíz, fix planeado.
3. Nueva sección "🛠 Defensive checks (catches no catalogados)" con tabla C1-C10.
4. Sección "10. Estado actual de Mercado Pago" actualizada:
   - Webhook ahora con warning ⚠️ (antes era ✅)
   - Agregado 🛑 sobre `MP_MOCK_MODE` como único path real funcionando.
5. Fase 3 actualizada:
   - Item 0 nuevo: "Fix webhook `topic=merchant_order`" (bloqueante real).
   - Lista reordenada por dependencia.
   - Checkbox pendiente agregado en la lista de tasks.

---

## 6. Próximos pasos

1. ~~Documentar el bug y el plan de fix~~ (hecho en este doc).
2. Implementar el fix de merchant_order cuando se destrabe (Fase 3.0).
3. Tests Playwright E2E (Fase 3.1) — depende de 2.
4. Validar firma para merchant_order (sub-tarea del fix, opcional).
5. Completar onboarding de MP al 80%+ y sacar mock mode (externo a este repo).
