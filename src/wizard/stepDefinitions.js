/**
 * stepDefinitions.js
 *
 * THE STEP SCHEMA, and the two definitions this branch registers.
 *
 * interactive-design-frontend-architecture.md section 2.2 asks for the wizard
 * to be declarative: a step says what it is made of, and the wizard runs it.
 * The test of that is not a taste question -- it is whether adding water is
 * ONE OBJECT IN THIS FILE and no edit anywhere else. Every field below exists
 * because useStepMachine.js or WizardShell.jsx would otherwise have had to
 * ask "which step is this".
 *
 * THE SCHEMA
 *
 *   id                 The step id. For a document-backed step this is the
 *                      backend's own step id -- the one in `step_order`, the
 *                      one in the URLs, the key in `document.steps`. There is
 *                      no second naming scheme.
 *
 *   title              What the panel header says.
 *   blurb              One line under it, for a step in its opening state.
 *
 *   layers             The map layers this step contributes, as
 *                      {id, band, kind, source, key?}. DATA ONLY: nothing
 *                      here renders a map. See THE LAYER SCHEMA below -- it
 *                      grew two fields when the stack was actually built,
 *                      because {id, kind, source} could not be composed
 *                      without the stack knowing which step it was looking
 *                      at, and that is the schema failing rather than the
 *                      stack's problem to absorb.
 *
 *   tools              The tools armed while this step is being edited, from
 *                      SessionStore's STEP_MODES vocabulary: 'select',
 *                      'draw', 'delete'. THREE VERBS, NOT FOUR -- there is no
 *                      'adjust'. A drawn shape is deleted and redrawn (see
 *                      DRAFT_SHAPE_REMOVED); the doc still describes a vertex
 *                      editor that does not exist.
 *
 *   inputs             The step's declared user inputs, [{key, label, kind,
 *                      required}]. These are the step's own -- the access
 *                      point is an input of ROADS, not a global field, and
 *                      the boundary ring is an input of BOUNDARY. They are
 *                      what the commit sends as `inputs` (or, for boundary,
 *                      what its commit is made of).
 *
 *   generate           null, or {label, params(draft)}. NULL IS A REAL VALUE
 *                      and it is how boundary differs from every other step,
 *                      declared rather than branched on: the machine has no
 *                      `generating` state to enter for a step whose
 *                      definition names no generate.
 *
 *   commit             {label, run(actions, context), canCommit(context),
 *                      blockedReason(context)}. `run` resolves to one of the
 *                      store's commit outcomes ('committed' | 'conflict' |
 *                      'rejected' | 'step_state' | 'error' | 'aborted'), so
 *                      the machine reads one vocabulary whether the request
 *                      underneath was POST /api/sessions or
 *                      POST .../steps/{id}/commit.
 *
 *   reopen             null, or {label, confirmTitle}. Null means committed
 *                      is final for this step -- again declared, not branched.
 *
 *   status(state)      Where this step's status lives. Document-backed steps
 *                      read the mirror; boundary reads whether a session
 *                      exists. THE MACHINE NEVER READS A STATUS DIRECTLY.
 *
 *   reachable(state)   Is the step's upstream done. Document-backed steps
 *                      delegate to F1's selectIsStepReachable.
 *
 *   blockedBy(state)   Which step is in the way when it is not reachable, so
 *                      the panel can say so instead of offering a generate
 *                      that would 409.
 *
 *   proposalFeatures   The FeatureCollection inside this step's layers
 *     (payload)        payload. The store already names this seam
 *                      (defaultProposalFeatures) and takes it as a prop; the
 *                      registry is what fills it in.
 *
 *   Panel              The step's own body, rendered inside the shared frame.
 *                      Everything generic -- the state, the buttons, the
 *                      errors, the collapse -- belongs to the frame, and a
 *                      Panel that starts reproducing those is the schema
 *                      failing.
 *
 * THE LAYER SCHEMA, and why it is five fields rather than three
 *
 * F2 declared layers as {id, kind, source, key?} with `kind: 'polygon'` on
 * every one of them. Composing the stack out of that turned out to be
 * impossible without step knowledge, in three separate places, and each is
 * recorded here rather than fixed inside the stack:
 *
 *   1. `source: 'proposals'` DOES NOT SAY WHICH BAND. landform's
 *      `eligible_union` is read-only context and its `suggested_zones` are
 *      the step's editable, selectable candidates -- same source, opposite
 *      tiers. The stack would have had to know that 'eligible_union' means
 *      context, which is a table of step ids by another name. Hence `band`.
 *
 *   2. `kind: 'polygon'` DOES NOT SAY HOW IT IS DRAWN. The eligibility mask
 *      is not drawn as a polygon at all: what the user needs to see is where
 *      drawing is NOT allowed, so the geometry names the eligible ground and
 *      the stack dims its complement. Hence `kind: 'mask'`, and `kind:
 *      'ring'` for a boundary, which is a bare ring of points in a draft
 *      input rather than a FeatureCollection.
 *
 *   3. `source: 'draft'` DOES NOT SAY WHERE IN THE DRAFT. A draft holds
 *      `drawnFeatures` AND `inputs`, and the boundary's ring is an input
 *      while landform's zones are drawn features. `key` answers it: present
 *      means "this key inside the source", absent means the source's own
 *      default collection.
 *
 *   band     'context' | 'committed' | 'editable'. The fixed z-order the
 *            stack composes: basemap, context, committed, editable. It is a
 *            property of the LAYER, not of the step -- landform declares one
 *            of each -- which is why it cannot be derived from `source`.
 *
 *   kind     'ring' | 'polygon' | 'mask'. What the geometry is, and therefore
 *            how it is drawn and which gesture can edit it.
 *
 *   source   'proposals' | 'draft' | 'document'. Which of the three places a
 *            step's geometry can come from.
 *
 *   key      Optional. Within `proposals`, the payload key. Within `draft`,
 *            the input key (absent = `drawnFeatures`). Unused for `document`.
 *
 * ONE LAYER F2 DECLARED IS NOT DECLARED HERE, and it is reported rather than
 * absorbed: see LANDFORM_STEP's `exclusion_layers` note.
 *
 * WHAT IS NOT IN HERE. No step registers water, roads, trees, structures or
 * fencing: those are later branches, and a definition written now against a
 * payload nobody has seen would be a guess dressed as a contract. The order
 * they run in is not here either -- it comes off the document's `step_order`
 * (see wizardStepOrder), because the backend owns it.
 */

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  selectIsStepReachable,
  selectSessionId,
  selectStepOrder,
  selectStepStatus,
} from '../session/SessionStore'
import BoundaryPanel from './panels/BoundaryPanel.jsx'
import LandformPanel from './panels/LandformPanel.jsx'

