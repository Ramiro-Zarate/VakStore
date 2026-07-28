import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Field, PasswordInput, Icon } from './Primitives'
import styles from './UpdatePasswordForm.module.css'

const PASSWORD_MIN_LENGTH = 8

export default function UpdatePasswordForm() {
  const { user, initialized, updatePassword } = useAuth()
  const [sessionReady, setSessionReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string
    confirmPassword?: string
  }>({})

  useEffect(() => {
    if (!initialized) return
    if (!user) {
      window.location.href = '/login?error=invalid_recovery_link'
      return
    }
    setSessionReady(true)
  }, [initialized, user])

  const validate = (): typeof fieldErrors => {
    const errors: typeof fieldErrors = {}
    if (!password) errors.password = 'Ingresá una contraseña'
    else if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
    }
    if (!confirmPassword) errors.confirmPassword = 'Confirmá la contraseña'
    else if (password !== confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden'
    }
    return errors
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.querySelector('[aria-invalid="true"]') as HTMLElement | null
      firstError?.focus()
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await updatePassword(password)
      if (updateError) {
        setError(updateError.message || 'Error al actualizar la contraseña')
      } else {
        window.location.href = '/login?reset=ok'
      }
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>— Restablecer contraseña</p>
          <h1 className={styles.title}>
            {sessionReady ? 'Nueva contraseña' : 'Verificando enlace'}
          </h1>
          <p className={styles.subtitle}>
            {sessionReady
              ? `Ingresá tu nueva contraseña. Tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
              : 'Esperando que se valide el enlace de recuperación.'}
          </p>
        </header>

        {!sessionReady ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <span>Cargando…</span>
          </div>
        ) : (
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

            <Field
              label="Nueva contraseña"
              required
              error={fieldErrors.password}
              hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            >
              <PasswordInput
                value={password}
                onChange={e => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors(prev => ({ ...prev, password: undefined }))
                  }
                }}
                placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                autoComplete="new-password"
                invalid={!!fieldErrors.password}
                required
              />
            </Field>

            <Field
              label="Confirmar contraseña"
              required
              error={fieldErrors.confirmPassword}
            >
              <PasswordInput
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value)
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors(prev => ({ ...prev, confirmPassword: undefined }))
                  }
                }}
                placeholder="Repetí la contraseña"
                autoComplete="new-password"
                invalid={!!fieldErrors.confirmPassword}
                required
              />
            </Field>

            <button
              type="submit"
              className={styles.submit}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? 'Actualizando...' : 'Cambiar contraseña'}
              {!loading && (
                <Icon size={16} aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </Icon>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
