/**
 * Boots the built worker under workerd (via Miniflare) with the same asset and
 * D1 bindings it gets when deployed, then exercises the paths that the unit
 * tests cannot reach: the real export default fetch, @freebuff/auth's routes,
 * the session cookie, and D1 persistence.
 *
 * Sign-in is run end to end against a local stand-in OpenID provider that
 * implements discovery, authorization + PKCE, token and revocation. It mints
 * RS256 tokens with a throwaway key, which is enough to prove that this app's
 * wiring is correct; it is not a test of Freebuff's own issuer.
 *
 * Run after a build:  bun run build && bun run smoke:worker
 */
import { createSign, generateKeyPairSync, randomBytes, createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'

const workerPath = fileURLToPath(new URL('../dist/web_app/index.js', import.meta.url))
const assetsPath = fileURLToPath(new URL('../dist/client', import.meta.url))
const CLIENT_ID = 'smoke-client'
const APP_ORIGIN = 'http://localhost:8787'
const COMPATIBILITY_DATE = '2026-11-11'

for (const path of [workerPath, `${assetsPath}/index.html`]) {
  if (!existsSync(path))
    throw new Error(`Missing ${path}. Run \`bun run build\` before the smoke check.`)
}

let passed = 0
function ok(name: string) {
  passed += 1
  console.log(`ok - ${name}`)
}
function fail(name: string, detail: string): never {
  console.error(`not ok - ${name}\n  ${detail}`)
  process.exit(1)
}
function assert(name: string, condition: unknown, detail: string) {
  if (!condition) fail(name, detail)
  ok(name)
}
const eq = (name: string, actual: unknown, expected: unknown) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  assert(name, same, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
const b64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url')

// Miniflare types its dispatch result against the runtime it embeds, so this
// script reads replies structurally instead of via a particular global type.
type DispatchInit = NonNullable<Parameters<Miniflare['dispatchFetch']>[1]>
type Reply = {
  status: number
  headers: { get(name: string): string | null; getSetCookie(): string[] }
  text(): Promise<string>
  json(): Promise<unknown>
}

/** A cookie jar, because the session lives in Set-Cookie and not in JSON. */
class Jar {
  private cookies = new Map<string, string>()
  read(response: Reply) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = raw.split(';')
      const split = pair.indexOf('=')
      const name = pair.slice(0, split).trim()
      const value = pair.slice(split + 1)
      const expired = attributes.some((attribute) => {
        const [key, maxAge] = attribute.trim().split('=')
        return key?.toLowerCase() === 'max-age' && Number(maxAge) <= 0
      })
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    return this
  }
  has(name: string) {
    return this.cookies.has(name)
  }
  get header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

// --- Stand-in OpenID provider ---------------------------------------------

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicJwk = publicKey.export({ format: 'jwk' })
const KID = 'smoke-key'
const SUB = 'smoke-user'

function jwt(header: Record<string, unknown>, payload: Record<string, unknown>) {
  const encoded = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signature = createSign('RSA-SHA256').update(encoded).sign(privateKey)
  return `${encoded}.${b64url(signature)}`
}

const codes = new Map<string, { challenge: string; nonce: string; redirectUri: string }>()
let issuer = ''
let discoveryFetches = 0
let tokenExchanges = 0
let revocations = 0

const issuerServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const json = (body: unknown) =>
      Response.json(body, { headers: { 'cache-control': 'no-store' } })

    if (url.pathname === '/.well-known/openid-configuration') {
      discoveryFetches += 1
      return json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        revocation_endpoint: `${issuer}/revoke`,
        jwks_uri: `${issuer}/jwks`,
      })
    }
    if (url.pathname === '/jwks')
      return json({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })

    if (url.pathname === '/authorize') {
      const state = url.searchParams.get('state') ?? ''
      const challenge = url.searchParams.get('code_challenge') ?? ''
      const redirectUri = url.searchParams.get('redirect_uri') ?? ''
      const nonce = url.searchParams.get('nonce') ?? ''
      if (
        url.searchParams.get('response_type') !== 'code' ||
        url.searchParams.get('client_id') !== CLIENT_ID ||
        url.searchParams.get('code_challenge_method') !== 'S256' ||
        !state ||
        !challenge ||
        !nonce ||
        !redirectUri.startsWith(`${APP_ORIGIN}/auth/freebuff/callback`)
      )
        return new Response('bad authorization request', { status: 400 })
      const code = b64url(randomBytes(24))
      codes.set(code, { challenge, nonce, redirectUri })
      const back = new URL(redirectUri)
      back.searchParams.set('code', code)
      back.searchParams.set('state', state)
      back.searchParams.set('iss', issuer)
      return new Response(null, { status: 303, headers: { location: back.href } })
    }

    if (url.pathname === '/token') {
      const form = new URLSearchParams(await request.text())
      const code = form.get('code') ?? ''
      const stored = codes.get(code)
      if (
        form.get('grant_type') !== 'authorization_code' ||
        form.get('client_id') !== CLIENT_ID ||
        !stored ||
        form.get('redirect_uri') !== stored.redirectUri
      )
        return json({ error: 'invalid_grant' })
      codes.delete(code)
      const verifier = form.get('code_verifier') ?? ''
      const challenge = b64url(createHash('sha256').update(verifier).digest())
      if (challenge !== stored.challenge) return json({ error: 'invalid_grant' })
      tokenExchanges += 1
      const now = Math.floor(Date.now() / 1000)
      return json({
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: `fbrt_${b64url(randomBytes(24))}`,
        id_token: jwt(
          { alg: 'RS256', kid: KID, typ: 'JWT' },
          {
            iss: issuer,
            aud: CLIENT_ID,
            azp: CLIENT_ID,
            sub: SUB,
            iat: now,
            exp: now + 300,
            nonce: stored.nonce,
          },
        ),
        access_token: jwt(
          { alg: 'RS256', kid: KID, typ: 'at+jwt' },
          {
            iss: issuer,
            aud: CLIENT_ID,
            client_id: CLIENT_ID,
            sub: SUB,
            iat: now,
            exp: now + 3600,
            scope: 'openid email profile',
          },
        ),
      })
    }

    if (url.pathname === '/revoke') {
      revocations += 1
      return json({})
    }
    return new Response('not found', { status: 404 })
  },
})
issuer = `http://127.0.0.1:${issuerServer.port}`

