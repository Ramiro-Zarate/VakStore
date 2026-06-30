import { z } from 'zod'

export const checkoutItemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().positive().max(99)
})

export const checkoutCustomerSchema = z.object({
  email: z.email().max(255),
  name: z.string().min(1).max(255),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  phone: z.string().min(8).max(20).regex(/^[\d\s+\-()]+$/, 'Teléfono inválido'),
  province: z.string().min(1).max(50)
})

export const paymentMethodSchema = z.enum(['mercadopago', 'transfer'])

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(50),
  customer: checkoutCustomerSchema,
  paymentMethod: paymentMethodSchema.default('mercadopago'),
  shippingMethod: z.string().min(1).max(50)
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
