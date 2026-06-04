import type { ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'solid-accent' | 'solid-neutral'
export type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export default function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  children,
  className
}: BadgeProps) {
  const sizeClass = size === 'sm' ? styles.sizeSm : size === 'lg' ? styles.sizeLg : ''
  return (
    <span className={`${styles.badge} ${styles[variant]} ${sizeClass} ${className ?? ''}`.trim()}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {icon}
      {children}
    </span>
  )
}
