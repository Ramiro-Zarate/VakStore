import { Resend } from 'resend'
import * as Sentry from '@sentry/astro'

const apiKey = import.meta.env.RESEND_API_KEY
const fromEmail = import.meta.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

const resend = apiKey ? new Resend(apiKey) : null

export interface OrderEmailData {
  orderId: string
  customerName: string
  customerEmail: string
  totalAmount: number
  items: Array<{
    name: string
    version: string
    size: string
    quantity: number
    unitPrice: number
  }>
  shippingAddress: string
  shippingCity: string
  shippingPostalCode: string
}

export interface OrderCancelledEmailData {
  orderId: string
  customerName: string
  customerEmail: string
  totalAmount: number
  reason: string
  refunded: boolean
}

function formatPrice(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
}

function buildOrderEmail(data: OrderEmailData): string {
  const itemsHtml = data.items
    .map(
      item => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
          <strong>${item.name}</strong><br>
          <span style="color:#666;font-size:14px;">${item.version} · Talle ${item.size}</span>
        </td>
        <td style="padding:8px 0;text-align:center;border-bottom:1px solid #e5e5e5;">${item.quantity}</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #e5e5e5;">${formatPrice(item.unitPrice * item.quantity)}</td>
      </tr>`
    )
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#131313;">
      <h1 style="color:#970005;margin:0 0 16px;">¡Gracias por tu compra, ${data.customerName}!</h1>
      <p>Recibimos tu pedido <strong>#${data.orderId.slice(0, 8).toUpperCase()}</strong> y lo estamos procesando.</p>

      <h2 style="font-size:18px;margin:24px 0 8px;">Resumen</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #131313;">
            <th style="text-align:left;padding:8px 0;">Producto</th>
            <th style="text-align:center;padding:8px 0;">Cant.</th>
            <th style="text-align:right;padding:8px 0;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:16px 0 8px;text-align:right;"><strong>Total</strong></td>
            <td style="padding:16px 0 8px;text-align:right;font-size:18px;color:#970005;"><strong>${formatPrice(data.totalAmount)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <h2 style="font-size:18px;margin:24px 0 8px;">Envío</h2>
      <p style="margin:0;line-height:1.5;">
        ${data.shippingAddress}<br>
        ${data.shippingCity} (${data.shippingPostalCode})
      </p>

      <p style="margin-top:32px;font-size:14px;color:#666;">
        Podés seguir el estado de tu pedido en cualquier momento ingresando a
        <a href="${import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321'}/pedido/${data.orderId}" style="color:#970005;">este enlace</a>.
      </p>
    </div>
  `
}

export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail || !data.customerEmail.includes('@')) {
    console.warn('[email] skipping confirmation, invalid email', {
      orderId: data.orderId,
      email: data.customerEmail
    })
    Sentry.captureMessage('Skipped order confirmation email: invalid recipient', {
      level: 'warning',
      extra: { orderId: data.orderId, email: data.customerEmail, type: 'confirmation' }
    })
    return
  }

  if (!resend) {
    console.log('[email] Resend not configured, would send:', {
      to: data.customerEmail,
      subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} confirmado`,
      data
    })
    return
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: data.customerEmail,
    subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} confirmado`,
    html: buildOrderEmail(data)
  })

  if (error) {
    console.error('[email] Resend error:', error)
  }
}

function buildOrderCancelledEmail(data: OrderCancelledEmailData): string {
  const refundNote = data.refunded
    ? `<p style="margin-top:24px;line-height:1.5;">El cobro a tu tarjeta fue revertido automáticamente. El reembolso puede tardar algunos días hábiles en verse reflejado según tu banco.</p>`
    : `<p style="margin-top:24px;line-height:1.5;">Si tu tarjeta fue debitada, te vamos a estar reintegrando el monto en los próximos días hábiles.</p>`

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#131313;">
      <h1 style="color:#970005;margin:0 0 16px;">Tu pedido fue cancelado</h1>
      <p>Hola ${data.customerName},</p>
      <p>Lamentamos informarte que tu pedido <strong>#${data.orderId.slice(0, 8).toUpperCase()}</strong> fue cancelado por el siguiente motivo:</p>
      <p style="background:#fdf0f1;border-left:3px solid #970005;padding:12px 16px;margin:16px 0;">${data.reason}</p>
      <p>Importe: <strong>${formatPrice(data.totalAmount)}</strong></p>
      ${refundNote}
      <p style="margin-top:24px;font-size:14px;color:#666;">
        Si tenés alguna duda, respondé este email y te vamos a ayudar.
      </p>
    </div>
  `
}

export async function sendOrderCancelledEmail(data: OrderCancelledEmailData): Promise<void> {
  if (!data.customerEmail || !data.customerEmail.includes('@')) {
    console.warn('[email] skipping cancellation, invalid email', {
      orderId: data.orderId,
      email: data.customerEmail
    })
    Sentry.captureMessage('Skipped order cancellation email: invalid recipient', {
      level: 'warning',
      extra: { orderId: data.orderId, email: data.customerEmail, type: 'cancellation' }
    })
    return
  }

  if (!resend) {
    console.log('[email] Resend not configured, would send cancellation:', {
      to: data.customerEmail,
      subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} cancelado`,
      data
    })
    return
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: data.customerEmail,
    subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} cancelado`,
    html: buildOrderCancelledEmail(data)
  })

  if (error) {
    console.error('[email] Resend error (cancellation):', error)
  }
}
