import { useMapEvents, Marker, Polygon, Polyline } from 'react-leaflet'
import L from 'leaflet'

// A small circular marker for each boundary point — simpler and more
// reliable than Leaflet's default marker icon, which often has loading
// issues when bundled with tools like Vite.
const vertexIcon = new L.DivIcon({
  className: 'vertex-marker',
  iconSize: [14, 14],
})

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
 *  - While `isDrawing` is true, clicking the map adds a new point.
 *  - Once `isFinished` is true (set by the parent, via a "Finish" button),
 *    each point becomes a draggable marker so the shape can be adjusted.
 *  - All points are lifted up to the parent via onPointsChange, as
 *    [latitude, longitude] pairs (Leaflet's native order) — the parent
 *    is responsible for converting to [longitude, latitude] when sending
 *    to the backend, since that's what the Python functions expect.
 */
function DrawTool({ isDrawing, isFinished, points, onPointsChange }) {
  useMapEvents({
    click(e) {
      if (!isDrawing) return
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
          icon={vertexIcon}
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
