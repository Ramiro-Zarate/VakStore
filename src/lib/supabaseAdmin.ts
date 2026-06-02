import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
