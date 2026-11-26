import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Miniflare } from 'miniflare'
import { createApp } from '../src/worker/app'
import { currentUser, type Env } from '../src/worker/auth'

const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: 'test-db',
        compatibilityDate: '2026-11-11',
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': {
              type: 'esm',
              contents:
                'export default { fetch() { return new Response("test") } }',
            },
          },
        },
        env: { DB: { type: 'd1', name: 'aster-test' } },
      },
    },
  ],
  port: 0,
})
let env: Env
beforeAll(async () => {
  const db = await runtime.getD1Database('DB')
  env = {
    DB: db as unknown as D1Database,
    APP_ORIGIN: 'https://app.example.test',
    ASSETS: {
      fetch: async () => new Response('public page'),
    } as unknown as Fetcher,
  }
}, 20_000)
afterAll(() => runtime.dispose())

// This identity seam exists only in the app factory. The Worker entrypoint
// never reads these test headers and always calls the real auth SDK.
const app = createApp(async (request) => {
  const sub = request.headers.get('test-user')
  return sub ? { sub } : null
})
const call = (
  path: string,
  user?: string,
  method = 'GET',
  body?: unknown,
  origin = env.APP_ORIGIN!,
) =>
  app.request(
    `https://app.example.test${path}`,
    {
      method,
      headers: {
        ...(user ? { 'test-user': user } : {}),
        Origin: origin,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  )

const chart = {
  label: 'My chart',
  birthDate: '1990-05-17',
  birthTime: '14:30',
  timeKnown: true,
  placeLabel: 'New York, United States',
  lat: 40.7128,
  lon: -74.006,
  tz: 'America/New_York',
}

test('private routes refuse signed-out requests while public pages stay public', async () => {
  for (const [path, method] of [
    ['/api/profiles', 'GET'],
    ['/api/profiles', 'POST'],
    ['/api/profiles/absent', 'PATCH'],
    ['/api/profiles/absent', 'DELETE'],
    ['/api/progress', 'GET'],
    ['/api/progress', 'PUT'],
  ]) {
    const response = await call(path!, undefined, method)
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  }
  expect(await (await call('/')).text()).toBe('public page')
  expect((await call('/api/health')).status).toBe(200)
})

test('a saved chart is only visible to its owner', async () => {
  const created = await call('/api/profiles', 'alice', 'POST', chart)
  expect(created.status).toBe(201)
  const { profile } = (await created.json()) as {
    profile: { id: string; label: string; timeKnown: boolean }
  }
  expect(profile.label).toBe('My chart')
  expect(profile.timeKnown).toBe(true)

  const mine = (await (await call('/api/profiles', 'alice')).json()) as {
    profiles: unknown[]
  }
  const theirs = (await (await call('/api/profiles', 'bob')).json()) as {
    profiles: unknown[]
  }
  expect(mine.profiles).toHaveLength(1)
  expect(theirs.profiles).toHaveLength(0)

  expect(
    (
      await call(`/api/profiles/${profile.id}`, 'bob', 'PATCH', {
        ...chart,
        label: 'Taken over',
      })
    ).status,
  ).toBe(404)
  expect((await call(`/api/profiles/${profile.id}`, 'bob', 'DELETE')).status).toBe(404)

  const renamed = await call(`/api/profiles/${profile.id}`, 'alice', 'PATCH', {
    ...chart,
    label: 'Renamed',
  })
  expect(await renamed.json()).toMatchObject({ profile: { label: 'Renamed' } })

  // An edit must never leave a second copy behind.
  const listed = (await (await call('/api/profiles', 'alice')).json()) as {
    profiles: { id: string; label: string }[]
  }
  expect(listed.profiles).toHaveLength(1)
  expect(listed.profiles[0]!.id).toBe(profile.id)
  expect(listed.profiles[0]!.label).toBe('Renamed')
  expect((await call(`/api/profiles/${profile.id}`, 'alice', 'DELETE')).status).toBe(200)
  expect(
    ((await (await call('/api/profiles', 'alice')).json()) as { profiles: unknown[] })
      .profiles,
  ).toHaveLength(0)
})

test('lesson progress round-trips per account and per chart', async () => {
  const chartKey = 'd6f54b4d-e5c9-4f35-a086-6734eefbf9c2/houses'
  const saved = await call('/api/progress', 'alice', 'PUT', {
    progress: {
      lessons: { signs: { step: 2, done: false }, [chartKey]: { step: 3, done: true } },
    },
  })
  expect(saved.status).toBe(200)
  const mine = (await (await call('/api/progress', 'alice')).json()) as {
    progress: { lessons: Record<string, { step: number; done: boolean }> }
  }
  expect(mine.progress.lessons.signs).toEqual({ step: 2, done: false })
  expect(mine.progress.lessons[chartKey]).toEqual({ step: 3, done: true })
  const theirs = (await (await call('/api/progress', 'bob')).json()) as {
    progress: { lessons: Record<string, unknown> }
  }
  expect(theirs.progress.lessons).toEqual({})
})

test('refuses foreign origins, invented fields and impossible birth data', async () => {
  expect(
    (
      await call(
        '/api/profiles',
        'alice',
        'POST',
        chart,
        'https://foreign.example',
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await app.request(
        'https://app.example.test/api/profiles',
        { method: 'POST', headers: { 'test-user': 'alice' } },
        env,
      )
    ).status,
  ).toBe(403)

  for (const body of [
    { ...chart, label: '' },
    { ...chart, ownerSub: 'bob' },
    { ...chart, birthDate: '1990-02-31' },
    { ...chart, birthDate: '2999-01-01' },
    { ...chart, timeKnown: true, birthTime: '' },
    { ...chart, lat: 91 },
    { ...chart, lon: -181 },
    { ...chart, tz: '' },
    [],
    null,
  ]) {
    expect((await call('/api/profiles', 'alice', 'POST', body)).status).toBe(400)
  }

  expect(
    (await call('/api/profiles', 'alice', 'POST', { ...chart, label: 'x'.repeat(40_000) }))
      .status,
  ).toBe(413)

  expect((await call('/api/places?q=a')).status).toBe(400)
})

test('missing database reports setup and the local identity never activates on hosted origins', async () => {
  const noDb = await app.request(
    'https://app.example.test/api/profiles',
    { headers: { 'test-user': 'alice' } },
    { ...env, DB: undefined },
  )
  expect(noDb.status).toBe(503)
  expect(
    await currentUser(new Request('https://app.example.test/'), {} as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {
      APP_ORIGIN: 'https://app.example.test',
    } as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {} as Env),
  ).toMatchObject({ sub: 'local-preview' })
})
