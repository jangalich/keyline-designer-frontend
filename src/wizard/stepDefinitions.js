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
 *   shape              null, or {live(context), close(context)}. HOW THIS
 *                      STEP READS A SHAPE THE USER DRAWS -- what it clamps it
 *                      to, what it warns about, and what Feature it becomes.
 *                      Null means the generic behaviour: the ring as drawn,
 *                      unclamped, uncautioned. See LANDFORM_SHAPE.
 *
 *                      IT IS THE STEP'S BECAUSE THE GEOMETRY IS. Clamping to
 *                      the parcel and clipping against exclusion gates are
 *                      readings of THIS step's payload against THIS step's
 *                      rules; a copy of them in DrawGesture, applied to every
 *                      step's drawing on a guess at when they apply, is
 *                      exactly what F3 declined to write.
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
 *   2. `kind: 'polygon'` DOES NOT SAY HOW IT IS DRAWN. Eligibility is not
 *      drawn as a polygon at all, and neither is the ground outside the
 *      parcel. Hence `kind: 'scrim'` and `kind: 'highlight'`, and `kind:
 *      'ring'` for a boundary, which is a bare ring of points in a draft
 *      input rather than a FeatureCollection.
 *
 *      F2 AND F3 HAD ONE KIND HERE, `mask`, whose renderer dimmed the
 *      COMPLEMENT of the eligible union inside the parcel. It is two kinds
 *      now because the shipped production-zone step draws two separate marks
 *      -- a dim OUTSIDE the parcel and a tint ON the eligible ground -- with
 *      a blur on the second and none on the first, so they cannot share a
 *      pane, and one is derived from the committed boundary while the other
 *      comes off the payload, so they cannot share a source. See layers.jsx's
 *      HighlightLayer for why the shipped step draws the eligible side.
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
 *   kind     'ring' | 'polygon' | 'scrim' | 'highlight' | 'reference'. What
 *            the geometry is, and therefore how it is drawn and which gesture
 *            can edit it. `reference` is the one value that says it is not
 *            drawn at all -- see LAYER_KINDS.
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
import { cautionsFor, clampToBoundary } from '../zoneGeometry.js'
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

/**
 * What a layer's geometry IS, and therefore how it is drawn -- except for
 * `reference`, which is the one value that says it is NOT drawn.
 *
 * `reference` RESOLVES F3'S SECOND FINDING. `exclusion_layers` was declared in
 * F2 as `{kind: 'polygon', source: 'proposals', key: 'exclusion_layers'}` and
 * then withdrawn from the declarations entirely, because the value under that
 * key is not a polygon, a geometry or a FeatureCollection: it is five per-gate
 * wrappers, `{type, label, data_available, geometry_wgs84}`, with the geometry
 * nested a level down. Declaring it as a polygon would have meant the stack
 * learning that one particular key hides its geometry under `geometry_wgs84`,
 * which is step knowledge in the one file that must have none.
 *
 * But the data is REAL and it is CONSUMED: zoneGeometry.js's cautionsFor()
 * clips a drawn shape against those five gates, and the panel reads
 * `data_available` for its standing caveat. It is data the tools eat and
 * nothing paints, and neither `polygon` nor `mask` can say that -- both name a
 * treatment, and every treatment implies a mark.
 *
 * So `reference` is a kind that says exactly what is true of it: resolved off
 * the payload like any other layer, carried to whoever declared a tool over
 * it, and rendered by nothing. The stack still knows nothing about
 * `exclusion_layers` -- it knows that a reference layer is not drawn.
 */
