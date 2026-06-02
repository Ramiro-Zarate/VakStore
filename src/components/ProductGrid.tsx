import { useState, useEffect } from 'react'
import type { ProductWithVariants } from '../lib/types'
import styles from './ProductGrid.module.css'
import type { Filters } from './FilterSidebar'

interface ProductGridProps {
  initialFilters?: Filters
  featuredOnly?: boolean
  pageSize?: number
}

function getFiltersFromURL(): Filters {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    category: params.get('category') || undefined,
    size: params.get('size') || undefined,
    league: params.get('league') || undefined,
    minPrice: params.get('minPrice') || undefined,
    maxPrice: params.get('maxPrice') || undefined
  }
}

export default function ProductGrid({
  initialFilters = {},
  featuredOnly = false,
  pageSize = 12
}: ProductGridProps) {
  const [products, setProducts] = useState<ProductWithVariants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [currentFilters, setCurrentFilters] = useState<Filters>(initialFilters)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const fetchProducts = (filters: Filters, pageToFetch: number) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (featuredOnly) params.set('featured', 'true')
    params.set('page', String(pageToFetch))
    params.set('limit', String(pageSize))
    const url = `/api/products?${params.toString()}`

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setProducts(data.products)
          setTotal(data.total ?? 0)
        }
      })
      .catch(() => setError('Error al cargar productos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const initial = getFiltersFromURL()
    setCurrentFilters(initial)
    fetchProducts(initial, 1)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleFiltersChange = (e: CustomEvent<Filters>) => {
      setCurrentFilters(e.detail)
      setPage(1)
      fetchProducts(e.detail, 1)
    }
    window.addEventListener('filterschange', handleFiltersChange as EventListener)
    return () => window.removeEventListener('filterschange', handleFiltersChange as EventListener)
  }, [])

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
    fetchProducts(currentFilters, newPage)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) return <div className={styles.loading}>Cargando...</div>
  if (error) return <div className={styles.error}>{error}</div>
  if (products.length === 0) return <div className={styles.empty}>No hay productos</div>

  return (
    <div>
      <div className={styles.grid}>
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Paginación">
          <button
            className={styles.pageButton}
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
          >
            ← Anterior
          </button>
          <span className={styles.pageInfo}>
            Página {page} de {totalPages} ({total} productos)
          </span>
          <button
            className={styles.pageButton}
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
          >
            Siguiente →
          </button>
        </nav>
      )}
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
          <img src={product.image_url} alt={product.name} className={styles.image} loading="lazy" decoding="async" />
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
