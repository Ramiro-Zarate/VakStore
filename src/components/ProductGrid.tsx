import { useState, useEffect } from 'react'
import type { ProductWithVariants } from '../lib/types'
import styles from './ProductGrid.module.css'
import type { Filters } from './FilterSidebar'

interface ProductGridProps {
  initialFilters?: Filters
}

export default function ProductGrid({ initialFilters = {} }: ProductGridProps) {
  const [products, setProducts] = useState<ProductWithVariants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts(initialFilters)
  }, [JSON.stringify(initialFilters)])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleFiltersChange = (e: CustomEvent<Filters>) => {
      fetchProducts(e.detail)
    }
    window.addEventListener('filterschange', handleFiltersChange as EventListener)
    return () => window.removeEventListener('filterschange', handleFiltersChange as EventListener)
  }, [])

  async function fetchProducts(filters: Filters) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      const queryString = params.toString()
      const url = queryString ? `/api/products?${queryString}` : '/api/products'
      
      const res = await fetch(url)
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
    <a href={`/camisetas/${product.id}`} className={`${styles.card} ${!hasStock ? styles.soldOutCard : ''}`}>
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
      </div>
    </a>
  )
}