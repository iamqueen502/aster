import type { BodyKey, Element, HouseInfo, Mode, PlanetInfo, SignInfo } from './types'

/**
 * All teaching copy lives here, authored by hand. A reading in this app is a
 * composition of three rules: what the planet does, what the sign's style is,
 * and which arena the house gives it.
 */

export const SIGNS: SignInfo[] = [
  {
    index: 0,
    name: 'Aries',
    glyph: '♈',
    element: 'fire',
    mode: 'cardinal',
    ruler: 'mars',
    style: 'direct, fast, and a little impatient',
    note: 'Aries does things first and refines later. The style is the spark, not the follow-through.',
  },
  {
    index: 1,
    name: 'Taurus',
    glyph: '♉',
    element: 'earth',
    mode: 'fixed',
    ruler: 'venus',
    style: 'steady, sensory, and slow to move once settled',
    note: 'Taurus values what can be touched, tasted, or relied on. Change is possible, just not rushed.',
  },
  {
    index: 2,
    name: 'Gemini',
    glyph: '♊',
    element: 'air',
    mode: 'mutable',
    ruler: 'mercury',
    style: 'curious, quick-tongued, and already thinking about the next thing',
    note: 'Gemini gathers and links. The point is the exchange, not the conclusion.',
  },
  {
    index: 3,
    name: 'Cancer',
    glyph: '♋',
    element: 'water',
    mode: 'cardinal',
    ruler: 'moon',
    style: 'protective, memory-keeping, and tuned to safety',
    note: 'Cancer builds a shell around what matters and remembers who was kind.',
  },
  {
    index: 4,
    name: 'Leo',
    glyph: '♌',
    element: 'fire',
    mode: 'fixed',
    ruler: 'sun',
    style: 'warm, proud, and generous when it feels seen',
    note: 'Leo needs the work to be witnessed. Recognition is fuel here, not vanity.',
  },
  {
    index: 5,
    name: 'Virgo',
    glyph: '♍',
    element: 'earth',
    mode: 'mutable',
    ruler: 'mercury',
    style: 'precise, practical, and quick to spot the flaw',
    note: 'Virgo improves by noticing. The same eye that catches errors can catch what is working.',
  },
  {
    index: 6,
    name: 'Libra',
    glyph: '♎',
    element: 'air',
    mode: 'cardinal',
    ruler: 'venus',
    style: 'fair, relational, and uneasy with one-sided choices',
    note: 'Libra thinks in pairs. A decision only feels real once it accounts for the other person.',
  },
  {
    index: 7,
    name: 'Scorpio',
    glyph: '♏',
    element: 'water',
    mode: 'fixed',
    ruler: 'pluto',
    style: 'private, penetrating, and all-or-nothing',
    note: 'Scorpio goes under the surface and stays there. It does not do casual well.',
  },
  {
    index: 8,
    name: 'Sagittarius',
    glyph: '♐',
    element: 'fire',
    mode: 'mutable',
    ruler: 'jupiter',
    style: 'blunt, seeking, and allergic to being boxed in',
    note: 'Sagittarius aims at meaning. The arrow is honest even when it lands badly.',
  },
  {
    index: 9,
    name: 'Capricorn',
    glyph: '♑',
    element: 'earth',
    mode: 'cardinal',
    ruler: 'saturn',
    style: 'patient, structural, and playing a long game',
    note: 'Capricorn trusts time and structure. It would rather be late and solid than early and wrong.',
  },
  {
    index: 10,
    name: 'Aquarius',
    glyph: '♒',
    element: 'air',
    mode: 'fixed',
    ruler: 'uranus',
    style: 'principled, contrarian, and thinking in systems',
    note: 'Aquarius steps back to see the pattern, which can look cold up close.',
  },
  {
    index: 11,
    name: 'Pisces',
    glyph: '♓',
    element: 'water',
    mode: 'mutable',
    ruler: 'neptune',
    style: 'porous, imaginative, and merged with the mood in the room',
    note: 'Pisces takes the shape of its container. Boundaries are the lesson, not the instinct.',
  },
]

