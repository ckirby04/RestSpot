import { useEffect, useRef } from 'react'
import { maplibregl } from './maplibre.ts'

// Free, keyless vector tiles (OpenStreetMap data). See docs/DECISIONS.md.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

// University of Arkansas, Fayetteville — shown until we know the user's location.
const DEFAULT_CENTER: [number, number] = [-94.1737, 36.0687]

export function RestroomMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 14,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    )

    return () => map.remove()
  }, [])

  return <div ref={containerRef} className="map" role="region" aria-label="Restroom map" />
}
