import type { APIRoute } from 'astro'
import { Preference } from 'mercadopago'
import { mpClient, SITE_URL } from '../../lib/mp'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { checkoutSchema } from '../../lib/checkoutSchema'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
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

  const { items, customer } = parsed.data
  const variantIds = items.map(i => i.variantId)

  const { data: variants, error: variantsError } = await supabaseAdmin
    .from('product_variants')
    .select(`
      id,
      price,
      stock_quantity,
      version,
      size,
      product:products (
        id,
        name
      )
    `)
    .in('id', variantIds)

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
      unit_price: Number(price.toFixed(2))
    })
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: null,
      email: customer.email,
      customer_name: customer.name,
      status: 'pending',
      payment_status: 'pending',
      total_amount: Number(totalAmount.toFixed(2)),
      shipping_address: customer.address,
      shipping_city: customer.city,
      shipping_postal_code: customer.postalCode
    } as any)
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

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map(item => ({ ...item, order_id: orderId })) as any)

  if (itemsError) {
    console.error('[checkout] order_items insert failed', itemsError)
    await supabaseAdmin.from('orders').delete().eq('id', orderId)
    return new Response(JSON.stringify({ error: 'No se pudieron registrar los items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const preference = new Preference(mpClient)

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

    return new Response(
      JSON.stringify({ init_point: result.init_point, orderId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[checkout] MP preference create failed', err)
    const { error: cancelError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'cancelled', payment_status: 'rejected' } as never)
      .eq('id', orderId)
    if (cancelError) console.error('[checkout] order cancel failed', cancelError)
    return new Response(
      JSON.stringify({ error: 'No se pudo inicializar el pago' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
