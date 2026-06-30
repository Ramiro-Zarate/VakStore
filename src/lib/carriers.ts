export type CarrierId = 'andreani' | 'correo_argentino'

export type Carrier = {
  id: CarrierId
  name: string
  trackingUrlPattern: string
}

export const CARRIERS: Record<CarrierId, Carrier> = {
  andreani: {
    id: 'andreani',
    name: 'Andreani',
    trackingUrlPattern: 'https://www.andreani.com/envio/{nro}'
  },
  correo_argentino: {
    id: 'correo_argentino',
    name: 'Correo Argentino',
    trackingUrlPattern: 'https://www.correoargentino.com.ar/consulta-de-envio?nro={nro}'
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
  const carrier = getCarrier(carrierId)
  if (!carrier) return null
  return carrier.trackingUrlPattern.replace('{nro}', encodeURIComponent(trackingNumber))
}
