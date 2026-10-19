import { useEffect, useId, useRef, type ReactNode } from 'react'
import {
  DESIGNATION_LABELS,
  LAYOUT_LABELS,
  TRI_STATE_LABELS,
  type Restroom,
  type Room,
  type TriState,
} from '@restspot/shared'

export function OpenStatus({ isOpen }: { isOpen: boolean | null }) {
  if (isOpen === true) return <span className="status status-open">Open now</span>
  if (isOpen === false) return <span className="status status-closed">Closed now</span>
  return <span className="status status-unknown">Hours unknown</span>
}

/** One-line summary of what a listing has, for result cards. */
export function RestroomFeatures({ restroom }: { restroom: Pick<Restroom, 'rooms' | 'fee' | 'accessType'> }) {
  const rooms = restroom.rooms
  const features: string[] = []
  const designations = [...new Set(rooms.map((r) => r.designation))]
  features.push(...designations.map((d) => DESIGNATION_LABELS[d]))
  if (rooms.some((r) => r.layout === 'family')) features.push('Family room')
  if (rooms.some((r) => r.adaAccessible === 'yes')) features.push('Accessible')
  if (rooms.some((r) => r.changingTable === 'yes')) features.push('Changing table')
  if (restroom.fee === 'paid') features.push('Paid')
  return (
    <ul className="tags" aria-label="Features">
      {features.map((f) => (
        <li key={f} className="tag">
          {f}
        </li>
      ))}
    </ul>
  )
}

function triText(label: string, value: TriState) {
  if (value === 'yes') return label
  if (value === 'no') return `No ${label.toLowerCase()}`
  return `${label}: not sure`
}

export function RoomRow({ room }: { room: Room }) {
  return (
    <li className="room-row">
      <span className="room-name">
        {DESIGNATION_LABELS[room.designation]} · {LAYOUT_LABELS[room.layout]}
      </span>
      <span className="room-amenities">
        <span className={`amenity amenity-${room.adaAccessible}`}>{triText('Accessible', room.adaAccessible)}</span>
        <span className={`amenity amenity-${room.changingTable}`}>{triText('Changing table', room.changingTable)}</span>
      </span>
    </li>
  )
}

export function Stars({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="muted">No ratings yet</span>
  const rounded = Math.round(value)
  return (
    <span className="stars" role="img" aria-label={`${label}: ${value.toFixed(1)} out of 5`}>
      <span aria-hidden="true">
        {'★'.repeat(rounded)}
        <span className="stars-empty">{'★'.repeat(5 - rounded)}</span>
      </span>{' '}
      <span aria-hidden="true">{value.toFixed(1)}</span>
    </span>
  )
}

export function StarInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange(v: number): void
}) {
  const name = useId()
  return (
    <fieldset className="star-input">
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={value !== null && n <= value ? 'on' : ''}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
          <span aria-hidden="true">★</span>
          <span className="visually-hidden">
            {n} star{n > 1 ? 's' : ''}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  hideLegend,
}: {
  legend: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange(v: T): void
  hideLegend?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="segmented">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      <div className="segmented-options">
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? 'on' : ''}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export const TRI_STATE_OPTIONS = (['yes', 'no', 'unknown'] as const).map((v) => ({ value: v, label: TRI_STATE_LABELS[v] }))

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return (
    <p className="error" role="alert">
      {message}
    </p>
  )
}

/** Accessible modal built on the native <dialog> element. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose(): void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {open && children}
    </dialog>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="muted" role="status" aria-live="polite">
      {label}…
    </p>
  )
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(iso)
}
