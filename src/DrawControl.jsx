import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-draw'

/**
 * DrawControl
 *
 * Adds Leaflet's drawing toolbar (polygon tool) to the map and reports
 * the drawn boundary back to the parent component as a list of
 * [longitude, latitude] coordinate pairs — the same format the backend's
 * soil_data.py, elevation_data.py, and hydrology_data.py functions expect.
 *
 * We use the base `leaflet-draw` plugin directly via the useMap() hook,
 * rather than a React wrapper package, since the common wrapper
 * (react-leaflet-draw) hasn't kept pace with React 18 / react-leaflet v4.
 * This is a small amount of extra wiring but avoids a version-mismatch
 * risk similar to what happened with the Node/create-vite tooling.
 */
function DrawControl({ onBoundaryChange }) {
  const map = useMap()
  const drawnItemsRef = useRef(null)

  useEffect(() => {
    // A dedicated layer group to hold whatever the user draws
    const drawnItems = new L.FeatureGroup()
    drawnItemsRef.current = drawnItems
    map.addLayer(drawnItems)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: '#5a7247',
          },
        },
        // Only polygon drawing is relevant for marking a farm boundary —
        // disable the other shape tools to keep the toolbar simple.
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
      },
    })

    map.addControl(drawControl)

    const handleCreated = (event) => {
      // Only one boundary at a time makes sense for this tool — clear
      // any previous shape before adding the new one.
      drawnItems.clearLayers()
      drawnItems.addLayer(event.layer)

      const latLngs = event.layer.getLatLngs()[0]
      const coordinates = latLngs.map((point) => [point.lng, point.lat])

      onBoundaryChange(coordinates)
    }

    const handleEdited = (event) => {
      // Fires when the pencil (edit) tool is used to drag existing points —
      // a different event from CREATED, so it needs its own handler to
      // keep the captured coordinates in sync with what's on screen.
      event.layers.eachLayer((layer) => {
        const latLngs = layer.getLatLngs()[0]
        const coordinates = latLngs.map((point) => [point.lng, point.lat])
        onBoundaryChange(coordinates)
      })
    }

    const handleDeleted = () => {
      onBoundaryChange(null)
    }

    map.on(L.Draw.Event.CREATED, handleCreated)
    map.on(L.Draw.Event.EDITED, handleEdited)
    map.on(L.Draw.Event.DELETED, handleDeleted)

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated)
      map.off(L.Draw.Event.EDITED, handleEdited)
      map.off(L.Draw.Event.DELETED, handleDeleted)
      map.removeControl(drawControl)
      map.removeLayer(drawnItems)
    }
  }, [map, onBoundaryChange])

  return null
}

export default DrawControl
