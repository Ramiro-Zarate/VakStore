import type { APIRoute } from 'astro'
import { supabase } from '../../../lib/supabase'
import type { ProductVariant } from '../../../lib/types'


interface ProductWithVariants {
  id: string
  name: string
  description: string | null
  image_url: string | null
  is_active: boolean
  category: string
  created_at: string
  updated_at: string
  product_variants: ProductVariant[] 
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const { searchParams } = url
    const category = searchParams.get('category')
    const league = searchParams.get('league')
    const size = searchParams.get('size')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')

    let query = supabase
      .from('products')
      .select(`
        *,
        product_variants (
          *
        )
      `)
      .eq('is_active', true)

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query as unknown as { data: ProductWithVariants[] | null; error: any }

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!data || data.length === 0) {
      return new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let filteredProducts = data

    if (league || size || minPrice || maxPrice) {
      filteredProducts = filteredProducts.filter(product => {
        const variants = product.product_variants || []

        return variants.some(variant => {
          if (league && variant.league !== league) return false
          if (size && variant.size !== size) return false
          if (minPrice && Number(variant.price) < Number(minPrice)) return false
          if (maxPrice && Number(variant.price) > Number(maxPrice)) return false
          return true
        })
      })

      filteredProducts = filteredProducts.map(product => ({
        ...product,
        product_variants: (product.product_variants || []).filter(variant => {
          if (league && variant.league !== league) return false
          if (size && variant.size !== size) return false
          if (minPrice && Number(variant.price) < Number(minPrice)) return false
          if (maxPrice && Number(variant.price) > Number(maxPrice)) return false
          return true
        })
      }))
    }

    return new Response(JSON.stringify({ products: filteredProducts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}