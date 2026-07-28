export type ShippingZone = {
  id: string
  name: string
  description: string
  cpRanges: ReadonlyArray<readonly [number, number]>
  cost: number
  eta: string
}

export const SHIPPING_ZONES: ReadonlyArray<ShippingZone> = [
  {
    id: 'caba',
    name: 'Capital Federal',
    description: 'Ciudad Autónoma de Buenos Aires',
    cpRanges: [[1000, 1499]],
    cost: 3000,
    eta: '24-48h hábiles'
  },
  {
    id: 'gba',
    name: 'Gran Buenos Aires',
    description: 'Conurbano bonaerense',
    cpRanges: [[1600, 1899]],
    cost: 4000,
    eta: '48-72h hábiles'
  },
  {
    id: 'buenos_aires',
    name: 'Buenos Aires interior',
    description: 'Resto de la provincia de Buenos Aires',
    cpRanges: [[1900, 1999], [7000, 7999]],
    cost: 14000,
    eta: '48-72h hábiles'
  },
  {
    id: 'centro',
    name: 'Centro',
    description: 'Córdoba, Santa Fe, Entre Ríos, La Pampa',
    cpRanges: [[2000, 3399], [3700, 3999], [5000, 5399], [5800, 6199], [6300, 6599]],
    cost: 6500,
    eta: '48-96h hábiles'
  },
  {
    id: 'litoral',
    name: 'Litoral',
    description: 'Corrientes, Misiones, Chaco, Formosa',
    cpRanges: [[3400, 3699]],
    cost: 7000,
    eta: '72-120h hábiles'
  },
  {
    id: 'noa',
    name: 'NOA',
    description: 'Tucumán, Salta, Jujuy, Catamarca, Santiago del Estero',
    cpRanges: [[4000, 4999]],
    cost: 8000,
    eta: '72-120h hábiles'
  },
  {
    id: 'cuyo',
    name: 'Cuyo',
    description: 'Mendoza, San Juan, San Luis, La Rioja',
    cpRanges: [[5400, 5799]],
    cost: 8500,
    eta: '72-120h hábiles'
  },
  {
    id: 'patagonia',
    name: 'Patagonia',
    description: 'Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego',
    cpRanges: [[6200, 6299], [6600, 6999], [8000, 9999]],
    cost: 11000,
    eta: '96-168h hábiles'
  },
  {
    id: 'nacional',
    name: 'Envío estándar',
    description: 'Tarifa plana para destinos no clasificados',
    cpRanges: [],
    cost: 5000,
    eta: '48-96h hábiles'
  }
]

export const DEFAULT_ZONE: ShippingZone =
  SHIPPING_ZONES[SHIPPING_ZONES.length - 1]

export function getZoneForCP(cp: string): ShippingZone {
  const digits = cp.replace(/\D/g, '').slice(0, 4)
  if (digits.length < 4) return DEFAULT_ZONE
  const num = Number(digits)
  for (const zone of SHIPPING_ZONES) {
    for (const [from, to] of zone.cpRanges) {
      if (num >= from && num <= to) return zone
    }
  }
  return DEFAULT_ZONE
}

export function getZoneById(id: string): ShippingZone | null {
  return SHIPPING_ZONES.find(z => z.id === id) ?? null
}

export function getZoneCost(zoneId: string): number {
  const zone = getZoneById(zoneId)
  return zone ? zone.cost : DEFAULT_ZONE.cost
}

export function getShippingZonesForCP(cp: string): {
  detected: ShippingZone
  options: ShippingZone[]
} {
  const detected = getZoneForCP(cp)
  const others = SHIPPING_ZONES.filter(
    z => z.id !== detected.id && z.id !== 'nacional'
  )
  return {
    detected,
    options: [detected, DEFAULT_ZONE, ...others]
  }
}
