import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import type { APIContext, AstroGlobal } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type AstroLike = APIContext | AstroGlobal

function getEnv() {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in env')
  }
  return { supabaseUrl, supabaseAnonKey }
}

function parseCookiesFromContext(ctx: AstroLike): Array<{ name: string; value: string }> {
  const header = ctx.request.headers.get('cookie') ?? ''
  return parseCookieHeader(header) as Array<{ name: string; value: string }>
}

export function getSupabaseServer(ctx: AstroLike): {
  supabase: SupabaseClient<Database>
} {
  const { supabaseUrl, supabaseAnonKey } = getEnv()
  const cookies = parseCookiesFromContext(ctx)

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          ctx.cookies.set(name, value, options)
        }
      }
    }
  })

  return { supabase }
}
