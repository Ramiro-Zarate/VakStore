export type Province = {
  id: string
  name: string
  cpRanges: ReadonlyArray<readonly [number, number]>
}

export const PROVINCES: ReadonlyArray<Province> = [
  { id: 'caba', name: 'Ciudad Autónoma de Buenos Aires', cpRanges: [[1000, 1499]] },
  { id: 'buenos_aires', name: 'Buenos Aires', cpRanges: [[1600, 1999], [7000, 7999]] },
  { id: 'catamarca', name: 'Catamarca', cpRanges: [[4700, 4799]] },
  { id: 'chaco', name: 'Chaco', cpRanges: [[3500, 3699], [3700, 3799]] },
  { id: 'chubut', name: 'Chubut', cpRanges: [[9000, 9299]] },
  { id: 'cordoba', name: 'Córdoba', cpRanges: [[5000, 5299], [5800, 5999]] },
  { id: 'corrientes', name: 'Corrientes', cpRanges: [[3400, 3499]] },
  { id: 'entre_rios', name: 'Entre Ríos', cpRanges: [[3100, 3299]] },
  { id: 'formosa', name: 'Formosa', cpRanges: [[3600, 3699]] },
  { id: 'jujuy', name: 'Jujuy', cpRanges: [[4600, 4699]] },
  { id: 'la_pampa', name: 'La Pampa', cpRanges: [[6200, 6499]] },
  { id: 'la_rioja', name: 'La Rioja', cpRanges: [[5300, 5399]] },
  { id: 'mendoza', name: 'Mendoza', cpRanges: [[5500, 5699]] },
  { id: 'misiones', name: 'Misiones', cpRanges: [[3300, 3399]] },
  { id: 'neuquen', name: 'Neuquén', cpRanges: [[6600, 6699], [8300, 8399]] },
  { id: 'rio_negro', name: 'Río Negro', cpRanges: [[6700, 6799], [8400, 8499], [8500, 8599]] },
  { id: 'salta', name: 'Salta', cpRanges: [[4400, 4599]] },
  { id: 'san_juan', name: 'San Juan', cpRanges: [[5400, 5499]] },
  { id: 'san_luis', name: 'San Luis', cpRanges: [[5700, 5799]] },
  { id: 'santa_cruz', name: 'Santa Cruz', cpRanges: [[9300, 9499]] },
  { id: 'santa_fe', name: 'Santa Fe', cpRanges: [[2000, 3099]] },
  { id: 'santiago_del_estero', name: 'Santiago del Estero', cpRanges: [[4200, 4399]] },
  { id: 'tierra_del_fuego', name: 'Tierra del Fuego', cpRanges: [[9410, 9499]] },
  { id: 'tucuman', name: 'Tucumán', cpRanges: [[4000, 4199]] }
]

export function getProvinceFromCP(cp: string): Province | null {
  const digits = cp.replace(/\D/g, '').slice(0, 4)
  if (digits.length < 4) return null
  const num = Number(digits)
  for (const province of PROVINCES) {
    for (const [from, to] of province.cpRanges) {
      if (num >= from && num <= to) return province
    }
  }
  return null
}

export function getProvinceById(id: string): Province | null {
  return PROVINCES.find(p => p.id === id) ?? null
}

