import { useState } from 'react'
import { Field, Input, Icon } from './Primitives'
import {
  profileUpdateSchema,
  toProfilePayload,
  type ProfileUpdate
} from '../lib/profileSchema'
import type { Profile } from '../lib/types'
import styles from './ProfileForm.module.css'

type EditableField = 'full_name' | 'phone' | 'address' | 'city' | 'postal_code'

type FormState = {
  full_name: string
  phone: string
  address: string
  city: string
  postal_code: string
}

type FormErrors = Partial<Record<EditableField, string>>

type Status = 'idle' | 'saving' | 'saved' | 'error'

interface ProfileFormProps {
  initialProfile: Profile | null
  email: string
}

function profileToForm(profile: Profile | null): FormState {
  return {
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    postal_code: profile?.postal_code ?? ''
  }
}

export default function ProfileForm({ initialProfile, email }: ProfileFormProps) {
  const [form, setForm] = useState<FormState>(() => profileToForm(initialProfile))
  const [status, setStatus] = useState<Status>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  const handleChange = (key: EditableField, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors(prev => ({ ...prev, [key]: undefined }))
    }
    if (status === 'saved' || status === 'error') {
      setStatus('idle')
      setStatusMessage(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMessage(null)

    const candidate: ProfileUpdate = {
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      city: form.city,
      postal_code: form.postal_code
    }

    const parsed = profileUpdateSchema.safeParse(candidate)
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors
      const errors: FormErrors = {}
      for (const key of Object.keys(flat) as EditableField[]) {
        const msg = flat[key]?.[0]
        if (msg) errors[key] = msg
      }
      setFieldErrors(errors)
      setStatus('error')
      setStatusMessage('Revisá los campos marcados.')
      const firstInvalid = document.querySelector('[aria-invalid="true"]') as HTMLElement | null
      firstInvalid?.focus()
      return
    }

    setFieldErrors({})
    setStatus('saving')
    setStatusMessage('Guardando cambios...')

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toProfilePayload(parsed.data))
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        setStatus('error')
        setStatusMessage(data.error ?? 'No se pudieron guardar los cambios.')
        return
      }

      setStatus('saved')
      setStatusMessage('Cambios guardados.')
    } catch {
      setStatus('error')
      setStatusMessage('Error de conexión. Intentá nuevamente.')
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {statusMessage && (
        <div
          className={`${styles.alert} ${status === 'error' ? styles.alertError : styles.alertSuccess}`}
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span className={styles.alertIcon} aria-hidden="true">
            {status === 'error' ? (
              <Icon size={16}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </Icon>
            ) : (
              <Icon size={16}>
                <polyline points="20 6 9 17 4 12" />
              </Icon>
            )}
          </span>
          <span>{statusMessage}</span>
        </div>
      )}

      <Field label="Email">
        <Input type="email" value={email} disabled readOnly autoComplete="email" />
      </Field>

      <Field label="Nombre completo" required error={fieldErrors.full_name}>
        <Input
          type="text"
          value={form.full_name}
          onChange={e => handleChange('full_name', e.target.value)}
          placeholder="Tu nombre"
          autoComplete="name"
          invalid={!!fieldErrors.full_name}
          required
        />
      </Field>

      <Field label="Teléfono" optional error={fieldErrors.phone}>
        <Input
          type="tel"
          value={form.phone}
          onChange={e => handleChange('phone', e.target.value)}
          placeholder="+54 11 5555 5555"
          autoComplete="tel"
          invalid={!!fieldErrors.phone}
        />
      </Field>

      <Field label="Dirección" optional error={fieldErrors.address}>
        <Input
          type="text"
          value={form.address}
          onChange={e => handleChange('address', e.target.value)}
          placeholder="Calle, número, piso, depto"
          autoComplete="street-address"
          invalid={!!fieldErrors.address}
        />
      </Field>

      <div className={styles.fieldGroup}>
        <Field label="Ciudad" optional error={fieldErrors.city}>
          <Input
            type="text"
            value={form.city}
            onChange={e => handleChange('city', e.target.value)}
            placeholder="CABA, Córdoba, etc."
            autoComplete="address-level2"
            invalid={!!fieldErrors.city}
          />
        </Field>
        <Field label="Código postal" optional error={fieldErrors.postal_code}>
          <Input
            type="text"
            inputMode="numeric"
            value={form.postal_code}
            onChange={e => handleChange('postal_code', e.target.value)}
            placeholder="C1414"
            autoComplete="postal-code"
            invalid={!!fieldErrors.postal_code}
          />
        </Field>
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submit}
          disabled={status === 'saving'}
          aria-busy={status === 'saving' || undefined}
        >
          {status === 'saving' ? 'Guardando...' : 'Guardar cambios'}
          {status !== 'saving' && (
            <Icon size={16} aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </Icon>
          )}
        </button>
      </div>
    </form>
  )
}
