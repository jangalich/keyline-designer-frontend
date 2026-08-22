import { useMapEvents, useMap, Marker, Polygon, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { readToken } from './geo.js'

// A small circular marker for each boundary point — simpler and more
// reliable than Leaflet's default marker icon, which often has loading
// issues when bundled with tools like Vite.
const vertexIcon = new L.DivIcon({
  className: 'vertex-marker',
  iconSize: [14, 14],
})

// Same marker, slightly larger — used only for the first point while
// drawing, once there are enough points to close the ring, as a hint
// that clicking it will finish the boundary.
const closableVertexIcon = new L.DivIcon({
  className: 'vertex-marker vertex-marker--closable',
  iconSize: [20, 20],
})

// How close (in screen pixels) a click has to land to an already-placed
// vertex before it counts as a click ON that vertex rather than a request
// for a new one. Screen pixels, not metres, so the gesture behaves the same
// at every zoom level — a metre threshold would be unusably tight zoomed out
// and sloppy zoomed in.
//
// Landing on a vertex means one of two things, and never a third:
//   - the FIRST vertex, with 3+ points placed: close the ring.
//   - ANY other vertex, including the one just placed: do nothing at all.
//
// The second case is deliberate, not a fall-out of the loop bounds. Before
// it existed, clicking an existing vertex appended a new point a pixel or
// two away from it, quietly putting a near-zero-length segment into the ring
// that the backend would then be handed. Doing nothing near the LAST vertex
// is the same decision: an undo-by-clicking gesture is arguable, but it is
// not built here and silently adding a duplicate is not a substitute for it.
//
// Compare AccessPointTool's MAX_SNAP_DISTANCE_PX, which is roughly 3x this.
// The asymmetry is the point: closing ends the drawing session, so a false
// positive costs real work, while a mis-snapped access point is one more
// click to correct.
const VERTEX_HIT_RADIUS_PX = 15

// Leaflet draws its paths as SVG attributes and takes a plain JS color value,
// so it cannot read a CSS custom property the way a stylesheet rule can. The
// tokens have to be read out of the document and handed over already resolved.
//
// Not at module load: main.jsx imports App.jsx (and through it this file)
// before it imports index.css, so at module-evaluation time the tokens are
// not defined yet and this would read empty strings. First render is after
// all modules have evaluated, so the read happens then and is cached — the
// tokens are static.
let geometryColors = null

function getGeometryColors() {
  if (!geometryColors) {
    geometryColors = { field: readToken('--field'), halo: readToken('--halo') }
  }
  return geometryColors
}

// Boundary geometry has to stay legible over aerial imagery, and imagery is
// not one background — a single frame runs from dark canopy through pasture
// and bare soil to bright stubble. No single colour wins against that range:
// measured against representative imagery tones, --field clears 3:1 only
// over bright bare ground (1.50 over pasture, 1.58 over soil, 1.59 over
// canopy).
//
// So the line is CASED rather than recoloured — a wider --halo stroke
// underneath, --field on top. Whichever one the ground defeats, the other
// separates, and the pair reads on any backdrop. This is the same trick the
// vertex markers already use with their 2px --halo border, and it needs no
// new token. General principle for this project: map geometry gets a halo
// casing, never a colour picked to beat imagery.
const LINE_WEIGHT = 2
const CASING_WEIGHT = 4

// The in-progress line is dashed to read as unfinished. The dash has to be
// longer than the casing is wide, or each segment renders about as wide as it
// is long and the line reads as a row of beads rather than as a cased dash —
// which is exactly what 6,6 under a 5px casing produced.
const DASH = '10,6'

/**
 * DrawTool
 *
 * A custom polygon-drawing tool, built directly with react-leaflet's own
 * building blocks rather than the leaflet-draw plugin. leaflet-draw
 * caused real, hard-to-pin-down bugs (polygons finishing early, edits
 * not registering) that made it more trouble than it was worth for one
 * simple shape. This is a small amount more code, but every part of it
 * is visible and under our control.
 *
 * How it works:
 *  - While `isDrawing` is true, clicking the map adds a new point — unless
 *    the click lands on an already-placed vertex (see VERTEX_HIT_RADIUS_PX),
 *    in which case it either closes the ring or is ignored. The points array
 *    itself never gets a duplicate closing coordinate; Polygon (and Shapely,
 *    on the backend) both close the ring implicitly by connecting the last
 *    point to the first.
 *  - Once `isFinished` is true (set by the parent, via a "Finish" button),
 *    each point becomes a draggable marker so the shape can be adjusted.
 *  - All points are lifted up to the parent via onPointsChange, as
 *    [latitude, longitude] pairs (Leaflet's native order) — the parent
 *    is responsible for converting to [longitude, latitude] when sending
 *    to the backend, since that's what the Python functions expect.
 *
 * This component's click handler is one of several attached to the same map;
 * see ScrollZoomGate for how they coexist. It never stops propagation.
 */
function DrawTool({ isDrawing, isFinished, points, onPointsChange, onCloseBoundary, editingDisabled = false }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!isDrawing) return

      if (points.length > 0) {
        const clickPixel = map.latLngToContainerPoint(e.latlng)

        for (let i = 0; i < points.length; i++) {
          const vertexPixel = map.latLngToContainerPoint(L.latLng(points[i][0], points[i][1]))
          if (clickPixel.distanceTo(vertexPixel) > VERTEX_HIT_RADIUS_PX) continue

          // The first vertex closes the ring, but only once there is a ring
          // to close. Every other vertex — and the first one before three
          // points exist — swallows the click.
          if (i === 0 && points.length >= 3) onCloseBoundary()
          return
        }
      }

      onPointsChange([...points, [e.latlng.lat, e.latlng.lng]])
    },
  })

  const handleMarkerDrag = (index, event) => {
    const { lat, lng } = event.target.getLatLng()
    const updated = points.map((point, i) => (i === index ? [lat, lng] : point))
    onPointsChange(updated)
  }

  const { field, halo } = getGeometryColors()

  // Casing first so it paints underneath: within one SVG pane, later
  // elements draw on top.
  return (
    <>
      {isFinished && points.length >= 3 && (
        <>
          <Polygon
            positions={points}
            pathOptions={{ color: halo, weight: CASING_WEIGHT, fill: false, interactive: false }}
          />
          <Polygon positions={points} pathOptions={{ color: field, weight: LINE_WEIGHT }} />
        </>
      )}

      {!isFinished && points.length >= 2 && (
        <>
          <Polyline
            positions={points}
            pathOptions={{
              color: halo,
              weight: CASING_WEIGHT,
              dashArray: DASH,
              interactive: false,
            }}
          />
          <Polyline
            positions={points}
            pathOptions={{ color: field, weight: LINE_WEIGHT, dashArray: DASH }}
          />
        </>
      )}

      {points.map((point, index) => (
        <Marker
          key={index}
          position={point}
          icon={
            isDrawing && index === 0 && points.length >= 3
              ? closableVertexIcon
              : vertexIcon
          }
          draggable={isFinished && !editingDisabled}
          eventHandlers={
            isFinished && !editingDisabled ? { drag: (e) => handleMarkerDrag(index, e) } : {}
          }
        />
      ))}
    </>
  )
}

export default DrawTool