const CITY_KEYWORDS: Record<string, ReadonlyArray<string>> = {
  caba: [
    'palermo', 'recoleta', 'belgrano', 'san telmo', 'microcentro', 'puerto madero',
    'caballito', 'villa crespo', 'nuñez', 'colegiales', 'almagro', 'boca', 'barracas',
    'flores', 'floresta', 'balvanera', 'san nicolas', 'constitucion', 'retiro',
    'villa del parque', 'villa urquiza', 'saavedra', 'chacarita', 'paternal',
    'villa soldati', 'villa riachuelo', 'parque chas', 'coghlan', 'monte castro',
    'versalles', 'velez sarsfield', 'liniers', 'mataderos', 'parque avellaneda'
  ],
  buenos_aires: [
    'la plata', 'mar del plata', 'bahia blanca', 'tandil', 'olavarria', 'Pergamino',
    'junin', 'necochea', 'tres arroyos', 'pehuajo', 'azul', 'chivilcoy', '9 de julio',
    'mercedes', 'lujan', 'saladillo', 'coronel suarez', 'coronel pringles',
    'pigue', 'bolivar', 'general Villegas', 'pehuajo', 'tornquist', 'loberia'
  ],
  cordoba: [
    'cordoba', 'rio cuarto', 'villa maria', 'san francisco', 'rio tercero',
    'alta gracia', 'bell ville', 'jesus maria', 'la falda', 'cosquin', 'carlos paz',
    'villa carlos paz', 'marcos juarez', 'morteros', 'rafaela', 'sunchales',
    'villa dolores', 'san jose de la dormida', 'dean funes', 'capilla del monte',
    'mina clavero'
  ],
  santa_fe: [
    'rosario', 'santa fe', 'rafaela', 'reconquista', 'venado tuerto', 'san lorenzo',
    'casilda', 'firmat', 'rueda', 'las rosas', 'totoras', 'san justo', 'esperanza',
    'san javier', 'santo tome', 'gálvez', 'coronda', 'arroyo seco'
  ],
  entre_rios: [
    'parana', 'concordia', 'gualeguaychu', 'concepcion del uruguay', 'colon',
    'villaguay', 'chajari', 'nogoya', 'rosario del tala', 'federal', 'la paz',
    'santa elena', 'san jose de feliciano'
  ],
  corrientes: [
    'corrientes', 'goya', 'mercedes', 'curuzu cuatia', 'paso de los libres',
    'monte caseros', 'santo tome', 'ituzaingo', 'esquina', 'sauce', 'alvear',
    'bella vista', 'saladas', 'mburucuya'
  ],
  misiones: [
    'posadas', 'obera', 'eldorado', 'apostoles', 'leandro n alem', 'jardin america',
    'san vicente', 'montecarlo', 'puerto rico', 'iguazu', 'wanders'
  ],
  chaco: [
    'resistencia', 'saenz peña', 'villa angela', 'charata', 'general jose de san martin',
    'quitilipi', 'machagai', 'las breñas', 'corzuela', 'pampa del indio', 'castelli'
  ],
  formosa: [
    'formosa', 'clorinda', 'pirané', 'el colorado', 'comandante fontana',
    'ingeniero juarez', 'las lomitas'
  ],
  tucuman: [
    'tucuman', 'san miguel de tucuman', 'yerba buena', 'tafi viejo', 'banda del rio sali',
    'concepcion', 'famailla', 'lules', 'monteros', 'almirante brown', 'trancas',
    'tafi del valle'
  ],
  salta: [
    'salta', 'tartagal', 'general guemes', 'emet', 'metan', 'cafayate', 'cachi',
    'san antonio de los cobres', 'rosario de la frontera', 'joaquin v gonzalez'
  ],
  jujuy: [
    'jujuy', 'san salvador de jujuy', 'palpala', 'libertador general san martin',
    'perico', 'san pedro', 'tilcara', 'humahuaca', 'purmamarca'
  ],
  catamarca: [
    'catamarca', 'san fernando del valle', 'andalgala', 'belen', 'tinogasta',
    'santa maria', 'recreo', 'pomán'
  ],
  santiago_del_estero: [
    'santiago del estero', 'la banda', 'termas de rio hondo', 'añatuya', 'frías',
    'suncho corral', 'monte quemado', 'quimilí', 'clodomira'
  ],
  la_rioja: [
    'la rioja', 'chilecito', 'aimogasta', 'chepes', 'chamical', 'famatina',
    'villa union', 'general belgrano'
  ],
  mendoza: [
    'mendoza', 'godoy cruz', 'guaymallén', 'las heras', 'luján de cuyo', 'maipú',
    'san rafael', 'san martin', 'rivadavia', 'tunuyan', 'tupungato', 'general alvear',
    'malargue', 'la paz'
  ],
  san_juan: [
    'san juan', 'rivadavia', 'chimbas', 'rawson', 'pocito', 'caucete', 'albardón',
    'san luis', 'merlo', 'la punta'
  ],
  san_luis: [
    'san luis', 'merlo', 'villa mercedes', 'la punta', 'justo daract', 'concarán',
    'quines', 'tilisarao'
  ],
  la_pampa: [
    'santa rosa', 'general pico', 'general aucha', 'edmundon', 'realico', 'intendente alvear',
    'veinticinco de mayo', 'bernasconi', 'miguel riglos', 'catrilo', 'guatrache'
  ],
  neuquen: [
    'neuquen', 'san martin de los andes', 'junin de los andes', 'villa la angostura',
    'cutral co', 'plottier', 'centenario', 'zapala', 'picun leufu', 'alumine',
    'chos malal', 'las lajas', 'loncopue', 'caviahue', 'copahue'
  ],
  rio_negro: [
    'bariloche', 'san carlos de bariloche', 'general roca', 'cipolletti', 'viedma',
    'allen', 'cinco saltos', 'villa regina', 'san antonio oeste', 'sierra grande',
    'el bolson', 'ingeniero jacobacci', 'maquinchao', 'los menucos'
  ],
  chubut: [
    'comodoro rivadavia', 'trelew', 'rawson', 'puerto madryn', 'esquel', 'sarmiento',
    'puerto deseado', 'caleta olivia', 'gaiman', 'dolavon', 'epuyen', 'lago puelo',
    'el maiten', 'gobernador costa', 'jose de san martin', 'río mayo'
  ],
  santa_cruz: [
    'rio gallegos', 'caleta olivia', 'puerto deseado', 'puerto san julian',
    'el calafate', 'el chalten', 'las heras', 'gobernador gregores', 'perito moreno',
    'pico truncado', '28 de noviembre', 'cmte luis piedra buena'
  ],
  tierra_del_fuego: [
    'ushuaia', 'rio grande', 'tolhuin', 'laguna escondida'
  ]
}

export function detectProvinceFromCity(city: string): Province | null {
  const normalized = city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  for (const province of PROVINCES) {
    const keywords = CITY_KEYWORDS[province.id]
    if (!keywords) continue
    for (const keyword of keywords) {
      const normalizedKeyword = keyword
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (normalized.includes(normalizedKeyword)) {
        return province
      }
    }
  }
  return null
}

export function isCPMismatch(cp: string, city: string): boolean {
  const cpProvince = getProvinceFromCP(cp)
  const cityProvince = detectProvinceFromCity(city)
  if (!cpProvince || !cityProvince) return false
  return cpProvince.id !== cityProvince.id
}
