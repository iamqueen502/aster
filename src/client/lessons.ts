import { placementOf } from '../shared/astro'
import { ELEMENTS, HOUSES, MODES, ORDINALS, PLANET_BY_KEY, SIGN_BY_INDEX } from '../shared/content'
import type { BodyKey, Chart } from '../shared/types'

export type LessonStep =
  | { kind: 'teach'; title: string; body: string }
  | { kind: 'ask'; prompt: string; options: string[]; answer: string; explain: string }

export type Lesson = {
  id: string
  title: string
  subtitle: string
  steps: LessonStep[]
  locked?: string
}

const houseOptions = ORDINALS
const elementOptions = ['Fire', 'Earth', 'Air', 'Water']
const modeOptions = ['Cardinal', 'Fixed', 'Mutable']

function houseChain(chart: Chart, signIndex: number, house: number) {
  const asc = chart.ascendant!
  const from = SIGN_BY_INDEX(asc.sign).name
  const to = SIGN_BY_INDEX(signIndex).name
  return `Counting ${from} as the 1st house, ${to} is the ${ORDINALS[house - 1]}. That is ${house - 1} step${house - 1 === 1 ? '' : 's'} on from ${from}, so the house number is ${house - 1} + 1 = ${house}.`
}

export function buildLessons(chart: Chart): Lesson[] {
  const sun = placementOf(chart, 'sun')
  const moon = placementOf(chart, 'moon')
  const sunSign = SIGN_BY_INDEX(sun.sign)
  const moonSign = SIGN_BY_INDEX(moon.sign)
  const asc = chart.ascendant ? SIGN_BY_INDEX(chart.ascendant.sign) : null

  const signLesson: Lesson = {
    id: 'signs',
    title: 'Signs are styles',
    subtitle: 'Why “Taurus” is not a personality type',
    steps: [
      {
        kind: 'teach',
        title: 'A sign is an adverb',
        body: `A sign does not describe you. It describes how a planet does its job — the style, not the substance. Two people can both have an ambitious Mars and express it completely differently depending on the sign it sits in.

Every sign is built from three dials: an element (what fuels it), a mode (how it starts and finishes), and a polarity. Learn the dials and you can read a sign you have never studied.`,
      },
      {
        kind: 'ask',
        prompt: `Your Sun sits at ${sun.degree.toFixed(1)}° ${sunSign.name}. Which element is that?`,
        options: elementOptions,
        answer: ELEMENTS[sunSign.element].name,
        explain: `${sunSign.name} is ${ELEMENTS[sunSign.element].name.toLowerCase()}. ${ELEMENTS[sunSign.element].blurb} ${sunSign.note}`,
      },
      {
        kind: 'ask',
        prompt: `Your Moon is at ${moon.degree.toFixed(1)}° ${moonSign.name}. Which mode is that?`,
        options: modeOptions,
        answer: MODES[moonSign.mode].name,
        explain: `${moonSign.name} is ${MODES[moonSign.mode].name.toLowerCase()}. ${MODES[moonSign.mode].blurb} So this is how your Moon handles what it feels: ${moonSign.style}.`,
      },
      {
        kind: 'teach',
        title: 'Two dials, one person',
        body: `Your Sun is ${sunSign.name} — ${ELEMENTS[sunSign.element].name.toLowerCase()}, ${MODES[sunSign.mode].name.toLowerCase()}, ${sunSign.style}. Your Moon is ${moonSign.name} — ${ELEMENTS[moonSign.element].name.toLowerCase()}, ${MODES[moonSign.mode].name.toLowerCase()}, ${moonSign.style}.

The Sun is what you are becoming and want seen. The Moon is what you need in order to feel safe. They are allowed to disagree, and usually do. Read them as two sentences, not one verdict.`,
      },
    ],
  }

  const houseLesson: Lesson = asc
    ? {
        id: 'houses',
        title: 'Houses are arenas',
        subtitle: 'Where a planet does its work',
        steps: [
          {
            kind: 'teach',
            title: 'Twelve rooms, one per sign',
            body: `Your Ascendant is ${asc.name} at ${chart.ascendant!.degree.toFixed(1)}°. In the whole-sign system, that makes the whole of ${asc.name} your 1st house, ${SIGN_BY_INDEX(asc.index + 1).name} your 2nd, and so on around the wheel.

A house is not a mood. It is a place in your life where the planet's business happens: the 2nd is money, the 7th is partnership, the 10th is standing. The sign says how; the house says where.`,
          },
          {
            kind: 'ask',
            prompt: `Your Sun is in ${sunSign.name}. Counting ${asc.name} as the 1st house, which house is your Sun in?`,
            options: houseOptions,
            answer: ORDINALS[sun.house! - 1]!,
            explain: `${houseChain(chart, sun.sign, sun.house!)} So your Sun's style is ${sunSign.style}, and it plays out in the arena of the ${ORDINALS[sun.house! - 1]} house.`,
          },
          {
            kind: 'ask',
            prompt: `Now your Moon in ${moonSign.name}. Which house is it in?`,
            options: houseOptions,
            answer: ORDINALS[moon.house! - 1]!,
            explain: `${houseChain(chart, moon.sign, moon.house!)} Your Moon needs safety, and it looks for it in that arena first.`,
          },
          {
            kind: 'teach',
            title: 'Arena, not identity',
            body: `Here is the mistake almost everyone makes: “Mars in the 8th house” does not mean you are an 8th-house person. Mars is how you act; the 8th is where that acting shows up — shared resources, intimacy, endings.

Read a placement as a sentence with three parts: the drive, its style, its arena. That is all a reading is. The rest is detail.`,
          },
        ],
      }
    : {
        id: 'houses',
        title: 'Houses are arenas',
        subtitle: 'Locked — this one needs a birth time',
        steps: [],
        locked: `Houses start from the Ascendant, and the Ascendant changes about one degree every four minutes. Without a birth time there is no honest way to place them, so this lesson stays shut for this chart.

That is not a limitation of the app — it is the actual cost of a missing birth time. If you can find it on a birth certificate, edit this chart and the houses will appear.`,
      }

  const ruler = PLANET_BY_KEY[(asc ?? sunSign).ruler]
  const mars = placementOf(chart, 'mars')
  const marsSign = SIGN_BY_INDEX(mars.sign)
  const marsAnswer = `Mars in ${marsSign.name}${mars.house ? `, ${ORDINALS[mars.house - 1]} house` : ''}`
  const decoys = [3, 6].map((offset) => {
    const sign = SIGN_BY_INDEX(mars.sign + offset)
    const house = mars.house ? ((mars.house + offset - 1) % 12) + 1 : null
    return `Mars in ${sign.name}${house ? `, ${ORDINALS[house - 1]} house` : ''}`
  })
  const marsOptions = [marsAnswer, ...decoys].sort((a, b) => (a < b ? -1 : 1))

  const planetLesson: Lesson = {
    id: 'planets',
    title: 'Planets are drives',
    subtitle: 'Ten verbs, and the one rule that builds a reading',
    steps: [
      {
        kind: 'teach',
        title: 'Ten drives',
        body: `Each planet is a verb, not a personality: ${['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
          .map((key) => `${PLANET_BY_KEY[key as BodyKey].name} — ${PLANET_BY_KEY[key as BodyKey].drive}`)
          .join('; ')}.

Nothing here is good or bad until it meets a sign and a house.`,
      },
      {
        kind: 'ask',
        prompt: `Which planet rules ${(asc ?? sunSign).name}?`,
        options: [
          ruler.name,
          ...['venus', 'mars', 'saturn']
            .filter((key) => key !== ruler.key)
            .slice(0, 3)
            .map((key) => PLANET_BY_KEY[key as BodyKey].name),
        ].sort((a, b) => (a < b ? -1 : 1)),
        answer: ruler.name,
        explain: `${(asc ?? sunSign).name} is ruled by ${ruler.name} — ${ruler.drive}. The ruler is the planet that has the most say over that sign's business, which is why astrologers look it up before reading a house.`,
      },
      {
        kind: 'ask',
        prompt: 'Where is your Mars?',
        options: marsOptions,
        answer: marsAnswer,
        explain: `Mars is how you act and assert. In ${marsSign.name} it acts ${marsSign.style}.${
          mars.house
            ? ` In the ${ORDINALS[mars.house - 1]} house it plays out in the arena of ${HOUSES[mars.house - 1]!.arena}.`
            : ''
        }`,
      },
      {
        kind: 'teach',
        title: 'The rule that builds every reading',
        body: `Drive + style + arena. That is the whole machine. “Mars in ${marsSign.name}${mars.house ? `, ${ORDINALS[mars.house - 1]} house` : ''}” becomes: ${PLANET_BY_KEY.mars.drive}, done ${marsSign.style}${mars.house ? `, in the arena of the ${ORDINALS[mars.house - 1]} house` : ''}.

Now go back to the wheel and click three placements you have not looked at. You already have everything you need to read them.`,
      },
    ],
  }

  return [signLesson, houseLesson, planetLesson]
}
