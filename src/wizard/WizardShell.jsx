/**
 * WizardShell.jsx
 *
 * THE CHROME, FLOATING OVER THE MAP. The map is the document; everything the
 * wizard offers sits on top of it, and nothing sits beside or below it.
 *
 * FIVE REGIONS, ALL OVERLAYS:
 *
 *   A  StepRail         left edge     every step, in order, with its status.
 *   B  InstructionBar   top, full     the state's direction, plus notices.
 *   F  DetailPanel      top right     reserved; the container and its toggle.
 *   D  TabStrip         bottom        one tab per feature, capped at 3 rows.
 *   E  ActionBanner     bottom, full  the state's buttons.
 *
 * WHAT THIS REPLACES. A column of step panels beside the map, in which almost
 * every interaction happened somewhere other than the thing being edited, and
 * which cost the map more than a third of the viewport to hold controls that
 * were all about the map. The regions above take no height from it at all.
 *
 *
 * ONE MACHINE ON SCREEN, AND IT IS THE CURSOR'S
 *
 * The old shell ran a step machine per step, because it rendered a panel per
 * step. This renders chrome for ONE step -- the one the cursor names -- so it
 * runs one machine, in StepChrome below. That is not only a saving: a machine
 * per step seeds a draft per step, and a hook count that tracks `step_order`
 * is a rules-of-hooks violation waiting for the first document of a different
 * length. The rail, which does show every step, reads statuses off the store
 * instead and runs no machine at all.
 *
 * THE CURSOR'S STEP MAY HAVE NO DEFINITION. water through fencing are in every
 * document's `step_order` and have no registry entry in this build. They are
 * NAMED rather than hidden -- dropping them would make the wizard silently
 * shorter than the pipeline -- and they get no machine, because there is no
 * definition to run one against. The conditional is a COMPONENT BOUNDARY
 * rather than a branch around a hook, which is the only way to spell that.
 *
 *
 * THE SHELL NAMES NO STEP. Every difference between the six is read off the
 * cursor step's definition: the sentence in the bar, the buttons in the
 * banner, the figures in the tabs, and the notices only that step could know
 * to raise. Grep this file, chromeState.js and the four region components for
 * a step id and you will find none -- asserted, not asserted about.
 */

import ActionBanner from './shell/ActionBanner.jsx'
import DetailPanel from './shell/DetailPanel.jsx'
import InstructionBar from './shell/InstructionBar.jsx'
import StepRail from './shell/StepRail.jsx'
import TabStrip from './shell/TabStrip.jsx'
import { chromeStateFor } from './shell/chromeState.js'
import { useWizardCursor } from './WizardCursor.jsx'
import { useStepMachine } from './useStepMachine'

export default function WizardShell() {
  const { cursorStepId, definition, definitions } = useWizardCursor()

  return (
    <div className="chrome" data-testid="wizard">
      <StepRail />
      {definition ? (
        // KEYED BY THE STEP, so moving the cursor REMOUNTS the chrome rather
        // than re-rendering it with the last step's leftovers. The three
        // pieces of local state down there -- a confirmation waiting on an
        // answer, an expanded tab strip, an opened detail panel -- are all
        // about the step in hand, and a strip left expanded from a step with
        // forty zones over a step with two is the mildest of the ways that
        // goes wrong. The machine is per-step by construction; this makes the
        // chrome around it per-step too.
        <StepChrome key={definition.id} definition={definition} definitions={definitions} />
      ) : (
        <UnregisteredChrome stepId={cursorStepId} />
      )}
    </div>
  )
}

/**
 * The four regions that belong to the step in hand, and the one machine behind
 * all four.
 *
 * THE CHROME STATE IS COMPUTED ONCE AND HANDED DOWN, so the bar and the banner
 * cannot disagree about which state they are describing. They are two halves
 * of one sentence -- "here is what to do" and "here is how to do it" -- and
 * two independent readings of the same inputs is exactly how those two halves
 * come to contradict each other.
 */
function StepChrome({ definition, definitions }) {
  const machine = useStepMachine(definition)
  const { armed } = useWizardCursor()
  const chromeState = chromeStateFor({ machineState: machine.machineState, armed })

  return (
    <>
      <InstructionBar machine={machine} chromeState={chromeState} definitions={definitions} />
      <DetailPanel machine={machine} />
      <div className="chrome__free" aria-hidden="true" />
      <div className="chrome__bottom">
        <TabStrip machine={machine} />
        <ActionBanner machine={machine} chromeState={chromeState} definitions={definitions} />
      </div>
    </>
  )
}

/**
 * A step the document runs and this build has no definition for.
 *
 * It gets the instruction bar's slot and says what it is. No banner: there is
 * nothing to offer, and an empty banner would read as a step whose buttons
 * failed to load rather than as a step nobody has built.
 */
function UnregisteredChrome({ stepId }) {
  return (
    <div className="chrome-bar" data-testid={`step-${stepId}`} data-step-state="unregistered">
      <p className="chrome-bar__direction" data-testid={`unregistered-${stepId}`}>
        This step is in the pipeline but is not built yet.
      </p>
    </div>
  )
}
