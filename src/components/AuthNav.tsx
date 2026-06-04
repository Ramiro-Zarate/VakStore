import { useAuth } from './useAuth'
import UserMenu from './UserMenu'
import styles from './AuthNav.module.css'

export default function AuthNav() {
  const { user, initialized } = useAuth()

  if (initialized && user) {
    return <UserMenu />
  }

  return (
    <div className={styles.guestNav}>
      <a href="/login" className={styles.loginLink}>Iniciar sesión</a>
      <a href="/registro" className={styles.registerLink}>Crear cuenta</a>
    </div>
  )
}
