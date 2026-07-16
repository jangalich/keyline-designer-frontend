import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * MapRecenter
 *
 * react-leaflet's <MapContainer center={...}> only applies that center
 * on the very first render — changing the prop afterward doesn't move
 * the map. This component uses the useMap() hook to reach into the
 * underlying Leaflet map instance directly and pan/zoom it whenever
 * `center` changes (e.g. after a successful address search).
 */
function MapRecenter({ center, zoom }) {
  const map = useMap()

  useEffect(() => {
    if (center) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])

  return null
}

export default MapRecenter
