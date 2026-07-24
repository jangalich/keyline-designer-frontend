import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import DrawTool from './DrawTool.jsx'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Starting map view — a neutral, zoomed-out view of the continental US
// rather than any one specific property. Anyone opening the tool for the
// first time should see a blank slate, not someone else's land — they'll
// search their own address or zoom in manually from here.
const DEFAULT_CENTER = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4

// The backend API's address. Set VITE_API_URL at build/deploy time to
// point at the live backend; falls back to the local dev server.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function App() {
  // Points are stored as [latitude, longitude] — Leaflet's native order —
  // while drawing/editing. Converted to [longitude, latitude] only when
  // sending to the backend, since that's the order soil_data.py,
  // elevation_data.py, etc. expect.
  const [points, setPoints] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isFinished, setIsFinished] = useState(false)

  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const [mapCenter, setMapCenter] = useState(null)

  const handleStartDrawing = () => {
    setPoints([])
    setIsDrawing(true)
    setIsFinished(false)
    setReport(null)
    setError(null)
  }

  const handleUndoLastPoint = () => {
    setPoints(points.slice(0, -1))
  }

  const handleFinishDrawing = () => {
    setIsDrawing(false)
    setIsFinished(true)
  }

  const handleRedraw = () => {
    setPoints([])
    setIsDrawing(true)
    setIsFinished(false)
    setReport(null)
    setError(null)
  }

  const handlePointsChange = (newPoints) => {
    setPoints(newPoints)
    // Editing an already-finished shape should clear a stale report,
    // same reasoning as before — old results shouldn't linger next to
    // an adjusted boundary.
    if (isFinished) {
      setReport(null)
      setError(null)
    }
  }

  const handleGenerateReport = async () => {
    setIsLoading(true)
    setError(null)
    setReport(null)

    // Convert to [longitude, latitude] here, right before sending —
    // everywhere else in the frontend works in Leaflet's native
    // [latitude, longitude] order.
    const boundary = points.map(([lat, lng]) => [lng, lat])

    try {
      const response = await fetch(`${API_URL}/api/generate-report-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong generating the report.')
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = 'scale_of_permanence_report.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)

      setReport(true)
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          'Could not reach the backend. Make sure api.py is running locally (python3 api.py).'
        )
      } else {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Keyline Designer</h1>
        <p>Draw the boundary of the area you want to design — this can be your whole property or just the section you plan to farm.</p>
        <AddressSearch onLocationSelected={setMapCenter} />
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
          <MapRecenter center={mapCenter} zoom={18} />
          <DrawTool
            isDrawing={isDrawing}
            isFinished={isFinished}
            points={points}
            onPointsChange={handlePointsChange}
          />
        </MapContainer>
      </div>

      <div className="status-panel">
        {!isDrawing && !isFinished && (
          <>
            <p className="status-empty">
              Click "Start Drawing" then click points on the map to trace your boundary.
            </p>
            <button className="generate-button" onClick={handleStartDrawing}>
              Start Drawing Boundary
            </button>
          </>
        )}

        {isDrawing && (
          <>
            <p className="status-ready">
              {points.length} point{points.length !== 1 ? 's' : ''} placed
              {points.length < 3 && ' — need at least 3 to finish'}.
            </p>
            <div className="button-row">
              <button
                className="generate-button secondary"
                onClick={handleUndoLastPoint}
                disabled={points.length === 0}
              >
                Undo Last Point
              </button>
              <button
                className="generate-button"
                onClick={handleFinishDrawing}
                disabled={points.length < 3}
              >
                Finish Boundary
              </button>
            </div>
          </>
        )}

        {isFinished && !report && !isLoading && (
          <>
            <p className="status-ready">
              Boundary set — {points.length} points. Drag any point on the map to adjust it.
            </p>
            <div className="button-row">
              <button className="generate-button secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button className="generate-button" onClick={handleGenerateReport}>
                Generate Scale of Permanence Report
              </button>
            </div>
          </>
        )}

        {isLoading && (
          <p className="status-loading">
            Analyzing your land — fetching climate, soil, elevation, and water
            data, then generating your report. This takes about 30-60 seconds.
          </p>
        )}

        {error && <p className="status-error">{error}</p>}

        {report && (
          <div className="report">
            <div className="button-row">
              <button className="generate-button secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button className="generate-button secondary" onClick={handleGenerateReport}>
                Regenerate Report
              </button>
            </div>
            <p className="status-ready">
              Your report downloaded as scale_of_permanence_report.pdf.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
