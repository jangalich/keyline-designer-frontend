import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import AccessPointTool from './AccessPointTool.jsx'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import AcreageChip from './AcreageChip.jsx'
import ScrollZoomGate from './ScrollZoomGate.jsx'
import BasemapControl, { BASEMAPS } from './BasemapControl.jsx'
import ProductionZoneLayers from './ProductionZoneLayers.jsx'
import ProductionDrawnZones from './ProductionDrawnZones.jsx'
import ProductionZonePanel from './ProductionZonePanel.jsx'
import ZoneDrawTool from './ZoneDrawTool.jsx'
import {
  assertSuggestedZonesAreClean,
  cautionsFor,
  clampToBoundary,
} from './zoneGeometry.js'
import { multiPolygonToLatLngs } from './geo.js'
import {
  SessionProvider,
  selectBoundaryRing,
  selectSessionId,
  useSession,
} from './session/SessionStore'
import MapLayerStack from './map/MapLayerStack.jsx'
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

// The smallest clamped-away area worth naming, in acres. Same value and same
// reasoning as zoneGeometry's CAUTION_MIN_ACRES: below it a one-decimal figure
// reads as 0.0, which states a measured zero about ground that was removed.
const CLAMP_NOTICE_MIN_ACRES = 0.05

// 4B's additions to 4A's pane order. Leaflet's own are tilePane 200,
// overlayPane 400, markerPane 600, tooltipPane 650.
//
//   350 scrim · 360 eligible · 370 suggested   (4A)
//   380 drawn zones      — above the suggestions, below the boundary at 400,
//                          so a zone never covers the edge it was clamped to
//   390 in-progress line — above the finished ones, still under the boundary
//   610 caution markers  — above markerPane so a boundary vertex cannot hide
//                          one, below tooltipPane
const DRAWN_PANE_Z = 380
const DRAWING_PANE_Z = 390
const CAUTION_PANE_Z = 610

/**
 * The page, and the session it runs in.
 *
 * The provider pair is mounted HERE rather than in main.jsx so that everything
 * on this page -- the map stack, the wizard column, and the production-zone
 * spike alike -- reads one store and one arming register. Two of anything here
 * would be the invariant this branch retired, back in a new place.
 */
function App() {
  return (
    <SessionProvider>
      <WizardCursorProvider>
        <Designer />
      </WizardCursorProvider>
    </SessionProvider>
  )
}

