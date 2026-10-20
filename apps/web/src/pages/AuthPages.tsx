import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { LIMITS, signUpSchema, type OAuthProvider } from '@restspot/shared'
import { useApi } from '../api/useApi.ts'
import { useAuth } from '../auth/useAuth.ts'
import { ErrorText } from '../components/ui.tsx'

/** Where to go after signing in: back to the page that asked, or the map. */
function useReturnTo(): string {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return from && from.startsWith('/') ? from : '/'
}

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card stack">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

function OAuthButtons() {
  const api = useApi()
  const [error, setError] = useState<unknown>(null)
  const appleEnabled = import.meta.env.VITE_ENABLE_APPLE_SIGNIN === 'true' || api.backendName.startsWith('Local')
  const signIn = async (provider: OAuthProvider) => {
    setError(null)
    try {
      await api.signInWithOAuth(provider)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="stack-tight">
      <button type="button" className="button button-secondary button-wide" onClick={() => signIn('google')}>
        Continue with Google
      </button>
      {appleEnabled && (
        <button type="button" className="button button-secondary button-wide" onClick={() => signIn('apple')}>
          Continue with Apple
        </button>
      )}
      <ErrorText error={error} />
      <div className="divider" role="separator">
        <span>or</span>
      </div>
    </div>
  )
}

export function SignInPage() {
  const api = useApi()
  const { session } = useAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (session) return <Navigate to={returnTo} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signInWithPassword(email.trim(), password)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <OAuthButtons />
      <form className="stack" onSubmit={submit}>
        <label className="field">
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorText error={error} />
        <button type="submit" className="button button-wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <Link to="/reset-password">Forgot your password?</Link>
      </p>
      <p>
        New to RestSpot?{' '}
        <Link to="/signup" state={location.state}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const api = useApi()
  const { session } = useAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const location = useLocation()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  if (session) return <Navigate to={returnTo} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = signUpSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(
        new Error(
          parsed.error.issues[0].path[0] === 'email' ? 'Enter a valid email address' : parsed.error.issues[0].message,
        ),
      )
      return
    }
    if (!displayName.trim()) {
      setError(new Error('Enter a display name'))
      return
    }
    setBusy(true)
    try {
      const result = await api.signUp(parsed.data.email, password, displayName.trim())
      if (result.status === 'confirm_email') setCheckEmail(true)
      else navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <AuthLayout title="Check your email">
        <p role="status">
          We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create an account">
      <p className="muted">An account lets you add restrooms, fix details, write reviews, and save favorites.</p>
      <OAuthButtons />
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          Display name
          <input
            autoComplete="nickname"
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <span className="hint">Shown on your reviews unless you post anonymously.</span>
        </label>
        <label className="field">
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="new-password"
            minLength={LIMITS.passwordMin}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="hint">
            At least {LIMITS.passwordMin} characters.
          </span>
        </label>
        <ErrorText error={error} />
        <button type="submit" className="button button-wide" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account?{' '}
        <Link to="/signin" state={location.state}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const api = useApi()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  // Arriving from a reset email signs the user in; let them choose a new password.
  if (session) {
    return (
      <AuthLayout title="Choose a new password">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await api.updatePassword(password)
              navigate('/dashboard', { replace: true })
            })
          }}
        >
          <label className="field">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={LIMITS.passwordMin}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="hint">At least {LIMITS.passwordMin} characters.</span>
          </label>
          <ErrorText error={error} />
          <button type="submit" className="button" disabled={busy}>
            Save password
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password">
      {sent ? (
        <p role="status">If an account exists for {email}, we sent a link to reset the password.</p>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await api.sendPasswordReset(email.trim())
              setSent(true)
            })
          }}
        >
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <ErrorText error={error} />
          <button type="submit" className="button" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
      <p>
        <Link to="/signin">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
