import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ACCESS_LABELS,
  directionsUrl,
  distanceMeters,
  EDIT_KIND_LABELS,
  FEE_LABELS,
  FIELD_LABELS,
  formatDayHours,
  formatDistance,
  localTimeIn,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  WEEKDAY_NAMES,
  type ReportReason,
  type RestroomDetail,
  type Review,
} from '@restspot/shared'
import { useApi } from '../api/ApiProvider.tsx'
import { useHistory, useRestroom, useRestroomMutation, useReviews, useSearch } from '../api/hooks.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import {
  Dialog,
  ErrorText,
  formatDate,
  formatRelative,
  OpenStatus,
  RoomRow,
  Spinner,
  StarInput,
  Stars,
} from '../components/ui.tsx'
import { useMapControls } from '../layout/MapLayout.tsx'
import { isApplePlatform } from '../lib/location.ts'
import { useSearchState } from '../search/SearchContext.tsx'

export function RestroomPage() {
  const { id } = useParams()
  const map = useMapControls()
  const { data: restroom, isLoading, error } = useRestroom(id)
  const { origin, deviceLocation } = useSearchState()

  useEffect(() => {
    map.setPicker(null)
    map.select(id ?? null)
  }, [map, id])

  // Keep the selected pin visible even if it's outside the current search results.
  const { origin: searchOrigin, filters } = useSearchState()
  const { data: results } = useSearch(searchOrigin?.coordinates ?? null, filters)
  useEffect(() => {
    if (!restroom) return
    const list = results ?? []
    map.showResults(
      list.some((r) => r.id === restroom.id) ? list : [...list, { ...restroom, distanceMeters: 0 }],
    )
  }, [map, results, restroom])

  const lat = restroom?.coordinates.lat
  const lng = restroom?.coordinates.lng
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.focusOn({ lat, lng }, 16)
  }, [map, lat, lng])

  if (isLoading) return <Spinner />
  if (error) return <ErrorText error={error} />
  if (!restroom) {
    return (
      <div>
        <h1>Restroom not found</h1>
        <p>It may have been removed or merged into another listing.</p>
        <Link to="/">Back to search</Link>
      </div>
    )
  }

  const from = deviceLocation ?? origin?.coordinates ?? null
  return (
    <article className="detail" aria-labelledby="restroom-title">
      <Link to="/" className="back-link">
        ← All results
      </Link>
      <RestroomHeader restroom={restroom} distance={from ? distanceMeters(from, restroom.coordinates) : null} />
      <RestroomActions restroom={restroom} />
      <RestroomInfo restroom={restroom} />
      <ReviewsSection restroom={restroom} />
      <HistorySection restroomId={restroom.id} />
      <AdminSection restroom={restroom} />
    </article>
  )
}

function RestroomHeader({ restroom, distance }: { restroom: RestroomDetail; distance: number | null }) {
  const today = localTimeIn(restroom.timeZone, new Date()).day
  return (
    <header className="detail-header">
      {restroom.deletedAt && (
        <p className="notice" role="note">
          This listing was removed by a moderator{restroom.mergedInto ? ' (merged into another listing)' : ''}. Only
          admins can see it.
        </p>
      )}
      <h1 id="restroom-title">{restroom.name}</h1>
      <p className="detail-sub">
        <OpenStatus isOpen={restroom.isOpen} />
        <span>Today: {formatDayHours(restroom.hours[today])}</span>
        {distance !== null && <span>{formatDistance(distance)} away</span>}
      </p>
      <p className="detail-trust">
        {restroom.verified ? (
          <span className="badge badge-verified">
            Verified{restroom.lastConfirmedAt && ` · confirmed ${formatRelative(restroom.lastConfirmedAt)}`}
          </span>
        ) : (
          <span className="badge badge-unverified">
            Unverified{restroom.source === 'osm' ? ' · imported from OpenStreetMap' : ''}
            {restroom.source === 'poi_inferred' ? ' · likely has a restroom (not confirmed)' : ''}
          </span>
        )}
        <span className="muted">Updated {formatRelative(restroom.updatedAt)}</span>
      </p>
    </header>
  )
}

