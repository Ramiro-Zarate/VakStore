import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type'
].join(',')

export function useFocusTrap<T extends HTMLElement>(
  active: boolean
): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null
      )

    const focusFirst = () => {
      const list = focusables()
      if (list.length > 0) {
        list[0].focus()
      } else {
        container.setAttribute('tabindex', '-1')
        container.focus()
      }
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const t = window.setTimeout(focusFirst, 0)
    document.addEventListener('keydown', handleKey)

    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active])

  return ref
}
