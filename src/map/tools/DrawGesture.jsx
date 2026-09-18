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
 * A THIRD, FOR A FREE POINT (the structures step's "put a building here"):
 *
 *   source 'draft'  PlaceSiteTool, on a step declaring `placement`. One click
 *   + placement     is one point, the STEP scores it (a server verb) and the
 *                   Feature that comes back joins the draft's drawnFeatures.
 *
 * IT DID NOT ATTACH WHERE THE OLD NOTE SAID IT WOULD, and the reason is worth
 * recording. The note guessed a `kind: 'point'` layer. A placed structure site
 * IS a point on the wire -- the document holds the coordinate the user chose
 * -- but what the MAP draws, and what a checkbox, a delete and a focus act on,
 * is the building pad the server measured, a polygon riding beside the point
 * as properties.footprint_wgs84. So the placed sites are a `polygon` layer
 * sourced from the draft, exactly like a drawn zone's, and the layer declares
 * a `footprint` reader that says what to draw (see layers.jsx's drawnAs). What
 * tells this switch to mount a placement tool over that layer rather than a
 * vertex tool is the STEP's `placement` declaration -- which mirrors where the
 * backend puts the same fact (step_registry.StepDefinition.placement): a
 * placement is a property of the step, not of a layer.
 */

import { useEffect, useRef, useState } from 'react'

import { PROVENANCE_USER_ADDED, selectStepProposals, useSession } from '../../session/SessionStore'
import AccessPointTool from '../../AccessPointTool.jsx'
import DrawTool from '../../DrawTool.jsx'
import PlaceSiteTool from '../../PlaceSiteTool.jsx'
import ZoneDrawTool from '../../ZoneDrawTool.jsx'
import { ringToGeoJSON } from '../../geo.js'
import { useWizardCursor } from '../../wizard/WizardCursor.jsx'
import { useDrawingProgress } from '../DrawingProgress.jsx'
import { StackLayer } from '../layers.jsx'

export default function DrawGesture(props) {
  if (props.layer.kind === 'ring') return <RingDraw {...props} />
  if (props.layer.kind === 'point') return <PointDraw {...props} />
  if (props.layer.source === 'draft') {
    return props.definition?.placement ? <SitePlace {...props} /> : <ShapeDraw {...props} />
  }
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
 * ONE POINT ON THE PARCEL'S EDGE, into the step's declared draft input,
 * through AccessPointTool -- the third arm the file's header always said a
 * point would add, and the component that has been on disk unimported since
 * the shell branch waiting for exactly this.
 *
 * THE POINT IS THE DRAFT'S. Each click while armed replaces it under the
 * input the layer declares (`sourceKey`), snapped to the boundary edge by
 * the tool's own gesture; nothing here holds a copy. The marker for the
 * pending point is the tool's own, drawn armed or not, so the point stays
 * on the map once the tool is down and the banner's generate can read it.
 *
 * NEVER AUTO-ARMED. `armed` comes from the register like every other
 * gesture; this component arms nothing.
 */
function PointDraw({ layer, armed, stepId }) {
  const { actions } = useSession()
  const pending = (layer.points ?? []).find((point) => point.id === 'pending') ?? null

  return (
    <AccessPointTool
      isSelecting={armed}
      boundaryPoints={layer.parcel ?? []}
      accessPoint={pending?.position ?? null}
      onSelect={(point) => actions.setDraftInput(stepId, layer.sourceKey, point)}
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
 *
 * AND A STEP MAY ASK THE SERVER WHAT IT DREW. `shape.measure` is the optional
 * second half of that contract: the shape lands in the draft FIRST, from
 * `close()`, and the measurement follows when it arrives. Landform declares
 * one -- the slope, aspect, position and soil under a drawn block are
 * readings of ground only the server holds -- and SitePlace below is the same
 * verb the other way round, where the server's answer IS the feature and
 * there is nothing to show until it lands. The order is the difference and it
 * is deliberate: a drawn ring is already a decision the moment it closes, so
 * it must never wait on a request to appear, and a request that fails leaves
 * the block on the map with em dashes where its readings would be.
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

  // AND A GESTURE ABANDONED BY DISARMING LEAVES NOTHING EITHER. THIS IS THE
  // BUG IT CLOSES: the vertices lived in this component's own state, and
  // Cancel put the arming register back to empty without touching them. What
  // the user saw was a ring that had stopped responding -- ZoneDrawTool draws
  // nothing while disarmed, so the vertices went off the map -- with the panel
  // still reading "Drawing a zone", the live caution markers still on the map
  // (they are the gesture's, from DrawingProgress), and "Draw a block"
  // RESUMING the abandoned ring rather than starting one. There was no way
  // back to an empty ring but to finish the shape.
  //
  // THE POINTS ARE THE GESTURE, so they end when it does: this clears them,
  // and the effect above reports the empty list, which takes the live cautions
  // and the panel's drawing state with it. WHAT IT DOES NOT CLEAR is the
  // NOTICE -- what the step said about the LAST shape that closed is not about
  // this gesture and outlives it by design (see DrawingProgress).
  //
  // GUARDED ON THERE BEING POINTS, which is what keeps it out of the close
  // path: close() empties the points itself and then disarms, so by the time
  // this runs there is nothing to clear and the notice it just settled
  // survives. Without the guard this would fire on every mount and after
  // every closed ring, and the trim notice would never be read.
  useEffect(() => {
    if (armed || !points.length) return
    setPoints([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

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
    if (!prepared?.feature) return
    actions.addDrawnFeature(stepId, prepared.feature)
    // NOT AWAITED, AND NOTHING BRANCHES ON IT. The block is in the draft; the
    // reading is an addition to it that either arrives or does not, and the
    // step's own measure() is where a failure is decided about (landform:
    // leave the em dashes). A rejection reaching the console is the store's
    // reporting, not a gesture that went wrong.
    if (shape?.measure) {
      shape.measure({ feature: prepared.feature, points, actions, stepId })
    }
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



/**
 * A FREE POINT INTO THE DRAFT'S DRAWN FEATURES, through PlaceSiteTool -- and
 * the one arm of this switch whose Feature comes from the SERVER.
 *
 * THE STEP SAYS WHAT A CLICK MEANS. `definition.placement.place()` is handed
 * the point, the parcel ring, the sites already placed and the step's own
 * payload, and answers with
 * {feature, notice}: the scored Feature to add, or null and a sentence
 * saying why not (off the parcel; no slot left; the same spot twice; the
 * server's own refusal). ShapeDraw's contract with `definition.shape`,
 * exactly -- this file knows no rule about buildings, and the notice goes to
 * DrawingProgress rather than the draft for the reason given there.
 *
 * ONE AT A TIME, AND THE TOOL GOES DOWN AFTER EACH. A second click while the
 * first is being measured is dropped rather than queued: the pending marker
 * shows where the first one is, and a queue of unscored clicks under one
 * marker is two decisions the user cannot see. When the answer lands the
 * gesture disarms, as ShapeDraw does on close -- placing a site is one
 * decision, and a tool that stayed armed would turn the next stray click into
 * another. "Place a site" is one click away in the banner.
 *
 * THE SETTLED PADS ARE DRAWN BY THE DELETE TOOL where the step declares one
 * (StepTools' RENDERED_BY, polygon: delete first), and here otherwise -- the
 * same arrangement ShapeDraw makes for drawn zones.
 */
function SitePlace({ layer, armed, renders, stepId, definition }) {
  const { state, actions } = useSession()
  const { disarm } = useWizardCursor()
  const progress = useDrawingProgress()
  const [pending, setPending] = useState(null)
  const liveRef = useRef(true)

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
    }
  }, [])

  const place = async (point) => {
    if (pending) return
    setPending(point)
    // The notice from the last placement stops being about anything on
    // screen the moment a new one starts.
    progress.clear()
    let prepared = null
    try {
      prepared = await definition.placement.place({
        point,
        parcel: layer.parcel ?? [],
        placed: layer.features ?? [],
        // The step's payload, so the reading can take its cap off the same
        // handshake the banner's button reads rather than a second copy.
        proposals: selectStepProposals(state, stepId),
        actions,
        stepId,
      })
    } finally {
      if (liveRef.current) setPending(null)
    }
    if (!liveRef.current) return
    progress.settle(prepared?.notice ?? null)
    if (prepared?.feature) actions.addDrawnFeature(stepId, prepared.feature)
    disarm()
  }

  return (
    <>
      {renders ? <StackLayer layer={layer} interactive={false} /> : null}
      <PlaceSiteTool isPlacing={armed} pending={pending} onPlace={place} />
    </>
  )
}
