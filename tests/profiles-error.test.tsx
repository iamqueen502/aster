import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { Profile, Session } from '../src/shared/types'

// The point of these checks is what a signed-in reader sees when the account
// request fails, so they run against the rendered pages.
GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { ProfilesPage, ReadingPage } = await import('../src/client/pages')

const signedIn: Session = { user: { sub: 'alice' }, mode: 'freebuff', database: true }

const saved: Profile = {
  id: 'chart-1',
  label: 'Lisbon, 1990',
  birthDate: '1990-05-17',
  birthTime: '14:30',
  timeKnown: true,
  placeLabel: 'Lisbon, Portugal',
  lat: 38.72,
  lon: -9.14,
  tz: 'Europe/Lisbon',
  createdAt: 1,
  updatedAt: 1,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let realFetch: typeof fetch
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let failures: number

beforeEach(() => {
  // The first chart-list request fails; a retry reaches the account.
  failures = 1
  realFetch = globalThis.fetch
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = String(raw)
    if (url.startsWith('/api/profiles')) {
      if (failures > 0) {
        failures -= 1
        return json({ error: 'Service unavailable.' }, 503)
      }
      return json({ profiles: [saved] })
    }
    if (url === '/api/progress') return json({ progress: { lessons: {} } })
    throw new Error(`unexpected request ${url}`)
  }) as unknown as typeof fetch

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  globalThis.fetch = realFetch
})

afterAll(async () => {
  await GlobalRegistrator.unregister()
})

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const text = () => container.textContent!.replace(/\s+/g, ' ')

const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
  )

test('a charts list that fails says so and retries instead of showing an empty account', async () => {
  await act(async () => {
    root.render(<ProfilesPage session={signedIn} />)
  })
  await flush()

  expect(text()).toContain('Could not load your charts')
  expect(text()).not.toContain('No charts yet')
  expect(button('Try again')).toBeDefined()

  act(() => button('Try again')!.click())
  await flush()
  await flush()

  expect(text()).toContain('Lisbon, 1990')
  expect(text()).not.toContain('Could not load your charts')
  expect(text()).not.toContain('No charts yet')
})

test('a chart that fails to load says so and retries into the chart', async () => {
  await act(async () => {
    root.render(<ReadingPage id={saved.id} session={signedIn} />)
  })
  await flush()

  expect(text()).toContain('Could not load this chart')
  expect(text()).not.toContain('That chart is not in your profiles')
  expect(button('Try again')).toBeDefined()

  act(() => button('Try again')!.click())
  await flush()
  await flush()

  expect(text()).toContain('Lisbon, 1990')
  expect(text()).toContain('The chart')
  expect(text()).not.toContain('Could not load this chart')
})
