import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * ScrollZoomGate
 *
 * Renders nothing. Owns one rule: the map's scroll-wheel zoom is off until
 * the user has interacted with the map, and goes off again as soon as they
 * interact with anything else.
 *
 * Without it, someone scrolling the page hits the map, the page stops dead,
 * and the map zooms out to the continent — losing their place and their view
 * in one gesture. The inert/live distinction earns its keep beyond that: the
 * map is quiet while you read past it and live once you have committed to it.
 *
 * ACTIVATION IS TRANSPARENT. The click that activates the map also does
 * whatever it would normally have done — places a vertex, snaps an access
 * point, nothing at all. It is never swallowed. Activation is a state the
 * map enters, not an action the user performs; making it consume a click
 * would turn it into a mode toggle nobody asked for, and would eat a
 * deliberate first vertex to teach a lesson about scroll zoom.
 *
 * The listener is a document-level pointerdown rather than Leaflet's own
 * click event, for three reasons: it is symmetric (the same event decides
 * activate and deactivate), it fires for interactions Leaflet's map click
 * does not see (the zoom buttons, the basemap control), and it cannot
 * consume anything because it only reads.
 */
function ScrollZoomGate({ active, onChange }) {
  const map = useMap()

  useEffect(() => {
    if (active) {
      map.scrollWheelZoom.enable()
    } else {
      map.scrollWheelZoom.disable()
    }
  }, [active, map])

  useEffect(() => {
    const handlePointerDown = (event) => {
      // .map-wrapper rather than the Leaflet container, so the overlays
      // sitting on top of the map — chip, hint, basemap control — count as
      // part of the map rather than as "somewhere else".
      onChange(Boolean(event.target.closest?.('.map-wrapper')))
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onChange])

  return null
}

export default ScrollZoomGate
