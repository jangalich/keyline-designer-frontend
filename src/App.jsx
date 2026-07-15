import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import DrawControl from './DrawControl.jsx'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import './App.css'

// Starting map view — centered on the user's own property as a sensible
// default. Once this connects to a real backend, this could instead
// start from the address the user types in (via geocode.py).
const DEFAULT_CENTER = [40.642485, -79.981816]
const DEFAULT_ZOOM = 16

function App() {
  const [boundary, setBoundary] = useState(null)

  return (
    <div className="page">
      <header className="header">
        <h1>Keyline Designer</h1>
        <p>Draw the boundary of the area you want to design — this can be your whole property or just the section you plan to farm.</p>
      </header>

      <div className="map-wrapper">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxZoom={19}
          />
          <DrawControl onBoundaryChange={setBoundary} />
        </MapContainer>
      </div>

      <div className="status-panel">
        {boundary ? (
          <>
            <p className="status-ready">
              Boundary drawn — {boundary.length} points captured.
            </p>
            <details>
              <summary>View raw coordinates</summary>
              <pre>{JSON.stringify(boundary, null, 2)}</pre>
            </details>
            <p className="next-step-note">
              Next: this boundary will be sent to the backend to generate a
              Scale of Permanence report, once the backend is deployed.
            </p>
          </>
        ) : (
          <p className="status-empty">
            Use the polygon tool (top-right of the map) to draw your boundary.
          </p>
        )}
      </div>
    </div>
  )
}

export default App
