import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ACCESS_SHORT_LABELS,
  ACCESS_TYPES,
  DESIGNATION_LABELS,
  formatDistance,
  LAYOUT_LABELS,
  LIMITS,
  locationInputSchema,
  ROOM_DESIGNATIONS,
  ROOM_LAYOUTS,
  timeZoneAt,
  WEEKDAY_NAMES,
  type AccessType,
  type Coordinates,
  type DayHours,
  type FeeType,
  type PossibleDuplicate,
  type RoomDesignation,
  type Room,
  type TriState,
  type WeeklyHours,
} from '@restspot/shared'
import { useApi } from '../api/useApi.ts'
import { useInvalidateRestroom, useRestroom, useSearch } from '../api/hooks.ts'
import { useAuth } from '../auth/useAuth.ts'
import { TRI_STATE_OPTIONS } from '../components/options.ts'
import { ErrorText, Segmented, Spinner } from '../components/ui.tsx'
import { useMapControls } from '../layout/useMapControls.ts'
import { useSearchState } from '../search/useSearchState.ts'

const UNKNOWN_WEEK: WeeklyHours = Array(7).fill({ kind: 'unknown' }) as WeeklyHours

interface FormState {
  name: string
  coordinates: Coordinates | null
  accessType: AccessType | null
  fee: FeeType
  keyRequired: TriState
  rooms: Room[]
  hours: WeeklyHours
  notes: string
}

const EMPTY_FORM: FormState = {
  name: '',
  coordinates: null,
  accessType: null,
  fee: 'unknown',
  keyRequired: 'unknown',
  rooms: [],
  hours: UNKNOWN_WEEK,
  notes: '',
}

function newRoom(designation: RoomDesignation, family = false, like?: Room): Room {
  return {
    designation: family ? 'all_gender' : designation,
    layout: family ? 'family' : designation === 'all_gender' ? 'single_user' : 'multi_stall',
    // New rooms inherit amenities from existing ones: they usually match.
    adaAccessible: like?.adaAccessible ?? 'unknown',
    changingTable: like?.changingTable ?? 'unknown',
  }
}

export function RestroomFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { session, profileLoading, canContribute, isSuspended } = useAuth()
  const location = useLocation()
  const { data: existing, isLoading } = useRestroom(id)

  if (session === undefined || profileLoading || (isEdit && isLoading)) return <Spinner />
  if (!session) {
    return (
      <div className="stack">
        <h1>{isEdit ? 'Edit restroom' : 'Add a restroom'}</h1>
        <p>
          Please{' '}
          <Link to="/signin" state={{ from: location.pathname }}>
            sign in
          </Link>{' '}
          or{' '}
          <Link to="/signup" state={{ from: location.pathname }}>
            create an account
          </Link>{' '}
          to add or edit restrooms.
        </p>
      </div>
    )
  }
  if (isSuspended || !canContribute) {
    return (
      <div className="stack">
        <h1>{isEdit ? 'Edit restroom' : 'Add a restroom'}</h1>
        <p className="notice">Your account is suspended, so you can’t make changes right now.</p>
      </div>
    )
  }
  if (isEdit && !existing) {
    return (
      <div>
        <h1>Restroom not found</h1>
        <Link to="/">Back to search</Link>
      </div>
    )
  }

  const initial: FormState = existing
    ? {
        name: existing.name,
        coordinates: existing.coordinates,
        accessType: existing.accessType,
        fee: existing.fee,
        keyRequired: existing.keyRequired,
        rooms: existing.rooms.map((r) => ({ ...r })),
        hours: existing.hours,
        notes: existing.notes ?? '',
      }
    : EMPTY_FORM
  return <RestroomForm key={id ?? 'new'} id={id} initial={initial} />
}

