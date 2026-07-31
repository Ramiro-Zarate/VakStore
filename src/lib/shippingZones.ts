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
    cost: 5500,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'gba',
    name: 'Gran Buenos Aires',
    description: 'Conurbano bonaerense y La Plata',
    cpRanges: [[1600, 1999]],
    cost: 7500,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'buenos_aires',
    name: 'Buenos Aires interior',
    description: 'Resto de la provincia de Buenos Aires',
    cpRanges: [[2700, 2999], [6000, 6199], [6400, 8299]],
    cost: 7500,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'centro',
    name: 'Centro y Litoral Sur',
    description: 'Córdoba, Santa Fe, Entre Ríos, La Pampa',
    cpRanges: [[2000, 2699], [3000, 3299], [5000, 5399], [5800, 5999], [6200, 6399]],
    cost: 8000,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'litoral',
    name: 'Litoral Norte',
    description: 'Corrientes, Misiones, Chaco, Formosa',
    cpRanges: [[3300, 3799]],
    cost: 8000,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'cuyo',
    name: 'Cuyo',
    description: 'Mendoza, San Juan, San Luis',
    cpRanges: [[5400, 5799]],
    cost: 8000,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'noa',
    name: 'NOA',
    description: 'Tucumán, Salta, Jujuy, Catamarca, Santiago del Estero',
    cpRanges: [[4000, 4999]],
    cost: 8800,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'patagonia',
    name: 'Patagonia',
    description: 'Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego',
    cpRanges: [[8300, 9999]],
    cost: 8800,
    eta: '2 a 5 días hábiles'
  },
  {
    id: 'nacional',
    name: 'Envío estándar',
    description: 'Tarifa plana para destinos no clasificados',
    cpRanges: [],
    cost: 8000,
    eta: '2 a 5 días hábiles'
  }
];

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
