import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'
import type { ProductWithVariants } from '../../../lib/types'

export const prerender = false

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
}

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 48

export const GET: APIRoute = async ({ url }) => {
  try {
    const { searchParams } = url
    const category = searchParams.get('category')
    const league = searchParams.get('league')
    const size = searchParams.get('size')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const featured = searchParams.get('featured')
    const qRaw = (searchParams.get('q') ?? '').trim().slice(0, 100)
    const qSafe = qRaw.replace(/[,."()\\]/g, '')
    const q = qSafe.length > 0 ? qSafe : null
    const searchFilter = q ? `name.ilike.%${q}%,description.ilike.%${q}%` : null

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT))
    const offset = (page - 1) * limit

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
        return new Response(
          JSON.stringify({ products: [], total: 0, page, limit }),
          { status: 200, headers: CACHE_HEADERS }
        )
      }
    }

    let countQuery = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)

    if (category) countQuery = countQuery.eq('category', category)
    if (featured === 'true') countQuery = countQuery.eq('is_featured', true)
    if (productIds) countQuery = countQuery.in('id', productIds)
    if (searchFilter) countQuery = countQuery.or(searchFilter)

    const { count: total, error: countError } = await countQuery
    if (countError) {
      return new Response(JSON.stringify({ error: countError.message }), {
        status: 500,
        headers: CACHE_HEADERS
      })
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
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (category) query = query.eq('category', category)
    if (featured === 'true') query = query.eq('is_featured', true)
    if (productIds) query = query.in('id', productIds)
    if (searchFilter) query = query.or(searchFilter)

    const { data, error } = await query as unknown as { data: ProductWithVariants[] | null; error: any }

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: CACHE_HEADERS
      })
    }

    return new Response(
      JSON.stringify({
        products: data ?? [],
        total: total ?? 0,
        page,
        limit
      }),
      { status: 200, headers: CACHE_HEADERS }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: CACHE_HEADERS
    })
  }
}
