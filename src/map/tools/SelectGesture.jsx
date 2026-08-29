/**
 * SelectGesture.jsx
 *
 * `select` -- toggle a proposal in or out of the commit set.
 *
 * THE ONLY THING THAT MAY BE DONE TO A GENERATED FEATURE. There is no adjust:
 * design_document.py's PROVENANCE_VALUES has no value for a user-modified
 * generated shape, so a candidate is taken as proposed or left out, and a
 * different shape is a drawn one.
 *
 * IT RENDERS THE CANDIDATES, armed or not. A step that declares `select`
 * declares that its proposals are the thing being decided about, and they have
 * to be visible to be decided about -- what the arming changes is whether they
 * TAKE CLICKS, which is the half that can collide with another tool.
 */

import { useSession } from '../../session/SessionStore'
import { StackLayer } from '../layers.jsx'

export default function SelectGesture({ layer, armed, renders, stepId }) {
  const { actions } = useSession()
  if (!renders) return null

  return (
    <StackLayer
      layer={layer}
      // A Leaflet path click also reaches the map. Interactive only while this
      // tool is the armed one is what keeps a click from toggling a zone AND
      // placing a vertex -- and the arming register holding one value at a
      // time is why "the armed one" is a question with one answer.
      interactive={armed}
      onFeatureClick={(_layer, feature) => actions.toggleSelection(stepId, feature.id)}
    />
  )
}
