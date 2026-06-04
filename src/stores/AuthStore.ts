import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

type AuthListener = (user: User | null) => void

interface AuthStore {
  user: User | null
  loading: boolean
  initialized: boolean
  subscribe: (listener: AuthListener) => () => void
  initialize: () => void
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
}

const listeners = new Set<AuthListener>()

const store: AuthStore = {
  user: null,
  loading: true,
  initialized: false,

  subscribe(listener: AuthListener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  initialize() {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[AuthStore] getSession error:', error)
          this.user = null
        } else {
          this.user = data.session?.user ?? null
        }
      })
      .catch((err) => {
        console.warn('[AuthStore] getSession failed:', err)
        this.user = null
      })
      .finally(() => {
        this.loading = false
        this.initialized = true
        listeners.forEach((l) => l(this.user))
      })

    supabase.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user ?? null
      this.initialized = true
      listeners.forEach((l) => l(this.user))
    })
  },

  async signUp(email: string, password: string, name: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })
    return { error }
  },

  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  },

  async signInWithGoogle() {
    return await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
  },

  async signOut() {
    return await supabase.auth.signOut()
  },

  async resetPassword(email: string) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`
    })
  }
}

export const authStore = store

export function getUser() {
  return store.user
}

export function isLoading() {
  return store.loading
}

export function isInitialized() {
  return store.initialized
}