export const ELEMENTS: Record<Element, { name: string; blurb: string }> = {
  fire: { name: 'Fire', blurb: 'Fire is drive and appetite — it wants to go.' },
  earth: { name: 'Earth', blurb: 'Earth is matter and method — it wants to hold.' },
  air: { name: 'Air', blurb: 'Air is thought and exchange — it wants to connect.' },
  water: { name: 'Water', blurb: 'Water is feeling and memory — it wants to merge.' },
}

export const MODES: Record<Mode, { name: string; blurb: string }> = {
  cardinal: {
    name: 'Cardinal',
    blurb: 'Cardinal signs start things. They initiate and set a direction.',
  },
  fixed: {
    name: 'Fixed',
    blurb: 'Fixed signs sustain. They hold a position and finish what they began.',
  },
  mutable: {
    name: 'Mutable',
    blurb: 'Mutable signs adapt. They adjust and hand off.',
  },
}

export const HOUSES: HouseInfo[] = [
  { index: 1, name: 'Self', arena: 'the body, the first impression, how you begin' },
  { index: 2, name: 'Resources', arena: 'money, possessions, and what you call yours' },
  { index: 3, name: 'Neighbourhood', arena: 'siblings, local life, everyday talk and short trips' },
  { index: 4, name: 'Home', arena: 'family, roots, the private base you return to' },
  { index: 5, name: 'Play', arena: 'creativity, romance, children, things made for joy' },
  { index: 6, name: 'Work', arena: 'routines, health, service, the daily grind' },
  { index: 7, name: 'Others', arena: 'partnership, one-to-one relationships, open rivals' },
  { index: 8, name: 'Depth', arena: 'shared resources, intimacy, endings, what stays hidden' },
  { index: 9, name: 'Horizon', arena: 'travel, study, belief, the bigger picture' },
  { index: 10, name: 'Standing', arena: 'career, public role, reputation' },
  { index: 11, name: 'Company', arena: 'friends, groups, and hopes for the future' },
  { index: 12, name: 'Quiet', arena: 'solitude, the unconscious, what gets released' },
]

export const PLANETS: PlanetInfo[] = [
  {
    key: 'sun',
    name: 'Sun',
    glyph: '☉',
    drive: 'the part of you that wants to be seen, and to become something in particular',
  },
  {
    key: 'moon',
    name: 'Moon',
    glyph: '☽',
    drive: 'what you need to feel safe — your reflex, your mood, your private self',
  },
  {
    key: 'mercury',
    name: 'Mercury',
    glyph: '☿',
    drive: 'how you think, speak, and pay attention',
  },
  {
    key: 'venus',
    name: 'Venus',
    glyph: '♀',
    drive: 'what you find beautiful and worth keeping, and how you relate',
  },
  {
    key: 'mars',
    name: 'Mars',
    glyph: '♂',
    drive: 'how you act, assert, and fight — your engine',
  },
  {
    key: 'jupiter',
    name: 'Jupiter',
    glyph: '♃',
    drive: 'where you expand, trust, and overdo it',
  },
  {
    key: 'saturn',
    name: 'Saturn',
    glyph: '♄',
    drive: 'where you are tested, careful, and slowly becoming competent',
  },
  {
    key: 'uranus',
    name: 'Uranus',
    glyph: '♅',
    drive: 'where you break the pattern and need to be free',
  },
  {
    key: 'neptune',
    name: 'Neptune',
    glyph: '♆',
    drive: 'where you dissolve, imagine, and look past what is there',
  },
  {
    key: 'pluto',
    name: 'Pluto',
    glyph: '♇',
    drive: 'where you are remade — power, depth, and what you cannot leave alone',
  },
]

export const PLANET_BY_KEY = Object.fromEntries(
  PLANETS.map((planet) => [planet.key, planet]),
) as Record<BodyKey, PlanetInfo>

/**
 * U+FE0E asks for text presentation. Without it, browsers draw the zodiac
 * characters as colour emoji, which turns the sign ring into purple badges.
 */
export const glyphText = (glyph: string) => `${glyph}\uFE0E`

export const SIGN_BY_INDEX = (index: number): SignInfo =>
  SIGNS[((index % 12) + 12) % 12]!

export const ORDINALS = [
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
]
