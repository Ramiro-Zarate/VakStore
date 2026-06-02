import { MercadoPagoConfig } from 'mercadopago'

const accessToken = import.meta.env.MP_ACCESS_TOKEN

if (!accessToken) {
  throw new Error('Missing MP_ACCESS_TOKEN in env')
}

export const mpClient = new MercadoPagoConfig({ accessToken })

export const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321'
