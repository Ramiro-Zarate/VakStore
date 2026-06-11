import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
