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

export interface TransferInstructionsEmailData {
  orderId: string
  customerName: string
  customerEmail: string
  subtotal: number
  shipping: number
  discount: number
  totalAmount: number
  bankInfo: { alias: string; cbu: string; holder: string; cuit: string }
  whatsappUrl: string
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

function buildTransferInstructionsEmail(data: TransferInstructionsEmailData): string {
  const subtotalFormatted = data.subtotal.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS'
  })
  const shippingFormatted = data.shipping.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS'
  })
  const discountFormatted = data.discount.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS'
  })
  const totalFormatted = data.totalAmount.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS'
  })
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#131313;">
      <h1 style="color:#970005;margin:0 0 16px;">Tu pedido está esperando el pago</h1>
      <p>Hola ${data.customerName},</p>
      <p>Recibimos tu pedido <strong>#${data.orderId.slice(0, 8).toUpperCase()}</strong> y quedó reservado. Para confirmarlo, hacé una transferencia con los datos de abajo.</p>

      <h2 style="font-size:18px;margin:24px 0 8px;">Resumen</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#666;">Subtotal</td><td style="padding:6px 0;text-align:right;">${subtotalFormatted}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Envío</td><td style="padding:6px 0;text-align:right;">${shippingFormatted}</td></tr>
        <tr><td style="padding:6px 0;color:#16a34a;">15% off en transferencia</td><td style="padding:6px 0;text-align:right;color:#16a34a;">-${discountFormatted}</td></tr>
        <tr><td style="padding:12px 0;color:#666;border-top:2px solid #131313;"><strong>Total a transferir</strong></td><td style="padding:12px 0;font-size:18px;font-weight:bold;color:#970005;border-top:2px solid #131313;text-align:right;">${totalFormatted}</td></tr>
      </table>

      <h2 style="font-size:18px;margin:24px 0 8px;">Datos bancarios</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#666;">Alias</td><td style="padding:6px 0;font-weight:bold;">${data.bankInfo.alias}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">CBU</td><td style="padding:6px 0;font-weight:bold;">${data.bankInfo.cbu}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Titular</td><td style="padding:6px 0;font-weight:bold;">${data.bankInfo.holder}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">CUIT</td><td style="padding:6px 0;font-weight:bold;">${data.bankInfo.cuit}</td></tr>
      </table>

      <h2 style="font-size:18px;margin:24px 0 8px;">Confirmar el pago</h2>
      <p>Una vez hecha la transferencia, mandá el comprobante por WhatsApp haciendo click en el botón:</p>
      <p style="margin:16px 0;">
        <a href="${data.whatsappUrl}" style="display:inline-block;padding:12px 24px;background-color:#25D366;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Enviar comprobante por WhatsApp</a>
      </p>
      <p style="margin-top:8px;font-size:13px;color:#666;">O seguí el estado de tu pedido en <a href="${import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321'}/pedido/${data.orderId}" style="color:#970005;">este enlace</a>.</p>

      <p style="margin-top:24px;font-size:13px;color:#666;">
        <strong>Importante:</strong> tu pedido se cancela automáticamente a las 72hs si no recibimos el comprobante. Si te pasás del plazo y ya transferiste, escribinos y lo resolvemos.
      </p>
    </div>
  `
}

export async function sendTransferInstructionsEmail(data: TransferInstructionsEmailData): Promise<void> {
  if (!data.customerEmail || !data.customerEmail.includes('@')) {
    console.warn('[email] skipping transfer instructions, invalid email', {
      orderId: data.orderId,
      email: data.customerEmail
    })
    return
  }

  if (!resend) {
    console.log('[email] Resend not configured, would send transfer instructions:', {
      to: data.customerEmail,
      subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} - datos para transferencia`,
      data
    })
    return
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: data.customerEmail,
    subject: `Pedido #${data.orderId.slice(0, 8).toUpperCase()} - datos para transferencia`,
    html: buildTransferInstructionsEmail(data)
  })

  if (error) {
    console.error('[email] Resend error (transfer instructions):', error)
  }
}

export interface AdminOrderEmailData {
  orderId: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  totalAmount: number
  paymentMethod: 'mercadopago' | 'transfer'
  items: Array<{
    name: string
    version: string
    size: string
    quantity: number
  }>
  shippingAddress: string
  shippingCity: string
  shippingProvince: string | null
  shippingPostalCode: string
}

function buildAdminOrderEmail(data: AdminOrderEmailData): string {
  const shortId = data.orderId.slice(0, 8).toUpperCase()
  const itemsHtml = data.items
    .map(
      item => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #e5e5e5;">
          <strong>${item.name}</strong><br>
          <span style="color:#666;font-size:13px;">${item.version} · Talle ${item.size}</span>
        </td>
        <td style="padding:6px 0;text-align:center;border-bottom:1px solid #e5e5e5;">${item.quantity}</td>
      </tr>`
    )
    .join('')

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || ''
  const dashboardLink = supabaseUrl
    ? `${supabaseUrl.replace('https://', 'https://app.supabase.com/project/').replace('.supabase.co', '')}/editor?table=orders&filter=id%3Aeq%3A${data.orderId}`
    : ''

  const paymentLabel = data.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#131313;">
      <h1 style="color:#970005;margin:0 0 16px;">Nuevo pedido #${shortId}</h1>
      <p style="margin:0 0 8px;"><strong>Cliente:</strong> ${data.customerName} (${data.customerEmail})</p>
      ${data.customerPhone ? `<p style="margin:0 0 8px;"><strong>Teléfono:</strong> ${data.customerPhone}</p>` : ''}
      <p style="margin:0 0 8px;"><strong>Pago:</strong> ${paymentLabel}</p>
      <p style="margin:0 0 16px;"><strong>Total:</strong> <span style="color:#970005;font-size:18px;">${formatPrice(data.totalAmount)}</span></p>

      <h2 style="font-size:16px;margin:24px 0 8px;">Envío</h2>
      <p style="margin:0;line-height:1.5;">
        ${data.shippingAddress}<br>
        ${data.shippingCity}${data.shippingProvince ? `, ${data.shippingProvince}` : ''} (${data.shippingPostalCode})
      </p>

      <h2 style="font-size:16px;margin:24px 0 8px;">Items</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #131313;">
            <th style="text-align:left;padding:6px 0;">Producto</th>
            <th style="text-align:center;padding:6px 0;">Cant.</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      ${dashboardLink ? `<p style="margin-top:24px;"><a href="${dashboardLink}" style="display:inline-block;padding:10px 20px;background-color:#970005;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Ver en Supabase</a></p>` : ''}
    </div>
  `
}

export async function sendAdminOrderNotification(data: AdminOrderEmailData): Promise<void> {
  const adminEmail = import.meta.env.ADMIN_EMAIL
  if (!adminEmail || !adminEmail.includes('@')) {
    console.warn('[email] ADMIN_EMAIL not configured, skipping admin notification', {
      orderId: data.orderId
    })
    return
  }

  const shortId = data.orderId.slice(0, 8).toUpperCase()
  const subject = `Nuevo pedido #${shortId} — ${formatPrice(data.totalAmount)}`

  if (!resend) {
    console.log('[email] Resend not configured, would send admin notification:', {
      to: adminEmail,
      subject
    })
    return
  }

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject,
      html: buildAdminOrderEmail(data)
    })
    if (error) {
      console.error('[email] admin notification error:', error)
    }
  } catch (err) {
    console.error('[email] admin notification failed:', err)
  }
}
