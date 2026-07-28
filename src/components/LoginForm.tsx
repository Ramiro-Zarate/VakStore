import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Field, Input, PasswordInput, Icon } from './Primitives'
import styles from './LoginForm.module.css'

interface LoginFormProps {
  onSuccess?: () => void
}

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const { signIn, signInWithGoogle, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('error')
    const reset = params.get('reset')
    if (reset === 'ok') {
      setInfoMessage('Contraseña cambiada con éxito. Iniciá sesión con tu nueva contraseña.')
      window.history.replaceState({}, '', '/login')
    } else if (oauthError === 'invalid_recovery_link') {
      setError('El enlace de recuperación es inválido o expiró. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".')
      window.history.replaceState({}, '', '/login')
    } else if (oauthError) {
      setError(decodeURIComponent(oauthError))
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await signIn(email, password)
      const { error } = result
      if (error) {
        console.error('[Login] signIn error:', error)
        setError(error.message || `Error de autenticación (${error.status ?? 'desconocido'})`)
      } else {
        onSuccess?.()
        const params = new URLSearchParams(window.location.search)
        const redirect = params.get('redirect') || '/'
        window.location.href = redirect
      }
    } catch (err) {
      console.error('[Login] signIn threw:', err)
      setError(err instanceof Error ? err.message : 'Error de conexión. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)
    const { error } = await signInWithGoogle()
    if (error) {
      console.error('[Login] Google signIn error:', error)
      setError(error.message || 'Error con Google')
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('Ingresá tu email para recuperar la contraseña')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { error } = await resetPassword(email)
      if (error) {
        setError(error.message || 'Error al enviar email de recuperación')
      } else {
        setResetSent(true)
      }
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (resetSent) {
    return (
      <div className={styles.container}>
        <div className={styles.successCard}>
          <span className={styles.successIcon} aria-hidden="true">
            <Icon size={32}>
              <polyline points="20 6 9 17 4 12" />
            </Icon>
          </span>
          <h1 className={styles.successTitle}>Email enviado</h1>
          <p className={styles.successDesc}>
            Revisá tu correo y seguí las instrucciones para restablecer tu contraseña.
          </p>
          <button type="button" className={styles.successButton} onClick={() => setResetSent(false)}>
            Volver al login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>— Bienvenido de vuelta</p>
          <h1 className={styles.title}>Iniciar sesión</h1>
          <p className={styles.subtitle}>Ingresá a tu cuenta para ver tus pedidos.</p>
        </header>

        <button
          type="button"
          className={styles.googleButton}
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg className={styles.googleIcon} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuar con Google
        </button>

        <div className={styles.divider} role="separator">
          <span>o</span>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {infoMessage && (
            <div className={`${styles.alert} ${styles.alertInfo}`} role="status">
              <span className={styles.alertIcon} aria-hidden="true">
                <Icon size={16}>
                  <polyline points="20 6 9 17 4 12" />
                </Icon>
              </span>
              <span>{infoMessage}</span>
            </div>
          )}
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">
              <span className={styles.alertIcon} aria-hidden="true">
                <Icon size={16}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </Icon>
              </span>
              <span>{error}</span>
            </div>
          )}

          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Contraseña" required>
            <PasswordInput
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              required
            />
          </Field>

          <div className={styles.forgotRow}>
            <button
              type="button"
              className={styles.forgotButton}
              onClick={handleResetPassword}
              disabled={loading}
            >
              Olvidé mi contraseña
            </button>
          </div>

          <button
            type="submit"
            className={styles.submit}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
            {!loading && (
              <Icon size={16} aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </Icon>
            )}
          </button>
        </form>

        <p className={styles.footer}>
          ¿No tenés cuenta?
          <a href="/registro" className={styles.footerLink}>Crear cuenta</a>
        </p>
      </div>
    </div>
  )
}
