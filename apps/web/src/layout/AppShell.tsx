import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useApi } from '../api/ApiProvider.tsx'
import { useAuth } from '../auth/AuthProvider.tsx'

export function AppShell() {
  const api = useApi()
  const { session, profile, isAdmin } = useAuth()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // Move focus to the new page's heading on navigation, for screen reader and keyboard users.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const heading = mainRef.current?.querySelector<HTMLElement>('h1, h2')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: false })
    }
  }, [location.pathname])

  const isLocal = api.backendName.startsWith('Local')

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/" className="brand" aria-label="RestSpot home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          RestSpot
        </Link>
        <nav aria-label="Main" className="main-nav">
          <NavLink to="/" end>
            Find
          </NavLink>
          <NavLink to="/add">Add a restroom</NavLink>
          {session ? (
            <NavLink to="/dashboard">
              {isAdmin ? 'Dashboard (admin)' : 'Dashboard'}
              {profile && <span className="visually-hidden">, signed in as {profile.displayName}</span>}
            </NavLink>
          ) : (
            <NavLink to="/signin">Sign in</NavLink>
          )}
        </nav>
      </header>
      {isLocal && (
        <div className="dev-banner" role="note">
          Local demo database — sample data only. Sign in as <code>demo@restspot.test</code> or{' '}
          <code>admin@restspot.test</code> (password <code>password123</code>).
        </div>
      )}
      <main id="main" ref={mainRef} className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