/** The boundary step's id. It is not a backend step id -- see BOUNDARY_STEP. */
export const BOUNDARY_STEP_ID = 'boundary'

/** The key the boundary's drawn ring is held under, in its draft's inputs. */
export const BOUNDARY_RING_INPUT = 'ring'

/* ---------------------------------------------------------------------------
   The layer vocabulary. Closed, and enforced at definition time.
   ---------------------------------------------------------------------------
   Every value the stack branches on lives in one of these three lists, so a
   layer the stack could not place fails HERE -- naming the step, the layer and
   the field -- rather than rendering as nothing on a map and being found by
   someone wondering where their zones went.
   --------------------------------------------------------------------------- */

/** The fixed z-order, bottom to top. The basemap is band 0 and is not a step's. */
export const LAYER_BANDS = Object.freeze(['context', 'committed', 'editable'])

/** What a layer's geometry IS, and therefore how it is drawn. */
export const LAYER_KINDS = Object.freeze(['ring', 'polygon', 'mask'])

/** The three places a step's geometry can come from. */
export const LAYER_SOURCES = Object.freeze(['proposals', 'draft', 'document'])

/**
 * Normalise and check one layer declaration.
 *
 * THE CHECK IS THE POINT. The stack is written to know nothing about steps, so
 * every question it asks of a layer has to be answerable from the declaration
 * alone. A missing or unknown `band`/`kind`/`source` is the declaration
 * failing, and it says so here rather than being guessed at down there.
 */
function defineLayer(stepId, layer) {
  const { id, band, kind, source, key = null } = layer

  if (!id) throw new Error(`Step '${stepId}' declares a layer with no id.`)
  for (const [field, value, allowed] of [
    ['band', band, LAYER_BANDS],
    ['kind', kind, LAYER_KINDS],
    ['source', source, LAYER_SOURCES],
  ]) {
    if (!allowed.includes(value)) {
      throw new Error(
        `Step '${stepId}' layer '${id}' declares ${field}='${value}'. ` +
          `The stack places a layer by its declaration alone, so ${field} has ` +
          `to be one of: ${allowed.join(', ')}.`
      )
    }
  }

  return Object.freeze({ id, band, kind, source, key })
}

