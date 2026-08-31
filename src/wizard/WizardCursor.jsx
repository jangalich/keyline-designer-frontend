/**
 * WizardCursor.jsx
 *
 * TWO THINGS, IN ONE PROVIDER, AND THE COUPLING IS THE POINT.
 *
 *   THE CURSOR   Which step the wizard has open. The chrome floating over the
 *                map renders its instruction, its buttons and its tabs; the
 *                map stack renders its layers as the editable band. One value,
 *                so the two cannot disagree about which step the user is on.
 *
 *   THE ARMING   Which of that step's declared tools is live. ONE SLOT
 *                holding ONE NAME.
 *
 *   THE FOCUS    Which ONE feature the user is looking at. The map draws it
 *                marked, the tab strip draws its tab active, the detail panel
 *                shows its measurements, and the caution markers narrow to it.
 *                One slot, one feature.
 *
 * THE FOCUS IS NOT THE SELECTION, AND CONFLATING THE TWO WOULD BE THE WORST
 * MISTAKE AVAILABLE HERE. The store's `selectedFeatureIds` is the set of
 * features a COMMIT WILL CARRY -- what the tab strip's eye toggles, held in
 * the draft, sent on the wire, and surviving a reload. This is a POINTER AT
 * ONE OF THEM for the purpose of looking at it: it commits nothing, changes
 * nothing about what a commit would send, and is thrown away when the cursor
 * moves. A feature can be focused and eye-off at once, and that is a real and
 * useful state -- it is how you read the measurements of something you have
 * just taken out.
 *
 * WHY THEY LIVE TOGETHER. The arming is only meaningful against a step's
 * `tools[]`, and it must not survive the step it was armed for -- an armed
 * `draw` carried into a step that declares no draw would be a live map-click
 * listener with no owner. Holding the pair as {stepId, tool} makes that
 * impossible by derivation rather than by an effect that disarms on change:
 * the tool reads as armed only while the cursor still names the step it was
 * armed for, so moving the cursor disarms it with nothing running.
 *
 *
 * WHAT THIS REPLACES, AND WHY IT IS STRUCTURAL
 *
 * App.jsx held three independent booleans -- isDrawing, isDrawingZone,
 * isSelectingAccessPoint -- and two DEV-only throws asserting that no two were
 * ever true at once. They existed because four click listeners share one map
 * and none stops propagation, so two armed tools mean one click does two
 * things. An assertion is the right response to an invariant you cannot
 * express; it is the wrong response to one you can.
 *
 * A single slot expresses it. Two tools armed at once is not a state this can
 * hold, so there is nothing left to assert and both throws are gone. The
 * assertions were not narrowed or moved -- the state they guarded no longer
 * exists.
 *
 *
 * THERE IS ONE DOOR NOW, AND THAT IS THE WHOLE OF THIS BRANCH'S CHANGE HERE.
 *
 *   arm(tool)   Refuses any name the CURSOR'S OWN DEFINITION does not declare
 *               in `tools[]`, so a step cannot arm a tool the stack did not
 *               mount for it.
 *
 * The second door -- armLegacyGesture(), which took ANY name -- is gone. It
 * existed for the production-zone spike's two gestures, and F4 named the
 * access point as the last thing still going through it. This branch removed
 * the access-point pre-step (it is an input of ROADS, not a global field), so
 * the door had no callers left and a deliberately-loose entrance with no
 * caller is an invitation rather than a compromise. Arming is now exactly
 * "one of the cursor step's declared tools", with no exception to it.
 *
 *
 * THE CURSOR MOVES ITSELF, AND A COMMIT IS WHAT MOVES IT
 *
 * `advance()` is the auto-advance the map-centric shell needs and it holds no
 * step id: it clears the user's explicit choice, which hands the cursor back
 * to the derivation below -- the first step that is not committed. So the step
 * a successful commit lands on is a fact about the document rather than a
 * pointer this file increments, and it is still right after a reopen, a
 * cascade, or a resume into the middle of a session.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { COMMITTED, selectStepStatus, useSession } from '../session/SessionStore'
import { STEP_DEFINITIONS, definitionMap, wizardStepOrder } from './stepDefinitions'

const WizardCursorContext = createContext(null)

/** The slot's empty value. A frozen object so `armed` is never undefined. */
const NOTHING_ARMED = Object.freeze({ stepId: null, tool: null })

