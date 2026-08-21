import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import DrawTool from './DrawTool.jsx'
import AccessPointTool from './AccessPointTool.jsx'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
// ?react is vite-plugin-svgr: the asset becomes a React component and lands
// inline in the DOM. It has to be inline — the file draws with
// stroke="currentColor", which resolves against .contour-bg's own colour only
// while the SVG is part of this document. Referenced as a background-image or
// an <img src> it is a separate document with no inherited colour, and the
// linework renders black or not at all.
import ContourBackground from './assets/contour-background.svg?react'
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

  // Access point: where the property connects to a road, picked as a
  // point on the boundary line. Stored as [latitude, longitude], same
  // convention as `points`, and required by the backend before a report
  // can be generated.
  const [accessPoint, setAccessPoint] = useState(null)
  const [isSelectingAccessPoint, setIsSelectingAccessPoint] = useState(false)

  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const [mapCenter, setMapCenter] = useState(null)

  const handleStartDrawing = () => {
    setPoints([])
    setIsDrawing(true)
    setIsFinished(false)
    setAccessPoint(null)
    setIsSelectingAccessPoint(false)
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
    setAccessPoint(null)
    setIsSelectingAccessPoint(false)
    setReport(null)
    setError(null)
  }

  const handleSelectAccessPoint = () => {
    setIsSelectingAccessPoint(true)
  }

  const handleAccessPointPicked = (point) => {
    setAccessPoint(point)
  }

  const handleConfirmAccessPoint = () => {
    setIsSelectingAccessPoint(false)
  }

  const handleChangeAccessPoint = () => {
    setIsSelectingAccessPoint(true)
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
    const access_point = [accessPoint[1], accessPoint[0]]

    try {
      const response = await fetch(`${API_URL}/api/generate-report-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary, access_point }),
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
    <>
      {/* Decorative: real 3DEP contours of a dissected-plateau window, but
          they carry no information the page depends on. */}
      <ContourBackground className="contour-bg" aria-hidden="true" focusable="false" />

      <div className="page">
        <nav className="nav shell shell--wide">
          <span className="nav__mark">Keyline Designer</span>
          <a className="nav__link" href="#design">
            Design your land
          </a>
        </nav>

        <main>
          <section className="hero shell shell--wide">
            <h1>Conceptual farm planning, in the order the land decides.</h1>
            <p className="hero__subhead">
              Trace your property. Keyline Designer reads LiDAR elevation, soil survey,
              and hydrography, then works the Scale of Permanence in order — climate
              through soil.
            </p>
            <AddressSearch onLocationSelected={setMapCenter} />
          </section>

          <section id="design" className="tool shell shell--wide">
            <h2 className="visually-hidden">Design your land</h2>
            <div className="tool__frame">
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
            onCloseBoundary={handleFinishDrawing}
            editingDisabled={isSelectingAccessPoint}
          />
          <AccessPointTool
            isSelecting={isSelectingAccessPoint}
            boundaryPoints={points}
            accessPoint={accessPoint}
            onSelect={handleAccessPointPicked}
          />
        </MapContainer>
              </div>

              <div className="status-panel">
        {!isDrawing && !isFinished && (
          <>
            <p className="status-empty">
              Click "Start Drawing" then click points on the map to trace your boundary.
            </p>
            <button className="button" onClick={handleStartDrawing}>
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
                className="button button--secondary"
                onClick={handleUndoLastPoint}
                disabled={points.length === 0}
              >
                Undo Last Point
              </button>
              <button
                className="button"
                onClick={handleFinishDrawing}
                disabled={points.length < 3}
              >
                Finish Boundary
              </button>
            </div>
          </>
        )}

        {isFinished && !report && !isLoading && !isSelectingAccessPoint && !accessPoint && (
          <>
            <p className="status-ready">
              Boundary set — {points.length} points. Click "Select Access Point" then click a
              point on the boundary to indicate the preferred entry point for the property.
            </p>
            <div className="button-row">
              <button className="button button--secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button className="button" onClick={handleSelectAccessPoint}>
                Select Access Point
              </button>
            </div>
          </>
        )}

        {isFinished && !report && !isLoading && isSelectingAccessPoint && (
          <>
            <p className="status-ready">
              Click a point on the boundary to indicate the preferred entry point for the
              property.
            </p>
            <div className="button-row">
              <button className="button button--secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button
                className="button"
                onClick={handleConfirmAccessPoint}
                disabled={!accessPoint}
              >
                Confirm Access Point
              </button>
            </div>
          </>
        )}

        {isFinished && !report && !isLoading && !isSelectingAccessPoint && accessPoint && (
          <>
            <p className="status-ready">
              Boundary and access point set. Drag any boundary point on the map to adjust it.
            </p>
            <div className="button-row">
              <button className="button button--secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button className="button button--secondary" onClick={handleChangeAccessPoint}>
                Change Access Point
              </button>
              <button className="button" onClick={handleGenerateReport}>
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
              <button className="button button--secondary" onClick={handleRedraw}>
                Redraw
              </button>
              <button className="button button--secondary" onClick={handleGenerateReport}>
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
          </section>

          <section className="section shell shell--prose">
            <h2>What you get</h2>
            <p className="section__lede">
              A PDF you can print, mark up, and take out onto the land with you.
            </p>
            <p>
              The report is a written analysis of the property alongside a full-page
              layout map with the recommended elements drawn on it — production areas,
              water storage candidates, road corridors, tree lines, and the keypoints
              the design is built around.
            </p>
            <p className="sample-slot">[ sample report page — image to come ]</p>
          </section>

          <section className="section shell shell--prose">
            <h2>The Scale of Permanence</h2>
            <p className="section__lede">
              P. A. Yeomans&apos; ordering of the eight factors that shape a property,
              from the ones you cannot change to the ones you can. The analysis works
              them in order, because a decision made out of order has to be unmade.
            </p>
            <ol className="scale-list">
              <li>
                <h3>Climate</h3>
                <p>Rainfall, frost, growing season. Fixed — everything else answers to it.</p>
              </li>
              <li>
                <h3>Land shape</h3>
                <p>Ridges, valleys, and the keypoints where a valley&apos;s grade breaks.</p>
              </li>
              <li>
                <h3>Water supply</h3>
                <p>Where water already collects, and where it could be held.</p>
              </li>
              <li>
                <h3>Farm roads</h3>
                <p>Access that follows the ridges and keylines rather than cutting across them.</p>
              </li>
              <li>
                <h3>Trees</h3>
                <p>Shelter, shade, and the lines that hold soil on a slope.</p>
              </li>
              <li>
                <h3>Permanent buildings</h3>
                <p>Sited once water and access are settled, not before.</p>
              </li>
              <li>
                <h3>Subdivision fencing</h3>
                <p>Paddock divisions that follow the pattern the land already has.</p>
              </li>
              <li>
                <h3>Soil</h3>
                <p>
                  Last, and deliberately so. Soil is the most improvable factor on the
                  list — poor soil today is a starting condition, not a constraint, and
                  letting it drive the design would lock in a layout you will outgrow.
                </p>
              </li>
            </ol>
          </section>

          <section className="section shell shell--prose">
            <h2>Where the data comes from</h2>
            <p className="section__lede">
              Public, citable sources. Every recommendation traces back to a measurement
              rather than an assumption.
            </p>
            <ul className="source-list">
              <li>
                <strong>USGS 3DEP</strong>
                <span>LiDAR-derived elevation — slope, flow accumulation, keypoints.</span>
              </li>
              <li>
                <strong>SSURGO soil survey</strong>
                <span>USDA soil mapping — drainage class, erodibility, hydric soils.</span>
              </li>
              <li>
                <strong>NHD hydrography</strong>
                <span>Mapped streams, water bodies, and floodplain extents.</span>
              </li>
              <li>
                <strong>Climate reanalysis</strong>
                <span>Rainfall, temperature, and growing season for the location.</span>
              </li>
              <li>
                <strong>Canopy height</strong>
                <span>Existing tree cover, so standing woodland is not designed over.</span>
              </li>
              <li>
                <strong>Satellite imagery</strong>
                <span>Current ground conditions under the drawn boundary.</span>
              </li>
            </ul>
          </section>

          <section className="section shell shell--prose">
            <h2>What this isn&apos;t</h2>
            <p>
              It is built for small properties — roughly a few acres up to thirty. Larger
              ground has different problems and wants a different tool.
            </p>
            <p>
              United States only, because every data source above is a US federal
              dataset.
            </p>
            <p>
              And it is a starting point for real decisions, not a replacement for
              walking the land with someone who knows it. The analysis sees terrain and
              soil classes; it does not see the wet corner that never dries out, or the
              neighbour&apos;s tile drain, or where the deer come through.
            </p>
          </section>
        </main>

        <footer className="footer shell shell--wide">
          <p>Keyline Designer — conceptual planning from public data.</p>
        </footer>
      </div>
    </>
  )
}

export default App
