export interface CartItem {
  productVariantId: string
  productId: string
  productName: string
  productImage: string | null
  version: string
  size: string
  price: number
  quantity: number
  stock: number
}

interface CartState {
  items: CartItem[]
  isDrawerOpen: boolean
}

type Listener = () => void

const STORAGE_KEY = 'vak-cart'

const state: CartState = {
  items: [],
  isDrawerOpen: false
}

const listeners = new Set<Listener>()

let version = 0
let cachedSnapshot: CartState | null = null

function loadFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CartItem[]
      state.items = parsed
    }
  } catch {
    state.items = []
  }
}

if (typeof window !== 'undefined') {
  loadFromStorage()
}

function notifyListeners(): void {
  version++
  cachedSnapshot = null
  listeners.forEach(listener => listener())
}

function getSnapshot(): CartState {
  if (cachedSnapshot) return cachedSnapshot
  cachedSnapshot = {
    items: [...state.items],
    isDrawerOpen: state.isDrawerOpen
  }
  return cachedSnapshot
}

function getServerSnapshot(): CartState {
  return { items: [], isDrawerOpen: false }
}

function saveToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
  } catch {
  }
}

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity: number): void {
  const existing = state.items.find(i => i.productVariantId === item.productVariantId)
  if (existing) {
    state.items = state.items.map(i =>
      i.productVariantId === item.productVariantId
        ? { ...i, quantity: i.quantity + quantity }
        : i
    )
  } else {
    state.items = [...state.items, { ...item, quantity }]
  }
  state.isDrawerOpen = true
  saveToStorage()
  notifyListeners()
}

export function removeFromCart(variantId: string): void {
  state.items = state.items.filter(i => i.productVariantId !== variantId)
  saveToStorage()
  notifyListeners()
}

export function updateQuantity(variantId: string, quantity: number): void {
  if (quantity <= 0) {
    removeFromCart(variantId)
    return
  }
  state.items = state.items.map(i =>
    i.productVariantId === variantId ? { ...i, quantity } : i
  )
  saveToStorage()
  notifyListeners()
}

export function clearCart(): void {
  state.items = []
  saveToStorage()
  notifyListeners()
}

export function openDrawer(): void {
  state.isDrawerOpen = true
  notifyListeners()
}

export function closeDrawer(): void {
  state.isDrawerOpen = false
  notifyListeners()
}

export function getCartCount(): number {
  return state.items.reduce((sum, item) => sum + item.quantity, 0)
}

export function getCartTotal(): number {
  return state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export { getSnapshot, getServerSnapshot }
