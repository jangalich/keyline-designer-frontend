import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import ReactMarkdown from 'react-markdown'
import DrawTool from './DrawTool.jsx'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import MapLayers from './MapLayers.jsx'
import LayerLegend from './LayerLegend.jsx'
import { DEFAULT_VISIBLE_GROUP_KEYS } from './mapLayerConfig.js'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Starting map view — a neutral, zoomed-out view of the continental US
// rather than any one specific property. Anyone opening the tool for the
// first time should see a blank slate, not someone else's land — they'll
// search their own address or zoom in manually from here.
const DEFAULT_CENTER = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4

// The backend API's local address. Once deployed (Render/Railway), this
// would change to that live URL instead — worth pulling into an
// environment variable at that point rather than hardcoding, but a
// plain constant is fine for local development.
const API_URL = 'http://localhost:5000'

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

  // The merged FeatureCollection of every backend map layer for the most
  // recently generated report, plus a version counter that's bumped every
  // time new layers arrive — see MapLayers.jsx for why the version is
  // needed (react-leaflet's <GeoJSON> doesn't re-diff new data on its own).
  const [mapLayers, setMapLayers] = useState(null)
  const [layersVersion, setLayersVersion] = useState(0)
  const [visibleGroupKeys, setVisibleGroupKeys] = useState(DEFAULT_VISIBLE_GROUP_KEYS)

  const handleToggleLayerGroup = (groupKey) => {
    setVisibleGroupKeys((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const handleStartDrawing = () => {
    setPoints([])
    setIsDrawing(true)
    setIsFinished(false)
    setReport(null)
    setError(null)
    setMapLayers(null)
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
    setMapLayers(null)
  }

  const handlePointsChange = (newPoints) => {
    setPoints(newPoints)
    // Editing an already-finished shape should clear a stale report,
    // same reasoning as before — old results shouldn't linger next to
    // an adjusted boundary.
    if (isFinished) {
      setReport(null)
      setError(null)
      setMapLayers(null)
    }
  }

  const handleGenerateReport = async () => {
    setIsLoading(true)
    setError(null)
    setReport(null)
    setMapLayers(null)

    // Convert to [longitude, latitude] here, right before sending —
    // everywhere else in the frontend works in Leaflet's native
    // [latitude, longitude] order.
    const boundary = points.map(([lat, lng]) => [lng, lat])

    try {
      const response = await fetch(`${API_URL}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong generating the report.')
      }

      setReport(data.report)
      setMapLayers(data.layers || null)
      setLayersVersion((v) => v + 1)
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
          <MapLayers
            layers={mapLayers}
            visibleGroupKeys={visibleGroupKeys}
            layersVersion={layersVersion}
          />
        </MapContainer>
        <LayerLegend
          layers={mapLayers}
          visibleGroupKeys={visibleGroupKeys}
          onToggleGroup={handleToggleLayerGroup}
        />
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
            <div className="report-text">
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
