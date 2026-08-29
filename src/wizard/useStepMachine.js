/**
 * useStepMachine.js
 *
 * THE ONE STATE MACHINE. Every step runs it -- boundary, landform, and every
 * step a later branch registers -- so the states, the buttons, the error
 * surfaces and the recovery paths are written once.
 *
 *   idle -> generating(job) -> reviewing <-> editing -> committing -> committed
 *                                   ^                                     |
 *                                   +--------------- reopen --------------+
 *
 * WHERE THE STATE COMES FROM, which is the rule that keeps this honest:
 *
 *   THE DOCUMENT IS TRUTH. `committed`, `reviewing`, `editing` and `idle` are
 *   DERIVED, every render, from the store's mirror plus the active draft.
 *   There is no copy of a step's status in here to fall out of step with the
 *   document -- so a reopen in another tab, a 409 that hydrated somebody
 *   else's commit, or a cascade that reset this step all move this machine
 *   without anything having to tell it.
 *
 *   THE TWO IN-FLIGHT STATES ARE THE EXCEPTION, AND THEY ARE NOT STATUS.
 *   `generating` is read off the store's job table -- the store already tracks
 *   the poll, so this reads it rather than keeping a second flag.
 *   `committing` is the only thing this hook holds of its own, and what it
 *   holds is not "what status the step has" but "a request I issued has not
 *   come back". Nothing in the document can express that; the request exists
 *   only here. It is cleared in a finally, so a throw cannot strand the panel.
 *
 * NO STEP-SPECIFIC BRANCHES. Grep this file for a step id and you will find
 * none. Everything that differs between steps is read off the definition:
 * whether there is a generate at all, where the status lives, how the commit
 * is made, whether a reopen exists. The moment this file needs to know which
 * step it is running, the schema in stepDefinitions.js has failed and that is
 * the thing to fix.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  selectBaseRevision,
  selectDraft,
  selectFailedLayer,
  selectJobForStep,
  selectStepError,
  selectStepProposals,
  selectStepRejections,
  selectStepsResetByReopen,
  useSession,
} from '../session/SessionStore'
import { JOB_RUNNING } from '../session/jobs'

/* The machine's states. Exported so panels and tests name them rather than
   comparing strings, and so a typo is a reference error. */
export const IDLE = 'idle'
export const GENERATING = 'generating'
export const REVIEWING = 'reviewing'
export const EDITING = 'editing'
export const COMMITTING = 'committing'
export const STEP_COMMITTED = 'committed'

export const MACHINE_STATES = Object.freeze([
  IDLE,
  GENERATING,
  REVIEWING,
  EDITING,
  COMMITTING,
  STEP_COMMITTED,
])

/**
 * Has the user touched this step since its proposals arrived?
 *
 * `reviewing` and `editing` differ by exactly this and by nothing else: the
 * same proposals are on screen either way, and the distinction is whether
 * there is a draft in hand to commit or discard. Deriving it from the draft
 * rather than from a "user has edited" flag means a draft the store dropped --
 * a cascade reset it, a hydration discarded it -- takes the panel back to
 * `reviewing` with no event needed.
 */
function draftHasWork(draft) {
  return (
    draft.selectedFeatureIds.length > 0 ||
    draft.drawnFeatures.length > 0 ||
    Object.keys(draft.inputs).length > 0
  )
}

/**
 * The machine state, derived. `pending` is the hook's own in-flight flag and
 * is the ONLY argument here that is not the store's.
 *
 * ORDER MATTERS, AND IT IS AN ORDER OF FACTS RATHER THAN OF PREFERENCES:
 *
 *   committed first, because the document said so, and a document beats
 *   anything this client believes about a request it made.
 *
 *   committing next, because a commit in flight is on its way to that answer
 *   and the panel must not offer the button again while it travels.
 *
 *   generating next: a running job is the store's own fact, not a guess.
 *
 *   then reviewing/editing, which need proposals to exist at all.
 *
 *   idle last -- nothing generated, nothing drawn, nothing in flight.
 */
