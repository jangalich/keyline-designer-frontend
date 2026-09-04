/**
 * SessionStore.jsx
 *
 * THE MIRROR. A useReducer + context store holding the server's Design
 * Document, the proposals a layers fetch returned, and the one thing on this
 * whole client that is genuinely client-authored: the active step's
 * in-progress edit buffer.
 *
 * Two rules from interactive-design-frontend-architecture.md section 2.1 give
 * this module whatever value it has. Both are implemented literally, and both
 * are load-bearing rather than aspirational.
 *
 * RULE 1 -- THE SERVER DOCUMENT IS TRUTH; THIS IS A MIRROR PLUS DRAFTS.
 * A commit response returns the whole updated document and is applied
 * WHOLESALE, never patched. There is deliberately NO action in this reducer
 * that sets a step's status or features from the client's knowledge of what a
 * request should have done -- and if one is ever needed, the rule has already
 * been broken somewhere upstream. What that buys is one code path for three
 * problems that look different and are not: a 409 reconciliation, the reopen
 * cascade, and two tabs drifting apart are all "replace the mirror with the
 * server's document, decide whether the draft survives, re-render".
 *
 * IT NO LONGER COSTS A ROUND TRIP. It used to, visibly and in one place: a
 * finished generate returned the step's payload but NOT a document, while the
 * step's status had moved to `generated` server-side, so the store re-read the
 * whole session to learn a fact the server had just produced. Patching the
 * status locally would have been one line, and the standing cost of NOT doing
 * it was that fetch. The backend now sends the document with the payload
 * (step_orchestrator.run_generate_job), so the mirror is still only ever
 * written by hydrating a server document and there is nothing left to trade
 * for it. See onGenerated().
 *
 * RULE 2 -- NO DERIVED DESIGN CONTENT, EVER. This client never computes zones,
 * keypoints, eligibility or acreage-bearing analysis. It displays GeoJSON the
 * server produced and submits GeoJSON back. `steps[id].features` is written by
 * exactly one function, from exactly one source: a server document.
 * assertFeaturesCameFromServer() below turns that from a convention into a
 * check that runs on every dispatch in development.
 *
 * WHAT RULE 2 DOES NOT MEAN. zoneGeometry.js and geo.js compute area and
 * cautions on the client, and that is not a violation of anything. They are
 * reading aids DURING A GESTURE -- a live acreage chip cannot make a round
 * trip per vertex -- and both files already document themselves as guides the
 * backend recomputes properly in UTM before anything is committed. They stay.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'

import {
  commitStep as apiCommitStep,
  createSession as apiCreateSession,
  discardCandidate as apiDiscardCandidate,
  getSession as apiGetSession,
  getStepLayers as apiGetStepLayers,
  reopenStep as apiReopenStep,
  boundaryToLatLngs,
  CommitRejectedError,
  NotFoundError,
  RevisionConflictError,
  StepStateError,
} from './apiClient'
import { runGeneration, JOB_DONE, JOB_EVICTED, JOB_FAILED, JOB_RUNNING } from './jobs'

/* ---------------------------------------------------------------------------
   Vocabulary
   ---------------------------------------------------------------------------
   The document's three statuses, verbatim from design_document.py. Mirrored as
   constants rather than string literals scattered through the selectors so a
   typo is a ReferenceError rather than a comparison that is quietly always
   false.
   --------------------------------------------------------------------------- */

export const NOT_STARTED = 'not_started'
export const GENERATED = 'generated'
export const COMMITTED = 'committed'

/**
 * The three things a step can ask of the user, per this branch's prompt.
 *
 * THERE IS NO `adjust`. Generated candidates are SELECT-ONLY at every step --
 * nothing in this system can produce a user-modified generated feature, and
 * design_document.py's PROVENANCE_VALUES rejects the value outright -- and a
 * drawn zone is deleted and redrawn rather than edited. Exported here because
 * the step definitions (F2) key off it; nothing in this file branches on it.
 */
export const STEP_MODES = ['select', 'draw', 'delete']

/** Provenance, verbatim from design_document.PROVENANCE_VALUES. Two kinds, not three. */
export const PROVENANCE_GENERATED = 'generated'
export const PROVENANCE_USER_ADDED = 'user_added'

/* ---------------------------------------------------------------------------
   Actions
   ---------------------------------------------------------------------------
   EXPORTED, and enumerated in ALL_ACTIONS below, because the architectural
   test walks them. A new action that is not in that list fails the test that
   asserts only hydration writes features -- which is the point: adding a
   features-writing action has to be a deliberate, visible act.
   --------------------------------------------------------------------------- */

export const DOCUMENT_HYDRATED = 'document/hydrated'
export const SESSION_CLEARED = 'session/cleared'
export const RESUME_STARTED = 'session/resumeStarted'
export const RESUME_ABSENT = 'session/resumeAbsent'
export const SESSION_ERROR_SET = 'session/errorSet'
export const STEP_PROPOSALS_LOADED = 'step/proposalsLoaded'
export const STEP_PROPOSALS_CLEARED = 'step/proposalsCleared'
export const STEP_ERROR_SET = 'step/errorSet'
export const STEP_ERROR_CLEARED = 'step/errorCleared'
export const DRAFT_SEEDED = 'draft/seeded'
export const DRAFT_SELECTION_SET = 'draft/selectionSet'
export const DRAFT_SELECTION_TOGGLED = 'draft/selectionToggled'
export const DRAFT_SHAPE_ADDED = 'draft/shapeAdded'
export const DRAFT_SHAPE_REMOVED = 'draft/shapeRemoved'
export const DRAFT_INPUT_SET = 'draft/inputSet'
export const DRAFT_DISCARDED = 'draft/discarded'
export const JOB_SUBMITTED = 'job/submitted'
export const JOB_OBSERVED = 'job/observed'
export const JOB_STARTED = 'job/started'
export const JOB_FORGOTTEN = 'job/forgotten'

/**
 * The ONLY actions permitted to change a step's `features`, and exactly one of
 * them can ever produce a value.
 *
 * DOCUMENT_HYDRATED writes features, from the server document it carries and
 * from nothing else. SESSION_CLEARED and RESUME_ABSENT only ever REMOVE them:
 * both drop the whole mirror, so "unchanged by reference" is not true of them
 * either, and both are listed for that reason rather than as an exemption.
 */
export const FEATURE_WRITING_ACTIONS = Object.freeze([
  DOCUMENT_HYDRATED,
  SESSION_CLEARED,
  RESUME_ABSENT,
])

export const ALL_ACTIONS = Object.freeze([
  DOCUMENT_HYDRATED,
  SESSION_CLEARED,
  RESUME_STARTED,
  RESUME_ABSENT,
  SESSION_ERROR_SET,
  STEP_PROPOSALS_LOADED,
  STEP_PROPOSALS_CLEARED,
  STEP_ERROR_SET,
  STEP_ERROR_CLEARED,
  DRAFT_SEEDED,
  DRAFT_SELECTION_SET,
  DRAFT_SELECTION_TOGGLED,
  DRAFT_SHAPE_ADDED,
  DRAFT_SHAPE_REMOVED,
  DRAFT_INPUT_SET,
  DRAFT_DISCARDED,
  JOB_SUBMITTED,
  JOB_OBSERVED,
  JOB_STARTED,
  JOB_FORGOTTEN,
])

/* ---------------------------------------------------------------------------
   State
   --------------------------------------------------------------------------- */

