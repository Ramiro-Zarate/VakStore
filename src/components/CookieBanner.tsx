import { useState, useEffect } from 'react'
import styles from './CookieBanner.module.css'

const STORAGE_KEY = 'cookie-consent'
const VERSION_KEY = 'cookie-consent-version'
const DATE_KEY = 'cookie-consent-date'
const POLICY_VERSION = '1.1'

export default function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const version = localStorage.getItem(VERSION_KEY)
      if (stored && version === POLICY_VERSION) {
        setShow(false)
      } else {
        setShow(true)
      }
    } catch (err) {
      console.error('[CookieBanner] failed to read storage:', err)
      setShow(true)
    }
  }, [])

  const persist = (value: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
      localStorage.setItem(VERSION_KEY, POLICY_VERSION)
      localStorage.setItem(DATE_KEY, new Date().toISOString())
    } catch (err) {
      console.error('[CookieBanner] failed to persist consent:', err)
    }
    setShow(false)
    if (value === 'rejected') {
      window.location.reload()
    }
  }

  if (!show) return null

  return (
    <div className={styles.banner} role="region" aria-label="Aviso de cookies">
      <div className={styles.inner}>
        <div className={styles.content}>
          <p className={styles.text}>
            Usamos cookies técnicas para que el sitio funcione (sesión, carrito)
            y Google Analytics para entender cómo usás el sitio y mejorarlo.
            Podés aceptar o rechazar las cookies de análisis.{' '}
            <a href="/privacidad" className={styles.link}>
              Política de privacidad
            </a>
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => persist('rejected')}
          >
            Rechazar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => persist('accepted')}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}
