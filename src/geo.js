/**
 * geo.js
 *
 * Small planar geometry helpers for the drawing tools, in [latitude,
 * longitude] order — the same convention DrawTool, AccessPointTool and
 * App.jsx all use.
 *
 * THE LONGITUDE SCALE. Everything here works in a flat plane rather than a
 * real projection, which is the right call for a click handler on a
 * property-sized shape. But "planar is fine at this scale" is only true of
 * DISTANCE, not of ASPECT: a degree of longitude is cos(latitude) times the
 * ground length of a degree of latitude, and that ratio does not shrink as
 * the shape gets smaller. At 40.6N it is 0.76 — longitude is compressed by
 * 24% — so treating raw degrees as a square plane skews every projection and
 * every area.
 *
 * Measured, before this was fixed: on a 506m diagonal boundary segment, the
 * "nearest point" computed in raw degrees sat 24.3m along the boundary from
 * the true nearest point.
 *
 * So: scale longitude by cos(mean latitude) into a local metres-like frame,
 * do the flat math there, and convert back. Full UTM reprojection would be
 * more correct still and is not warranted for a click handler.
 */

const METRES_PER_DEGREE_LATITUDE = 111132.0
const METRES_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111320.0
const SQUARE_METRES_PER_ACRE = 4046.8564224

/** Mean latitude of a [lat, lng] list — the reference for the longitude scale. */
export function meanLatitude(points) {
  if (!points.length) return 0
  return points.reduce((sum, [lat]) => sum + lat, 0) / points.length
}

/** cos(latitude): how much shorter a degree of longitude is than one of latitude. */
export function longitudeScale(latitude) {
  return Math.cos((latitude * Math.PI) / 180)
}

/**
 * Closest point on segment [a, b] to `point`, and its squared distance, all
 * computed in a longitude-scaled frame so the projection is not skewed.
 * `scale` is longitudeScale() for the shape's mean latitude.
 */
export function closestPointOnSegment(point, a, b, scale) {
  const px = point[0]
  const py = point[1] * scale
  const ax = a[0]
  const ay = a[1] * scale
  const bx = b[0]
  const by = b[1] * scale

  const abx = bx - ax
  const aby = by - ay
  const lengthSquared = abx * abx + aby * aby

  let t = lengthSquared === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closestX = ax + t * abx
  const closestY = ay + t * aby
  const dx = px - closestX
  const dy = py - closestY

  // Back out of the scaled frame before returning a real coordinate.
  return {
    point: [closestX, closestY / scale],
    distanceSquared: dx * dx + dy * dy,
  }
}

/**
 * Closest point lying ON the polygon's edges (not its vertices), checking
 * every edge including the closing edge from the last point back to the
 * first — the ring is implicitly closed, the same convention DrawTool and
 * the backend both use. Returns null for fewer than 2 points.
 */
export function snapToPolygonEdge(clickPoint, polygonPoints) {
  if (polygonPoints.length < 2) return null

  const scale = longitudeScale(meanLatitude(polygonPoints))
  let closest = null
  let closestDistanceSquared = Infinity

  for (let i = 0; i < polygonPoints.length; i++) {
    const a = polygonPoints[i]
    const b = polygonPoints[(i + 1) % polygonPoints.length]
    const result = closestPointOnSegment(clickPoint, a, b, scale)
    if (result.distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = result.distanceSquared
      closest = result.point
    }
  }

  return closest
}

/**
 * Area of the implicitly-closed ring, in acres, by the shoelace formula in
 * the same longitude-scaled frame.
 *
 * Client-side on purpose: this feeds the live chip while someone is still
 * drawing, so it has to be instant and cannot involve the backend. It is a
 * guide, not the figure the report is built from — the backend recomputes
 * area properly in UTM.
 *
 * Returns 0 for fewer than 3 points. Absolute value, so winding order
 * (clockwise or counter-clockwise) does not matter.
 */
export function polygonAreaAcres(points) {
  if (points.length < 3) return 0

  const scale = longitudeScale(meanLatitude(points))
  let doubleArea = 0

  for (let i = 0; i < points.length; i++) {
    const [lat1, lng1] = points[i]
    const [lat2, lng2] = points[(i + 1) % points.length]
    doubleArea += lat1 * (lng2 * scale) - lat2 * (lng1 * scale)
  }

  const squareDegrees = Math.abs(doubleArea) / 2
  const squareMetres =
    squareDegrees * METRES_PER_DEGREE_LATITUDE * METRES_PER_DEGREE_LONGITUDE_AT_EQUATOR
  return squareMetres / SQUARE_METRES_PER_ACRE
}