/**
 * A step backed by an entry in the Design Document -- landform, and every
 * step after it.
 *
 * THE FACTORY IS THE POINT. Everything a document-backed step does the same
 * way as every other document-backed step is filled in here, so the object
 * that adds water is the handful of fields that are actually water's. The
 * fields remain overridable: this is a default, not a base class, and a step
 * that genuinely differs says so in its own object rather than by the wizard
 * learning about it.
 */
export function documentStep({
  id,
  title,
  blurb = '',
  layers = [],
  tools = ['select', 'draw', 'delete'],
  inputs = [],
  generate = { label: 'Generate proposals' },
  commit,
  reopen = { label: 'Edit this step' },
  proposalCollection = 'suggested_zones',
  Panel,
  ...rest
}) {
  return defineStep({
    id,
    title,
    blurb,
    layers,
    tools,
    inputs,
    generate:
      generate === null
        ? null
        : {
            label: generate.label ?? 'Generate proposals',
            // The step's declared inputs, off the draft, and nothing else. A
            // step declaring none sends no params at all -- the backend 400s
            // on any params against a step with no user_inputs, and `{}` is
            // params (see apiClient.generateStep).
            params: generate.params ?? ((draft) => paramsFromInputs(inputs, draft)),
          },
    commit: {
      label: commit?.label ?? 'Commit this step',
      run: commit?.run ?? ((actions, { stepId }) => actions.commit(stepId)),
      canCommit: commit?.canCommit ?? ((context) => context.committableCount > 0),
      blockedReason:
        commit?.blockedReason ??
        ((context) =>
          context.committableCount > 0
            ? null
            : 'Select at least one proposal, or draw one, before committing.'),
    },
    reopen,
    // THE MIRROR, THROUGH F1'S SELECTOR. Not `document.steps[id].status` read
    // directly: the store is the one place that knows a step the document has
    // never carried reads as `not_started`.
    status: (state) => selectStepStatus(state, id),
    reachable: (state) => selectIsStepReachable(state, id),
    blockedBy: (state) => firstUncommittedUpstream(state, id),
    proposalFeatures: (payload) => {
      const collection = payload?.[proposalCollection]
      return Array.isArray(collection?.features) ? collection.features : []
    },
    proposalCollection,
    Panel,
    ...rest,
  })
}

/**
 * The upstream step standing in this one's way, or null.
 *
 * OFF `step_order`, LIKE EVERYTHING ELSE. The first upstream step that is not
 * committed is the one the user has to go back to, and naming it is the
 * difference between a panel that explains itself and a disabled button.
 */
function firstUncommittedUpstream(state, stepId) {
  const order = selectStepOrder(state)
  const index = order.indexOf(stepId)
  if (index < 0) return null
  for (const upstreamId of order.slice(0, index)) {
    if (selectStepStatus(state, upstreamId) !== COMMITTED) return upstreamId
  }
  return null
}

/** The declared inputs a generate sends, or null when the step declares none. */
export function paramsFromInputs(inputs, draft) {
  if (!inputs.length) return null
  const params = {}
  for (const input of inputs) {
    const value = draft?.inputs?.[input.key]
    if (value !== undefined) params[input.key] = value
  }
  return Object.keys(params).length ? params : null
}

/**
 * Normalise and freeze one definition. Every field the machine reads has a
 * value here, so the machine never writes `definition.x ?? somethingGeneric`
 * -- a default that lives at the call site is a default the next step has to
 * rediscover.
 */
export function defineStep(definition) {
  const {
    id,
    title = id,
    blurb = '',
    layers = [],
    tools = [],
    inputs = [],
    generate = null,
    commit,
    reopen = null,
    status,
    reachable = () => true,
    blockedBy = () => null,
    proposalFeatures = () => [],
    proposalCollection = null,
    committedNote = null,
    Panel = null,
  } = definition

  if (!id) throw new Error('A step definition needs an id.')
  if (typeof status !== 'function') {
    throw new Error(`Step '${id}' must say where its status comes from.`)
  }
  if (typeof commit?.run !== 'function') {
    throw new Error(`Step '${id}' must say how it commits.`)
  }

  return Object.freeze({
    id,
    title,
    blurb,
    layers: Object.freeze(layers.map((layer) => defineLayer(id, layer))),
    tools: Object.freeze([...tools]),
    inputs: Object.freeze(inputs.map((input) => Object.freeze({ ...input }))),
    generate: generate && Object.freeze({ ...generate }),
    commit: Object.freeze({ ...commit }),
    reopen: reopen && Object.freeze({ ...reopen }),
    status,
    reachable,
    blockedBy,
    proposalFeatures,
    proposalCollection,
    committedNote,
    Panel,
  })
}

