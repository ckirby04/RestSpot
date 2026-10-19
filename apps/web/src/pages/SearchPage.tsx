import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  ACCESS_SHORT_LABELS,
  distanceMeters,
  formatDistance,
  LIMITS,
  type SearchFilters,
} from '@restspot/shared'
import { useSearch } from '../api/hooks.ts'
import { ErrorText, OpenStatus, RestroomFeatures, Spinner, Stars } from '../components/ui.tsx'
import { useMapControls } from '../layout/MapLayout.tsx'
import { geocodeAddress, type GeocodeResult } from '../lib/location.ts'
import { DEFAULT_FILTERS, useSearchState } from '../search/SearchContext.tsx'

const RADIUS_OPTIONS = [0.1, 0.25, 0.5, 1, 2, 5, 10, LIMITS.radiusMaxMiles]

const TOGGLE_FILTERS: { key: keyof SearchFilters; label: string }[] = [
  { key: 'openNow', label: 'Open now' },
  { key: 'adaAccessible', label: 'Wheelchair accessible' },
  { key: 'changingTable', label: 'Changing table' },
  { key: 'allGender', label: 'All-gender' },
  { key: 'family', label: 'Family room' },
  { key: 'singleUser', label: 'Single-user / private' },
  { key: 'publicOnly', label: 'Open to the public' },
  { key: 'freeOnly', label: 'Free' },
]

export function SearchPage() {
  const { origin, setOrigin, filters, setFilters, locating, locationError, locateMe } = useSearchState()
  const map = useMapControls()
  const { data: results, isFetching, error } = useSearch(origin?.coordinates ?? null, filters)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    map.select(null)
    map.setPicker(null)
  }, [map])

  useEffect(() => {
    map.showResults(results ?? [])
  }, [map, results])

  useEffect(() => {
    if (origin) map.focusOn(origin.coordinates, zoomForRadius(filters.radiusMiles))
    // Recenter only when the origin itself changes, not on every filter tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin])

  const activeFilterCount = TOGGLE_FILTERS.filter((f) => filters[f.key]).length + (filters.minCleanliness ? 1 : 0)
  const movedFar =
    map.movedCenter && origin && distanceMeters(map.movedCenter, origin.coordinates) > Math.max(300, filters.radiusMiles * 400)

  return (
    <div className="search-page">
      <h1 className="visually-hidden">Find a restroom</h1>

      <LocationBar
        originLabel={origin?.label ?? null}
        locating={locating}
        locationError={locationError}
        onLocate={() => void locateMe()}
        onPick={(r) => setOrigin({ coordinates: r.coordinates, label: r.shortLabel, kind: 'address' })}
      />

      <div className="filter-bar">
        <label className="inline-field">
          Within{' '}
          <select
            value={filters.radiusMiles}
            onChange={(e) => setFilters({ ...filters, radiusMiles: Number(e.target.value) })}
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} {r === 1 ? 'mile' : 'miles'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary"
          aria-expanded={showFilters}
          aria-controls="filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="link-button"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, radiusMiles: filters.radiusMiles })}
          >
            Clear
          </button>
        )}
      </div>

      <div id="filters" className="filters" hidden={!showFilters}>
        <fieldset>
          <legend className="visually-hidden">Only show restrooms that are</legend>
          <div className="chips">
            {TOGGLE_FILTERS.map((f) => (
              <label key={f.key} className={`chip ${filters[f.key] ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(filters[f.key])}
                  onChange={(e) => setFilters({ ...filters, [f.key]: e.target.checked })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-field">
          Cleanliness{' '}
          <select
            value={filters.minCleanliness ?? ''}
            onChange={(e) => setFilters({ ...filters, minCleanliness: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Any</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 5 ? '5 stars' : `${n}+ stars`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {movedFar && map.movedCenter && (
        <button
          type="button"
          className="button button-secondary search-area"
          onClick={() => {
            setOrigin({ coordinates: map.movedCenter!, label: 'Map area', kind: 'map' })
            map.clearMovedCenter()
          }}
        >
          Search this area
        </button>
      )}

      <ErrorText error={error} />

      {!origin ? (
        locating ? (
          <Spinner label="Finding your location" />
        ) : (
          <p className="muted">Choose a location to see nearby restrooms.</p>
        )
      ) : (
        <ResultsList results={results} loading={isFetching && !results} />
      )}

      <p className="add-cta">
        Know a restroom that’s missing? <Link to="/add">Add it</Link>
      </p>
    </div>
  )
}

function ResultsList({ results, loading }: { results: ReturnType<typeof useSearch>['data']; loading: boolean }) {
  if (loading) return <Spinner label="Searching" />
  if (!results) return null
  return (
    <>
      <p className="result-count" role="status" aria-live="polite">
        {results.length === 0
          ? 'No restrooms match. Try a larger radius or fewer filters.'
          : `${results.length} restroom${results.length === 1 ? '' : 's'} nearby`}
      </p>
      <ol className="results">
        {results.map((r) => (
          <li key={r.id}>
            <Link to={`/restroom/${r.id}`} className="result-card">
              <span className="result-head">
                <span className="result-name">{r.name}</span>
                <span className="result-distance">{formatDistance(r.distanceMeters)}</span>
              </span>
              <span className="result-meta">
                <OpenStatus isOpen={r.isOpen} />
                <span>{ACCESS_SHORT_LABELS[r.accessType]}</span>
                {r.reviewCount > 0 && <Stars value={r.avgOverall} label="Overall rating" />}
                {!r.verified && <span className="muted">Unverified</span>}
              </span>
              <RestroomFeatures restroom={r} />
            </Link>
          </li>
        ))}
      </ol>
    </>
  )
}

function LocationBar(props: {
  originLabel: string | null
  locating: boolean
  locationError: string | null
  onLocate(): void
  onPick(r: GeocodeResult): void
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodeResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const found = await geocodeAddress(query.trim())
      if (found.length === 1) {
        props.onPick(found[0])
        setMatches(null)
      } else {
        setMatches(found)
        if (found.length === 0) setError('No matching places. Try adding a city or ZIP code.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address search failed')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="location-bar">
      <p className="location-current">
        {props.originLabel ? (
          <>
            Near <strong>{props.originLabel}</strong>
          </>
        ) : (
          'Where are you?'
        )}
      </p>
      <form className="address-form" role="search" onSubmit={submit}>
        <label htmlFor="address" className="visually-hidden">
          Address or place
        </label>
        <input
          id="address"
          type="search"
          placeholder="Address, place, or ZIP"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="street-address"
        />
        <button type="submit" className="button" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        <button type="button" className="button button-secondary" onClick={props.onLocate} disabled={props.locating}>
          {props.locating ? 'Locating…' : 'Use my location'}
        </button>
      </form>
      {props.locationError && !props.originLabel && (
        <p className="notice" role="alert">
          {props.locationError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {matches && matches.length > 0 && (
        <ul className="geocode-matches" aria-label="Matching places">
          {matches.map((m) => (
            <li key={m.label}>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  props.onPick(m)
                  setMatches(null)
                }}
              >
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function zoomForRadius(miles: number): number {
  return Math.max(9, Math.min(17, 14.5 - Math.log2(Math.max(miles, 0.1))))
}