function RestroomForm({ id, initial }: { id?: string; initial: FormState }) {
  const api = useApi()
  const navigate = useNavigate()
  const map = useMapControls()
  const invalidate = useInvalidateRestroom()
  const { deviceLocation, origin, filters } = useSearchState()
  const [form, setForm] = useState<FormState>(() =>
    initial.coordinates || id ? initial : { ...initial, coordinates: deviceLocation ?? null },
  )
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Show existing restrooms so people notice duplicates before filling in the form.
  const { data: nearby } = useSearch(origin?.coordinates ?? null, filters)
  useEffect(() => {
    map.showResults(nearby ?? [])
  }, [map, nearby])

  // Map pin picking.
  const coordinates = form.coordinates
  useEffect(() => {
    map.select(id ?? null)
    map.setPicker({ coordinates, onChange: (c) => setForm((f) => ({ ...f, coordinates: c })) })
  }, [map, coordinates, id])
  useEffect(() => () => map.setPicker(null), [map])
  useEffect(() => {
    const start = initial.coordinates ?? deviceLocation ?? origin?.coordinates
    if (start) map.focusOn(start, 17)
    // Center once when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warn about similar listings nearby (debounced).
  useEffect(() => {
    if (!coordinates || form.name.trim().length < 2) {
      setDuplicates([])
      return
    }
    const t = setTimeout(() => {
      api.findPossibleDuplicates(coordinates, form.name, id).then(setDuplicates, () => setDuplicates([]))
    }, 500)
    return () => clearTimeout(t)
  }, [api, coordinates, form.name, id])

  // Move focus to the error summary so screen reader users hear what to fix.
  useEffect(() => {
    if (errors.length) document.getElementById('form-errors')?.focus()
  }, [errors])

  const timeZone = useMemo(() => (coordinates ? timeZoneAt(coordinates) : null), [coordinates])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const parsed = locationInputSchema.safeParse({
      name: form.name,
      coordinates: form.coordinates,
      accessType: form.accessType,
      fee: form.fee,
      keyRequired: form.keyRequired,
      hours: form.hours,
      notes: form.notes,
      rooms: form.rooms,
    })
    if (!parsed.success || !timeZone) {
      const messages = parsed.success ? [] : parsed.error.issues.map((i) => describeIssue(i.path, i.message))
      if (!form.coordinates) messages.unshift('Set the location by clicking the map.')
      setErrors([...new Set(messages)])
      return
    }
    setErrors([])
    setSaving(true)
    try {
      const savedId = await api.saveRestroom({ ...parsed.data, timeZone }, id)
      invalidate(savedId)
      navigate(`/restroom/${savedId}`)
    } catch (err) {
      setSaveError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="restroom-form stack" onSubmit={submit} noValidate>
      <Link to={id ? `/restroom/${id}` : '/'} className="back-link">
        ← Cancel
      </Link>
      <h1>{id ? 'Edit restroom' : 'Add a restroom'}</h1>

      {errors.length > 0 && (
        <div id="form-errors" className="error-summary" role="alert" tabIndex={-1}>
          <p>Please fix the following:</p>
          <ul>
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="field">
        <span>
          Name of the place <span className="required">(required)</span>
        </span>
        <input
          value={form.name}
          maxLength={LIMITS.nameMax}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Fayetteville Public Library"
          required
        />
      </label>

      {duplicates.length > 0 && (
        <div className="notice" role="status">
          <p>
            <strong>Is this already listed?</strong> Similar listings nearby:
          </p>
          <ul>
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link to={`/restroom/${d.id}`} target="_blank">
                  {d.name}
                </Link>{' '}
                ({formatDistance(d.distanceMeters)} away)
              </li>
            ))}
          </ul>
          <p className="hint">If it’s the same place, edit that listing instead of adding a new one.</p>
        </div>
      )}

      <fieldset className="field">
        <legend>
          Location <span className="required">(required)</span>
        </legend>
        <p className="hint">
          {form.coordinates
            ? `Pin set at ${form.coordinates.lat.toFixed(5)}, ${form.coordinates.lng.toFixed(5)}. Drag the pin or click the map to adjust.`
            : 'Click the map where the restroom is, or use your location.'}
        </p>
        <button
          type="button"
          className="button button-secondary"
          disabled={!deviceLocation}
          onClick={() => {
            if (deviceLocation) {
              set('coordinates', deviceLocation)
              map.focusOn(deviceLocation, 18)
            }
          }}
        >
          Use my location
        </button>
      </fieldset>

      <Segmented
        legend="Who can use it? (required)"
        value={form.accessType ?? ('' as AccessType)}
        options={ACCESS_TYPES.map((a) => ({ value: a, label: ACCESS_SHORT_LABELS[a] }))}
        onChange={(v) => set('accessType', v)}
      />
      <div className="row wrap">
        <Segmented
          legend="Cost"
          value={form.fee}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'paid', label: 'Paid' },
            { value: 'unknown', label: 'Not sure' },
          ]}
          onChange={(v) => set('fee', v)}
        />
        <Segmented
          legend="Key or code needed?"
          value={form.keyRequired}
          options={TRI_STATE_OPTIONS}
          onChange={(v) => set('keyRequired', v)}
        />
      </div>

      <RoomsEditor rooms={form.rooms} onChange={(rooms) => set('rooms', rooms)} />
      <HoursEditor hours={form.hours} onChange={(hours) => set('hours', hours)} />

      <label className="field">
        Notes (optional)
        <textarea
          value={form.notes}
          maxLength={LIMITS.notesMax}
          rows={3}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="e.g. Second floor, past the elevators. Ask the cashier for the key."
        />
        <span className="hint">
          {form.notes.length}/{LIMITS.notesMax}
        </span>
      </label>

      <ErrorText error={saveError} />
      <div className="row">
        <button type="submit" className="button" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Add restroom'}
        </button>
        <Link to={id ? `/restroom/${id}` : '/'} className="button button-secondary">
          Cancel
        </Link>
      </div>
    </form>
  )
}

