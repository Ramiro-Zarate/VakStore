import type { APIRoute } from 'astro'
import * as Sentry from '@sentry/astro'
import { Payment } from 'mercadopago'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getMpClient, getMerchantOrder } from '../../../lib/mp'
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin'
import { processApprovedPayment, markOrderCancelled } from '../../../lib/orderProcessing'

export const prerender = false

const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET

interface MPWebhookBody {
  api_version?: string
  type?: string
  topic?: string
  data?: { id?: string | number }
  resource?: string | number
  action?: string
  user_id?: number | string
  live_mode?: boolean
  date_created?: string
}

type SignatureResult =
  | { ok: true; matchedSource: string; matchedTemplate: string }
  | { ok: false; reason: string }

function verifyMpSignature({
  xSignature,
  xRequestId,
  dataId,
  secret,
}: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secret: string
}): SignatureResult {
  if (!xSignature || !xRequestId || !dataId) {
    return { ok: false, reason: 'missing_headers' }
  }

  try {
    const parts = xSignature.split(',')
    let ts: string | null = null
    let v1Hash: string | null = null
    for (const part of parts) {
      const [k, v] = part.split('=').map(s => s.trim())
      if (k === 'ts') ts = v
      else if (k === 'v1') v1Hash = v
    }
    if (!ts || !v1Hash) {
      return { ok: false, reason: 'malformed_signature' }
    }
    if (!/^\d+$/.test(ts)) {
      return { ok: false, reason: 'malformed_timestamp' }
    }

    const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
    const computed = createHmac('sha256', secret).update(manifest).digest('hex')

    if (computed.length !== v1Hash.length || !timingSafeEqual(Buffer.from(computed), Buffer.from(v1Hash))) {
      return { ok: false, reason: 'signature_mismatch' }
    }

    const tsMs = Number(ts) * 1000
    const driftSeconds = Math.abs(Date.now() - tsMs) / 1000
    if (driftSeconds > 300) {
      return { ok: false, reason: 'timestamp_out_of_tolerance' }
    }

    return { ok: true, matchedSource: dataId, matchedTemplate: 'sdk_official_patched' }
  } catch (err) {
    console.error('[webhook] signature validation error', { err })
    Sentry.captureException(err, { extra: { stage: 'signature_validate' } })
    return { ok: false, reason: 'validation_error' }
  }
}

function isMerchantOrderEvent(body: MPWebhookBody): boolean {
  return body.topic === 'merchant_order' || body.type === 'merchant_order'
}

async function insertWebhookEvent(
  externalId: string,
  body: MPWebhookBody,
  apiVersion: 'v1' | 'v3'
): Promise<{ alreadyProcessed: boolean } | { error: unknown }> {
  const { error: idempotencyError } = await getSupabaseAdmin()
    .from('webhook_events')
    .insert({
      provider: 'mercadopago',
      external_id: externalId,
      payload: body as unknown as Record<string, unknown>
    } as any)

  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      return { alreadyProcessed: true }
    }
    console.error('[webhook] idempotency insert failed', idempotencyError)
    Sentry.captureException(idempotencyError, {
      extra: { stage: 'idempotency_insert', externalId, apiVersion }
    })
    return { error: idempotencyError }
  }

  return { alreadyProcessed: false }
}

