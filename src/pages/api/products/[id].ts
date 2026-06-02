import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params

    if (!id) {
      return new Response(JSON.stringify({ error: 'Product ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        product_variants (
          *
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600'
      }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
