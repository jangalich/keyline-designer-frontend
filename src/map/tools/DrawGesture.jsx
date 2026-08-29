/**
 * DrawGesture.jsx
 *
 * `draw` -- place a new shape, vertex by vertex.
 *
 * TWO COMPONENTS BEHIND ONE VERB, PICKED BY THE LAYER'S KIND, and that is the
 * whole of what this file decides:
 *
 *   kind 'ring'     DrawTool, writing into the step's declared draft INPUT.
 *                   One ring per step -- a parcel boundary is not a set.
 *
 *   source 'draft'  ZoneDrawTool, appending a Feature to the draft's
 *   (polygon)       drawnFeatures. Many shapes per step.
 *
 * DO NOT GENERALISE THESE INTO ONE. ZoneDrawTool.jsx sets out why at length,
 * and every reason still holds: DrawTool has a module-level colour memo that
 * cannot serve two callers, an `isFinished` path that makes every vertex
 * draggable, a render into Leaflet's default overlayPane, and a map-level
 * click listener -- and it sits on the live boundary -> access point -> PDF
 * path. What the two share is the GESTURE, already extracted as geo.js's
 * vertexAtPixel(), which both call and which behaves identically in both.
 *
 * A THIRD, FOR A FREE POINT (the structures step's "put a building here"), is
 * not in this branch. It attaches as one more arm of the switch below, against
 * a `kind: 'point'` layer -- see StepTools.jsx's note for the two other lines
 * it would need.
 */

import { useState } from 'react'

import { PROVENANCE_USER_ADDED, useSession } from '../../session/SessionStore'
import DrawTool from '../../DrawTool.jsx'
import ZoneDrawTool from '../../ZoneDrawTool.jsx'
import { ringToGeoJSON } from '../../geo.js'
import { useWizardCursor } from '../../wizard/WizardCursor.jsx'
import { StackLayer } from '../layers.jsx'

export default function DrawGesture(props) {
  if (props.layer.kind === 'ring') return <RingDraw {...props} />
  if (props.layer.source === 'draft') return <ShapeDraw {...props} />
  // Reachable only if a step declares `draw` over a layer nothing here can
  // author -- proposals, say. StepTools already warns about the layer having
  // no renderer; this is the same failure seen from the tool's side.
  return null
}

/**
 * The boundary's ring, through the existing DrawTool.
 *
 * THE RING IS THE DRAFT'S, NOT THIS COMPONENT'S. Every vertex placed and every
 * vertex dragged goes straight to `setDraftInput(stepId, key, points)` -- the
 * key the definition declares -- so there is no local copy to fall out of step
 * with the store, and BoundaryPanel is reading the same value as it is placed.
 *
 * `isFinished` IS DERIVED, not stored. It was App.jsx's third boolean; it is
 * "there is a closed ring and nothing is placing vertices into it", which is
 * exactly what the arming register already knows.
 *
 * DRAGGING STANDS DOWN FOR ANY OTHER GESTURE. `editingDisabled` is
 * `anyArmed && !armed`: a draggable vertex under a live access-point pick or a
 * live zone draw is the same one-click-two-things problem the tools have, and
 * a drag is not a tool with a slot of its own.
 */
function RingDraw({ layer, armed, stepId }) {
  const { actions } = useSession()
  const { anyArmed, disarm } = useWizardCursor()
  const ring = layer.ring

  return (
    <DrawTool
      isDrawing={armed}
      isFinished={!armed && ring.length >= 3}
      points={ring}
      onPointsChange={(points) => actions.setDraftInput(stepId, layer.sourceKey, points)}
      // Closing the ring ends the gesture. The slot empties; nothing else has
      // to be told, because everything downstream reads the slot.
      onCloseBoundary={disarm}
      editingDisabled={anyArmed && !armed}
    />
  )
}

/**
 * A polygon into the draft's drawn features, through ZoneDrawTool.
 *
 * THE IN-PROGRESS POINTS ARE LOCAL, AND ONLY THOSE. A half-placed ring is not
 * a decision -- it is a gesture in flight, with no meaning to the commit and
 * nothing to recover if the panel unmounts. What lands in the store is the
 * finished Feature, once. (The spike keeps its own zonePoints for the same
 * reason, and its clamping and cautions along with them; both are F4's to
 * bring across, and neither is reimplemented here.)
 *
 * NO CLAMPING, deliberately. clampToBoundary() and cautionsFor() belong to the
 * production-zone step's own reading of a shape, and a second copy of them
 * here -- applied to every step's drawing, on this branch's guess at when they
 * apply -- is exactly the thing F4 would have to unpick first.
 */
function ShapeDraw({ layer, armed, renders, stepId }) {
  const { actions } = useSession()
  const { disarm } = useWizardCursor()
  const [points, setPoints] = useState([])

  const close = () => {
    setPoints([])
    disarm()
    if (points.length < 3) return
    actions.addDrawnFeature(stepId, {
      type: 'Feature',
      // Local to the draft and never sent as an identity: buildCommitBody
      // sends drawn features as new geometry, and the server assigns the id
      // it will be known by.
      id: `drawn-${layer.layerId}-${Date.now()}`,
      properties: { provenance: PROVENANCE_USER_ADDED },
      geometry: { type: 'Polygon', coordinates: [ringToGeoJSON(points)] },
    })
  }

  return (
    <>
      {/* The settled shapes, when no delete tool is mounted to draw them. */}
      {renders ? <StackLayer layer={layer} interactive={false} /> : null}
      <ZoneDrawTool
        isDrawing={armed}
        points={points}
        onPointsChange={setPoints}
        onClose={close}
        // Above its own layer's band, so the vertices going down are never
        // under the shapes already placed.
        paneZ={layer.zIndex + 1}
      />
    </>
  )
}
