import { useEffect, useRef, useState } from 'react'
import styles from './MobileMenu.module.css'
import { useEscape } from '../hooks/useEscape'

interface MenuLink {
  href: string
  label: string
}

interface MenuSection {
  title: string
  links: MenuLink[]
}

const SECTIONS: MenuSection[] = [
  {
    title: 'Tienda',
    links: [
      { href: '/', label: 'Inicio' },
      { href: '/productos', label: 'Productos' },
      { href: '/productos?sale=true', label: 'Ofertas' },
      { href: '/cuenta#contacto', label: 'Contacto' }
    ]
  },
  {
    title: 'Cuenta',
    links: [
      { href: '/cuenta', label: 'Mi cuenta' },
      { href: '/pedido', label: 'Seguir mi pedido' },
      { href: '/login', label: 'Iniciar sesión' },
      { href: '/registro', label: 'Crear cuenta' }
    ]
  }
]

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEscape(isOpen, () => setIsOpen(false))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen && !dialog.open) {
      dialog.showModal()
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => setIsOpen(false)
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        setIsOpen(false)
      }
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleClick)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleClick)
    }
  }, [])

  const handleLinkClick = () => {
    setIsOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Abrir menú"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        onClick={() => setIsOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        id="mobile-menu"
        className={styles.dialog}
        aria-label="Menú principal"
      >
        <div className={styles.header}>
          <a href="/" className={styles.brand} onClick={handleLinkClick}>
            VakStore
          </a>
          <button
            type="button"
            className={styles.close}
            aria-label="Cerrar menú"
            onClick={() => setIsOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {SECTIONS.map((section, idx) => (
            <div key={section.title}>
              <nav className={styles.section} aria-label={section.title}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                <ul className={styles.linkList}>
                  {section.links.map(link => (
                    <li key={link.href}>
                      <a href={link.href} className={styles.link} onClick={handleLinkClick}>
                        <span>{link.label}</span>
                        <svg className={styles.linkArrow} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              {idx < SECTIONS.length - 1 && <div className={styles.divider} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </dialog>
    </>
  )
}