/** Reads a CSS custom property off the document as a plain string.
 *  Leaflet takes JS colour values and cannot resolve var(); see DrawTool. */
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * How far past the drawn boundary the off-parcel scrim reaches, in degrees.
 *
 * The scrim only has to cover the visible viewport — it is a dim over
 * everything that is not the parcel, not a real geometry with an outer edge
 * anyone should ever see. 5 degrees is roughly 550 km, hundreds of times the
 * viewport height at any zoom someone traces a property at, so the outer ring
 * never comes into view and never has to be recomputed on pan or zoom.
 *
 * Not a world-covering ring, which would be the other way to guarantee this:
 * a polygon spanning the full longitude range invites antimeridian-wrapping
 * behaviour from Leaflet for no benefit on a tool that is US-only by
 * construction.
 */
const SCRIM_SPAN_DEGREES = 5

/**
 * The off-parcel scrim's two rings, as Leaflet expects them for a polygon
 * with a hole: [outerRing, holeRing], in [latitude, longitude] order.
 *
 * DERIVED CLIENT-SIDE from the boundary the user already drew — the backend
 * does not ship this and should not. It is a statement about what the user
 * selected, not a measurement of their land.
 *
 * Leaflet reads the second and subsequent rings of a polygon as holes
 * regardless of winding order, so the boundary is passed through exactly as
 * drawn rather than being rewound first. (GeoJSON's right-hand rule does
 * govern the eligible union's holes, but that geometry arrives already
 * conformant from the backend and is handed to Leaflet's own GeoJSON reader,
 * not built here.)
 *
 * Returns null for fewer than 3 points — there is no enclosed parcel to
 * exclude from the dim yet, and dimming the entire map would be wrong.
 */
export function offParcelScrimRings(points) {
  if (points.length < 3) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  // Clamped to valid coordinates: Web Mercator is undefined at the poles, and
  // a ring built off a boundary near one would otherwise carry a latitude the
  // projection cannot place.
  const south = Math.max(minLat - SCRIM_SPAN_DEGREES, -85)
  const north = Math.min(maxLat + SCRIM_SPAN_DEGREES, 85)
  const west = Math.max(minLng - SCRIM_SPAN_DEGREES, -180)
  const east = Math.min(maxLng + SCRIM_SPAN_DEGREES, 180)

  return [
    [
      [south, west],
      [south, east],
      [north, east],
      [north, west],
    ],
    points,
  ]
}

/**
 * Index of the already-placed vertex a click landed on, or -1.
 *
 * EXTRACTED FROM DrawTool, which still calls it and behaves identically. The
 * zone tool needs the same gesture — the same threshold, the same "landing on
 * a vertex means close-the-ring or do nothing, never place a duplicate" rule —
 * and two components sharing one pure function is the whole of what they need
 * to share. Generalising the COMPONENT would have meant parameterising its
 * colours (a module-level memo), its pane, and whether its vertices are
 * draggable, on the one tool the existing boundary → report path depends on.
 *
 * Pixel-space, not degrees: `project` is the caller's map projection, so the
 * gesture behaves the same at every zoom. A metre threshold would be unusably
 * tight zoomed out and sloppy zoomed in.
 */
export function vertexAtPixel(clickPoint, points, project, radiusPx) {
  const clickPixel = project(clickPoint)
  for (let i = 0; i < points.length; i++) {
    const vertexPixel = project(points[i])
    const dx = clickPixel.x - vertexPixel.x
    const dy = clickPixel.y - vertexPixel.y
    if (Math.sqrt(dx * dx + dy * dy) <= radiusPx) return i
  }
  return -1
}

/* --- GeoJSON interop -------------------------------------------------------

   Everything above this line works in [latitude, longitude] — Leaflet's order,
   and the order every drawing tool in this app uses. Everything the backend
   sends, and everything polygon-clipping returns, is GeoJSON [longitude,
   latitude]. These four functions are the only places the two meet, so the
   swap happens once per direction instead of at every call site.
   --------------------------------------------------------------------------- */

/** One [lat, lng] point as a GeoJSON position [lng, lat]. */
export function pointToGeoJSON([lat, lng]) {
  return [lng, lat]
}

/** One GeoJSON position [lng, lat] as a [lat, lng] point. The ring helpers
 *  below close and unclose; a single point must never pass through them, as a
 *  one-point ring "closes on itself" and comes back empty. */
export function pointFromGeoJSON([lng, lat]) {
  return [lat, lng]
}

/** A ring of [lat, lng] points as a closed GeoJSON ring of [lng, lat]. */
export function ringToGeoJSON(points) {
  const ring = points.map(([lat, lng]) => [lng, lat])
  ring.push(ring[0])
  return ring
}

/** A GeoJSON ring of [lng, lat] as [lat, lng] points, closing coordinate
 *  dropped — Leaflet closes a Polygon implicitly and a duplicate final point
 *  renders a zero-length segment. */
