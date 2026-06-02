import { getSupabaseAdmin } from './supabaseAdmin'
import { sendOrderConfirmationEmail } from './email'

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

export interface ProcessApprovedResult {
  success: boolean
  oversell: boolean
}

export async function processApprovedPayment(
  orderId: string,
  paymentId: string
): Promise<ProcessApprovedResult> {
  const supabase = getSupabaseAdmin()

  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .maybeSingle()

  if (currentOrder && (currentOrder as { status: string }).status === 'cancelled') {
    return { success: false, oversell: false }
  }

  const { data: orderItemsRaw } = await supabase
    .from('order_items')
    .select('product_variant_id, quantity')
    .eq('order_id', orderId)

  const orderItems = (orderItemsRaw ?? []) as Array<{ product_variant_id: string; quantity: number }>

  let oversell = false
  for (const item of orderItems) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_stock', {
      p_variant_id: item.product_variant_id,
      p_qty: item.quantity
    } as any)

    if (rpcError) {
      console.error('[orderProcessing] decrement_stock failed', rpcError, item)
      oversell = true
      break
    }
    if (rpcData === 0) {
      console.error('[orderProcessing] oversell detected', item)
      oversell = true
      break
    }
  }

  if (oversell) {
    await (supabase
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'rejected',
        payment_intent_id: paymentId
      })
      .eq('id', orderId) as any)
    return { success: false, oversell: true }
  }

  await (supabase
    .from('orders')
    .update({
      status: 'paid',
      payment_status: 'approved',
      payment_intent_id: paymentId
    })
    .eq('id', orderId) as any)

  const { data: orderRaw } = await supabase
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

  return { success: true, oversell: false }
}

export async function markOrderCancelled(
  orderId: string,
  paymentId: string,
  paymentStatus: string
): Promise<void> {
  await (getSupabaseAdmin()
    .from('orders')
    .update({
      status: 'cancelled',
      payment_status: paymentStatus,
      payment_intent_id: paymentId
    })
    .eq('id', orderId) as any)
}
