import { useState } from 'react'
import type { Product, ProductVariant } from '../lib/types'
import styles from './ProductDetail.module.css'

type ProductWithVariants = Product & {
  product_variants: ProductVariant[]
}

type Props = {
  product: ProductWithVariants
}

export default function ProductDetail({ product }: Props) {
  const versions = ['jugador', 'fan', 'retro'] as const
  const sizes = ['S', 'M', 'L', 'XL', 'XXL']

  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const filteredVariants = product.product_variants.filter(
    v => !selectedVersion || v.version === selectedVersion
  )

  const uniqueSizes = [...new Set(filteredVariants.map(v => v.size))]

  const getVariant = () => {
    if (!selectedVersion || !selectedSize) return null
    return filteredVariants.find(v => v.version === selectedVersion && v.size === selectedSize)
  }

  const selectedVariantData = getVariant()

  const getStockForSize = (size: string) => {
    const variant = filteredVariants.find(v => v.size === size)
    return variant?.stock_quantity || 0
  }

  const handleVersionChange = (version: string) => {
    setSelectedVersion(version)
    setSelectedSize(null)
  }

  const handleSizeChange = (size: string) => {
    setSelectedSize(size)
  }

  const handleAddToCart = () => {
    if (!selectedVariantData) return
    alert(`Agregado al carrito: ${product.name} (${selectedVersion} - ${selectedSize}) x${quantity}`)
  }

  return (
    <div className={styles.container}>
      <div className={styles.imageSection}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder}>Sin imagen</div>
        )}
      </div>

      <div className={styles.infoSection}>
        {/* <span className={styles.category}>{product.category}</span> */}
        <h1 className={styles.name}>{product.name}</h1>
        {/* {product.description && (
          <p className={styles.description}>{product.description}</p> 
        )} */}

        <div className={styles.priceSection}>
          <span className={styles.price}>
            ${selectedVariantData?.price?.toLocaleString('es-AR') || '—'}
          </span>
        </div>

        {/* <div className={styles.section}>
          <label className={styles.label}>Versión</label>
          <div className={styles.buttons}>
            {versions.map(version => (
              <button
                key={version}
                className={`${styles.button} ${selectedVersion === version ? styles.active : ''}`}
                onClick={() => handleVersionChange(version)}
              >
                {version}
              </button>
            ))}
          </div>
        </div> */}

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
              onClick={() => setQuantity(q => q + 1)}
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