export function deriveMachineState({ status, pending, isGenerating, hasProposals, hasDraftWork }) {
  if (status === COMMITTED) return STEP_COMMITTED
  if (pending === COMMITTING) return COMMITTING
  if (isGenerating) return GENERATING
  if (hasProposals || status === GENERATED) return hasDraftWork ? EDITING : REVIEWING
  // A step with no proposals but work in the draft is being edited: this is
  // boundary before its first commit, and it is also any step whose payload
  // was evicted while the user had already drawn something.
  if (hasDraftWork) return EDITING
  return IDLE
}

/**
 * Run one step.
 *
 * Returns everything a panel needs and nothing it has to re-derive: the
 * machine state, what it may do next, the per-feature rejections, and the
 * three actions. The definition is the only thing that differs between calls.
 */
export function useStepMachine(definition) {
  const { state, actions } = useSession()
  const stepId = definition.id

  // The one piece of local state, and it is a request's lifecycle rather than
  // a step's status. A ref alongside it so an unmount cannot dispatch.
  const [pending, setPending] = useState(null)
  const [confirmingReopen, setConfirmingReopen] = useState(false)
  const liveRef = useRef(true)

  // A commit resolving after the panel is gone must not set state on it. The
  // request itself is not cancelled -- a commit that reached the server has
  // happened, and pretending otherwise by aborting it would be the one thing
  // worse than a stray setState.
  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
    }
  }, [])

  const status = definition.status(state)
  const reachable = definition.reachable(state)
  const blockedBy = reachable ? null : definition.blockedBy(state)
  const draft = selectDraft(state, stepId)
  const proposals = selectStepProposals(state, stepId)
  const job = selectJobForStep(state, stepId)
  const isGenerating = job?.status === JOB_RUNNING

  const proposalFeatures = useMemo(
    () => definition.proposalFeatures(proposals),
    [definition, proposals]
  )

  const machineState = deriveMachineState({
    status,
    pending,
    isGenerating,
    hasProposals: proposals != null,
    hasDraftWork: draftHasWork(draft),
  })

  // What a commit would carry, counted rather than assembled: the panel wants
  // a number and the definition wants a predicate, and neither needs the
  // features themselves.
  const selectedCount = draft.selectedFeatureIds.length
  const drawnCount = draft.drawnFeatures.length

  const context = useMemo(
    () => ({
      stepId,
      state,
      draft,
      proposals,
      proposalFeatures,
      selectedCount,
      drawnCount,
      committableCount: selectedCount + drawnCount,
      baseRevision: selectBaseRevision(state, stepId),
    }),
    [stepId, state, draft, proposals, proposalFeatures, selectedCount, drawnCount]
  )

  /* -----------------------------------------------------------------------
     Errors, per feature and otherwise
     ----------------------------------------------------------------------- */

  const error = selectStepError(state, stepId)

  /**
   * The 422s, KEYED BY feature_id, straight from the store.
   *
   * Handed out whole rather than summarised. The panel above may count them
   * and say "2 zones could not be saved"; the MAP has to colour the two
   * offending features and print the server's own reason on each, and it can
   * only do that if the per-feature data got this far intact. Collapsing here
   * would make the user delete zones one at a time to find the bad one --
   * which is exactly what the backend's _rejection_payload() refuses to make
   * them do, and this is the layer most able to quietly undo that.
   */
  const rejections = useMemo(() => selectStepRejections(state, stepId), [state, stepId])
  const rejectedFeatureIds = useMemo(() => Object.keys(rejections), [rejections])
  const failedLayer = selectFailedLayer(state, stepId)

  /* -----------------------------------------------------------------------
     What may happen next
     ----------------------------------------------------------------------- */

  // A generate is offered when the step HAS one, its upstream is done, and
  // nothing is in flight. `definition.generate == null` is boundary, and it is
  // the whole of what the machine knows about that difference.
  const canGenerate =
    definition.generate != null &&
    reachable &&
    status !== COMMITTED &&
    machineState !== GENERATING &&
    machineState !== COMMITTING

  const commitBlockedReason = definition.commit.blockedReason?.(context) ?? null
  const canCommit =
    reachable &&
    status !== COMMITTED &&
    machineState !== GENERATING &&
    machineState !== COMMITTING &&
    definition.commit.canCommit(context)

  const canReopen = definition.reopen != null && status === COMMITTED

  /**
   * The steps a reopen would reset -- F1's selectStepsResetByReopen, which
   * names ONLY the downstream steps that actually hold work.
   *
   * NOT selectDownstreamSteps. That is the cascade's full reach and is the
   * right list to reason about; naming steps the user has never reached reads
   * as a threat to work that does not exist, and trains them to click through
   * the warning that will one day be real.
   */
  const stepsResetByReopen = useMemo(
    () => selectStepsResetByReopen(state, stepId),
    [state, stepId]
  )

  /* -----------------------------------------------------------------------
     The three transitions that talk to the API
     ----------------------------------------------------------------------- */

  /**
   * generating. The store owns the submit, the poll and the eviction
   * recovery; this only asks.
   *
   * NOTHING IS TRACKED HERE while it runs -- `generating` is read off the
   * store's job table, so a second consumer of the same step (the map, a
   * summary elsewhere) sees the same running job without this hook telling it.
   */
  const generate = useCallback(async () => {
    if (definition.generate == null) return false
    return actions.generate(stepId, definition.generate.params(draft))
  }, [actions, definition, stepId, draft])

  /**
   * committing -> committed. The definition says HOW; the outcome vocabulary
   * is the same either way, so nothing here knows whether the request was
   * POST /api/sessions or POST .../steps/{id}/commit.
   *
   * The store has already put a 409's document, a 422's rejections or a
   * step-state error where they belong by the time this resolves; the outcome
   * string is returned for a caller that wants to react (scroll to the map,
   * focus the re-prompt) rather than for this hook to branch on.
   */
  const commit = useCallback(async () => {
    setPending(COMMITTING)
    try {
      return await definition.commit.run(actions, context)
    } finally {
      // A throw must not strand the panel on a spinner. The ref guards the
      // unmount case; `finally` guards every other one.
      if (liveRef.current) setPending(null)
    }
  }, [actions, definition, context])

  /**
   * committed -> reviewing, via a confirmation that names what it costs.
   *
   * TWO CALLS, NOT ONE, and the split is the confirmation. requestReopen()
   * only opens the dialogue; confirmReopen() is what talks to the server. A
   * single call with a `confirmed` flag would let a caller pass true and skip
   * the naming, which is the one thing this transition exists to guarantee.
   */
  const requestReopen = useCallback(() => setConfirmingReopen(true), [])
  const cancelReopen = useCallback(() => setConfirmingReopen(false), [])

  const confirmReopen = useCallback(async () => {
    setConfirmingReopen(false)
    // The store hydrates the returned document -- cascade already applied --
    // and then fetches this step's layers back. Both are its job; this waits.
    return actions.reopen(stepId)
  }, [actions, stepId])

  const clearError = useCallback(() => actions.clearStepError(stepId), [actions, stepId])
  const discardDraft = useCallback(() => actions.discardDraft(stepId), [actions, stepId])

  return {
    definition,
    stepId,
    machineState,
    status,
    reachable,
    blockedBy,
    draft,
    proposals,
    proposalFeatures,
    job,
    error,
    rejections,
    rejectedFeatureIds,
    failedLayer,
    context,
    canGenerate,
    canCommit,
    canReopen,
    commitBlockedReason,
    confirmingReopen,
    stepsResetByReopen,
    generate,
    commit,
    requestReopen,
    cancelReopen,
    confirmReopen,
    clearError,
    discardDraft,
    actions,
  }
}

export { NOT_STARTED, GENERATED, COMMITTED }