export const initialState = Object.freeze({
  sessionId: null,
  // The raw document, kept whole alongside the derived per-step mirror. The
  // boundary and the document revision live here and nowhere else; keeping the
  // original means the mirror can be rebuilt without a refetch.
  document: null,
  stepOrder: [],
  // stepId -> {status, revision, features, provenance, inputs, proposals, error}
  steps: {},
  // THERE IS NO `activeStep` HERE ANY MORE, AND THAT IS THE COLLISION GONE.
  //
  // This store used to carry one, described in its own comment as "THE
  // DOCUMENT'S CURSOR, and NOT the panel the user is looking at" -- a second
  // slot with almost the wizard's name for almost the wizard's question. It
  // was written by one action nothing dispatched and read by two selectors
  // nothing called, so its entire effect was to give the next reader a
  // plausible wrong answer: it was validated against `step_order`, could
  // never hold 'boundary', and hydrate() nulled it for any id the incoming
  // document did not carry, so a reader reaching for "which step is open"
  // got null on the step the user was actually looking at.
  //
  // WHICH STEP IS OPEN HAS ONE ANSWER AND ONE HOME: the wizard's cursor,
  // `useWizardCursor().cursorStepId` -- explicit React state, always naming a
  // step the wizard is actually rendering, and able to name the boundary.
  // Nothing about a session belongs in this store's answer to that, because
  // it was never this store's question.
  // stepId -> {selectedFeatureIds, drawnFeatures, inputs}. THE ONLY
  // CLIENT-AUTHORED STATE IN THIS STORE.
  drafts: {},
  jobs: {},
  // idle | loading | ready | absent. `absent` is a resume that 404'd -- a
  // stale bookmark, which is not an error and never becomes state.error.
  resume: 'idle',
  error: null,
})

const EMPTY_DRAFT = Object.freeze({
  selectedFeatureIds: Object.freeze([]),
  drawnFeatures: Object.freeze([]),
  inputs: Object.freeze({}),
  // IS THIS DRAFT STILL EXACTLY THE RECOMMENDATION? True only between
  // DRAFT_SEEDED and the user's first gesture -- withDraft() clears it on
  // every other write, so it cannot be left stale by an action that forgot.
  //
  // It exists because the seed put the server's proposal INTO the draft (see
  // DRAFT_SEEDED), and `reviewing` vs `editing` asks whether the USER has
  // touched the step. Without this flag every freshly generated step would
  // read as `editing` with `Unsaved changes.` over changes nobody made.
  seeded: false,
})

/** A step entry that is present in the order but absent from the mirror. */
const MISSING_STEP = Object.freeze({
  status: NOT_STARTED,
  revision: 0,
  features: null,
  provenance: null,
  inputs: null,
  proposals: null,
  error: null,
})

export class DocumentContractError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DocumentContractError'
  }
}

/**
 * The canonical step order, off the document.
 *
 * FROM `step_order`, NEVER FROM `Object.keys(document.steps)`. The backend
 * builds that map in pipeline order and Python preserves it -- but Flask's
 * DefaultJSONProvider sets `sort_keys = True`, so the object arrives here
 * ALPHABETICALLY: fencing, landform, roads, structures, trees, water. Reading
 * the keys would produce six real step ids in a stable order that is not the
 * pipeline's, and a reopen confirmation built on it would name the wrong steps
 * as the ones about to be reset. Nothing would throw. (RFC 8259 is explicit
 * that a JSON object is unordered; an array is not.)
 *
 * So `step_order` is REQUIRED, and its absence is a hard error rather than a
 * fallback to the keys. A frontend running against a backend too old to send
 * it should stop and say so -- the alternative is a plausible wrong answer
 * about which of the user's committed work is about to be discarded.
 */
export function stepOrderFrom(document) {
  const order = document?.step_order
  if (!Array.isArray(order) || order.length === 0) {
    throw new DocumentContractError(
      "The session document carries no 'step_order'. The frontend reads the " +
        'step order off the document rather than keeping a second copy of it; ' +
        'see session_api.py _document_body().'
    )
  }
  return order.slice()
}

/* ---------------------------------------------------------------------------
   Hydration -- the one place a step's features are written
   --------------------------------------------------------------------------- */

/**
 * Do this step's proposals survive the incoming document?
 *
 * Proposals are derived bulk data belonging to a step in `generated` status --
 * the backend serves them from GET .../layers and 409s for a step in any other
 * status. So the incoming status has to be `generated`, and the step's
 * revision has to be the one they were fetched against. A step that just
 * became `committed` cannot be asked for layers at all; one a cascade reset to
 * `not_started` would be showing candidates computed from an upstream that no
 * longer exists; one whose revision moved was re-committed underneath them.
 *
 * THE PREVIOUS STATUS IS DELIBERATELY NOT CHECKED, and getting that wrong cost
 * a test. A generate lands its payload in the store BEFORE the document that
 * says `generated` (see onGenerated -- the store will not patch the status
 * itself), so at that moment the mirror still says `not_started` while the
 * proposals in hand are perfectly good. Requiring the old status to already be
 * `generated` threw away every freshly generated payload, one dispatch after
 * it arrived. That both halves now come out of the same job result rather than
 * two responses changes the timing, not the rule.
 */
function proposalsSurvive(previous, entry) {
  if (!previous || previous.proposals == null) return false
  if (entry.status !== GENERATED) return false
  return previous.revision === (entry.revision ?? 0)
}

/**
 * Replace the mirror with a server document. WHOLESALE.
 *
 * Every step in `step_order` is rebuilt from the document's entry, including
 * the ones a cascade just reset -- a reset step comes back as bare
 * `{status: not_started}` and this writes exactly that, so its features,
 * provenance, inputs and revision are GONE rather than left behind from the
 * state before. That is the whole of the cascade handling; there is no
 * separate "apply the cascade" code, because a wholesale replacement cannot
 * fail to apply one.
 *
 * WHICH DRAFTS SURVIVE. A draft whose step is now `not_started` is discarded:
 * it was selections against a candidate set an upstream change has invalidated,
 * and re-offering it would let the user commit choices about ground the server
 * no longer proposes. Every other draft is KEPT -- including on the 409 path,
 * where the step comes back `committed` because another tab won the race. That
 * is section 2.6's "keep the draft where its base step survived": their work
 * is still theirs, and the re-prompt asks what to do with it. A draft is
 * cleared on a SUCCESSFUL commit by an explicit DRAFT_DISCARDED, not here, so
 * the two outcomes stay two readable paths.
 */
function hydrate(state, document) {
  const stepOrder = stepOrderFrom(document)
  const documentSteps = document.steps ?? {}

  const steps = {}
  for (const stepId of stepOrder) {
    const entry = documentSteps[stepId] ?? { status: NOT_STARTED }
    const previous = state.steps[stepId]
    steps[stepId] = {
      status: entry.status,
      // A step that has never been committed has no revision at all, and the
      // next commit's base_revision is 0 -- design_document.commit_step()'s
      // `current.get("revision", 0)`, mirrored so both sides agree.
      revision: entry.revision ?? 0,
      // `?? null`, and the ONLY assignment to this key anywhere in the module.
      features: entry.features ?? null,
      provenance: entry.provenance ?? null,
      inputs: entry.inputs ?? null,
      proposals: proposalsSurvive(previous, entry) ? previous.proposals : null,
      // Rejections and step-state errors describe a state that no longer
      // exists once a new document lands.
      error: null,
    }
  }

  const drafts = {}
  for (const [stepId, draft] of Object.entries(state.drafts)) {
    if (steps[stepId] && steps[stepId].status !== NOT_STARTED) drafts[stepId] = draft
  }

  return {
    ...state,
    sessionId: document.session_id ?? state.sessionId,
    document,
    stepOrder,
    steps,
    drafts,
    resume: 'ready',
    error: null,
  }
}

/* ---------------------------------------------------------------------------
   Draft helpers
   --------------------------------------------------------------------------- */

function draftOf(state, stepId) {
  return state.drafts[stepId] ?? EMPTY_DRAFT
}

/**
 * Write one step's draft. `seeded` is an EXPLICIT ARGUMENT defaulting to
 * false, not a field read off the draft being written.
 *
 * The default is the safe direction: any write that is not the seed itself is
 * a user gesture, so a draft action added later marks the draft touched
 * without its author having to remember to. Reading the flag off the incoming
 * object instead would carry `seeded: true` forward through every `{...draft}`
 * spread -- which is every other case in this reducer -- and the flag would
 * never clear.
 */
function withDraft(state, stepId, draft, seeded = false) {
  return {
    ...state,
    drafts: { ...state.drafts, [stepId]: { ...draft, seeded } },
  }
}

/**
 * Patch one step's non-document fields (proposals, error).
 *
 * A step the mirror has never seen is CREATED from MISSING_STEP rather than
 * ignored. Dropping the patch would silently swallow the one thing worth
 * keeping in that situation -- an error about a step id the document does not
 * carry -- and leave the UI spinning with nothing to show for it.
 */
