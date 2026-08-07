import { useMapEvents, useMap, Marker, Polygon, Polyline } from 'react-leaflet'
import L from 'leaflet'

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

// How close (in screen pixels) a click needs to land to the first point
// before it's treated as "close the polygon" rather than "add a point".
const CLOSE_POLYGON_THRESHOLD_PX = 15

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
 *    there are already 3+ points and the click lands within ~15px (screen
 *    space) of the first point, in which case it closes the ring instead
 *    by calling `onCloseBoundary`. The points array itself never gets a
 *    duplicate closing coordinate; Polygon (and Shapely, on the backend)
 *    both close the ring implicitly by connecting the last point to the
 *    first.
 *  - Once `isFinished` is true (set by the parent, via a "Finish" button),
 *    each point becomes a draggable marker so the shape can be adjusted.
 *  - All points are lifted up to the parent via onPointsChange, as
 *    [latitude, longitude] pairs (Leaflet's native order) — the parent
 *    is responsible for converting to [longitude, latitude] when sending
 *    to the backend, since that's what the Python functions expect.
 */
function DrawTool({ isDrawing, isFinished, points, onPointsChange, onCloseBoundary }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!isDrawing) return

      if (points.length >= 3) {
        const clickPixel = map.latLngToContainerPoint(e.latlng)
        const firstPointPixel = map.latLngToContainerPoint(
          L.latLng(points[0][0], points[0][1])
        )
        if (clickPixel.distanceTo(firstPointPixel) <= CLOSE_POLYGON_THRESHOLD_PX) {
          onCloseBoundary()
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

  return (
    <>
      {isFinished && points.length >= 3 && (
        <Polygon positions={points} pathOptions={{ color: '#5a7247', weight: 2 }} />
      )}

      {!isFinished && points.length >= 2 && (
        <Polyline
          positions={points}
          pathOptions={{ color: '#5a7247', weight: 2, dashArray: '6,6' }}
        />
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
          draggable={isFinished}
          eventHandlers={
            isFinished ? { drag: (e) => handleMarkerDrag(index, e) } : {}
          }
        />
      ))}
    </>
  )
}

export default DrawTool
