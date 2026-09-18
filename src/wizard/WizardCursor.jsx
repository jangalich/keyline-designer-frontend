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
 * features a COMMIT WILL CARRY -- what the tab strip's checkboxes toggle,
 * held in the draft, sent on the wire, and surviving a reload. This is a
 * POINTER AT ONE OF THEM for the purpose of looking at it: it commits
 * nothing, changes nothing about what a commit would send, and is thrown away
 * when the cursor moves. A feature can be focused and unchecked at once, and
 * that is a real and useful state -- it is how you read the measurements of
 * something you have just taken out. FIVE OF THE SIX STEPS DECLARE
 * `follows: null` AND MEAN EXACTLY THAT: click a landform zone's tab body and
 * you are reading it, not changing what you are about to commit.
 *
 * ONE STEP CHOOSES OTHERWISE, AND IT SAYS SO IN ITS OWN DEFINITION. Roads
 * declares `selection: { mode: 'radio', follows: 'focus' }`: there, the two
 * are ONE FACT, what you are looking at is what commits, and there is no
 * focused-but-unchecked network to have. `show: 'focused'` on its network
 * layer is RESOLVED from that same line, so the map draws only the focused
 * candidate -- which is why the pair cannot be allowed to drift: a tick on a
 * network nothing is drawing is a commit with no geometry on screen.
 *
 * SO THE COLLAPSE IS APPLIED HERE, IN focusFeature, AND NOWHERE ELSE. It used
 * to be applied by the tab strip's click handler, which was the same rule
 * written where only one of the three paths that move a focus could reach it.
 * See focusFeature for the two that could not, and for what they did instead.
 * What this file holds is still ONE POINTER: the step says what a pointer
 * means on it, and this reads that rather than knowing which step it is.
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

import { COMMITTED, selectHasDraft, selectStepStatus, useSession } from '../session/SessionStore'
import { useStepCatalog } from './stepCatalog.jsx'
import { STEP_DEFINITIONS, definitionMap, wizardStepOrder } from './stepDefinitions'
import { selectionFollowingFocus } from './tabs.js'
import { stepContextFor } from './useStepMachine.js'

const WizardCursorContext = createContext(null)

/** The slot's empty value. A frozen object so `armed` is never undefined. */
const NOTHING_ARMED = Object.freeze({ stepId: null, tool: null })