function withStep(state, stepId, patch) {
  const current = state.steps[stepId] ?? MISSING_STEP
  return { ...state, steps: { ...state.steps, [stepId]: { ...current, ...patch } } }
}

/* ---------------------------------------------------------------------------
   The reducer
   --------------------------------------------------------------------------- */

function reduce(state, action) {
  switch (action.type) {
    case DOCUMENT_HYDRATED:
      return hydrate(state, action.document)

    case SESSION_CLEARED:
      return { ...initialState, resume: action.resume ?? 'absent' }

    case RESUME_STARTED:
      return { ...state, resume: 'loading', error: null }

    case RESUME_ABSENT:
      // A 404 on resume. Distinct from SESSION_CLEARED only in that it says so
      // in `resume`; both drop the mirror, and NEITHER sets `error`.
      return { ...initialState, resume: 'absent' }

    case SESSION_ERROR_SET:
      return { ...state, error: action.error, resume: state.resume === 'loading' ? 'idle' : state.resume }

    case STEP_PROPOSALS_LOADED:
      // FROM A LAYERS FETCH OR A FINISHED JOB, never from the document. The
      // server keeps derived bulk data out of the document (design_document.py's
      // docstring), and the mirror keeps it out of the mirror's document half
      // for the same reason -- it is evictable, refetchable and not a decision.
      return withStep(state, action.stepId, { proposals: action.payload, error: null })

    case STEP_PROPOSALS_CLEARED:
      return withStep(state, action.stepId, { proposals: null })

    case STEP_ERROR_SET:
      return withStep(state, action.stepId, { error: action.error })

    case STEP_ERROR_CLEARED:
      return withStep(state, action.stepId, { error: null })

    case DRAFT_SEEDED:
      /**
       * THE RECOMMENDATION, PUT INTO THE DRAFT. The one write in this reducer
       * that fills a draft from something other than a user gesture, and it is
       * here because of what the payload MEANS.
       *
       * The spike tracked `deselectedIds`, and its comment says why: every
       * suggested zone starts SELECTED, because the payload IS the
       * recommendation. An empty set was therefore the correct initial state
       * and needed no seeding. This store holds the opposite polarity --
       * `selectedFeatureIds`, which is what a commit body is assembled from --
       * so the same semantics has to be written down rather than fallen into,
       * and an unseeded empty draft would be ambiguous between "nothing
       * selected yet" and "everything deselected".
       *
       * SEEDING IS A CONSEQUENCE OF PROPOSALS ARRIVING, not a user action --
       * useStepMachine fires it whenever a step has proposals and no draft.
       * That is what removes the ambiguity: after a payload lands there is
       * ALWAYS a draft, so an empty `selectedFeatureIds` can only mean the
       * user deselected everything. It is also why DRAFT_DISCARDED deletes the
       * draft outright rather than emptying it -- discarding takes the user
       * back to the recommendation, which is the honest meaning of "discard my
       * changes" for a step whose starting point is a server proposal.
       *
       * NEVER OVER AN EXISTING DRAFT. A seed that overwrote one would undo the
       * user's own selection on any re-render that happened to re-run it.
       */
      if (state.drafts[action.stepId] !== undefined) return state
      return withDraft(
        state,
        action.stepId,
        {
          ...EMPTY_DRAFT,
          // A DRAWN FEATURE IS SELECTED BY BEING IN THE DRAFT. The seeder
          // hands the two lists separately because they come from different
          // places -- proposals by id, user shapes whole -- but a commit body
          // now asks the selection about both, so a reopened drawn zone that
          // was not in the set would come back invisible and uncommittable.
          // Unioned here rather than in the seeder, so useStepMachine's
          // seedFor() does not have to know the rule.
          selectedFeatureIds: [
            ...new Set([
              ...action.selectedFeatureIds,
              ...action.drawnFeatures.map((feature) => feature.id),
            ]),
          ],
          drawnFeatures: [...action.drawnFeatures],
        },
        true
      )

    case DRAFT_SELECTION_SET: {
      /**
       * A LIST, OR A FUNCTION OF THE LIST IN HAND.
       *
       * THE ONE THE FUNCTION FORM EXISTS FOR. The tab strip's box computes its
       * next selection from `machine.draft.selectedFeatureIds` -- the draft the
       * strip was RENDERED with -- and dispatches the result. That is a stale
       * read the moment two presses land in one React batch: both closures
       * hold the same pre-batch list, both compute from it, and the second
       * write silently undoes the first. (Measured: from ['a','b','c'],
       * ticking a's box and then b's in one batch yields ['a','c'] -- a is
       * back.) The control used to dispatch DRAFT_SELECTION_TOGGLED, whose next
       * state IS computed here against the draft in hand, and composed
       * correctly by construction; it stopped when the control grew a selection
       * MODE and had to compute a whole set rather than flip one id.
       *
       * NOT USER-REACHABLE TODAY -- two clicks are two events and React 18
       * does not batch discrete events together -- which is exactly why it
       * would have sat. The fix is to keep the arithmetic where the caller
       * put it and move only the READ back into the reducer, so a caller can
       * no longer compute from a list the store has already replaced.
       *
       * THE ARRAY FORM IS UNTOUCHED, so every other caller is unchanged: an
       * outright "the selection is now this" (a step's own commit path, the
       * roads network the generate just made) is not composing with anything.
       */
      const draft = draftOf(state, action.stepId)
      const next =
        typeof action.featureIds === 'function'
          ? action.featureIds(draft.selectedFeatureIds)
          : action.featureIds
      return withDraft(state, action.stepId, {
        ...draft,
        selectedFeatureIds: [...next],
      })
    }

    case DRAFT_SELECTION_TOGGLED: {
      const draft = draftOf(state, action.stepId)
      const selected = draft.selectedFeatureIds.includes(action.featureId)
        ? draft.selectedFeatureIds.filter((id) => id !== action.featureId)
        : [...draft.selectedFeatureIds, action.featureId]
      return withDraft(state, action.stepId, { ...draft, selectedFeatureIds: selected })
    }

    case DRAFT_SHAPE_ADDED: {
      const draft = draftOf(state, action.stepId)
      return withDraft(state, action.stepId, {
        ...draft,
        drawnFeatures: [...draft.drawnFeatures, action.feature],
        // IN THE COMMIT THE MOMENT IT EXISTS. Someone who has just drawn a
        // shape has said they want it; the checkbox is there to take it back out,
        // not to be found and switched on.
        selectedFeatureIds: draft.selectedFeatureIds.includes(action.feature.id)
          ? draft.selectedFeatureIds
          : [...draft.selectedFeatureIds, action.feature.id],
      })
    }

    case DRAFT_SHAPE_REMOVED: {
      // DELETE AND REDRAW is the whole edit vocabulary for a drawn zone -- there
      // is no vertex editing to undo halfway.
      const draft = draftOf(state, action.stepId)
      return withDraft(state, action.stepId, {
        ...draft,
        drawnFeatures: draft.drawnFeatures.filter((f) => f.id !== action.featureId),
        // The selection goes with the shape. A destroyed zone that left its id
        // behind would put it back in the commit if an undo redrew it under a
        // new id, and would leave a dead id in the set either way.
        selectedFeatureIds: draft.selectedFeatureIds.filter((id) => id !== action.featureId),
      })
    }

    case DRAFT_INPUT_SET: {
      // The step's own user inputs -- the access point is one of these, on the
      // ROADS step, and not a global field.
      //
      // `undefined` CLEARS THE KEY rather than storing an undefined under it.
      // A roads generate that succeeded clears its pending access point (the
      // server holds it now); an input left as `undefined` would still be a
      // key the commit assembler and the layer stack have to step around.
      const draft = draftOf(state, action.stepId)
      const inputs = { ...draft.inputs }
      if (action.value === undefined) delete inputs[action.key]
      else inputs[action.key] = action.value
      return withDraft(state, action.stepId, { ...draft, inputs })
    }

    case DRAFT_DISCARDED: {
      const drafts = { ...state.drafts }
      delete drafts[action.stepId]
      return { ...state, drafts }
    }

    case JOB_STARTED: {
      /**
       * A GENERATION HAS BEEN ASKED FOR, BEFORE THE SERVER HAS ANSWERED.
       *
       * THE REMAINING FLASH, AND WHY DROPPING THE STALE JOB DID NOT CLOSE IT.
       * `generating` is read off this table, and until now the table did not
       * learn about a generate until the POST came back with a job id. The
       * round trip is short and it is not zero, and for its whole width the
       * step still derived `reviewing` -- so the reviewing pair rendered for
       * a split second on every press. Dropping the superseded job fixed the
       * case where the buttons stayed for the WHOLE generate; this is the
       * case where they stay for the first frames of it, and it is a
       * different hole in the same wall.
       *
       * A REAL ENTRY, NOT A FLAG, so nothing has to learn a second way to
       * ask. selectJobForStep already answers "what is this step's job", and
       * an entry with no id yet is still the honest answer to it: a
       * generation is in flight. JOB_SUBMITTED replaces this the moment the
       * id arrives -- it drops every entry carrying the step's id, which is
       * what this one carries -- so the placeholder never coexists with the
       * real job and never outlives it.
       *
       * KEYED BY THE STEP so a second press cannot leave two behind, and
       * `jobId: null` so any reader that reaches for one gets an absence
       * rather than a plausible wrong id to poll.
       */
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [`pending:${action.stepId}`]: {
            jobId: null,
            stepId: action.stepId,
            status: JOB_RUNNING,
            result: null,
            error: null,
          },
        },
      }
    }

    case JOB_SUBMITTED: {
      // ONE JOB PER STEP, AS AN INVARIANT OF THE TABLE RATHER THAN A HABIT OF
      // ITS CALLERS. selectJobForStep() answers with the FIRST entry carrying
      // the step's id, so a second entry for the same step does not race the
      // first -- it loses to it, permanently, because Object.values keeps
      // insertion order and the older one is always first.
      //
      // THE ENTRY THAT WAS BEING LEAKED IS A FINISHED ONE. generate() already
      // drops a job it is SUPERSEDING, but it looks that job up in a ref it
      // clears the moment the generation settles -- so an aborted generate was
      // cleaned up and a COMPLETED one was not, and its `done` entry stayed in
      // the table for the life of the session. The next generate for that step
      // then added a `running` entry behind it, and every reader asking
      // "is this step generating" got the old answer: false.
      //
      // WHICH IS WHY THE ROADS STEP SHOWED IT FIRST. The reading only matters
      // where a step generates a SECOND time with its proposals still on
      // screen -- deriveMachineState() checks `isGenerating` before
      // `hasProposals`, so a false reading falls through to `reviewing` and the
      // banner offers that state's buttons while the job runs. Landform and
      // water offer their generate in `idle` alone, so their second generate
      // is not reachable from a state that has proposals; roads offers it in
      // `reviewing`, and is the first step whose regenerate lands in this hole.
      // The fix is here and not in the roads definition, because the leak is
      // the table's and every step is standing over it.
      const jobs = {}
      for (const [jobId, job] of Object.entries(state.jobs)) {
        if (job.stepId !== action.stepId) jobs[jobId] = job
      }
      jobs[action.jobId] = {
        jobId: action.jobId,
        stepId: action.stepId,
        status: JOB_RUNNING,
        result: null,
        error: null,
      }
      return { ...state, jobs }
    }

    case JOB_OBSERVED: {
      const existing = state.jobs[action.snapshot.job_id]
      if (!existing) return state
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [existing.jobId]: {
            ...existing,
            status: action.snapshot.status,
            // `?? null` on both halves: job_runner.snapshot() OMITS the half
            // that does not exist rather than sending null, so an absent key
            // here means "not this outcome", never "this outcome, empty".
            result: action.snapshot.result ?? null,
            error: action.snapshot.error ?? null,
          },
        },
      }
    }

    case JOB_FORGOTTEN: {
      const jobs = { ...state.jobs }
      delete jobs[action.jobId]
      return { ...state, jobs }
    }

    default:
      return state
  }
}

