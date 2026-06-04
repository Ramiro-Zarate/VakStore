import { forwardRef, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'
import styles from './Input.module.css'

export type InputSize = 'sm' | 'md' | 'lg'

interface BaseInputProps {
  size?: InputSize
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  rightButton?: ReactNode
  invalid?: boolean
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'url' | 'search' | 'decimal'
}

type InputProps = BaseInputProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', leftIcon, rightIcon, rightButton, invalid, className, type = 'text', id, ...rest },
  ref
) {
  const sizeClass = size === 'sm' ? styles.sizeSm : size === 'lg' ? styles.sizeLg : ''
  const classes = [
    styles.input,
    sizeClass,
    leftIcon ? styles.hasLeftIcon : '',
    (rightIcon || rightButton) ? styles.hasRightIcon : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.inputWrap}>
      {leftIcon && (
        <span className={styles.iconLeft} aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        type={type}
        className={classes}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {rightIcon && !rightButton && (
        <span className={styles.iconRight} aria-hidden="true">
          {rightIcon}
        </span>
      )}
      {rightButton && <div className={styles.iconButtonRight}>{rightButton}</div>}
    </div>
  )
})

export function PasswordInput({ size = 'md', invalid, className, ...rest }: Omit<InputProps, 'type' | 'rightButton'>) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      type={visible ? 'text' : 'password'}
      size={size}
      invalid={invalid}
      className={className}
      autoComplete={rest.autoComplete ?? 'current-password'}
      rightButton={
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className={styles.iconButtonRight}
          style={{ position: 'static', width: 'auto', height: 'auto' }}
        >
          <Icon size={18} aria-hidden="true">
            {visible ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </Icon>
        </button>
      }
      {...rest}
    />
  )
}

export default Input
