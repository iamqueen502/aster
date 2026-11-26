import { isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffUser } from '@freebuff/auth'
import { Hono, type Handler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { appOrigin, currentUser, isLocalPreview, type Env } from './auth'
import {
  ensureSchema,
  mapProfile,
  parseProgress,
  type ProfileRow,
} from './db'
import { searchPlaces } from './places'
import type { ProfileInput, ProgressState } from '../shared/types'

type AppContext = {
  Bindings: Env
  Variables: { user: FreebuffUser; db: D1Database }
}
type Authenticate = (request: Request, env: Env) => Promise<FreebuffUser | null>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const TZ = /^[A-Za-z0-9_+\-/]{1,64}$/
const PROFILE_FIELDS = new Set([
  'label',
  'birthDate',
  'birthTime',
  'timeKnown',
  'placeLabel',
  'lat',
  'lon',
  'tz',
])

/** Validates and normalizes a profile body. Returns a message on failure. */
export function parseProfileInput(body: unknown): ProfileInput | string {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return 'Send the birth details as a JSON object.'
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record))
    if (!PROFILE_FIELDS.has(key)) return `Unexpected field “${key}”.`

  const label = typeof record.label === 'string' ? record.label.trim() : ''
  if (!label || label.length > 80) return 'Give this chart a name of 1 to 80 characters.'

  const birthDate = typeof record.birthDate === 'string' ? record.birthDate : ''
  if (!DATE.test(birthDate)) return 'Choose a birth date.'
  const [year, month, day] = birthDate.split('-').map(Number)
  const asDate = new Date(Date.UTC(year!, month! - 1, day!))
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month! - 1 ||
    asDate.getUTCDate() !== day ||
    year! < 1800 ||
    asDate.getTime() > Date.now()
  )
    return 'That birth date is not a real date in the past.'

  if (typeof record.timeKnown !== 'boolean') return 'Say whether the birth time is known.'
  const timeKnown = record.timeKnown
  const birthTime = typeof record.birthTime === 'string' ? record.birthTime : ''
  if (timeKnown && !TIME.test(birthTime)) return 'Enter a birth time as HH:MM.'
  if (!timeKnown && birthTime !== '' && !TIME.test(birthTime))
    return 'Enter a birth time as HH:MM, or leave it empty.'

  const placeLabel =
    typeof record.placeLabel === 'string' ? record.placeLabel.trim() : ''
  if (!placeLabel || placeLabel.length > 120) return 'Choose a birth place.'

  const lat = record.lat
  const lon = record.lon
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90)
    return 'Latitude must be between −90 and 90.'
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180)
    return 'Longitude must be between −180 and 180.'

  const tz = typeof record.tz === 'string' ? record.tz : ''
  if (!TZ.test(tz)) return 'That time zone is not valid.'

  return {
    label,
    birthDate,
    birthTime: timeKnown ? birthTime : '',
    timeKnown,
    placeLabel,
    lat,
    lon,
    tz,
  }
}

export function parseProgressBody(body: unknown): ProgressState | string {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return 'Send progress as a JSON object.'
  const record = body as Record<string, unknown>
  const raw = record.progress
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return 'Progress must contain a lessons object.'
  const entries = (raw as Record<string, unknown>).lessons
  if (!entries || typeof entries !== 'object' || Array.isArray(entries))
    return 'Progress must contain a lessons object.'
  const lessons: ProgressState['lessons'] = {}
  let count = 0
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    // Keys are `<chart id>/<lesson id>`, so they may carry a slash and a UUID.
    if (!/^[a-z0-9/:_-]{1,48}$/.test(key)) continue
    if (count >= 200) break
    count += 1
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const step = Number(entry.step)
    if (!Number.isInteger(step) || step < 0 || step > 40) continue
    lessons[key] = { step, done: entry.done === true }
  }
  return { lessons }
}

