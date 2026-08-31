/**
 * CautionMarkers.jsx
 *
 * WHAT A DRAWN SHAPE CROSSES, MARKED WHERE IT CROSSES IT.
 *
 * One marker per crossed exclusion gate, placed at the INTERSECTION rather
 * than at the zone's centroid. Position is the whole signal: a twelve-acre
 * zone with a sliver of wet ground along one edge should point at the edge.
 * Two exclusions crossed means two markers, and they may overlap -- there is
 * no collision handling here.
 *
 * A caution marker is a FIXED SCREEN SIZE -- it is a pointer, not a footprint,
 * and scaling it with the ground would make it vanish at the zoom where a small
 * crossing matters most.
 *
 * WHY IT IS NOT A LAYER RENDERER. Every band this stack composes sits between
 * Leaflet's tilePane (200) and overlayPane (400), which is what keeps the whole
 * stack under the geometry DrawTool renders into overlayPane. A caution has to
 * clear markerPane at 600 instead: a boundary vertex or any later step's pin
 * sitting over a warning is exactly the case this mark exists for. 610 is
 * above markerPane and below tooltipPane (650), and it is a property of
 * Leaflet's own numbering rather than of any step, so it is chosen here once
 * and no declaration can change it.
 *
 * SCOPED TO THE FOCUSED FEATURE. See cautionMarkersFor.
 *
 * WHERE THE CAUTIONS COME FROM. `properties.cautions` on a drawn feature,
 * written when the shape was closed (see the landform step's `shape.prepare`)
 * and never recomputed on the way past -- this is a renderer. The in-progress
 * polygon's cautions arrive the same way, from the gesture in flight.
 */

import L from 'leaflet'
import { Marker, Pane } from 'react-leaflet'

import { useDrawingProgress } from './DrawingProgress.jsx'

/** Above markerPane (600), below tooltipPane (650). See the header. */
export const CAUTION_PANE_Z = 610

const cautionIcon = new L.DivIcon({
  className: 'caution-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<span aria-hidden="true">!</span>',
})

/**
 * Every caution currently on the map: the settled drawn shapes' own, plus the
 * in-progress polygon's, which update on each vertex placed.
 */
export function cautionMarkersFor(layers, live, focusedFeatureId = null) {
  const markers = []
  for (const layer of layers) {
    if (layer.source !== 'draft' || !Array.isArray(layer.features)) continue
    for (const feature of layer.features) {
      // THE FOCUSED FEATURE'S ONLY. Every drawn shape's markers at once turned
      // the map into a field of exclamation marks with no way to tell which
      // shape any of them belonged to -- and on a parcel with several drawn
      // zones that is worse than none, because a marker that could be about
      // anything is read as being about nothing. The panel names the feature
      // and the markers point at its crossings; the two are one answer.
      //
      // POSITION IS STILL THE SIGNAL. A marker sits at the intersection it
      // describes, never at the feature's centroid -- a twelve-acre zone with
      // a sliver of wet ground along one edge points at the edge.
      if (focusedFeatureId != null && feature.id !== focusedFeatureId) continue
      for (const caution of feature.properties?.cautions ?? []) {
        markers.push({ ...caution, key: `${feature.id}-${caution.type}` })
      }
    }
  }
  for (const caution of live ?? []) {
    markers.push({ ...caution, key: `live-${caution.type}` })
  }
  // A caution with no place to point is not drawn. cautionsFor() only omits
  // `at` for a geometry it could not find a centroid in, which is a clip
  // result too degenerate to point at anyway.
  return markers.filter((caution) => caution.at)
}

export default function CautionMarkers({ layers, focusedFeatureId = null }) {
  const { cautions } = useDrawingProgress()
  const markers = cautionMarkersFor(layers, cautions, focusedFeatureId)
  if (!markers.length) return null

  return (
    <Pane name="map-cautions" style={{ zIndex: CAUTION_PANE_Z }}>
      {markers.map((caution) => (
        <Marker
          key={caution.key}
          position={caution.at}
          icon={cautionIcon}
          // It sits over the map while a zone is being drawn and must never
          // swallow a click meant to place the next vertex.
          interactive={false}
        />
      ))}
    </Pane>
  )
}
