import type { CSSProperties, ReactNode } from 'react'
import VisuallyHidden from './VisuallyHidden'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  circle?: boolean
  text?: boolean
  count?: number
  gap?: string
  className?: string
  style?: CSSProperties
  label?: string
}

export default function Skeleton({
  width,
  height,
  circle = false,
  text = false,
  count = 1,
  gap = 'var(--space-2)',
  className,
  style,
  label = 'Cargando'
}: SkeletonProps) {
  const baseStyle: CSSProperties = {
    width: width ?? (text ? '100%' : undefined),
    height: height ?? (text ? undefined : undefined),
    ...style
  }

  if (count > 1) {
    return (
      <div role="status" aria-live="polite" className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`${styles.skeleton} ${text ? styles.text : ''} ${circle ? styles.circle : ''}`}
            style={{ ...baseStyle, marginTop: i === 0 ? 0 : gap }}
          />
        ))}
        <VisuallyHidden>{label}</VisuallyHidden>
      </div>
    )
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={`${styles.skeleton} ${text ? styles.text : ''} ${circle ? styles.circle : ''} ${className ?? ''}`.trim()}
      style={baseStyle}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  )
}
