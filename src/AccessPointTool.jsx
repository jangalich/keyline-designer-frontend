import { useMapEvents, Marker } from 'react-leaflet'
import L from 'leaflet'

// Distinct from the boundary's vertex markers (green) — a mustard tone
// to match the fencing layer's palette elsewhere in the project, while
// still reading clearly as "a different kind of point" on the map.
const accessPointIcon = new L.DivIcon({
  className: 'access-point-marker',
  iconSize: [18, 18],
})

// Projects `point` onto the segment [a, b] in plain lat/lng space and
// returns the closest point on that segment along with its squared
// distance to `point`. Planar projection (no geodesic correction) is
// fine at property scale — a few acres wide at most.
function closestPointOnSegment(point, a, b) {
  const [px, py] = point
  const [ax, ay] = a
  const [bx, by] = b

  const abx = bx - ax
  const aby = by - ay
  const lengthSquared = abx * abx + aby * aby

  let t = lengthSquared === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closestX = ax + t * abx
  const closestY = ay + t * aby
  const dx = px - closestX
  const dy = py - closestY

  return { point: [closestX, closestY], distanceSquared: dx * dx + dy * dy }
}

// Finds the closest point lying ON the boundary polygon's edges (not
// its vertices) to `clickPoint`, checking every edge including the
// closing edge from the last point back to the first — the ring is
// implicitly closed, same convention DrawTool and the backend use.
function snapToPolygonEdge(clickPoint, polygonPoints) {
  let closest = null
  let closestDistanceSquared = Infinity

  for (let i = 0; i < polygonPoints.length; i++) {
    const a = polygonPoints[i]
    const b = polygonPoints[(i + 1) % polygonPoints.length]
    const result = closestPointOnSegment(clickPoint, a, b)
    if (result.distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = result.distanceSquared
      closest = result.point
    }
  }

  return closest
}

/**
 * AccessPointTool
 *
 * Lets the user pick the point where the property connects to a road,
 * modeled after DrawTool's structure. While `isSelecting` is true,
 * clicking the map snaps to the nearest point on the boundary polygon's
 * edge (not the nearest vertex) and lifts it up via `onSelect`, as a
 * [latitude, longitude] pair — same convention as `points` in App.jsx.
 * Each click replaces the previous candidate; nothing accumulates.
 */
function AccessPointTool({ isSelecting, boundaryPoints, accessPoint, onSelect }) {
  useMapEvents({
    click(e) {
      if (!isSelecting || boundaryPoints.length < 3) return

      const snapped = snapToPolygonEdge([e.latlng.lat, e.latlng.lng], boundaryPoints)
      onSelect(snapped)
    },
  })

  if (!accessPoint) return null

  return <Marker position={accessPoint} icon={accessPointIcon} />
}

export default AccessPointTool
