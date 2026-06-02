import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'
import type { ProductWithVariants } from '../../../lib/types'

export const prerender = false

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const { searchParams } = url
    const category = searchParams.get('category')
    const league = searchParams.get('league')
    const size = searchParams.get('size')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const featured = searchParams.get('featured')

    let variantsQuery = supabase.from('product_variants').select('product_id')

    if (league) variantsQuery = variantsQuery.eq('league', league)
    if (size) variantsQuery = variantsQuery.eq('size', size)
    if (minPrice) variantsQuery = variantsQuery.gte('price', Number(minPrice))
    if (maxPrice) variantsQuery = variantsQuery.lte('price', Number(maxPrice))

    let productIds: string[] | null = null
    const hasVariantFilter = league || size || minPrice || maxPrice

    if (hasVariantFilter) {
      const { data: variantRows, error: variantError } = await variantsQuery
      if (variantError) {
        return new Response(JSON.stringify({ error: variantError.message }), {
          status: 500,
          headers: CACHE_HEADERS
        })
      }
      productIds = Array.from(new Set((variantRows ?? []).map((r: any) => r.product_id)))
      if (productIds.length === 0) {
        return new Response(JSON.stringify({ products: [] }), {
          status: 200,
          headers: CACHE_HEADERS
        })
      }
    }

    let query = supabase
      .from('products')
      .select(`
        *,
        product_variants (
          *
        )
      `)
      .eq('is_active', true)

    if (category) query = query.eq('category', category)
    if (featured === 'true') query = query.eq('is_featured', true)
    if (productIds) query = query.in('id', productIds)

    const { data, error } = await query as unknown as { data: ProductWithVariants[] | null; error: any }

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: CACHE_HEADERS
      })
    }

    return new Response(JSON.stringify({ products: data ?? [] }), {
      status: 200,
      headers: CACHE_HEADERS
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: CACHE_HEADERS
    })
  }
}
