import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { Profile, Session } from '../src/shared/types'

// These assertions are about what a reader actually sees, so they run against
// the rendered page rather than the chart object. Globals are registered before
// React loads so react-dom sees the DOM.
GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { ReadingPage } = await import('../src/client/pages')

const signedIn: Session = { user: { sub: 'alice' }, mode: 'freebuff', database: true }

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })

let realFetch: typeof fetch
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let loaded: Profile

const chartProfile = (
  over: Pick<Profile, 'birthDate' | 'birthTime' | 'tz' | 'lat' | 'lon'>,
): Profile => ({
  id: 'chart-1',
  label: 'Test chart',
  timeKnown: true,
  placeLabel: 'Test place',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

beforeEach(() => {
  realFetch = globalThis.fetch
  // The page loads the profile by id from the account, then its progress.
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = String(raw)
    if (url.startsWith('/api/profiles')) return json({ profiles: [loaded] })
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

const liveRegion = () => container.querySelector<HTMLElement>('[aria-live="polite"]')

/** Renders the reading page and returns its visible text, whitespace collapsed. */
async function renderChart(profile: Profile): Promise<string> {
  loaded = profile
  await act(async () => {
    root.render(<ReadingPage id={profile.id} session={signedIn} />)
  })
  await flush()
  await flush()
  return container.textContent!.replace(/\s+/g, ' ')
}

test('a repeated birth reading warns in the chart and keeps the arithmetic in step', async () => {
  const text = await renderChart(
    chartProfile({
      birthDate: '2024-11-03',
      birthTime: '01:30',
      tz: 'America/New_York',
      lat: 40.7128,
      lon: -74.006,
    }),
  )

  // The warning names both instants, not just the one that was chosen.
  expect(text).toContain('The clock read 01:30 twice on 2024-11-03 in America/New_York')
  expect(text).toContain(
    'This chart uses the first occurrence, UTC−04:00; the repeat at UTC−05:00 would move the Ascendant and the Moon.',
  )

  // A screen reader gets the same warning through a polite live region.
  const live = liveRegion()
  expect(live).not.toBeNull()
  expect(live!.getAttribute('aria-atomic')).toBe('true')
  expect(live!.textContent).toContain('The clock read 01:30 twice on 2024-11-03 in America/New_York')
  expect(live!.textContent).toContain('This chart uses the first occurrence, UTC−04:00')

  // The method panel's worked example is for the instant actually used.
  expect(text).toContain(
    'Birth clock 01:30 in America/New_York was converted to 2024-11-03 05:30 UTC (UTC−04:00)',
  )
  expect(text).toContain('from 2024-11-03 01:30 (America/New_York) (UTC−04:00)')
  expect(text).not.toContain('The clock skipped that reading')
})

test('a birth reading the clock skipped warns in the chart and shows the jumped-to time', async () => {
  const text = await renderChart(
    chartProfile({
      birthDate: '2024-03-10',
      birthTime: '02:30',
      tz: 'America/New_York',
      lat: 40.7128,
      lon: -74.006,
    }),
  )

  expect(text).toContain('The clock skipped 02:30 on 2024-03-10 in America/New_York')
  expect(text).toContain(
    'This chart uses 2024-03-10 03:30 (UTC−04:00), the time the clock jumped to.',
  )

  const live = liveRegion()
  expect(live).not.toBeNull()
  expect(live!.getAttribute('aria-atomic')).toBe('true')
  expect(live!.textContent).toContain('The clock skipped 02:30 on 2024-03-10 in America/New_York')
  expect(live!.textContent).toContain('This chart uses 2024-03-10 03:30 (UTC−04:00)')

  // 02:30 at UTC−04:00 would read 06:30Z; the chart must say 07:30Z and own it.
  expect(text).toContain(
    'Birth clock 02:30 in America/New_York was converted to 2024-03-10 07:30 UTC (UTC−04:00)',
  )
  expect(text).toContain('The clock skipped that reading, so the chart uses 03:30.')
  expect(text).toContain('from 2024-03-10 03:30 (America/New_York) (UTC−04:00)')
})

test('a whole day the clock skipped warns with the date it moved to', async () => {
  const text = await renderChart(
    chartProfile({
      birthDate: '2011-12-30',
      birthTime: '12:00',
      tz: 'Pacific/Apia',
      lat: -13.8333,
      lon: -171.75,
    }),
  )

  // Samoa jumped across the date line: the reading has to name 31 December.
  expect(text).toContain('The clock skipped 12:00 on 2011-12-30 in Pacific/Apia')
  expect(text).toContain(
    'This chart uses 2011-12-31 12:00 (UTC+14:00), the time the clock jumped to.',
  )

  const live = liveRegion()
  expect(live).not.toBeNull()
  expect(live!.getAttribute('aria-atomic')).toBe('true')
  expect(live!.textContent).toContain('The clock skipped 12:00 on 2011-12-30 in Pacific/Apia')
  expect(live!.textContent).toContain('This chart uses 2011-12-31 12:00 (UTC+14:00)')
  expect(text).toContain('from 2011-12-31 12:00 (Pacific/Apia) (UTC+14:00)')
  // The clock reading is unchanged, but the date is not, so the panel must not
  // imply the entered 30 December was the day calculated.
  expect(text).toContain('The clock skipped that reading, so the chart uses 2011-12-31 12:00.')
})
