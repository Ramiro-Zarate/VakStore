import { useState, type FormEvent } from 'react'
import { Field, Input, Button } from './Primitives'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function OrderLookupForm() {
  const [orderId, setOrderId] = useState('')
  const [email, setEmail] = useState('')
  const [orderIdError, setOrderIdError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmedId = orderId.trim()
    const trimmedEmail = email.trim()

    let hasError = false
    if (!UUID_REGEX.test(trimmedId)) {
      setOrderIdError('Número de pedido inválido. Revisá el email de confirmación.')
      hasError = true
    } else {
      setOrderIdError(null)
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Email inválido.')
      hasError = true
    } else {
      setEmailError(null)
    }
    if (hasError) return

    setSubmitting(true)
    sessionStorage.setItem('orderLookupEmail', trimmedEmail)
    window.location.href = `/pedido/${trimmedId}`
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Field label="Número de pedido" required error={orderIdError}>
        <Input
          type="text"
          value={orderId}
          onChange={(e) => { setOrderId(e.target.value); if (orderIdError) setOrderIdError(null) }}
          placeholder="ej. 8f4d2c1a-..."
          autoComplete="off"
          invalid={Boolean(orderIdError)}
        />
      </Field>
      <Field label="Email" required error={emailError}>
        <Input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null) }}
          placeholder="tu@email.com"
          autoComplete="email"
          invalid={Boolean(emailError)}
        />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Buscando...' : 'Buscar pedido'}
      </Button>
    </form>
  )
}