export const LAYER_KINDS = Object.freeze([
  'ring',
  'polygon',
  'scrim',
  'highlight',
  'reference',
])

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
      // A STRING OR A FUNCTION OF THE CONTEXT. Most steps' commit button says
      // one thing; a step whose commit can mean two different things has to be
      // able to say which. See LANDFORM_STEP's, and StepPanel's commitLabel.
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
    shape = null,
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
    shape: shape && Object.freeze({ ...shape }),
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
 * `exclusion_layers` IS DECLARED, AS A `reference` LAYER, and that closes F3's
 * second finding.
 *
 * F2 declared it as {kind: 'polygon'} and F3 withdrew the declaration entirely
 * rather than lie about its shape: the value under that key is not a polygon,
 * a geometry or a FeatureCollection but five per-gate wrappers, `{type, label,
 * data_available, geometry_wgs84}`, with the geometry nested a level down. F3
 * asked for "a kind that describes its actual shape", and the honest
 * description turned out to be not about shape at all: it is DATA THE TOOLS
 * CONSUME AND NOTHING DRAWS. zoneGeometry.js's cautionsFor() clips a drawn
 * shape against all five; the panel reads `data_available` for its standing
 * caveat; no branch of this app has ever painted one, and drawing five
 * overlays at once would say five things where the highlight already says the
 * one that matters. `kind: 'reference'` says exactly that, and the stack
 * still learns nothing about `exclusion_layers` -- only that a reference layer
 * is not drawn. See LAYER_KINDS.
 *
 * THE TWO CONTEXT MARKS ARE TWO LAYERS, not one. The off-parcel scrim is
 * derived from the committed boundary and carries no blur; the eligible
 * highlight comes off the payload and is feathered by App.css. Different
 * source, different filter, therefore different pane, therefore different
 * declaration -- see LAYER_KINDS' note 2.
 */
/** The layer id landform reads its exclusion gates off. Its own declaration's. */
export const LANDFORM_EXCLUSIONS_LAYER = 'landform-exclusions'

/**
 * The layer name the backend's landform commit contract requires, verbatim.
 * step_registry's LANDFORM entry declares `layer="production_area_candidate"`
 * (wire_translation.LAYER_PRODUCTION_AREA) and refuses a feature carrying any
 * other; feature_schema.py refuses one carrying none at all.
 */
export const PRODUCTION_AREA_LAYER = 'production_area_candidate'

/**
 * HOW LANDFORM READS A SHAPE THE USER DREW.
 *
 * THE BOUNDARY IS THE ONLY HARD GATE, and clamping to it happens HERE, before
 * the shape reaches the draft -- exactly as the spike clamped before commit.
 * Not the eligible union: clamping to eligible ground would make the caution
 * system unreachable, because a user could never draw across hydric soil to be
 * warned about it. The rule is that gates encoding physical impossibility
 * apply and gates rejecting weak candidates do not -- off-parcel is not their
 * land, while canopy, hydric, slope, roads and setback are all conditions of
 * ground they own and may commit to knowingly. commit_validation.py takes the
 * same posture on the server and says so at length.
 *
 * THE CAUTIONS TRAVEL WITH THE FEATURE. Computed once, when the ring closes,
 * and written onto `properties.cautions` -- so the panel's list and the map's
 * markers read one value rather than recomputing a clip each render, and a
 * deleted shape takes its markers with it because they were never anywhere
 * else.
 *
 * THE FOUR PROPERTIES ARE THE SCHEMA'S, NOT DECORATION. feature_schema.py
 * refuses a feature missing `layer`, `confidence` or a non-empty
 * `confidence_notes`, and the commit contract refuses a `layer` that is not
 * production_area_candidate. `confidence: 'low'` with a note saying it was
 * drawn by hand is the honest value for a shape with no survey behind it, and
 * it is what the backend's own drawn-zone fixtures carry.
 */
