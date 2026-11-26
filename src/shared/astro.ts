import { Body, Ecliptic, GeoVector, MoonPhase, SiderealTime } from 'astronomy-engine'
import type {
  Aspect,
  AspectType,
  BodyKey,
  Chart,
  Element,
  Mode,
  Placement,
  ProfileInput,
  SignAngle,
} from './types'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

export const BODY_KEYS: BodyKey[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
]

const BODY_ENUM: Record<BodyKey, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
}

export const ELEMENT_BY_SIGN: Element[] = [
  'fire',
  'earth',
  'air',
  'water',
  'fire',
  'earth',
  'air',
  'water',
  'fire',
  'earth',
  'air',
  'water',
]

export const MODE_BY_SIGN: Mode[] = [
  'cardinal',
  'fixed',
  'mutable',
  'cardinal',
  'fixed',
  'mutable',
  'cardinal',
  'fixed',
  'mutable',
  'cardinal',
  'fixed',
  'mutable',
]

const ASPECT_SPECS: { type: AspectType; angle: number; orb: number }[] = [
  { type: 'conjunction', angle: 0, orb: 8 },
  { type: 'opposition', angle: 180, orb: 8 },
  { type: 'trine', angle: 120, orb: 7 },
  { type: 'square', angle: 90, orb: 6 },
  { type: 'sextile', angle: 60, orb: 4 },
]

export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

export function signAngle(lon: number): SignAngle {
  const value = norm360(lon)
  const sign = Math.floor(value / 30)
  return { lon: value, sign, degree: value - sign * 30 }
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const HOUR_MS = 3_600_000

type ZoneParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zoneParts(ts: number, tz: string): ZoneParts {
  let formatter = formatters.get(tz)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, formatter)
  }
  const parts = formatter.formatToParts(new Date(ts))
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function zoneOffset(ts: number, tz: string): number {
  const parts = zoneParts(ts, tz)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - ts
}

/** The wall-clock reading in `tz` at an instant, as a date and HH:MM. */
function localReading(ts: number, tz: string): { date: string; clock: string } {
  const parts = zoneParts(ts, tz)
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    clock: `${pad(parts.hour)}:${pad(parts.minute)}`,
  }
}

/**
 * The offsets a zone could be on around one wall-clock reading. A clock change
 * puts two of them within a day of the reading, and the fixed-point walk adds
 * whichever one a plain iteration settles on, so both sides of the jump are
 * tested instead of trusting the first answer.
 */
function offsetsAround(naive: number, zone: string): number[] {
  const offsets = new Set<number>()
  for (const hours of [-36, -24, -12, 0, 12, 24, 36])
    offsets.add(zoneOffset(naive + hours * HOUR_MS, zone))
  let ts = naive
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = zoneOffset(ts, zone)
    offsets.add(offset)
    const next = naive - offset
    if (next === ts) break
    ts = next
  }
  return [...offsets]
}

export type LocalTimeResolution = {
  utc: Date
  /** The zone's real offset at `utc`, in minutes east of UTC. */
  offsetMinutes: number
  /**
   * `unique` for an ordinary reading; `ambiguous` when the clock read it twice;
   * `nonexistent` when the clock jumped over it.
   */
  kind: 'unique' | 'ambiguous' | 'nonexistent'
  /** The other instant when the reading was repeated or skipped. */
  other: { utc: Date; offsetMinutes: number } | null
}

/**
 * Turns a local wall-clock time in an IANA zone into a UTC instant.
 *
 * An ordinary reading names one instant, but at a clock change it can name two
 * (the clock was put back) or none (it jumped forward). Those cases are resolved
 * deliberately instead of landing wherever the iteration happens to stop: a
 * repeated reading takes its first occurrence, a skipped one the time the clock
 * jumped to. `kind` reports which happened, so the chart can say so out loud.
 * Historical daylight-saving rules are still read from the zone, not assumed.
 */
