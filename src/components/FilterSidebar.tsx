import { useState, useEffect, useId } from 'react'
import { useEscape } from '../hooks/useEscape'
import { Field, Select, Input, Icon } from './Primitives'
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
  leagues?: string[]
}

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'camisetas', label: 'Camisetas' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'camperas', label: 'Camperas' }
]

const SIZES = [
  { value: '', label: 'Todos' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' }
]

const PRICE_KEYS = ['minPrice', 'maxPrice'] as const

function clampPrice(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (Number.isNaN(n)) return undefined
  return String(Math.max(0, n))
}

function getFiltersFromURL(): Filters {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    category: params.get('category') || undefined,
    size: params.get('size') || undefined,
    league: params.get('league') || undefined,
    minPrice: clampPrice(params.get('minPrice') || undefined),
    maxPrice: clampPrice(params.get('maxPrice') || undefined)
  }
}

const FILTER_LABELS: Record<keyof Filters, string> = {
  category: 'Categoría',
  size: 'Talle',
  league: 'Liga',
  minPrice: 'Precio mín.',
  maxPrice: 'Precio máx.'
}

export default function FilterSidebar({ leagues = [] }: FilterSidebarProps) {
  const [filters, setFilters] = useState<Filters>(getFiltersFromURL)
  const [isOpen, setIsOpen] = useState(false)
  const baseId = useId()
  const idCategory = `${baseId}-category`
  const idSize = `${baseId}-size`
  const idLeague = `${baseId}-league`
  const idMin = `${baseId}-min`
  const idMax = `${baseId}-max`

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

  useEscape(isOpen, () => setIsOpen(false))

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
    const sanitized = (PRICE_KEYS as readonly string[]).includes(key)
      ? clampPrice(value)
      : value
    const newFilters = { ...filters, [key]: sanitized || undefined }
    updateURL(newFilters)
  }

  const minNum = filters.minPrice !== undefined ? Number(filters.minPrice) : null
  const maxNum = filters.maxPrice !== undefined ? Number(filters.maxPrice) : null
  const priceError =
    minNum !== null && maxNum !== null && !Number.isNaN(minNum) && !Number.isNaN(maxNum) && minNum > maxNum
      ? 'El precio mínimo no puede ser mayor al máximo.'
      : null

  const handleClear = () => {
    updateURL({})
  }

  const activeFilters = (Object.entries(filters) as [keyof Filters, string | undefined][])
    .filter(([, value]) => value)

  const leagueOptions = [
    { value: '', label: 'Todas' },
    ...leagues.map(l => ({ value: l, label: l }))
  ]

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls="filter-panel"
      >
        <Icon size={16} aria-hidden="true">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </Icon>
        Filtros
        {activeFilters.length > 0 && (
          <span style={{ marginLeft: 'var(--space-1)' }} aria-hidden="true">({activeFilters.length})</span>
        )}
      </button>

      <div
        className={`${styles.overlay} ${isOpen ? styles.visible : ''}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="filter-panel"
        className={`${styles.panel} ${isOpen ? styles.open : ''}`}
        role="region"
        aria-label="Filtros de productos"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>
            Filtros
            {activeFilters.length > 0 && (
              <span className={styles.titleCount} aria-label={`${activeFilters.length} activos`}>
                {activeFilters.length}
              </span>
            )}
          </h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar filtros"
          >
            <Icon size={18} aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className={styles.activeFilters}>
            <span className={styles.activeTitle}>Filtros activos</span>
            <div className={styles.activeTags}>
              {activeFilters.map(([key, value]) => (
                <span key={key} className={styles.tag}>
                  {FILTER_LABELS[key]}: <strong style={{ marginLeft: 2 }}>{value}</strong>
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => handleChange(key, '')}
                    aria-label={`Quitar filtro ${FILTER_LABELS[key]} ${value}`}
                  >
                    <Icon size={12} aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </Icon>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <Field id={idCategory} label="Categoría">
          <Select
            options={CATEGORIES}
            value={filters.category ?? ''}
            onChange={e => handleChange('category', e.target.value)}
          />
        </Field>

        <Field id={idSize} label="Talle">
          <Select
            options={SIZES}
            value={filters.size ?? ''}
            onChange={e => handleChange('size', e.target.value)}
          />
        </Field>

        <Field id={idLeague} label="Liga">
          <Select
            options={leagueOptions}
            value={filters.league ?? ''}
            onChange={e => handleChange('league', e.target.value)}
          />
        </Field>

        <Field
          id={`${idMin}-group`}
          label="Precio"
          optional
          error={priceError}
        >
          <div className={styles.priceRow}>
            <Input
              id={idMin}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Mín."
              value={filters.minPrice ?? ''}
              onChange={e => handleChange('minPrice', e.target.value)}
              aria-label="Precio mínimo"
            />
            <Input
              id={idMax}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Máx."
              value={filters.maxPrice ?? ''}
              onChange={e => handleChange('maxPrice', e.target.value)}
              aria-label="Precio máximo"
            />
          </div>
        </Field>

        <div className={styles.divider} aria-hidden="true" />

        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          disabled={activeFilters.length === 0}
        >
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
    const handleFiltersChange = (e: Event) => {
      setFilters((e as CustomEvent<Filters>).detail)
    }
    window.addEventListener('filterschange', handleFiltersChange as EventListener)
    return () => window.removeEventListener('filterschange', handleFiltersChange as EventListener)
  }, [])

  return filters
}


