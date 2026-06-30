import { useState, useEffect } from 'react'
import { Field, Input, Skeleton, Icon } from './Primitives'
import { getCarrier, getTrackingUrl } from '../lib/carriers'
import styles from './OrderTracking.module.css'

interface OrderItem {
  id: string
  product_variant_id: string
  quantity: number
  unit_price: number
  product_variant?: {
    size: string
    version: string
    product?: {
      name: string
      image_url: string | null
    }
  }
}

interface BankInfo {
  alias: string
  cbu: string
  holder: string
  cuit: string
}

interface Order {
  id: string
  status: string
  total_amount: number
  created_at: string
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  email: string | null
  payment_method: string
  payment_intent_id: string | null
  transfer_expires_at: string | null
  bank_info_snapshot: BankInfo | null
  carrier: string | null
  tracking_number: string | null
  shipped_at: string | null
  order_items?: OrderItem[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pendiente',
    className: 'statusPending',
    icon: <circle cx="12" cy="12" r="10" />
  },
  awaiting_payment: {
    label: 'Esperando pago',
    className: 'statusPending',
    icon: <circle cx="12" cy="12" r="10" />
  },
  paid: {
    label: 'Pagado',
    className: 'statusPaid',
    icon: <polyline points="20 6 9 17 4 12" />
  },
  processing: {
    label: 'Procesando',
    className: 'statusProcessing',
    icon: (
      <>
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </>
    )
  },
  shipped: {
    label: 'Enviado',
    className: 'statusShipped',
    icon: (
      <>
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </>
    )
  },
  delivered: {
    label: 'Entregado',
    className: 'statusDelivered',
    icon: (
      <>
        <polyline points="20 6 9 17 4 12" />
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      </>
    )
  },
  cancelled: {
    label: 'Cancelado',
    className: 'statusCancelled',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </>
    )
  }
}

