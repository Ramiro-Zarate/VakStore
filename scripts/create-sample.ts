import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'
import { join } from 'path'

const sampleData = {
  products: [
    {
      name: 'Argentina Local 2024',
      description: 'Camiseta oficial de Argentina como local',
      image_url: 'https://example.com/argentina-local.jpg',
      is_active: true,
      category: 'camiseta'
    },
    {
      name: 'Brasil Visita 2024',
      description: 'Camiseta de Brasil para partidos de visitante',
      image_url: 'https://example.com/brasil-visita.jpg',
      is_active: true,
      category: 'camiseta'
    },
    {
      name: 'Real Madrid Local 2024',
      description: 'Camiseta oficial del Real Madrid',
      image_url: 'https://example.com/real-madrid.jpg',
      is_active: true,
      category: 'camiseta'
    }
  ],
  variants: [
    { product_name: 'Argentina Local 2024', version: 'jugador', size: 'S', club: 'argentina', league: 'fifa', price: 25000 },
    { product_name: 'Argentina Local 2024', version: 'jugador', size: 'M', club: 'argentina', league: 'fifa', price: 25000 },
    { product_name: 'Argentina Local 2024', version: 'jugador', size: 'L', club: 'argentina', league: 'fifa', price: 25000 },
    { product_name: 'Argentina Local 2024', version: 'jugador', size: 'XL', club: 'argentina', league: 'fifa', price: 25000 },
    { product_name: 'Argentina Local 2024', version: 'fan', size: 'S', club: 'argentina', league: 'fifa', price: 18000 },
    { product_name: 'Argentina Local 2024', version: 'fan', size: 'M', club: 'argentina', league: 'fifa', price: 18000 },
    { product_name: 'Argentina Local 2024', version: 'fan', size: 'L', club: 'argentina', league: 'fifa', price: 18000 },
    { product_name: 'Brasil Visita 2024', version: 'jugador', size: 'M', club: 'brasil', league: 'conmebol', price: 22000 },
    { product_name: 'Brasil Visita 2024', version: 'jugador', size: 'L', club: 'brasil', league: 'conmebol', price: 22000 },
    { product_name: 'Brasil Visita 2024', version: 'fan', size: 'M', club: 'brasil', league: 'conmebol', price: 15000 },
    { product_name: 'Real Madrid Local 2024', version: 'jugador', size: 'S', club: 'real madrid', league: 'uefa', price: 35000 },
    { product_name: 'Real Madrid Local 2024', version: 'jugador', size: 'M', club: 'real madrid', league: 'uefa', price: 35000 },
    { product_name: 'Real Madrid Local 2024', version: 'fan', size: 'S', club: 'real madrid', league: 'uefa', price: 28000 }
  ]
}

const workbook = XLSX.utils.book_new()

const productsSheet = XLSX.utils.json_to_sheet(sampleData.products)
const variantsSheet = XLSX.utils.json_to_sheet(sampleData.variants)

XLSX.utils.book_append_sheet(workbook, productsSheet, 'products')
XLSX.utils.book_append_sheet(workbook, variantsSheet, 'variants')

const outputPath = join(process.cwd(), 'scripts/data/stock-sample.xlsx')
writeFileSync(outputPath, XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))

console.log('✅ Sample Excel created at scripts/data/stock-sample.xlsx')
console.log('\n📝 How to use:')
console.log('1. Rename to stock.xlsx or copy to stock.xlsx')
console.log('2. Edit the Excel with your real data')
console.log('3. Run npm run seed to upload to Supabase\n')