import { useState, useEffect, useRef } from 'react'
import type { ProductWithVariants } from '../lib/types'
import { Skeleton, Icon } from './Primitives'
import { useReveal } from '../hooks/useReveal'
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
    fetchProducts(initial, 1)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleFiltersChange = (e: Event) => {
      const detail = (e as CustomEvent<Filters>).detail
      setPage(1)
      fetchProducts(detail, 1)
    }
    window.addEventListener('filterschange', handleFiltersChange as EventListener)
    return () => window.removeEventListener('filterschange', handleFiltersChange as EventListener)
  }, [])

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
    fetchProducts(getFiltersFromURL(), newPage)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <ul className={styles.grid} aria-label="Cargando productos">
          {Array.from({ length: pageSize }).map((_, i) => (
            <li key={i}>
              <Skeleton width="100%" height="280px" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <Skeleton width="60%" height="14px" />
                <Skeleton width="40%" height="20px" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error} role="alert">
        <span className={styles.errorIcon}>
          <Icon size={24} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </Icon>
        </span>
        <h2 className={styles.errorTitle}>Algo salió mal</h2>
        <p className={styles.errorDesc}>{error}</p>
        <button type="button" className={styles.retryButton} onClick={() => fetchProducts(getFiltersFromURL(), 1)}>
          <Icon size={16} aria-hidden="true">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </Icon>
          Reintentar
        </button>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.loadingIcon}>
          <Icon size={24} aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </Icon>
        </span>
        <h2 className={styles.emptyTitle}>No encontramos resultados</h2>
        <p className={styles.emptyDesc}>Probá ajustar los filtros o volver más tarde.</p>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          <strong>{total}</strong> {total === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      <ul className={styles.grid}>
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} delay={i * 50} />
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Paginación de productos">
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            aria-label="Página anterior"
          >
            <Icon size={14} aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </Icon>
            Anterior
          </button>
          <span className={styles.pageInfo} aria-current="page">
            Página <strong>{page}</strong> de <strong>{totalPages}</strong>
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            aria-label="Página siguiente"
          >
            Siguiente
            <Icon size={14} aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </Icon>
          </button>
        </nav>
      )}
    </div>
  )
}

function ProductCard({ product, delay }: { product: ProductWithVariants; delay: number }) {
  const { ref, revealed } = useReveal<HTMLLIElement>()
  const cardRef = useRef<HTMLAnchorElement | null>(null)

  const minPrice = product.product_variants.length > 0
    ? Math.min(...product.product_variants.map(v => v.price))
    : 0

  const hasStock = product.product_variants.some(v => v.stock_quantity > 0)
  const isFeatured = product.is_featured === true

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (cardRef.current) {
      cardRef.current.click()
    }
  }

  return (
    <li ref={ref} className={`${styles.cardReveal} ${revealed ? styles.cardRevealed : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <a
        ref={cardRef}
        href={`/camisetas/${product.id}`}
        className={`${styles.card} ${!hasStock ? styles.soldOut : ''}`}
        aria-label={`${product.name}${hasStock ? '' : ' (agotado)'}`}
      >
        <div className={styles.imageContainer}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              className={styles.image}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={styles.placeholder} aria-hidden="true">Sin imagen</div>
          )}
          {isFeatured && (
            <span className={styles.badge}>
              Destacado
            </span>
          )}
          {!hasStock && (
            <span className={`${styles.badge} ${styles.badgeAccent}`}>
              Agotado
            </span>
          )}
          {hasStock && (
            <button
              type="button"
              className={styles.quickAdd}
              onClick={handleQuickAdd}
              aria-label={`Ver detalles de ${product.name}`}
            >
              <Icon size={18} aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </Icon>
            </button>
          )}
        </div>
        <div className={styles.info}>
          {product.league && (
            <span className={styles.eyebrow}>{product.league}</span>
          )}
          <h3 className={styles.name}>{product.name}</h3>
          <div className={styles.priceRow}>
            {product.product_variants.length > 0 ? (
              <span className={styles.price}>${minPrice.toLocaleString('es-AR')}</span>
            ) : (
              <span className={styles.priceLabel}>Consultar</span>
            )}
          </div>
          {hasStock && (
            <p className={styles.transferHint}>15% off pagando por transferencia</p>
          )}
        </div>
      </a>
    </li>
  )
}
