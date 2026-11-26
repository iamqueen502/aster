import { expect, test } from 'bun:test'
import {
  Body,
  Horizon,
  Observer,
  SearchHourAngle,
  SearchRiseSet,
  SiderealTime,
  SunPosition,
} from 'astronomy-engine'
import { computeChart, localToUtc, midheavenLongitude } from '../src/shared/astro'
import { SAMPLE_PROFILE } from '../src/shared/sample'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

const angleBetween = (a: number, b: number) => {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}

function obliquity(jd: number) {
  const t = (jd - 2451545.0) / 36525
  return 23.439291111 - 0.0130041667 * t - 0.00000016389 * t * t + 0.0000005036 * t * t * t
}

const pad = (value: number) => String(value).padStart(2, '0')
const profileAt = (instant: Date, lat: number, lon: number) => ({
  ...SAMPLE_PROFILE,
  birthDate: `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`,
  birthTime: `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}`,
  tz: 'UTC',
  lat,
  lon,
})

test('the Sun is in Taurus on 17 May 1990', () => {
  const chart = computeChart(SAMPLE_PROFILE)
  const sun = chart.bodies.find((body) => body.key === 'sun')!
  expect(sun.sign).toBe(1)
  expect(sun.degree).toBeGreaterThan(20)
  expect(chart.bodies).toHaveLength(10)
  for (const body of chart.bodies) {
    expect(body.lon).toBeGreaterThanOrEqual(0)
    expect(body.lon).toBeLessThan(360)
  }
})

test('a local clock time converts through the zone’s real daylight-saving rules', () => {
  const summer = localToUtc('1990-05-17', '14:30', 'America/New_York')
  expect(summer.utc.toISOString()).toBe('1990-05-17T18:30:00.000Z')
  expect(summer.offsetMinutes).toBe(-240)
  expect(summer.kind).toBe('unique')

  const winter = localToUtc('1990-01-15', '12:00', 'America/New_York')
  expect(winter.utc.toISOString()).toBe('1990-01-15T17:00:00.000Z')
  expect(winter.offsetMinutes).toBe(-300)

  const lisbon = localToUtc('2024-07-01', '09:00', 'Europe/Lisbon')
  expect(lisbon.utc.toISOString()).toBe('2024-07-01T08:00:00.000Z')
})

test('a clock time that happened twice resolves to its first occurrence and says so', () => {
  const repeated = localToUtc('2024-11-03', '01:30', 'America/New_York')
  expect(repeated.kind).toBe('ambiguous')
  expect(repeated.utc.toISOString()).toBe('2024-11-03T05:30:00.000Z')
  expect(repeated.offsetMinutes).toBe(-240)
  expect(repeated.other!.utc.toISOString()).toBe('2024-11-03T06:30:00.000Z')
  expect(repeated.other!.offsetMinutes).toBe(-300)

  const chart = computeChart({
    ...SAMPLE_PROFILE,
    birthDate: '2024-11-03',
    birthTime: '01:30',
    tz: 'America/New_York',
  })
  expect(chart.localTime).toBe('01:30')
  expect(chart.warnings.join(' ')).toContain('twice on 2024-11-03')
  expect(chart.warnings.join(' ')).toContain('first occurrence')
  expect(chart.offsetLabel).toBe('UTC−04:00')
})

test('a clock time the clock skipped moves to the time it jumped to and says so', () => {
  const skipped = localToUtc('2024-03-10', '02:30', 'America/New_York')
  expect(skipped.kind).toBe('nonexistent')
  expect(skipped.utc.toISOString()).toBe('2024-03-10T07:30:00.000Z')
  expect(skipped.offsetMinutes).toBe(-240)

  const chart = computeChart({
    ...SAMPLE_PROFILE,
    birthDate: '2024-03-10',
    birthTime: '02:30',
    tz: 'America/New_York',
  })
  expect(chart.localTime).toBe('03:30')
  expect(chart.warnings.join(' ')).toContain('skipped 02:30')
  expect(chart.localLabel).toContain('03:30')
  expect(chart.offsetLabel).toBe('UTC−04:00')
})

test('half-hour and whole-day clock changes follow the same rule', () => {
  const midnight = localToUtc('2018-11-04', '00:30', 'America/Sao_Paulo')
  expect(midnight.kind).toBe('nonexistent')
  expect(midnight.utc.toISOString()).toBe('2018-11-04T03:30:00.000Z')
  expect(midnight.offsetMinutes).toBe(-120)

  const halfHour = localToUtc('2024-04-07', '01:45', 'Australia/Lord_Howe')
  expect(halfHour.kind).toBe('ambiguous')
  expect(halfHour.utc.toISOString()).toBe('2024-04-06T14:45:00.000Z')
  expect(halfHour.offsetMinutes).toBe(660)
  expect(halfHour.other!.utc.toISOString()).toBe('2024-04-06T15:15:00.000Z')
  expect(halfHour.other!.offsetMinutes).toBe(630)

  // Samoa skipped 30 December 2011 entirely when it crossed the date line,
  // so the reading has to move to the next day, not just the next hour.
  const skippedDay = localToUtc('2011-12-30', '12:00', 'Pacific/Apia')
  expect(skippedDay.kind).toBe('nonexistent')
  expect(skippedDay.utc.toISOString()).toBe('2011-12-30T22:00:00.000Z')
  expect(skippedDay.offsetMinutes).toBe(840)
  const samoa = computeChart({
    ...SAMPLE_PROFILE,
    birthDate: '2011-12-30',
    birthTime: '12:00',
    tz: 'Pacific/Apia',
    lat: -13.85,
    lon: -171.75,
  })
  expect(samoa.localLabel).toContain('2011-12-31 12:00')
  expect(samoa.warnings.join(' ')).toContain('skipped 12:00')
})

