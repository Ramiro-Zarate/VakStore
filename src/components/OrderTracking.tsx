import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: '#f59e0b' },
  paid: { label: 'Pagado', color: '#10b981' },
  processing: { label: 'Procesando', color: '#3b82f6' },
  shipped: { label: 'Enviado', color: '#8b5cf6' },
  delivered: { label: 'Entregado', color: '#22c55e' },
  cancelled: { label: 'Cancelado', color: '#ef4444' }
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
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            product_variant (
              size,
              version,
              product (
                name,
                image_url
              )
            )
          )
        `)
        .eq('id', orderId)
        .single()

      if (fetchError || !data) {
        setError('Pedido no encontrado')
        return
      }

      if (data.email !== email) {
        setError('El email no coincide con este pedido')
        setVerified(false)
        setOrder(null)
      } else {
        setVerified(true)
        setOrder(data as Order)
      }
    } catch (err) {
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
        <p className={styles.loading}>Cargando...</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Seguimiento de pedido</h1>

      {!verified ? (
        <div className={styles.verifyCard}>
          <p className={styles.description}>
            Ingresá el email que usaste al realizar el pedido para ver el estado.
          </p>
          <form onSubmit={handleVerify} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder="tu@email.com"
                required
              />
            </div>

            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? 'Buscando...' : 'Verificar'}
            </button>
          </form>
        </div>
      ) : (
        <div className={styles.orderCard}>
          <div className={styles.orderHeader}>
            <div>
              <p className={styles.orderId}>Pedido #{order.id.slice(0, 8)}</p>
              <p className={styles.orderDate}>{formatDate(order.created_at)}</p>
            </div>
            <div
              className={styles.statusBadge}
              style={{ backgroundColor: STATUS_LABELS[order.status]?.color || '#666' }}
            >
              {STATUS_LABELS[order.status]?.label || order.status}
            </div>
          </div>

          {order.shipping_address && (
            <div className={styles.shippingInfo}>
              <h3>Dirección de envío</h3>
              <p>{order.shipping_address}</p>
              <p>{order.shipping_city} {order.shipping_postal_code}</p>
            </div>
          )}

          <div className={styles.items}>
            <h3>Productos</h3>
            {order.order_items?.map(item => (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemImage}>
                  {item.product_variant?.product?.image_url ? (
                    <img src={item.product_variant.product.image_url} alt="" />
                  ) : (
                    <div className={styles.imagePlaceholder}>Sin imagen</div>
                  )}
                </div>
                <div className={styles.itemInfo}>
                  <p className={styles.itemName}>{item.product_variant?.product?.name || 'Producto'}</p>
                  <p className={styles.itemVariant}>
                    {item.product_variant?.version} - Talle {item.product_variant?.size}
                  </p>
                  <p className={styles.itemQuantity}>Cantidad: {item.quantity}</p>
                </div>
                <p className={styles.itemPrice}>${item.unit_price.toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>

          <div className={styles.total}>
            <span>Total</span>
            <span className={styles.totalPrice}>${order.total_amount.toLocaleString('es-AR')}</span>
          </div>
        </div>
      )}
    </div>
  )
}