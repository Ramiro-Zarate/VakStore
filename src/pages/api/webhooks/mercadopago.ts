import type { APIRoute } from 'astro'
import * as Sentry from '@sentry/astro'
import { Payment, WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago'
import { getMpClient } from '../../../lib/mp'
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin'
import { processApprovedPayment, markOrderCancelled } from '../../../lib/orderProcessing'

export const prerender = false

const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET

interface MPWebhookBody {
  type?: string
  data?: { id?: string | number }
  action?: string
  user_id?: number | string
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

  console.log('[webhook] raw inputs', {
    url: request.url,
    bodyKeys: body ? Object.keys(body) : null,
    bodyData: body?.data,
    body
  })

  const dataId = body.data?.id ? String(body.data.id) : null

  console.log('[webhook] validating signature', {
    dataId,
    dataIdType: typeof body.data?.id,
    xSignatureLength: request.headers.get('x-signature')?.length,
    xSignaturePrefix: request.headers.get('x-signature')?.slice(0, 20),
    xRequestId: request.headers.get('x-request-id'),
    bodyLength: rawBody.length
  })

  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
      dataId,
      secret: webhookSecret,
      toleranceSeconds: 300
    })
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      console.warn('[webhook] signature rejected', { reason: err.reason, requestId: err.requestId })
      Sentry.captureMessage('Invalid MP webhook signature', {
        level: 'warning',
        extra: { reason: err.reason, requestId: err.requestId, dataId }
      })
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    console.error('[webhook] signature validation error', err)
    Sentry.captureException(err, { extra: { stage: 'signature_validation', dataId } })
    return new Response(JSON.stringify({ error: 'Signature validation failed' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (body.type !== 'payment' || !body.data?.id) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const externalId = String(body.data.id)

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
    Sentry.captureException(idempotencyError, { extra: { stage: 'idempotency_insert', externalId } })
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
    Sentry.captureException(err, { extra: { stage: 'payment_lookup', externalId } })
    return new Response(JSON.stringify({ error: 'Payment lookup failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const externalReference = payment.external_reference
  const status = payment.status

  if (!externalReference) {
    console.warn('[webhook] payment without external_reference', { id: externalId })
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
