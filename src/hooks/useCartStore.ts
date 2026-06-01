import { useState, useEffect } from 'react'
import {
  type CartItem,
  getCartItems,
  getCartCount,
  getCartTotal,
  isDrawerOpen,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  openDrawer,
  closeDrawer,
  subscribe,
  initCartStore
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
  const [snapshot, setSnapshot] = useState<CartSnapshot>(() => ({
    items: getCartItems(),
    isDrawerOpen: isDrawerOpen(),
    getCartCount,
    getCartTotal
  }))

  useEffect(() => {
    // Initialize store from localStorage
    initCartStore()

    // Subscribe to store changes
    const unsubscribe = subscribe(() => {
      setSnapshot({
        items: getCartItems(),
        isDrawerOpen: isDrawerOpen(),
        getCartCount,
        getCartTotal
      })
    })

    return unsubscribe
  }, [])

  return {
    ...snapshot,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    openDrawer,
    closeDrawer
  }
}