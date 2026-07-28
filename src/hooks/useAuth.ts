import { useState, useEffect } from 'react'
import { authStore } from '../stores/AuthStore'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(authStore.user)
  const [loading, setLoading] = useState(authStore.loading)
  const [initialized, setInitialized] = useState(authStore.initialized)

  useEffect(() => {
    authStore.initialize()

    const unsubscribe = authStore.subscribe((newUser) => {
      setUser(newUser)
      setLoading(authStore.loading)
      setInitialized(authStore.initialized)
    })

    return unsubscribe
  }, [])

  return {
    user,
    loading,
    initialized,
    signUp: authStore.signUp.bind(authStore),
    signIn: authStore.signIn.bind(authStore),
    signInWithGoogle: authStore.signInWithGoogle.bind(authStore),
    signOut: authStore.signOut.bind(authStore),
    resetPassword: authStore.resetPassword.bind(authStore),
    updatePassword: authStore.updatePassword.bind(authStore)
  }
}
