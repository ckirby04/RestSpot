import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext } from 'react-router'
import type { Coordinates, RestroomResult } from '@restspot/shared'
import { useLiveRestroomUpdates } from '../api/hooks.ts'
import { RestroomMap, type MapPicker } from '../map/RestroomMap.tsx'
import { useSearchState } from '../search/SearchContext.tsx'

export interface MapControls {
  /** Pins to show on the map. */
  showResults(results: RestroomResult[]): void
  select(id: string | null): void
  focusOn(center: Coordinates, zoom?: number): void
  /** Put the map in "place a pin" mode (add/edit), or null to leave it. */
  setPicker(picker: MapPicker | null): void
  /** Where the user last panned the map to, if they moved it themselves. */
  movedCenter: Coordinates | null
  clearMovedCenter(): void
}

export function useMapControls(): MapControls {
  return useOutletContext<MapControls>()
}

/** Two-pane layout: page content in a side panel, persistent map beside it. */
export function MapLayout() {
  const navigate = useNavigate()
  const { origin, filters, deviceLocation } = useSearchState()
  const [results, setResults] = useState<RestroomResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picker, setPicker] = useState<MapPicker | null>(null)
  const [focus, setFocus] = useState<{ center: Coordinates; zoom?: number } | null>(null)
  const [movedCenter, setMovedCenter] = useState<Coordinates | null>(null)
  useLiveRestroomUpdates()

  const controls = useMemo<MapControls>(
    () => ({
      showResults: setResults,
      select: setSelectedId,
      focusOn: (center, zoom) => setFocus({ center, zoom }),
      setPicker,
      movedCenter,
      clearMovedCenter: () => setMovedCenter(null),
    }),
    [movedCenter],
  )

  return (
    <div className="map-layout">
      <section className="panel" aria-label="Restroom details and search">
        <Outlet context={controls} />
      </section>
      <div className="map-pane">
        <RestroomMap
          results={results}
          selectedId={selectedId}
          onSelect={(id) => navigate(`/restroom/${id}`)}
          origin={origin?.coordinates ?? null}
          radiusMiles={filters.radiusMiles}
          deviceLocation={deviceLocation}
          originPin={origin && origin.kind !== 'device' ? origin.coordinates : null}
          picker={picker}
          focus={focus}
          onMoveEnd={setMovedCenter}
        />
        {picker && <div className="map-hint">Click the map or drag the pin to set the location</div>}
      </div>
    </div>
  )
}
