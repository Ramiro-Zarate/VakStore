import type { APIRoute } from 'astro'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Payment } from 'mercadopago'
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

function verifySignature(rawBody: string, signatureHeader: string | null, requestId: string | null): boolean {
  if (!webhookSecret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.split('=') as [string, string])
  )
  const ts = parts.ts
  const hash = parts.v1
  if (!ts || !hash) return false

  const manifest = requestId ? `${ts}.${requestId}.${rawBody}` : `${ts}.${rawBody}`

  const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const receivedBuf = Buffer.from(hash, 'hex')

  if (expectedBuf.length !== receivedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }
  return timingSafeEqual(expectedBuf, receivedBuf)
}

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text()
  const signature = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id')

  if (!verifySignature(rawBody, signature, requestId)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
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
    return new Response(JSON.stringify({ error: 'Idempotency check failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const paymentClient = new Payment(getMpClient())
  let payment
  try {
    payment = await paymentClient.get({ id: Number(externalId) })
  } catch (err) {
    console.error('[webhook] payment lookup failed', err)
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
      console.error('[webhook] oversell detected, refund may be needed', { orderId })
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    await markOrderCancelled(orderId, externalId, status)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
