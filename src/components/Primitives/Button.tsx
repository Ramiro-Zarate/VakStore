import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface BaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  iconOnly?: boolean
  children?: ReactNode
  className?: string
}

type ButtonAsButton = BaseProps & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps>
type ButtonAsAnchor = BaseProps & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps | 'href'>

export type ButtonProps = ButtonAsButton | ButtonAsAnchor

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    iconOnly = false,
    children,
    className,
    ...rest
  } = props

  const classes = [
    styles.button,
    styles[variant],
    styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`],
    fullWidth ? styles.fullWidth : '',
    iconOnly ? styles.iconOnly : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : leftIcon}
      {children}
      {rightIcon}
    </>
  )

  if ('href' in rest && rest.href !== undefined) {
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        aria-busy={loading || undefined}
        {...anchorProps}
      >
        {content}
      </a>
    )
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      aria-busy={loading || undefined}
      disabled={loading || buttonProps.disabled}
      type={buttonProps.type ?? 'button'}
      {...buttonProps}
    >
      {content}
    </button>
  )
})

export default Button
