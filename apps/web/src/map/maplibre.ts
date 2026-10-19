import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre looks for its worker next to its own module, which doesn't survive
// Vite's bundling. Point it at the copy Vite emits as an asset.
maplibregl.setWorkerUrl(workerUrl)

export { maplibregl }
