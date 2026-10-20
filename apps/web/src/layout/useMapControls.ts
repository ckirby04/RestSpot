import { useOutletContext } from 'react-router'
import type { Coordinates, RestroomResult } from '@restspot/shared'
import type { MapPicker } from '../map/RestroomMap.tsx'

/** How pages inside <MapLayout> drive the shared map. */
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
