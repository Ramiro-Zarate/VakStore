import type { Database } from './types'

export type Tables = Database['public']['Tables']

type NonNullableKeys<T> = {
  [K in keyof T]: T[K] extends infer U
    ? Exclude<U, null> | (undefined extends T[K] ? undefined : never)
    : never
}

type StrictUpdate<T> = Partial<NonNullableKeys<T>>

export type OrdersUpdate = StrictUpdate<Tables['orders']['Row']>
export type OrderItemsUpdate = StrictUpdate<Tables['order_items']['Row']>
export type ProductsUpdate = StrictUpdate<Tables['products']['Row']>
export type ProductVariantsUpdate = StrictUpdate<Tables['product_variants']['Row']>
export type ProfilesUpdate = StrictUpdate<Tables['profiles']['Row']>

export type OrderItemsInsert = Tables['order_items']['Insert']
export type WebhookEventsInsert = Tables['webhook_events']['Insert']

export type OrdersRow = Tables['orders']['Row']
export type OrderItemsRow = Tables['order_items']['Row']
export type ProductVariantsRow = Tables['product_variants']['Row']
export type ProductsRow = Tables['products']['Row']