function RestroomActions({ restroom }: { restroom: RestroomDetail }) {
  const api = useApi()
  const { session, canContribute } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const favorite = useRestroomMutation(restroom.id, (on: boolean) => api.setFavorite(restroom.id, on))
  const confirm = useRestroomMutation(restroom.id, () => api.confirmRestroom(restroom.id))

  const requireSignIn = () => navigate('/signin', { state: { from: location.pathname } })

  return (
    <div className="actions">
      <a
        className="button"
        href={directionsUrl(restroom.coordinates, isApplePlatform() ? 'apple' : 'other')}
        target="_blank"
        rel="noreferrer"
      >
        Directions<span className="visually-hidden"> (opens maps app)</span>
      </a>
      <button
        type="button"
        className="button button-secondary"
        aria-pressed={restroom.isFavorite}
        disabled={favorite.isPending}
        onClick={() => (session ? favorite.mutate(!restroom.isFavorite) : requireSignIn())}
      >
        {restroom.isFavorite ? '★ Saved' : '☆ Save'}
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={async () => {
          const url = `${window.location.origin}/restroom/${restroom.id}`
          try {
            if (navigator.share) await navigator.share({ title: restroom.name, url })
            else {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }
          } catch {
            // Share sheet dismissed.
          }
        }}
      >
        {copied ? 'Link copied' : 'Share'}
      </button>
      {canContribute ? (
        <Link className="button button-secondary" to={`/restroom/${restroom.id}/edit`}>
          Edit
        </Link>
      ) : (
        <button type="button" className="button button-secondary" onClick={requireSignIn}>
          Edit
        </button>
      )}
      <button
        type="button"
        className="button button-secondary"
        disabled={confirm.isPending || confirmed}
        onClick={() => (canContribute ? confirm.mutate(undefined, { onSuccess: () => setConfirmed(true) }) : requireSignIn())}
      >
        {confirmed ? 'Thanks for confirming!' : 'Info is accurate'}
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => (canContribute ? setReportOpen(true) : requireSignIn())}
      >
        Report a problem
      </button>
      <ErrorText error={favorite.error ?? confirm.error} />
      <ReportDialog restroomId={restroom.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  )
}

