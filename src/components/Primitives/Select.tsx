import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'
import Icon from './Icon'
import styles from './Select.module.css'

export type SelectSize = 'sm' | 'md' | 'lg'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface BaseSelectProps {
  size?: SelectSize
  options: SelectOption[]
  placeholder?: string
  invalid?: boolean
}

type SelectProps = BaseSelectProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', options, placeholder, invalid, className, id, ...rest },
  ref
) {
  const sizeClass = size === 'sm' ? styles.sizeSm : size === 'lg' ? styles.sizeLg : ''
  return (
    <div className={styles.selectWrap}>
      <select
        ref={ref}
        id={id}
        className={`${styles.select} ${sizeClass} ${className ?? ''}`.trim()}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className={styles.arrow} aria-hidden="true">
        <Icon size={16}>
          <polyline points="6 9 12 15 18 9" />
        </Icon>
      </span>
    </div>
  )
})

export default Select
