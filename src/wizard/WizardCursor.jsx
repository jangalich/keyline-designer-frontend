/**
 * WizardCursor.jsx
 *
 * TWO THINGS, IN ONE PROVIDER, AND THE COUPLING IS THE POINT.
 *
 *   THE CURSOR   Which step the wizard has open. The panel column renders it
 *                expanded; the map stack renders its layers as the editable
 *                band. One value, so the two cannot disagree about which step
 *                the user is on.
 *
 *   THE ARMING   Which of that step's declared tools is live. ONE SLOT
 *                holding ONE NAME.
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
 * THE TWO DOORS, AND WHY THE SECOND ONE IS UGLY ON PURPOSE
 *
 *   arm(tool)          The wizard's door. Refuses any name the CURSOR'S OWN
 *                      DEFINITION does not declare in `tools[]`, so a step
 *                      cannot arm a tool the stack did not mount for it.
 *
 *   armLegacyGesture() The production-zone spike's door, for its two gestures
 *                      -- the zone draw and the access point -- which are not
 *                      any step's declared tools because the spike is not a
 *                      step yet. It takes any name, which is exactly the hole
 *                      the wizard's door does not have.
 *
 * Both write the SAME SLOT, which is what makes the exclusion hold across the
 * seam: a spike gesture and a wizard tool cannot be live together, because
 * there is one value and arming either one displaces the other. The second
 * door exists so the spike keeps working end to end without being migrated,
 * and it goes when the spike does (F4). Nothing but App.jsx may call it.
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
   * The spike's door. See the header: any name, same slot, deleted with the
   * spike. `null` disarms, so App.jsx's cancel paths have one call to make.
   */
  const armLegacyGesture = useCallback(
    (name) => setArmedSlot(name ? { stepId: LEGACY_STEP, tool: name } : NOTHING_ARMED),
    []
  )

  /** Is the spike's gesture live? Its slot is never the cursor's step. */
  const legacyGesture = armedSlot.stepId === LEGACY_STEP ? armedSlot.tool : null

  /**
   * Is ANYTHING live on this map -- a wizard tool or a spike gesture.
   *
   * The one question a component asks when it needs to stand down rather than
   * act: DrawTool's vertex dragging is not a tool of its own, but a drag while
   * the access point is being picked is still two things happening to one
   * gesture. Reading the slot's OCCUPANCY rather than its name is what keeps
   * that from becoming a list of names to maintain.
   */
  const anyArmed = armedSlot.tool !== null

  /**
   * Open a step's panel. WHAT A COMMITTED LAYER'S CLICK DOES, and all it does:
   * the map hands the click to this, the panel expands with whatever
   * affordance its own definition declares, and NOTHING IS ARMED. A click on
   * settled geometry offers navigation to the step that owns it; it does not
   * put the user into an edit mode they did not ask for, and it cannot, since
   * this touches the cursor and never the slot.
   */
  const open = useCallback((stepId) => setOpenStepId(stepId), [])

  const value = useMemo(
    () => ({
      cursorStepId,
      definition,
      definitions: registry,
      order,
      open,
      tools,
      armed,
      arm,
      disarm,
      armLegacyGesture,
      legacyGesture,
      anyArmed,
    }),
    [
      cursorStepId,
      definition,
      registry,
      order,
      open,
      tools,
      armed,
      arm,
      disarm,
      armLegacyGesture,
      legacyGesture,
      anyArmed,
    ]
  )

  return <WizardCursorContext.Provider value={value}>{children}</WizardCursorContext.Provider>
}

/** The slot value the spike's gestures are held under. Never a real step id. */
const LEGACY_STEP = '(legacy map gesture)'

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
