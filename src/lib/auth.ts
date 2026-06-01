import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string | null
  address: string | null
  city: string | null
  postalCode: string | null
}

export interface SignUpData {
  email: string
  password: string
  name: string
}

export interface SignInData {
  email: string
  password: string
}

export interface ResetPasswordData {
  email: string
}

export async function signUp({ email, password, name }: SignUpData): Promise<{ user: User | null; session: Session | null; error: any }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name
      }
    }
  })
  return { user: data.user, session: data.session, error }
}

export async function signIn({ email, password }: SignInData): Promise<{ user: User | null; error: any }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { user: data.user, error }
}

export async function signInWithGoogle(): Promise<{ error: any }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`
    }
  })
  return { error }
}

export async function signOut(): Promise<{ error: any }> {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword({ email }: ResetPasswordData): Promise<{ error: any }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/update-password`
  })
  return { error }
}

export async function updatePassword(newPassword: string): Promise<{ error: any }> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })
  return { error }
}

export async function getUser(): Promise<{ user: User | null; error: any }> {
  const { data, error } = await supabase.auth.getUser()
  return { user: data.user, error }
}

export async function getSession(): Promise<{ session: Session | null; error: any }> {
  const { data, error } = await supabase.auth.getSession()
  return { session: data.session, error }
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function resendVerificationEmail(): Promise<{ error: any }> {
  const { error } = await supabase.auth.resend({
    type: 'signup'
  })
  return { error }
}