import type { APIRoute } from 'astro'
import { getShippingZonesForCP } from '../../../lib/shippingZones'

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const cp = url.searchParams.get('cp') ?? ''

  const { detected, options } = getShippingZonesForCP(cp)

  return new Response(
    JSON.stringify({
      cp,
      detected: { id: detected.id, name: detected.name, cost: detected.cost, eta: detected.eta },
      options: options.map(z => ({
        id: z.id,
        name: z.name,
        description: z.description,
        cost: z.cost,
        eta: z.eta
      }))
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
