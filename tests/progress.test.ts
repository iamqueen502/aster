import { afterEach, beforeEach, expect, test } from 'bun:test'
import type { ProgressState, Session } from '../src/shared/types'
import { loadProgress, saveProgress } from '../src/client/store'

const signedIn: Session = {
  user: { sub: 'alice' },
  mode: 'freebuff',
  database: true,
}
const guest: Session = { user: null, mode: 'freebuff', database: true }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const realFetch = globalThis.fetch
/** What the account holds, and whether this device can reach it. */
let server: ProgressState | null
let offline: boolean
/** The bodies the account actually accepted. */
let accepted: ProgressState[]

beforeEach(() => {
  server = null
  offline = true
  accepted = []
  const memory = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }
  globalThis.fetch = (async (raw: string | URL | Request, init?: RequestInit) => {
    if (offline) throw new TypeError('Network connection lost.')
    const url = String(raw)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url !== '/api/progress') return json({ error: 'unexpected request' }, 500)
    if (method === 'PUT') {
      const sent = (JSON.parse(String(init?.body)) as { progress: ProgressState }).progress
      accepted.push(sent)
      server = sent
      return json({ progress: sent })
    }
    return json({ progress: server ?? { lessons: {} } })
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('a signed-in save that fails reaches the account on the next load', async () => {
  const step: ProgressState = { lessons: { signs: { step: 2, done: false } } }
  await saveProgress(step, signedIn)
  expect(accepted).toHaveLength(0)
  expect(server).toBeNull()

  offline = false
  const loaded = await loadProgress(signedIn)

  expect(loaded.lessons.signs).toEqual({ step: 2, done: false })
  expect(server?.lessons.signs).toEqual({ step: 2, done: false })
  expect(accepted).toHaveLength(1)

  // The retry is not repeated once the account has it.
  await loadProgress(signedIn)
  expect(accepted).toHaveLength(1)
})

test('a step that fails twice still shows and is sent by the next save', async () => {
  const signs: ProgressState = { lessons: { signs: { step: 2, done: false } } }
  await saveProgress(signs, signedIn)

  // Still offline: the load has to fall back without hiding the step.
  const loaded = await loadProgress(signedIn)
  expect(loaded.lessons.signs).toEqual({ step: 2, done: false })

  offline = false
  // The next step is saved on its own, without repeating the earlier one, and
  // the unsent signs step still reaches the account with it.
  await saveProgress({ lessons: { houses: { step: 1, done: false } } }, signedIn)

  expect(accepted).toHaveLength(1)
  expect(accepted[0]!.lessons.signs).toEqual({ step: 2, done: false })
  expect(accepted[0]!.lessons.houses).toEqual({ step: 1, done: false })
})

test('guests keep progress on the device and never queue a write', async () => {
  const step: ProgressState = { lessons: { signs: { step: 3, done: true } } }
  await saveProgress(step, guest)
  offline = false

  expect(await loadProgress(guest)).toEqual(step)
  expect(accepted).toHaveLength(0)
  expect(server).toBeNull()
})