export function localToUtc(
  dateStr: string,
  timeStr: string,
  tz: string,
): LocalTimeResolution {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const naive = Date.UTC(year!, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0)
  const zone = isValidTimeZone(tz) ? tz : 'UTC'
  const offsets = offsetsAround(naive, zone)

  // A candidate offset is real only if the zone is still on it at the instant
  // it implies. Zero matches means the clock skipped the reading; two mean it
  // repeated it; one is an ordinary day.
  const matches: number[] = []
  for (const offset of offsets) {
    const ts = naive - offset
    if (zoneOffset(ts, zone) === offset && !matches.includes(ts)) matches.push(ts)
  }
  matches.sort((a, b) => a - b)
  const at = (ts: number) => ({
    utc: new Date(ts),
    offsetMinutes: Math.round(zoneOffset(ts, zone) / 60_000),
  })

  if (matches.length === 1)
    return { ...at(matches[0]!), kind: 'unique', other: null }
  if (matches.length > 1)
    return {
      ...at(matches[0]!),
      kind: 'ambiguous',
      other: at(matches[matches.length - 1]!),
    }

  // The clock jumped over this reading. Applying the offset from before the
  // jump lands after it, at the time the clock jumped to (02:30 becomes 03:30).
  // That is the same choice Temporal calls "compatible" disambiguation.
  const candidates = offsets.map((offset) => naive - offset)
  return {
    ...at(Math.max(...candidates)),
    kind: 'nonexistent',
    other: at(Math.min(...candidates)),
  }
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+'
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const mins = String(absolute % 60).padStart(2, '0')
  return `UTC${sign}${hours}:${mins}`
}

function obliquity(jd: number): number {
  const t = (jd - 2451545.0) / 36525
  return (
    23.439291111 -
    0.0130041667 * t -
    0.00000016389 * t * t +
    0.0000005036 * t * t * t
  )
}

function longitudeOf(key: BodyKey, date: Date): number {
  const vector = GeoVector(BODY_ENUM[key], date, true)
  return norm360(Ecliptic(vector).elon)
}

/**
 * The ecliptic degree rising on the eastern horizon. Solved numerically from
 * the altitude of each ecliptic point, which avoids the sign errors the closed
 * form invites: a root of altitude zero is only the Ascendant when its hour
 * angle is negative (east of the meridian).
 */
export function ascendantLongitude(
  ramcDeg: number,
  latitude: number,
  obliquityDeg: number,
): number {
  const phi = latitude * RAD
  const eps = obliquityDeg * RAD
  const ramc = ramcDeg * RAD
  const altitude = (lambda: number) => {
    const declination = Math.asin(Math.sin(eps) * Math.sin(lambda))
    const rightAscension = Math.atan2(
      Math.cos(eps) * Math.sin(lambda),
      Math.cos(lambda),
    )
    const hourAngle = Math.atan2(
      Math.sin(ramc - rightAscension),
      Math.cos(ramc - rightAscension),
    )
    const height =
      Math.sin(phi) * Math.sin(declination) +
      Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
    return { height, hourAngle }
  }
  const step = 0.5 * RAD
  let previous = altitude(0)
  for (let lambda = step; lambda <= 2 * Math.PI + 1e-9; lambda += step) {
    const current = altitude(lambda)
    if (previous.height < 0 !== current.height < 0) {
      let low = lambda - step
      let high = lambda
      let lowHeight = previous.height
      for (let i = 0; i < 60; i += 1) {
        const mid = (low + high) / 2
        const midHeight = altitude(mid).height
        if (lowHeight < 0 === midHeight < 0) {
          low = mid
          lowHeight = midHeight
        } else {
          high = mid
        }
      }
      const root = (low + high) / 2
      if (altitude(root).hourAngle < 0) return norm360(root * DEG)
    }
    previous = current
  }
  // Fallback for pathological latitudes where the ecliptic barely crosses the
  // horizon: the standard closed form, correct quadrant included.
  const asc = Math.atan2(
    Math.cos(ramc),
    -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
  )
  return norm360(asc * DEG)
}

export function midheavenLongitude(ramcDeg: number, obliquityDeg: number): number {
  const ramc = ramcDeg * RAD
  const eps = obliquityDeg * RAD
  return norm360(
    Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * DEG,
  )
}

const PHASE_NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
]

