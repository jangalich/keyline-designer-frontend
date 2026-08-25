import { Marker, Pane, Polygon } from 'react-leaflet'
import L from 'leaflet'
import { readToken } from './geo.js'

let drawnColors = null

function getDrawnColors() {
  if (!drawnColors) {
    drawnColors = { zone: readToken('--oxide'), halo: readToken('--halo') }
  }
  return drawnColors
}

// A drawn zone carries the SAME hatch as a suggested one — it is the same kind
// of thing, ground to work — but unlike a suggestion it keeps an outline.
//
// That is not a contradiction of this branch's no-outline rule, it is the
// reason for it. The rule says a hard edge reads as a line someone measured
// and agreed, which is wrong for a recommendation whose edge is its least
// certain part. A drawn zone's edge is exactly that: placed vertex by vertex,
// deliberately, and exact. The hatch says what the ground is for; the edge
// treatment says whether its boundary is a suggestion or a decision.
//
// Cased with --halo, the same trick the boundary uses and for the same
// measured reason.
const DRAWN_LINE_WEIGHT = 1.5
const DRAWN_CASING_WEIGHT = 3

// A caution marker is a fixed screen size — it is a pointer, not a footprint,
// and scaling it with the ground would make it vanish at the zoom where a
// small crossing matters most.
const cautionIcon = new L.DivIcon({
  className: 'caution-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<span aria-hidden="true">!</span>',
})

/**
 * ProductionDrawnZones
 *
 * User-drawn zones and the cautions they trip. Kept apart from
 * ProductionZoneLayers because the two answer to different owners: that
 * component draws what the backend recommended, this one draws what the user
 * decided, and only the second can ever carry a caution.
 *
 * Z-ORDER. Drawn zones sit at 380 — above the suggested zones at 370, below
 * Leaflet's overlayPane at 400 where the parcel boundary lives. A drawn zone
 * is clamped to that boundary, so it must never cover the edge it was clamped
 * to. Caution markers sit at 610, above markerPane (600) so they are not
 * hidden by a boundary vertex, below tooltipPane (650).
 */
function ProductionDrawnZones({ drawnZones, liveCautions, drawnPaneZ, cautionPaneZ }) {
  const { zone, halo } = getDrawnColors()

  // Every caution currently on the map: the committed zones' own, plus the
  // in-progress polygon's, which update on each vertex placed.
  const markers = [
    ...drawnZones.flatMap((z) => z.cautions.map((c) => ({ ...c, key: `${z.id}-${c.type}` }))),
    ...liveCautions.map((c) => ({ ...c, key: `live-${c.type}` })),
  ].filter((c) => c.at)

  return (
    <>
      <Pane name="production-drawn" style={{ zIndex: drawnPaneZ }}>
        {drawnZones.map((z) =>
          z.latLngs.map((rings, index) => (
            <Polygon
              // A clamp can split one drawn ring into several pieces, and each
              // is rendered as its own Polygon with its holes as later rings —
              // which is how Leaflet reads a positions array anyway.
              key={`${z.id}-${index}`}
              positions={rings}
              pathOptions={{
                color: halo,
                weight: DRAWN_CASING_WEIGHT,
                fill: false,
                interactive: false,
              }}
            />
          ))
        )}
        {drawnZones.map((z) =>
          z.latLngs.map((rings, index) => (
            <Polygon
              key={`${z.id}-${index}-line`}
              positions={rings}
              pathOptions={{
                color: zone,
                weight: DRAWN_LINE_WEIGHT,
                fill: true,
                className: 'zone--drawn',
                interactive: false,
              }}
            />
          ))
        )}
      </Pane>

      <Pane name="production-cautions" style={{ zIndex: cautionPaneZ }}>
        {/* One marker per crossed layer, at the intersection rather than at
            the zone's centroid. Position is the whole signal: a twelve-acre
            zone with a sliver of wet ground along one edge should point at the
            edge. Two exclusions crossed means two markers, and they may
            overlap — no collision handling in this branch. */}
        {markers.map((c) => (
          <Marker key={c.key} position={c.at} icon={cautionIcon} interactive={false} />
        ))}
      </Pane>
    </>
  )
}

export default ProductionDrawnZones
