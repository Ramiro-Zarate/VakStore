import type { APIRoute } from 'astro'
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin'
import { sendOrderCancelledEmail } from '../../../lib/email'

export const prerender = false

const cronSecret = process.env.CRON_SECRET

export const PUT: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = getSupabaseAdmin()

  const { data: expired, error: fetchError } = await supabase
    .from('orders')
    .select('id, email, customer_name, total_amount')
    .eq('status', 'awaiting_payment')
    .eq('payment_method', 'transfer')
    .lt('transfer_expires_at', new Date().toISOString())

  if (fetchError) {
    console.error('[cron] fetch expired transfers failed', fetchError)
    return new Response(JSON.stringify({ error: 'Fetch failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const list = (expired ?? []) as Array<{
    id: string
    email: string | null
    customer_name: string | null
    total_amount: number
  }>

  if (list.length === 0) {
    console.log('[cron] no expired transfers')
    return new Response(JSON.stringify({ ok: true, cancelled: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let cancelled = 0
  for (const order of list) {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cancelled', payment_status: 'rejected' })
      .eq('id', order.id)

    if (updateError) {
      console.error('[cron] cancel failed', order.id, updateError)
      continue
    }

    cancelled++

    if (order.email && order.email.includes('@')) {
      await sendOrderCancelledEmail({
        orderId: order.id,
        customerName: order.customer_name ?? 'Cliente',
        customerEmail: order.email,
        totalAmount: Number(order.total_amount),
        reason: 'Expiró el plazo para enviar el comprobante de pago por transferencia.',
        refunded: false
      })
    }

    console.log('[cron] transfer cancelled', { orderId: order.id })
  }

  return new Response(JSON.stringify({ ok: true, cancelled }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