export default function OrderTracking() {
  const [orderId, setOrderId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    const pathParts = window.location.pathname.split('/')
    const id = pathParts[pathParts.length - 1]
    setOrderId(id)

    const prefilledEmail = sessionStorage.getItem('orderLookupEmail')
    if (prefilledEmail) {
      setEmail(prefilledEmail)
      sessionStorage.removeItem('orderLookupEmail')
    }
  }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId || !email) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'No se pudo verificar el pedido')
        setVerified(false)
        setOrder(null)
        return
      }

      setVerified(true)
      setOrder(data.order as Order)
    } catch {
      setError('Error al buscar el pedido')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!orderId) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>— Pedido</p>
          <h1 className={styles.title}>Cargando...</h1>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>— Pedido</p>
          <h1 className={styles.title}>Buscando tu pedido</h1>
        </div>
        <div className={styles.card} role="status" aria-busy="true" aria-live="polite">
          <div className={styles.loading}>
            <Skeleton width="100%" height="48px" />
            <Skeleton width="100%" height="80px" />
            <Skeleton width="100%" height="40px" />
            <Skeleton width="60%" height="32px" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>— Pedido</p>
        <h1 className={styles.title}>Seguimiento</h1>
        {!verified && (
          <p className={styles.subtitle}>
            Ingresá el email que usaste al realizar el pedido para ver el estado.
          </p>
        )}
      </div>

      {!verified ? (
        <div className={`${styles.card} ${styles.verifyCard}`}>
          <form onSubmit={handleVerify} className={styles.verifyForm} noValidate>
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

            <button
              type="submit"
              className={styles.submit}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? 'Buscando...' : 'Verificar pedido'}
              {!loading && (
                <Icon size={16} aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </Icon>
              )}
            </button>
          </form>
        </div>
      ) : order ? (
        <div className={styles.card}>
          <div className={styles.orderHeader}>
            <div className={styles.orderMeta}>
              <p className={styles.orderLabel}>Pedido</p>
              <p className={styles.orderId}>#{order.id.slice(0, 8).toUpperCase()}</p>
              <p className={styles.orderDate}>{formatDate(order.created_at)}</p>
            </div>
            {(() => {
              const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
              return (
                <span className={`${styles.statusBadge} ${styles[config.className]}`}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  <Icon size={14} aria-hidden="true">{config.icon}</Icon>
                  {config.label}
                </span>
              )
            })()}
          </div>

          {(() => {
            const status = order.status
            const isTransfer = order.payment_method === 'transfer'
            const whatsappDigits = (typeof window !== 'undefined'
              && (window as unknown as { PUBLIC_WHATSAPP_NUMBER?: string }).PUBLIC_WHATSAPP_NUMBER
              || ''
            ).replace(/[^\d]/g, '')
            const whatsappText = encodeURIComponent(
              `Hola! Te paso el comprobante de mi pedido #${order.id.slice(0, 8).toUpperCase()} por $${order.total_amount.toLocaleString('es-AR')}.`
            )

            if (status === 'awaiting_payment' && isTransfer && order.bank_info_snapshot) {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroTransfer}`}>
                  <div className={styles.statusHeroHeader}>
                    <span className={styles.statusHeroIcon} aria-hidden="true">
                      <Icon size={24}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </Icon>
                    </span>
                    <div className={styles.statusHeroContent}>
                      <h2 className={styles.statusHeroTitle}>Mandá el comprobante por WhatsApp</h2>
                      <p className={styles.statusHeroDescription}>
                        Para confirmar tu pedido. Tenés 72hs antes de que se cancele automáticamente.
                      </p>
                    </div>
                  </div>
                  <dl className={styles.statusHeroDetails}>
                    <div className={styles.statusHeroDetailRow}>
                      <dt>Alias</dt>
                      <dd>{order.bank_info_snapshot.alias}</dd>
                    </div>
                    <div className={styles.statusHeroDetailRow}>
                      <dt>CBU</dt>
                      <dd>{order.bank_info_snapshot.cbu}</dd>
                    </div>
                    <div className={styles.statusHeroDetailRow}>
                      <dt>Titular</dt>
                      <dd>{order.bank_info_snapshot.holder}</dd>
                    </div>
                    <div className={styles.statusHeroDetailRow}>
                      <dt>CUIT</dt>
                      <dd>{order.bank_info_snapshot.cuit}</dd>
                    </div>
                    <div className={`${styles.statusHeroDetailRow} ${styles.statusHeroDetailAmount}`}>
                      <dt>Monto a transferir</dt>
                      <dd>${order.total_amount.toLocaleString('es-AR')}</dd>
                    </div>
                  </dl>
                  <a
                    className={styles.statusHeroCta}
                    href={`https://wa.me/${whatsappDigits}?text=${whatsappText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon size={16} aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </Icon>
                    Enviar comprobante por WhatsApp
                  </a>
                  {order.transfer_expires_at && (
                    <p className={styles.statusHeroExpiry}>
                      Vencimiento: {new Date(order.transfer_expires_at).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              )
            }

            if (status === 'pending') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroPending}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Esperando confirmación del pago</h2>
                    <p className={styles.statusHeroDescription}>
                      Te avisamos por email cuando Mercado Pago confirme el pago.
                    </p>
                  </div>
                </div>
              )
            }

            if (status === 'paid') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroPaid}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <polyline points="20 6 9 17 4 12" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Pago confirmado</h2>
                    <p className={styles.statusHeroDescription}>
                      Estamos preparando tu pedido.
                    </p>
                  </div>
                </div>
              )
            }

            if (status === 'processing') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroProcessing}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Preparando tu pedido</h2>
                    <p className={styles.statusHeroDescription}>
                      Lo despachamos en las próximas horas.
                    </p>
                  </div>
                </div>
              )
            }

            if (status === 'shipped') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroShipped}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <rect x="1" y="3" width="15" height="13" />
                      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                      <circle cx="5.5" cy="18.5" r="2.5" />
                      <circle cx="18.5" cy="18.5" r="2.5" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Tu pedido está en camino</h2>
                    <p className={styles.statusHeroDescription}>
                      {order.carrier
                        ? `Carrier: ${getCarrier(order.carrier)?.name ?? order.carrier}`
                        : 'Lo entregaremos pronto.'}
                    </p>
                  </div>
                </div>
              )
            }

            if (status === 'delivered') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroDelivered}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <polyline points="20 6 9 17 4 12" />
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Pedido entregado</h2>
                    <p className={styles.statusHeroDescription}>
                      ¡Gracias por tu compra!
                    </p>
                  </div>
                </div>
              )
            }

            if (status === 'cancelled') {
              return (
                <div className={`${styles.statusHero} ${styles.statusHeroCancelled}`}>
                  <span className={styles.statusHeroIcon} aria-hidden="true">
                    <Icon size={24}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </Icon>
                  </span>
                  <div className={styles.statusHeroContent}>
                    <h2 className={styles.statusHeroTitle}>Pedido cancelado</h2>
                    <p className={styles.statusHeroDescription}>
                      Si tenés dudas, contactanos por WhatsApp.
                    </p>
                  </div>
                </div>
              )
            }

            return null
          })()}

          {order.shipping_address && (
            <div className={styles.shipping}>
              <h2 className={styles.shippingTitle}>
                <Icon size={14} aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </Icon>
                Dirección de envío
              </h2>
              <p className={styles.shippingLine}>{order.shipping_address}</p>
              <p className={`${styles.shippingLine} ${styles.shippingLineMuted}`}>
                {order.shipping_city} {order.shipping_postal_code}
              </p>
            </div>
          )}

          {order.tracking_number && order.carrier && (
            <div className={styles.trackingCard}>
              <h2 className={styles.trackingTitle}>
                <Icon size={14} aria-hidden="true">
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </Icon>
                Envío en curso
              </h2>
              <dl className={styles.trackingList}>
                <div className={styles.trackingRow}>
                  <dt>Carrier</dt>
                  <dd>{getCarrier(order.carrier)?.name ?? order.carrier}</dd>
                </div>
                <div className={styles.trackingRow}>
                  <dt>Número de seguimiento</dt>
                  <dd>{order.tracking_number}</dd>
                </div>
                {order.shipped_at && (
                  <div className={styles.trackingRow}>
                    <dt>Despachado</dt>
                    <dd>
                      {new Date(order.shipped_at).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </dd>
                  </div>
                )}
              </dl>
              {(() => {
                const url = getTrackingUrl(order.carrier, order.tracking_number)
                return url ? (
                  <a
                    className={styles.trackingLink}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Rastrear en {getCarrier(order.carrier)?.name ?? 'el carrier'}
                    <Icon size={14} aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </Icon>
                  </a>
                ) : null
              })()}
            </div>
          )}

          <div className={styles.itemsSection}>
            <h2 className={styles.itemsTitle}>Productos</h2>
            <ul className={styles.itemsList}>
              {order.order_items?.map(item => (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemImage}>
                    {item.product_variant?.product?.image_url ? (
                      <img src={item.product_variant.product.image_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className={styles.itemPlaceholder} aria-hidden="true">Sin imagen</span>
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemName}>
                      {item.product_variant?.product?.name || 'Producto'}
                    </p>
                    <p className={styles.itemVariant}>
                      {item.product_variant?.version} · Talle {item.product_variant?.size}
                    </p>
                    <p className={styles.itemQuantity}>×{item.quantity}</p>
                  </div>
                  <p className={styles.itemPrice}>
                    ${item.unit_price.toLocaleString('es-AR')}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.total}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalAmount}>
              ${order.total_amount.toLocaleString('es-AR')}
            </span>
          </div>

          {['paid', 'processing', 'shipped', 'delivered'].includes(order.status) && order.shipping_address && (
            <div className={styles.printRow}>
              <a
                className={styles.printButton}
                href={`/pedido/${order.id}/etiqueta?email=${encodeURIComponent(email)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon size={14} aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </Icon>
                Imprimir etiqueta de envío
              </a>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
