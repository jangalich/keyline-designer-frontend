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

import { useEffect, useState } from 'react'

import { PROVENANCE_USER_ADDED, useSession } from '../../session/SessionStore'
import DrawTool from '../../DrawTool.jsx'
import ZoneDrawTool from '../../ZoneDrawTool.jsx'
import { ringToGeoJSON } from '../../geo.js'
import { useWizardCursor } from '../../wizard/WizardCursor.jsx'
import { useDrawingProgress } from '../DrawingProgress.jsx'
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
 * `anyArmed && !armed`: a draggable vertex under another step's live tool or a
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
 * finished Feature, once. They are MIRRORED to DrawingProgress rather than
 * kept private, because the panel reads out what the polygon crosses as each
 * vertex goes down and the caution pane marks each crossing, and neither of
 * those is inside this tool.
 *
 * THE STEP SAYS WHAT ITS SHAPES MEAN. `definition.shape` is where clamping,
 * cautions and the Feature's own properties live -- landform clamps to the
 * parcel and clips against its exclusion gates; a step that declares no
 * `shape` gets the ring as drawn. That is the same posture F3 took when it
 * declined to put clampToBoundary() here: the rules are a reading of one
 * step's payload, and a copy of them in this file would apply them to every
 * step's drawing on a guess at when they apply.
 */
function ShapeDraw({ layer, armed, renders, stepId, definition, references }) {
  const { actions } = useSession()
  const { disarm } = useWizardCursor()
  const progress = useDrawingProgress()
  const [points, setPoints] = useState([])

  const shape = definition?.shape ?? null
  const parcel = layer.parcel ?? []

  // The live readout, recomputed on each vertex placed once there are three.
  // Not on mousemove -- this tool places points on click and there is no
  // rubber band to follow.
  useEffect(() => {
    progress.report(points, shape ? shape.live({ points, parcel, references }) : [])
    // `progress` is a stable pair of callbacks plus the value they set; adding
    // it here would re-run this on its own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, parcel, references, shape])

  // A gesture abandoned by unmounting -- the panel closed, the cursor moved --
  // leaves nothing behind on the map.
  useEffect(() => () => progress.clear(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setPoints([])
    disarm()
    if (points.length < 3) {
      progress.clear()
      return
    }

    const prepared = shape
      ? shape.close({ points, parcel, references })
      : {
          feature: {
            type: 'Feature',
            // Local to the draft and never sent as an identity: buildCommitBody
            // sends drawn features as new geometry, and the server assigns the
            // id it will be known by.
            id: `drawn-${layer.layerId}-${Date.now()}`,
            properties: { provenance: PROVENANCE_USER_ADDED },
            geometry: { type: 'Polygon', coordinates: [ringToGeoJSON(points)] },
          },
          notice: null,
        }

    // The step may refuse a shape outright -- landform does, for a ring that
    // fell entirely off the parcel -- and says why through the notice rather
    // than by swallowing the gesture. The notice goes to DrawingProgress, NOT
    // to the draft: a draft's inputs are sent with the commit, and a message
    // about a gesture is not a decision. See NOTHING_IN_FLIGHT's `notice`.
    progress.settle(prepared?.notice ?? null)
    if (prepared?.feature) actions.addDrawnFeature(stepId, prepared.feature)
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


