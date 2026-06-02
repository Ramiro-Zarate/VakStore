import { useState, useEffect } from 'react'
import type { ProductWithVariants } from '../lib/types'
import { useCartStore } from '../hooks/useCartStore'
import styles from './ProductDetail.module.css'

type Props = {
  product: ProductWithVariants
}

export default function ProductDetail({ product }: Props) {
  const { addToCart } = useCartStore()
  const sizes = ['S', 'M', 'L', 'XL', 'XXL']

  const basePrice = product.product_variants[0]?.price || 0
  const productVersion = product.product_variants[0]?.version || null

  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    setSelectedVersion(productVersion)
  }, [productVersion])

  const getVariant = () => {
    if (!selectedSize) return null
    return product.product_variants.find(v => v.size === selectedSize)
  }

  const selectedVariantData = getVariant()

  const getStockForSize = (size: string) => {
    const variant = product.product_variants.find(v => v.size === size)
    return variant?.stock_quantity || 0
  }

  const handleSizeChange = (size: string) => {
    setSelectedSize(size)
  }

  const handleAddToCart = () => {
    if (!selectedVariantData) return

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
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className={styles.container}>
      {feedback && <div className={styles.feedback}>{feedback}</div>}

      <div className={styles.imageSection}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className={styles.image} loading="eager" decoding="async" />
        ) : (
          <div className={styles.imagePlaceholder}>Sin imagen</div>
        )}
      </div>

      <div className={styles.infoSection}>
       
        <h1 className={styles.name}>{product.name}</h1>

        {selectedVersion && (
          <p className={styles.versionInfo}>Versión: {selectedVersion}</p>
        )}
      
        <div className={styles.priceSection}>
          <span className={styles.price}>
            ${basePrice > 0 ? basePrice.toLocaleString('es-AR') : 'Consultar'}
          </span>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Talle</label>
          <div className={styles.buttons}>
            {sizes.map(size => {
              const stock = getStockForSize(size)
              const isAvailable = stock > 0
              const isSelected = selectedSize === size

              return (
                <button
                  key={size}
                  className={`${styles.button} ${isSelected ? styles.active : ''} ${!isAvailable ? styles.disabled : ''}`}
                  onClick={() => isAvailable && handleSizeChange(size)}
                  disabled={!isAvailable}
                >
                  {size}
                  {stock > 0 && stock <= 3 && (
                    <span className={styles.stockHint}>({stock})</span>
                  )}
                </button>
              )
            })}
          </div>
          {selectedSize && getStockForSize(selectedSize) <= 0 && (
            <p className={styles.outOfStock}>Este talle está agotado</p>
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Cantidad</label>
          <div className={styles.quantityControl}>
            <button
              className={styles.quantityButton}
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
            >
              -
            </button>
            <span className={styles.quantity}>{quantity}</span>
            <button
              className={styles.quantityButton}
              onClick={() => setQuantity(q => Math.min(q + 1, selectedVariantData?.stock_quantity || 1))}
              disabled={!selectedVariantData || quantity >= selectedVariantData.stock_quantity}
            >
              +
            </button>
          </div>
        </div>

        <button
          className={styles.addToCart}
          onClick={handleAddToCart}
          disabled={!selectedVariantData || selectedVariantData.stock_quantity < quantity}
        >
          {!selectedSize
            ? 'Seleccioná talle'
            : selectedVariantData?.stock_quantity === 0
            ? 'Sin stock'
            : 'Agregar al carrito'}
        </button>

        {selectedVariantData && selectedVariantData.stock_quantity > 0 && (
          <p className={styles.stock}>
            Stock disponible: {selectedVariantData.stock_quantity} unidades
          </p>
        )}
      </div>
    </div>
  )
}