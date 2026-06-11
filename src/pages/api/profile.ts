import type { APIRoute } from 'astro'
import * as Sentry from '@sentry/astro'
import { getSupabaseServer } from '../../lib/supabaseServer'
import {
  profileUpdateSchema,
  toProfilePayload,
  type ProfileUpdatePayload
} from '../../lib/profileSchema'
import { rateLimit, getClientIdentifier } from '../../lib/rateLimit'
import type { Profile } from '../../lib/types'

export const prerender = false

type ProfileRow = Omit<Profile, 'created_at' | 'updated_at'>

function jsonError(message: string, status: number, details?: unknown): Response {
  return new Response(JSON.stringify({ error: message, ...(details ? { details } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export const POST: APIRoute = async (ctx) => {
  const ip = getClientIdentifier(ctx.request)
  const rl = await rateLimit('profile-update', ip, 20, '1 m')
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

  const { supabase } = getSupabaseServer(ctx)

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return jsonError('No autenticado', 401)
  }
  const userId = userData.user.id

  let body: unknown
  try {
    body = await ctx.request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError('Datos inválidos', 400, parsed.error.flatten())
  }

  const payload: ProfileUpdatePayload = toProfilePayload(parsed.data)

  const { data, error } = await supabase
    .from('profiles')
    .update(payload as never)
    .eq('id', userId)
    .select('id, email, full_name, phone, address, city, postal_code, created_at, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[profile] update failed', error)
    Sentry.captureException(error, { extra: { stage: 'profile_update', userId } })
    return jsonError('No se pudo actualizar el perfil', 500)
  }

  if (!data) {
    return jsonError('Perfil no encontrado', 404)
  }

  return new Response(JSON.stringify({ profile: data as ProfileRow }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
