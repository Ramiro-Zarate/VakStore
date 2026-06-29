import { createClient } from '@supabase/supabase-js'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env') })

const orderId = process.argv[2]

if (!orderId) {
  console.error('❌ Uso: npm run confirm-order <order-id>')
  console.error('   Ejemplo: npm run confirm-order 2d8e345a-8aee-46f2-b502-bcfa2b445178')
  process.exit(1)
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan credenciales de Supabase en .env')
  console.error('   PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function confirmOrder() {
  console.log(`🔍 Buscando orden ${orderId}...`)

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total_amount, email, customer_name')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchError) {
    console.error('❌ Error al buscar la orden:', fetchError.message)
    process.exit(1)
  }

  if (!order) {
    console.error(`❌ Orden ${orderId} no encontrada`)
    process.exit(1)
  }

  console.log(`\n📋 Orden encontrada:`)
  console.log(`   Cliente:  ${order.customer_name} <${order.email}>`)
  console.log(`   Total:    $${order.total_amount}`)
  console.log(`   Pago:     ${order.payment_method}`)
  console.log(`   Status:   ${order.status} / ${order.payment_status}`)

  if (order.status !== 'awaiting_payment') {
    console.error(`\n❌ La orden no está en 'awaiting_payment' (está en '${order.status}').`)
    console.error('   Solo se confirman órdenes que esperan pago por transferencia.')
    process.exit(1)
  }

  console.log(`\n⏳ Actualizando orden a 'paid'...`)

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      payment_status: 'approved',
      payment_intent_id: `TRANSFER-${orderId}`
    })
    .eq('id', orderId)

  if (updateError) {
    console.error('❌ Error al actualizar la orden:', updateError.message)
    process.exit(1)
  }

  console.log(`✓ Orden marcada como 'paid'`)
  console.log(`✓ payment_intent_id: TRANSFER-${orderId}`)
  console.log(`\n⚠️  IMPORTANTE: el stock NO se decrementó automáticamente.`)
  console.log(`   Para decrementar stock y enviar email de confirmación,`)
  console.log(`   llamá processApprovedPayment desde la app o vía Supabase Edge Function.`)
  console.log(`\n   (Próxima fase: endpoint /api/admin/orders/[id]/confirm-transfer)`)
  console.log(`\n✅ Listo. Verificá la orden en /pedido/${orderId}`)
}

confirmOrder().catch(err => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
