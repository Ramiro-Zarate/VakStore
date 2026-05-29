import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env') })

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file')
  console.error('   PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ set' : '✗ missing')
  console.error('   PUBLIC_SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓ set' : '✗ missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const categoryMap: Record<string, string> = {
  'camiseta': 'camisetas',
  'short': 'short',
  'campera': 'campera'
}

async function seed() {
  console.log('🚀 Starting seed process...\n')

  const excelPath = join(process.cwd(), 'scripts/data/stock.xlsx')

  console.log('📖 Reading Excel file...')
  const workbook = XLSX.readFile(excelPath)

  const productsSheet = workbook.Sheets['products']
  const variantsSheet = workbook.Sheets['variants']

  if (!productsSheet || !variantsSheet) {
    console.error('❌ Error: Could not find products or variants sheet in Excel file')
    process.exit(1)
  }

  const productsData = XLSX.utils.sheet_to_json(productsSheet) as any[]
  const variantsData = XLSX.utils.sheet_to_json(variantsSheet) as any[]

  console.log(`📦 Found ${productsData.length} products and ${variantsData.length} variants in Excel\n`)

  let productsCreated = 0
  let productsSkipped = 0
  let variantsCreated = 0
  let variantsSkipped = 0

  const productNameToId: Record<string, string> = {}

  console.log('📝 Processing products...')

  for (const row of productsData) {
    const category = categoryMap[row.category] || row.category

    const { data: existingProduct } = await supabase
      .from('products')
      .select('id, name')
      .eq('name', row.name)
      .maybeSingle()

    if (existingProduct) {
      console.log(`  ⏭️  Product "${row.name}" already exists, skipping`)
      productNameToId[row.name] = existingProduct.id
      productsSkipped++
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: row.name,
          description: row.description || null,
          image_url: row.image_url || null,
          is_active: row.is_active !== undefined ? row.is_active : true,
          category: category
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  ❌ Error creating product "${row.name}":`, error.message)
      } else {
        console.log(`  ✅ Product "${row.name}" created`)
        productNameToId[row.name] = data.id
        productsCreated++
      }
    }
  }

  console.log(`\n✅ Products: ${productsCreated} created, ${productsSkipped} skipped`)

  console.log('\n📝 Processing variants...')

  for (const row of variantsData) {
    const productId = productNameToId[row.product_name]

    if (!productId) {
      console.log(`  ⚠️  Product "${row.product_name}" not found, skipping variant`)
      continue
    }

    const { data: existingVariant } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', productId)
      .eq('version', row.version)
      .eq('size', row.size)
      .maybeSingle()

    if (existingVariant) {
      console.log(`  ⏭️  Variant (${row.product_name}, ${row.version}, ${row.size}) already exists, skipping`)
      variantsSkipped++
    } else {
      const { error } = await supabase
        .from('product_variants')
        .insert({
          product_id: productId,
          version: row.version,
          size: row.size,
          club: row.club || null,
          league: row.league || null,
          price: row.price
        })

      if (error) {
        console.error(`  ❌ Error creating variant for ${row.product_name}:`, error.message)
      } else {
        console.log(`  ✅ Variant (${row.product_name}, ${row.version}, ${row.size}) created`)
        variantsCreated++
      }
    }
  }

  console.log(`\n✅ Variants: ${variantsCreated} created, ${variantsSkipped} skipped`)
  console.log('\n✨ Seed process completed!')
}

seed().catch(console.error)