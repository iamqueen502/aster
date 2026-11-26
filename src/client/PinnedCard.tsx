import type { ReactNode } from 'react'
import { ELEMENTS, glyphText, HOUSES, MODES, ORDINALS, PLANET_BY_KEY, SIGN_BY_INDEX } from '../shared/content'
import type { Chart } from '../shared/types'
import type { Selection } from './ChartWheel'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rule-row">
      <span className="rule-label">{label}</span>
      <p>{children}</p>
    </div>
  )
}

export function PinnedCard({
  chart,
  selection,
  onSelect,
}: {
  chart: Chart
  selection: Selection | null
  onSelect: (selection: Selection) => void
}) {
  if (!selection)
    return (
      <div className="pinned empty-pin">
        <p>Pick a planet, a sign, or a house on the wheel.</p>
      </div>
    )

  if (selection.kind === 'planet') {
    const body = chart.bodies.find((entry) => entry.key === selection.key)!
    const planet = PLANET_BY_KEY[body.key]
    const sign = SIGN_BY_INDEX(body.sign)
    const element = ELEMENTS[sign.element]
    const mode = MODES[sign.mode]
    const house = body.house ? HOUSES[body.house - 1]! : null
    const asc = chart.ascendant

    return (
      <div className="pinned">
        <header className="pin-head">
          <span className="pin-glyph" aria-hidden="true">{glyphText(planet.glyph)}</span>
          <div>
            <h3>{planet.name}</h3>
            <p className="pin-sub">
              {body.degree.toFixed(1)}° {sign.name}
              {house ? ` · ${ORDINALS[house.index - 1]} house` : ' · house unknown'}
              {body.retrograde ? ' · retrograde' : ''}
            </p>
          </div>
        </header>

        <Row label="Planet">{planet.drive}.</Row>
        <Row label="Sign">
          {sign.name} is {element.name.toLowerCase()} and {mode.name.toLowerCase()}: {sign.style}. {sign.note}
        </Row>
        <Row label="House">
          {house
            ? `The ${ORDINALS[house.index - 1]} house is ${house.name.toLowerCase()} — ${house.arena}.`
            : 'Without a birth time the houses cannot be placed, so this planet has no arena yet. That is exactly what a birth time buys you.'}
        </Row>

        <p className="pin-composed">
          Put together: your {planet.name} works in {sign.name}’s style — {sign.style} —{' '}
          {house
            ? `and it shows up in the arena of ${house.arena}.`
            : 'though where it shows up is still open.'}
        </p>

        <details className="working">
          <summary>Show the working</summary>
          <ol>
            <li>
              Ecliptic longitude at birth: <strong>{body.lon.toFixed(2)}°</strong>.
            </li>
            <li>
              {Math.floor(body.lon / 30)} × 30° = {(sign.index * 30).toFixed(0)}°, so the sign is{' '}
              <strong>{sign.name}</strong> at {body.degree.toFixed(2)}°.
            </li>
            {asc && house ? (
              <li>
                House = ({sign.index} − {asc.sign} + 12) mod 12 + 1 ={' '}
                <strong>{house.index}</strong>, because {SIGN_BY_INDEX(asc.sign).name} is the whole 1st house.
              </li>
            ) : null}
            {body.retrograde ? (
              <li>
                Retrograde: the longitude was smaller 12 hours later, so the planet appears to move backwards
                from here. That is a line-of-sight effect, not a change of direction in space.
              </li>
            ) : null}
            <li>
              Calculated for {chart.utcLabel}, from {chart.localLabel} ({chart.offsetLabel}).
            </li>
          </ol>
        </details>
      </div>
    )
  }

  if (selection.kind === 'sign') {
    const sign = SIGN_BY_INDEX(selection.index)
    const element = ELEMENTS[sign.element]
    const mode = MODES[sign.mode]
    const ruler = PLANET_BY_KEY[sign.ruler]
    const here = chart.bodies.filter((body) => body.sign === sign.index)

    return (
      <div className="pinned">
        <header className="pin-head">
          <span className="pin-glyph" aria-hidden="true">{glyphText(sign.glyph)}</span>
          <div>
            <h3>{sign.name}</h3>
            <p className="pin-sub">{element.name} · {mode.name} · ruled by {ruler.name}</p>
          </div>
        </header>
        <Row label="Element">{element.blurb}</Row>
        <Row label="Mode">{mode.blurb}</Row>
        <Row label="Style">{sign.style}. {sign.note}</Row>
        <Row label="Here">
          {here.length
            ? here.map((body) => PLANET_BY_KEY[body.key].name).join(', ') + '.'
            : 'No planets in this sign in your chart. An empty sign is not a missing part of you — it just means no planet does its work in that style.'}
        </Row>
      </div>
    )
  }

  const house = HOUSES[selection.index - 1]!
  const sign = SIGN_BY_INDEX(chart.houses?.find((entry) => entry.index === house.index)?.sign ?? 0)
  const here = chart.bodies.filter((body) => body.house === house.index)

  return (
    <div className="pinned">
      <header className="pin-head">
        <span className="pin-glyph pin-number">{house.index}</span>
        <div>
          <h3>{ORDINALS[house.index - 1]} house · {house.name}</h3>
          <p className="pin-sub">Whole sign: {sign.name}</p>
        </div>
      </header>
      <Row label="Arena">{house.arena[0]!.toUpperCase() + house.arena.slice(1)}.</Row>
      <Row label="Sign">
        With whole-sign houses, the {ORDINALS[house.index - 1]} house is the whole of {sign.name} — so
        anything in {sign.name} is doing its work here.
      </Row>
      <Row label="Here">
        {here.length
          ? here.map((body) => `${PLANET_BY_KEY[body.key].name} (${body.degree.toFixed(0)}° ${sign.name})`).join(', ') + '.'
          : 'No planets in this house. The arena still exists; nothing is currently parked in it.'}
      </Row>
    </div>
  )
}
