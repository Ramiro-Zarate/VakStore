import type { APIRoute } from 'astro'
import { getOptionsForCP, type ShippingOption } from '../../../lib/shippingOptions'

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const cp = url.searchParams.get('cp') ?? ''
  const options = getOptionsForCP(cp)
  const detected = options[0] ?? null
  return new Response(
    JSON.stringify({ cp, detected, options }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    }
  )
}

export type QuoteResponse = {
  cp: string
  detected: ShippingOption | null
  options: ShippingOption[]
}
