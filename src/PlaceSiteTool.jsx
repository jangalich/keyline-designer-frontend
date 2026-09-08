import { useMapEvents, Marker } from 'react-leaflet'

import { sitePinIcon } from './map/layers.jsx'

/**
 * PlaceSiteTool
 *
 * ONE CLICK, ONE FREE POINT. The structures step's "put a building here":
 * while `isPlacing`, a click anywhere on the map lifts its coordinate up
 * through `onPlace` as a [latitude, longitude] pair -- the same convention
 * every other drawing tool in this app produces -- and that is the whole of
 * the gesture. No vertices, no ring to close, no edge to snap to.
 *
 * A THIRD TOOL COMPONENT, NOT A GENERALISATION OF EITHER OF THE OTHER TWO,
 * and StepTools.jsx's header said it would be. ZoneDrawTool places the
 * vertices of a polygon and closes it on the first one; AccessPointTool
 * snaps one point to the nearest boundary EDGE and drops the click entirely
 * when it lands too far from one -- a gesture with a miss distance, kept on
 * disk since the shell branch because its snap-to-line had exactly one
 * consumer and would have one again. A structure site is a different gesture
 * from both: a free point anywhere INSIDE the parcel, where the parcel is a
 * containment test rather than a snap target, and where a click that lands
 * outside it is REFUSED rather than moved. Neither tool's click handler can
 * be parameterised into that without growing a flag that says which of the
 * three it is being, and a flag that says which gesture a gesture is, is the
 * gesture failing to be one.
 *
 * WHAT THIS TOOL DOES NOT DECIDE. Whether the point is on the parcel, what
 * it scores, whether there is a slot left for it -- all of that is the
 * STEP'S reading of the click (stepDefinitions' `placement.place`), the same
 * posture ShapeDraw takes when it hands a closed ring to `definition.shape`
 * rather than clamping it here. This component knows a coordinate and a
 * pending marker, and nothing about buildings.
 *
 * THE PENDING MARKER. A placed site is not on the map the instant it is
 * clicked: the server measures the spot first, and while that request is
 * out the click has to be visibly somewhere or the user places it twice.
 * `pending` is that coordinate, drawn as the site pin HOLLOW (App.css's
 * .site-pin--pending, the access-point marker's own "here, pending"
 * treatment on this step's glyph), and it goes the moment the answer lands
 * -- as the scored site's pin, or as a notice saying why not. It is NOT
 * interactive: it sits under an armed tool and must never swallow the next
 * click.
 *
 * This component's click handler is one of several on this map; none stops
 * propagation, and the arming register (WizardCursor) holds the invariant
 * that no two tools are armed at once.
 */
const pendingSiteIcon = sitePinIcon('site-pin--pending')

function PlaceSiteTool({ isPlacing, pending, onPlace }) {
  useMapEvents({
    click(e) {
      if (!isPlacing) return
      onPlace([e.latlng.lat, e.latlng.lng])
    },
  })

  if (!pending) return null

  return <Marker position={pending} icon={pendingSiteIcon} interactive={false} />
}

export default PlaceSiteTool
