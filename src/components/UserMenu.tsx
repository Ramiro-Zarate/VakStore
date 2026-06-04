import { useState, useRef, useEffect } from 'react'
import { useAuth } from './useAuth'
import { useEscape } from '../hooks/useEscape'
import styles from './UserMenu.module.css'

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario'
  const firstLetter = userName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  useEscape(isOpen, () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  })

  const handleKeyDownOnMenu = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
      if (!items || items.length === 0) return
      const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length
      items[next]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const items = containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
      items?.[items.length - 1]?.focus()
    }
  }

  const handleLogout = async () => {
    setIsOpen(false)
    await signOut()
    window.location.href = '/'
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="user-menu"
      >
        <span className={styles.avatar} aria-hidden="true">{firstLetter}</span>
        <span className={styles.name}>{userName}</span>
        <svg
          className={`${styles.arrow} ${isOpen ? styles.arrowOpen : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          id="user-menu"
          role="menu"
          aria-label="Menú de usuario"
          className={styles.dropdown}
          onKeyDown={handleKeyDownOnMenu}
        >
          <a href="/cuenta" role="menuitem" className={styles.item}>
            <span className={styles.itemIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            Mi cuenta
          </a>
          <a href="/pedido" role="menuitem" className={styles.item}>
            <span className={styles.itemIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16h6" />
                <path d="M19 13v6" />
                <path d="M21 10V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7" />
              </svg>
            </span>
            Mis pedidos
          </a>
          <div className={styles.divider} role="separator" aria-hidden="true" />
          <button type="button" role="menuitem" className={styles.item} onClick={handleLogout}>
            <span className={styles.itemIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
