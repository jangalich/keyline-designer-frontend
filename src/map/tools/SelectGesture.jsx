/**
 * SelectGesture.jsx
 *
 * `select` -- the proposals layer, and the click that FOCUSES one.
 *
 * WHAT A CLICK ON A CANDIDATE DOES CHANGED, and the verb it used to carry
 * moved rather than disappearing. It used to toggle the feature in or out of
 * the commit, because the map was the only place a suggestion appeared and the
 * click had to carry the decision. The tab strip carries it now -- every tab
 * has a checkbox, and the box is where inclusion is decided -- so the map
 * click is free to do the thing a click on a thing should do: show you what it
 * is. It focuses the feature, which marks it on the map, activates its tab and
 * opens the detail panel.
 *
 * IT STAYS A READING ON EVERY STEP, ROADS INCLUDED. Roads' TAB body checks
 * its box (`selection.follows`), because a tab is the commit decision drawn
 * as a control; a shape on the map is the thing itself, and clicking a thing
 * to look at it must not quietly change what a commit would send.
 *
 * THERE IS STILL NO ADJUST. design_document.py's PROVENANCE_VALUES has no
 * value for a user-modified generated shape, so a candidate is taken as
 * proposed or left out, and a different shape is a drawn one.
 *
 * IT RENDERS THE CANDIDATES, ARMED OR NOT. A step that declares `select`
 * declares that its proposals are the thing being decided about, and they have
 * to be visible to be decided about.
 *
 * BUT IT TAKES CLICKS ONLY WHILE NOTHING IS ARMED, which is not the same rule
 * it used to follow. Toggling was a TOOL and was gated on `select` being the
 * armed one; focusing is a reading rather than an edit, and nothing arms it.
 * What it must not do is swallow a click meant to place a vertex -- so it
 * stands down whenever any tool is live, reading the register's OCCUPANCY
 * exactly as DrawGesture does.
 */

import { useWizardCursor } from '../../wizard/WizardCursor.jsx'
import { StackLayer } from '../layers.jsx'

export default function SelectGesture({ layer, renders }) {
  const { anyArmed, focusedFeatureId, focusFeature } = useWizardCursor()
  if (!renders) return null

  return (
    <StackLayer
      layer={layer}
      interactive={!anyArmed}
      focusedFeatureId={focusedFeatureId}
      onFeatureClick={(_layer, feature) => focusFeature(feature.id)}
    />
  )
}
