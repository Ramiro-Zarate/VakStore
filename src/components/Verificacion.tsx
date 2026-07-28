import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from './Primitives'
import styles from './Verificacion.module.css'

export default function Verificacion() {
  const [state, setState] = useState<'loading' | 'waiting'>('loading')

  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        if (session) {
          window.location.href = '/'
        } else {
          setState('waiting')
        }
      })
      .catch(() => {
        if (!cancelled) setState('waiting')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>Verificando…</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.icon} aria-hidden="true">
        <Icon size={48}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </Icon>
      </div>
      <h1 className={styles.title}>Revisá tu email</h1>
      <p className={styles.description}>
        Te enviamos un enlace de verificación a tu correo electrónico.
      </p>
      <p className={styles.hint}>
        Hacé click en el enlace para activar tu cuenta.
      </p>
      <div className={styles.info}>
        <p className={styles.infoText}>¿No recibiste el email?</p>
        <a href="/login" className={styles.infoLink}>Volver al login</a>
      </div>
    </div>
  )
}
