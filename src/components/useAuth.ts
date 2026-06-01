import { useState, useEffect } from 'react'
import { authStore } from '../stores/AuthStore'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signInWithGoogle: () => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(authStore.user)
  const [loading, setLoading] = useState(authStore.loading)

  useEffect(() => {
    authStore.initialize()
    
    const unsubscribe = authStore.subscribe((newUser) => {
      setUser(newUser)
      setLoading(authStore.loading)
    })
    
    return unsubscribe
  }, [])

  return {
    user,
    loading,
    signUp: authStore.signUp.bind(authStore),
    signIn: authStore.signIn.bind(authStore),
    signInWithGoogle: authStore.signInWithGoogle.bind(authStore),
    signOut: authStore.signOut.bind(authStore),
    resetPassword: authStore.resetPassword.bind(authStore)
  }
}