export type Element = 'fire' | 'earth' | 'air' | 'water'
export type Mode = 'cardinal' | 'fixed' | 'mutable'
export type BodyKey =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
export type AspectType =
  | 'conjunction'
  | 'opposition'
  | 'trine'
  | 'square'
  | 'sextile'

/** The inputs of a chart. Only these are stored; positions are recomputed. */
export type ProfileInput = {
  label: string
  /** YYYY-MM-DD */
  birthDate: string
  /** HH:MM, empty when the time is unknown */
  birthTime: string
  timeKnown: boolean
  placeLabel: string
  lat: number
  lon: number
  /** IANA zone, e.g. Europe/Lisbon */
  tz: string
}

export type Profile = ProfileInput & {
  id: string
  createdAt: number
  updatedAt: number
}

export type Place = {
  name: string
  region: string
  country: string
  lat: number
  lon: number
  tz: string
}

export type Session = {
  user: { sub: string; name?: string; email?: string } | null
  mode: 'local' | 'freebuff' | 'setup'
  database: boolean
}

export type LessonProgress = { step: number; done: boolean }
export type ProgressState = { lessons: Record<string, LessonProgress> }

export type SignAngle = {
  lon: number
  /** 0 = Aries … 11 = Pisces */
  sign: number
  degree: number
}

export type Placement = SignAngle & {
  key: BodyKey
  retrograde: boolean
  house: number | null
}

export type Aspect = {
  a: BodyKey
  b: BodyKey
  type: AspectType
  angle: number
  orb: number
}

export type Chart = {
  timeKnown: boolean
  /** Local clock time used for the calculation. */
  localLabel: string
  utcLabel: string
  offsetLabel: string
  bodies: Placement[]
  ascendant: SignAngle | null
  midheaven: SignAngle | null
  houses: { index: number; sign: number }[] | null
  aspects: Aspect[]
  elements: Record<Element, number>
  modes: Record<Mode, number>
  moon: { angle: number; name: string; illumination: number }
  warnings: string[]
}

export type SignInfo = {
  index: number
  name: string
  glyph: string
  element: Element
  mode: Mode
  ruler: BodyKey
  style: string
  note: string
}

export type HouseInfo = {
  index: number
  name: string
  arena: string
}

export type PlanetInfo = {
  key: BodyKey
  name: string
  glyph: string
  drive: string
}
