import type { ReactNode, SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> {
  size?: number
  title?: string
  children: ReactNode
}

export default function Icon({ size = 20, title, children, ...rest }: IconProps) {
  const labelled = Boolean(title)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      {...rest}
    >
      {labelled && <title>{title}</title>}
      {children}
    </svg>
  )
}