/** Tests inject identities; production always uses the Freebuff SDK. */
export function createApp(authenticate: Authenticate = currentUser) {
  const app = new Hono<AppContext>()
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    await next()
  })
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) => c.json({ error: 'Request is too large.' }, 413),
    }),
  )
  app.get('/api/session', async (c) =>
    c.json({
      user: await authenticate(c.req.raw, c.env),
      mode: isLocalPreview(c.req.raw, c.env)
        ? 'local'
        : c.env.FREEBUFF_CLIENT_ID && c.env.APP_ORIGIN
          ? 'freebuff'
          : 'setup',
      database: Boolean(c.env.DB),
    }),
  )

  app.get('/api/places', async (c) => {
    const query = (c.req.query('q') ?? '').trim()
    if (query.length < 2 || query.length > 80)
      return c.json({ error: 'Type at least two characters of a place name.' }, 400)
    try {
      return c.json({ places: await searchPlaces(query) })
    } catch {
      return c.json(
        { error: 'Place search is unavailable right now. You can enter coordinates instead.' },
        502,
      )
    }
  })

  app.use('/api/profiles/*', async (c, next) => {
    const user = await authenticate(c.req.raw, c.env)
    if (!user) return c.json({ error: 'Sign in required.' }, 401)
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const origin = appOrigin(c.req.raw, c.env)
      if (!origin || !isSameOriginRequest(c.req.raw, origin))
        return c.json({ error: 'Cross-origin request refused.' }, 403)
    }
    if (!c.env.DB)
      return c.json(
        { error: 'This app is still being set up. Please try again later.' },
        503,
      )
    await ensureSchema(c.env.DB)
    c.set('user', user)
    c.set('db', c.env.DB)
    await next()
  })

  app.get('/api/profiles', async (c) => {
    const result = await c
      .get('db')
      .prepare(
        'SELECT id, label, birth_date, birth_time, time_known, place_label, lat, lon, tz, created_at, updated_at FROM profiles WHERE owner_sub = ? ORDER BY created_at DESC, id DESC LIMIT 50',
      )
      .bind(c.get('user').sub)
      .all<ProfileRow>()
    return c.json({ profiles: result.results.map(mapProfile) })
  })

  app.post('/api/profiles', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const input = parseProfileInput(body)
    if (typeof input === 'string') return c.json({ error: input }, 400)
    const now = Date.now()
    const profile = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    await c
      .get('db')
      .prepare(
        'INSERT INTO profiles (id, owner_sub, label, birth_date, birth_time, time_known, place_label, lat, lon, tz, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        profile.id,
        c.get('user').sub,
        profile.label,
        profile.birthDate,
        profile.birthTime,
        profile.timeKnown ? 1 : 0,
        profile.placeLabel,
        profile.lat,
        profile.lon,
        profile.tz,
        now,
        now,
      )
      .run()
    return c.json({ profile }, 201)
  })

  const saveProfile: Handler<AppContext> = async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const input = parseProfileInput(body)
    if (typeof input === 'string') return c.json({ error: input }, 400)
    const row = await c
      .get('db')
      .prepare(
        'UPDATE profiles SET label = ?, birth_date = ?, birth_time = ?, time_known = ?, place_label = ?, lat = ?, lon = ?, tz = ?, updated_at = ? WHERE id = ? AND owner_sub = ? RETURNING id, label, birth_date, birth_time, time_known, place_label, lat, lon, tz, created_at, updated_at',
      )
      .bind(
        input.label,
        input.birthDate,
        input.birthTime,
        input.timeKnown ? 1 : 0,
        input.placeLabel,
        input.lat,
        input.lon,
        input.tz,
        Date.now(),
        c.req.param('id'),
        c.get('user').sub,
      )
      .first<ProfileRow>()
    return row
      ? c.json({ profile: mapProfile(row) })
      : c.json({ error: 'That chart is not in your profiles.' }, 404)
  }
  app.patch('/api/profiles/:id', saveProfile)

  app.delete('/api/profiles/:id', async (c) => {
    const removed = await c
      .get('db')
      .prepare('DELETE FROM profiles WHERE id = ? AND owner_sub = ? RETURNING id')
      .bind(c.req.param('id'), c.get('user').sub)
      .first()
    return removed
      ? c.json({ ok: true })
      : c.json({ error: 'That chart is not in your profiles.' }, 404)
  })

  app.use('/api/progress', async (c, next) => {
    const user = await authenticate(c.req.raw, c.env)
    if (!user) return c.json({ error: 'Sign in required.' }, 401)
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = appOrigin(c.req.raw, c.env)
      if (!origin || !isSameOriginRequest(c.req.raw, origin))
        return c.json({ error: 'Cross-origin request refused.' }, 403)
    }
    if (!c.env.DB)
      return c.json(
        { error: 'This app is still being set up. Please try again later.' },
        503,
      )
    await ensureSchema(c.env.DB)
    c.set('user', user)
    c.set('db', c.env.DB)
    await next()
  })

  app.get('/api/progress', async (c) => {
    const row = await c
      .get('db')
      .prepare('SELECT data FROM progress WHERE owner_sub = ?')
      .bind(c.get('user').sub)
      .first<{ data: string }>()
    return c.json({ progress: parseProgress(row?.data) })
  })

  app.put('/api/progress', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const progress = parseProgressBody(body)
    if (typeof progress === 'string') return c.json({ error: progress }, 400)
    const data = JSON.stringify(progress)
    if (data.length > 16_000) return c.json({ error: 'Progress is too large.' }, 413)
    await c
      .get('db')
      .prepare(
        'INSERT INTO progress (owner_sub, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_sub) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      )
      .bind(c.get('user').sub, data, Date.now())
      .run()
    return c.json({ progress })
  })

  app.notFound((c) =>
    c.req.path === '/api' || c.req.path.startsWith('/api/')
      ? c.json({ error: 'Endpoint not found.' }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  app.onError((_error, c) =>
    c.json({ error: 'Something went wrong. Please try again.' }, 500),
  )
  return app
}
