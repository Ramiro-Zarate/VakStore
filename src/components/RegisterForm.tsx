import { useState, useMemo } from 'react'
import { useAuth } from './useAuth'
import { Field, Input, PasswordInput, Icon } from './Primitives'
import styles from './RegisterForm.module.css'

interface RegisterFormProps {
  onSuccess?: () => void
}

type FormErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword', string>>

function getPasswordStrength(p: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!p) return { score: 0, label: '' }
  let score = 0
  if (p.length >= 6) score++
  if (p.length >= 10) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) score++
  if (score === 1) return { score: 1, label: 'Débil' }
  if (score === 2) return { score: 2, label: 'Aceptable' }
  return { score: 3, label: 'Fuerte' }
}

export default function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  const strength = useMemo(() => getPasswordStrength(password), [password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors: FormErrors = {}
    if (!name.trim()) errors.name = 'Ingresá tu nombre'
    if (!email.trim()) errors.email = 'Ingresá tu email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email inválido'
    if (password.length < 6) errors.password = 'La contraseña debe tener al menos 6 caracteres'
    if (password !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden'

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.querySelector('[aria-invalid="true"]') as HTMLElement | null
      firstError?.focus()
      return
    }

    setLoading(true)

    try {
      const { error } = await signUp(email, password, name)
      if (error) {
        setError(error.message || 'Error al crear cuenta')
      } else {
        onSuccess?.()
        window.location.href = '/auth/verificacion'
      }
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const strengthClass = strength.score === 1
    ? styles.strengthBarActiveWeak
    : strength.score === 2
    ? styles.strengthBarActiveFair
    : strength.score === 3
    ? styles.strengthBarActiveStrong
    : ''

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>— Sumate</p>
          <h1 className={styles.title}>Crear cuenta</h1>
          <p className={styles.subtitle}>Empezá a armar tu colección.</p>
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

          <Field label="Nombre completo" required error={fieldErrors.name}>
            <Input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value)
                if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: undefined }))
              }}
              placeholder="Tu nombre"
              autoComplete="name"
              invalid={!!fieldErrors.name}
              required
            />
          </Field>

          <Field label="Email" required error={fieldErrors.email}>
            <Input
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value)
                if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined }))
              }}
              placeholder="tu@email.com"
              autoComplete="email"
              invalid={!!fieldErrors.email}
              required
            />
          </Field>

          <Field
            label="Contraseña"
            required
            error={fieldErrors.password}
            hint={!fieldErrors.password && password.length > 0 ? `Seguridad: ${strength.label}` : undefined}
          >
            <PasswordInput
              value={password}
              onChange={e => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }))
              }}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              invalid={!!fieldErrors.password}
              required
            />
            {password.length > 0 && (
              <div className={styles.strengthMeter} aria-hidden="true">
                <div className={styles.strengthBars}>
                  <span className={`${styles.strengthBar} ${strength.score >= 1 ? strengthClass : ''}`} />
                  <span className={`${styles.strengthBar} ${strength.score >= 2 ? strengthClass : ''}`} />
                  <span className={`${styles.strengthBar} ${strength.score >= 3 ? strengthClass : ''}`} />
                </div>
                <span className={styles.strengthLabel}>{strength.label}</span>
              </div>
            )}
          </Field>

          <Field label="Confirmar contraseña" required error={fieldErrors.confirmPassword}>
            <PasswordInput
              value={confirmPassword}
              onChange={e => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: undefined }))
              }}
              placeholder="Repetí tu contraseña"
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
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            {!loading && (
              <Icon size={16} aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </Icon>
            )}
          </button>
        </form>

        <p className={styles.footer}>
          ¿Ya tenés cuenta?
          <a href="/login" className={styles.footerLink}>Iniciar sesión</a>
        </p>
      </div>
    </div>
  )
}
