import { useState, useEffect } from 'react'
import type { Product, ProductVariant } from '../lib/types'
import styles from './ProductGrid.module.css'

type ProductWithVariants = Product & {
  product_variants: ProductVariant[]
}

export default function ProductGrid() {
  const [products, setProducts] = useState<ProductWithVariants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else {
        setProducts(data.products)
      }
    } catch (err) {
      setError('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className={styles.loading}>Cargando...</div>
  if (error) return <div className={styles.error}>{error}</div>
  if (products.length === 0) return <div className={styles.empty}>No hay productos</div>

  return (
    <div className={styles.grid}>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

function ProductCard({ product }: { product: ProductWithVariants }) {
  const minPrice = product.product_variants.length > 0
    ? Math.min(...product.product_variants.map(v => v.price))
    : 0

  const hasStock = product.product_variants.some(v => v.stock_quantity > 0)

  return (
    <a href={`/camisetas/${product.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder}>Sin imagen</div>
        )}
        {!hasStock && <span className={styles.soldOut}>Agotado</span>}
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>{product.name}</h3>
        <p className={styles.price}>
          {product.product_variants.length > 0 ? (
            <>${minPrice.toLocaleString('es-AR')}</>
          ) : (
            'Consultar'
          )}
        </p>
        <p className={styles.category}>{product.category}</p>
      </div>
    </a>
  )
}
