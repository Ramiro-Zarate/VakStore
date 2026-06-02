import { MercadoPagoConfig } from 'mercadopago'

export const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321'

let _mpClient: MercadoPagoConfig | null = null

export function getMpClient(): MercadoPagoConfig {
  if (_mpClient) return _mpClient
  const accessToken = import.meta.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('Missing MP_ACCESS_TOKEN in env')
  }
  _mpClient = new MercadoPagoConfig({ accessToken })
  return _mpClient
}
