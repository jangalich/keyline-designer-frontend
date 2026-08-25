import { useMapEvents, useMap, Marker, Pane, Polygon, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { readToken, vertexAtPixel } from './geo.js'

// Same 15 px as DrawTool, and deliberately the same NUMBER rather than a
// shared constant: they are two gestures that happen to agree today, and the
// zone tool has no close-costs-real-work asymmetry to justify its own value
// yet. If one moves, the other should not follow silently.
const VERTEX_HIT_RADIUS_PX = 15

// Its own module-level cache, for the reason DrawTool's has one: main.jsx
// imports App.jsx — and through it this file — before index.css, so a
// module-evaluation read returns empty strings. First render is after every
// module has evaluated.
let zoneColors = null

function getZoneColors() {
  if (!zoneColors) {
    zoneColors = { zone: readToken('--oxide'), halo: readToken('--halo') }
  }
  return zoneColors
}

// The in-progress line is cased and dashed, exactly as DrawTool's is, for the
// two reasons documented there: no single colour clears 3:1 against the range
// of one aerial frame, so map geometry gets a halo casing rather than a colour
// picked to beat imagery; and the dash has to be longer than the casing is
// wide or the line reads as a row of beads.
const LINE_WEIGHT = 2
const CASING_WEIGHT = 4
const DASH = '10,6'

const zoneVertexIcon = new L.DivIcon({ className: 'vertex-marker', iconSize: [14, 14] })
const zoneClosableIcon = new L.DivIcon({
  className: 'vertex-marker vertex-marker--closable',
  iconSize: [20, 20],
})

/**
 * ZoneDrawTool
 *
 * Places the vertices of a new production zone. Click to add, click the first
 * vertex once three are down to close.
 *
 * A PARALLEL COMPONENT TO DrawTool, NOT A GENERALISATION OF IT. DrawTool is
 * coupled to the boundary in four ways that only a rewrite would undo: a
 * module-level colour memo that cannot serve two callers at once, an
 * isFinished path that makes every vertex draggable, a render into Leaflet's
 * default overlayPane, and a map-level click listener. It also sits on the
 * live boundary → access point → PDF path. This branch is a spike whose state
 * handling is expected to be discarded, and coupling it to that component
 * would mean the discard either drags a half-generalised DrawTool with it or
 * leaves it generalised for a caller that no longer exists.
 *
 * What IS shared is the gesture: vertexAtPixel() in geo.js, which DrawTool now
 * calls too and which behaves identically for both.
 *
 * NO ADJUST. Vertices are placed and never moved — delete and redraw. Vertex
 * editing of an existing multi-polygon is the largest single piece of work in
 * the redesign and is deliberately deferred, so there is no drag handler here
 * and no isFinished state to enable one.
 *
 * This component's click handler is one of several on this map. It is armed
 * only while `isDrawing`, and App.jsx holds the invariant that no two tools
 * are armed at once.
 */
function ZoneDrawTool({ isDrawing, points, onPointsChange, onClose, paneZ }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!isDrawing) return

      if (points.length > 0) {
        const hit = vertexAtPixel(
          [e.latlng.lat, e.latlng.lng],
          points,
          (point) => map.latLngToContainerPoint(L.latLng(point[0], point[1])),
          VERTEX_HIT_RADIUS_PX
        )
        if (hit !== -1) {
          // Same rule as the boundary: the first vertex closes the ring once
          // there is one to close, and every other vertex swallows the click
          // rather than placing a duplicate a pixel away.
          if (hit === 0 && points.length >= 3) onClose()
          return
        }
      }

      onPointsChange([...points, [e.latlng.lat, e.latlng.lng]])
    },
  })

  if (!isDrawing || points.length === 0) return null

  const { zone, halo } = getZoneColors()

  return (
    <Pane name="production-drawing" style={{ zIndex: paneZ }}>
      {points.length >= 2 && (
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
            pathOptions={{
              color: zone,
              weight: LINE_WEIGHT,
              dashArray: DASH,
              interactive: false,
            }}
          />
        </>
      )}

      {points.map((point, index) => (
        <Marker
          key={index}
          position={point}
          icon={index === 0 && points.length >= 3 ? zoneClosableIcon : zoneVertexIcon}
          interactive={false}
        />
      ))}
    </Pane>
  )
}

export default ZoneDrawTool
