import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))

export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  phone: optionalText(30),
  address: optionalText(200),
  city: optionalText(100),
  postal_code: optionalText(20)
})

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

export type ProfileUpdatePayload = {
  full_name: string
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
}

export function toProfilePayload(input: ProfileUpdate): ProfileUpdatePayload {
  return {
    full_name: input.full_name.trim(),
    phone: input.phone && input.phone.trim().length > 0 ? input.phone.trim() : null,
    address: input.address && input.address.trim().length > 0 ? input.address.trim() : null,
    city: input.city && input.city.trim().length > 0 ? input.city.trim() : null,
    postal_code:
      input.postal_code && input.postal_code.trim().length > 0 ? input.postal_code.trim() : null
  }
}
