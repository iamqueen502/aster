import { useEffect, useState, type MouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '../shared/types'
import { HomePage, ProfilesPage, ReadingPage } from './pages'
import { navigate, parseRoute, type Route } from './router'
import './style.css'

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname))
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    let live = true
    fetch('/api/session')
      .then((response) => response.json() as Promise<Session>)
      .then((data) => {
        if (live) setSession(data)
      })
      .catch(() => {
        // Without a session endpoint the app still works from local storage.
        if (live) setSession({ user: null, mode: 'setup', database: false })
      })
    return () => {
      live = false
    }
  }, [])

  const link = (to: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    navigate(to)
  }

  return (
    <div className="shell">
      <header className="site-head">
        <a className="wordmark" href="/" onClick={link('/')}>
          <span aria-hidden="true">✦</span> Aster
        </a>
        <nav aria-label="Main">
          <a href="/" onClick={link('/')} aria-current={route.name === 'home' ? 'page' : undefined}>
            Chart
          </a>
          <a
            href="/profiles"
            onClick={link('/profiles')}
            aria-current={route.name === 'profiles' ? 'page' : undefined}
          >
            Profiles
          </a>
        </nav>
        <div className="account">
          {session?.mode === 'local' ? (
            <span className="badge">Local preview</span>
          ) : session?.user ? (
            <>
              <span className="who">{session.user.name || session.user.email || 'Signed in'}</span>
              <form method="post" action="/auth/freebuff/signout">
                <button className="quiet">Sign out</button>
              </form>
            </>
          ) : session?.mode === 'freebuff' ? (
            <a className="button small" href="/auth/freebuff/signin?returnTo=%2F">
              Sign in
            </a>
          ) : null}
        </div>
      </header>

      <main>
        {route.name === 'home' && <HomePage session={session} />}
        {route.name === 'profiles' && <ProfilesPage session={session} />}
        {route.name === 'reading' && <ReadingPage id={route.id} session={session} />}
      </main>

      <footer className="site-foot">
        <p>
          Positions are computed from an astronomical ephemeris; meanings are one reading of an old
          tradition. For reflection, not medical, legal or financial advice.
        </p>
        <p className="hint">Aster · learn to read your own chart</p>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