function ReportDialog({ restroomId, open, onClose }: { restroomId: string; open: boolean; onClose(): void }) {
  const api = useApi()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const report = useRestroomMutation(restroomId, () => api.fileReport(restroomId, { reason: reason!, comment }))

  const close = () => {
    onClose()
    setTimeout(() => {
      setSent(false)
      setReason(null)
      setComment('')
      report.reset()
    }, 0)
  }

  return (
    <Dialog open={open} onClose={close} title="Report a problem">
      {sent ? (
        <div>
          <p role="status">Thanks — a moderator will review your report.</p>
          <button type="button" className="button" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason) report.mutate(undefined, { onSuccess: () => setSent(true) })
          }}
        >
          <fieldset className="stack-tight">
            <legend>What’s wrong?</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="radio-row">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} required />
                {REPORT_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          <label className="field">
            Details (optional)
            <textarea value={comment} maxLength={500} rows={3} onChange={(e) => setComment(e.target.value)} />
            <span className="hint">{comment.length}/500</span>
          </label>
          <ErrorText error={report.error} />
          <div className="row">
            <button type="submit" className="button" disabled={!reason || report.isPending}>
              {report.isPending ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" className="button button-secondary" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function RestroomInfo({ restroom }: { restroom: RestroomDetail }) {
  const today = localTimeIn(restroom.timeZone, new Date()).day
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <>
      <section aria-labelledby="rooms-h" className="detail-section">
        <h2 id="rooms-h">Rooms</h2>
        <ul className="rooms">
          {restroom.rooms.map((room, i) => (
            <RoomRow key={room.id ?? i} room={room} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="access-h" className="detail-section">
        <h2 id="access-h">Access</h2>
        <dl className="facts">
          <dt>Who can use it</dt>
          <dd>{ACCESS_LABELS[restroom.accessType]}</dd>
          <dt>Cost</dt>
          <dd>{FEE_LABELS[restroom.fee]}</dd>
          <dt>Key or code</dt>
          <dd>{restroom.keyRequired === 'yes' ? 'Required' : restroom.keyRequired === 'no' ? 'Not needed' : 'Not sure'}</dd>
        </dl>
        {restroom.notes && <p className="notes">{restroom.notes}</p>}
      </section>

      <section aria-labelledby="hours-h" className="detail-section">
        <h2 id="hours-h">Hours</h2>
        <table className="hours">
          <caption className="visually-hidden">Weekly hours</caption>
          <tbody>
            {restroom.hours.map((d, i) => (
              <tr key={i} className={i === today ? 'today' : undefined} aria-current={i === today ? 'date' : undefined}>
                <th scope="row">{WEEKDAY_NAMES[i]}</th>
                <td>{formatDayHours(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {restroom.timeZone !== browserZone && (
          <p className="hint">Times are local to the restroom ({restroom.timeZone.replace(/_/g, ' ')}).</p>
        )}
      </section>
    </>
  )
}

function ReviewsSection({ restroom }: { restroom: RestroomDetail }) {
  const { canContribute, session, isSuspended } = useAuth()
  const { data: reviews, isLoading } = useReviews(restroom.id)
  const mine = reviews?.find((r) => r.isMine) ?? null
  const [editing, setEditing] = useState(false)

  return (
    <section aria-labelledby="reviews-h" className="detail-section">
      <h2 id="reviews-h">Reviews</h2>
      <div className="rating-summary">
        <div>
          <span className="muted">Overall</span> <Stars value={restroom.avgOverall} label="Average overall rating" />
        </div>
        <div>
          <span className="muted">Cleanliness</span>{' '}
          <Stars value={restroom.avgCleanliness} label="Average cleanliness rating" />
        </div>
        <div className="muted">
          {restroom.reviewCount} review{restroom.reviewCount === 1 ? '' : 's'}
        </div>
      </div>

      {!session ? (
        <p>
          <Link to="/signin" state={{ from: `/restroom/${restroom.id}` }}>
            Sign in
          </Link>{' '}
          to leave a review.
        </p>
      ) : isSuspended ? (
        <p className="notice">Your account is suspended, so you can’t post reviews right now.</p>
      ) : canContribute && (!mine || editing) ? (
        <ReviewForm restroomId={restroom.id} existing={mine} onDone={() => setEditing(false)} />
      ) : null}

      {isLoading ? (
        <Spinner label="Loading reviews" />
      ) : (
        <ul className="review-list">
          {reviews?.map((r) => (
            <ReviewItem key={r.id} review={r} restroomId={restroom.id} onEdit={() => setEditing(true)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReviewForm({ restroomId, existing, onDone }: { restroomId: string; existing: Review | null; onDone(): void }) {
  const api = useApi()
  const [overall, setOverall] = useState<number | null>(existing?.overall ?? null)
  const [cleanliness, setCleanliness] = useState<number | null>(existing?.cleanliness ?? null)
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [anonymous, setAnonymous] = useState(existing?.anonymous ?? false)
  const save = useRestroomMutation(restroomId, () =>
    api.saveMyReview(restroomId, { overall: overall!, cleanliness: cleanliness!, comment, anonymous }),
  )

  return (
    <form
      className="review-form stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (overall && cleanliness) save.mutate(undefined, { onSuccess: onDone })
      }}
    >
      <h3>{existing ? 'Edit your review' : 'Write a review'}</h3>
      <div className="row wrap">
        <StarInput label="Overall" value={overall} onChange={setOverall} />
        <StarInput label="Cleanliness" value={cleanliness} onChange={setCleanliness} />
      </div>
      <label className="field">
        Comment (optional)
        <textarea value={comment} maxLength={500} rows={3} onChange={(e) => setComment(e.target.value)} />
        <span className="hint">{comment.length}/500</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        Post anonymously (your name is hidden from other users)
      </label>
      <ErrorText error={save.error} />
      <div className="row">
        <button type="submit" className="button" disabled={!overall || !cleanliness || save.isPending}>
          {save.isPending ? 'Saving…' : existing ? 'Update review' : 'Post review'}
        </button>
        {existing && (
          <button type="button" className="button button-secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function ReviewItem({ review, restroomId, onEdit }: { review: Review; restroomId: string; onEdit(): void }) {
  const api = useApi()
  const { isAdmin } = useAuth()
  const remove = useRestroomMutation(restroomId, () => api.deleteMyReview(restroomId))
  const hide = useRestroomMutation(restroomId, (hidden: boolean) => api.admin.setReviewHidden(review.id, hidden))

  return (
    <li className={`review ${review.hidden ? 'review-hidden' : ''}`}>
      <div className="review-head">
        <strong>
          {review.isMine ? 'You' : (review.authorDisplayName ?? 'Anonymous')}
          {review.anonymous && review.isMine && <span className="muted"> (posted anonymously)</span>}
          {review.anonymous && isAdmin && !review.isMine && <span className="muted"> (anonymous to others)</span>}
        </strong>
        <span className="muted">{formatDate(review.createdAt)}</span>
      </div>
      <div className="row wrap">
        <span>
          <span className="muted">Overall</span> <Stars value={review.overall} label="Overall" />
        </span>
        <span>
          <span className="muted">Cleanliness</span> <Stars value={review.cleanliness} label="Cleanliness" />
        </span>
      </div>
      {review.comment && <p>{review.comment}</p>}
      {review.hidden && <p className="notice">Hidden by a moderator</p>}
      <div className="row">
        {review.isMine && (
          <>
            <button type="button" className="link-button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="link-button danger"
              onClick={() => confirm('Delete your review?') && remove.mutate(undefined)}
            >
              Delete
            </button>
          </>
        )}
        {isAdmin && (
          <button type="button" className="link-button" onClick={() => hide.mutate(!review.hidden)}>
            {review.hidden ? 'Unhide (admin)' : 'Hide (admin)'}
          </button>
        )}
      </div>
      <ErrorText error={remove.error ?? hide.error} />
    </li>
  )
}

function HistorySection({ restroomId }: { restroomId: string }) {
  const api = useApi()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const { data: history, isLoading } = useHistory(restroomId, open)
  const rollback = useRestroomMutation(restroomId, (editId: number) => api.admin.rollback(editId))

  return (
    <section className="detail-section">
      <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <h2>Edit history</h2>
        </summary>
        {isLoading && <Spinner />}
        <ol className="history">
          {history?.map((h) => (
            <li key={h.id}>
              <div>
                <strong>{EDIT_KIND_LABELS[h.kind]}</strong> by {h.editorDisplayName ?? 'a former user'}{' '}
                <span className="muted">· {formatRelative(h.createdAt)}</span>
              </div>
              {h.kind === 'update' && (
                <div className="muted">
                  Changed: {[...new Set(Object.keys(h.changes).map((k) => FIELD_LABELS[k] ?? k))].join(', ')}
                </div>
              )}
              {isAdmin && ['create', 'update', 'rollback'].includes(h.kind) && (
                <button
                  type="button"
                  className="link-button"
                  disabled={rollback.isPending}
                  onClick={() => confirm('Restore the listing to this version?') && rollback.mutate(h.id)}
                >
                  Restore this version (admin)
                </button>
              )}
            </li>
          ))}
        </ol>
        <ErrorText error={rollback.error} />
      </details>
    </section>
  )
}

function AdminSection({ restroom }: { restroom: RestroomDetail }) {
  const api = useApi()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [keepId, setKeepId] = useState('')
  const nearby = useSearch(isAdmin ? restroom.coordinates : null, { radiusMiles: 0.25 })
  const remove = useRestroomMutation(restroom.id, (removed: boolean) => api.admin.setRestroomRemoved(restroom.id, removed))
  const merge = useRestroomMutation(restroom.id, () => api.admin.mergeRestrooms(restroom.id, keepId))

  if (!isAdmin) return null
  const candidates = (nearby.data ?? []).filter((r) => r.id !== restroom.id)

  return (
    <section aria-labelledby="admin-h" className="detail-section admin-section">
      <h2 id="admin-h">Moderation</h2>
      <div className="row wrap">
        <button
          type="button"
          className="button button-danger"
          disabled={remove.isPending}
          onClick={() =>
            restroom.deletedAt
              ? remove.mutate(false)
              : confirm('Remove this listing? It will disappear for everyone except admins.') && remove.mutate(true)
          }
        >
          {restroom.deletedAt ? 'Restore listing' : 'Remove listing'}
        </button>
      </div>
      {!restroom.deletedAt && (
        <form
          className="stack-tight"
          onSubmit={(e) => {
            e.preventDefault()
            if (keepId && confirm('Merge this listing into the selected one? Reviews and favorites will move.')) {
              merge.mutate(undefined, { onSuccess: () => navigate(`/restroom/${keepId}`) })
            }
          }}
        >
          <label className="field">
            Merge this duplicate into
            <select value={keepId} onChange={(e) => setKeepId(e.target.value)}>
              <option value="">Choose a nearby listing…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatDistance(c.distanceMeters)})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="button button-secondary" disabled={!keepId || merge.isPending}>
            Merge
          </button>
        </form>
      )}
      <ErrorText error={remove.error ?? merge.error} />
    </section>
  )
}
