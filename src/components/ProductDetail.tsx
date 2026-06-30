import { useState, useEffect, useRef } from 'react'
import type { ProductWithVariants } from '../lib/types'
import { useCartStore } from '../hooks/useCartStore'
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
  const groupRef = useRef<HTMLDivElement>(null)

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

  const handleAddToCart = async () => {
    if (!selectedVariantData) return
    setSubmitting(true)
    try {
      addToCart(
        {
          productVariantId: selectedVariantData.id,
          productId: product.id,
          productName: product.name,
          productImage: product.image_url,
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
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className={styles.image}
            loading="eager"
            decoding="async"
          />
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
    </div>
  )
}
