import { MercadoPagoConfig, PaymentRefund } from 'mercadopago'

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

export type RefundResult =
  | { ok: true; refundId: number }
  | { ok: false; error: string }

export async function refundPayment(paymentId: string | number): Promise<RefundResult> {
  try {
    const refundClient = new PaymentRefund(getMpClient())
    const result = await refundClient.total({ payment_id: paymentId })
    return { ok: true, refundId: result.id ?? 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
