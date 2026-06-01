import { useCartStore } from '../hooks/useCartStore'
import styles from './CartButton.module.css'

export default function CartButton() {
  const { getCartCount, openDrawer } = useCartStore()
  const count = getCartCount()

  return (
    <button className={styles.cartButton} onClick={openDrawer}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6h15l-1.5 9h-12z" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
        <path d="M6 6L5 2H2" />
      </svg>
      <span className={styles.text}>Carrito</span>
      {count > 0 && <span className={styles.badge}>{count}</span>}
    </button>
  )
}