import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import type { Coordinates, RestroomResult } from '@restspot/shared'
import { maplibregl } from './maplibre.ts'

// Free, keyless vector tiles (OpenStreetMap data). See docs/DECISIONS.md.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

// University of Arkansas — shown until we know where to search.
export const DEFAULT_CENTER: Coordinates = { lat: 36.0687, lng: -94.1737 }

export interface MapPicker {
  coordinates: Coordinates | null
  onChange(c: Coordinates): void
}

export interface RestroomMapProps {
  results: RestroomResult[]
  selectedId: string | null
  onSelect(id: string): void
  origin: Coordinates | null
  radiusMiles: number | null
  /** The device's location, drawn as a blue dot. */
  deviceLocation: Coordinates | null
  /** A searched address or map point, drawn as a dark pin. */
  originPin: Coordinates | null
  /** When set, clicking the map places a draggable pin (adding/editing a listing). */
  picker: MapPicker | null
  /** Changing this object recenters the map. */
  focus: { center: Coordinates; zoom?: number } | null
  onMoveEnd?(center: Coordinates): void
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

function circlePolygon(center: Coordinates, radiusMeters: number): Feature {
  const coords: [number, number][] = []
  const latR = radiusMeters / 111_320
  const lngR = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180))
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    coords.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

function pointCollection(c: Coordinates | null): FeatureCollection {
  return c
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } }],
      }
    : EMPTY
}

function resultsGeoJson(results: RestroomResult[], selectedId: string | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results.map((r) => ({
      type: 'Feature',
      id: r.id,
      properties: {
        id: r.id,
        name: r.name,
        status: r.isOpen === true ? 'open' : r.isOpen === false ? 'closed' : 'unknown',
        selected: r.id === selectedId,
      },
      geometry: { type: 'Point', coordinates: [r.coordinates.lng, r.coordinates.lat] },
    })),
  }
}

export function RestroomMap(props: RestroomMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const propsRef = useRef(props)
  useLayoutEffect(() => {
    propsRef.current = props
  })

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    map.on('load', () => {
      map.addSource('radius', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': '#0b6bcb', 'fill-opacity': 0.06 },
      })
      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#0b6bcb', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })

      map.addSource('device', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'device-halo',
        type: 'circle',
        source: 'device',
        paint: { 'circle-radius': 14, 'circle-color': '#1a73e8', 'circle-opacity': 0.2 },
      })
      map.addLayer({
        id: 'device-dot',
        type: 'circle',
        source: 'device',
        paint: {
          'circle-radius': 7,
          'circle-color': '#1a73e8',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })

      map.addSource('origin', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'origin-pin',
        type: 'circle',
        source: 'origin',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#1f2328',
          'circle-stroke-width': 4,
        },
      })

      map.addSource('restrooms', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'restrooms',
        type: 'circle',
        source: 'restrooms',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 12, 8],
          'circle-color': [
            'match',
            ['get', 'status'],
            'open',
            '#1a7f37',
            'closed',
            '#6e7781',
            /* unknown */ '#8250df',
          ],
          'circle-stroke-color': ['case', ['get', 'selected'], '#111111', '#ffffff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
        },
      })
      map.addLayer({
        id: 'restroom-labels',
        type: 'symbol',
        source: 'restrooms',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: { 'text-color': '#1f2328', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      })

      map.on('click', 'restrooms', (e) => {
        if (propsRef.current.picker) return
        const id = e.features?.[0]?.properties?.id
        if (id) propsRef.current.onSelect(String(id))
      })
      map.on('mouseenter', 'restrooms', () => {
        if (!propsRef.current.picker) map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'restrooms', () => {
        map.getCanvas().style.cursor = ''
      })
      setLoaded(true)
    })

    map.on('click', (e) => {
      propsRef.current.picker?.onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })
    map.on('moveend', (e) => {
      // Only report moves the user made, not our own flyTo calls.
      if ('originalEvent' in e && e.originalEvent) {
        const c = map.getCenter()
        propsRef.current.onMoveEnd?.({ lat: c.lat, lng: c.lng })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const { results, selectedId, origin, radiusMiles, deviceLocation, picker, focus, originPin } = props

  useEffect(() => {
    if (!loaded) return
    ;(mapRef.current?.getSource('restrooms') as GeoJSONSource | undefined)?.setData(
      resultsGeoJson(results, selectedId),
    )
  }, [loaded, results, selectedId])

  useEffect(() => {
    if (!loaded) return
    ;(mapRef.current?.getSource('radius') as GeoJSONSource | undefined)?.setData(
      origin && radiusMiles && !picker
        ? { type: 'FeatureCollection', features: [circlePolygon(origin, radiusMiles * 1609.344)] }
        : EMPTY,
    )
  }, [loaded, origin, radiusMiles, picker])

  useEffect(() => {
    if (!loaded) return
    ;(mapRef.current?.getSource('device') as GeoJSONSource | undefined)?.setData(pointCollection(deviceLocation))
  }, [loaded, deviceLocation])

  useEffect(() => {
    if (!loaded) return
    ;(mapRef.current?.getSource('origin') as GeoJSONSource | undefined)?.setData(pointCollection(originPin))
  }, [loaded, originPin])

  useEffect(() => {
    if (focus) mapRef.current?.flyTo({ center: [focus.center.lng, focus.center.lat], zoom: focus.zoom, duration: 800 })
  }, [focus])

  // Draggable pin while picking a location.
  const markerRef = useRef<Marker | null>(null)
  const pickerCoords = picker?.coordinates ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = picker ? 'crosshair' : ''
    if (!picker || !pickerCoords) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ draggable: true, color: '#cf222e' })
        .setLngLat([pickerCoords.lng, pickerCoords.lat])
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const ll = markerRef.current!.getLngLat()
        propsRef.current.picker?.onChange({ lat: ll.lat, lng: ll.lng })
      })
      markerRef.current.getElement().setAttribute('aria-label', 'Restroom location (drag to adjust)')
    } else {
      markerRef.current.setLngLat([pickerCoords.lng, pickerCoords.lat])
    }
  }, [picker, pickerCoords])

  return (
    <div
      ref={containerRef}
      className="map"
      role="region"
      aria-label="Map of restrooms. The list beside the map has the same results."
    />
  )
}