function Designer() {
  const { state, actions } = useSession()
  const { armed, anyArmed, arm, disarm, cursorStepId, armLegacyGesture, legacyGesture } =
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
   * THE THREE BOOLEANS, NOW THREE READINGS OF ONE SLOT.
   *
   * isDrawing, isDrawingZone and isSelectingAccessPoint were three independent
   * `useState`s guarded by two DEV-only throws asserting that no two were ever
   * true at once -- because four click listeners share this map and none stops
   * propagation, so two armed tools mean one click does two things.
   *
   * Both throws are GONE, and not because the risk went away: the state they
   * guarded no longer exists. There is one slot in the arming register holding
   * one name, so "two tools armed" is not a state this component can hold and
   * there is nothing left to assert. The boundary's draw arms through the
   * wizard's door (validated against the step's declared `tools[]`); the
   * spike's two gestures arm through the legacy door; both write the same slot.
   *
   * `isDrawing` is qualified by the cursor because `armed` is scoped to the
   * step the wizard has open -- a `draw` armed on landform is not this
   * boundary's.
   */
  const isDrawing = cursorStepId === BOUNDARY_STEP_ID && armed === 'draw'
  const isDrawingZone = legacyGesture === 'zone-draw'
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

  // Production zones: a parallel path off the finished boundary, not a stage
  // of the report flow. Its own three pieces of state rather than a share of
  // isLoading/error above — those belong to the PDF path, and reusing them
  // would render a zone failure inside the report flow's own branches.
  //
  // `productionZones` is { id, data }. The id increments per successful
  // fetch and exists for one reason: react-leaflet 4.2.1's GeoJSON ignores a
  // changed `data` prop (it only diffs `style`), so a replaced payload has to
  // arrive as a new component instance via a changed key.
  const [productionZones, setProductionZones] = useState(null)
  const [isLoadingZones, setIsLoadingZones] = useState(false)
  const [zonesError, setZonesError] = useState(null)
  const zoneRequestId = useRef(0)

  // 4B's editing state. THIS IS NOT A PATTERN TO COPY. Eleven useState hooks
  // in one component is what a spike looks like before the session layer and
  // step wizard exist to hold it; this plumbing is expected to be discarded
  // wholesale rather than extended. The map layers, the visual language, and
  // the caution logic in zoneGeometry.js are the parts meant to survive.
  //
  // Suggested zones are tracked by what is DESELECTED, not by what is
  // selected: every zone starts selected because the payload IS the
  // recommendation, so the empty set is the correct initial state and a newly
  // arrived payload needs no seeding.
  const [deselectedIds, setDeselectedIds] = useState(() => new Set())
  const [drawnZones, setDrawnZones] = useState([])
  const [zonePoints, setZonePoints] = useState([])
  const [liveCautions, setLiveCautions] = useState([])
  const [clampNotice, setClampNotice] = useState(null)
  const drawnZoneId = useRef(0)

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
  //
  // The production-zone step owns the panel whenever any of its three states
  // is live. Derived rather than stored so it cannot drift out of step with
  // the three values it summarises.
  const inProductionZones = isLoadingZones || zonesError !== null || productionZones !== null

  const exclusionLayers = productionZones?.data?.exclusion_layers ?? []
  const suggestedFeatures = productionZones?.data?.suggested_zones?.features ?? []

  // Running totals over the CURRENT selection rather than the payload's own
  // figures: selected suggestions plus everything drawn.
  const selectedSuggestedAcres = suggestedFeatures
    .filter((feature) => !deselectedIds.has(feature.id))
    .reduce((sum, feature) => sum + feature.properties.area_acres, 0)
  const drawnAcres = drawnZones.reduce((sum, zone) => sum + zone.acres, 0)
  const parcelAcres = productionZones?.data?.summary?.total_acres ?? 0
  const totals = {
    selectedAcres: selectedSuggestedAcres + drawnAcres,
    pctOfParcel:
      parcelAcres > 0 ? ((selectedSuggestedAcres + drawnAcres) / parcelAcres) * 100 : 0,
    zoneCount:
      suggestedFeatures.filter((feature) => !deselectedIds.has(feature.id)).length +
      drawnZones.length,
  }

  // A suggested zone is a strict subset of ground that already cleared every
  // gate, so it cannot cross an exclusion. Verified empty across both
  // reference fixtures; asserted here so a pipeline regression surfaces as a
  // loud failure rather than as a caution nobody can explain.
  if (import.meta.env.DEV && suggestedFeatures.length) {
    assertSuggestedZonesAreClean(suggestedFeatures, exclusionLayers)
  }

  // Every production-zone result is computed FOR one specific boundary, so
  // anything that changes the boundary has to drop it. Left behind, a
  // highlight would sit over ground it was never measured against.
  const clearProductionZones = () => {
    setProductionZones(null)
    setIsLoadingZones(false)
    setZonesError(null)
    // Every one of these is scoped to one payload for one boundary. Left
    // behind, a drawn zone would sit over ground it was never clamped to and a
    // deselection would apply to a suggestion that no longer exists.
    setDeselectedIds(new Set())
    setDrawnZones([])
    setZonePoints([])
    // Only if it is OURS to disarm. The slot is shared with the wizard's
    // tools now, and clearing zones must not reach over and disarm a boundary
    // draw that is halfway through a ring.
    if (isDrawingZone) armLegacyGesture(null)
    setLiveCautions([])
    setClampNotice(null)
  }

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
    clearProductionZones()

    if (selectSessionId(state)) {
      // The store drops the document and every draft with it, which puts the
      // wizard's cursor back on the boundary step. Arming has to wait for that
      // render -- `arm` validates against the step the cursor is on NOW, which
      // is still the committed session's.
      actions.clearSession()
      disarm()
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
    if (report === null && error === null && !inProductionZones) return
    setReport(null)
    setError(null)
    clearProductionZones()
  })

  const handleGenerateProductionZones = async () => {
    setIsLoadingZones(true)
    setZonesError(null)
    setProductionZones(null)

    // [longitude, latitude] only at the wire, same as the report path.
    const boundary = points.map(([lat, lng]) => [lng, lat])

    try {
      const response = await fetch(`${API_URL}/api/production-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        // The backend names which layer failed, as a stable type plus display
        // prose. Only the prose is carried into the panel; the status code
        // and any message text stay here.
        setZonesError({
          layer: data?.failed_layer?.type ?? null,
          layerLabel: data?.failed_layer?.label ?? null,
        })
        return
      }

      zoneRequestId.current += 1
      setProductionZones({ id: zoneRequestId.current, data })
    } catch {
      // A thrown fetch is the backend being unreachable rather than a layer
      // failing, so there is no layer to name.
      setZonesError({ layer: null, layerLabel: null })
    } finally {
      setIsLoadingZones(false)
    }
  }

  const handleToggleZone = (featureId) => {
    setDeselectedIds((current) => {
      const next = new Set(current)
      if (next.has(featureId)) next.delete(featureId)
      else next.add(featureId)
      return next
    })
  }

  const handleStartDrawZone = () => {
    armLegacyGesture('zone-draw')
    setZonePoints([])
    setLiveCautions([])
    setClampNotice(null)
  }

  const handleCancelDrawZone = () => {
    armLegacyGesture(null)
    setZonePoints([])
    setLiveCautions([])
  }

  // Live, on each vertex placed, once there are three — a ring needs three
  // points before it encloses anything to intersect. Recomputed here rather
  // than in an effect so the work is visibly tied to the gesture that causes
  // it, and NOT on mousemove: this tool places points on click and there is no
  // rubber band to track.
  const handleZonePointsChange = (nextZonePoints) => {
    setZonePoints(nextZonePoints)
    // Clamped to the boundary FIRST, then intersected. Cautions describe
    // ground the user is actually taking on, and off-parcel ground is never
    // theirs to take on — warning about hydric soil on the neighbour's side of
    // the line would be noise attached to land they cannot commit.
    setLiveCautions(
      nextZonePoints.length >= 3
        ? cautionsFor(clampToBoundary(nextZonePoints, points).multi, exclusionLayers)
        : []
    )
  }

  const handleCloseZone = () => {
    const { multi, acres, removedAcres } = clampToBoundary(zonePoints, points)

    armLegacyGesture(null)
    setZonePoints([])
    setLiveCautions([])

    if (!multi.length) {
      // Every vertex landed off-parcel. Nothing to keep, and the notice has to
      // say so rather than leaving a Draw button that appeared to do nothing.
      setClampNotice('That shape fell entirely outside the parcel, so nothing was added.')
      return
    }

    drawnZoneId.current += 1
    setDrawnZones((current) => [
      ...current,
      {
        id: drawnZoneId.current,
        latLngs: multiPolygonToLatLngs(multi),
        acres,
        cautions: cautionsFor(multi, exclusionLayers),
      },
    ])

    // Said once, with the figure, and only when the figure is real — the same
    // floor the cautions use. A notice reading "0.0 acres outside the parcel
    // was removed" describes a clip, not a decision the user made.
    setClampNotice(
      removedAcres >= CLAMP_NOTICE_MIN_ACRES
        ? `${removedAcres.toFixed(1)} acres outside the parcel was removed.`
        : null
    )
  }

  const handleDeleteDrawnZone = (zoneId) => {
    setDrawnZones((current) => current.filter((zone) => zone.id !== zoneId))
    setClampNotice(null)
  }

  // Back to the finished-boundary state. The boundary itself is untouched —
  // losing a traced boundary to a step that is a dead end for now would be
  // the worst thing this panel could do.
  const handleLeaveProductionZones = () => {
    clearProductionZones()
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
          {/* Renders nothing until a payload arrives. Its three layers sit in
              their own panes below Leaflet's overlayPane, which is what keeps
              them under DrawTool's boundary and vertex markers without
              anything in DrawTool changing — see ProductionZoneLayers. */}
          <ProductionZoneLayers
            payload={productionZones}
            boundaryPoints={points}
            deselectedIds={deselectedIds}
            onToggleZone={handleToggleZone}
            // Selection is off while ANYTHING is armed, not just while the
            // zone tool is. A Leaflet path click also reaches the map, so an
            // interactive zone under any armed tool would toggle itself AND
            // place a vertex on one click — and now that the boundary's draw
            // can be armed from the wizard's panel while zones are on screen,
            // "the zone tool" is no longer the only tool that could be live.
            // Reading the register's occupancy is what makes that one rule
            // rather than a list of gestures to keep up to date.
            selectionEnabled={inProductionZones && !anyArmed}
          />
          {inProductionZones && (
            <ProductionDrawnZones
              drawnZones={drawnZones}
              liveCautions={liveCautions}
              drawnPaneZ={DRAWN_PANE_Z}
              cautionPaneZ={CAUTION_PANE_Z}
            />
          )}
          <ZoneDrawTool
            isDrawing={isDrawingZone}
            points={zonePoints}
            onPointsChange={handleZonePointsChange}
            onClose={handleCloseZone}
            paneZ={DRAWING_PANE_Z}
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

        {isFinished &&
          !report &&
          !isLoading &&
          !isSelectingAccessPoint &&
          !accessPoint &&
          !inProductionZones && (
            <>
              <p className="status-ready">
                Boundary set — <span className="measure">{points.length}</span> points. Pick
                the entry point to carry on to a full report, or see where else this land
                could be farmed.
              </p>
              <div className="button-row">
                <button className="button button--secondary" onClick={handleRedraw}>
                  Redraw
                </button>
                <button className="button" onClick={handleSelectAccessPoint}>
                  Select Access Point
                </button>
                <button className="button" onClick={handleGenerateProductionZones}>
                  Generate Production Zones
                </button>
              </div>
            </>
          )}

        {inProductionZones && (
          <ProductionZonePanel
            payload={productionZones}
            isLoading={isLoadingZones}
            error={zonesError}
            onRetry={handleGenerateProductionZones}
            onBack={handleLeaveProductionZones}
            deselectedIds={deselectedIds}
            drawnZones={drawnZones}
            liveCautions={liveCautions}
            totals={totals}
            isDrawingZone={isDrawingZone}
            onStartDrawZone={handleStartDrawZone}
            onCancelDrawZone={handleCancelDrawZone}
            onDeleteDrawnZone={handleDeleteDrawnZone}
            clampNotice={clampNotice}
          />
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