/**
 * RULE 2, AS A CHECK RATHER THAN A COMMENT.
 *
 * After any dispatch, every step's `features` must be either the value it
 * already had (by reference) or the value the action's own server document
 * carried (by reference). There is no third provenance. Anything else means
 * something computed, patched or invented design content -- exactly what
 * section 2.1 forbids and exactly what a comment cannot prevent.
 *
 * Exported so the architectural test can run it over every action type, and
 * called on every dispatch in development, which is the convention this
 * codebase already uses for its invariants (see zoneGeometry.js's
 * assertSuggestedZonesAreClean and App.jsx's DEV blocks).
 */
export function assertFeaturesCameFromServer(before, after, action) {
  const fromServer = action?.document?.steps ?? {}
  for (const [stepId, entry] of Object.entries(after.steps)) {
    const previous = before.steps[stepId]
    if (previous && previous.features === entry.features) continue
    const served = fromServer[stepId]?.features ?? null
    if (entry.features === served) continue
    throw new Error(
      `SessionStore: '${action?.type}' wrote features for step '${stepId}' that ` +
        'did not come from a server document. Only hydration may write features ' +
        '(SessionStore.jsx, rule 2).'
    )
  }
}

export function reducer(state, action) {
  const next = reduce(state, action)
  if (import.meta.env?.DEV) assertFeaturesCameFromServer(state, next, action)
  return next
}

/* ---------------------------------------------------------------------------
   Selectors
   ---------------------------------------------------------------------------
   COMPONENTS NEVER REACH INTO THE RAW SHAPE. Not a style preference: the shape
   above has three places a step's identity is recorded (the document, the
   mirror, the draft) and a component reading the wrong one gets an answer that
   is right until the first cascade.
   --------------------------------------------------------------------------- */

export const selectSessionId = (state) => state.sessionId
export const selectDocument = (state) => state.document
export const selectStepOrder = (state) => state.stepOrder
export const selectResumeState = (state) => state.resume
export const selectSessionError = (state) => state.error

export const selectStep = (state, stepId) => state.steps[stepId] ?? MISSING_STEP
export const selectStepStatus = (state, stepId) => selectStep(state, stepId).status
export const selectStepRevision = (state, stepId) => selectStep(state, stepId).revision
export const selectStepFeatures = (state, stepId) => selectStep(state, stepId).features
export const selectStepProvenance = (state, stepId) => selectStep(state, stepId).provenance
export const selectStepInputs = (state, stepId) => selectStep(state, stepId).inputs
export const selectStepProposals = (state, stepId) => selectStep(state, stepId).proposals
export const selectStepError = (state, stepId) => selectStep(state, stepId).error

export const selectIsStepCommitted = (state, stepId) =>
  selectStepStatus(state, stepId) === COMMITTED

/**
 * The base_revision the next commit of this step must carry.
 *
 * OFF THE MIRROR AT COMMIT TIME, never off the draft. A draft records what the
 * user picked, not which revision they started from -- if it carried a copy of
 * the revision, a 409 reconciliation would rebase onto a number captured before
 * the conflict and lose the race a second time.
 */
export const selectBaseRevision = (state, stepId) => selectStepRevision(state, stepId)

/**
 * THE DRAWN BOUNDARY, AS ONE VALUE, in Leaflet's [lat, lng].
 *
 * THE ONE PLACE THE RING LIVES, and it MOVES rather than being copied. Before
 * the boundary step commits, the ring is client-authored and lives in that
 * step's draft under its declared input. The instant the commit lands, the
 * session's own document carries it and the draft's copy is gone -- hydrate()
 * discards a draft for a step the document does not carry, and `boundary` is
 * deliberately not in `step_order`.
 *
 * So this is not a fallback chain papering over two sources of truth. It is
 * one source that the commit HANDS OVER to the server, which is the store's
 * whole rule stated for a ring: the document wins as soon as there is one.
 *
 * THE CONSEQUENCE IS DELIBERATE. Once a session exists the ring is no longer
 * writable -- there is no endpoint to move a committed boundary, and
 * BOUNDARY_STEP declares `reopen: null` for exactly that reason. A caller that
 * wants a different parcel starts a new session; it does not edit this.
 *
 * `stepId` and `inputKey` are passed in rather than imported: this file must
 * not learn the boundary step's id, and the step definition already declares
 * both.
 */
export function selectBoundaryRing(state, stepId, inputKey) {
  const committed = boundaryToLatLngs(state.document)
  if (committed.length) return committed
  const drafted = selectDraft(state, stepId).inputs?.[inputKey]
  return Array.isArray(drafted) ? drafted : EMPTY_RING
}

