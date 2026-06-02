import type { APIRoute } from 'astro'
import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

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

  const { data, error } = await supabaseAdmin
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
        product_variant (
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
