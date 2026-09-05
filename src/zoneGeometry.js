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
 * `grounds` IS THE PARAMETER, and it used to be landform's payload.
 *
 * This took landform's `exclusion_layers` whole -- five per-gate wrappers --
 * and the skip rule for a gate whose `data_available` was false lived in
 * here. That made the function a reader of ONE step's payload shape rather
 * than the clip it is. The trees step measures a drawn zone against a
 * different set of grounds entirely (what the user has COMMITTED, and the
 * canopy -- never the exclusion gates, see TREES_STEP), and none of those
 * carries a `data_available`. Two implementations of one clip would drift
 * the first time either changed its floor, so the grounds are handed in and
 * this stays the one clip.
 *
 * A GROUND is `{type, label, geometry_wgs84}`:
 *
 *   type            the stable identity a consumer branches on
 *   label           the ground's own words for what was crossed, carried
 *                   through verbatim onto the caution -- never reworded here
 *   geometry_wgs84  a GeoJSON Polygon or MultiPolygon, or null
 *
 * A ground with NO GEOMETRY IS SKIPPED, and that is the whole of the skip
 * rule now: "there is nothing here to cross" (an empty water commit is not a
 * ground -- the server's crossing_grounds() omits it for the same reason).
 * What a ground's ABSENCE means -- "we did not look" as opposed to "it is
 * clear" -- is the caller's to say, and exclusionGrounds() is where landform
 * says it.
 *
 * Each ground is intersected INDEPENDENTLY. A zone crossing both canopy and
 * slope gets two cautions, because they are two different facts about the
 * ground and unioning them first would lose which was which.
 *
 * Returns one entry per crossed ground, above the floor:
 *   { type, label, acres, at: [lat, lng] }
 */
export function cautionsFor(multi, grounds) {
  if (!multi.length) return []

  const cautions = []
  for (const ground of grounds) {
    const geometry = toMultiPolygon(ground.geometry_wgs84)
    if (!geometry.length) continue

    const hit = polygonClipping.intersection(multi, geometry)
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
      type: ground.type,
      // The ground's own label, verbatim. For an exclusion gate it states the
      // TEST that was applied ("slope above 20.0%"), which is what someone
      // overriding an exclusion is entitled to read; for a committed claim it
      // names the claim. Never reworded on this side, and never keyed on —
      // `type` is the stable half of the pair.
      label: ground.label,
      acres,
      at: largestPieceCentroid(hit),
    })
  }
  return cautions
}

/**
 * Landform's exclusion gates as grounds.
 *
 * THE SKIP RULE, WHERE THE PAYLOAD SHAPE IS. `data_available` false means the
 * check never ran: there is no geometry to intersect, and staying silent is
 * right — but silence here means "we did not look", not "it is clear". The
 * step's standing notice is what says so, and it says so for the whole step
 * rather than once per drawn zone. The wire's per-gate wrappers become the
 * `{type, label, geometry_wgs84}` the clip reads, and nothing downstream of
 * this knows there was ever a flag.
 */
export function exclusionGrounds(exclusionLayers) {
  return (exclusionLayers ?? [])
    .filter((layer) => layer.data_available && layer.geometry_wgs84)
    .map((layer) => ({ type: layer.type, label: layer.label, geometry_wgs84: layer.geometry_wgs84 }))
}

/**
 * ONE GROUND OUT OF A STEP'S COMMITTED FEATURES: the union of every polygon
 * in the collection, or a ground with no geometry when there are none.
 *
 * THE TREES STEP'S GROUNDS ARE OTHER STEPS' COMMITS. A drawn tree zone is
 * warned about the committed production areas and the committed water zone,
 * and both reach the client as a FeatureCollection in the Design Document —
 * several features, where the clip wants one geometry per ground. Unioned
 * rather than concatenated so two adjoining production zones read as one
 * crossing with one acreage, which is what the server's own footprint
 * (wire_translation.production_zones_footprint, a unary_union) records.
 *
 * NULL GEOMETRY FOR AN EMPTY COMMIT, deliberately: "no water zone on this
 * parcel" is a decision the document carries as an empty collection, and it
 * is not a ground to cross. cautionsFor() skips it, exactly as the server's
 * crossing_grounds() omits a footprint that is None.
 */
export function groundFromFeatures({ type, label }, collection) {
  const polygons = (collection?.features ?? [])
    .map((feature) => toMultiPolygon(feature.geometry))
    .filter((multi) => multi.length)
  if (!polygons.length) return { type, label, geometry_wgs84: null }
  const union = polygons.length === 1 ? polygons[0] : polygonClipping.union(...polygons)
  return { type, label, geometry_wgs84: { type: 'MultiPolygon', coordinates: union } }
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
 * Takes GROUNDS, the same `{type, label, geometry_wgs84}` cautionsFor()
 * reads (exclusionGrounds() makes them out of a landform payload).
 *
 * Verified empty across both reference fixtures before this was written, so
 * it is a real check rather than a hope. Throws in DEV and does nothing in a
 * production build, matching the mutual-exclusion invariant in App.jsx.
 */
export function assertSuggestedZonesAreClean(features, grounds) {
  for (const feature of features) {
    // Deliberately NOT cautionsFor(). That function drops anything under
    // CAUTION_MIN_ACRES because a sliver is not worth a caution line — but
    // this is not asking whether a crossing is worth showing, it is asking
    // whether one exists at all. A suggested zone overlapping an exclusion by
    // a single cell is the same pipeline bug as one overlapping it by an acre,
    // and running the display filter here would hide exactly the small,
    // early-warning case an invariant exists to catch.
    const hits = []
    for (const ground of grounds) {
      const geometry = toMultiPolygon(ground.geometry_wgs84)
      if (!geometry.length) continue
      const hit = polygonClipping.intersection(toMultiPolygon(feature.geometry), geometry)
      if (hit.length) hits.push(`${ground.type} (${multiPolygonAreaAcres(hit).toFixed(4)} ac)`)
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
