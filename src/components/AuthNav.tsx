import { useAuth } from './useAuth'
import UserMenu from './UserMenu'
import styles from './AuthNav.module.css'

export default function AuthNav() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div class={styles.loading} />
  }

  if (user) {
    return <UserMenu client:load />
  }

  return (
    <div class={styles.guestNav}>
      <a href="/login" class={styles.loginLink}>Iniciar sesión</a>
      <a href="/registro" class={styles.registerLink}>Registrarse</a>
    </div>
  )
}