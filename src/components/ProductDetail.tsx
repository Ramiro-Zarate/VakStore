import { useState, useEffect, useRef, useCallback } from 'react'
import type { ProductWithVariants } from '../lib/types'
import { getCoverImage, hasMultipleImages } from '../lib/productImages'
import { useCartStore } from '../hooks/useCartStore'
import { useEscape } from '../hooks/useEscape'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Icon } from './Primitives'
import styles from './ProductDetail.module.css'

type Props = {
  product: ProductWithVariants
}

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const

export default function ProductDetail({ product }: Props) {
  const { addToCart } = useCartStore()
  const basePrice = product.product_variants[0]?.price || 0
  const productVersion = product.product_variants[0]?.version || null
  const league = product.product_variants[0]?.league ?? null

  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const groupRef = useRef<HTMLDivElement>(null)

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const lightboxRef = useFocusTrap<HTMLDivElement>(lightboxOpen)
  const lastFocusRef = useRef<HTMLElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const pinchRef = useRef<{ initialDistance: number; initialScale: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null)

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 3000)
    return () => clearTimeout(t)
  }, [feedback])

  const getVariant = () => {
    if (!selectedSize) return null
    return product.product_variants.find(v => v.size === selectedSize)
  }

  const selectedVariantData = getVariant()

  const getStockForSize = (size: string) => {
    const variant = product.product_variants.find(v => v.size === size)
    return variant?.stock_quantity || 0
  }

  const handleSizeSelect = (size: string) => {
    setSelectedSize(size)
  }

  const handleKeyDownOnGroup = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)') ?? [])
    if (buttons.length === 0) return
    const currentIndex = buttons.findIndex(b => b === document.activeElement || b.getAttribute('aria-checked') === 'true')
    const startIndex = currentIndex === -1 ? 0 : currentIndex
    const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    const next = (startIndex + direction + buttons.length) % buttons.length
    buttons[next]?.focus()
    const nextSize = buttons[next]?.dataset.size
    if (nextSize) handleSizeSelect(nextSize)
  }

  const handleThumbKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const total = product.images.length
    if (total === 0) return
    const direction = e.key === 'ArrowRight' ? 1 : -1
    const next = (index + direction + total) % total
    setActiveImage(next)
    const container = e.currentTarget.parentElement
    const nextThumb = container?.children[next] as HTMLButtonElement | undefined
    nextThumb?.focus()
  }

  const cover = getCoverImage(product)
  const showGallery = hasMultipleImages(product)

  const totalImages = product.images.length
  const clampScale = (v: number) => Math.max(1, Math.min(4, v))
  const clampPan = useCallback((x: number, y: number, s: number) => {
    if (s <= 1) return { x: 0, y: 0 }
    const maxX = Math.max(0, ((s - 1) * window.innerWidth) / 2)
    const maxY = Math.max(0, ((s - 1) * window.innerHeight) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y))
    }
  }, [])

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    setLightboxOpen(true)
  }

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false)
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    pinchRef.current = null
    panRef.current = null
    touchStartRef.current = null
  }, [])

  const navigateLightbox = useCallback((delta: number) => {
    if (totalImages === 0) return
    setLightboxIndex(i => {
      const next = (i + delta + totalImages) % totalImages
      setActiveImage(next)
      return next
    })
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [totalImages])

  const zoomBy = useCallback((delta: number) => {
    setScale(s => {
      const next = clampScale(s + delta)
      if (next === 1) setTranslate({ x: 0, y: 0 })
      return next
    })
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  useEscape(lightboxOpen, closeLightbox)

  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateLightbox(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateLightbox(-1)
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomBy(0.5)
      } else if (e.key === '-') {
        e.preventDefault()
        zoomBy(-0.5)
      } else if (e.key === '0') {
        e.preventDefault()
        resetZoom()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightboxOpen, navigateLightbox, zoomBy, resetZoom])

  useEffect(() => {
    if (!lightboxOpen) return
    const original = document.body.style.overflow
    lastFocusRef.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
      lastFocusRef.current?.focus?.()
    }
  }, [lightboxOpen])

  const scaleRef = useRef(scale)
  const translateRef = useRef(translate)
  scaleRef.current = scale
  translateRef.current = translate

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.25 : 0.25
    setScale(s => {
      const next = clampScale(s + delta)
      if (next === 1) setTranslate({ x: 0, y: 0 })
      return next
    })
  }

  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchStartRef.current = { x: t.clientX, y: t.clientY, tx: 0, ty: 0 }
    } else if (e.touches.length === 2) {
      const d = getTouchDistance(e.touches[0], e.touches[1])
      pinchRef.current = { initialDistance: d, initialScale: scaleRef.current }
      touchStartRef.current = null
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const d = getTouchDistance(e.touches[0], e.touches[1])
      const ratio = d / pinchRef.current.initialDistance
      const next = clampScale(pinchRef.current.initialScale * ratio)
      setScale(next)
      if (next === 1) setTranslate({ x: 0, y: 0 })
    } else if (e.touches.length === 1 && touchStartRef.current && scaleRef.current > 1) {
      e.preventDefault()
      const t = e.touches[0]
      const dx = t.clientX - touchStartRef.current.x
      const dy = t.clientY - touchStartRef.current.y
      const next = clampPan(dx, dy, scaleRef.current)
      setTranslate(next)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      if (touchStartRef.current && scaleRef.current === 1) {
        const t = e.changedTouches[0]
        const dx = t.clientX - touchStartRef.current.x
        const dy = t.clientY - touchStartRef.current.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          navigateLightbox(dx < 0 ? 1 : -1)
        }
      }
      touchStartRef.current = null
      pinchRef.current = null
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scaleRef.current <= 1) return
    e.preventDefault()
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tx: translateRef.current.x,
      ty: translateRef.current.y
    }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      setTranslate(clampPan(panRef.current.tx + dx, panRef.current.ty + dy, scaleRef.current))
    }
    const onUp = () => {
      panRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [clampPan])

  const handleAddToCart = async () => {
    if (!selectedVariantData) return
    setSubmitting(true)
    try {
      addToCart(
        {
          productVariantId: selectedVariantData.id,
          productId: product.id,
          productName: product.name,
          productImage: getCoverImage(product),
          version: selectedVariantData.version,
          size: selectedVariantData.size,
          price: selectedVariantData.price,
          stock: selectedVariantData.stock_quantity
        },
        quantity
      )
      setFeedback(`"${product.name}" agregado al carrito`)
    } finally {
      setSubmitting(false)
    }
  }

  const maxStock = selectedVariantData?.stock_quantity ?? 0
  const isLowStock = maxStock > 0 && maxStock <= 3
  const isOutOfStock = maxStock === 0

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb} aria-label="Navegación">
        <a href="/">Inicio</a>
        <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
        <a href="/productos">Productos</a>
        {product.category && (
          <>
            <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
            <a href={`/productos?category=${product.category}`}>{product.category}</a>
          </>
        )}
        <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
        <span aria-current="page" style={{ color: 'var(--color-text-primary)' }}>{product.name}</span>
      </nav>

      <div className={styles.imageSection}>
        {cover ? (
          <>
            <button
              type="button"
              className={styles.imageMainWrapper}
              role="tabpanel"
              id={`product-image-panel`}
              aria-label={`Imagen ${activeImage + 1} de ${product.images.length}. Click para ver en pantalla completa`}
              onClick={() => openLightbox(activeImage)}
            >
              <img
                key={activeImage}
                src={product.images[activeImage]}
                alt={product.name}
                className={styles.image}
                loading="eager"
                decoding="async"
              />
              {showGallery && (
                <span className={styles.imageCounter} aria-hidden="true">
                  {activeImage + 1} / {product.images.length}
                </span>
              )}
            </button>
            {showGallery && (
              <div
                className={styles.imageThumbs}
                role="tablist"
                aria-label="Galería de imágenes"
              >
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === activeImage}
                    aria-controls="product-image-panel"
                    className={`${styles.imageThumb} ${i === activeImage ? styles.imageThumbActive : ''}`}
                    onClick={() => setActiveImage(i)}
                    onKeyDown={e => handleThumbKeyDown(e, i)}
                    aria-label={`Imagen ${i + 1} de ${product.images.length}`}
                  >
                    <img
                      src={img}
                      alt=""
                      className={styles.imageThumbImg}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true">Sin imagen</div>
        )}
      </div>

      <div className={styles.infoSection}>
        {league && <p className={styles.eyebrow}>{league}</p>}
        <h1 className={styles.name}>{product.name}</h1>

        {product.description && (
          <p className={styles.description}>{product.description}</p>
        )}

        {productVersion && (
          <p className={styles.versionInfo}>
            Versión
            <span className={styles.versionBadge}>{productVersion}</span>
          </p>
        )}

        <div className={styles.priceRow}>
          <span className={styles.price}>
            {basePrice > 0 ? `$${basePrice.toLocaleString('es-AR')}` : 'Consultar'}
          </span>
          {basePrice > 0 && !isOutOfStock && (
            <span className={styles.transferHint}>15% off pagando por transferencia</span>
          )}
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            <span>Talle <span className={styles.legendRequired} aria-hidden="true">*</span></span>
          </legend>
          <div
            ref={groupRef}
            className={styles.sizeGroup}
            role="radiogroup"
            aria-label="Seleccioná un talle"
            aria-required="true"
            onKeyDown={handleKeyDownOnGroup}
          >
            {SIZES.map(size => {
              const stock = getStockForSize(size)
              const isAvailable = stock > 0
              const isSelected = selectedSize === size
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  data-size={size}
                  aria-checked={isSelected}
                  aria-label={
                    isAvailable
                      ? `Talle ${size}, ${stock === 1 ? '1 disponible' : `${stock} disponibles`}`
                      : `Talle ${size}, agotado`
                  }
                  className={styles.sizeButton}
                  onClick={() => handleSizeSelect(size)}
                  disabled={!isAvailable}
                >
                  {size}
                  {isAvailable && stock <= 3 && (
                    <span className={styles.sizeHint}>
                      {stock === 1 ? '¡Última!' : `Quedan ${stock}`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={!selectedVariantData}>
          <legend className={styles.legend}>
            <span>Cantidad</span>
          </legend>
          <div className={styles.quantityRow}>
            <div className={styles.quantityControl}>
              <button
                type="button"
                className={styles.quantityButton}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Disminuir cantidad"
              >
                <Icon size={16} aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </Icon>
              </button>
              <span
                className={styles.quantityDisplay}
                aria-live="polite"
                aria-label={`Cantidad: ${quantity}`}
              >
                {quantity}
              </span>
              <button
                type="button"
                className={styles.quantityButton}
                onClick={() => setQuantity(q => Math.min(q + 1, maxStock || 1))}
                disabled={!selectedVariantData || quantity >= maxStock}
                aria-label="Aumentar cantidad"
              >
                <Icon size={16} aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </Icon>
              </button>
            </div>
            <span
              className={`${styles.stockInfo} ${isOutOfStock ? styles.stockInfoOut : isLowStock ? styles.stockInfoLow : ''}`}
              aria-live="polite"
            >
              <span className={styles.stockDot} aria-hidden="true" />
              {!selectedSize
                ? 'Seleccioná un talle'
                : isOutOfStock
                ? 'Sin stock'
                : isLowStock
                ? (maxStock === 1 ? '¡Última unidad!' : `¡Últimas ${maxStock} unidades!`)
                : `${maxStock} disponibles`}
            </span>
          </div>
        </fieldset>

        <button
          type="button"
          className={styles.cta}
          onClick={handleAddToCart}
          disabled={!selectedVariantData || isOutOfStock}
          aria-busy={submitting || undefined}
        >
          {!selectedSize
            ? 'Seleccioná un talle'
            : isOutOfStock
            ? 'Sin stock'
            : submitting
            ? 'Agregando...'
            : 'Agregar al carrito'}
          {(!isOutOfStock && selectedVariantData) && (
            <Icon size={18} aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </Icon>
          )}
        </button>
      </div>

      {feedback && (
        <div className={styles.feedback} role="status" aria-live="polite">
          <span className={styles.feedbackIcon} aria-hidden="true">
            <Icon size={16}>
              <polyline points="20 6 9 17 4 12" />
            </Icon>
          </span>
          {feedback}
        </div>
      )}

      {lightboxOpen && cover && (
        <div
          ref={lightboxRef}
          className={styles.lightboxBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen ${lightboxIndex + 1} de ${totalImages} de ${product.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox()
          }}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={closeLightbox}
            aria-label="Cerrar"
          >
            <Icon size={24} aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          </button>

          {totalImages > 1 && (
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
              onClick={() => navigateLightbox(-1)}
              aria-label="Imagen anterior"
            >
              <Icon size={28} aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </Icon>
            </button>
          )}

          <div
            className={styles.lightboxStage}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              key={lightboxIndex}
              src={product.images[lightboxIndex]}
              alt={product.name}
              className={styles.lightboxImage}
              style={{
                transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
                cursor: scale > 1 ? (panRef.current ? 'grabbing' : 'grab') : 'default'
              }}
              onMouseDown={handleMouseDown}
              draggable={false}
            />
          </div>

          {totalImages > 1 && (
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
              onClick={() => navigateLightbox(1)}
              aria-label="Imagen siguiente"
            >
              <Icon size={28} aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </Icon>
            </button>
          )}

          <div className={styles.lightboxControls}>
            {totalImages > 1 && (
              <span className={styles.lightboxCounter} aria-hidden="true">
                {lightboxIndex + 1} / {totalImages}
              </span>
            )}
            <div className={styles.lightboxZoomGroup} role="group" aria-label="Zoom">
              <button
                type="button"
                className={styles.lightboxZoomBtn}
                onClick={() => zoomBy(-0.5)}
                disabled={scale <= 1}
                aria-label="Alejar"
              >
                <Icon size={18} aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </Icon>
              </button>
              <span className={styles.lightboxZoomValue} aria-live="polite">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                className={styles.lightboxZoomBtn}
                onClick={() => zoomBy(0.5)}
                disabled={scale >= 4}
                aria-label="Acercar"
              >
                <Icon size={18} aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </Icon>
              </button>
              {scale > 1 && (
                <button
                  type="button"
                  className={styles.lightboxZoomBtn}
                  onClick={resetZoom}
                  aria-label="Restablecer zoom"
                >
                  <Icon size={16} aria-hidden="true">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </Icon>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
