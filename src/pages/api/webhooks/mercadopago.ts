import type { APIRoute } from 'astro'
import * as Sentry from '@sentry/astro'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Payment } from 'mercadopago'
import { getMpClient } from '../../../lib/mp'
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
  | { ok: true }
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

  const parts = xSignature.split(',').map((p) => p.trim())
  let ts: string | null = null
  let hash: string | null = null

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!key || !value) continue
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()
    if (trimmedKey === 'ts') ts = trimmedValue
    else if (trimmedKey === 'v1') hash = trimmedValue
  }

  if (!ts || !hash) return { ok: false, reason: 'malformed_signature' }

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'invalid_ts' }

  const drift = Math.abs(Date.now() / 1000 - tsNum)
  if (drift > 300) return { ok: false, reason: 'expired' }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true }
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
  const dataId =
    url.searchParams.get('data.id') ||
    (body.data?.id ? String(body.data.id) : null)

  console.log('[webhook] validating signature', {
    apiVersion,
    dataId,
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
      apiVersion,
      action: body.action
    })
    Sentry.captureMessage('Invalid MP webhook signature', {
      level: 'warning',
      extra: {
        reason: sigResult.reason,
        dataId,
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

  const externalId = dataId

  const { error: idempotencyError } = await getSupabaseAdmin()
    .from('webhook_events')
    .insert({
      provider: 'mercadopago',
      external_id: externalId,
      payload: body as unknown as Record<string, unknown>
    } as any)

  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      return new Response(JSON.stringify({ ok: true, already_processed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    console.error('[webhook] idempotency insert failed', idempotencyError)
    Sentry.captureException(idempotencyError, {
      extra: { stage: 'idempotency_insert', externalId, apiVersion }
    })
    return new Response(JSON.stringify({ error: 'Idempotency check failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const paymentClient = new Payment(getMpClient())
  let payment
  try {
    payment = await paymentClient.get({ id: externalId })
  } catch (err) {
    console.error('[webhook] payment lookup failed', err)
    Sentry.captureException(err, {
      extra: { stage: 'payment_lookup', externalId, apiVersion }
    })
    return new Response(JSON.stringify({ error: 'Payment lookup failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const externalReference = payment.external_reference
  const status = payment.status

  if (!externalReference) {
    console.warn('[webhook] payment without external_reference', { id: externalId, apiVersion })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const orderId = externalReference

  if (status === 'approved') {
    const result = await processApprovedPayment(orderId, externalId)
    if (result.oversell) {
      console.error('[webhook] oversell detected', { orderId, refundStatus: result.refundStatus })
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    await markOrderCancelled(orderId, externalId, status)
  }

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
