import type { KeyboardEvent } from 'react'
import type { BodyKey, Chart, Placement } from '../shared/types'
import { glyphText, HOUSES, PLANET_BY_KEY, SIGN_BY_INDEX, SIGNS } from '../shared/content'

export type Selection =
  | { kind: 'planet'; key: BodyKey }
  | { kind: 'sign'; index: number }
  | { kind: 'house'; index: number }

const CX = 320
const R_OUT = 302
const R_SIGN = 258
const R_HOUSE = 224
const R_PLANET = 196
const R_ASPECT = 116
/** Room for a glyph in each planet disc, and the ring spacing when they crowd. */
const PLANET_RADIUS = 13
const RING_GAP = 30
const CLUSTER_GAP = 10

const point = (radius: number, degrees: number) =>
  [CX + radius * Math.cos((degrees * Math.PI) / 180), CX - radius * Math.sin((degrees * Math.PI) / 180)] as const

const at = (radius: number, degrees: number) => {
  const [x, y] = point(radius, degrees)
  return { x, y }
}

/** The x1/y1/x2/y2 of a radial line between two radii. */
const spoke = (from: number, to: number, degrees: number) => {
  const start = at(from, degrees)
  const end = at(to, degrees)
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function sector(rOut: number, rIn: number, from: number, to: number) {
  const [x1, y1] = point(rOut, from)
  const [x2, y2] = point(rOut, to)
  const [x3, y3] = point(rIn, to)
  const [x4, y4] = point(rIn, from)
  const large = to - from > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 0 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 1 ${x4} ${y4} Z`
}

const keyOf = (selection: Selection) =>
  selection.kind === 'planet'
    ? `planet:${selection.key}`
    : `${selection.kind}:${selection.index}`

const isSame = (a: Selection | null, b: Selection) => a !== null && keyOf(a) === keyOf(b)

export function ChartWheel({
  chart,
  selected,
  onSelect,
}: {
  chart: Chart
  selected: Selection | null
  onSelect: (selection: Selection) => void
}) {
  const reference = chart.ascendant?.lon ?? 0
  const angleOf = (lon: number) => 180 + (lon - reference)

  // Planets that share a longitude step inwards instead of piling up on one ring.
  const laid: { body: Placement; angle: number; radius: number }[] = []
  const ringAngles: number[][] = [[], [], []]
  for (const body of [...chart.bodies].sort((a, b) => a.lon - b.lon)) {
    const angle = angleOf(body.lon)
    const gapTo = (other: number) => Math.abs(((angle - other + 540) % 360) - 180)
    let ring = 0
    while (
      ring < ringAngles.length - 1 &&
      ringAngles[ring]!.some((other) => gapTo(other) < CLUSTER_GAP)
    )
      ring += 1
    ringAngles[ring]!.push(angle)
    laid.push({ body, angle, radius: R_PLANET - ring * RING_GAP })
  }

  const asc = chart.ascendant ? angleOf(chart.ascendant.lon) : null
  const mc = chart.midheaven ? angleOf(chart.midheaven.lon) : null
  const byKey = new Map(chart.bodies.map((body) => [body.key, body]))

  const activate = (selection: Selection) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(selection),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(selection)
      }
    },
  })

  return (
    <figure className="wheel-figure">
      <svg
        viewBox="0 0 640 640"
        className="wheel"
        role="group"
        aria-label={`Birth chart wheel. ${chart.bodies
          .map((body) => `${PLANET_BY_KEY[body.key].name} in ${SIGN_BY_INDEX(body.sign).name}`)
          .join(', ')}.`}
      >
        <circle cx={CX} cy={CX} r={R_OUT} className="wheel-ring" />
        <circle cx={CX} cy={CX} r={R_SIGN} className="wheel-ring faint" />
        <circle cx={CX} cy={CX} r={R_HOUSE} className="wheel-ring faint" />
        <circle cx={CX} cy={CX} r={R_ASPECT} className="wheel-ring faint" />

        {chart.aspects.map((aspect, index) => {
          if (aspect.type === 'conjunction') return null
          const a = byKey.get(aspect.a)!
          const b = byKey.get(aspect.b)!
          const [x1, y1] = point(R_ASPECT, angleOf(a.lon))
          const [x2, y2] = point(R_ASPECT, angleOf(b.lon))
          return (
            <line
              key={`${aspect.a}-${aspect.b}-${index}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={`wheel-aspect aspect-${aspect.type}`}
              style={{ opacity: Math.max(0.18, 0.85 - aspect.orb / 12) }}
            />
          )
        })}

        {SIGNS.map((sign) => {
          const from = angleOf(sign.index * 30)
          const to = from + 30
          const active = isSame(selected, { kind: 'sign', index: sign.index })
          const [gx, gy] = point(288, from + 15)
          return (
            <g key={sign.name} {...activate({ kind: 'sign', index: sign.index })}>
              <path
                d={sector(R_OUT, R_SIGN, from, to)}
                className={`wheel-sign element-${sign.element}${active ? ' is-selected' : ''}`}
              >
                <title>{sign.name}</title>
              </path>
              <text x={gx} y={gy} className="wheel-glyph" textAnchor="middle" dominantBaseline="central">
                {glyphText(sign.glyph)}
              </text>
            </g>
          )
        })}

        {Array.from({ length: 72 }, (_, tick) => {
          const degrees = tick * 5
          const angle = angleOf(degrees)
          const inner = degrees % 30 === 0 ? R_SIGN : degrees % 10 === 0 ? R_OUT - 10 : R_OUT - 6
          const [x1, y1] = point(R_OUT, angle)
          const [x2, y2] = point(inner, angle)
          return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} className="wheel-tick" />
        })}

        {chart.houses?.map((house) => {
          const from = angleOf(house.sign * 30)
          const [hx, hy] = point((R_HOUSE + R_SIGN) / 2, from + 15)
          const active = isSame(selected, { kind: 'house', index: house.index })
          const [cx1, cy1] = point(R_SIGN, from)
          const [cx2, cy2] = point(R_HOUSE, from)
          return (
            <g key={house.index} {...activate({ kind: 'house', index: house.index })}>
              <line x1={cx1} y1={cy1} x2={cx2} y2={cy2} className="wheel-cusp" />
              <circle
                cx={hx}
                cy={hy}
                r={15}
                className={`wheel-house${active ? ' is-selected' : ''}`}
              >
                <title>{`${HOUSES[house.index - 1]!.name} — the ${house.index} house`}</title>
              </circle>
              <text x={hx} y={hy} className="wheel-house-number" textAnchor="middle" dominantBaseline="central">
                {house.index}
              </text>
            </g>
          )
        })}

        {laid.map(({ body, angle, radius }) => {
          const [x, y] = point(radius, angle)
          const active = isSame(selected, { kind: 'planet', key: body.key })
          const planet = PLANET_BY_KEY[body.key]
          return (
            <g key={body.key} {...activate({ kind: 'planet', key: body.key })}>
              <circle
                cx={x}
                cy={y}
                r={PLANET_RADIUS}
                className={`wheel-planet${active ? ' is-selected' : ''}${body.retrograde ? ' is-retro' : ''}`}
              >
                <title>{`${planet.name} in ${SIGN_BY_INDEX(body.sign).name} at ${body.degree.toFixed(1)}°${body.retrograde ? ', retrograde' : ''}`}</title>
              </circle>
              <text x={x} y={y} className="wheel-planet-glyph" textAnchor="middle" dominantBaseline="central">
                {glyphText(planet.glyph)}
              </text>
            </g>
          )
        })}

        {asc !== null && (
          <g className="wheel-angle">
            <line {...spoke(R_ASPECT + 8, R_OUT, asc)} className="wheel-angle-line" />
            <text
              {...at(R_ASPECT - 6, asc)}
              className="wheel-angle-label"
              textAnchor="middle"
              dominantBaseline="central"
            >
              ASC
            </text>
          </g>
        )}
        {mc !== null && (
          <line {...spoke(R_HOUSE, R_OUT, mc)} className="wheel-angle-line faint" />
        )}
      </svg>
      <div className="wheel-legend" role="group" aria-label="Signs">
        {SIGNS.map((sign) => {
          const active = isSame(selected, { kind: 'sign', index: sign.index })
          return (
            <button
              key={sign.name}
              type="button"
              className={`legend-item element-${sign.element}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onSelect({ kind: 'sign', index: sign.index })}
            >
              <span aria-hidden="true">{glyphText(sign.glyph)}</span>
              {sign.name}
            </button>
          )
        })}
      </div>
      <figcaption className="wheel-caption">
        Click a sign, house or planet — the exact degree is in the card. Dashed rings are retrograde.{' '}
        {chart.ascendant ? 'The Ascendant is the line on the left.' : 'No birth time, so no Ascendant or houses.'}
      </figcaption>
    </figure>
  )
}
