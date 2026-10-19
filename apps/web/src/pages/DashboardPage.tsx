import { useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  EDIT_KIND_LABELS,
  FIELD_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  type AdminUser,
  type ReportStatus,
} from '@restspot/shared'
import { useApi } from '../api/ApiProvider.tsx'
import { useContributions, useFavorites, useInvalidateRestroom } from '../api/hooks.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { ErrorText, formatDate, formatRelative, OpenStatus, RestroomFeatures, Spinner, Stars } from '../components/ui.tsx'

export function DashboardPage() {
  const { session, profile, profileLoading, isAdmin, isSuspended } = useAuth()
  if (session === undefined || profileLoading) return <Spinner />
  if (!session) return <Navigate to="/signin" state={{ from: '/dashboard' }} replace />

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>{profile ? `Hi, ${profile.displayName}` : 'Dashboard'}</h1>
        {isAdmin && <span className="badge badge-admin">Admin</span>}
      </header>
      {isSuspended && profile?.suspendedUntil && (
        <p className="notice" role="alert">
          Your account is suspended until {formatDate(profile.suspendedUntil)}
          {profile.suspensionReason ? ` (${profile.suspensionReason})` : ''}. You can browse, but can’t add, edit, or
          review restrooms.
        </p>
      )}
      <nav className="tabs" aria-label="Dashboard sections">
        <NavLink to="/dashboard" end>
          Saved
        </NavLink>
        <NavLink to="/dashboard/contributions">My contributions</NavLink>
        <NavLink to="/dashboard/account">Account</NavLink>
        {isAdmin && <NavLink to="/dashboard/reports">Reports</NavLink>}
        {isAdmin && <NavLink to="/dashboard/users">Users</NavLink>}
      </nav>
      <div className="tab-panel">
        <Routes>
          <Route index element={<FavoritesTab />} />
          <Route path="contributions" element={<ContributionsTab />} />
          <Route path="account" element={<AccountTab />} />
          <Route path="reports" element={isAdmin ? <ReportsTab /> : <Navigate to="/dashboard" replace />} />
          <Route path="users" element={isAdmin ? <UsersTab /> : <Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function FavoritesTab() {
  const api = useApi()
  const { data, isLoading, error } = useFavorites()
  const invalidate = useInvalidateRestroom()
  const unsave = useMutation({
    mutationFn: (id: string) => api.setFavorite(id, false),
    onSuccess: (_d, id) => invalidate(id),
  })

  if (isLoading) return <Spinner />
  return (
    <section aria-labelledby="saved-h">
      <h2 id="saved-h">Saved restrooms</h2>
      <ErrorText error={error ?? unsave.error} />
      {data?.length === 0 && (
        <p className="muted">
          Nothing saved yet. Tap <strong>☆ Save</strong> on a restroom to keep it here.
        </p>
      )}
      <ul className="card-list">
        {data?.map((r) => (
          <li key={r.id} className="card">
            <div className="row space-between">
              <Link to={`/restroom/${r.id}`} className="card-title">
                {r.name}
              </Link>
              <button type="button" className="link-button" onClick={() => unsave.mutate(r.id)}>
                Remove<span className="visually-hidden"> {r.name} from saved</span>
              </button>
            </div>
            <div className="row wrap">
              <OpenStatus isOpen={r.isOpen} />
              {r.reviewCount > 0 && <Stars value={r.avgOverall} label="Overall rating" />}
            </div>
            <RestroomFeatures restroom={r} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ContributionsTab() {
  const { data, isLoading, error } = useContributions()
  if (isLoading) return <Spinner />
  return (
    <>
      <ErrorText error={error} />
      <section aria-labelledby="my-reviews-h">
        <h2 id="my-reviews-h">My reviews</h2>
        {data?.reviews.length === 0 && <p className="muted">You haven’t reviewed any restrooms yet.</p>}
        <ul className="card-list">
          {data?.reviews.map((r) => (
            <li key={r.id} className="card">
              <Link to={`/restroom/${r.locationId}`} className="card-title">
                {r.locationName}
              </Link>
              <div className="row wrap">
                <Stars value={r.overall} label="Overall" />
                <span className="muted">{formatDate(r.createdAt)}</span>
                {r.anonymous && <span className="muted">Posted anonymously</span>}
                {r.hidden && <span className="badge badge-unverified">Hidden by a moderator</span>}
              </div>
              {r.comment && <p>{r.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="my-edits-h">
        <h2 id="my-edits-h">My edits</h2>
        {data?.edits.length === 0 && (
          <p className="muted">
            No edits yet. <Link to="/add">Add a restroom</Link> or fix details on an existing one.
          </p>
        )}
        <ul className="plain-list">
          {data?.edits.map((e) => (
            <li key={e.id}>
              <strong>{EDIT_KIND_LABELS[e.kind]}</strong> <Link to={`/restroom/${e.locationId}`}>{e.locationName}</Link>
              {e.changedFields.length > 0 && e.kind === 'update' && (
                <span className="muted">
                  {' '}
                  ({[...new Set(e.changedFields.map((f) => FIELD_LABELS[f] ?? f))].join(', ')})
                </span>
              )}{' '}
              <span className="muted">· {formatRelative(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function AccountTab() {
  const api = useApi()
  const { session, profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [confirmDelete, setConfirmDelete] = useState('')

  const rename = useMutation({
    mutationFn: () => api.updateDisplayName(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
  const signOut = useMutation({ mutationFn: () => api.signOut(), onSuccess: () => navigate('/') })
  const remove = useMutation({ mutationFn: () => api.deleteMyAccount(), onSuccess: () => navigate('/') })

  return (
    <>
      <section aria-labelledby="profile-h" className="stack">
        <h2 id="profile-h">Profile</h2>
        <p>
          Signed in as <strong>{session?.email ?? 'unknown email'}</strong>
          {profile && <span className="muted"> · member since {formatDate(profile.createdAt)}</span>}
        </p>
        <form
          className="row wrap align-end"
          onSubmit={(e) => {
            e.preventDefault()
            rename.mutate()
          }}
        >
          <label className="field">
            Display name
            <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit" className="button" disabled={rename.isPending || name.trim() === profile?.displayName}>
            Save
          </button>
          {rename.isSuccess && <span role="status">Saved</span>}
        </form>
        <ErrorText error={rename.error} />
        <div>
          <button type="button" className="button button-secondary" onClick={() => signOut.mutate()}>
            Sign out
          </button>
        </div>
      </section>

      <section aria-labelledby="delete-h" className="stack danger-zone">
        <h2 id="delete-h">Delete account</h2>
        <p>
          This permanently deletes your account, saved restrooms, and reports. Your reviews stay up but become anonymous.
          Restrooms you added stay on the map.
        </p>
        <label className="field">
          Type DELETE to confirm
          <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" />
        </label>
        <div>
          <button
            type="button"
            className="button button-danger"
            disabled={confirmDelete !== 'DELETE' || remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete my account
          </button>
        </div>
        <ErrorText error={remove.error} />
      </section>
    </>
  )
}

function ReportsTab() {
  const api = useApi()
  const [status, setStatus] = useState<ReportStatus | null>('open')
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => api.admin.listReports(status),
  })
  const resolve = useMutation({
    mutationFn: ({ id, s }: { id: string; s: ReportStatus }) => api.admin.resolveReport(id, s),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
  })

  return (
    <section aria-labelledby="reports-h">
      <div className="row space-between wrap">
        <h2 id="reports-h">Reports</h2>
        <label className="inline-field">
          Show{' '}
          <select value={status ?? 'all'} onChange={(e) => setStatus(e.target.value === 'all' ? null : (e.target.value as ReportStatus))}>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REPORT_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </label>
      </div>
      <ErrorText error={error ?? resolve.error} />
      {isLoading && <Spinner />}
      {data?.length === 0 && <p className="muted">No reports here. 🎉</p>}
      <ul className="card-list">
        {data?.map((r) => (
          <li key={r.id} className="card">
            <div className="row space-between wrap">
              <Link to={`/restroom/${r.locationId}`} className="card-title">
                {r.locationName}
              </Link>
              <span className="badge">{REPORT_STATUS_LABELS[r.status]}</span>
            </div>
            <p>
              <strong>{REPORT_REASON_LABELS[r.reason]}</strong>
              {r.comment && <> — {r.comment}</>}
            </p>
            <p className="muted">
              Reported by {r.reporterDisplayName ?? 'a former user'} · {formatRelative(r.createdAt)}
              {r.locationDeleted && ' · listing already removed'}
            </p>
            <div className="row wrap">
              <Link to={`/restroom/${r.locationId}`} className="button button-secondary">
                Review listing
              </Link>
              {r.status === 'open' ? (
                <>
                  <button type="button" className="button" onClick={() => resolve.mutate({ id: r.id, s: 'resolved' })}>
                    Mark resolved
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => resolve.mutate({ id: r.id, s: 'dismissed' })}
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <button type="button" className="link-button" onClick={() => resolve.mutate({ id: r.id, s: 'open' })}>
                  Reopen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function UsersTab() {
  const api = useApi()
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: () => api.admin.listUsers(query),
  })

  return (
    <section aria-labelledby="users-h">
      <h2 id="users-h">Users</h2>
      <form
        className="row wrap align-end"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(search.trim() || null)
        }}
      >
        <label className="field">
          Name or email
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="submit" className="button">
          Search
        </button>
      </form>
      <ErrorText error={error} />
      {isLoading && <Spinner />}
      <ul className="card-list">
        {data?.map((u) => (
          <UserRow key={u.id} user={u} isSelf={u.id === session?.userId} />
        ))}
      </ul>
    </section>
  )
}

const SUSPENSION_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '1 week', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Indefinitely', days: 36_500 },
]

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  const suspended = Boolean(user.suspendedUntil && new Date(user.suspendedUntil) > new Date())
  const update = useMutation({
    mutationFn: (until: string | null) => api.admin.setSuspension(user.id, until, reason || null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  return (
    <li className="card">
      <div className="row space-between wrap">
        <strong>
          {user.displayName} {user.role === 'admin' && <span className="badge badge-admin">Admin</span>}
        </strong>
        <span className="muted">{user.email}</span>
      </div>
      <p className="muted">
        Joined {formatDate(user.createdAt)} · {user.reviewCount} reviews · {user.editCount} edits
      </p>
      {suspended && (
        <p className="notice">
          Suspended until {formatDate(user.suspendedUntil!)}
          {user.suspensionReason && ` — ${user.suspensionReason}`}
        </p>
      )}
      {!isSelf &&
        (suspended ? (
          <button type="button" className="button button-secondary" onClick={() => update.mutate(null)}>
            Lift suspension
          </button>
        ) : (
          <form
            className="row wrap align-end"
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate(new Date(Date.now() + days * 86_400_000).toISOString())
            }}
          >
            <label className="field">
              Suspend for
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {SUSPENSION_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Reason
              <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="submit" className="button button-danger" disabled={update.isPending}>
              Suspend
            </button>
          </form>
        ))}
      <ErrorText error={update.error} />
    </li>
  )
}
