import { useState, useEffect } from 'react'
import { useCartStore } from '../hooks/useCartStore'
import styles from './CheckoutForm.module.css'

interface FormState {
  email: string
  name: string
  address: string
  city: string
  postalCode: string
}

const EMPTY_FORM: FormState = {
  email: '',
  name: '',
  address: '',
  city: '',
  postalCode: ''
}

export default function CheckoutForm() {
  const { items, getCartTotal, clearCart } = useCartStore()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'payment_failed') {
      setError('El pago no se completó. Probá nuevamente.')
    }
  }, [])

  if (items.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <h2>Tu carrito está vacío</h2>
          <p>Agregá productos para continuar con la compra.</p>
          <a href="/productos" className={styles.emptyButton}>Ver productos</a>
        </div>
      </div>
    )
  }

  const total = getCartTotal()

  const handleChange = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            variantId: i.productVariantId,
            quantity: i.quantity
          })),
          customer: form
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar el pago')
        setSubmitting(false)
        return
      }

      clearCart()
      window.location.href = data.init_point
    } catch (err) {
      setError('Error de conexión. Intentá nuevamente.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.title}>Finalizar compra</h1>
        <form onSubmit={handleSubmit} className={styles.formCard}>
          {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Datos de contacto</h2>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                className={styles.input}
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="name" className={styles.label}>Nombre completo</label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                className={styles.input}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Dirección de envío</h2>
            <div className={styles.field}>
              <label htmlFor="address" className={styles.label}>Dirección</label>
              <input
                id="address"
                type="text"
                required
                value={form.address}
                onChange={e => handleChange('address', e.target.value)}
                className={styles.input}
                placeholder="Calle, número, piso, depto"
                autoComplete="street-address"
              />
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="city" className={styles.label}>Ciudad</label>
                <input
                  id="city"
                  type="text"
                  required
                  value={form.city}
                  onChange={e => handleChange('city', e.target.value)}
                  className={styles.input}
                  placeholder="CABA, Córdoba, etc."
                  autoComplete="address-level2"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="postalCode" className={styles.label}>Código postal</label>
                <input
                  id="postalCode"
                  type="text"
                  required
                  value={form.postalCode}
                  onChange={e => handleChange('postalCode', e.target.value)}
                  className={styles.input}
                  placeholder="C1414"
                  autoComplete="postal-code"
                />
              </div>
            </div>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className={styles.submitButton}
          >
            {submitting ? 'Redirigiendo a Mercado Pago...' : 'Pagar con Mercado Pago'}
          </button>
        </form>
      </div>

      <aside className={styles.summary}>
        <h2 className={styles.summaryTitle}>Resumen</h2>
        {items.map(item => (
          <div key={item.productVariantId} className={styles.summaryItem}>
            <div className={styles.summaryImage}>
              {item.productImage && (
                <img src={item.productImage} alt={item.productName} loading="lazy" decoding="async" />
              )}
            </div>
            <div className={styles.summaryInfo}>
              <p className={styles.summaryName}>{item.productName}</p>
              <p className={styles.summaryVariant}>{item.version} · Talle {item.size}</p>
              <p className={styles.summaryVariant}>Cantidad: {item.quantity}</p>
            </div>
            <p className={styles.summaryPrice}>
              ${(item.price * item.quantity).toLocaleString('es-AR')}
            </p>
          </div>
        ))}
        <div className={styles.summaryTotal}>
          <span>Total</span>
          <span className={styles.summaryTotalAmount}>
            ${total.toLocaleString('es-AR')}
          </span>
        </div>
      </aside>
    </div>
  )
}
