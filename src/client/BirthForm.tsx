import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isValidTimeZone } from '../shared/astro'
import type { Place, Profile, ProfileInput, Session } from '../shared/types'
import { persistProfile } from './store'

export function BirthForm({
  session,
  onCreated,
  profile,
  onSaved,
}: {
  session: Session | null
  onCreated?: (profile: Profile) => void
  profile?: Profile
  onSaved?: (profile: Profile) => void
}) {
  const [label, setLabel] = useState(profile?.label ?? '')
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '')
  const [birthTime, setBirthTime] = useState(profile?.birthTime ?? '')
  const [timeKnown, setTimeKnown] = useState(profile?.timeKnown ?? true)
  const [placeLabel, setPlaceLabel] = useState(profile?.placeLabel ?? '')
  const [coords, setCoords] = useState({
    lat: profile ? String(profile.lat) : '',
    lon: profile ? String(profile.lon) : '',
    tz: profile?.tz ?? '',
  })
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const chosen = Boolean(placeLabel && coords.lat && coords.lon)

  useEffect(() => {
    if (chosen || query.trim().length < 2) {
      setPlaces([])
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setSearching(true)
      void (async () => {
        try {
          const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`)
          const body = (await response.json()) as { places?: Place[] }
          setPlaces(body.places ?? [])
        } catch {
          setPlaces([])
        } finally {
          setSearching(false)
        }
      })()
    }, 320)
    return () => window.clearTimeout(timer.current)
  }, [query, chosen])

  function choosePlace(place: Place) {
    setPlaceLabel([place.name, place.region, place.country].filter(Boolean).join(', '))
    setCoords({ lat: String(place.lat), lon: String(place.lon), tz: place.tz })
    setQuery('')
    setPlaces([])
    if (!label) setLabel(`${place.name} · ${birthDate || 'your chart'}`)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    const lat = Number(coords.lat)
    const lon = Number(coords.lon)
    if (!birthDate) return setError('Choose a birth date.')
    if (timeKnown && !birthTime) return setError('Enter a birth time, or tick “I don’t know my birth time”.')
    const place = placeLabel || (manual ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : '')
    if (!place) return setError('Search for a birth place and pick a result.')
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return setError('Latitude must be between −90 and 90.')
    if (!Number.isFinite(lon) || lon < -180 || lon > 180)
      return setError('Longitude must be between −180 and 180.')
    if (!isValidTimeZone(coords.tz))
      return setError('That time zone is not recognised. Try a name like Europe/Lisbon.')

    const input: ProfileInput = {
      label: label.trim() || `${place.split(',')[0]} · ${birthDate}`,
      birthDate,
      birthTime: timeKnown ? birthTime : '',
      timeKnown,
      placeLabel: place,
      lat,
      lon,
      tz: coords.tz,
    }

    setBusy(true)
    try {
      const saved = await persistProfile(input, profile ?? null, session)
      if (profile) onSaved?.(saved)
      else onCreated?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this chart.')
    } finally {
      setBusy(false)
    }
  }

  const dateSummary = birthDate
    ? new Date(`${birthDate}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'No date yet'

  return (
    <form className="birth-form" onSubmit={submit}>
      <h2>{profile ? 'Edit this chart' : 'Your birth details'}</h2>
      <p className="form-note">
        Nothing is sent anywhere until you save. Only these details are stored — positions are
        recalculated every time you open the chart.
      </p>

      <div className="field-row">
        <label>
          <span>Birth date</span>
          <input
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            min="1800-01-01"
            required
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
        <label>
          <span>Birth time</span>
          <input
            type="time"
            value={birthTime}
            disabled={!timeKnown}
            onChange={(event) => setBirthTime(event.target.value)}
          />
        </label>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={!timeKnown}
          onChange={(event) => {
            setTimeKnown(!event.target.checked)
            if (event.target.checked) setBirthTime('')
          }}
        />
        <span>I don’t know my birth time</span>
      </label>
      {!timeKnown && (
        <p className="hint">
          Then we use noon local time and skip the Ascendant and houses. Your Sun, Moon and planets
          are still placed — the Moon may be off by a few degrees.
        </p>
      )}

      <label className="place-field">
        <span>Birth place</span>
        <input
          type="text"
          value={chosen ? placeLabel : query}
          placeholder="Start typing a city…"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value)
            setPlaceLabel('')
            setCoords({ lat: '', lon: '', tz: '' })
          }}
        />
      </label>
      {searching && <p className="hint">Searching…</p>}
      {!chosen && places.length > 0 && (
        <ul className="place-list">
          {places.map((place) => (
            <li key={`${place.name}-${place.lat}-${place.lon}`}>
              <button type="button" onClick={() => choosePlace(place)}>
                <strong>{place.name}</strong>
                <span>
                  {[place.region, place.country].filter(Boolean).join(', ')} · {place.tz}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen && (
        <p className="hint">
          {Number(coords.lat).toFixed(3)}°, {Number(coords.lon).toFixed(3)}° · {coords.tz} ·{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setPlaceLabel('')
              setCoords({ lat: '', lon: '', tz: '' })
              setQuery('')
            }}
          >
            change
          </button>
        </p>
      )}

      <button type="button" className="link manual-toggle" onClick={() => setManual(!manual)}>
        {manual ? 'Hide coordinates' : 'Enter coordinates instead'}
      </button>
      {manual && (
        <div className="field-row three">
          <label>
            <span>Latitude</span>
            <input
              inputMode="decimal"
              value={coords.lat}
              onChange={(event) => setCoords({ ...coords, lat: event.target.value })}
            />
          </label>
          <label>
            <span>Longitude</span>
            <input
              inputMode="decimal"
              value={coords.lon}
              onChange={(event) => setCoords({ ...coords, lon: event.target.value })}
            />
          </label>
          <label>
            <span>Time zone</span>
            <input
              value={coords.tz}
              placeholder="Europe/Lisbon"
              onChange={(event) => setCoords({ ...coords, tz: event.target.value })}
            />
          </label>
        </div>
      )}

      <label>
        <span>Name this chart</span>
        <input
          value={label}
          maxLength={80}
          placeholder={placeLabel ? `${placeLabel.split(',')[0]} · ${birthDate}` : 'My chart'}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button disabled={busy}>{busy ? 'Calculating…' : profile ? 'Save changes' : 'Read my chart'}</button>
        <span className="hint">
          {dateSummary}
          {timeKnown && birthTime ? ` · ${birthTime}` : ' · time unknown'}
        </span>
      </div>
    </form>
  )
}
