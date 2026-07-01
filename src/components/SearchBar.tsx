import { useState, useEffect, useRef, useId } from 'react'
import { Icon } from './Primitives'
import styles from './SearchBar.module.css'

export default function SearchBar() {
  const [value, setValue] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const formId = useId()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) setValue(q)
  }, [])

  useEffect(() => {
    if (mobileOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [mobileOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    window.location.href = `/productos?q=${encodeURIComponent(trimmed)}`
  }

  const handleClear = () => {
    setValue('')
    if (typeof window !== 'undefined' && window.location.pathname === '/productos') {
      const params = new URLSearchParams(window.location.search)
      params.delete('q')
      const qs = params.toString()
      window.location.href = qs ? `/productos?${qs}` : '/productos'
    } else {
      inputRef.current?.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.mobileTrigger}
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir buscador"
        aria-expanded={mobileOpen}
        aria-controls={formId}
      >
        <Icon size={18} aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </Icon>
      </button>

      <form
        id={formId}
        role="search"
        className={`${styles.form} ${mobileOpen ? styles.open : ''}`}
        onSubmit={handleSubmit}
      >
        <Icon size={16} aria-hidden="true" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </Icon>

        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Buscar productos..."
          value={value}
          onChange={e => setValue(e.target.value)}
          aria-label="Buscar productos"
          enterKeyHint="search"
        />

        {value && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Limpiar búsqueda"
          >
            <Icon size={14} aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          </button>
        )}

        <button
          type="button"
          className={styles.closeButton}
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar buscador"
        >
          <Icon size={18} aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </button>
      </form>
    </>
  )
}