export const LANDFORM_SHAPE = Object.freeze({
  live: ({ points, parcel, references }) => {
    if (points.length < 3) return []
    const { multi } = clampToBoundary(points, parcel)
    return cautionsFor(multi, references[LANDFORM_EXCLUSIONS_LAYER] ?? [])
  },

  close: ({ points, parcel, references }) => {
    if (points.length < 3) return null
    const { multi, acres, removedAcres } = clampToBoundary(points, parcel)
    // The whole ring fell outside the parcel. Nothing to add, and a notice
    // rather than a silently discarded gesture.
    if (!multi.length) {
      return {
        feature: null,
        notice: 'That zone fell entirely outside the property boundary and was not added.',
      }
    }

    const cautions = cautionsFor(multi, references[LANDFORM_EXCLUSIONS_LAYER] ?? [])
    return {
      feature: {
        type: 'Feature',
        // Local to the draft and never sent as an identity the server keeps:
        // the commit path allocates the internal id (see the LANDFORM entry's
        // `internal_id_parameter`). Unique per shape so React, the store and a
        // 422's feature_id all address the same one.
        id: `drawn-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        geometry: { type: 'MultiPolygon', coordinates: multi },
        properties: {
          layer: PRODUCTION_AREA_LAYER,
          label: 'Drawn zone',
          confidence: 'low',
          confidence_notes: 'Drawn by hand on the map; no survey backs it.',
          acres,
          cautions,
        },
      },
      // Said only when the clamp actually took something. A notice on every
      // drawn zone would train the user to ignore the one that matters.
      notice:
        removedAcres > 0
          ? `${removedAcres.toFixed(1)} acres outside the property boundary were trimmed off.`
          : null,
    }
  },
})

export const LANDFORM_STEP = documentStep({
  id: 'landform',
  title: 'Landform',
  blurb: 'Production zones on the ground the parcel can actually support.',
  layers: [
    // Bottom of the context band: everything AROUND the parcel, dimmed. The
    // one hard gate in this interface and the only mark that reads as
    // forbidden.
    { id: 'landform-offparcel', band: 'context', kind: 'scrim', source: 'document' },
    // Then the eligible ground, tinted. `eligible_union` names what cleared
    // every gate.
    {
      id: 'landform-eligible',
      band: 'context',
      kind: 'highlight',
      source: 'proposals',
      key: 'eligible_union',
    },
    // The five per-gate footprints. Consumed by the draw tool's clamping and
    // cautions, and by the panel's caveat; painted by nothing. See the note
    // above.
    {
      id: 'landform-exclusions',
      band: 'context',
      kind: 'reference',
      source: 'proposals',
      key: 'exclusion_layers',
    },
    { id: 'landform-suggested', band: 'editable', kind: 'polygon', source: 'proposals', key: 'suggested_zones' },
    { id: 'landform-drawn', band: 'editable', kind: 'polygon', source: 'draft' },
    { id: 'landform-committed', band: 'committed', kind: 'polygon', source: 'document' },
  ],
  tools: ['select', 'draw', 'delete'],
  // None. The backend's landform entry declares no user_inputs, so any params
  // at all is a 400 -- see step_orchestrator.validate_params().
  inputs: [],
  generate: { label: 'Generate production zones' },
  commit: {
    /**
     * AN EMPTY COMMIT IS LEGAL AND DELIBERATE, AND THE BUTTON SAYS SO.
     *
     * "No production ground on this parcel" is a DECISION -- the backend's
     * commit contract sets `min_features=0` for exactly this reason, and the
     * steps downstream must receive it as an answer rather than as an
     * absence. So the commit is never blocked here.
     *
     * But it must never be a SILENT empty submit either. A button reading
     * "Commit these zones" over an empty selection is a user one click away
     * from recording a decision they did not know they were making, so the
     * button renames itself and states the decision instead. That is the
     * whole of the affordance: same action, same place, different sentence.
     */
    label: ({ committableCount }) =>
      committableCount === 0 ? 'Commit no zones for this step' : 'Commit these zones',
    canCommit: () => true,
    blockedReason: () => null,
  },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen landform?' },
  proposalCollection: 'suggested_zones',
  shape: LANDFORM_SHAPE,
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