// --- The built worker ------------------------------------------------------

const workerSource = readFileSync(workerPath, 'utf8')

/** The deployed shape: built module, dist/client assets, and a real D1 binding. */
function worker(env: Record<string, unknown>) {
  return {
    config: {
      name: 'smoke-app',
      compatibilityDate: COMPATIBILITY_DATE,
      manifest: {
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm' as const, contents: workerSource } },
      },
      assets: {
        directory: assetsPath,
        hasUserWorker: true,
        notFoundHandling: 'single-page-application' as const,
        runWorkerFirst: true,
      },
      // The asset binding the worker calls for anything the API does not own.
      env: { ASSETS: { type: 'assets' as const }, ...env },
    },
  }
}

const deployed = new Miniflare({
  workers: [
    worker({
      DB: { type: 'd1', name: 'smoke-db' },
      APP_ORIGIN: { type: 'text', value: APP_ORIGIN },
      FREEBUFF_CLIENT_ID: { type: 'text', value: CLIENT_ID },
      FREEBUFF_ISSUER: { type: 'text', value: issuer },
    }),
  ],
})

// Miniflare 5 dispatches to the port in the URL, so wait for the workerd
// listener and address it directly. APP_ORIGIN stays the deployed origin the
// worker sees, which is what the CSRF and redirect checks compare against.
const runtimeOrigin = (await deployed.ready).origin

async function request(target: Miniflare, url: string, init: DispatchInit = {}) {
  const headers = { ...(init.headers as Record<string, string> | undefined) }
  if (target === deployed && jar.header) headers.cookie = jar.header
  return (await target.dispatchFetch(url, { ...init, headers, redirect: 'manual' })) as Reply
}

