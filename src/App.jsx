import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import AccessPointTool from './AccessPointTool.jsx'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import AcreageChip from './AcreageChip.jsx'
import ScrollZoomGate from './ScrollZoomGate.jsx'
import BasemapControl, { BASEMAPS } from './BasemapControl.jsx'
import {
  SessionProvider,
  selectBoundaryRing,
  selectSessionId,
  useSession,
} from './session/SessionStore'
import MapLayerStack from './map/MapLayerStack.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import { BOUNDARY_RING_INPUT, BOUNDARY_STEP_ID } from './wizard/stepDefinitions'
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

/**
 * The page, and the session it runs in.
 *
 * The providers are mounted HERE rather than in main.jsx so that everything on
 * this page -- the map stack, the wizard column and the report flow alike --
 * reads one store, one arming register and one gesture-in-flight. Two of
 * anything here would be the invariant this branch retired, back in a new
 * place.
 */
function App() {
  return (
    <SessionProvider>
      <WizardCursorProvider>
        <DrawingProgressProvider>
          <Designer />
        </DrawingProgressProvider>
      </WizardCursorProvider>
    </SessionProvider>
  )
}

function Designer() {
  const { state, actions } = useSession()
  const { armed, anyArmed, arm, disarm, open, cursorStepId, armLegacyGesture, legacyGesture } =
    useWizardCursor()

  /**
   * THE DRAWN RING, FROM THE STORE. Not `useState` any more, and that is this
   * branch's one real change to the spike's flow.
   *
   * It used to be App's own `points`, which meant the wizard's boundary step
   * would have needed a copy of it -- and a copy is a second source of truth
   * for the one geometry every later step is measured against. So the state
   * MOVED rather than being mirrored: the ring lives in the boundary step's
   * draft while it is being drawn and in the session's document once it is
   * committed, and selectBoundaryRing is the one reader of both. Everything
   * below sees the same `points` it always did, in the same [lat, lng] order,
   * converted to [lng, lat] only at the wire.
   *
   * WHY NOT THE OTHER WAY ROUND -- the spike keeping it and the wizard
   * mirroring? Because the mirror would have to be written on every vertex,
   * and a mirror written per gesture IS a second source of truth however it is
   * described. And why not migrate the spike outright? Because that is F4's
   * branch: its panel, its layers, its clamping and its endpoint are untouched
   * here, and moving the ring is the smallest change that lets both read one
   * value.
   */
  const drawnRing = selectBoundaryRing(state, BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT)

  /**
   * ...HELD STEADY BY ITS CONTENTS, not by where it came from.
   *
   * A ring read out of the DRAFT is the same array object until the user moves
   * it. A ring read out of the DOCUMENT is rebuilt on every call -- it is
   * [lng, lat] on the wire and [lat, lng] here, and the swap makes a new array
   * -- so a committed boundary would arrive with a new identity on every
   * render. Downstream, "the ring changed" is a question asked by identity:
   * the stale-result effect below asks it, and react-leaflet 4.2.1 asks it of
   * every path it re-renders. Answering "yes, always" once a session exists
   * would clear the user's zones in a loop.
   */
  const ringSignature = drawnRing.map((point) => point.join()).join(';')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => drawnRing, [ringSignature])

  const setRing = (ring) => actions.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, ring)

  /**
   * THE THREE BOOLEANS, NOW TWO READINGS OF ONE SLOT.
   *
   * isDrawing, isDrawingZone and isSelectingAccessPoint were three independent
   * `useState`s guarded by two DEV-only throws asserting that no two were ever
   * true at once -- because four click listeners share this map and none stops
   * propagation, so two armed tools mean one click does two things.
   *
   * Both throws are GONE, and not because the risk went away: the state they
   * guarded no longer exists. There is one slot in the arming register holding
   * one name, so "two tools armed" is not a state this component can hold and
   * there is nothing left to assert.
   *
   * THE ZONE DRAW IS NOT ONE OF THESE ANY MORE. It was the spike's, armed
   * through the legacy door; it is the landform step's declared `draw` tool
   * now, armed through the wizard's -- validated against the step's own
   * `tools[]`, mounted by the stack, and disarmed by the cursor moving. The
   * ACCESS POINT is the last gesture still going through the legacy door,
   * because the roads step that will declare it does not exist yet.
   *
   * `isDrawing` is qualified by the cursor because `armed` is scoped to the
   * step the wizard has open -- a `draw` armed on landform is not this
   * boundary's.
   */
  const isDrawing = cursorStepId === BOUNDARY_STEP_ID && armed === 'draw'
  const isSelectingAccessPoint = legacyGesture === 'access-point'

  // Finished is DERIVED too: a closed ring with nothing placing points into
  // it. It was the third boolean, and it never held anything the ring and the
  // slot did not already say.
  const isFinished = !isDrawing && points.length >= 3

  // Access point: where the property connects to a road, picked as a
  // point on the boundary line. Stored as [latitude, longitude], same
  // convention as `points`, and required by the backend before a report
  // can be generated.
  const [accessPoint, setAccessPoint] = useState(null)

  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * THE ELEVEN useState HOOKS THAT WERE HERE ARE GONE.
   *
   * They were the production-zone spike's editing state -- the payload, its
   * loading and error flags, the deselected set, the drawn zones, the
   * in-progress ring, its live cautions and the clamp notice -- and this file
   * said of them, at length, that they were what a spike looks like before the
   * session layer exists and that they were expected to be discarded
   * wholesale. They have been.
   *
   * WHERE EACH WENT, because "discarded" would be the wrong word for most of
   * them: the payload and the committed features are the store's mirror; the
   * selection and the drawn zones are the landform step's DRAFT; the loading
   * and error states are the step machine's, read off the store's job table
   * and the step's own error. The in-progress ring and its cautions are the
   * only two that did not belong to the session at all -- they are facts about
   * a mouse, and they live in DrawingProgress, scoped to the map.
   *
   * The clamp notice went with them, and the acreage floor it was printed
   * against with it: the landform step's own `shape` hook decides what to say
   * about a clamp, beside the clamp that produced it.
   */

  const [mapCenter, setMapCenter] = useState(null)

  // Scroll-wheel zoom starts off; see ScrollZoomGate for why and for how the
  // activating click stays transparent.
  const [isMapLive, setIsMapLive] = useState(false)
  const [basemapId, setBasemapId] = useState(BASEMAPS[0].id)
  const basemap = BASEMAPS.find((option) => option.id === basemapId) ?? BASEMAPS[0]

  // Stable identity so ScrollZoomGate's document listener is not torn down
  // and re-attached on every render.
  const handleMapLiveChange = useCallback((live) => setIsMapLive(live), [])

  // Four independent click listeners are still attached to this map — the
  // scroll gate, DrawTool, AccessPointTool, and Leaflet's own — and none of
  // them stops propagation, so they all still see every click. What keeps that
  // safe is no longer an assertion: at most one of them is ARMED, because
  // being armed means holding the register's single slot.

  /**
   * Start over on the boundary. One handler for both buttons now: "Start
   * Drawing Boundary" and "Redraw" only ever differed in which of the three
   * booleans they had to set, and there are no booleans left to set.
   *
   * A COMMITTED BOUNDARY IS NOT REDRAWN, IT IS ABANDONED. Once a session
   * exists the ring is the document's, there is no endpoint that moves it, and
   * BOUNDARY_STEP declares `reopen: null` for exactly that reason -- every
   * committed step was measured against this parcel. So the honest action is
   * to end the session and start fresh, and it is taken here rather than
   * offered as a redraw that would silently do nothing.
   */
  const handleStartDrawing = () => {
    setAccessPoint(null)
    setReport(null)
    setError(null)

    if (selectSessionId(state)) {
      // ENDING A SESSION IS NOT A DRAWING ACTION, so this button no longer
      // performs one. It used to call clearSession() on the click: a user who
      // had generated and committed landform lost that work to a button
      // labelled "Redraw". The boundary is fixed for the life of a session --
      // every committed step was measured against it -- so what they actually
      // want is a NEW session, and the affordance that offers one names what
      // it discards first.
      //
      // Same posture as a click on committed geometry in the map's committed
      // band: it OFFERS navigation to the step that owns the thing, and never
      // hands the user an action they did not ask for. See BoundaryPanel's
      // CommittedBoundary.
      disarm()
      open(BOUNDARY_STEP_ID)
      return
    }

    setRing([])
    arm('draw')
  }

  // "Start Drawing Boundary" and "Redraw" are the same action from two states,
  // and they were two functions only because each had its own three booleans to
  // set. One name would read oddly on both buttons, so the alias stays.
  const handleRedraw = handleStartDrawing

  const handleUndoLastPoint = () => {
    setRing(points.slice(0, -1))
  }

  // Disarming IS finishing. Same call the wizard's boundary panel makes.
  const handleFinishDrawing = () => disarm()

  const handleSelectAccessPoint = () => armLegacyGesture('access-point')

  const handleAccessPointPicked = (point) => {
    setAccessPoint(point)
  }

  const handleConfirmAccessPoint = () => armLegacyGesture(null)

  const handleChangeAccessPoint = () => armLegacyGesture('access-point')

  /**
   * A MOVED RING INVALIDATES WHAT WAS MEASURED AGAINST IT.
   *
   * This was handlePointsChange's `if (isFinished)` branch. It is an effect
   * now because the ring no longer arrives through a callback this component
   * owns -- DrawTool writes it into the step's draft, and this reads it back.
   * The `isFinished` guard is gone with it, and nothing is lost: a report or a
   * zone payload can only exist over a ring that WAS finished, so any change
   * to the ring while either is on screen is the same stale-result case.
   */
  const lastRing = useRef(points)
  useEffect(() => {
    if (lastRing.current === points) return
    lastRing.current = points
    if (report === null && error === null) return
    setReport(null)
    setError(null)
  })

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
          scrollWheelZoom={false}
          zoomControl={false}
        >
          {/* Top-left belongs to the chip, which is read continuously while
              drawing; the zoom buttons are used occasionally. */}
          <ZoomControl position="topright" />
          <ScrollZoomGate active={isMapLive} onChange={handleMapLiveChange} />
          <TileLayer
            key={basemap.id}
            url={basemap.url}
            attribution={basemap.attribution}
            maxZoom={19}
          />
          {basemap.referenceUrl && (
            <TileLayer
              key={`${basemap.id}-reference`}
              url={basemap.referenceUrl}
              maxZoom={19}
            />
          )}
          <MapRecenter center={mapCenter} zoom={18} />
          {/* THE LAYER STACK, in place of the DrawTool that used to be here.
              It composes basemap → context → committed → active editable from
              the store and the step definitions, and mounts the active step's
              declared tools — DrawTool among them, wired to the boundary
              step's draft rather than to state this component holds. */}
          <MapLayerStack />
          <AccessPointTool
            isSelecting={isSelectingAccessPoint}
            boundaryPoints={points}
            accessPoint={accessPoint}
            onSelect={handleAccessPointPicked}
          />
        </MapContainer>

                <AcreageChip points={points} visible={isDrawing || isFinished} />

                {!isMapLive && (
                  <p className="map-hint" aria-hidden="true">
                    Click the map to zoom with the scroll wheel
                  </p>
                )}

                <BasemapControl value={basemapId} onChange={setBasemapId} />
              </div>

              <div className="status-panel">
        {/* THE WIZARD, in the sidebar column, reading the same store and the
            same arming register as the spike below it. Both are on screen at
            once on purpose: the wizard owns the boundary step (its Draw button
            and the spike's Start Drawing arm the same slot), and the spike
            still owns the production-zone flow until F4 migrates it. */}
        <WizardShell />

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
              <span className="measure">{points.length}</span>{' '}
              point{points.length !== 1 ? 's' : ''} placed
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

        {/* THE PRODUCTION ZONES ARE NOT OFFERED FROM HERE ANY MORE. They are
            the wizard's landform step, above: generated from the session, held
            in its draft, committed to the Design Document. What is left in
            this column is the PDF path, which is a different flow off the same
            boundary and is untouched -- it reads neither the session nor the
            document, and /api/generate-report-pdf takes the ring on the wire
            exactly as it always did. */}
        {isFinished && !report && !isLoading && !isSelectingAccessPoint && !accessPoint && (
          <>
            <p className="status-ready">
              Boundary set — <span className="measure">{points.length}</span> points. Pick
              the entry point to carry on to a full report.
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
