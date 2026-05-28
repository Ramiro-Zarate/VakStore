export interface Product {
  id: string
  name: string
  description: string | null
  category: 'camisetas' | 'shorts' | 'camperas'
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductVariant {
  id: string
  product_id: string
  version: 'jugador' | 'fan' | 'retro'
  size: string
  club: string
  league: string
  stock_quantity: number
  price: number
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  user_id: string | null
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  total_amount: number
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  payment_intent_id: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_variant_id: string
  quantity: number
  unit_price: number
  created_at: string
}

export interface CartItem {
  id: string
  user_id: string | null
  session_id: string | null
  product_variant_id: string
  quantity: number
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Product>
      }
      product_variants: {
        Row: ProductVariant
        Insert: Omit<ProductVariant, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<ProductVariant>
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Profile>
      }
      orders: {
        Row: Order
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Order>
      }
      order_items: {
        Row: OrderItem
        Insert: Omit<OrderItem, 'id' | 'created_at'>
        Update: Partial<OrderItem>
      }
      cart_items: {
        Row: CartItem
        Insert: Omit<CartItem, 'id' | 'created_at'>
        Update: Partial<CartItem>
      }
    }
  }
}
