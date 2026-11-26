import { useEffect, useMemo, useState } from 'react'
import { computeChart } from '../shared/astro'
import { ELEMENTS, glyphText, MODES, ORDINALS, PLANET_BY_KEY, SIGN_BY_INDEX } from '../shared/content'
import { SAMPLE_PROFILE } from '../shared/sample'
import type { Chart, Profile, ProfileInput, ProgressState, Session } from '../shared/types'
import { BirthForm } from './BirthForm'
import { ChartWheel, type Selection } from './ChartWheel'
import { Learn } from './Learn'
import { PinnedCard } from './PinnedCard'
import {
  canSync,
  deleteProfile,
  getProfile,
  listProfiles,
  loadProgress,
  localProfileCount,
  importLocalProfiles,
  persistProfile,
  saveProgress,
} from './store'
import { navigate } from './router'

function BigThree({ chart }: { chart: Chart }) {
  const sun = chart.bodies.find((body) => body.key === 'sun')!
  const moon = chart.bodies.find((body) => body.key === 'moon')!
  const items = [
    { label: 'Sun', value: `${SIGN_BY_INDEX(sun.sign).name}`, note: 'what you are becoming' },
    { label: 'Moon', value: `${SIGN_BY_INDEX(moon.sign).name}`, note: 'what you need to feel safe' },
    {
      label: 'Rising',
      value: chart.ascendant ? SIGN_BY_INDEX(chart.ascendant.sign).name : 'Unknown',
      note: chart.ascendant ? 'how you arrive' : 'needs a birth time',
    },
  ]
  return (
    <ul className="big-three">
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.note}</small>
        </li>
      ))}
    </ul>
  )
}

export function HomePage({ session }: { session: Session | null }) {
  const chart = useMemo(() => computeChart(SAMPLE_PROFILE), [])
  const [selection, setSelection] = useState<Selection>({ kind: 'planet', key: 'sun' })

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Learn to read your own chart</p>
        <h1>
          Your chart is not a horoscope.
          <br />
          It is a map you can learn to read.
        </h1>
        <p className="lede">
          Real planetary positions, calculated from your birth date, time and place — then shown
          with the rule behind every line, so you can read the next one yourself.
        </p>
      </section>

      <div className="demo">
        <div>
          <div className="sample-tag">
            <span>Sample chart</span> 17 May 1990 · 14:30 · New York
          </div>
          <ChartWheel chart={chart} selected={selection} onSelect={setSelection} />
          <PinnedCard chart={chart} selection={selection} onSelect={setSelection} />
          <p className="after-card">
            Every card shows three rules and the arithmetic that produced it.{' '}
            <button className="link" onClick={() => navigate('/r/sample')}>
              Open this chart in full
            </button>
          </p>
        </div>
        <div>
          <BirthForm session={session} onCreated={(profile) => navigate(`/r/${profile.id}`)} />
          <div className="method">
            <h3>What you get</h3>
            <ol>
              <li>
                <strong>The wheel.</strong> Sun through Pluto, the Ascendant, whole-sign houses and
                every major aspect — clickable, with the working shown.
              </li>
              <li>
                <strong>Three lessons.</strong> Signs are styles, houses are arenas, planets are
                drives. Each one asks you a question about your own chart first.
              </li>
              <li>
                <strong>Your profiles.</strong> Keep more than one chart and come back to where you
                stopped.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </>
  )
}