/** A stable empty ring, so a component reading it does not re-render on identity. */
const EMPTY_RING = Object.freeze([])

/**
 * Is this step reachable -- is everything before it committed?
 *
 * ALL upstream steps, not just the immediate predecessor. Checking only the
 * predecessor would be equivalent today (you cannot commit step N without N-1
 * committed, and reopening N-1 resets N), but that equivalence is a property of
 * the cascade rather than of this function, and it is not this function's to
 * assume.
 */
export function selectIsStepReachable(state, stepId) {
  const index = state.stepOrder.indexOf(stepId)
  if (index < 0) return false
  return state.stepOrder
    .slice(0, index)
    .every((upstreamId) => selectStepStatus(state, upstreamId) === COMMITTED)
}

/**
 * The steps a reopen or a re-commit of `stepId` would reset, in order.
 *
 * THE SAME LIST design_document.downstream_steps() COMPUTES, from the same
 * data: it is STEP_ORDER after this step, and the order comes off the document
 * (see stepOrderFrom). There is no second copy of the step list in this
 * repository -- deliberately, because the cascade in commit_step/reopen_step
 * iterates the backend's own function, and a hardcoded array over here would
 * be a second source of truth for what the user is about to lose.
 */
export function selectDownstreamSteps(state, stepId) {
  const index = state.stepOrder.indexOf(stepId)
  if (index < 0) return []
  return state.stepOrder.slice(index + 1)
}

/**
 * What a reopen of `stepId` would actually discard: the downstream steps that
 * currently hold work.
 *
 * THE CONFIRMATION DIALOGUE NAMES EXACTLY THESE. selectDownstreamSteps() is the
 * cascade's full reach and is the right list to reason about; it is the wrong
 * list to show, because naming steps the user has never reached reads as a
 * threat to work that does not exist and trains them to click through the
 * warning that will one day be real.
 */
/**
 * Every step that currently holds work -- generated or committed.
 *
 * WHAT ENDING THE SESSION COSTS, named. There is no endpoint to move a
 * committed boundary and there should not be: every committed step's geometry
 * was computed against the parcel, so a different parcel is a different
 * session rather than a cascade within one. That makes "redraw the boundary"
 * the single most destructive action in this app, and the only honest way to
 * offer it is to say what it discards first.
 *
 * NOT selectDownstreamSteps' full reach, for the same reason the reopen
 * warning is not: naming steps the user has never reached reads as a threat to
 * work that does not exist and trains them to click through the warning that
 * will one day be real.
 */
export function selectStepsHoldingWork(state) {
  return state.stepOrder.filter((stepId) => selectStepStatus(state, stepId) !== NOT_STARTED)
}

export function selectStepsResetByReopen(state, stepId) {
  return selectDownstreamSteps(state, stepId).filter(
    (downstreamId) => selectStepStatus(state, downstreamId) !== NOT_STARTED
  )
}

export const selectDraft = (state, stepId) => state.drafts[stepId] ?? EMPTY_DRAFT
export const selectHasDraft = (state, stepId) => state.drafts[stepId] !== undefined

/**
 * Has the USER touched this step's draft, as opposed to the seed having filled
 * it with the server's recommendation? See EMPTY_DRAFT's `seeded`.
 */
export const selectDraftIsTouched = (state, stepId) => {
  const draft = state.drafts[stepId]
  return draft !== undefined && !draft.seeded
}

/**
 * The 422 rejections for a step, ADDRESSABLE BY FEATURE ID.
 *
 * Returned as a map because that is how the map layer asks: it is walking its
 * own features and needs, for each one, "is this the offending one, and what
 * did the server say about it". A list would make that a scan per feature and
 * invite the caller to render a banner instead, which is the presentation the
 * backend's _rejection_payload() explicitly refuses to enable.
 */
export function selectStepRejections(state, stepId) {
  const error = selectStepError(state, stepId)
  const rejections = error?.rejections
  if (!Array.isArray(rejections)) return {}
  const byFeature = {}
  for (const rejection of rejections) byFeature[rejection.feature_id] = rejection
  return byFeature
}

export const selectRejectionFor = (state, stepId, featureId) =>
  selectStepRejections(state, stepId)[featureId] ?? null

export const selectJob = (state, jobId) => state.jobs[jobId] ?? null

/**
 * The one job this store is currently tracking for a step, if any.
 *
 * THERE IS AT MOST ONE, and JOB_SUBMITTED is what makes that true: it drops
 * any entry already carrying this step's id before adding the new one. This
 * `find` is therefore reading a table with one candidate in it rather than
 * picking a winner out of several -- which it could not do correctly anyway,
 * since insertion order would hand it the OLDEST.
 */
export function selectJobForStep(state, stepId) {
  return Object.values(state.jobs).find((job) => job.stepId === stepId) ?? null
}

export const selectIsGenerating = (state, stepId) =>
  selectJobForStep(state, stepId)?.status === JOB_RUNNING

/**
 * A failed generate's `failed_layer {type, label}`, or null.
 *
 * BRANCH ON `type`, DISPLAY `label` -- the panel already does exactly this
 * against api.py's older endpoint, and the shape is deliberately identical so
 * that code does not fork when it moves onto the session path.
 */
export function selectFailedLayer(state, stepId) {
  const job = selectJobForStep(state, stepId)
  if (job?.status !== JOB_FAILED) return null
  return job.error?.failed_layer ?? null
}

/**
 * A failed generate's `no_candidate {input, value}` plus the server's prose,
 * or null: the generate RAN, over real data, and the input it ran on produced
 * nothing to keep.
 *
 * THE SECOND KIND OF FAILED GENERATE, AND IT IS READ THE SAME WAY THE FIRST
 * IS -- off a key the payload CARRIES. `failed_layer` means a source did not
 * answer: the input is untouched, still holds its slot server-side, and a
 * retry is worth offering. `no_candidate` means the input itself is the
 * answer: step_orchestrator.py did not record it, its slot is free, and a
 * retry from the same value returns the same nothing.
 *
 * NEITHER IS INFERRED FROM THE OTHER'S ABSENCE. The two keys are mutually
 * exclusive and the backend sends exactly one, so a third failure kind added
 * later reads as neither rather than being silently sorted into whichever
 * branch was written as the default. A client that had branched on "no
 * failed_layer" would tell a user their access point routes nothing on the
 * day a new upstream error appeared.
 *
 * CARRIES THE SERVER'S OWN SENTENCE. What produced nothing is the step's
 * fact -- an access point that routes no road -- and the step declares that
 * prose beside the predicate that fires it (step_registry Accumulation.
 * empty_error). A sentence composed here would be the shell knowing which
 * step it is rendering.
 */
export function selectNoCandidate(state, stepId) {
  const job = selectJobForStep(state, stepId)
  if (job?.status !== JOB_FAILED) return null
  const noCandidate = job.error?.no_candidate
  if (!noCandidate) return null
  return {
    input: noCandidate.input ?? null,
    value: noCandidate.value ?? null,
    message: job.error?.error ?? null,
  }
}

/* ---------------------------------------------------------------------------
   Session id persistence
   ---------------------------------------------------------------------------
   URL first, then localStorage. The URL wins because a pasted or bookmarked
   link is an explicit instruction about WHICH session to open, and
   localStorage is only ever a guess about which one you were last in -- so a
   link opened in a browser that already holds a session must not silently show
   the wrong one.
   --------------------------------------------------------------------------- */

export const SESSION_QUERY_PARAM = 'session'
export const SESSION_STORAGE_KEY = 'keyline.sessionId'

// Every access is guarded: localStorage throws outright in a Safari private
// window and is absent in a non-DOM test environment, and neither is a reason
// for the app not to start.
function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readSessionIdFromUrl() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(SESSION_QUERY_PARAM) || null
}