const jar = new Jar()
async function get(path: string, init: DispatchInit = {}) {
  const response = await request(deployed, `${runtimeOrigin}${path}`, init)
  jar.read(response)
  return response
}
const mutation = (path: string, method: string, body: unknown, origin = APP_ORIGIN) =>
  get(path, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

try {
  // Static assets and the SPA fallback, served by workerd from dist/client.
  const home = await get('/')
  const html = await home.text()
  assert('GET / serves the built index.html', home.status === 200 && html.includes('id="root"'), `status ${home.status}: ${html.slice(0, 120)}`)
  assert('GET / is html', (home.headers.get('content-type') ?? '').includes('text/html'), `content-type ${home.headers.get('content-type')}`)

  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  assert('index.html references a hashed bundle', Boolean(script), 'no /assets/*.js in index.html')
  const bundle = await get(script!)
  assert('hashed bundle is served as javascript', bundle.status === 200 && (bundle.headers.get('content-type') ?? '').includes('javascript'), `status ${bundle.status}, content-type ${bundle.headers.get('content-type')}`)

  const deepLink = await get('/r/some-chart-id')
  assert('SPA fallback answers a deep link', deepLink.status === 200 && (await deepLink.text()).includes('id="root"'), `status ${deepLink.status}`)

  // The API surface inside the built worker.
  const health = await get('/api/health')
  eq('GET /api/health', [health.status, await health.json()], [200, { ok: true }])
  const session = await get('/api/session')
  eq('GET /api/session before sign-in', [await session.json(), session.headers.get('cache-control')], [{ user: null, mode: 'freebuff', database: true }, 'private, no-store'])
  eq('signed-out /api/profiles is 401', (await get('/api/profiles')).status, 401)
  eq('unknown /api route is JSON 404', (await get('/api/nope')).status, 404)

  // A forged session cookie must fail closed, not throw.
  const forged = await get('/api/session', {
    headers: { cookie: 'freebuff_session=v1~not.a.jwt~fbrt_forged' },
  })
  eq('forged session cookie yields no user', ((await forged.json()) as { user: unknown }).user, null)

  // Sign-in: the SDK must redirect to the issuer with PKCE and a transaction cookie.
  const signin = await get('/auth/freebuff/signin?returnTo=/r/my-chart')
  const location = new URL(signin.headers.get('location') ?? 'about:blank')
  eq('GET /auth/freebuff/signin is a 303', signin.status, 303)
  assert('sign-in redirects to the configured issuer', location.origin === issuerServer.url.origin && location.pathname === '/authorize', `location ${location.href}`)
  eq('sign-in carries the callback and client', [location.searchParams.get('client_id'), location.searchParams.get('redirect_uri'), location.searchParams.get('code_challenge_method')], [CLIENT_ID, `${APP_ORIGIN}/auth/freebuff/callback`, 'S256'])
  assert('sign-in sets a transaction cookie', jar.has(`freebuff_txn-${location.searchParams.get('state')!.slice(0, 16)}`), 'no txn cookie')

  // The provider approves, and the callback must finish the sign-in.
  const approval = await fetch(location.href, { redirect: 'manual' })
  const callbackUrl = new URL(approval.headers.get('location') ?? 'about:blank')
  assert('provider redirects back to the app callback', callbackUrl.origin === APP_ORIGIN && callbackUrl.pathname === '/auth/freebuff/callback', `location ${callbackUrl.href}`)

  const callback = await get(`${callbackUrl.pathname}${callbackUrl.search}`)
  eq('callback redirects to returnTo', [callback.status, callback.headers.get('location')], [303, '/r/my-chart'])
  assert('callback sets the session cookie', jar.has('freebuff_session'), 'no session cookie')
  eq('one token exchange happened', tokenExchanges, 1)

  const signedIn = await get('/api/session')
  eq('GET /api/session after sign-in', await signedIn.json(), { user: { sub: SUB }, mode: 'freebuff', database: true })
  const sdkSession = await get('/auth/freebuff/session')
  eq('GET /auth/freebuff/session agrees', await sdkSession.json(), { user: { sub: SUB } })

  // D1 through the real worker: create, read back, edit in place, delete.
  const profile = {
    label: 'Smoke chart',
    birthDate: '1990-05-17',
    birthTime: '14:30',
    timeKnown: true,
    placeLabel: 'New York, United States',
    lat: 40.7128,
    lon: -74.006,
    tz: 'America/New_York',
  }
  const created = await mutation('/api/profiles', 'POST', profile)
  const createdBody = (await created.json()) as { profile?: { id: string; label: string } }
  eq('POST /api/profiles persists to D1', [created.status, createdBody.profile?.label], [201, 'Smoke chart'])
  const id = createdBody.profile!.id

  const listed = (await (await get('/api/profiles')).json()) as { profiles: { id: string }[] }
  eq('GET /api/profiles returns the saved chart', listed.profiles.map((entry) => entry.id), [id])

  const renamed = await mutation(`/api/profiles/${id}`, 'PATCH', { ...profile, label: 'Renamed' })
  eq('PATCH /api/profiles edits in place', [renamed.status, ((await renamed.json()) as { profile: { id: string } }).profile.id], [200, id])
  eq('foreign-origin edit is refused', (await mutation(`/api/profiles/${id}`, 'PATCH', profile, 'https://foreign.example')).status, 403)

  const progress = await mutation('/api/progress', 'PUT', { progress: { lessons: { signs: { step: 2, done: false } } } })
  eq('PUT /api/progress persists', progress.status, 200)
  eq('GET /api/progress round-trips', (await (await get('/api/progress')).json() as { progress: unknown }).progress, { lessons: { signs: { step: 2, done: false } } })

  eq('DELETE /api/profiles removes the chart', (await mutation(`/api/profiles/${id}`, 'DELETE', {})).status, 200)
  eq('deleted chart is gone', ((await (await get('/api/profiles')).json()) as { profiles: unknown[] }).profiles.length, 0)

  // Sign-out: cross-origin is refused, then the real one ends the session.
  eq('cross-origin sign-out is refused', (await get('/auth/freebuff/signout', { method: 'POST', headers: { origin: 'https://foreign.example' } })).status, 403)
  const signout = await get('/auth/freebuff/signout', { method: 'POST', headers: { origin: APP_ORIGIN } })
  eq('same-origin sign-out redirects home', [signout.status, signout.headers.get('location')], [303, '/'])
  assert('sign-out revokes the refresh token', revocations === 1, `revocations ${revocations}`)
  eq('session is over after sign-out', ((await (await get('/api/session')).json()) as { user: unknown }).user, null)

  // APP_ORIGIN without a client ID: a half-configured deployment must report
  // setup mode, never the loopback preview identity.
  const unconfigured = new Miniflare({
    workers: [
      worker({
        DB: { type: 'd1', name: 'smoke-db-unconfigured' },
        APP_ORIGIN: { type: 'text', value: APP_ORIGIN },
      }),
    ],
  })
  try {
    const origin = (await unconfigured.ready).origin
    const hosted = await request(unconfigured, `${origin}/api/session`)
    eq('half-configured worker reports setup mode', await hosted.json(), { user: null, mode: 'setup', database: true })
    eq('half-configured worker refuses private API', (await request(unconfigured, `${origin}/api/profiles`)).status, 401)
  } finally {
    await unconfigured.dispose()
  }

  console.log(`\n${passed} checks passed against the built worker in workerd.`)
  console.log(`Local OIDC provider: ${discoveryFetches} discovery fetch(es), ${tokenExchanges} token exchange(s), ${revocations} revocation(s).`)
  console.log('Not covered here: Freebuff\'s real issuer, a real consent screen, real accounts, and https-only cookie attributes.')
} catch (error) {
  await deployed.dispose()
  issuerServer.stop(true)
  console.error(`\nsmoke check failed after ${passed} passing checks.`)
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exit(1)
} finally {
  await deployed.dispose().catch(() => undefined)
  issuerServer.stop(true)
}
