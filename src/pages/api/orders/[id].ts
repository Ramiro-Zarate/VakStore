import type { APIRoute } from 'astro'
import { timingSafeEqual } from 'node:crypto'
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin'
import { rateLimit, getClientIdentifier } from '../../../lib/rateLimit'

export const prerender = false

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.toLowerCase().trim())
  const bb = Buffer.from(b.toLowerCase().trim())
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export const POST: APIRoute = async ({ params, request }) => {
  const ip = getClientIdentifier(request)
  const rl = await rateLimit('order-track', ip, 10, '1 m')
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

  const { id } = params

  if (!id || !UUID_REGEX.test(id)) {
    return new Response(JSON.stringify({ error: 'Invalid order id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const email = body.email?.trim()
  if (!email || !EMAIL_REGEX.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select(`
      id,
      status,
      total_amount,
      created_at,
      shipping_address,
      shipping_city,
      shipping_postal_code,
      email,
      order_items (
        id,
        product_variant_id,
        quantity,
        unit_price,
        product_variants (
          size,
          version,
          product (
            name,
            image_url
          )
        )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  const order = data as unknown as {
    id: string
    status: string
    total_amount: number
    created_at: string
    shipping_address: string | null
    shipping_city: string | null
    shipping_postal_code: string | null
    email: string | null
    order_items?: Array<{
      id: string
      product_variant_id: string
      quantity: number
      unit_price: number
      product_variant?: {
        size: string
        version: string
        product?: { name: string; image_url: string | null }
      }
    }>
  } | null

  if (error) {
    console.error('[orders/[id]] supabase error', error)
    return new Response(JSON.stringify({ error: 'Lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!order) {
    return new Response(JSON.stringify({ error: 'Pedido no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!order.email || !safeEqual(order.email, email)) {
    return new Response(JSON.stringify({ error: 'El email no coincide con este pedido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ order }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
