import { useCartStore } from '../hooks/useCartStore'
import styles from './CartButton.module.css'

export default function CartButton() {
  const { getCartCount, openDrawer } = useCartStore()
  const count = getCartCount()
  const label = count > 0 ? `Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}` : 'Carrito, vacío'

  return (
    <button
      type="button"
      className={styles.cartButton}
      onClick={openDrawer}
      aria-label={label}
    >
      <svg
        className={styles.icon}
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
      <span className={styles.text}>Carrito</span>
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  )
}
