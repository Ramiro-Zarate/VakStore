import { useSyncExternalStore } from 'react'
import {
  type CartItem,
  getCartCount,
  getCartTotal,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  openDrawer,
  closeDrawer,
  subscribe,
  getSnapshot,
  getServerSnapshot
} from '../stores/CartStore'

interface CartSnapshot {
  items: CartItem[]
  isDrawerOpen: boolean
  getCartCount: () => number
  getCartTotal: () => number
}

export function useCartStore(): CartSnapshot & {
  addToCart: typeof addToCart
  removeFromCart: typeof removeFromCart
  updateQuantity: typeof updateQuantity
  clearCart: typeof clearCart
  openDrawer: typeof openDrawer
  closeDrawer: typeof closeDrawer
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return {
    items: snapshot.items,
    isDrawerOpen: snapshot.isDrawerOpen,
    getCartCount,
    getCartTotal,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    openDrawer,
    closeDrawer
  }
}