test('the Ascendant lies on the eastern horizon', () => {
  const chart = computeChart(SAMPLE_PROFILE)
  const { utc } = localToUtc(
    SAMPLE_PROFILE.birthDate,
    SAMPLE_PROFILE.birthTime,
    SAMPLE_PROFILE.tz,
  )
  const jd = utc.getTime() / 86_400_000 + 2440587.5
  const eps = obliquity(jd) * RAD
  const lambda = chart.ascendant!.lon * RAD
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * DEG
  const ra = (((Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * 12) / Math.PI) + 24) % 24

  // Independent check through the ephemeris library's own horizon rotation.
  // Omitted refraction: this is a geometric check, not an observed one.
  const horizon = Horizon(
    utc,
    new Observer(SAMPLE_PROFILE.lat, SAMPLE_PROFILE.lon, 0),
    ra,
    dec,
  )
  expect(Math.abs(horizon.altitude)).toBeLessThan(0.05)
  // Rising, not setting: east half of the sky.
  expect(horizon.azimuth).toBeGreaterThan(0)
  expect(horizon.azimuth).toBeLessThan(180)
})

/** At upper transit the meridian holds the Sun's own ecliptic degree. */
const transitOfSun = () => {
  const observer = new Observer(40.7128, -74.006, 0)
  const transit = SearchHourAngle(Body.Sun, observer, 0, new Date('2024-06-01T00:00:00Z'), +1)
  return transit.time.date
}

test('the Midheaven is the ecliptic degree on the meridian', () => {
  const instant = transitOfSun()
  const jd = instant.getTime() / 86_400_000 + 2440587.5
  const ramc = (SiderealTime(instant) * 15 - 74.006 + 720) % 360
  const mc = midheavenLongitude(ramc, obliquity(jd))
  expect(angleBetween(mc, SunPosition(instant).elon)).toBeLessThan(0.05)
})

test('a stored chart places that same Midheaven to the minute it keeps', () => {
  const instant = transitOfSun()
  const chart = computeChart(profileAt(instant, 40.7128, -74.006))
  const sun = chart.bodies.find((body) => body.key === 'sun')!
  // A chart stores HH:MM, so the wheel is up to half a minute — 0.13° — away.
  expect(chart.midheaven).not.toBeNull()
  expect(angleBetween(chart.midheaven!.lon, sun.lon)).toBeLessThan(0.3)
})

test('the Ascendant agrees with the Sun near sunrise', () => {
  const observer = new Observer(40.7128, -74.006, 10)
  const sunrise = SearchRiseSet(Body.Sun, observer, +1, new Date('2024-03-20T00:00:00Z'), 2)
  expect(sunrise).not.toBeNull()
  const chart = computeChart(profileAt(sunrise!.date, 40.7128, -74.006))
  const sun = chart.bodies.find((body) => body.key === 'sun')!
  // Sunrise is the upper limb with refraction, so the Sun's centre is about
  // 0.83° below the horizon; the ecliptic meets the horizon at a slant, which
  // adds up to a couple of degrees on the wheel.
  expect(angleBetween(chart.ascendant!.lon, sun.lon)).toBeLessThan(3)
})

test('whole-sign houses count from the rising sign', () => {
  const chart = computeChart(SAMPLE_PROFILE)
  const asc = chart.ascendant!
  expect(chart.houses).toHaveLength(12)
  expect(chart.houses![0]!.sign).toBe(asc.sign)
  expect(chart.houses![11]!.sign).toBe((asc.sign + 11) % 12)
  for (const body of chart.bodies) {
    expect(body.house).toBe(((body.sign - asc.sign + 12) % 12) + 1)
  }
})

test('a missing birth time drops the angles but keeps the Sun and Moon', () => {
  const chart = computeChart({ ...SAMPLE_PROFILE, timeKnown: false, birthTime: '' })
  expect(chart.ascendant).toBeNull()
  expect(chart.midheaven).toBeNull()
  expect(chart.houses).toBeNull()
  expect(chart.bodies.every((body) => body.house === null)).toBe(true)
  expect(chart.bodies.find((body) => body.key === 'sun')!.sign).toBe(1)
  expect(chart.warnings.join(' ')).toContain('No birth time')
  expect(chart.localLabel).toContain('12:00')
})

test('aspects stay inside their orbs and match their angle', () => {
  const expected = { conjunction: 0, opposition: 180, trine: 120, square: 90, sextile: 60 }
  const chart = computeChart(SAMPLE_PROFILE)
  expect(chart.aspects.length).toBeGreaterThan(0)
  for (const aspect of chart.aspects) {
    expect(aspect.orb).toBeGreaterThanOrEqual(0)
    expect(Math.abs(aspect.angle - expected[aspect.type])).toBeCloseTo(aspect.orb, 6)
    expect(aspect.a).not.toBe(aspect.b)
  }
})
