export function getCoverImage(product: { images: string[] }): string | null {
  return product.images?.[0] ?? null
}

export function hasMultipleImages(product: { images: string[] }): boolean {
  return (product.images?.length ?? 0) > 1
}