function RoomsEditor({ rooms, onChange }: { rooms: Room[]; onChange(rooms: Room[]): void }) {
  const update = (i: number, patch: Partial<Room>) =>
    onChange(rooms.map((r, j) => (j === i ? normalizeRoom({ ...r, ...patch }) : r)))
  const setAll = (patch: Partial<Room>) => onChange(rooms.map((r) => ({ ...r, ...patch })))
  const allSame = (key: 'adaAccessible' | 'changingTable'): TriState | '' =>
    rooms.length > 0 && rooms.every((r) => r[key] === rooms[0][key]) ? rooms[0][key] : ''

  return (
    <fieldset className="rooms-editor">
      <legend>
        Rooms <span className="required">(required)</span>
      </legend>
      <p className="hint">Add each restroom at this place. Most places have a men’s and a women’s room.</p>
      <div className="row wrap">
        {ROOM_DESIGNATIONS.map((d) => (
          <button
            key={d}
            type="button"
            className="button button-secondary"
            onClick={() => onChange([...rooms, newRoom(d, false, rooms[0])])}
          >
            + {DESIGNATION_LABELS[d]}
          </button>
        ))}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onChange([...rooms, newRoom('all_gender', true, rooms[0])])}
        >
          + Family room
        </button>
      </div>

      {rooms.length > 1 && (
        <div className="all-rooms">
          <p>
            <strong>For all rooms</strong> <span className="hint">(you can change individual rooms below)</span>
          </p>
          <div className="row wrap">
            <Segmented
              legend="Wheelchair accessible"
              value={allSame('adaAccessible') as TriState}
              options={TRI_STATE_OPTIONS}
              onChange={(v) => setAll({ adaAccessible: v })}
            />
            <Segmented
              legend="Changing table"
              value={allSame('changingTable') as TriState}
              options={TRI_STATE_OPTIONS}
              onChange={(v) => setAll({ changingTable: v })}
            />
          </div>
        </div>
      )}

      <ol className="room-editor-list">
        {rooms.map((room, i) => (
          <li key={i} className="room-editor">
            <div className="row wrap">
              <label className="inline-field">
                Room{' '}
                <select
                  value={room.designation}
                  onChange={(e) => update(i, { designation: e.target.value as RoomDesignation })}
                  disabled={room.layout === 'family'}
                >
                  {ROOM_DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>
                      {DESIGNATION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-field">
                Type{' '}
                <select value={room.layout} onChange={(e) => update(i, { layout: e.target.value as Room['layout'] })}>
                  {ROOM_LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {LAYOUT_LABELS[l]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="link-button danger"
                onClick={() => onChange(rooms.filter((_, j) => j !== i))}
                aria-label={`Remove ${DESIGNATION_LABELS[room.designation]} room`}
              >
                Remove
              </button>
            </div>
            <div className="row wrap">
              <Segmented
                legend="Wheelchair accessible"
                value={room.adaAccessible}
                options={TRI_STATE_OPTIONS}
                onChange={(v) => update(i, { adaAccessible: v })}
              />
              <Segmented
                legend="Changing table"
                value={room.changingTable}
                options={TRI_STATE_OPTIONS}
                onChange={(v) => update(i, { changingTable: v })}
              />
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  )
}

/** Family rooms are always all-gender. */
function normalizeRoom(room: Room): Room {
  return room.layout === 'family' ? { ...room, designation: 'all_gender' } : room
}

type DayKind = DayHours['kind']
const DAY_KIND_LABELS: Record<DayKind, string> = {
  unknown: 'Not sure',
  closed: 'Closed',
  all_day: 'Open 24 hours',
  open: 'Open',
}

function HoursEditor({ hours, onChange }: { hours: WeeklyHours; onChange(h: WeeklyHours): void }) {
  const setDay = (i: number, d: DayHours) => onChange(hours.map((h, j) => (j === i ? d : h)) as WeeklyHours)
  const fill = (d: DayHours, days: number[] = [0, 1, 2, 3, 4, 5, 6]) =>
    onChange(hours.map((h, j) => (days.includes(j) ? d : h)) as WeeklyHours)

  return (
    <fieldset className="hours-editor">
      <legend>Hours</legend>
      <div className="row wrap">
        <button type="button" className="link-button" onClick={() => fill({ kind: 'all_day' })}>
          Open 24/7
        </button>
        <button type="button" className="link-button" onClick={() => fill(hours[1])}>
          Use Monday’s hours every day
        </button>
        <button type="button" className="link-button" onClick={() => fill(hours[1], [2, 3, 4, 5])}>
          Copy Monday to weekdays
        </button>
        <button type="button" className="link-button" onClick={() => fill({ kind: 'unknown' })}>
          Clear
        </button>
      </div>
      <table className="hours-table">
        <tbody>
          {hours.map((d, i) => (
            <tr key={i}>
              <th scope="row">{WEEKDAY_NAMES[i]}</th>
              <td>
                <select
                  aria-label={`${WEEKDAY_NAMES[i]} hours`}
                  value={d.kind}
                  onChange={(e) => {
                    const kind = e.target.value as DayKind
                    setDay(i, kind === 'open' ? { kind, open: '09:00', close: '17:00' } : { kind })
                  }}
                >
                  {(Object.keys(DAY_KIND_LABELS) as DayKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DAY_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {d.kind === 'open' && (
                  <span className="time-range">
                    <input
                      type="time"
                      aria-label={`${WEEKDAY_NAMES[i]} opens at`}
                      value={d.open}
                      onChange={(e) => setDay(i, { ...d, open: e.target.value })}
                      required
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="time"
                      aria-label={`${WEEKDAY_NAMES[i]} closes at`}
                      value={d.close}
                      onChange={(e) => setDay(i, { ...d, close: e.target.value })}
                      required
                    />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">A closing time earlier than the opening time means it closes after midnight.</p>
    </fieldset>
  )
}

function describeIssue(path: PropertyKey[], message: string): string {
  const [first, index] = path
  switch (first) {
    case 'name':
      return message === 'Name is required' ? 'Enter the name of the place.' : `Name: ${message}`
    case 'coordinates':
      return 'Set the location by clicking the map.'
    case 'accessType':
      return 'Choose who can use the restroom.'
    case 'rooms':
      return path.length === 1 ? 'Add at least one room.' : `Room ${Number(index) + 1}: ${message}`
    case 'hours':
      return `${WEEKDAY_NAMES[Number(index)] ?? 'Hours'}: enter opening and closing times.`
    case 'notes':
      return `Notes: ${message}`
    default:
      return message
  }
}
