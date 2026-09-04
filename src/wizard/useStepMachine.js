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
 *   loading -> reviewing            arriving at a `generated` step by a reload
 *                                   or a navigation rather than by the
 *                                   generate that carried its payload. See
 *                                   LOADING; it is the one state that is about
 *                                   the DATA rather than about a decision.
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
  PROVENANCE_USER_ADDED,
  selectBaseRevision,
  selectDraft,
  selectDraftIsTouched,
  selectFailedLayer,
  selectNoCandidate,
  selectHasDraft,
  selectJobForStep,
  selectSessionError,
  selectSessionId,
  selectStepError,
  selectStepFeatures,
  selectStepProposals,
  selectStepProvenance,
  selectStepRejections,
  selectStepsResetByReopen,
  useSession,
} from '../session/SessionStore'
import { JOB_RUNNING } from '../session/jobs'
import { requiredInputsMissing } from './stepInputs.js'

/* The machine's states. Exported so panels and tests name them rather than
   comparing strings, and so a typo is a reference error. */
export const IDLE = 'idle'
/**
 * THE STEP IS GENERATED AND ITS PAYLOAD IS NOT HERE.
 *
 * A state about the DATA rather than about a decision, and the only one. The
 * document says this step has proposals; this client does not have them yet,
 * because it arrived by a reload or by a navigation rather than by the
 * generate that carried them. The fetch below is on its way, or has failed
 * and put its reason in the step's error.
 *
 * IT EXISTS BECAUSE THE ALTERNATIVE WAS AN ARMED COMMIT OVER AN EMPTY MAP.
 * Without it `status === GENERATED` alone read as REVIEWING, so the bar said
 * to review the proposals, the strip had no tabs to review, and the primary
 * button read "Commit no water zones" -- one click from recording a decision
 * the user never made, and a LEGAL one: the contract sets `min_features=0`,
 * so the request returns 200 and nothing anywhere reports a problem.
 *
 * AND IT IS NOT MERELY A LABEL FOR THAT. buildCommitBody resolves the draft's
 * selected ids against `state.steps[id].proposals`; with those absent, the
 * candidate list is EMPTY and every selected proposal is dropped on the way
 * to the wire. A commit issued in this state cannot carry a proposal, whatever
 * the draft holds. So the state is not "the screen is not ready yet" -- it is
 * "a commit made here is structurally incapable of saying what the user
 * means", which is why it beats the draft rather than deferring to it.
 */
export const LOADING = 'loading'
export const GENERATING = 'generating'
export const REVIEWING = 'reviewing'
export const EDITING = 'editing'
export const COMMITTING = 'committing'
export const STEP_COMMITTED = 'committed'

