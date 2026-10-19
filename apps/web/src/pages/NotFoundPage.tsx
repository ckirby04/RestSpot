import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="auth-card stack">
        <h1>Page not found</h1>
        <p>That page doesn’t exist.</p>
        <Link to="/">Find a restroom</Link>
      </div>
    </div>
  )
}