export function readStoredSessionId() {
  try {
    return safeStorage()?.getItem(SESSION_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function initialSessionId() {
  return readSessionIdFromUrl() ?? readStoredSessionId()
}

export function persistSessionId(sessionId) {
  try {
    safeStorage()?.setItem(SESSION_STORAGE_KEY, sessionId)
  } catch {
    /* private mode: the URL is still the durable handle */
  }
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href)
    url.searchParams.set(SESSION_QUERY_PARAM, sessionId)
    // replaceState, not pushState: opening a session is not a navigation the
    // back button should have to step through.
    window.history.replaceState({}, '', url)
  }
}

export function forgetSessionId() {
  try {
    safeStorage()?.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* nothing to forget */
  }
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href)
    url.searchParams.delete(SESSION_QUERY_PARAM)
    window.history.replaceState({}, '', url)
  }
}

/* ---------------------------------------------------------------------------
   Assembling a commit body
   --------------------------------------------------------------------------- */

/**
 * THERE IS NO DEFAULT READER ANY MORE, AND THE DELETED ONE IS THE WHOLE
 * ARGUMENT FOR THAT.
 *
 * `defaultProposalFeatures(payload)` read `payload.suggested_zones` and stood
 * here as the provider's fallback. Its own note called itself a seam --
 * "per-step payload knowledge belongs in the step definitions, not here. The
 * provider takes this as a prop so F2 can hand it the registry's answer" --
 * and for two branches nothing handed it one, so every commit in the app read
 * landform's collection. Water's proposals are under `survey_zones`, so a full
 * water selection resolved to ZERO features and went out as a valid request:
 * `min_features` is 0, the server answered 200, and the user's decision was
 * replaced by the opposite decision with nothing anywhere reporting a problem.
 *
 * That was fixed by wiring the prop in App.jsx -- and the default stayed, which
 * left the fix one forgotten prop from being undone. Seven of the nine mounts
 * in this repo were taking it. A default that is WRONG for every step but one
 * is not a fallback, it is a guess with a plausible shape, and the failure it
 * produces is silent by construction.
 *
 * SO THE PROP IS REQUIRED AND ITS ABSENCE THROWS. Loudly, at mount, rather
 * than as a warning: a warning is the same silence in a different colour, and
 * this exact class of bug has now cost three separate failures precisely
 * because nothing raised.
 */
function requireProposalFeatures(proposalFeatures, caller) {
  if (typeof proposalFeatures !== 'function') {
    throw new Error(
      `${caller} needs a \`proposalFeatures\` reader and was given ` +
        `${proposalFeatures === undefined ? 'nothing' : typeof proposalFeatures}. ` +
        'It says which collection inside a step\'s layers payload holds the features ' +
        'a commit may carry, and it cannot be guessed: an unrecognised payload reads ' +
        'as no features, which is a LEGAL empty commit rather than an error. ' +
        'Pass stepDefinitions\' registryProposalFeatures.'
    )
  }
  return proposalFeatures
}

/**
 * The {features, provenance} a commit sends, from the mirror and the draft.
 *
 * NOTHING IS COMPUTED HERE. The selected half is server-produced Feature
 * objects picked out of the proposals by id; the drawn half is what the user
 * drew, which is the one thing this client is allowed to author. Assembling a
 * request body out of those two is not derivation -- no geometry is created,
 * intersected or measured on the way past.
 *
 * THE SELECTION COVERS EVERY FEATURE IN THE DRAFT, NOT ONLY THE PROPOSALS,
 * and that is this branch's one change here.
 *
 * It used to send every drawn feature unconditionally: a drawn shape committed
 * BY EXISTING, and the only way to leave one out was to delete it. That was
 * true while the panel column offered a suggestion "deselect" and a drawn zone
 * "delete" as two different verbs. The tab strip offers one verb to both -- a
 * box that says whether a feature is in the commit -- and a box that a drawn
 * zone could not answer would be a control that does nothing on half the tabs
 * it appears on.
 *
 * NO NEW STATE, AND NO INVERSION. `selectedFeatureIds` is still the set of
 * things that commit, still seeded full because the payload IS the
 * recommendation, and still unambiguous when empty for the reason DRAFT_SEEDED
 * gives. What changed is that a drawn feature joins it the moment it is drawn
 * (DRAFT_SHAPE_ADDED) and on every seed (DRAFT_SEEDED), so "in the draft" and
 * "in the commit" stop being the same statement for shapes the user authored.
 */
/**
 * `inputs`, WHEN THE CALLER SUPPLIES THEM, ARE SENT EXACTLY AS GIVEN -- an
 * empty list included. The gap this closes: this used to send `inputs` only
 * when the draft's map was non-empty, so a lost input left the key OFF the
 * body rather than erroring, and the server read an absent decision. A step
 * that declares inputs now assembles them from its declarations
 * (stepDefinitions' commitInputsFor, which refuses a missing required one
 * before this is reached) and hands them in here; the draft's own map is the
 * fallback for a caller that did not, which is what every step without
 * declared inputs still is.
 */
export function buildCommitBody(state, stepId, proposalFeatures, { inputs } = {}) {
  requireProposalFeatures(proposalFeatures, 'buildCommitBody')
  const draft = selectDraft(state, stepId)
  const selectedIds = new Set(draft.selectedFeatureIds)
  // THE STEP'S ID GOES WITH ITS PAYLOAD. The reader used to be handed the
  // payload alone and had to work out whose it was by looking at which
  // collection keys were in it -- an identification made at a call site that
  // already had the identity. See registryProposalFeatures.
  const candidates = proposalFeatures(selectStepProposals(state, stepId), stepId)

  const features = []
  const provenance = {}
  for (const feature of candidates) {
    if (!selectedIds.has(feature.id)) continue
    features.push(feature)
    provenance[feature.id] = PROVENANCE_GENERATED
  }
  for (const feature of draft.drawnFeatures) {
    if (!selectedIds.has(feature.id)) continue
    features.push(feature)
    provenance[feature.id] = PROVENANCE_USER_ADDED
  }

  return {
    features: { type: 'FeatureCollection', features },
    provenance,
    baseRevision: selectBaseRevision(state, stepId),
    inputs:
      inputs !== undefined
        ? inputs
        : Object.keys(draft.inputs).length
          ? draft.inputs
          : undefined,
  }
}

/* ---------------------------------------------------------------------------
   Provider
   --------------------------------------------------------------------------- */

const SessionContext = createContext(null)

