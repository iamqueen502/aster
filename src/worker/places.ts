import type { Place } from '../shared/types'

type CacheEntry = { at: number; places: Place[] }
const cache = new Map<string, CacheEntry>()
const TTL = 10 * 60_000

type OpenMeteoResult = {
  name?: unknown
  admin1?: unknown
  country?: unknown
  latitude?: unknown
  longitude?: unknown
  timezone?: unknown
}

/**
 * Keyless geocoding through Open-Meteo, proxied so the browser never talks to a
 * third party directly and results can be cached. The returned IANA zone is what
 * makes the birth clock conversion correct.
 */
export async function searchPlaces(query: string): Promise<Place[]> {
  const key = query.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.places

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '8')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Place search is unavailable right now.')

  const data = (await response.json()) as { results?: OpenMeteoResult[] }
  const places: Place[] = (data.results ?? [])
    .filter(
      (result) =>
        typeof result.name === 'string' &&
        typeof result.latitude === 'number' &&
        typeof result.longitude === 'number' &&
        typeof result.timezone === 'string' &&
        result.timezone.length > 0,
    )
    .map((result) => ({
      name: String(result.name),
      region: typeof result.admin1 === 'string' ? result.admin1 : '',
      country: typeof result.country === 'string' ? result.country : '',
      lat: result.latitude as number,
      lon: result.longitude as number,
      tz: String(result.timezone),
    }))

  if (cache.size > 100) cache.clear()
  cache.set(key, { at: Date.now(), places })
  return places
}
