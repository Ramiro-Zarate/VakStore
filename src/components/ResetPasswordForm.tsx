import { useState } from 'react'
import { useAuth } from './useAuth'
import { Field, Input, Icon } from './Primitives'
import styles from './ResetPasswordForm.module.css'

export default function ResetPasswordForm() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEmailError(null)

    if (!email.trim()) {
      setEmailError('Ingresá tu email')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Email inválido')
      return
    }

    setLoading(true)
    try {
      const { error } = await resetPassword(email)
      if (error) {
        setError(error.message || 'Error al enviar email de recuperación')
      } else {
        setSent(true)
      }
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
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
          <a href="/login" className={styles.successButton}>Volver al login</a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>— ¿Olvidaste tu contraseña?</p>
          <h1 className={styles.title}>Recuperar contraseña</h1>
          <p className={styles.subtitle}>
            Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </header>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
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

          <Field label="Email" required error={emailError}>
            <Input
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              placeholder="tu@email.com"
              autoComplete="email"
              invalid={!!emailError}
              required
            />
          </Field>

          <button
            type="submit"
            className={styles.submit}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? 'Enviando...' : 'Enviar email'}
            {!loading && (
              <Icon size={16} aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </Icon>
            )}
          </button>

          <a href="/login" className={styles.backLink}>
            <Icon size={14} aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </Icon>
            Volver al login
          </a>
        </form>
      </div>
    </div>
  )
}
