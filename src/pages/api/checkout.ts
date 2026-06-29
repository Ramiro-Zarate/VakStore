import type { APIRoute } from 'astro'
import * as Sentry from '@sentry/astro'
import { Preference } from 'mercadopago'
import { getMpClient, SITE_URL } from '../../lib/mp'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { checkoutSchema } from '../../lib/checkoutSchema'
import { processApprovedPayment } from '../../lib/orderProcessing'
import { rateLimit, getClientIdentifier } from '../../lib/rateLimit'
import { bankInfo, whatsappNumber, transferExpiryHours, TRANSFER_DISCOUNT } from '../../lib/bankInfo'
import { sendTransferInstructionsEmail } from '../../lib/email'
import type { OrdersUpdate } from '../../lib/db'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIdentifier(request)
  const rl = await rateLimit('checkout', ip, 5, '1 m')
  if (!rl.success) {
    return new Response(
      JSON.stringify({ error: 'Demasiados intentos. Probá en un minuto.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rl.reset)
        }
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Datos inválidos', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { items, customer, paymentMethod, shippingMethod, shippingCost } = parsed.data
  const variantIds = items.map(i => i.variantId)

  const { data: variants, error: variantsError } = await getSupabaseAdmin()
    .from('product_variants')
    .select(`
      id,
      price,
      stock_quantity,
      version,
      size,
      product:products!inner (
        id,
        name,
        is_active
      )
    `)
    .in('id', variantIds)
    .eq('product.is_active', true)

  if (variantsError) {
    console.error('[checkout] variants lookup failed', variantsError)
    return new Response(JSON.stringify({ error: 'No se pudieron validar los productos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  type VariantRow = {
    id: string
    price: number
    stock_quantity: number
    version: string
    size: string
    product: { id: string; name: string } | null
  }

  const variantsById = new Map<string, VariantRow>(
    ((variants ?? []) as unknown as VariantRow[]).map(v => [v.id, v])
  )

  let totalAmount = 0
  const orderItems: Array<{
    product_variant_id: string
    quantity: number
    unit_price: number
  }> = []
  const mpItems: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
  }> = []

  for (const item of items) {
    const variant = variantsById.get(item.variantId)
    if (!variant) {
      return new Response(
        JSON.stringify({ error: `Producto no disponible: ${item.variantId}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (variant.stock_quantity < item.quantity) {
      return new Response(
        JSON.stringify({
          error: `Stock insuficiente para ${variant.product?.name ?? 'un producto'} (talle ${variant.size})`
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const price = Number(variant.price)
    totalAmount += price * item.quantity

    orderItems.push({
      product_variant_id: variant.id,
      quantity: item.quantity,
      unit_price: price
    })

    mpItems.push({
      id: variant.id,
      title: `${variant.product?.name ?? 'Producto'} - ${variant.version} - Talle ${variant.size}`,
      quantity: item.quantity,
      unit_price: Number(price.toFixed(2)),
      currency_id: 'ARS'
    })
  }

  if (shippingCost > 0) {
    mpItems.push({
      id: 'shipping',
      title: 'Envío',
      quantity: 1,
      unit_price: Number(shippingCost.toFixed(2)),
      currency_id: 'ARS'
    })
  }

  const totalWithShipping = totalAmount + shippingCost
  const isTransfer = paymentMethod === 'transfer'
  const transferDiscount = isTransfer ? totalAmount * TRANSFER_DISCOUNT : 0
  const totalFinal = isTransfer
    ? Number((totalAmount - transferDiscount + shippingCost).toFixed(2))
    : Number(totalWithShipping.toFixed(2))
  const transferExpiresAt = new Date(Date.now() + transferExpiryHours * 60 * 60 * 1000).toISOString()

  const orderInsert: Record<string, unknown> = {
    user_id: null,
    email: customer.email,
    customer_name: customer.name,
    status: isTransfer ? 'awaiting_payment' : 'pending',
    payment_status: 'pending',
    total_amount: totalFinal,
    shipping_address: customer.address,
    shipping_city: customer.city,
    shipping_postal_code: customer.postalCode,
    payment_method: paymentMethod,
    shipping_method: shippingMethod,
    shipping_cost: shippingCost
  }
  if (isTransfer) {
    orderInsert.bank_info_snapshot = bankInfo
    orderInsert.transfer_expires_at = transferExpiresAt
  }

  const { data: order, error: orderError } = await getSupabaseAdmin()
    .from('orders')
    .insert(orderInsert as never)
    .select('id')
    .single()

  if (orderError || !order) {
    console.error('[checkout] order insert failed', orderError)
    return new Response(JSON.stringify({ error: 'No se pudo crear la orden' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const orderId = (order as { id: string }).id

  const { error: itemsError } = await getSupabaseAdmin()
    .from('order_items')
    .insert(orderItems.map(item => ({ ...item, order_id: orderId })) as any)

  if (itemsError) {
    console.error('[checkout] order_items insert failed', itemsError)
    await getSupabaseAdmin().from('orders').delete().eq('id', orderId)
    return new Response(JSON.stringify({ error: 'No se pudieron registrar los items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (isTransfer) {
    const whatsappDigits = whatsappNumber.replace(/[^\d]/g, '')
    const totalFormatted = totalFinal.toLocaleString('es-AR', {
      style: 'currency',
      currency: 'ARS'
    })
    const whatsappText = encodeURIComponent(
      `Hola! Te paso el comprobante de mi pedido #${orderId.slice(0, 8).toUpperCase()} por ${totalFormatted}.`
    )
    const whatsappUrl = `https://wa.me/${whatsappDigits}?text=${whatsappText}`

    console.log('[checkout] transfer order created', {
      orderId,
      total: totalFinal,
      discount: transferDiscount,
      transferExpiresAt
    })

    await sendTransferInstructionsEmail({
      orderId,
      customerName: customer.name,
      customerEmail: customer.email,
      subtotal: totalAmount,
      shipping: shippingCost,
      discount: transferDiscount,
      totalAmount: totalFinal,
      bankInfo,
      whatsappUrl
    })

    return new Response(
      JSON.stringify({
        transfer: true,
        orderId,
        bankInfo,
        whatsappUrl,
        transferExpiresAt
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (import.meta.env.MP_MOCK_MODE === 'true') {
    const mockPaymentId = `MOCK-${orderId.slice(0, 8)}-${Date.now()}`
    const result = await processApprovedPayment(orderId, mockPaymentId)
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: 'No se pudo procesar el pago simulado' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({
        mock: true,
        orderId,
        init_point: `${SITE_URL}/pedido/${orderId}`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const preference = new Preference(getMpClient())

  try {
    const result = await preference.create({
      body: {
        items: mpItems,
        payer: {
          email: customer.email,
          name: customer.name
        },
        external_reference: orderId,
        back_urls: {
          success: `${SITE_URL}/pedido/${orderId}`,
          failure: `${SITE_URL}/checkout?error=payment_failed`,
          pending: `${SITE_URL}/pedido/${orderId}`
        },
        notification_url: `${SITE_URL}/api/webhooks/mercadopago`,
        auto_return: 'approved'
      }
    })

    if (!result.init_point) {
      throw new Error('MP did not return init_point')
    }

    console.log('[checkout] MP preference created', {
      orderId,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      mode: result.sandbox_init_point ? 'sandbox' : 'production'
    })

    return new Response(
      JSON.stringify({ init_point: result.init_point, orderId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[checkout] MP preference create failed', err)
    Sentry.captureException(err, { extra: { stage: 'preference_create', orderId, customerEmail: customer.email } })
    const cancelPayload: OrdersUpdate = { status: 'cancelled', payment_status: 'rejected' }
    const { error: cancelError } = await getSupabaseAdmin()
      .from('orders')
      .update(cancelPayload as never)
      .eq('id', orderId)
    if (cancelError) console.error('[checkout] order cancel failed', cancelError)
    return new Response(
      JSON.stringify({ error: 'No se pudo inicializar el pago' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
