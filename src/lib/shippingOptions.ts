import type { CarrierId } from './carriers'
import { getZoneById, getZoneForCP, type ShippingZone } from './shippingZones'

export type ShippingOption = {
  id: string
  zoneId: string
  carrier: CarrierId
  name: string
  description: string
  price: number | null
  eta: string
  displayOrder: number
}

const MOTO_ENABLED_ZONES: ReadonlySet<string> = new Set(['caba', 'gba'])
const MOTO_NAME = 'Motomensajería'
const MOTO_DESCRIPTION = 'Coordinamos el costo y horario por WhatsApp'
const MOTO_ETA = 'Mismo día'
const CORREO_NAME = 'Correo Argentino'

const MOTO_SUFFIX = '-moto'
const CORREO_SUFFIX = '-correo'

function buildCorreoOption(zone: ShippingZone, displayOrder: number): ShippingOption {
  return {
    id: `${zone.id}${CORREO_SUFFIX}`,
    zoneId: zone.id,
    carrier: 'correo_argentino',
    name: CORREO_NAME,
    description: zone.description,
    price: zone.cost,
    eta: zone.eta,
    displayOrder
  }
}

function buildMotoOption(zoneId: string, displayOrder: number): ShippingOption {
  return {
    id: `${zoneId}${MOTO_SUFFIX}`,
    zoneId,
    carrier: 'motomensajeria',
    name: MOTO_NAME,
    description: MOTO_DESCRIPTION,
    price: null,
    eta: MOTO_ETA,
    displayOrder
  }
}

export function getOptionsForCP(cp: string): ShippingOption[] {
  const zone = getZoneForCP(cp)
  const options: ShippingOption[] = [buildCorreoOption(zone, 1)]
  if (MOTO_ENABLED_ZONES.has(zone.id)) {
    options.push(buildMotoOption(zone.id, 2))
  }
  return options
}

export function getOptionById(id: string): ShippingOption | null {
  if (id.endsWith(MOTO_SUFFIX)) {
    const zoneId = id.slice(0, -MOTO_SUFFIX.length)
    if (!MOTO_ENABLED_ZONES.has(zoneId)) return null
    return buildMotoOption(zoneId, 2)
  }
  if (id.endsWith(CORREO_SUFFIX)) {
    const zoneId = id.slice(0, -CORREO_SUFFIX.length)
    const zone = getZoneById(zoneId)
    if (!zone) return null
    return buildCorreoOption(zone, 1)
  }
  return null
}

export function isMotoOption(optionId: string): boolean {
  return optionId.endsWith(MOTO_SUFFIX)
}