export function SessionProvider({ children, proposalFeatures, autoResume = true }) {
  // BEFORE THE FIRST HOOK, so the throw is a mount that did not happen rather
  // than a provider that half exists. See requireProposalFeatures for why the
  // absence is an error and not a default.
  requireProposalFeatures(proposalFeatures, 'SessionProvider')

  const [state, dispatch] = useReducer(reducer, initialState)

  // One AbortController per in-flight generate, keyed by step. A ref rather
  // than state: aborting is a side effect on a request, and putting it in
  // state would re-render every consumer for something none of them display.
  const generationsRef = useRef(new Map())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // THE COMPONENT UNMOUNTING MID-POLL. Every outstanding poll is aborted,
      // which stops the fetch AND the sleep between fetches (see jobs.js) --
      // otherwise a backoff already at five seconds would fire one more
      // request and dispatch into an unmounted tree.
      for (const entry of generationsRef.current.values()) entry.controller.abort()
      generationsRef.current.clear()
    }
  }, [])

  const dispatchIfMounted = useCallback((action) => {
    if (mountedRef.current) dispatch(action)
  }, [])

  /**
   * Every failure from the wire, sorted onto its own path exactly once.
   *
   * THE 409 SPLIT LIVES HERE AND NOWHERE ELSE, and it is a split by TYPE --
   * apiClient.js already decided which 409 this is, by whether the body
   * carried a document. Nothing in this file compares a status code.
   */
  const handleFailure = useCallback(
    (error, stepId) => {
      if (error?.name === 'AbortError') return 'aborted'

      if (error instanceof RevisionConflictError) {
        // ONE RECONCILIATION, SHARED BY EVERY STEP. Hydrate what the server
        // handed us -- which applies whatever cascade the winning commit
        // caused -- keep the draft (hydrate() drops it only if the step was
        // reset outright), and leave a conflict marker for the re-prompt. No
        // step has its own version of this, and none should.
        dispatchIfMounted({ type: DOCUMENT_HYDRATED, document: error.document })
        dispatchIfMounted({
          type: STEP_ERROR_SET,
          stepId: error.stepId ?? stepId,
          error: {
            kind: 'conflict',
            message: error.message,
            expectedBaseRevision: error.expectedBaseRevision,
            receivedBaseRevision: error.receivedBaseRevision,
          },
        })
        return 'conflict'
      }

      if (error instanceof CommitRejectedError) {
        // PER FEATURE, all the way through. The rejections are carried intact
        // so the map can highlight the offending features and print the
        // server's own reason on each; nothing here collapses them.
        dispatchIfMounted({
          type: STEP_ERROR_SET,
          stepId,
          error: { kind: 'rejected', message: error.message, rejections: error.rejections },
        })
        return 'rejected'
      }

      if (error instanceof StepStateError) {
        // The other 409: upstream not committed, a schema this build cannot
        // read, a reopen of a step that was never committed. NOT a conflict to
        // reconcile -- there is nothing to rebase onto, and retrying sends the
        // same request into the same state. Surfaced, and it stops there.
        dispatchIfMounted({
          type: STEP_ERROR_SET,
          stepId: error.stepId ?? stepId,
          error: {
            kind: 'step_state',
            message: error.message,
            upstreamStep: error.upstreamStep,
            upstreamStatus: error.upstreamStatus,
            stepStatus: error.stepStatus,
          },
        })
        return 'step_state'
      }

      if (error instanceof NotFoundError) {
        // The session is gone underneath us. Same treatment as a stale
        // bookmark, for the same reason: there is nothing here to fix.
        forgetSessionId()
        dispatchIfMounted({ type: RESUME_ABSENT })
        return 'absent'
      }

      /**
       * EVERYTHING ELSE: the request did not land. A transport failure, or a
       * status this surface has no typed class for -- which is what a hard
       * upstream failure arrives as.
       *
       * `failedLayer` IS CARRIED WHEN THE BODY HAS ONE. A data source that
       * did not answer puts {type, label} on the error body, and that pair is
       * the only part of such a failure a user can act on: which source, and
       * therefore whether waiting will help. It rode in the response, the api
       * client now keeps it (see the note there), and this is where it stops
       * being the api client's and becomes state the chrome can read. `?? null`
       * because most failures have no layer -- an absent one is a real answer
       * and the chrome has copy for it.
       *
       * THE MESSAGE IS STILL RECORDED AND IS NOT WHAT GETS RENDERED. It can be
       * the api client's `Request failed (500).` fallback, which is a status
       * code, and a status code in front of someone looking at their own field
       * is noise they cannot act on. See InstructionBar's dataSourceNotice().
       */
      const failedLayer = error?.body?.failed_layer ?? null
      if (stepId) {
        dispatchIfMounted({
          type: STEP_ERROR_SET,
          stepId,
          error: { kind: 'network', message: error.message, failedLayer },
        })
      } else {
        dispatchIfMounted({
          type: SESSION_ERROR_SET,
          error: { kind: 'network', message: error.message, failedLayer },
        })
      }
      return 'error'
    },
    [dispatchIfMounted]
  )

  const hydrateDocument = useCallback(
    (document) => {
      dispatchIfMounted({ type: DOCUMENT_HYDRATED, document })
      if (document?.session_id) persistSessionId(document.session_id)
    },
    [dispatchIfMounted]
  )

  /**
   * RESUME. `GET /api/sessions/{id}` -> hydrate. Nothing else -- no step
   * probing, no speculative layers fetch: the document alone says where the
   * wizard is, which is the whole reason it carries every step's status.
   *
   * A 404 IS NOT A FAILURE STATE. A stale bookmark or a session the server has
   * since discarded clears the stored id and starts fresh, with no error for
   * the user to dismiss -- there is no action they could take on it.
   */
  const resume = useCallback(
    async (sessionId) => {
      dispatchIfMounted({ type: RESUME_STARTED })
      try {
        hydrateDocument(await apiGetSession(sessionId))
        return true
      } catch (error) {
        if (error instanceof NotFoundError) {
          forgetSessionId()
          dispatchIfMounted({ type: RESUME_ABSENT })
          return false
        }
        handleFailure(error, null)
        return false
      }
    },
    [dispatchIfMounted, handleFailure, hydrateDocument]
  )

  useEffect(() => {
    if (!autoResume) return
    const sessionId = initialSessionId()
    if (sessionId) resume(sessionId)
    // Once, on mount. A change of `resume`'s identity is not a reason to
    // re-fetch a session already in the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume])

  const startSession = useCallback(
    async (points) => {
      try {
        hydrateDocument(await apiCreateSession(points))
        return true
      } catch (error) {
        handleFailure(error, null)
        return false
      }
    },
    [handleFailure, hydrateDocument]
  )

  const loadLayers = useCallback(
    async (stepId) => {
      const sessionId = state.sessionId
      if (!sessionId) return false
      try {
        const payload = await apiGetStepLayers(sessionId, stepId)
        dispatchIfMounted({ type: STEP_PROPOSALS_LOADED, stepId, payload })
        return payload
      } catch (error) {
        handleFailure(error, stepId)
        return false
      }
    },
    [state.sessionId, dispatchIfMounted, handleFailure]
  )

  /**
   * A finished generate landed. BOTH HALVES OF ITS RESULT GO IN, and neither
   * is invented here.
   *
   * The job's `done` result is {payload, document} -- the step's proposals and
   * the document the generate moved to `generated`
   * (step_orchestrator.run_generate_job). Rule 1 is satisfied the same way it
   * always was: the status is written by hydrating a SERVER document. What is
   * gone is the round trip. This used to GET /api/sessions/{id} immediately
   * after every generate for the sole purpose of reading back a status the
   * server had just told the job about, and that fetch was the standing
   * argument for patching the status locally instead -- one line, no request,
   * and the first crack in rule 1. The argument is gone with the fetch.
   *
   * PAYLOAD FIRST, THEN THE DOCUMENT, and the order is load-bearing rather
   * than cosmetic: proposalsSurvive() keeps a step's proposals across a
   * hydration only when the incoming entry is `generated` at the revision they
   * were fetched against, so landing them before the document that says
   * `generated` is what lets them survive it. The reverse order works too and
   * is one more dispatch; this order is the one proposalsSurvive() documents.
   *
   * A RESULT WITH NO DOCUMENT IS A CONTRACT BREACH, not a case to fall back
   * from. Silently re-fetching would hide a backend too old to send it behind
   * an extra request per generate, which is the exact cost this change exists
   * to remove; and skipping the hydration would leave a mirror saying
   * `not_started` over proposals that exist. Same posture as stepOrderFrom():
   * say so, loudly.
   */
  const onGenerated = useCallback(
    (stepId, result) => {
      if (result?.document == null) {
        throw new DocumentContractError(
          "A generate job's result carried no 'document'. The store hydrates " +
            'the step status from the job result rather than re-reading the ' +
            'session; see step_orchestrator.run_generate_job().'
        )
      }
      dispatchIfMounted({ type: STEP_PROPOSALS_LOADED, stepId, payload: result.payload })
      hydrateDocument(result.document)
    },
    [dispatchIfMounted, hydrateDocument]
  )

  /**
   * Generate a step. Resolves when the job reaches a terminal state: WITH THE
   * PAYLOAD when the job produced one (truthy, and the same object the store
   * just landed), false otherwise. The payload rather than `true` because a
   * caller that awaited this is still holding the render from before the
   * request -- a step whose generate accumulates (roads) wants to look at the
   * candidate this call added, and the store's dispatch has not re-rendered
   * anyone by the time the promise resolves.
   *
   * A SECOND GENERATE WHILE ONE IS RUNNING supersedes the first: the previous
   * poll is aborted and its job dropped from the store, so `selectJobForStep`
   * has one answer rather than a race between two. The superseded job keeps
   * running in the backend's pool and that is harmless -- generate is
   * idempotent and network-free, and whatever it writes is reachable through
   * GET .../layers by whoever asks next.
   */
  const generate = useCallback(
    async (stepId, params) => {
      const sessionId = state.sessionId
      if (!sessionId) return false

      const previous = generationsRef.current.get(stepId)
      if (previous) {
        previous.controller.abort()
        dispatchIfMounted({ type: JOB_FORGOTTEN, jobId: previous.jobId })
      }
      const controller = new AbortController()
      const entry = { controller, jobId: null }
      generationsRef.current.set(stepId, entry)

      dispatchIfMounted({ type: STEP_ERROR_CLEARED, stepId })
      // BEFORE THE FIRST AWAIT, which is the whole point of it: the step is
      // generating from the moment it is asked to, not from the moment the
      // server agrees. See the JOB_STARTED case.
      dispatchIfMounted({ type: JOB_STARTED, stepId })

      try {
        const terminal = await runGeneration(sessionId, stepId, params, {
          signal: controller.signal,
          onSubmit: (accepted) => {
            entry.jobId = accepted.job_id
            dispatchIfMounted({ type: JOB_SUBMITTED, jobId: accepted.job_id, stepId })
          },
          onUpdate: (snapshot) => dispatchIfMounted({ type: JOB_OBSERVED, snapshot }),
        })

        if (terminal.status === JOB_DONE) {
          onGenerated(stepId, terminal.result)
          return terminal.result.payload ?? true
        }
        if (terminal.status === JOB_EVICTED) {
          // The runner no longer holds the id -- it may well have finished and
          // written its proposals before being evicted. Ask layers, which
          // serves the identical payload, rather than reporting a failure that
          // may not have happened or regenerating work that is already done.
          return await loadLayers(stepId)
        }
        // JOB_FAILED: already in the store via JOB_OBSERVED, carrying the
        // step's failed_layer -- or its no_candidate. Not an exception --
        // see jobs.js.
        //
        // AN INPUT THE SERVER DID NOT KEEP IS DROPPED FROM THE DRAFT TOO,
        // and this is the whole of the client's half of that contract. The
        // generate ran and the input produced nothing, so the server did not
        // record it and no slot was spent; the draft is the only place it
        // still exists, as the pending value the map draws a marker for. Left
        // there it would be a marker for a decision the session does not hold
        // -- and the next generate would send it again unchanged.
        //
        // BY THE NAME THE PAYLOAD CARRIES, never a name known here. The
        // server says WHICH input produced nothing (`no_candidate.input`),
        // which is what keeps this store from having to know that roads
        // collects an access point -- the same reason `failed_layer` carries
        // its own type rather than being looked up per step.
        //
        // A `failed_layer` failure clears NOTHING, deliberately: nothing is
        // wrong with the input, the server still holds its slot, and the
        // retry the panel offers has to have something to retry with.
        const noCandidate = terminal.error?.no_candidate
        if (noCandidate?.input) {
          dispatchIfMounted({
            type: DRAFT_INPUT_SET,
            stepId,
            key: noCandidate.input,
            value: undefined,
          })
        }
        return false
      } catch (error) {
        handleFailure(error, stepId)
        return false
      } finally {
        // ONLY THE GENERATION THAT STILL OWNS THE STEP CLEANS UP AFTER IT.
        //
        // THE PLACEHOLDER MUST NOT OUTLIVE THE ATTEMPT: JOB_SUBMITTED
        // replaced it on every path where an id was issued, and this clears
        // the paths where none ever was -- the POST threw, the transport
        // failed, the caller aborted -- because on those the step is not
        // generating and must not look as though it is.
        //
        // BUT A SUPERSEDED GENERATE MUST NOT CLEAR ITS SUCCESSOR'S. The
        // placeholder is keyed by STEP, so a second press overwrites the
        // first one's; the first then aborts and its `finally` runs AFTER
        // that overwrite. Clearing unconditionally there would delete the
        // live generation's entry and put the flash straight back, for the
        // window until the second POST answers. The ref already names the
        // owner -- the second press replaced it -- so the same check that
        // decides whether to forget the ref decides this.
        if (generationsRef.current.get(stepId) === entry) {
          generationsRef.current.delete(stepId)
          dispatchIfMounted({ type: JOB_FORGOTTEN, jobId: `pending:${stepId}` })
        }
      }
    },
    [state.sessionId, dispatchIfMounted, handleFailure, loadLayers, onGenerated]
  )

  /**
   * Commit the step's draft. Returns 'committed' | 'conflict' | 'rejected' |
   * 'step_state' | 'error' | 'aborted' -- the caller re-prompts on 'conflict'
   * and highlights features on 'rejected'.
   */
  const commit = useCallback(
    async (stepId, { inputs } = {}) => {
      const sessionId = state.sessionId
      if (!sessionId) return 'error'
      const body = buildCommitBody(state, stepId, proposalFeatures, { inputs })
      try {
        const document = await apiCommitStep(sessionId, stepId, body)
        // WHOLESALE, cascade and all -- then the draft goes, explicitly,
        // because it is now recorded in the document that just arrived.
        hydrateDocument(document)
        dispatchIfMounted({ type: DRAFT_DISCARDED, stepId })
        return 'committed'
      } catch (error) {
        return handleFailure(error, stepId)
      }
    },
    [state, proposalFeatures, dispatchIfMounted, handleFailure, hydrateDocument]
  )

  const reopen = useCallback(
    async (stepId) => {
      const sessionId = state.sessionId
      if (!sessionId) return false
      try {
        // The document comes back with the cascade already applied; hydrating
        // it wholesale IS the cascade handling. The editable proposals then
        // come from layers, the same call a plain resume makes.
        hydrateDocument(await apiReopenStep(sessionId, stepId))
        return await loadLayers(stepId)
      } catch (error) {
        handleFailure(error, stepId)
        return false
      }
    },
    [state.sessionId, handleFailure, hydrateDocument, loadLayers]
  )

  /**
   * DISCARD ONE CANDIDATE SET of an accumulating step -- the roads step's
   * networks. A SERVER VERB: the tried inputs are recorded on the document,
   * so freeing a slot is a document write the server makes, hydrated here
   * wholesale like every other; the remaining candidates then come back
   * through layers, the same call a reopen makes. Nothing is dropped
   * client-side first: a candidate the server still holds would come back on
   * the next fetch, and a candidate it refused to drop is still there.
   */
  const discardCandidate = useCallback(
    async (stepId, params) => {
      const sessionId = state.sessionId
      if (!sessionId) return false
      try {
        hydrateDocument(await apiDiscardCandidate(sessionId, stepId, params))
        return await loadLayers(stepId)
      } catch (error) {
        handleFailure(error, stepId)
        return false
      }
    },
    [state.sessionId, handleFailure, hydrateDocument, loadLayers]
  )

  const actions = useMemo(
    () => ({
      startSession,
      resume,
      generate,
      commit,
      reopen,
      discardCandidate,
      loadLayers,
      seedDraft: (stepId, selectedFeatureIds, drawnFeatures) =>
        dispatch({ type: DRAFT_SEEDED, stepId, selectedFeatureIds, drawnFeatures }),
      // `featureIds` is the new list, or a function of the current one. See
      // the reducer's DRAFT_SELECTION_SET for which to pass and why.
      setSelection: (stepId, featureIds) =>
        dispatch({ type: DRAFT_SELECTION_SET, stepId, featureIds }),
      toggleSelection: (stepId, featureId) =>
        dispatch({ type: DRAFT_SELECTION_TOGGLED, stepId, featureId }),
      addDrawnFeature: (stepId, feature) => dispatch({ type: DRAFT_SHAPE_ADDED, stepId, feature }),
      removeDrawnFeature: (stepId, featureId) =>
        dispatch({ type: DRAFT_SHAPE_REMOVED, stepId, featureId }),
      setDraftInput: (stepId, key, value) => dispatch({ type: DRAFT_INPUT_SET, stepId, key, value }),
      discardDraft: (stepId) => dispatch({ type: DRAFT_DISCARDED, stepId }),
      clearStepError: (stepId) => dispatch({ type: STEP_ERROR_CLEARED, stepId }),
      clearSession: () => {
        forgetSessionId()
        dispatch({ type: SESSION_CLEARED, resume: 'idle' })
      },
    }),
    [startSession, resume, generate, commit, reopen, discardCandidate, loadLayers]
  )

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (value === null) {
    throw new Error('useSession must be used inside a <SessionProvider>.')
  }
  return value
}

/**
 * Read one thing through a selector.
 *
 * The selector is the contract; this hook exists so a component never has to
 * name `state` at all, which is what keeps "components never reach into the
 * raw shape" enforceable rather than merely stated.
 */
export function useSessionSelector(selector, ...args) {
  const { state } = useSession()
  return selector(state, ...args)
}
