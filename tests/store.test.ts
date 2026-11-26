import { afterEach, beforeEach, expect, test } from 'bun:test'
import type { Profile, ProfileInput, Session } from '../src/shared/types'
import { localProfiles, persistProfile } from '../src/client/store'

const signedIn: Session = {
  user: { sub: 'alice' },
  mode: 'freebuff',
  database: true,
}
const guest: Session = { user: null, mode: 'freebuff', database: true }

const input: ProfileInput = {
  label: 'First chart',
  birthDate: '1990-05-17',
  birthTime: '14:30',
  timeKnown: true,
  placeLabel: 'New York, United States',
  lat: 40.7128,
  lon: -74.006,
  tz: 'America/New_York',
}

let rows: Profile[] = []
let calls: { method: string; url: string }[] = []
let counter = 0

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const realFetch = globalThis.fetch

beforeEach(() => {
  rows = []
  calls = []
  counter = 0
  const memory = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }
  // A stand-in for the profile API: POST appends, PATCH replaces in place.
  globalThis.fetch = (async (raw: string | URL | Request, init?: RequestInit) => {
    const url = String(raw)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ method, url })
    if (!url.startsWith('/api/profiles')) return json({ error: 'unexpected request' }, 500)
    const body = () => JSON.parse(String(init?.body)) as ProfileInput
    if (method === 'GET') return json({ profiles: rows })
    if (method === 'POST') {
      counter += 1
      const profile: Profile = {
        ...body(),
        id: `profile-${counter}`,
        createdAt: counter,
        updatedAt: counter,
      }
      rows = [profile, ...rows]
      return json({ profile }, 201)
    }
    const id = url.split('/').pop()!
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) return json({ error: 'not found' }, 404)
    if (method === 'PATCH') {
      rows[index] = { ...rows[index]!, ...body(), updatedAt: 99 }
      return json({ profile: rows[index] })
    }
    if (method === 'DELETE') {
      rows.splice(index, 1)
      return json({ ok: true })
    }
    return json({ error: 'unexpected method' }, 405)
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('editing a saved chart updates it instead of adding a second profile', async () => {
  const created = await persistProfile(input, null, signedIn)
  expect(rows).toHaveLength(1)

  const edited = await persistProfile({ ...input, label: 'Edited chart' }, created, signedIn)

  expect(edited.id).toBe(created.id)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ id: created.id, label: 'Edited chart' })
  expect(calls.map((call) => call.method)).toEqual(['POST', 'PATCH'])
  expect(calls[1]!.url).toBe(`/api/profiles/${created.id}`)
})

test('editing a chart kept on this device also leaves one copy', async () => {
  const created = await persistProfile(input, null, guest)
  const edited = await persistProfile(
    { ...input, label: 'Edited on device' },
    created,
    guest,
  )

  expect(edited.id).toBe(created.id)
  expect(localProfiles()).toHaveLength(1)
  expect(localProfiles()[0]).toMatchObject({ id: created.id, label: 'Edited on device' })
  expect(calls).toHaveLength(0)
})
