import { useCartStore } from '../hooks/useCartStore'
import styles from './CartDrawer.module.css'

export default function CartDrawer() {
  const {
    items,
    isDrawerOpen,
    closeDrawer,
    updateQuantity,
    removeFromCart,
    getCartTotal,
    clearCart
  } = useCartStore()

  if (!isDrawerOpen) return null

  const total = getCartTotal()

  return (
    <>
      <div className={styles.overlay} onClick={closeDrawer} />
      <aside className={styles.drawer}>
        <div className={styles.header}>
          <h2 className={styles.title}>Tu Carrito</h2>
          <button className={styles.closeButton} onClick={closeDrawer}>✕</button>
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <p>Tu carrito está vacío</p>
            <button className={styles.shopButton} onClick={closeDrawer}>
              Ver productos
            </button>
          </div>
        ) : (
          <>
            <div className={styles.items}>
              {items.map(item => (
                <div key={item.productVariantId} className={styles.item}>
                  <div className={styles.itemImage}>
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} loading="lazy" decoding="async" />
                    ) : (
                      <div className={styles.imagePlaceholder}>Sin imagen</div>
                    )}
                  </div>
                  <div className={styles.itemInfo}>
                    <h3 className={styles.itemName}>{item.productName}</h3>
                    <p className={styles.itemVariant}>
                      {item.version} · Talle {item.size}
                    </p>
                    <p className={styles.itemPrice}>
                      ${item.price.toLocaleString('es-AR')}
                    </p>
                    <div className={styles.itemActions}>
                      <div className={styles.quantityControl}>
                        <button
                          className={styles.quantityButton}
                          onClick={() => updateQuantity(item.productVariantId, item.quantity - 1)}
                        >
                          -
                        </button>
                        <span className={styles.quantity}>{item.quantity}</span>
                        <button
                          className={styles.quantityButton}
                          onClick={() => updateQuantity(item.productVariantId, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                        >
                          +
                        </button>
                      </div>
                      <button
                        className={styles.removeButton}
                        onClick={() => removeFromCart(item.productVariantId)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.footer}>
              <div className={styles.total}>
                <span>Total:</span>
                <span className={styles.totalPrice}>${total.toLocaleString('es-AR')}</span>
              </div>
              <button
                className={styles.checkoutButton}
                onClick={() => {
                  closeDrawer()
                  window.location.href = '/checkout'
                }}
              >
                Finalizar compra
              </button>
              <button className={styles.clearButton} onClick={clearCart}>
                Vaciar carrito
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}