export const MACHINE_STATES = Object.freeze([
  IDLE,
  LOADING,
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
function draftHasWork(state, stepId) {
  // THE QUESTION IS "HAS THE USER TOUCHED IT", NOT "IS THERE ANYTHING IN IT",
  // and those two stopped being the same answer the moment selection was held
  // as a SELECTED set.
  //
  // It used to count the draft's contents, which was right while an empty
  // draft meant an untouched one. It no longer does, in both directions: the
  // seed fills a draft nobody has touched (SessionStore's DRAFT_SEEDED), and
  // deselecting every proposal EMPTIES a draft the user has worked hard on --
  // and that second case is the one that matters, because "I have taken
  // everything out" is precisely the state an empty commit records. Counting
  // contents would send that panel back to `Review the proposals.` with the
  // user's decision on screen and unacknowledged.
  //
  // `seeded` answers it directly: a draft exists only because the seed made
  // one or the user did, and withDraft() clears the flag on every write that
  // is not the seed. See selectDraftIsTouched.
  return selectDraftIsTouched(state, stepId)
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
 *   loading next, and it beats the draft rather than deferring to it. A
 *   `generated` step whose proposals are not here cannot commit what the user
 *   means -- see LOADING -- so it does not get to look like a step that can.
 *   That reading also covers the case the old `hasDraftWork` fallback was
 *   written for, a payload evicted under work already drawn: the drawn shapes
 *   are still on the map and still in the draft, and they become committable
 *   again the moment the payload lands.
 *
 *   then reviewing/editing, which need proposals to exist at all.
 *
 *   idle last -- nothing generated, nothing drawn, nothing in flight.
 */
export function deriveMachineState({ status, pending, isGenerating, hasProposals, hasDraftWork }) {
  if (status === COMMITTED) return STEP_COMMITTED
  if (pending === COMMITTING) return COMMITTING
  if (isGenerating) return GENERATING
  if (status === GENERATED && !hasProposals) return LOADING
  if (hasProposals) return hasDraftWork ? EDITING : REVIEWING
  // A step with no proposals but work in the draft is being edited: this is
  // boundary before its first commit, which has no `generated` status to
  // reach and so never sees LOADING above.
  if (hasDraftWork) return EDITING
  return IDLE
}

/**
 * THE DRAFT A STEP OPENS WITH, from the server's own state and nothing else.
 *
 * TWO SOURCES, IN ORDER, AND THE ORDER IS THE WHOLE RULE:
 *
 *   1. THE DOCUMENT, when this step carries features. That is a REOPENED step
 *      -- design_document.reopen_step() moves it back to `generated` keeping
 *      its committed features as the editable starting point -- so the draft
 *      opens on the decision the user last made, not on the recommendation
 *      they edited away from. Selections come back by feature id (stable
 *      across regenerates, asserted backend-side in test_step_commit.py
 *      section 10) and drawn zones come back whole, since a regenerate has
 *      nothing to say about geometry the user authored.
 *
 *   2. THE PROPOSALS otherwise: EVERY ONE SELECTED. This is the spike's
 *      `deselectedIds` semantics, preserved through an inversion. The payload
 *      IS the recommendation, so "all of it" is the correct starting point and
 *      the user's gesture is to take things OUT. Seeding is what lets the
 *      store hold that as a selected-set without the empty draft becoming
 *      ambiguous.
 *
 * A SELECTED ID THE PAYLOAD NO LONGER CARRIES IS DROPPED, and dropped
 * silently only because the backend asserts it cannot happen: proposal ids are
 * stable across regenerates, including across a cache eviction and rebuild.
 * step_orchestrator.restore_step_state() reports the same set as
 * `missing_feature_ids` for the same reason.
 */
export function seedFor(state, definition, proposalFeatures) {
  const stepId = definition.id
  const committed = selectStepFeatures(state, stepId)
  const provenance = selectStepProvenance(state, stepId) ?? {}
  const committedFeatures = Array.isArray(committed?.features) ? committed.features : []

  if (committedFeatures.length) {
    const proposed = new Set(proposalFeatures.map((feature) => feature.id))
    const selectedFeatureIds = []
    const drawnFeatures = []
    for (const feature of committedFeatures) {
      if (provenance[feature.id] === PROVENANCE_USER_ADDED) drawnFeatures.push(feature)
      else if (proposed.has(feature.id)) selectedFeatureIds.push(feature.id)
    }
    return { selectedFeatureIds, drawnFeatures }
  }

  return {
    selectedFeatureIds: seedSelection(definition, proposalFeatures),
    drawnFeatures: [],
  }
}

/**
 * WHAT A FRESH DRAFT SELECTS. Every proposal, for a step whose boxes are
 * checkboxes: the pipeline's suggestion is the starting point and the user
 * prunes. ONE GROUP, for a step whose boxes are a radio (`selection.mode`):
 * the alternatives are mutually exclusive by declaration, so a seed holding
 * all of them would be a state the strip can never show and the commit
 * contract refuses. The first group is the first candidate in payload order,
 * which is the first one the user tried.
 */
function seedSelection(definition, proposalFeatures) {
  const ids = proposalFeatures.map((feature) => feature.id)
  if (definition.selection?.mode !== 'radio' || !proposalFeatures.length) return ids
  const groupOf = typeof definition.groupOf === 'function' ? definition.groupOf : (f) => f.id
  const first = groupOf(proposalFeatures[0])
  return proposalFeatures.filter((feature) => groupOf(feature) === first).map((feature) => feature.id)
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

  /**
   * FETCH THE PROPOSALS OF A GENERATED STEP THAT HAS NONE.
   *
   * THE HOLE THIS FILLS. `loadLayers` existed on the store, was documented as
   * the resume path, and was called by NOTHING but tests. A generate carries
   * its own payload back with the job result, so within one session the
   * proposals were always already there and the gap was invisible. Reload the
   * page and it was not: `resume` hydrates the document -- which says
   * `generated` -- and fetches no payload, so the step came back with its
   * status intact and its proposals gone.
   *
   * WHY THAT WAS WORSE THAN AN EMPTY MAP. deriveMachineState reads
   * `hasProposals || status === GENERATED`, so the step landed in REVIEWING:
   * the bar said to review the proposals, the strip had no tabs to review, and
   * the primary button read "Commit no water zones" -- a legal empty commit,
   * one click away, recording a decision the user never made. The status was
   * right and everything derived from it was wrong.
   *
   * HERE RATHER THAN IN THE STORE OR IN `resume`. The store must not decide
   * which step is worth fetching -- that is the cursor's business and the
   * cursor is the shell's. `resume` cannot do it either: it hydrates a
   * document listing six steps, and fetching every generated step's payload on
   * every reload would be five requests for panels nobody is looking at. This
   * hook already runs for exactly one step, the one the cursor names, and it
   * already carries the sibling effect that seeds a draft the moment proposals
   * arrive. The two belong together: one fetches what the step is deciding
   * about, the other opens the decision on it.
   *
   * ONE ATTEMPT PER EPISODE, and the ref is what makes that true. A failed
   * fetch leaves `proposals` null, so without a guard this would re-fire on
   * the very state change its own failure caused, forever. The key resets the
   * moment proposals exist, so a later loss of them -- a cascade, an eviction
   * -- gets its own single attempt rather than being locked out by an
   * attempt made against a different episode.
   *
   * A FAILURE IS NOT RETRIED AUTOMATICALLY and that is deliberate: the store's
   * own failure path has already put the reason in the step's error, the bar
   * shows it, and a hook retrying behind that message would make the error
   * flicker rather than mean anything. Moving the cursor away and back
   * remounts this chrome and spends a fresh attempt, which is a gesture a user
   * can actually make.
   *
   * NOT WHILE A GENERATE IS RUNNING. That job's result carries the payload
   * itself; fetching alongside it would be a second answer to the same
   * question, racing the first.
   */
  const sessionId = selectSessionId(state)
  const layersRequested = useRef(null)
  useEffect(() => {
    if (proposals != null) {
      layersRequested.current = null
      return
    }
    if (!sessionId || status !== GENERATED || isGenerating) return

    const attempt = `${sessionId}:${stepId}`
    if (layersRequested.current === attempt) return
    layersRequested.current = attempt
    actions.loadLayers(stepId)
    // `actions` is in the deps rather than silenced: its identity changes on
    // every store write, so this effect re-runs often, and the guards above
    // are three comparisons. Depending on it is what keeps `loadLayers` from
    // closing over a session id the store has since replaced.
  }, [actions, sessionId, stepId, status, proposals, isGenerating])

  /**
   * SEED THE DRAFT THE MOMENT PROPOSALS EXIST AND NO DRAFT DOES.
   *
   * An effect rather than a branch in the reducer, because the seed VALUE is
   * the definition's (`proposalFeatures` names the payload's collection) and
   * the reducer must not learn a payload shape. The reducer's own guard makes
   * the write idempotent, so a re-render cannot overwrite a user's selection.
   *
   * NOT ON A COMMITTED STEP. Its draft was discarded by the commit, on
   * purpose: the decision is in the document now, and a draft re-seeded behind
   * a collapsed panel would put `Unsaved changes.` on a step that has none.
   */
  const hasDraft = selectHasDraft(state, stepId)
  useEffect(() => {
    if (proposals == null || hasDraft || status === COMMITTED) return
    const seed = seedFor(state, definition, proposalFeatures)
    actions.seedDraft(stepId, seed.selectedFeatureIds, seed.drawnFeatures)
    // `state` is read for the seed but is not a trigger: the guards above are
    // the trigger, and depending on the whole store would re-run this on every
    // unrelated dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, hasDraft, status, stepId, definition, proposalFeatures])

  const machineState = deriveMachineState({
    status,
    pending,
    isGenerating,
    hasProposals: proposals != null,
    hasDraftWork: draftHasWork(state, stepId),
  })

  // What a commit would carry, counted rather than assembled: the panel wants
  // a number and the definition wants a predicate, and neither needs the
  // features themselves.
  const selectedCount = draft.selectedFeatureIds.length
  const drawnCount = draft.drawnFeatures.length

  const context = useMemo(
    () => ({
      stepId,
      // THE DEFINITION RIDES THE CONTEXT, so a commit assembled from the
      // declared inputs (stepDefinitions' commitInputsFor) can read them
      // without the definition's own closure -- the factory's default run()
      // is written once for every document-backed step.
      definition,
      state,
      draft,
      proposals,
      proposalFeatures,
      selectedCount,
      drawnCount,
      committableCount: selectedCount + drawnCount,
      baseRevision: selectBaseRevision(state, stepId),
    }),
    [stepId, definition, state, draft, proposals, proposalFeatures, selectedCount, drawnCount]
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
  // THE OTHER KIND OF FAILED GENERATE. Read beside failedLayer and never
  // instead of it: the two are mutually exclusive on the wire, and the chrome
  // renders whichever the payload actually carried. See selectNoCandidate.
  const noCandidate = selectNoCandidate(state, stepId)

  /**
   * A COMMIT THAT DID NOT LAND, and the reason it did not, when there is one.
   *
   * `failedLayer` above is a failed GENERATE JOB's -- the store reads it off
   * the job table. A COMMIT has no job: it is one request, and when it fails
   * the store writes an error instead. Two different places, one question, so
   * the chrome gets one answer.
   *
   * THE SESSION ERROR IS HALF OF IT, AND IT HAD NO READER AT ALL.
   * selectSessionError has been exported since the store was written and
   * nothing in the app has ever called it -- which is precisely why a failed
   * boundary commit said nothing. The boundary's commit is
   * actions.startSession(), startSession reports its failure with no step id
   * (it is creating the session that step ids are recorded against, so there
   * is not one yet), handleFailure therefore takes the SESSION branch, and the
   * chrome only ever read the STEP branch. The button came back, the failure
   * went into the store, and nobody looked.
   *
   * THE STEP ERROR IS THE OTHER HALF, for every step whose commit is a step
   * commit rather than a session create. Same failure, same copy, one notice.
   * Only `network` kind: a 409 conflict and a 422 rejection are answers about
   * the request, they have their own renderings, and they are not a data
   * source being down.
   *
   * IT IS NOT A STATE. The commit is retryable and the machine returns to
   * `reviewing` with the button back -- which is correct and is not what was
   * broken. What was broken is that the return was the ONLY thing that
   * happened. This is a notice beside a button that works, not a state that
   * withholds one.
   */
  const sessionError = selectSessionError(state)
  const commitFailure = useMemo(() => {
    const failure =
      sessionError?.kind === 'network'
        ? sessionError
        : error?.kind === 'network'
          ? error
          : null
    return failure ? { failedLayer: failure.failedLayer ?? null } : null
  }, [sessionError, error])

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
    machineState !== COMMITTING &&
    // NOT WHILE THE PAYLOAD IS COMING. A regenerate would race the fetch for
    // the same answer and throw away a payload the server already has.
    machineState !== LOADING

  // The commit button's own words. A function when the step's commit can mean
  // more than one thing -- landform's empty commit renames the button rather
  // than letting a decision go in unnamed.
  const commitLabel =
    typeof definition.commit.label === 'function'
      ? definition.commit.label(context)
      : definition.commit.label

  /**
   * A REQUIRED INPUT WITH NO VALUE REFUSES THE COMMIT, before any request.
   *
   * The declaration says which inputs a commit needs (`inputs[].required`)
   * and where each one's commit value comes from (commitValueOf); an input
   * that resolves to nothing is a body the server would 400, and one the
   * client must not send. This is the same silent-empty-commit class that has
   * produced three separate bugs -- buildCommitBody used to send `inputs` only
   * when the draft's were non-empty, so a lost input left the key OFF the body
   * -- closed by construction: the button is disabled, with the reason, and
   * commitInputsFor throws if anything reaches it anyway. Read off the
   * declaration; nothing here knows which step declares an input.
   */
  const missingInputs = requiredInputsMissing(definition, context)
  // The missing input is named FIRST: it is the harder block (no selection
  // could lift it), and the definition's own reason would otherwise hide it.
  const commitBlockedReason = missingInputs.length
    ? `This step needs its ${missingInputs.join(', ')} before it can commit; none is recorded.`
    : definition.commit.blockedReason?.(context) ?? null
  /**
   * THE COMMIT IS DISARMED WHILE THE PAYLOAD IS ABSENT, and this line is the
   * guard rather than the definition's own predicate.
   *
   * It has to be here because the predicate cannot say it. Both steps that
   * allow an empty commit declare `canCommit: () => true` -- correctly, since
   * "no zones on this parcel" is a decision the design carries -- so nothing
   * a definition writes could tell the deliberate empty commit from the one
   * that is empty only because buildCommitBody had no candidates to match the
   * draft against. The machine knows the difference; the definition does not
   * and should not have to.
   */
  const canCommit =
    reachable &&
    status !== COMMITTED &&
    machineState !== GENERATING &&
    machineState !== COMMITTING &&
    machineState !== LOADING &&
    missingInputs.length === 0 &&
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
    // Resolves with the payload the job produced (see SessionStore.generate):
    // a button that has just awaited this closes over the machine it was
    // rendered with, whose `proposals` is the payload from BEFORE the request.
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
    noCandidate,
    commitFailure,
    context,
    canGenerate,
    canCommit,
    canReopen,
    commitLabel,
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