async function processSinglePayment(
  paymentId: string,
  apiVersion: 'v1' | 'v3',
  source: 'payment' | 'merchant_order'
): Promise<void> {
  const paymentClient = new Payment(getMpClient())
  let payment
  try {
    payment = await paymentClient.get({ id: paymentId })
  } catch (err) {
    console.error('[webhook] payment lookup failed', { paymentId, source, err })
    Sentry.captureException(err, {
      extra: { stage: 'payment_lookup', paymentId, source, apiVersion }
    })
    return
  }

  const orderId = payment.external_reference
  if (!orderId) {
    console.warn('[webhook] payment without external_reference', {
      paymentId,
      source,
      apiVersion
    })
    return
  }

  const status = payment.status

  if (status === 'approved') {
    const result = await processApprovedPayment(orderId, paymentId)
    if (result.oversell) {
      console.error('[webhook] oversell detected', {
        orderId,
        paymentId,
        source,
        refundStatus: result.refundStatus
      })
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    await markOrderCancelled(orderId, paymentId, status)
  }
}

async function handleMerchantOrder(
  dataId: string,
  body: MPWebhookBody,
  apiVersion: 'v1' | 'v3'
): Promise<Response> {
  console.warn('[webhook] merchant_order received, signature validation skipped (temporary)', {
    dataId,
    apiVersion
  })

  const idempotency = await insertWebhookEvent(dataId, body, apiVersion)
  if ('error' in idempotency) {
    return new Response(JSON.stringify({ error: 'Idempotency check failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  if (idempotency.alreadyProcessed) {
    return new Response(JSON.stringify({ ok: true, already_processed: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let mo
  try {
    mo = await getMerchantOrder(dataId)
  } catch (err) {
    console.error('[webhook] merchant_order lookup failed', { dataId, err })
    Sentry.captureException(err, {
      extra: { stage: 'merchant_order_lookup', dataId, apiVersion }
    })
    return new Response(JSON.stringify({ error: 'Merchant order lookup failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const payments = mo.payments ?? []
  console.log('[webhook] merchant_order payments count', {
    dataId,
    count: payments.length,
    apiVersion
  })

  for (const p of payments) {
    if (!p.id) continue
    await processSinglePayment(String(p.id), apiVersion, 'merchant_order')
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function handleWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text()

  if (!webhookSecret) {
    console.error('[webhook] MP_WEBHOOK_SECRET not configured')
    Sentry.captureMessage('MP_WEBHOOK_SECRET not configured', { level: 'error' })
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let body: MPWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const apiVersion: 'v1' | 'v3' = body.api_version === 'v1' ? 'v1' : 'v3'

  console.log('[webhook] raw inputs', {
    url: request.url,
    apiVersion,
    bodyKeys: body ? Object.keys(body) : null,
    bodyData: body?.data,
    body
  })

  const url = new URL(request.url)
  const queryId = url.searchParams.get('id')
  const queryDataId = url.searchParams.get('data.id')
  const bodyDataId = body.data?.id ? String(body.data.id) : null
  const bodyResource = body.resource ? String(body.resource) : null

  const dataIdSource = queryId
    ? 'query_id'
    : queryDataId
    ? 'query_data_id'
    : bodyDataId
    ? 'body_data'
    : bodyResource
    ? 'body_resource'
    : null

  const dataId = queryId || queryDataId || bodyDataId || bodyResource

  if (isMerchantOrderEvent(body)) {
    if (!dataId) {
      return new Response(
        JSON.stringify({ ok: true, ignored: true, reason: 'merchant_order_no_data_id' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return await handleMerchantOrder(dataId, body, apiVersion)
  }

  console.log('[webhook] validating signature', {
    apiVersion,
    dataId,
    dataIdSource,
    xSignatureLength: request.headers.get('x-signature')?.length,
    xSignaturePrefix: request.headers.get('x-signature')?.slice(0, 20),
    xRequestId: request.headers.get('x-request-id'),
    bodyLength: rawBody.length
  })

  const sigResult = verifyMpSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
    secret: webhookSecret
  })

  if (!sigResult.ok) {
    console.warn('[webhook] signature rejected', {
      reason: sigResult.reason,
      dataId,
      dataIdSource,
      apiVersion,
      action: body.action
    })
    Sentry.captureMessage('Invalid MP webhook signature', {
      level: 'warning',
      extra: {
        reason: sigResult.reason,
        dataId,
        dataIdSource,
        apiVersion,
        action: body.action,
        liveMode: body.live_mode
      }
    })
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  console.log('[webhook] signature verified', {
    matchedSource: sigResult.matchedSource,
    matchedTemplate: sigResult.matchedTemplate,
    dataId,
    dataIdSource,
    apiVersion
  })

  const isPaymentEvent =
    body.type === 'payment' &&
    (apiVersion === 'v3' ||
      !body.action ||
      ['payment.created', 'payment.updated'].includes(body.action))

  if (!isPaymentEvent || !dataId) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!/^\d+$/.test(dataId)) {
    console.warn('[webhook] invalid dataId format, ignoring', {
      dataId,
      dataIdSource,
      apiVersion,
      action: body.action
    })
    Sentry.captureMessage('MP webhook with invalid dataId', {
      level: 'warning',
      extra: { dataId, dataIdSource, apiVersion, action: body.action }
    })
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'invalid_data_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const idempotency = await insertWebhookEvent(dataId, body, apiVersion)
  if ('error' in idempotency) {
    return new Response(JSON.stringify({ error: 'Idempotency check failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  if (idempotency.alreadyProcessed) {
    return new Response(JSON.stringify({ ok: true, already_processed: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  await processSinglePayment(dataId, apiVersion, 'payment')

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    return await handleWebhook(request)
  } catch (err) {
    console.error('[webhook] unhandled error', err)
    Sentry.captureException(err, { extra: { stage: 'unhandled' } })
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
