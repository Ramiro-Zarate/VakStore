import { useState, useEffect } from 'react'
import { Field, Input, Skeleton, Icon } from './Primitives'
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

interface Order {
  id: string
  status: string
  total_amount: number
  created_at: string
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  email: string | null
  order_items?: OrderItem[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pendiente',
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
        </div>
      ) : null}
    </div>
  )
}
