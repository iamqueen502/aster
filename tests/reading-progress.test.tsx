import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { ProgressState, Session } from '../src/shared/types'

// The page reads the saved step in an effect, so this test needs a real DOM.
// The globals are registered before React is loaded so react-dom sees them.
GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { ReadingPage } = await import('../src/client/pages')
const { SAMPLE_PROFILE } = await import('../src/shared/sample')
const { computeChart } = await import('../src/shared/astro')
const { buildLessons } = await import('../src/client/lessons')

const signedIn: Session = { user: { sub: 'alice' }, mode: 'freebuff', database: true }

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })

let realFetch: typeof fetch
let releaseLoad: () => void
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  realFetch = globalThis.fetch
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  releaseLoad = release
  // The account has step 2, but the response is held so the test can open the
  // lesson while the saved progress is still in flight.
  globalThis.fetch = (async (raw: string | URL | Request) => {
    if (String(raw) !== '/api/progress') throw new Error(`unexpected request ${String(raw)}`)
    await gate
    return json({ progress: { lessons: { 'sample/signs': { step: 1, done: false } } } })
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

const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
  )

test('a lesson opened before the saved progress arrives still shows the saved step', async () => {
  const lesson = buildLessons(computeChart(SAMPLE_PROFILE))[0]!
  const saved = lesson.steps[1]!
  expect(saved).toBeDefined()

  await act(async () => {
    root.render(<ReadingPage id={SAMPLE_PROFILE.id} session={signedIn} />)
  })
  await flush()

  // The chart is on screen and the saved progress is still on its way.
  const learnTab = button('Learn')
  expect(learnTab).toBeDefined()
  act(() => learnTab!.click())

  // Opening Learn must wait for the step rather than mounting the player at
  // step 1, which would then stay there once the response arrived.
  expect(container.textContent).toContain('Loading your progress…')
  expect(container.textContent).not.toMatch(/Step \d of \d/)

  releaseLoad()
  await flush()

  expect(container.textContent).toContain(`Step 2 of ${lesson.steps.length}`)
  expect(container.textContent).toContain(saved.kind === 'ask' ? saved.prompt : saved.title)
})
