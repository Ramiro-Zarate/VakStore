export interface Product {
  id: string
  name: string
  description: string | null
  category: 'camisetas' | 'shorts' | 'camperas'
  image_url: string | null
  is_active: boolean
  is_featured: boolean
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

export type ProductWithVariants = Product & {
  product_variants: ProductVariant[]
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
  email: string | null
  customer_name: string | null
  status: 'pending' | 'awaiting_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  total_amount: number
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  payment_intent_id: string | null
  payment_status: string | null
  payment_method: 'mercadopago' | 'transfer'
  shipping_method: string | null
  shipping_cost: number | null
  bank_info_snapshot: BankInfoSnapshot | null
  transfer_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface BankInfoSnapshot {
  alias: string
  cbu: string
  holder: string
  cuit: string
}

export interface ShippingMethod {
  id: string
  name: string
  base_cost: number
  is_active: boolean
  created_at: string
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

export interface WebhookEvent {
  id: string
  provider: string
  external_id: string
  payload: unknown | null
  processed_at: string
}

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Product>
        Relationships: []
      }
      product_variants: {
        Row: ProductVariant
        Insert: Omit<ProductVariant, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<ProductVariant>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Profile>
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Order>
        Relationships: []
      }
      order_items: {
        Row: OrderItem
        Insert: Omit<OrderItem, 'id' | 'created_at'>
        Update: Partial<OrderItem>
        Relationships: []
      }
      cart_items: {
        Row: CartItem
        Insert: Omit<CartItem, 'id' | 'created_at'>
        Update: Partial<CartItem>
        Relationships: []
      }
      webhook_events: {
        Row: WebhookEvent
        Insert: Omit<WebhookEvent, 'id' | 'processed_at'>
        Update: Partial<WebhookEvent>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      decrement_stock: {
        Args: { p_variant_id: string; p_qty: number }
        Returns: number
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
