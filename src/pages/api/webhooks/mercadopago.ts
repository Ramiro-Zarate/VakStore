import type { APIRoute } from 'astro'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Payment } from 'mercadopago'
import { mpClient } from '../../../lib/mp'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendOrderConfirmationEmail } from '../../../lib/email'

export const prerender = false

const webhookSecret = import.meta.env.MP_WEBHOOK_SECRET

interface MPWebhookBody {
  type?: string
  data?: { id?: string | number }
  action?: string
  user_id?: number | string
}

interface OrderItemForEmail {
  product_variant_id: string
  quantity: number
  unit_price: number
  product_variant?: {
    size: string
    version: string
    product?: { name: string } | null
  } | null
}

interface OrderForEmail {
  id: string
  email: string | null
  customer_name: string | null
  total_amount: number
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  order_items?: OrderItemForEmail[]
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

  const { error: idempotencyError } = await supabaseAdmin
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

  const paymentClient = new Payment(mpClient)
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
    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .maybeSingle()

    if (currentOrder && (currentOrder as { status: string }).status === 'cancelled') {
      console.warn('[webhook] payment approved for cancelled order', { orderId })
      return new Response(JSON.stringify({ ok: true, already_cancelled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { data: orderItemsRaw } = await supabaseAdmin
      .from('order_items')
      .select('product_variant_id, quantity')
      .eq('order_id', orderId)

    const orderItems = (orderItemsRaw ?? []) as Array<{ product_variant_id: string; quantity: number }>

    let oversell = false
    for (const item of orderItems) {
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('decrement_stock', {
        p_variant_id: item.product_variant_id,
        p_qty: item.quantity
      } as any)

      if (rpcError) {
        console.error('[webhook] decrement_stock failed', rpcError, item)
        oversell = true
        break
      }
      if (rpcData === 0) {
        console.error('[webhook] oversell detected', item)
        oversell = true
        break
      }
    }

    if (oversell) {
      await (supabaseAdmin
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'rejected',
          payment_intent_id: externalId
        })
        .eq('id', orderId) as any)
    } else {
      await (supabaseAdmin
        .from('orders')
        .update({
          status: 'paid',
          payment_status: 'approved',
          payment_intent_id: externalId
        })
        .eq('id', orderId) as any)

      const { data: orderRaw } = await supabaseAdmin
        .from('orders')
        .select(`
          id, email, customer_name, total_amount,
          shipping_address, shipping_city, shipping_postal_code,
          order_items (
            product_variant_id, quantity, unit_price,
            product_variant (
              size, version,
              product ( name )
            )
          )
        `)
        .eq('id', orderId)
        .maybeSingle()

      if (orderRaw) {
        const order = orderRaw as unknown as OrderForEmail
        const items = (order.order_items ?? []).map(it => ({
          name: it.product_variant?.product?.name ?? 'Producto',
          version: it.product_variant?.version ?? '',
          size: it.product_variant?.size ?? '',
          quantity: it.quantity,
          unitPrice: Number(it.unit_price)
        }))

        await sendOrderConfirmationEmail({
          orderId: order.id,
          customerName: order.customer_name ?? 'Cliente',
          customerEmail: order.email ?? '',
          totalAmount: Number(order.total_amount),
          items,
          shippingAddress: order.shipping_address ?? '',
          shippingCity: order.shipping_city ?? '',
          shippingPostalCode: order.shipping_postal_code ?? ''
        })
      }
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    await (supabaseAdmin
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: status,
        payment_intent_id: externalId
      })
      .eq('id', orderId) as any)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