export function computeChart(profile: ProfileInput): Chart {
  const warnings: string[] = []
  const timeKnown =
    profile.timeKnown && /^([01]\d|2[0-3]):[0-5]\d$/.test(profile.birthTime)
  const clock = timeKnown ? profile.birthTime : '12:00'
  const tz = isValidTimeZone(profile.tz) ? profile.tz : 'UTC'
  if (tz !== profile.tz) warnings.push(`Unknown time zone “${profile.tz}” — calculated as UTC.`)
  const moment = localToUtc(profile.birthDate, clock, tz)
  const { utc, offsetMinutes } = moment
  // A skipped clock reading can land on another date: Samoa skipped a whole
  // day in 2011, so the label follows the instant, not the entered date.
  const reading = localReading(utc.getTime(), tz)

  // A clock change can make the entered reading name two instants or none.
  // localToUtc resolved it; say which reading the chart is actually built on.
  if (moment.kind === 'ambiguous')
    warnings.push(
      `The clock read ${clock} twice on ${profile.birthDate} in ${tz}, because it was put back that day. This chart uses the first occurrence, ${formatOffset(offsetMinutes)}; the repeat at ${formatOffset(moment.other!.offsetMinutes)} would move the Ascendant and the Moon.`,
    )
  else if (moment.kind === 'nonexistent')
    warnings.push(
      `The clock skipped ${clock} on ${profile.birthDate} in ${tz}, because it jumped forward that day. This chart uses ${reading.date} ${reading.clock} (${formatOffset(offsetMinutes)}), the time the clock jumped to.`,
    )

  if (!timeKnown)
    warnings.push(
      'No birth time: positions are for noon local time. The Moon moves about 13° a day, so its sign can be uncertain, and the Ascendant and houses cannot be placed at all.',
    )
  if (Math.abs(profile.lat) > 66)
    warnings.push(
      'This latitude is inside the polar circles, where the Ascendant can swing very fast. Treat the rising sign with care.',
    )

  const jd = utc.getTime() / 86_400_000 + 2440587.5
  const eps = obliquity(jd)
  const gast = SiderealTime(utc)
  const ramc = norm360(gast * 15 + profile.lon)

  const ascLon = timeKnown ? ascendantLongitude(ramc, profile.lat, eps) : null
  const mcLon = timeKnown ? midheavenLongitude(ramc, eps) : null
  const ascSign = ascLon === null ? null : Math.floor(ascLon / 30)

  const bodies: Placement[] = BODY_KEYS.map((key) => {
    const lon = longitudeOf(key, utc)
    const before = longitudeOf(key, new Date(utc.getTime() - 12 * 3_600_000))
    const after = longitudeOf(key, new Date(utc.getTime() + 12 * 3_600_000))
    let delta = after - before
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    const angle = signAngle(lon)
    return {
      key,
      lon: angle.lon,
      sign: angle.sign,
      degree: angle.degree,
      retrograde: delta < 0 && key !== 'sun' && key !== 'moon',
      house:
        ascSign === null
          ? null
          : ((angle.sign - ascSign + 12) % 12) + 1,
    }
  })

  const aspects: Aspect[] = []
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i]!
      const b = bodies[j]!
      let separation = Math.abs(a.lon - b.lon)
      if (separation > 180) separation = 360 - separation
      for (const spec of ASPECT_SPECS) {
        const orb = Math.abs(separation - spec.angle)
        if (orb <= spec.orb)
          aspects.push({ a: a.key, b: b.key, type: spec.type, angle: separation, orb })
      }
    }
  }
  aspects.sort((a, b) => a.orb - b.orb)

  const elements: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 }
  const modes: Record<Mode, number> = { cardinal: 0, fixed: 0, mutable: 0 }
  for (const body of bodies) {
    elements[ELEMENT_BY_SIGN[body.sign]!] += 1
    modes[MODE_BY_SIGN[body.sign]!] += 1
  }

  const phaseAngle = MoonPhase(utc)
  const illumination = (1 - Math.cos(phaseAngle * RAD)) / 2
  const phaseIndex = Math.round(phaseAngle / 45) % 8

  return {
    timeKnown,
    localTime: reading.clock,
    localLabel: `${reading.date} ${reading.clock} (${tz})`,
    utcLabel: `${utc.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    offsetLabel: formatOffset(offsetMinutes),
    bodies,
    ascendant: ascLon === null ? null : signAngle(ascLon),
    midheaven: mcLon === null ? null : signAngle(mcLon),
    houses:
      ascSign === null
        ? null
        : Array.from({ length: 12 }, (_, i) => ({
            index: i + 1,
            sign: (ascSign + i) % 12,
          })),
    aspects,
    elements,
    modes,
    moon: {
      angle: phaseAngle,
      name: PHASE_NAMES[phaseIndex]!,
      illumination,
    },
    warnings,
  }
}

export function placementOf(chart: Chart, key: BodyKey): Placement {
  return chart.bodies.find((body) => body.key === key)!
}