/* ===========================================================================
   BOUNDARY -- step 0
   =========================================================================== */

/**
 * The property boundary, AS A STEP.
 *
 * It was a pre-step: you drew a shape and then the wizard began. Making it
 * step 0 is not presentation. The same three things are true of it as of every
 * other step -- it has an editable layer, it has a commit, and everything
 * after it is unreachable until that commit lands -- and while it sat outside
 * the wizard each of those had to be re-implemented as app state (App.jsx's
 * `points` / `isDrawing` / `isFinished` are exactly that, and the file says so
 * about itself).
 *
 * THREE THINGS ARE GENUINELY DIFFERENT, AND ALL THREE ARE DECLARED:
 *
 *   generate: null   There is nothing to propose. A boundary is drawn, not
 *                    computed, so the machine's `generating` state is simply
 *                    unreachable here -- which is what a null generate means,
 *                    and is why the machine needs no `if (stepId ===
 *                    'boundary')` to avoid offering one.
 *
 *   commit           POST /api/sessions, not POST .../steps/boundary/commit.
 *                    The step's commit is what CREATES the resource the other
 *                    steps commit into. `run` still resolves to the same
 *                    outcome vocabulary, so the machine cannot tell.
 *
 *   status           There is no `document.steps.boundary` and there should
 *                    not be: the boundary is not a step the backend runs, it
 *                    is the session's own identity. A session exists <=> the
 *                    boundary is committed, which is a fact the store already
 *                    holds.
 *
 * reopen: null, DELIBERATELY. Every other committed step gets an "Edit this
 * step" affordance; this one does not, because reopening it is not an edit --
 * the boundary is the parcel every committed step's geometry was computed
 * against, and changing it invalidates the session rather than cascading
 * within it. The honest affordance is "start a new session", which is a
 * different action with a different warning, and it is not this branch's.
 * Declaring the absence beats offering a button that would have to explain
 * itself away.
 */
export const BOUNDARY_STEP = defineStep({
  id: BOUNDARY_STEP_ID,
  title: 'Property boundary',
  blurb: 'Trace the property outline. Everything after this is measured against it.',
  // TWO DECLARATIONS OF ONE RING, because the ring MOVES on commit and the
  // two halves of that are drawn differently. Before the commit it is the
  // step's editable layer, held in the draft under the input below. After it,
  // the session's document carries it and it is settled, read-only context
  // for every step that follows -- which is what `band: 'committed'` says.
  // Only one of the two ever resolves to anything: selectBoundaryRing is one
  // value, not two.
  layers: [
    {
      id: 'boundary-ring',
      band: 'editable',
      kind: 'ring',
      source: 'draft',
      key: BOUNDARY_RING_INPUT,
    },
    { id: 'boundary-committed', band: 'committed', kind: 'ring', source: 'document' },
  ],
  // Draw it, or delete it and draw it again. There is nothing to select --
  // the server proposes nothing here -- and no vertex editing anywhere in
  // this app.
  tools: ['draw', 'delete'],
  inputs: [
    {
      key: BOUNDARY_RING_INPUT,
      label: 'Boundary ring',
      kind: 'ring',
      required: true,
    },
  ],
  generate: null,
  commit: {
    label: 'Use this boundary',
    run: async (actions, { draft }) => {
      const ring = draft?.inputs?.[BOUNDARY_RING_INPUT]
      const created = await actions.startSession(ring)
      // The store's startSession reports a boolean; every other step's commit
      // reports an outcome string. Translated HERE, in the definition that
      // knows which call it made, so the machine reads one vocabulary.
      return created ? 'committed' : 'error'
    },
    canCommit: ({ draft }) => ringOf(draft).length >= 3,
    blockedReason: ({ draft }) =>
      ringOf(draft).length >= 3 ? null : 'Place at least three points to close the boundary.',
  },
  reopen: null,
  committedNote:
    'The boundary is fixed for the life of this session — every committed step was ' +
    'measured against it. Starting a different property means starting a new session.',
  status: (state) => (selectSessionId(state) ? COMMITTED : NOT_STARTED),
  // Nothing upstream. Not `selectIsStepReachable`, which answers off
  // `step_order` and would report false for an id that is legitimately not in
  // it -- the wrong answer for the one step that is always available.
  reachable: () => true,
  Panel: BoundaryPanel,
})

