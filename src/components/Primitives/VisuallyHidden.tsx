import type { ReactNode } from 'react'

interface VisuallyHiddenProps {
  children: ReactNode
  as?: 'span' | 'div'
  className?: string
}

export default function VisuallyHidden({ children, as: Tag = 'span', className }: VisuallyHiddenProps) {
  return <Tag className={`visually-hidden ${className ?? ''}`.trim()}>{children}</Tag>
}
