import { useState, useEffect } from 'react'
import styles from './FilterSidebar.module.css'

export interface Filters {
  category?: string
  size?: string
  league?: string
  minPrice?: string
  maxPrice?: string
}

interface FilterSidebarProps {
  initialFilters?: Filters
}

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'camisetas', label: 'Camisetas' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'camperas', label: 'Camperas' }
]

const SIZES = [
  { value: '', label: 'Todas' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' }
]

const LEAGUES = [
  { value: '', label: 'Todas' },
  { value: 'Premier League', label: 'Premier League' },
  { value: 'La Liga', label: 'La Liga' },
  { value: 'Selecciones', label: 'Selecciones' },
  { value: 'Ligue 1', label: 'Ligue 1' },
  { value: 'Liga Italiana', label: 'Liga Italiana' },
  { value: 'Liga Argentina', label: 'Liga Argentina' }
]

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

export default function FilterSidebar({ initialFilters = {} }: FilterSidebarProps) {
  const [filters, setFilters] = useState<Filters>(getFiltersFromURL)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setFilters(getFiltersFromURL())
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setFilters(getFiltersFromURL())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const updateURL = (newFilters: Filters) => {
    const params = new URLSearchParams()
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      }
    })
    const queryString = params.toString()
    const newURL = queryString ? `/productos?${queryString}` : '/productos'
    setFilters(newFilters)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', newURL)
      window.dispatchEvent(new CustomEvent('filterschange', { detail: newFilters }))
    }
  }

  const handleChange = (key: keyof Filters, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined }
    updateURL(newFilters)
  }

  const handleClear = () => {
    updateURL({})
  }

  const activeFilters = Object.entries(filters).filter(([, value]) => value)

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.visible : ''}`} onClick={() => setIsOpen(false)} />
      <aside className={`${styles.container} ${isOpen ? styles.open : ''}`}>
        <button className={styles.closeButton} onClick={() => setIsOpen(false)}>✕</button>
        
        <h3 className={styles.title}>Filtros</h3>

        {activeFilters.length > 0 && (
          <div className={styles.activeFilters}>
            <span className={styles.activeFiltersTitle}>Filtros activos</span>
            <div className={styles.activeTags}>
              {activeFilters.map(([key, value]) => (
                <span key={key} className={styles.tag}>
                  {value}
                  <button
                    className={styles.tagRemove}
                    onClick={() => handleChange(key as keyof Filters, '')}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.filterGroup}>
          <label className={styles.label}>Categoría</label>
          <select
            className={styles.select}
            value={filters.category || ''}
            onChange={(e) => handleChange('category', e.target.value)}
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Talle</label>
          <select
            className={styles.select}
            value={filters.size || ''}
            onChange={(e) => handleChange('size', e.target.value)}
          >
            {SIZES.map(size => (
              <option key={size.value} value={size.value}>{size.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Liga</label>
          <select
            className={styles.select}
            value={filters.league || ''}
            onChange={(e) => handleChange('league', e.target.value)}
          >
            {LEAGUES.map(league => (
              <option key={league.value} value={league.value}>{league.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Precio</label>
          <div className={styles.priceRow}>
            <input
              type="number"
              className={styles.input}
              placeholder="Min"
              value={filters.minPrice || ''}
              onChange={(e) => handleChange('minPrice', e.target.value)}
            />
            <input
              type="number"
              className={styles.input}
              placeholder="Max"
              value={filters.maxPrice || ''}
              onChange={(e) => handleChange('maxPrice', e.target.value)}
            />
          </div>
        </div>

        <button className={styles.clearButton} onClick={handleClear}>
          Limpiar filtros
        </button>
      </aside>
    </>
  )
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(getFiltersFromURL)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleFiltersChange = (e: CustomEvent<Filters>) => {
      setFilters(e.detail)
    }
    window.addEventListener('filterschange', handleFiltersChange as EventListener)
    return () => window.removeEventListener('filterschange', handleFiltersChange as EventListener)
  }, [])

  return filters
}

export { CATEGORIES, SIZES, LEAGUES }