export function ReadingPage({ id, session }: { id: string; session: Session | null }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [tab, setTab] = useState<'chart' | 'learn'>('chart')
  const [selection, setSelection] = useState<Selection | null>({ kind: 'planet', key: 'sun' })
  const [progress, setProgress] = useState<ProgressState>({ lessons: {} })
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!session) return
    let live = true
    setProgressLoaded(false)
    void (async () => {
      const found = id === 'sample' ? SAMPLE_PROFILE : await getProfile(id, session)
      if (!live) return
      setProfile(found)
      setState(found ? 'ready' : 'missing')
      const loaded = await loadProgress(session)
      if (!live) return
      setProgress(loaded)
      setProgressLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [id, session])

  const chart = useMemo(() => (profile ? computeChart(profile) : null), [profile])

  if (state === 'missing')
    return (
      <div className="notice">
        <p>That chart is not in your profiles.</p>
        <button onClick={() => navigate('/profiles')}>Back to profiles</button>
      </div>
    )
  if (!profile || !chart) return <p className="notice">Calculating…</p>

  function update(next: ProgressState) {
    setProgress(next)
    void saveProgress(next, session)
  }

  return (
    <>
      <section className="reading-head">
        <div>
          <p className="eyebrow">{id === 'sample' ? 'Sample chart' : 'Your chart'}</p>
          <h1>{profile.label}</h1>
          <p className="reading-meta">
            {profile.birthDate}
            {profile.timeKnown ? ` · ${profile.birthTime}` : ' · time unknown'} ·{' '}
            {profile.placeLabel}
          </p>
        </div>
        <div className="reading-actions">
          <button className="quiet" onClick={() => setEditing(!editing)}>
            {editing ? 'Close' : 'Edit details'}
          </button>
          {id !== 'sample' && (
            <button className="quiet" onClick={() => navigate('/profiles')}>
              All profiles
            </button>
          )}
        </div>
      </section>

      {editing && (
        <section className="edit-panel">
          <BirthForm
            session={session}
            profile={profile}
            onSaved={(saved) => {
              setProfile(saved)
              setEditing(false)
            }}
          />
        </section>
      )}

      <BigThree chart={chart} />

      <div className="tabs" role="tablist" aria-label="Chart and lessons">
        <button
          role="tab"
          aria-selected={tab === 'chart'}
          className={tab === 'chart' ? 'is-active' : ''}
          onClick={() => setTab('chart')}
        >
          The chart
        </button>
        <button
          role="tab"
          aria-selected={tab === 'learn'}
          className={tab === 'learn' ? 'is-active' : ''}
          onClick={() => setTab('learn')}
        >
          Learn
        </button>
      </div>

      {chart.warnings.length > 0 && (
        <ul className="warnings">
          {chart.warnings.map((warning) => (
            <li key={warning.slice(0, 20)}>{warning}</li>
          ))}
        </ul>
      )}

      {tab === 'chart' ? (
        <>
          <div className="chart-layout">
            <ChartWheel chart={chart} selected={selection} onSelect={setSelection} />
            <PinnedCard chart={chart} selection={selection} onSelect={setSelection} />
          </div>

          <div className="panels">
            <section className="panel">
              <h2>Where everything is</h2>
              <table className="placements">
                <thead>
                  <tr>
                    <th scope="col">Planet</th>
                    <th scope="col">Position</th>
                    <th scope="col">House</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.bodies.map((body) => {
                    const sign = SIGN_BY_INDEX(body.sign)
                    return (
                      <tr key={body.key}>
                        <th scope="row">
                          <span aria-hidden="true">{glyphText(PLANET_BY_KEY[body.key].glyph)}</span>{' '}
                          {PLANET_BY_KEY[body.key].name}
                        </th>
                        <td>
                          {body.degree.toFixed(1)}° {sign.name}
                          {body.retrograde && <span className="retro"> ℞</span>}
                        </td>
                        <td>{body.house ? ORDINALS[body.house - 1] : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <th scope="row">Ascendant</th>
                    <td>
                      {chart.ascendant
                        ? `${chart.ascendant.degree.toFixed(1)}° ${SIGN_BY_INDEX(chart.ascendant.sign).name}`
                        : '—'}
                    </td>
                    <td>{chart.ascendant ? '1st' : '—'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Midheaven</th>
                    <td>
                      {chart.midheaven
                        ? `${chart.midheaven.degree.toFixed(1)}° ${SIGN_BY_INDEX(chart.midheaven.sign).name}`
                        : '—'}
                    </td>
                    <td>{chart.midheaven ? '10th' : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h2>Element balance</h2>
              <ul className="balance">
                {(Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[]).map((key) => (
                  <li key={key}>
                    <span>{ELEMENTS[key].name}</span>
                    <div className="bar" aria-hidden="true">
                      <span style={{ width: `${(chart.elements[key] / 10) * 100}%` }} />
                    </div>
                    <small>{chart.elements[key]}</small>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Counted across the ten planets only, by the sign each one sits in. A missing element
                is not a flaw; it is a place where nothing pushes by default.
              </p>
              <ul className="balance modes">
                {(Object.keys(MODES) as (keyof typeof MODES)[]).map((key) => (
                  <li key={key}>
                    <span>{MODES[key].name}</span>
                    <div className="bar" aria-hidden="true">
                      <span style={{ width: `${(chart.modes[key] / 10) * 100}%` }} />
                    </div>
                    <small>{chart.modes[key]}</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="panel">
            <h2>Aspects</h2>
            <p className="hint">
              An aspect is an angle between two planets. The tighter the orb — the distance from the
              exact angle — the louder it tends to read.
            </p>
            {chart.aspects.length ? (
              <ul className="aspects">
                {chart.aspects.map((aspect) => (
                  <li key={`${aspect.a}-${aspect.b}-${aspect.type}`}>
                    <span className={`aspect-dot aspect-${aspect.type}`} aria-hidden="true" />
                    <strong>
                      {PLANET_BY_KEY[aspect.a].name} {aspect.type} {PLANET_BY_KEY[aspect.b].name}
                    </strong>
                    <span className="aspect-orb">{aspect.orb.toFixed(1)}° orb</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No aspects within orb in this chart.</p>
            )}
          </section>

          <details className="method-details">
            <summary>How this chart was calculated</summary>
            <ol>
              <li>
                Birth clock <strong>{profile.birthTime || '12:00'}</strong> in{' '}
                <strong>{profile.tz}</strong> was converted to <strong>{chart.utcLabel}</strong> (
                {chart.offsetLabel}), using the zone's historical daylight-saving rules.
                {profile.timeKnown && chart.localTime !== profile.birthTime && (
                  <> The clock skipped that reading, so the chart uses {chart.localTime}.</>
                )}
              </li>
              <li>
                Planetary positions come from an ephemeris evaluated at that instant, converted to
                ecliptic longitude of date.
              </li>
              <li>
                The Ascendant is the ecliptic degree crossing the eastern horizon at{' '}
                {profile.lat.toFixed(3)}°, {profile.lon.toFixed(3)}° — solved from the local sidereal
                time and the obliquity of the ecliptic.
              </li>
              <li>
                Houses are whole-sign: the rising sign is the whole 1st house, the next sign the 2nd,
                and so on.
              </li>
              <li>
                Moon phase at birth: {chart.moon.name.toLowerCase()},{' '}
                {Math.round(chart.moon.illumination * 100)}% lit.
              </li>
            </ol>
          </details>
        </>
      ) : progressLoaded ? (
        <Learn
          chart={chart}
          chartId={profile.id}
          progress={progress}
          onProgress={update}
        />
      ) : (
        <p className="notice">Loading your progress…</p>
      )}
    </>
  )
}

export function ProfilesPage({ session }: { session: Session | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const local = typeof window === 'undefined' ? 0 : localProfileCount()

  useEffect(() => {
    if (!session) return
    let live = true
    void (async () => {
      const list = await listProfiles(session)
      if (live) {
        setProfiles(list)
        setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [session])

  async function rename(profile: Profile) {
    const label = draft.trim()
    if (!label) return
    const input: ProfileInput = {
      label,
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      timeKnown: profile.timeKnown,
      placeLabel: profile.placeLabel,
      lat: profile.lat,
      lon: profile.lon,
      tz: profile.tz,
    }
    try {
      const saved = await persistProfile(input, profile, session)
      setProfiles(profiles.map((entry) => (entry.id === profile.id ? saved : entry)))
      setRenaming(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename that chart.')
    }
  }

  async function remove(profile: Profile) {
    try {
      await deleteProfile(profile.id, session)
      setProfiles(profiles.filter((entry) => entry.id !== profile.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that chart.')
    }
  }

  async function bringOver() {
    setMessage('')
    setError('')
    try {
      const count = await importLocalProfiles(session)
      setProfiles(await listProfiles(session))
      setMessage(`Brought ${count} chart${count === 1 ? '' : 's'} into your account.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import those charts.')
    }
  }

  return (
    <>
      <section className="reading-head">
        <div>
          <p className="eyebrow">Profiles</p>
          <h1>Your charts</h1>
          <p className="reading-meta">
            {canSync(session)
              ? 'Saved to your account, available on any device you sign in on.'
              : 'Saved in this browser only. Sign in to keep them across devices.'}
          </p>
        </div>
        <div className="reading-actions">
          <button onClick={() => navigate('/')}>New chart</button>
        </div>
      </section>

      {message && <p className="notice">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!session?.user && session?.mode === 'freebuff' && (
        <p className="notice">
          <a href="/auth/freebuff/signin?returnTo=%2Fprofiles">Sign in with Freebuff</a> to keep these
          charts in your account.
        </p>
      )}

      {canSync(session) && local > 0 && (
        <div className="notice import">
          <span>
            {local} chart{local === 1 ? '' : 's'} saved on this device before you signed in.
          </span>
          <button onClick={() => void bringOver()}>Bring them into my account</button>
        </div>
      )}

      {loading ? (
        <p className="notice">Loading…</p>
      ) : profiles.length === 0 ? (
        <div className="empty-profiles">
          <h2>No charts yet.</h2>
          <p>Add your birth details and the wheel appears in a second.</p>
          <button onClick={() => navigate('/')}>Add a chart</button>
        </div>
      ) : (
        <ul className="profile-list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <div>
                {renaming === profile.id ? (
                  <input
                    value={draft}
                    maxLength={80}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void rename(profile)
                      if (event.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <h3>{profile.label}</h3>
                )}
                <p>
                  {profile.birthDate}
                  {profile.timeKnown ? ` · ${profile.birthTime}` : ' · time unknown'} ·{' '}
                  {profile.placeLabel}
                </p>
              </div>
              <div className="profile-actions">
                {renaming === profile.id ? (
                  <>
                    <button onClick={() => void rename(profile)}>Save</button>
                    <button className="quiet" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => navigate(`/r/${profile.id}`)}>Open</button>
                    <button
                      className="quiet"
                      onClick={() => {
                        setRenaming(profile.id)
                        setDraft(profile.label)
                      }}
                    >
                      Rename
                    </button>
                    <button className="quiet" onClick={() => void remove(profile)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="panel keep">
        <h2>What is stored</h2>
        <p>
          Your label, birth date, birth time, birth place and coordinates. That is all. Positions are
          recomputed from those inputs each time the chart opens, so there is no cached reading to go
          stale.
        </p>
        <p className="hint">
          {canSync(session)
            ? 'Only your account can read them: every query is scoped to your user id.'
            : 'Signed out, everything stays in this browser and never leaves it.'}
        </p>
      </section>
    </>
  )
}