export function ringFromGeoJSON(ring) {
  const points = ring.map(([lng, lat]) => [lat, lng])
  const [firstLat, firstLng] = points[0]
  const [lastLat, lastLng] = points[points.length - 1]
  if (firstLat === lastLat && firstLng === lastLng) points.pop()
  return points
}

/** Any GeoJSON Polygon or MultiPolygon geometry as polygon-clipping's own
 *  shape: an array of polygons, each an array of rings. A Polygon is wrapped
 *  rather than special-cased at every call site — the eligible union arrives
 *  as either type depending on whether the parcel's eligible ground happens to
 *  be one connected region. */
export function toMultiPolygon(geometry) {
  if (!geometry) return []
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

/** polygon-clipping output as Leaflet positions: one [lat, lng] ring list per
 *  polygon, holes included as later rings — which is exactly how Leaflet's
 *  Polygon reads a positions array. */
export function multiPolygonToLatLngs(multi) {
  return multi.map((polygon) => polygon.map(ringFromGeoJSON))
}

/**
 * Area in acres of a polygon-clipping MultiPolygon, WITH INTERIOR RINGS
 * SUBTRACTED.
 *
 * A separate function from polygonAreaAcres() above rather than a widening of
 * it, and the difference is not cosmetic: that one takes a single [lat, lng]
 * ring and shoelaces it, with no concept of a hole. Every geometry on this
 * path can have holes — the slope exclusion layer carries twelve — so an
 * intersection against it measured by the old helper would report the hole's
 * ground as excluded when the gate had already cleared it.
 *
 * Same longitude-scaled planar frame and the same reasoning: this is a live
 * readout while someone is still placing vertices, so it has to be instant,
 * and the backend recomputes properly in UTM for anything that is committed.
 */
export function multiPolygonAreaAcres(multi) {
  if (!multi.length) return 0

  // One scale for the whole geometry, taken from the first ring's mean
  // latitude. Mixing scales between a polygon and its own hole would subtract
  // an area measured in a different frame from the one it sits inside.
  const first = multi[0][0]
  const scale = longitudeScale(
    first.reduce((sum, [, lat]) => sum + lat, 0) / first.length
  )

  let squareDegrees = 0
  for (const polygon of multi) {
    for (let r = 0; r < polygon.length; r++) {
      const ring = polygon[r]
      let doubleArea = 0
      for (let i = 0; i < ring.length; i++) {
        const [lng1, lat1] = ring[i]
        const [lng2, lat2] = ring[(i + 1) % ring.length]
        doubleArea += lat1 * (lng2 * scale) - lat2 * (lng1 * scale)
      }
      // Ring 0 is the exterior, every later ring is a hole.
      squareDegrees += (r === 0 ? 1 : -1) * Math.abs(doubleArea) / 2
    }
  }

  const squareMetres =
    squareDegrees * METRES_PER_DEGREE_LATITUDE * METRES_PER_DEGREE_LONGITUDE_AT_EQUATOR
  return squareMetres / SQUARE_METRES_PER_ACRE
}

/**
 * A point to hang a caution icon on: the area-weighted centroid of the largest
 * piece of an intersection, as [lat, lng].
 *
 * THE LARGEST PIECE, not the whole intersection. An intersection with a cell
 * staircase is often several disjoint slivers, and the centroid of the SET
 * would land in the gap between them — pointing at ground the drawn zone does
 * not cross, which is the one thing the icon's position is there to avoid.
 *
 * A shoelace centroid can fall outside a sufficiently concave ring. Left as
 * is: these pieces are blobby cell unions rather than crescents, and the icon
 * is a location hint rather than a measurement.
 */
export function largestPieceCentroid(multi) {
  if (!multi.length) return null

  let best = null
  let bestArea = -Infinity
  for (const polygon of multi) {
    const ring = polygon[0]
    let doubleArea = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[(i + 1) % ring.length]
      doubleArea += x1 * y2 - x2 * y1
    }
    const area = Math.abs(doubleArea) / 2
    if (area > bestArea) {
      bestArea = area
      best = ring
    }
  }

  let doubleArea = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < best.length; i++) {
    const [x1, y1] = best[i]
    const [x2, y2] = best[(i + 1) % best.length]
    const cross = x1 * y2 - x2 * y1
    doubleArea += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }

  // A degenerate ring (every vertex collinear) has zero area and no defined
  // centroid; the vertex mean is the sensible stand-in.
  if (doubleArea === 0) {
    const mx = best.reduce((s, [x]) => s + x, 0) / best.length
    const my = best.reduce((s, [, y]) => s + y, 0) / best.length
    return [my, mx]
  }

  return [cy / (3 * doubleArea), cx / (3 * doubleArea)]
}