export function WizardCursorProvider({ children, definitions = STEP_DEFINITIONS }) {
  const { state, actions } = useSession()
  const registry = useMemo(() => definitionMap(definitions), [definitions])
  // The pipeline before a document exists. The document's own `step_order`
  // takes over the moment one arrives -- see wizardStepOrder.
  const catalog = useStepCatalog()
  // Memoised because it is a fresh array every call, and it is a dependency
  // of the two derivations below and of the context value itself.
  const order = useMemo(() => wizardStepOrder(state, catalog), [state, catalog])

  /**
   * THE CURSOR, AND IT IS STATE RATHER THAN A DERIVATION. The user's explicit
   * choice of step, or null for "no explicit choice".
   *
   * WHY THE DERIVATION BELOW IS ONLY THE FALLBACK. "The first uncommitted
   * step" is the right answer twice -- before the user has navigated at all,
   * and again the moment a commit auto-advances (see `advance`) -- and it is
   * the wrong answer at every other moment, because it is a fact about the
   * DOCUMENT and where the user is looking is not. A cursor that re-derived
   * on every render would send anyone who navigated back to a settled step
   * home again on the next unrelated store write, which is not a slow leak:
   * it is every click.
   *
   * SO NAVIGATION WRITES HERE AND NOTHING ELSE CLEARS IT. `open()` sets it,
   * `advance()` drops it, and no other path in this file touches it. In
   * particular the FOCUS does not: blurring a feature is a statement about
   * the detail panel and has nothing to say about which step is open. See
   * MapLayerStack's BackgroundClick, which is wired to `blurFeature` alone
   * for exactly that reason.
   *
   * IT CAN NAME THE BOUNDARY, which is the other reason it could not have
   * lived in the session store: that store is a mirror of the document, and
   * the boundary is a top-level document field rather than an entry in
   * `step_order`. The store's own `activeStep` -- a second, similarly-named
   * slot that could never hold 'boundary' and that nothing read -- is deleted
   * on this branch rather than left beside this one.
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
   * EVERY STEP'S STATUS, READ ONCE.
   *
   * Two things below need it -- where the cursor sits, and which steps are
   * reachable -- and they are the same question asked twice. Reading it twice
   * would let them disagree for one render, which is the state where the rail
   * marks a step current and unreachable at the same time.
   *
   * A step's own `status(state)` when it has a definition, because boundary's
   * status is whether a session exists and no document carries that. The
   * store's selector otherwise, which reads a step the document has never
   * carried as not_started.
   */
  const statuses = useMemo(() => {
    const map = new Map()
    for (const stepId of order) {
      const definition = registry.get(stepId)
      map.set(stepId, definition ? definition.status(state) : selectStepStatus(state, stepId))
    }
    return map
  }, [order, registry, state])

  /**
   * Where the wizard is, DERIVED rather than remembered: the first step that
   * is not committed. So creating a session moves the wizard on without
   * anything having to say so, and a resume opens where the document says the
   * user left off.
   */
  const firstUncommitted =
    order.find((stepId) => statuses.get(stepId) !== COMMITTED) ?? order[order.length - 1]

  /**
   * THE STEPS YOU CANNOT GET TO YET: everything after the first uncommitted
   * one. A step is reachable when every step BEFORE it is committed, which is
   * the same rule the store's selectIsStepReachable applies to a document.
   *
   * IT IS NOT THAT SELECTOR, AND IT CANNOT BE. That one indexes into
   * `state.stepOrder` -- the document's array, which does not contain the
   * boundary and is EMPTY before a session exists, so it answers false for
   * every row on the screen this exists to draw. This is the same rule over
   * the wizard's own order, which is the one the rail renders. The rule is
   * stated once here and read by the rail, rather than derived per row.
   *
   * ALL upstream steps, not just the predecessor -- the equivalence between
   * those two is a property of the commit cascade rather than of this
   * derivation, and it is not this derivation's to assume.
   */
  const reachable = useMemo(() => {
    const set = new Set()
    for (const stepId of order) {
      set.add(stepId)
      if (statuses.get(stepId) !== COMMITTED) break
    }
    return set
  }, [order, statuses])

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
   *
   *
   * AND ON A STEP THAT DECLARES `selection: { follows: 'focus' }`, THIS MOVES
   * THE SELECTION TOO. That is the whole of the field, and it is here rather
   * than in any caller.
   *
   * THE BUG THIS FIXES, because the fix is a deletion in two other files and
   * nothing about it is visible from them. `follows: 'focus'` says focus and
   * the commit decision are ONE FACT on that step -- there is no "focused but
   * unchecked" tab to have, and `show: 'focused'` is RESOLVED from the same
   * line, so only the focused candidate is even drawn. THREE PATHS MOVE THE
   * FOCUS: a tab body, an access-point marker, and the generate that focuses
   * the network it has just routed. ONE OF THEM ENFORCED THE COLLAPSE -- the
   * tab body -- so the other two moved the focus, the map, and the detail
   * panel onto a network while the tick, and therefore the commit, stayed on
   * the one before it. Generate a second network and the panel described it
   * while the first tab stayed checked; click a marker and the same.
   *
   * SO IT IS NOT THREE CORRECTIONS. Three handlers each remembering the rule
   * is the arrangement that produced the bug, and adding the two that were
   * missing would leave the fourth path -- whatever declares a focus next --
   * free to forget it again. There is one focus setter in this application;
   * the rule belongs to it, and every path is correct by having gone through
   * here.
   *
   * RADIO WITHOUT ARITHMETIC. selectionFollowingFocus() returns the focused
   * tab's features and nothing else, so the others are out by absence rather
   * than by an un-tick step. Nothing focused is an empty selection, which is
   * roads' legal empty commit (`min_features: 0`) and the only thing that can
   * honestly pair with a map drawing nothing.
   *
   * THE READ IS THE REDUCER'S, NOT THIS CLOSURE'S, and that is load-bearing
   * for exactly one caller. generateRoadNetwork() awaits the generate and then
   * focuses the network that came back; the `focusFeature` it holds is the one
   * from the render BEFORE the request, closing over a state whose proposals
   * do not contain that network. Computing the tabs out here would find no tab
   * for it and select nothing. The updater form of setSelection runs inside
   * the reducer, after the payload's own dispatch, against the state that
   * carries it. See SessionStore's DRAFT_SELECTION_SET.
   *
   * NOT ON A STEP WITH NO DRAFT. A selection is a fact about a draft, and a
   * write here would MINT one -- which would then make useStepMachine's seed
   * skip the step for having a draft already, and roads would open with
   * nothing chosen instead of its first network. A bare-map click on a roads
   * step that has generated nothing is the case; it blurs a focus that was
   * never set and must not leave a draft behind it.
   */
  const followsFocus = definition?.selection?.follows === 'focus'
  const focusFeature = useCallback(
    (featureId) => {
      setFocusSlot(featureId ? { stepId: cursorStepId, featureId } : NOTHING_FOCUSED)
      if (!followsFocus || !selectHasDraft(state, cursorStepId)) return
      actions.setSelection(cursorStepId, (_current, storeState) =>
        selectionFollowingFocus(definition.tabs(stepContextFor(storeState, definition)), featureId)
      )
    },
    [actions, cursorStepId, definition, followsFocus, state]
  )

  /**
   * Look at nothing. What a click on bare map does -- and on a focus-bound
   * step that is a decision as much as a reading, because the map draws only
   * what is focused: a selection surviving a blur would be a commit with no
   * geometry anywhere on screen. Focusing nothing is the same act as focusing
   * something, so it is the same call.
   */
  const blurFeature = useCallback(() => focusFeature(null), [focusFeature])

  /**
   * Arm one of the cursor step's declared tools.
   *
   * A NAME THE STEP DOES NOT DECLARE IS REFUSED, and refused loudly in DEV.
   * The stack mounts tools from the same `tools[]`, so an accepted name here
   * would arm a gesture with no component behind it -- which reads, from the
   * user's side, as a tool that does nothing.
   *
   * AND ARMING BLURS, WHICH IS THE OTHER HALF OF WHAT A TOOL GOING LIVE MEANS.
   * The detail panel is a READING of one feature; arming a tool says the user
   * has stopped reading and started authoring. The panel used to stay open
   * over the gesture, describing a block while a new one went down on top of
   * it -- and the focused block stayed marked on the map, so the map had a
   * feature lit that the user was no longer pointing at. Exactly what a click
   * on bare map already does, for the same reason and through the same call.
   *
   * ONE DOOR, SO EVERY ARMING GETS IT. Landform's "Draw a block", trees' "Draw
   * a zone", roads' "Add access point" and structures' "Place a site" are all
   * armButton()s, and armButton() runs this -- so this is the rule stated
   * once rather than four handlers each remembering it, which is the
   * arrangement that produced the focus bugs focusFeature() above describes.
   *
   * ON A STEP WHOSE FOCUS IS ITS SELECTION (roads) THE BLUR TAKES THE
   * SELECTION WITH IT, and that is not an exception this makes -- it is
   * blurFeature()'s own documented rule, and the same thing a bare-map click
   * on that step has always done. Roads draws only the focused network
   * (`show: 'focused'`), so a tick surviving a blur would be a commit with no
   * geometry on screen; the generate that follows an access point focuses the
   * network it routes, which is how the selection comes back.
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
      blurFeature()
      setArmedSlot({ stepId: cursorStepId, tool })
      return true
    },
    [blurFeature, cursorStepId, tools]
  )

  const disarm = useCallback(() => setArmedSlot(NOTHING_ARMED), [])


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
   * Open a step. WHAT A CLICK ON THE STEP RAIL DOES, and all it does: the
   * cursor moves, the chrome renders whatever affordance that step's own
   * definition declares for the state it is in, and NOTHING IS ARMED. The
   * rail offers navigation; it does not put the user into an edit mode they
   * did not ask for, and it cannot, since this touches the cursor and never
   * the slot.
   *
   * THE RAIL IS THE ONLY CALLER NOW. A click on committed geometry used to
   * come through here too, and does not: the map's settled bands are
   * read-only (see MapLayerStack). That is a route removed rather than a
   * destination -- the reopen and its confirmation are unchanged, and the
   * rail reaches every step at a constant size however many have committed.
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
      statuses,
      reachable,
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
      statuses,
      reachable,
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
