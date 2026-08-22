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
