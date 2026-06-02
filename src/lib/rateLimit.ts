import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const url = import.meta.env.UPSTASH_REDIS_REST_URL
const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN

let redis: Redis | null = null
if (url && token) {
  redis = new Redis({ url, token })
}

const limiters = new Map<string, Ratelimit>()

function getLimiter(name: string, requests: number, window: string): Ratelimit | null {
  if (!redis) return null
  if (limiters.has(name)) return limiters.get(name)!
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as `${number} ${'s' | 'm' | 'h'}`),
    analytics: false,
    prefix: `vak:${name}`
  })
  limiters.set(name, limiter)
  return limiter
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

export async function rateLimit(
  name: string,
  identifier: string,
  requests: number,
  window: string
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, requests, window)
  if (!limiter) {
    return { success: true, limit: requests, remaining: requests, reset: Date.now() }
  }
  const { success, limit, remaining, reset } = await limiter.limit(identifier)
  return { success, limit, remaining, reset }
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}
