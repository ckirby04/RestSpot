import { RestroomMap } from './map/RestroomMap.tsx'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>RestSpot</h1>
      </header>
      <main className="app-main">
        <RestroomMap />
      </main>
    </div>
  )
}
