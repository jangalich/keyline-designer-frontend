import { useMapEvents, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import { snapToPolygonEdge } from './geo.js'

// Distinct from the boundary's vertex markers (green) — a mustard tone
// to match the fencing layer's palette elsewhere in the project, while
// still reading clearly as "a different kind of point" on the map. Its
// --halo border is the same casing the boundary line uses, for the same
// reason: it has to stay legible over imagery that runs from dark canopy
// to bright bare ground.
const accessPointIcon = new L.DivIcon({
  className: 'access-point-marker',
  iconSize: [18, 18],
})

// How far off the boundary a click may land and still be taken as "put the
// access point here". Beyond it the click does nothing at all: no move, no
// marker.
//
// Screen pixels rather than metres, deliberately — a metre threshold would
// be unusably tight zoomed out and sloppy zoomed in, while a pixel threshold
// means the gesture feels identical at every zoom level. Same reasoning as
// DrawTool's VERTEX_HIT_RADIUS_PX.
//
// Roughly 3x that constant, and the asymmetry is intentional rather than a
// typo: closing a boundary ends the drawing session, so a false positive
// there costs real work, whereas a mis-placed access point is corrected by
// clicking again. Precision where a mistake is expensive, generosity where
// it is free.
//
// Before this existed there was no miss distance at all — the nearest edge
// won from anywhere on the map, so a click 290px away in an empty corner
// silently relocated the access point to the far side of the property, and
// there was no such thing as a stray click.
const MAX_SNAP_DISTANCE_PX = 44

/**
 * AccessPointTool
 *
 * MOUNTED BY NOTHING, ON PURPOSE, AND WAITING FOR ROADS.
 *
 * This was a PRE-STEP: before the wizard began, and before anything downstream
 * of it had been decided, the user picked where the property meets a road,
 * because /api/generate-report-pdf required one. That is the wrong shape for
 * it. The access point is not a global property of a session -- it is an INPUT
 * OF THE ROADS STEP, which sites farm roads along the ridges and keylines, and
 * a step's inputs belong to the step (stepDefinitions' `inputs`, and the note
 * on BOUNDARY_STEP about the same question for the ring).
 *
 * So the pre-step is deleted and this component is imported by no file. It is
 * kept rather than removed because it is not a duplicate of anything: the
 * snap-to-the-boundary-line gesture in here is the one implementation, it is
 * what roads will declare a `draw` over a point layer to mean, and rewriting
 * it from scratch then would be the actual waste. StepTools.jsx already names
 * the two places a point tool attaches.
 *
 * WHAT THIS BREAKS, SAID OUT LOUD: nothing in the frontend calls
 * /api/generate-report-pdf any more, because that route requires an access
 * point and there is no longer an affordance that collects one. The route is
 * untouched on the server. See App.jsx's header.
 *
 * Lets the user pick the point where the property connects to a road,
 * modeled after DrawTool's structure. While `isSelecting` is true,
 * clicking within MAX_SNAP_DISTANCE_PX of the boundary snaps to the nearest
 * point on its edge (not the nearest vertex) and lifts it up via `onSelect`,
 * as a [latitude, longitude] pair — same convention as `points` in App.jsx.
 * Each click replaces the previous candidate; nothing accumulates.
 *
 * The projection itself lives in geo.js, which scales longitude by
 * cos(latitude) first — see that file for why raw degrees skew the result.
 *
 * This component's click handler is one of several attached to the same map;
 * see ScrollZoomGate for how they coexist. It never stops propagation, and
 * it can never fire on the same click as DrawTool's — App.jsx's state
 * transitions make `isDrawing` and `isSelecting` mutually exclusive.
 */
function AccessPointTool({ isSelecting, boundaryPoints, accessPoint, onSelect }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!isSelecting || boundaryPoints.length < 3) return

      const snapped = snapToPolygonEdge([e.latlng.lat, e.latlng.lng], boundaryPoints)
      if (!snapped) return

      // Measure the miss in screen pixels, which means measuring it after
      // projection rather than in degrees — degrees would reintroduce the
      // exact latitude skew geo.js corrects for.
      const clickPixel = map.latLngToContainerPoint(e.latlng)
      const snappedPixel = map.latLngToContainerPoint(L.latLng(snapped[0], snapped[1]))
      if (clickPixel.distanceTo(snappedPixel) > MAX_SNAP_DISTANCE_PX) return

      onSelect(snapped)
    },
  })

  if (!accessPoint) return null

  return <Marker position={accessPoint} icon={accessPointIcon} />
}

export default AccessPointTool