/** The boundary ring held in a draft, always an array. */
export function ringOf(draft) {
  const ring = draft?.inputs?.[BOUNDARY_RING_INPUT]
  return Array.isArray(ring) ? ring : []
}

/* ===========================================================================
   LANDFORM
   =========================================================================== */

/**
 * Production zones. THE FIRST DOCUMENT-BACKED STEP, and the shape every later
 * one copies.
 *
 * `exclusion_layers` IS NOT DECLARED AS A LAYER, AND THAT IS A REPORT.
 *
 * F2 declared it as {kind: 'polygon', source: 'proposals', key:
 * 'exclusion_layers'}, and the value under that key is not a polygon, a
 * geometry or a FeatureCollection: it is a list of five per-gate wrappers,
 * `{type, label, data_available, geometry_wgs84}`
 * (production_zone_payload.build_production_zone_payload). Rendering it from
 * that declaration would mean the stack learning that one particular key
 * holds objects whose geometry hides under `geometry_wgs84` -- step knowledge
 * in the one file that must have none.
 *
 * It also has no treatment yet. ProductionZoneLayers deliberately draws none
 * of the five: the eligible union is the only exclusion-derived thing drawn at
 * rest, and five overlays at once would say five things where the mask already
 * says the one that matters. So the honest state is "declared nowhere", and
 * F4 -- which owns the per-gate visual language and the panel's caveats --
 * brings it back with a kind that describes its actual shape.
 *
 * Its panel is a PLACEHOLDER on purpose. App.jsx's production-zone spike is
 * still the working UI for these zones and still calls /api/production-zones;
 * migrating it -- the scored table, the caution markers, the clamping, the
 * hatch pattern -- is F4's whole branch. What exists here is the definition,
 * so that the machine, the shell and the tests have a real document-backed
 * step to run rather than a fixture invented for them.
 */
export const LANDFORM_STEP = documentStep({
  id: 'landform',
  title: 'Landform',
  blurb: 'Production zones on the ground the parcel can actually support.',
  layers: [
    // The eligibility mask, drawn as the INELIGIBLE-AREA DIM. The payload's
    // `eligible_union` names the ground that passed every gate; what the user
    // needs before they start drawing is where they may NOT, so the stack
    // dims its complement inside the parcel. That inversion is the whole of
    // what `kind: 'mask'` means, and it is declared rather than discovered by
    // the stack recognising a key name.
    { id: 'landform-ineligible', band: 'context', kind: 'mask', source: 'proposals', key: 'eligible_union' },
    { id: 'landform-suggested', band: 'editable', kind: 'polygon', source: 'proposals', key: 'suggested_zones' },
    { id: 'landform-drawn', band: 'editable', kind: 'polygon', source: 'draft' },
    { id: 'landform-committed', band: 'committed', kind: 'polygon', source: 'document' },
  ],
  tools: ['select', 'draw', 'delete'],
  // None. The backend's landform entry declares no user_inputs, so any params
  // at all is a 400 -- see step_orchestrator.validate_params().
  inputs: [],
  generate: { label: 'Generate production zones' },
  commit: { label: 'Commit these zones' },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen landform?' },
  proposalCollection: 'suggested_zones',
  Panel: LandformPanel,
})

/* ===========================================================================
   The registry, and the order steps run in
   =========================================================================== */

/** Every definition this build registers, keyed by id. */
export const STEP_DEFINITIONS = Object.freeze([BOUNDARY_STEP, LANDFORM_STEP])

export function definitionMap(definitions = STEP_DEFINITIONS) {
  const map = new Map()
  for (const definition of definitions) map.set(definition.id, definition)
  return map
}

/**
 * The wizard's step order: boundary, then the document's own.
 *
 * FROM `step_order`, NEVER FROM `Object.keys(document.steps)` -- the store's
 * stepOrderFrom() is the one reader of that field and this builds on its
 * answer. Flask serialises the steps object alphabetically (fencing, landform,
 * roads, structures, trees, water), so reading the keys would give six real
 * step ids in a stable, wrong order and nothing would throw.
 *
 * BEFORE A SESSION EXISTS THIS IS JUST ['boundary'], and that is the honest
 * answer rather than a gap. The client does not know the pipeline's steps
 * until a document tells it -- keeping a hardcoded list here so the wizard
 * could show a fuller table of contents up front would be the second copy of
 * STEP_ORDER that both sides of this codebase refuse to keep.
 */
export function wizardStepOrder(state) {
  return [BOUNDARY_STEP_ID, ...selectStepOrder(state)]
}

export { COMMITTED, GENERATED, NOT_STARTED }
