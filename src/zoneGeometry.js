import polygonClipping from 'polygon-clipping'
import {
  largestPieceCentroid,
  multiPolygonAreaAcres,
  ringToGeoJSON,
  toMultiPolygon,
} from './geo.js'

/**
 * zoneGeometry.js
 *
 * Every clipping operation the zone tools need, in one place and with no React
 * in it. Pure functions over geometry, so the caution logic can be reasoned
 * about — and asserted — without a map.
 *
 * polygon-clipping rather than @turf/intersect. Measured on the reference
 * fixture's own layers: 9.5 KiB gzipped against 15.6, and 2.0 ms against
 * 25 ms to clip a drawn zone against all three available layers. @turf/
 * intersect 7.4 depends on polyclip-ts, a port of this same library, so the
 * difference buys a GeoJSON Feature wrapper and nothing else. Both preserve
 * interior rings correctly, which was the thing that actually had to be
 * checked — the slope layer carries twelve holes.
 */

/**
 * The smallest intersection worth reporting, in acres.
 *
 * A 5 m DEM cell is about 0.0062 acres, and the exclusion layers are raw cell
 * staircases being clipped against an arbitrary drawn ring. Below this the
 * result is the clip itself rather than a measurement of anything — two
 * geometries of different kinds disagreeing along an edge.
 *
 * 0.05 acres is where a one-decimal figure stops being able to describe it:
 * anything under rounds to "0.0 acres", which states a measurement of zero
 * over ground the user is being warned about. See cautionsFor() for what is
 * shown instead.
 */
export const CAUTION_MIN_ACRES = 0.05

/**
 * A drawn ring clamped to the parcel boundary.
 *
 * THE BOUNDARY IS THE ONLY HARD GATE. Not the eligible union — clamping to
 * eligible ground would make the caution system unreachable, because a user
 * could never draw across hydric soil to be warned about it. The rule is that
 * gates encoding physical impossibility apply and gates rejecting weak
 * candidates do not: off-parcel is not their land, while canopy, hydric,
 * slope, roads and setback are all conditions of ground they own and may
 * commit to knowingly.
 *
 * Returns { multi, acres, removedAcres }. `multi` is empty when the ring fell
 * entirely outside the parcel.
 */
export function clampToBoundary(points, boundaryPoints) {
  const drawn = [[ringToGeoJSON(points)]]
  const boundary = [[ringToGeoJSON(boundaryPoints)]]
  const multi = polygonClipping.intersection(drawn, boundary)

  const drawnAcres = multiPolygonAreaAcres(drawn)
  const acres = multiPolygonAreaAcres(multi)

  return { multi, acres, removedAcres: Math.max(0, drawnAcres - acres) }
}

/**
 * Cautions for one drawn geometry: what it crosses, how much, and where.
 *
 * `exclusionLayers` is the payload's own array, passed whole rather than
 * pre-filtered, because the SKIP RULE is part of this function's contract:
 *
 *   data_available false means the check never ran. There is no geometry to
 *   intersect, and staying silent is right — but silence here means "we did
 *   not look", not "it is clear". The panel's standing caveat is what says so,
 *   and it says so for the whole step rather than once per drawn zone.
 *
 * Each layer is intersected INDEPENDENTLY. A zone crossing both canopy and
 * slope gets two cautions, because they are two different facts about the
 * ground and unioning them first would lose which was which.
 *
 * Returns one entry per crossed layer, above the floor:
 *   { type, label, acres, at: [lat, lng] }
 */
export function cautionsFor(multi, exclusionLayers) {
  if (!multi.length) return []

  const cautions = []
  for (const layer of exclusionLayers) {
    if (!layer.data_available || !layer.geometry_wgs84) continue

    const hit = polygonClipping.intersection(multi, toMultiPolygon(layer.geometry_wgs84))
    if (!hit.length) continue

    const acres = multiPolygonAreaAcres(hit)

    // DROPPED, not shown with a hedge. Below the floor the intersection is the
    // clip itself — a raw 5 m cell staircase disagreeing with an arbitrary
    // drawn ring along their shared edge — and there is no honest way to
    // print it. "0.0 acres" states a measured zero, and "— acres" or "a
    // sliver" spends a caution line on something the geometry cannot resolve.
    //
    // This is the one place this branch chooses silence over a statement, and
    // it is worth being clear about the cost: a genuinely thin crossing along
    // an edge disappears with the noise. The floor is deliberately low —
    // about eight cells — so what disappears is only ever a few cells wide.
    if (acres < CAUTION_MIN_ACRES) continue

    cautions.push({
      type: layer.type,
      // The layer's own label, verbatim. It states the TEST that was applied
      // ("slope above 20.0%"), which is what someone overriding an exclusion
      // is entitled to read. Never reworded on this side, and never keyed on
      // — `type` is the stable half of the pair.
      label: layer.label,
      acres,
      at: largestPieceCentroid(hit),
    })
  }
  return cautions
}

/**
 * DEV-only invariant: a suggested zone must never trip a caution.
 *
 * A suggested zone is render_fill_polygon_utm — a morphological opening of a
 * cell union that already cleared every gate — so it is a strict subset of
 * eligible ground and cannot intersect an exclusion. If one ever does, the
 * pipeline produced a zone over ground it had already rejected, and that is a
 * backend bug to fix rather than a warning to show someone.
 *
 * Verified empty across both reference fixtures before this was written, so
 * it is a real check rather than a hope. Throws in DEV and does nothing in a
 * production build, matching the mutual-exclusion invariant in App.jsx.
 */
export function assertSuggestedZonesAreClean(features, exclusionLayers) {
  for (const feature of features) {
    // Deliberately NOT cautionsFor(). That function drops anything under
    // CAUTION_MIN_ACRES because a sliver is not worth a caution line — but
    // this is not asking whether a crossing is worth showing, it is asking
    // whether one exists at all. A suggested zone overlapping an exclusion by
    // a single cell is the same pipeline bug as one overlapping it by an acre,
    // and running the display filter here would hide exactly the small,
    // early-warning case an invariant exists to catch.
    const hits = []
    for (const layer of exclusionLayers) {
      if (!layer.data_available || !layer.geometry_wgs84) continue
      const hit = polygonClipping.intersection(
        toMultiPolygon(feature.geometry),
        toMultiPolygon(layer.geometry_wgs84)
      )
      if (hit.length) hits.push(`${layer.type} (${multiPolygonAreaAcres(hit).toFixed(4)} ac)`)
    }
    if (hits.length) {
      throw new Error(
        `Suggested zone ${feature.id} intersects ${hits.join(', ')} — a suggested ` +
          'zone is an opening of ground that already cleared every gate and cannot ' +
          'cross an exclusion. This is a pipeline bug, not a caution for the user.'
      )
    }
  }
}
