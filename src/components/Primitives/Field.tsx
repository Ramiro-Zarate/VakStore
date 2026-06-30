import { useId, isValidElement, Children, cloneElement } from 'react'
import type { ReactNode, ReactElement } from 'react'
import Icon from './Icon'
import styles from './Field.module.css'

interface FieldRenderProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

interface FieldProps {
  id?: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode | null
  required?: boolean
  optional?: boolean
  children: ReactNode | ((props: FieldRenderProps) => ReactElement)
  className?: string
}

export default function Field({
  id,
  label,
  hint,
  error,
  required = false,
  optional = false,
  children,
  className
}: FieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = error ? `${fieldId}-error` : undefined
  const hintId = hint && !error ? `${fieldId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  const invalid = Boolean(error)

  const renderProps: FieldRenderProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': invalid
  }

  let body: ReactNode
  if (typeof children === 'function') {
    body = children(renderProps)
  } else {
    const childArray = Children.toArray(children)
    if (childArray.length === 0) {
      body = null
    } else if (childArray.length === 1) {
      const child = childArray[0] as ReactElement
      body = isValidElement(child)
        ? cloneElement(child, renderProps)
        : child
    } else {
      const first = childArray[0] as ReactElement
      const wired = isValidElement(first)
        ? cloneElement(first, renderProps)
        : first
      body = [wired, ...childArray.slice(1)]
    }
  }

  return (
    <div className={`${styles.field} ${className ?? ''}`.trim()}>
      <div className={styles.labelRow}>
        <label htmlFor={fieldId} className={styles.label}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="visually-hidden"> (requerido)</span>}
        </label>
        {optional && <span className={styles.hint}>Opcional</span>}
      </div>
      {body}
      {hintId && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className={styles.error} role="alert">
          <Icon size={14} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </Icon>
          {error}
        </p>
      )}
    </div>
  )
}
