/**
 * WizardShell.jsx
 *
 * THE CHROME, FLOATING OVER THE MAP. The map is the document; everything the
 * wizard offers sits on top of it, and nothing sits beside or below it.
 *
 * FIVE REGIONS, ALL OVERLAYS:
 *
 *   A  StepRail         left edge      every step, in order, with its status.
 *   B  InstructionBar   top, centred   the state's direction, plus notices.
 *   F  DetailPanel      top right      reserved; the container and its toggle.
 *   D  TabStrip         bottom left    one tab per feature, capped at 3 rows.
 *   E  ActionBanner     bottom right   the state's buttons.
 *
 * WHAT THIS REPLACES. A column of step panels beside the map, in which almost
 * every interaction happened somewhere other than the thing being edited, and
 * which cost the map more than a third of the viewport to hold controls that
 * were all about the map. The regions above take no height from it at all.
 *
 * AND NONE OF THEM SPANS IT. B and E ran the full width until this branch,
 * which made them read as bars cutting the frame rather than as chrome
 * belonging to it, and cost map area at every width without looking like a
 * decision. All five are now cards: opaque surface, hairline, inset from the
 * edge, sized to their content. App.css's chrome section carries the argument.
 *
 * D AND E SHARE THE BOTTOM ROW. The strip runs from after the rail to before
 * the action card and can never reach it -- they are two tracks of one grid,
 * which is what makes "never underneath" a property of the layout rather than
 * a width somebody has to keep in agreement. An expanded strip grows UPWARD;
 * the action card does not move.
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

import { useCallback, useEffect, useRef, useState } from 'react'

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
  const { armed, focusedFeatureId, blurFeature, focusFeature } = useWizardCursor()
  const chromeState = chromeStateFor({ machineState: machine.machineState, armed })
  const undo = useRemovalUndo(machine, focusedFeatureId, blurFeature)
  const remove = useTabRemoval(machine, undo.remove, focusedFeatureId, blurFeature)
  useSeedFocus(machine, focusedFeatureId, focusFeature)

  return (
    <>
      <InstructionBar
        machine={machine}
        chromeState={chromeState}
        definitions={definitions}
        undo={undo.offer}
      />
      <DetailPanel machine={machine} />
      <div className="chrome__free" aria-hidden="true" />
      <div className="chrome__bottom">
        <TabStrip machine={machine} onRemove={remove} />
        <ActionBanner machine={machine} chromeState={chromeState} definitions={definitions} />
      </div>
    </>
  )
}

/** How long a destroyed shape can be taken back. */
export const UNDO_WINDOW_MS = 8000

/**
 * DESTROY A DRAWN SHAPE, AND HOLD IT LONG ENOUGH TO PUT BACK.
 *
 * THE FEATURE IS HELD HERE RATHER THAN IN THE STORE, and that is the honest
 * place for it. A draft holds decisions; a shape the user has just destroyed is
 * not one, and parking it in the store would mean a deleted zone surviving a
 * reload as invisible state nobody asked for. The undo is a few seconds of
 * grace on one gesture, not a history -- so it lives as long as the chrome
 * does and no longer.
 *
 * PUT BACK WITH ITS GEOMETRY INTACT, because what is held is the Feature
 * itself: the same object the store handed out, with its ring, its acreage and
 * its cautions already on it. Nothing is recomputed on the way back, so an
 * undone zone is the zone that was drawn rather than a fresh clip of it.
 *
 * THE FOCUS GOES WITH THE SHAPE. A detail panel describing a feature that no
 * longer exists is worse than none; blurring on removal is what makes the
 * panel's own absence the confirmation that the delete happened.
 */
function useRemovalUndo(machine, focusedFeatureId, blurFeature) {
  const [removed, setRemoved] = useState(null)
  const timer = useRef(null)

  // A pending timer must not fire into an unmounted chrome, and moving to
  // another step ends the window: the offer is about a shape on THIS step's
  // map, and it cannot be taken up once you are looking at another.
  useEffect(() => () => clearTimeout(timer.current), [])

  const remove = useCallback(
    (featureId) => {
      const feature = machine.draft.drawnFeatures.find((f) => f.id === featureId)
      if (!feature) return
      if (focusedFeatureId === featureId) blurFeature()
      machine.actions.removeDrawnFeature(machine.stepId, featureId)
      setRemoved(feature)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS)
    },
    [machine, focusedFeatureId, blurFeature]
  )

  const restore = useCallback(() => {
    if (!removed) return
    clearTimeout(timer.current)
    machine.actions.addDrawnFeature(machine.stepId, removed)
    setRemoved(null)
  }, [machine, removed])

  return {
    remove,
    offer: removed ? { text: 'Zone deleted.', run: restore } : null,
  }
}

/**
 * WHAT A TAB'S × DOES: the step's own `removeTab` when it declares one, and
 * the drawn-shape undo path otherwise.
 *
 * TWO KINDS OF REMOVAL, AND ONLY ONE IS UNDOABLE. A drawn shape is destroyed
 * locally and held for a few seconds (useRemovalUndo). A step whose tabs are
 * server-held candidates -- the roads step's networks -- declares `removeTab`,
 * which calls a SERVER VERB (the discard) and refetches; there is nothing
 * local to hold, so no undo is offered, and the way back is to place the
 * point again. The shell reads which of the two applies off the definition
 * and never off the step's name.
 *
 * THE FOCUS GOES WITH THE CANDIDATE, as it does with a destroyed shape: a
 * panel describing a network that no longer exists is worse than none.
 */
function useTabRemoval(machine, removeDrawn, focusedFeatureId, blurFeature) {
  return useCallback(
    async (tabId) => {
      if (typeof machine.definition.removeTab !== 'function') return removeDrawn(tabId)
      const tab = machine.definition.tabs(machine.context).find((entry) => entry.id === tabId)
      const focusedHere =
        focusedFeatureId != null &&
        (focusedFeatureId === tabId || tab?.featureIds?.includes(focusedFeatureId))
      if (focusedHere) blurFeature()
      return machine.definition.removeTab(machine.actions, machine.context, tabId)
    },
    [machine, removeDrawn, focusedFeatureId, blurFeature]
  )
}

/**
 * LOOK AT WHAT THE SEED SELECTED, once, when a step declares `focusSeed`.
 *
 * A draft seeded from a reopened commit re-selects the network the user
 * committed; a draft seeded from a fresh generate selects the network just
 * made. On a step whose candidates are drawn ONLY WHEN FOCUSED (see
 * LAYER_SHOW), a seeded selection with no focus is a map with nothing on it
 * and a tab saying something is committed -- so the step may say what to look
 * at. Runs only while nothing is focused, so it never takes a focus the user
 * has since moved.
 */
function useSeedFocus(machine, focusedFeatureId, focusFeature) {
  const { definition, draft, proposals, context } = machine
  const seeded = draft?.seeded === true
  useEffect(() => {
    if (typeof definition.focusSeed !== 'function') return
    if (!seeded || proposals == null || focusedFeatureId != null) return
    const target = definition.focusSeed(context)
    if (target != null) focusFeature(target)
    // Only the seed matters: a later focus change must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, seeded, proposals])
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
