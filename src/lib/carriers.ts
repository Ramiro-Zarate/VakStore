export type CarrierId = 'correo_argentino' | 'motomensajeria'

export type Carrier = {
  id: CarrierId
  name: string
  trackingUrlPattern: string
}

export const CARRIERS: Record<CarrierId, Carrier> = {
  correo_argentino: {
    id: 'correo_argentino',
    name: 'Correo Argentino',
    trackingUrlPattern: 'https://www.correoargentino.com.ar/consulta-de-envio?nro={nro}'
  },
  motomensajeria: {
    id: 'motomensajeria',
    name: 'Motomensajería',
    trackingUrlPattern: ''
  }
}

export const CARRIER_LIST: ReadonlyArray<Carrier> = Object.values(CARRIERS)

export function getCarrier(carrierId: string): Carrier | null {
  return CARRIERS[carrierId as CarrierId] ?? null
}

export function getTrackingUrl(
  carrierId: string,
  trackingNumber: string
): string | null {
  if (carrierId === 'motomensajeria') return null
  const carrier = getCarrier(carrierId)
  if (!carrier || !carrier.trackingUrlPattern) return null
  return carrier.trackingUrlPattern.replace('{nro}', encodeURIComponent(trackingNumber))
}
