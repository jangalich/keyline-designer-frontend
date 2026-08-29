/**
 * DeleteGesture.jsx
 *
 * `delete` -- remove a drawn feature.
 *
 * DELETE AND REDRAW IS THE WHOLE EDIT VOCABULARY for a shape the user
 * authored. There is no vertex editor anywhere in this app and no `adjust`
 * verb to reach one: a shape that is wrong is removed and drawn again, which
 * is the same decision DRAFT_SHAPE_REMOVED records in the store and the same
 * one ZoneDrawTool makes by having no drag handler.
 *
 * IT DELETES FROM THE DRAFT, NEVER FROM THE DOCUMENT. Committed features are
 * in the committed band, which this tool never claims -- undoing a commit is a
 * reopen, with its own confirmation naming what it costs, and it is the step
 * panel's to offer rather than a map click's to perform.
 */

import { useSession } from '../../session/SessionStore'
import { StackLayer } from '../layers.jsx'

export default function DeleteGesture({ layer, armed, renders, stepId }) {
  const { actions } = useSession()

  if (layer.kind === 'ring') return <RingDelete layer={layer} armed={armed} stepId={stepId} />
  if (!renders) return null

  return (
    <StackLayer
      layer={layer}
      // Clickable only while this is the armed tool. A drawn shape that took
      // clicks all the time would swallow the vertex the draw tool was placing
      // on top of it.
      interactive={armed}
      onFeatureClick={(_layer, feature) => actions.removeDrawnFeature(stepId, feature.id)}
    />
  )
}

/**
 * A ring is deleted by being emptied, not by being removed: the step still has
 * a ring input, it just has no points in it. Same call BoundaryPanel's "Clear
 * and redraw" makes, so the map and the panel are one action with two
 * affordances rather than two paths that have to agree.
 *
 * IT DRAWS NOTHING WHEN IT IS NOT ARMED. DrawTool already renders the ring
 * (see StepTools' RENDERED_BY); what this adds while armed is a hit area over
 * it, and a second painted copy of the same ring would double the casing.
 */
function RingDelete({ layer, armed, stepId }) {
  const { actions } = useSession()
  if (!armed || layer.ring.length < 3) return null

  return (
    <StackLayer
      layer={layer}
      interactive
      onLayerClick={() => actions.setDraftInput(stepId, layer.sourceKey, [])}
    />
  )
}
