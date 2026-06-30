import { useState, useEffect, useRef } from 'react'
import { useCartStore } from '../hooks/useCartStore'
import { Field, Input, Select, Icon } from './Primitives'
import { TRANSFER_DISCOUNT } from '../lib/bankInfo'
import { DEFAULT_ZONE, type ShippingZone } from '../lib/shippingZones'
import {
  PROVINCES,
  getProvinceFromCP,
  detectProvinceFromCity,
  isCPMismatch
} from '../lib/provinces'
import styles from './CheckoutForm.module.css'

interface FormState {
  email: string
  name: string
  phone: string
  address: string
  city: string
  postalCode: string
  province: string
  paymentMethod: 'mercadopago' | 'transfer'
}

const EMPTY_FORM: FormState = {
  email: '',
  name: '',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  province: '',
  paymentMethod: 'mercadopago'
}

type FormErrors = Partial<Record<keyof FormState, string>>

interface QuoteResponse {
  detected: { id: string; name: string; cost: number; eta: string }
  options: ShippingZone[]
}

const PROVINCE_OPTIONS = PROVINCES.map(p => ({ value: p.id, label: p.name }))

export default function CheckoutForm() {
  const { items, getCartTotal, clearCart } = useCartStore()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  const [shippingZone, setShippingZone] = useState<ShippingZone>(DEFAULT_ZONE)
  const [shippingFallback, setShippingFallback] = useState(true)
  const [cpMismatch, setCpMismatch] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'payment_failed') {
      setSubmitError('El pago no se completó. Probá nuevamente.')
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const cp = form.postalCode.trim()
    const digits = cp.replace(/\D/g, '')
    if (digits.length < 4) {
      setShippingZone(DEFAULT_ZONE)
      setShippingFallback(true)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shipping/quote?cp=${encodeURIComponent(cp)}`)
        if (!res.ok) throw new Error('quote failed')
        const data = (await res.json()) as QuoteResponse
        const detected = data.options.find(o => o.id === data.detected.id) ?? DEFAULT_ZONE
        setShippingZone(detected)
        setShippingFallback(detected.id === DEFAULT_ZONE.id)
      } catch {
        setShippingZone(DEFAULT_ZONE)
        setShippingFallback(true)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.postalCode])

  useEffect(() => {
    const cp = form.postalCode.trim()
    if (cp.replace(/\D/g, '').length >= 4) {
      const detected = getProvinceFromCP(cp)
      if (detected && !form.province) {
        setForm(prev => ({ ...prev, province: detected.id }))
      }
    }
    if (form.city.trim() && cp.replace(/\D/g, '').length >= 4) {
      setCpMismatch(isCPMismatch(cp, form.city))
    } else {
      setCpMismatch(false)
    }
  }, [form.postalCode, form.city, form.province])

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>Tu carrito está vacío</h1>
        <p className={styles.emptyDesc}>Agregá productos antes de finalizar la compra.</p>
        <a href="/productos" className={styles.emptyButton}>Ver productos</a>
      </div>
    )
  }

  const subtotal = getCartTotal()
  const shipping = shippingZone.cost
  const isTransfer = form.paymentMethod === 'transfer'
  const transferDiscount = isTransfer ? subtotal * TRANSFER_DISCOUNT : 0
  const totalMp = subtotal + shipping
  const totalTransfer = subtotal - transferDiscount + shipping
  const activeTotal = isTransfer ? totalTransfer : totalMp
  const cityProvince = detectProvinceFromCity(form.city)
  const cpProvince = getProvinceFromCP(form.postalCode)

  const handleChange = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors(prev => ({ ...prev, [key]: undefined }))
    }
  }

  const validate = (): FormErrors => {
    const errors: FormErrors = {}
    if (!form.email.trim()) errors.email = 'Ingresá tu email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email inválido'
    if (!form.name.trim()) errors.name = 'Ingresá tu nombre'
    if (!form.phone.trim()) errors.phone = 'Ingresá tu teléfono'
    else if (!/^[\d\s+\-()]{8,20}$/.test(form.phone.trim())) errors.phone = 'Teléfono inválido'
    if (!form.address.trim()) errors.address = 'Ingresá tu dirección'
    if (!form.city.trim()) errors.city = 'Ingresá tu ciudad'
    if (!form.postalCode.trim()) errors.postalCode = 'Ingresá tu código postal'
    if (!form.province) errors.province = 'Elegé tu provincia'
    return errors
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      const firstError = document.querySelector('[aria-invalid="true"]') as HTMLElement | null
      firstError?.focus()
      return
    }
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
          customer: form,
          paymentMethod: form.paymentMethod,
          shippingMethod: shippingZone.id
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'No se pudo iniciar el pago')
        setSubmitting(false)
        return
      }

      clearCart()
      if (data.transfer) {
        window.location.href = `/pedido/${data.orderId}`
      } else {
        window.location.href = data.init_point
      }
    } catch {
      setSubmitError('Error de conexión. Intentá nuevamente.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div>
        <header className={styles.header}>
          <p className={styles.eyebrow}>— Finalizar compra</p>
          <h1 className={styles.title}>Casi listo</h1>
        </header>

        <form onSubmit={handleSubmit} className={styles.formCard} noValidate>
          {submitError && (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">
              <span className={styles.alertIcon} aria-hidden="true">
                <Icon size={18}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </Icon>
              </span>
              {submitError}
            </div>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber} aria-hidden="true">1</span>
              <h2 className={styles.sectionTitle}>Datos de contacto</h2>
            </div>
            <Field
              label="Email"
              required
              error={fieldErrors.email}
            >
              <Input
                type="email"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                invalid={!!fieldErrors.email}
              />
            </Field>
            <Field
              label="Nombre completo"
              required
              error={fieldErrors.name}
            >
              <Input
                type="text"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
                invalid={!!fieldErrors.name}
              />
            </Field>
            <Field
              label="Teléfono"
              required
              error={fieldErrors.phone}
              hint="Para que el courier coordine la entrega"
            >
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={e => handleChange('phone', e.target.value)}
                placeholder="+54 9 11 1234-5678"
                autoComplete="tel"
                invalid={!!fieldErrors.phone}
              />
            </Field>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber} aria-hidden="true">2</span>
              <h2 className={styles.sectionTitle}>Dirección de envío</h2>
            </div>
            <Field
              label="Dirección"
              required
              error={fieldErrors.address}
            >
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
              <Field
                label="Ciudad"
                required
                error={fieldErrors.city}
              >
                <Input
                  type="text"
                  value={form.city}
                  onChange={e => handleChange('city', e.target.value)}
                  placeholder="CABA, Córdoba, etc."
                  autoComplete="address-level2"
                  invalid={!!fieldErrors.city}
                />
              </Field>
              <Field
                label="Código postal"
                required
                error={fieldErrors.postalCode}
                hint={!shippingFallback ? `Detectamos zona: ${shippingZone.name}` : undefined}
              >
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.postalCode}
                  onChange={e => handleChange('postalCode', e.target.value)}
                  placeholder="C1414"
                  autoComplete="postal-code"
                  invalid={!!fieldErrors.postalCode}
                />
              </Field>
            </div>
            <Field
              label="Provincia"
              required
              error={fieldErrors.province}
              hint={cpProvince ? `Detectada desde tu CP: ${cpProvince.name}` : 'Elegé la provincia de destino'}
            >
              <Select
                value={form.province}
                onChange={e => handleChange('province', e.target.value)}
                options={PROVINCE_OPTIONS}
                placeholder="Elegé tu provincia"
                invalid={!!fieldErrors.province}
                autoComplete="address-level1"
              />
            </Field>

            {cpMismatch && cityProvince && cpProvince && (
              <div className={styles.warningCard} role="status">
                <span className={styles.warningIcon} aria-hidden="true">
                  <Icon size={16}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </Icon>
                </span>
                <p className={styles.warningText}>
                  Tu código postal (<strong>{form.postalCode.toUpperCase()}</strong>) corresponde a{' '}
                  <strong>{cpProvince.name}</strong>, pero tu ciudad dice{' '}
                  <strong>{form.city}</strong> (que está en {cityProvince.name}). ¿Es correcto?
                  Si no, corregí la ciudad o el código postal.
                </p>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber} aria-hidden="true">3</span>
              <h2 className={styles.sectionTitle}>Método de envío</h2>
            </div>
            <div className={styles.shippingCard}>
              <div className={styles.shippingCardHeader}>
                <span className={styles.shippingCardName}>{shippingZone.name}</span>
                <span className={styles.shippingCardPrice}>
                  ${shipping.toLocaleString('es-AR')}
                </span>
              </div>
              <p className={styles.shippingCardMeta}>
                <span>{shippingZone.eta}</span>
                <span className={styles.shippingCardSep} aria-hidden="true">·</span>
                <span>
                  {shippingFallback
                    ? 'Tarifa estándar'
                    : shippingZone.description}
                </span>
              </p>
              {shippingFallback && (
                <p className={styles.shippingCardHint}>
                  {form.postalCode.trim().replace(/\D/g, '').length < 4
                    ? 'Ingresá tu código postal para ver el costo exacto.'
                    : 'No pudimos identificar tu zona. Usamos tarifa estándar.'}
                </p>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber} aria-hidden="true">4</span>
              <h2 className={styles.sectionTitle}>Método de pago</h2>
            </div>
            <div className={styles.radioGroup} role="radiogroup" aria-label="Método de pago">
              <label className={`${styles.radioOption} ${form.paymentMethod === 'mercadopago' ? styles.radioOptionActive : ''}`}>
                <div className={styles.radioOptionLeft}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="mercadopago"
                    checked={form.paymentMethod === 'mercadopago'}
                    onChange={() => setForm(prev => ({ ...prev, paymentMethod: 'mercadopago' }))}
                    className={styles.radioInput}
                    aria-label="Mercado Pago, tarjeta o Rapipago"
                  />
                  <span className={styles.radioLabel}>
                    <span className={styles.radioTitle}>Mercado Pago</span>
                    <span className={styles.radioHint}>Tarjeta, débito, Rapipago</span>
                  </span>
                </div>
              </label>
              <label className={`${styles.radioOption} ${form.paymentMethod === 'transfer' ? styles.radioOptionActive : ''}`}>
                <div className={styles.radioOptionLeft}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={form.paymentMethod === 'transfer'}
                    onChange={() => setForm(prev => ({ ...prev, paymentMethod: 'transfer' }))}
                    className={styles.radioInput}
                    aria-label="Transferencia bancaria"
                  />
                  <span className={styles.radioLabel}>
                    <span className={styles.radioTitle}>Transferencia</span>
                    <span className={styles.radioHint}>CBU / Alias · 72hs para confirmar</span>
                  </span>
                </div>
              </label>
            </div>

            {form.paymentMethod === 'transfer' && (
              <div className={styles.reminderCard} role="status">
                <span className={styles.reminderIcon} aria-hidden="true">
                  <Icon size={16}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </Icon>
                </span>
                <p className={styles.reminderText}>
                  Después de transferir, mandá el comprobante por WhatsApp para
                  confirmar tu pedido. Tenés 72hs para hacerlo o se cancela automáticamente.
                </p>
              </div>
            )}
          </section>

          <button
            type="submit"
            className={styles.submit}
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            {submitting
              ? 'Procesando...'
              : form.paymentMethod === 'transfer'
                ? 'Finalizar y ver datos de transferencia'
                : 'Pagar con Mercado Pago'}
            {!submitting && (
              <Icon size={18} aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </Icon>
            )}
          </button>
          <p className={styles.secureNote}>
            <Icon size={12} aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </Icon>
            Pago seguro procesado por Mercado Pago
          </p>
        </form>
      </div>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          <Icon size={18} aria-hidden="true">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </Icon>
          Resumen del pedido
        </h2>
        <ul className={styles.summaryList}>
          {items.map(item => (
            <li key={item.productVariantId} className={styles.summaryItem}>
              <div className={styles.summaryImage}>
                {item.productImage && (
                  <img src={item.productImage} alt="" loading="lazy" decoding="async" />
                )}
              </div>
              <div className={styles.summaryInfo}>
                <p className={styles.summaryName}>{item.productName}</p>
                <p className={styles.summaryVariant}>
                  {item.version} · Talle {item.size} · ×{item.quantity}
                </p>
              </div>
              <p className={styles.summaryPrice}>
                ${(item.price * item.quantity).toLocaleString('es-AR')}
              </p>
            </li>
          ))}
        </ul>
        <div className={styles.summaryBreakdown}>
          <div className={styles.summaryBreakdownRow}>
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.summaryBreakdownRow}>
            <span>Envío · {shippingZone.name}</span>
            <span>${shipping.toLocaleString('es-AR')}</span>
          </div>
          {isTransfer && (
            <div className={`${styles.summaryBreakdownRow} ${styles.summaryDiscountRow}`}>
              <span>15% off en transferencia</span>
              <span>-${transferDiscount.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>
        <div className={styles.summaryTotal}>
          <span className={styles.summaryTotalLabel}>Total</span>
          <span className={styles.summaryTotalAmount}>
            ${activeTotal.toLocaleString('es-AR')}
          </span>
        </div>
      </aside>
    </div>
  )
}
