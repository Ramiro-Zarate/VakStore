import { useEffect, useRef } from 'react'
import { useCartStore } from '../hooks/useCartStore'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useEscape } from '../hooks/useEscape'
import { Icon } from './Primitives'
import styles from './CartIsland.module.css'

export default function CartIsland() {
  const {
    items,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    updateQuantity,
    removeFromCart,
    getCartTotal,
    clearCart
  } = useCartStore()

  const count = items.reduce((acc, i) => acc + i.quantity, 0)
  const total = getCartTotal()

  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const trapRef = useFocusTrap<HTMLDivElement>(isDrawerOpen)
  useEscape(isDrawerOpen, () => closeDrawer())

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isDrawerOpen && !dialog.open) {
      dialog.showModal()
    } else if (!isDrawerOpen && dialog.open) {
      dialog.close()
    }
  }, [isDrawerOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => closeDrawer()
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) closeDrawer()
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleClick)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleClick)
    }
  }, [closeDrawer])

  const buttonLabel =
    count > 0
      ? `Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`
      : 'Carrito, vacío'

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={openDrawer}
        aria-label={buttonLabel}
      >
        <svg
          className={styles.buttonIcon}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <span className={styles.buttonText}>Carrito</span>
        {count > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {count}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className={styles.drawer}
        aria-labelledby="cart-drawer-title"
      >
        <div ref={trapRef} style={{ display: 'contents' }}>
          <header className={styles.header}>
            <h2 id="cart-drawer-title" className={styles.title}>
              Tu carrito
              {count > 0 && (
                <span
                  className={styles.titleCount}
                  aria-label={`${count} ${count === 1 ? 'producto' : 'productos'}`}
                >
                  {count}
                </span>
              )}
            </h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeDrawer}
              aria-label="Cerrar carrito"
            >
              <Icon size={18} aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </Icon>
            </button>
          </header>

          <div
            className={styles.body}
            role="region"
            aria-label="Productos en el carrito"
          >
            {items.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  <Icon size={28}>
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </Icon>
                </span>
                <h3 className={styles.emptyTitle}>Tu carrito está vacío</h3>
                <p className={styles.emptyDesc}>
                  Explorá nuestra colección y agregá tu primera camiseta.
                </p>
                <button
                  type="button"
                  className={styles.shopButton}
                  onClick={closeDrawer}
                >
                  Ver productos
                  <Icon size={14} aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </Icon>
                </button>
              </div>
            ) : (
              <ul
                className={styles.list}
                aria-label={`${items.length} ${items.length === 1 ? 'producto' : 'productos'} en el carrito`}
              >
                {items.map(item => (
                  <li key={item.productVariantId} className={styles.item}>
                    <div className={styles.itemImage}>
                      {item.productImage ? (
                        <img
                          src={item.productImage}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className={styles.itemPlaceholder} aria-hidden="true">
                          Sin imagen
                        </span>
                      )}
                    </div>
                    <div className={styles.itemInfo}>
                      <h3 className={styles.itemName}>{item.productName}</h3>
                      <p className={styles.itemVariant}>
                        {item.version} · Talle {item.size}
                      </p>
                      <div className={styles.itemPriceRow}>
                        <span className={styles.itemPrice}>
                          ${(item.price * item.quantity).toLocaleString('es-AR')}
                        </span>
                        <div className={styles.itemActions}>
                          <div className={styles.quantityControl}>
                            <button
                              type="button"
                              className={styles.quantityButton}
                              onClick={() =>
                                updateQuantity(item.productVariantId, item.quantity - 1)
                              }
                              disabled={item.quantity <= 1}
                              aria-label={`Disminuir cantidad de ${item.productName}`}
                            >
                              <Icon size={14} aria-hidden="true">
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </Icon>
                            </button>
                            <span
                              className={styles.quantityValue}
                              aria-label={`Cantidad: ${item.quantity}`}
                            >
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              className={styles.quantityButton}
                              onClick={() =>
                                updateQuantity(item.productVariantId, item.quantity + 1)
                              }
                              disabled={item.quantity >= item.stock}
                              aria-label={`Aumentar cantidad de ${item.productName}`}
                            >
                              <Icon size={14} aria-hidden="true">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </Icon>
                            </button>
                          </div>
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => removeFromCart(item.productVariantId)}
                            aria-label={`Quitar ${item.productName} del carrito`}
                          >
                            <Icon size={12} aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                            </Icon>
                            Quitar
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <div className={styles.footer}>
              <div className={styles.total}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalAmount}>
                  ${total.toLocaleString('es-AR')}
                </span>
              </div>
              <button
                type="button"
                className={styles.checkoutButton}
                onClick={() => {
                  closeDrawer()
                  window.location.href = '/checkout'
                }}
              >
                Finalizar compra
                <Icon size={16} aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="9 18 15 12 9 6" />
                </Icon>
              </button>
              <button
                type="button"
                className={styles.clearButton}
                onClick={clearCart}
              >
                Vaciar carrito
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
