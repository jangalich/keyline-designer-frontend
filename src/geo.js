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