export function WizardCursorProvider({ children, definitions = STEP_DEFINITIONS }) {
  const { state } = useSession()
  const registry = useMemo(() => definitionMap(definitions), [definitions])
  const order = wizardStepOrder(state)

  /**
   * The user's explicit choice of panel, or null for "no explicit choice".
   *
   * NOT the store's `activeStep`, and the difference is not a preference. The
   * store validates that field against the DOCUMENT's `step_order` --
   * hydrate() nulls it for any id not in it -- and the boundary step is
   * deliberately not in `step_order`. A cursor kept there would be dropped the
   * moment the session it just created arrived. See the note on `activeStep`
   * in SessionStore's initialState; the two are documented against each other.
   */
  const [openStepId, setOpenStepId] = useState(null)

  // THE ONE SLOT. {stepId, tool} rather than a bare tool name, so an arming
  // cannot outlive the step it belongs to.
  const [armedSlot, setArmedSlot] = useState(NOTHING_ARMED)

  // THE FOCUS SLOT, held the same way and for the same reason: {stepId,
  // featureId}, so a focus cannot outlive the step whose feature it names. A
  // bare id carried into another step would point the detail panel at a
  // feature that step has never heard of.
  const [focusSlot, setFocusSlot] = useState(NOTHING_FOCUSED)

  /**
   * Where the wizard is, DERIVED rather than remembered: the first step that
   * is not committed. So creating a session moves the wizard on without
   * anything having to say so, and a resume opens where the document says the
   * user left off.
   */
  const firstUncommitted =
    order.find((stepId) => {
      const definition = registry.get(stepId)
      const status = definition ? definition.status(state) : selectStepStatus(state, stepId)
      return status !== COMMITTED
    }) ?? order[order.length - 1]

  const cursorStepId = openStepId && order.includes(openStepId) ? openStepId : firstUncommitted
  const definition = registry.get(cursorStepId) ?? null

  // The tools the cursor's step declares. A step with no definition -- one in
  // `step_order` that this build has no registry entry for -- declares none,
  // so nothing can be armed on it.
  const tools = definition ? definition.tools : EMPTY_TOOLS

  // ARMED ONLY WHILE THE CURSOR STILL NAMES ITS STEP. The comparison IS the
  // disarm-on-move, and it needs no effect to fire.
  const armed = armedSlot.stepId === cursorStepId ? armedSlot.tool : null

  /**
   * Arm one of the cursor step's declared tools.
   *
   * A NAME THE STEP DOES NOT DECLARE IS REFUSED, and refused loudly in DEV.
   * The stack mounts tools from the same `tools[]`, so an accepted name here
   * would arm a gesture with no component behind it -- which reads, from the
   * user's side, as a tool that does nothing.
   */
  const arm = useCallback(
    (tool) => {
      if (!tools.includes(tool)) {
        if (import.meta.env.DEV) {
          throw new Error(
            `Step '${cursorStepId}' does not declare the '${tool}' tool, so it ` +
              `cannot be armed. Its tools are: ${tools.join(', ') || '(none)'}.`
          )
        }
        return false
      }
      setArmedSlot({ stepId: cursorStepId, tool })
      return true
    },
    [cursorStepId, tools]
  )

  const disarm = useCallback(() => setArmedSlot(NOTHING_ARMED), [])

  /**
   * FOCUSED ONLY WHILE THE CURSOR STILL NAMES ITS STEP -- the same derivation
   * that disarms a tool on a cursor move, and it needs no effect either.
   */
  const focusedFeatureId = focusSlot.stepId === cursorStepId ? focusSlot.featureId : null

  /**
   * Look at one feature. ONE AT A TIME: focusing another replaces it, because
   * the slot holds one value and there is nothing to replace it with but this.
   *
   * Takes no step id. The cursor's step is the only step whose features are on
   * screen, so "which step's feature is this" has one answer and it is not the
   * caller's to give.
   */
  const focusFeature = useCallback(
    (featureId) =>
      setFocusSlot(featureId ? { stepId: cursorStepId, featureId } : NOTHING_FOCUSED),
    [cursorStepId]
  )

  /** Look at nothing. What a click on bare map does. */
  const blurFeature = useCallback(() => setFocusSlot(NOTHING_FOCUSED), [])

  /**
   * Is ANYTHING live on this map.
   *
   * The one question a component asks when it needs to stand down rather than
   * act: DrawTool's vertex dragging is not a tool of its own, but a drag while
   * a shape is being placed is still two things happening to one gesture.
   * Reading the slot's OCCUPANCY rather than its name is what keeps that from
   * becoming a list of names to maintain.
   */
  const anyArmed = armedSlot.tool !== null

  /**
   * Open a step. WHAT A COMMITTED LAYER'S CLICK DOES, and what a click on the
   * step rail does, and all either does: the cursor moves, the chrome renders
   * whatever affordance that step's own definition declares for the state it
   * is in, and NOTHING IS ARMED. Clicking settled geometry -- or the rail --
   * offers navigation to the step that owns it; it does not put the user into
   * an edit mode they did not ask for, and it cannot, since this touches the
   * cursor and never the slot.
   */
  const open = useCallback((stepId) => setOpenStepId(stepId), [])

  /**
   * MOVE ON. What a successful commit does, and the reason there is no "Next
   * step" button in the shell.
   *
   * It does not compute a next id. It DROPS the user's explicit choice, and
   * the derivation above -- first step that is not committed -- answers the
   * question again against the document that just changed. The step just
   * committed is no longer the first uncommitted one, so the cursor lands on
   * the one after it with nothing here having named either.
   *
   * The arming goes with it. A tool armed on the step being left would already
   * read as disarmed (the slot carries its step), but leaving the slot
   * occupied would keep `anyArmed` true for a gesture nobody can reach.
   */
  const advance = useCallback(() => {
    setArmedSlot(NOTHING_ARMED)
    setFocusSlot(NOTHING_FOCUSED)
    setOpenStepId(null)
  }, [])

  const value = useMemo(
    () => ({
      cursorStepId,
      definition,
      definitions: registry,
      order,
      open,
      advance,
      tools,
      armed,
      arm,
      disarm,
      anyArmed,
      focusedFeatureId,
      focusFeature,
      blurFeature,
    }),
    [
      cursorStepId,
      definition,
      registry,
      order,
      open,
      advance,
      tools,
      armed,
      arm,
      disarm,
      anyArmed,
      focusedFeatureId,
      focusFeature,
      blurFeature,
    ]
  )

  return <WizardCursorContext.Provider value={value}>{children}</WizardCursorContext.Provider>
}

/** The focus slot's empty value. Frozen, so `focusedFeatureId` is never undefined. */
const NOTHING_FOCUSED = Object.freeze({ stepId: null, featureId: null })

const EMPTY_TOOLS = Object.freeze([])

export function useWizardCursor() {
  const value = useContext(WizardCursorContext)
  if (value === null) {
    throw new Error('useWizardCursor must be used inside a <WizardCursorProvider>.')
  }
  return value
}

/**
 * The arming half, for a caller that does not care where the cursor is.
 *
 * Deliberately a view of the SAME context rather than a second provider: a
 * second one would be a second slot, and a second slot is the invariant back.
 */
export function useToolArming() {
  const { tools, armed, arm, disarm, anyArmed } = useWizardCursor()
  return { tools, armed, arm, disarm, anyArmed, isArmed: (tool) => armed === tool }
}
