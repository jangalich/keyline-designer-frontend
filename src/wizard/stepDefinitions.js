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
 *   instructions       THE CHROME'S FIRST HALF: one sentence PER MACHINE STATE,
 *                      {[state]: string}. What the instruction bar says while
 *                      this step is in that state.
 *
 *   buttons            THE CHROME'S SECOND HALF: what the action banner offers
 *                      PER MACHINE STATE, {[state]: [button]}. At most two --
 *                      the forward move and the step's tool or escape -- AND
 *                      A PAIR IS NOT ASSUMED: landform's editing state offers
 *                      one button and boundary's offers two, so the value is a
 *                      list whose length the step chooses. An empty list is a
 *                      real answer (nothing to offer while a request is in
 *                      flight), and so is a missing key.
 *
 *                      See stepButton() for what one is, and COMMIT_BUTTON /
 *                      GENERATE_BUTTON / REOPEN_BUTTON for the three every
 *                      step can reuse without restating the machine.
 *
 *   notices(context)   The step's own STEP-LEVEL notices for the instruction
 *                      bar: [{key, tone, text}]. Not errors -- the shell reads
 *                      those off the machine for every step alike. This is
 *                      what only THIS step can know is worth saying about the
 *                      decision in hand, and landform's 80% ceiling advisory
 *                      is the whole of the current use.
 *
 *   tabs(context)      One tab per feature this step is carrying, as
 *                      [{id, name, rows: [{value, label}], selected?, drawn?}].
 *                      `rows` is the acreage chip's treatment generalised: a
 *                      right-aligned monospace value and a left-aligned label,
 *                      one per row.
 *
 *                      IT IS THE STEP'S BECAUSE THE FIGURES ARE. A boundary
 *                      counts points and encloses acres; a landform zone has
 *                      acres and a score. No reading of a Feature reaches
 *                      either, so a generic strip would have had to learn
 *                      which step it was drawing.
 *
 *   Panel              RESERVED, and filled by nothing in this branch. It was
 *                      the step's body inside the panel column, and the panel
 *                      column is gone -- the detail panel that replaces it is
 *                      the next branch's. The field stays because that is the
 *                      seam it will re-enter through.
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
  selectBoundaryRing,
  selectSessionId,
  selectStepsHoldingWork,
  selectStepOrder,
  selectStepStatus,
} from '../session/SessionStore'
import { polygonAreaAcres } from '../geo.js'
import { cautionsFor, clampToBoundary } from '../zoneGeometry.js'
import {
  COMMITTING,
  EDITING,
  GENERATING,
  IDLE,
  MACHINE_STATES,
  REVIEWING,
  STEP_COMMITTED,
} from './useStepMachine'

/**
 * Decimal places every measured figure in this app is printed to.
 *
 * MIRRORS THE PIPELINE'S OWN ROUNDING BOUNDARY, it does not invent one:
 * production_area_ceiling._round1() puts every acreage, score, factor and
 * slope figure in a step payload at one decimal place before it is serialised.
 *
 * Printing them back at that same fixed width is what makes a column of them
 * align, and it has to be done explicitly. JSON has no decimal type, so a
 * score the backend rounded to 100.0 is parsed by JavaScript as the number 100
 * and renders as "100" -- one character narrower than "62.5", with no decimal
 * point to line up.
 */
export const MEASURE_DP = 1

/**
 * A measured value at fixed width, or an em dash where the pipeline sent null.
 * null means "not known" throughout this contract and must never be printed as
 * a 0.0 that reads as a measurement.
 */
export function measure(value) {
  return value == null ? '—' : Number(value).toFixed(MEASURE_DP)
}

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

/* ---------------------------------------------------------------------------
   THE ACTION BANNER'S VOCABULARY
   ---------------------------------------------------------------------------
   A button is a value, not a component. The banner renders whatever the
   cursor step declares for the state it is in, and knows nothing else about
   it -- which is the only way six steps share one banner.

   WHAT A BUTTON IS HANDED. One object, the CHROME CONTEXT, assembled by the
   shell:

     machine   everything useStepMachine returns for this step -- the commit,
               the generate, the reopen request, the labels, the predicates.
     arm       arm one of the step's declared tools.
     disarm    put the arming register back to empty.
     armed     which tool is live, or null.
     advance   move the wizard on to the next uncommitted step.

   Nothing in that list names a step, and nothing in it is a store internal.
   --------------------------------------------------------------------------- */

/**
 * Declare one button.
 *
 *   key       Stable, and the banner's testid is `${key}-${stepId}`. It is the
 *             button's identity across states, so the same commit rendered in
 *             two states is one addressable thing.
 *   label     A string, or a function of the chrome context for a button whose
 *             words depend on what it would do (see COMMIT_BUTTON).
 *   tone      'primary' for the forward move, 'secondary' for the tool or the
 *             escape. Presentation only.
 *   run       What pressing it does. May be async; the banner awaits it.
 *   enabled   Whether it may be pressed. Defaults to always.
 *   blocked   The title text on a disabled button -- why not, in a sentence.
 *   confirm   null, or {title, body(chrome), yes, no}. A button that names
 *             what it costs before it acts. The REOPEN path does not use this:
 *             its confirmation is the machine's own, because the cost it has
 *             to name (which downstream steps hold work) is the store's
 *             answer rather than a sentence a definition can write.
 */
export function stepButton({
  key,
  label,
  tone = 'secondary',
  run,
  enabled = () => true,
  blocked = () => null,
  confirm = null,
}) {
  if (!key) throw new Error('A step button needs a key.')
  if (typeof run !== 'function') throw new Error(`Step button '${key}' needs a run().`)
  return Object.freeze({
    key,
    tone,
    label: typeof label === 'function' ? label : () => label,
    run,
    enabled,
    blocked,
    confirm: confirm && Object.freeze({ ...confirm }),
  })
}

/**
 * THE COMMIT, AND THE AUTO-ADVANCE THAT FOLLOWS IT.
 *
 * There is no "Next step" button anywhere in this shell, and there is not
 * meant to be: a commit that succeeded has finished the step, and asking the
 * user to confirm that in a second click is a question with one answer. So the
 * forward move is the commit's own tail -- and it is HERE rather than in the
 * machine because moving the cursor is the shell's business, not the
 * document's.
 *
 * IT ADVANCES ONLY ON 'committed'. Every other outcome -- a 409, a 422, a
 * step-state refusal, a thrown request -- leaves the user on the step whose
 * commit did not land, with the reason in the instruction bar. Advancing off a
 * failed commit would hide the failure behind a step change.
 *
 * The label is the DEFINITION'S, through the machine, so landform's empty
 * commit still renames itself rather than recording a decision unnamed.
 */
export const COMMIT_BUTTON = stepButton({
  key: 'commit',
  tone: 'primary',
  label: ({ machine }) => machine.commitLabel,
  enabled: ({ machine }) => machine.canCommit,
  blocked: ({ machine }) => machine.commitBlockedReason,
  run: async ({ machine, disarm, advance }) => {
    // A tool still armed over a step the user has just left is a live map
    // listener with no owner. Disarming first is the same rule the cursor
    // enforces on a move, applied one moment earlier.
    disarm()
    const outcome = await machine.commit()
    if (outcome === 'committed') advance()
    return outcome
  },
})

/** The generate, for a step whose definition declares one. */
export const GENERATE_BUTTON = stepButton({
  key: 'generate',
  tone: 'primary',
  label: ({ machine }) => machine.definition.generate?.label ?? 'Generate',
  enabled: ({ machine }) => machine.canGenerate,
  run: ({ machine }) => machine.generate(),
})

/**
 * The reopen, for a step whose definition declares one.
 *
 * `key: 'edit'` because that is what the affordance has always been called on
 * the wire of this app's tests and in `reopen.label`. It only REQUESTS the
 * reopen: the confirmation that names what a reopen discards is the machine's,
 * and the shell renders it.
 */
export const REOPEN_BUTTON = stepButton({
  key: 'edit',
  tone: 'primary',
  label: ({ machine }) => machine.definition.reopen?.label ?? 'Edit this step',
  enabled: ({ machine }) => machine.canReopen,
  run: ({ machine }) => machine.requestReopen(),
})

/** Arm one of the step's declared tools, under whatever name the step gives it. */
export function armButton({ key, label, tool, tone = 'secondary', enabled }) {
  return stepButton({
    key,
    label,
    tone,
    enabled,
    run: ({ arm }) => arm(tool),
  })
}

/** Put the register back to empty. What "finish", "done" and "cancel" all are. */
export function disarmButton({ key, label, tone = 'secondary', enabled, run }) {
  return stepButton({
    key,
    label,
    tone,
    enabled,
    run: run ?? (({ disarm }) => disarm()),
  })
}

/**
 * Normalise and check one step's chrome.
 *
 * THE KEYS ARE MACHINE STATES AND THE CHECK IS THAT THEY ARE. A typo'd state
 * name is a silent blank bar and an empty banner on whichever state it was
 * meant to cover -- the one failure mode that looks exactly like "this step
 * has nothing to say here", which is a legitimate answer. So it fails at
 * definition time, naming the step and the key.
 */
function defineChrome(stepId, field, entries, check) {
  const out = {}
  for (const [state, value] of Object.entries(entries ?? {})) {
    if (!MACHINE_STATES.includes(state)) {
      throw new Error(
        `Step '${stepId}' declares ${field} for '${state}', which is not a machine ` +
          `state. The bar and the banner are keyed by state, so it has to be one ` +
          `of: ${MACHINE_STATES.join(', ')}.`
      )
    }
    out[state] = check(state, value)
  }
  return Object.freeze(out)
}

/** At most two, and a pair is never assumed -- see the schema note on `buttons`. */
const MAX_BUTTONS_PER_STATE = 2

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
    instructions = {},
    buttons = {},
    notices = () => [],
    tabs = () => [],
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
    instructions: defineChrome(id, 'an instruction', instructions, (state, line) => {
      if (typeof line !== 'string' || !line.trim()) {
        throw new Error(`Step '${id}' declares an empty instruction for '${state}'.`)
      }
      return line
    }),
    buttons: defineChrome(id, 'buttons', buttons, (state, list) => {
      if (!Array.isArray(list)) {
        throw new Error(
          `Step '${id}' declares buttons for '${state}' that are not a list. The ` +
            `banner renders a list precisely so a state can offer one button, or none.`
        )
      }
      if (list.length > MAX_BUTTONS_PER_STATE) {
        throw new Error(
          `Step '${id}' declares ${list.length} buttons for '${state}'. The banner ` +
            `holds at most ${MAX_BUTTONS_PER_STATE}: the forward move, and the step's ` +
            `tool or escape.`
        )
      }
      for (const button of list) {
        if (typeof button?.run !== 'function') {
          throw new Error(`Step '${id}' declares a '${state}' button with no run().`)
        }
      }
      return Object.freeze([...list])
    }),
    notices,
    tabs,
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
/**
 * What a committed boundary says, in the one place it is said.
 *
 * The instruction bar and `committedNote` are the same sentence to the same
 * reader; two copies of it would drift the first time one is edited.
 */
export const BOUNDARY_COMMITTED_NOTE =
  'The boundary is fixed for the life of this session — every committed step was ' +
  'measured against it. Starting a different property means starting a new session.'

/** Start placing points. */
const BOUNDARY_DRAW = armButton({
  key: 'draw',
  tool: 'draw',
  tone: 'primary',
  label: 'Draw the Boundary',
})

/**
 * Take the last point back.
 *
 * WRITES THE DRAFT DIRECTLY, because that is where the ring is: DrawTool puts
 * vertices into the step's declared input and this takes one out of the same
 * place. There is no undo stack anywhere in this app and this is not the
 * beginning of one -- a ring is a list, and its last element is removable
 * without a history.
 */
const BOUNDARY_UNDO = stepButton({
  key: 'undo',
  label: 'Undo Last Point',
  enabled: ({ machine }) => ringOf(machine.draft).length > 0,
  run: ({ machine }) => {
    const ring = ringOf(machine.draft)
    machine.actions.setDraftInput(machine.stepId, BOUNDARY_RING_INPUT, ring.slice(0, -1))
  },
})

/**
 * DISARMING IS FINISHING. There is no `isFinished` flag to set and never was
 * one worth keeping: a closed ring with nothing placing into it is what
 * finished means, and both the map and this chrome derive it from the register.
 */
const BOUNDARY_FINISH = disarmButton({
  key: 'finish',
  tone: 'primary',
  label: 'Finish Boundary',
  enabled: ({ machine }) => ringOf(machine.draft).length >= 3,
})

/**
 * Clear the ring AND arm the draw again, because the button says redraw.
 *
 * Clearing alone would leave the user in the reviewing state over an empty
 * ring, looking at "Check the shape before sending." with no shape and no way
 * back to placing points but the tool button that state does not offer. The
 * two halves of "redraw" are one press.
 */
const BOUNDARY_REDRAW = stepButton({
  key: 'redraw',
  label: 'Clear and Redraw',
  run: ({ machine, arm }) => {
    machine.actions.setDraftInput(machine.stepId, BOUNDARY_RING_INPUT, [])
    arm('draw')
  },
})

/**
 * A COMMITTED BOUNDARY IS NOT REDRAWN, IT IS ABANDONED, and the button names
 * that before it acts.
 *
 * Every committed step's geometry was measured against this parcel, so a
 * different parcel is a different SESSION rather than a cascade within one --
 * which is why BOUNDARY_STEP declares `reopen: null`. But "no button" is not
 * the honest answer for someone who wants a different property, so the action
 * exists and states its cost first. The cost is read from the store, so an
 * empty session says so rather than issuing an unqualified warning that trains
 * people to click through the one that will matter.
 */
const BOUNDARY_RESTART = stepButton({
  key: 'restart',
  label: 'Start a different property',
  confirm: {
    title: 'Start a different property?',
    body: ({ machine }) => {
      const holding = selectStepsHoldingWork(machine.context.state)
      return holding.length
        ? 'The boundary cannot be moved — every step was measured against it — so this ' +
            'ends the session and discards the work in ' +
            holding.join(', ') +
            '.'
        : 'The boundary cannot be moved — every step is measured against it — so this ' +
            'ends the session and starts a new one. No step holds work yet, so nothing ' +
            'else will be discarded.'
    },
    yes: 'End this session and start again',
    no: 'Keep this property',
  },
  // The store drops the document and every draft with it, which puts the
  // cursor back on the first uncommitted step.
  run: ({ machine }) => machine.actions.clearSession(),
})

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
    // THE BANNER'S WORDS ARE THE DEFINITION'S. The instruction above it
    // already says what is being sent ("Check the shape before sending."), so
    // the button names the act rather than restating the object.
    label: 'Commit',
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
  committedNote: BOUNDARY_COMMITTED_NOTE,
  status: (state) => (selectSessionId(state) ? COMMITTED : NOT_STARTED),
  // Nothing upstream. Not `selectIsStepReachable`, which answers off
  // `step_order` and would report false for an id that is legitimately not in
  // it -- the wrong answer for the one step that is always available.
  reachable: () => true,

  /* --- The boundary's chrome ---------------------------------------------
     TWO PAIRS, and they are the two halves of drawing a shape: placing points
     and looking at what you placed. The states are the machine's own -- see
     chromeState.js for the one rule that decides which of the two a boundary
     with three points down is in, and why it is the arming that decides it. */
  instructions: {
    [IDLE]: 'Trace the property outline. Everything after this is measured against it.',
    [EDITING]: 'Click to place each corner.',
    [REVIEWING]: 'Check the shape before sending.',
    [COMMITTING]: 'Creating the session…',
    // The committed boundary's line IS its committedNote: there is one thing
    // to say about a parcel that cannot be moved, and it is said once.
    [STEP_COMMITTED]: BOUNDARY_COMMITTED_NOTE,
  },
  buttons: {
    [IDLE]: [BOUNDARY_DRAW],
    [EDITING]: [BOUNDARY_UNDO, BOUNDARY_FINISH],
    [REVIEWING]: [BOUNDARY_REDRAW, COMMIT_BUTTON],
    [COMMITTING]: [],
    [STEP_COMMITTED]: [BOUNDARY_RESTART],
  },

  /**
   * ONE TAB, AND IT IS TODAY'S ACREAGE CHIP.
   *
   * The chip is gone from the map's top-left; this is where it went, unchanged
   * in what it says or how it is set. Read through selectBoundaryRing so the
   * tab is the same whether the ring is still in the draft or has moved into
   * the document -- the chip only ever existed for the drawing half, and the
   * committed half had no readout at all.
   */
  tabs: ({ state, stepId }) => {
    const ring = selectBoundaryRing(state, stepId, BOUNDARY_RING_INPUT)
    if (!ring.length) return []
    const rows = [{ value: String(ring.length), label: ring.length === 1 ? 'point' : 'points' }]
    // Below three points there is no enclosed shape, so there is no area to
    // state. Same threshold the chip used, for the same reason.
    if (ring.length >= 3) {
      rows.push({ value: polygonAreaAcres(ring).toFixed(MEASURE_DP), label: 'acres' })
    }
    return [{ id: BOUNDARY_RING_INPUT, name: 'Boundary', rows }]
  },
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

/* ---------------------------------------------------------------------------
   LANDFORM'S OWN READINGS -- what the panel column used to hold
   ---------------------------------------------------------------------------
   The zone list, the drawn list and the caution lines are the DETAIL PANEL's,
   and the detail panel's contents are the next branch's. What survives into
   this branch is what the chrome itself needs: the figures a tab prints, and
   the two things only this step can know are worth saying out loud.
   --------------------------------------------------------------------------- */

/**
 * Which checks did not run, in the terms someone standing on the land would
 * use -- never the layer's own name, and never "unavailable" on its own.
 *
 * Keyed on the payload's STABLE `type`, never on its `label`. The backend
 * splits those two fields precisely so a consumer branching on identity is not
 * broken by a copy edit to the display prose (see exclusion_zones._wire_
 * layers()), and the labels there describe the TEST ("wet (hydric) soil")
 * where this has to describe the CONSEQUENCE.
 */
const UNAVAILABLE_CONSEQUENCE = {
  hydric: 'Soil survey data was unavailable, so wet ground has not been excluded.',
  roads: 'Road data was unavailable, so existing farm roads have not been excluded.',
  canopy: 'Canopy data was unavailable, so wooded ground has not been excluded.',
  slope: 'Elevation data was unavailable, so steep ground has not been excluded.',
  setback: 'The boundary setback was not applied.',
}

/**
 * Past this share of the parcel, the chrome says so. ADVISORY ONLY, never
 * blocking: the 80% figure was always a design judgment about leaving room for
 * water, roads and trees, and having handed that judgment to the user -- the
 * same reasoning that made the parcel boundary the only hard gate -- taking it
 * back at the gate would be incoherent. It is the same number the backend's
 * own ceiling trims toward, named here so the two cannot drift apart silently.
 */
export const CEILING_ADVISORY_PCT = 80

/**
 * The band name for a score, read out of the payload's own `scales` object.
 *
 * NO THRESHOLD IS WRITTEN DOWN HERE. The backend ships `bands` and
 * `band_bounds` so the frontend does not have to know that 60-79 is "good",
 * and a copy of those numbers on this side is a second source of truth that
 * goes stale silently the first time the backend retunes them.
 *
 * `band_bounds` is honoured rather than assumed: the contract's value is
 * lower-inclusive / upper-exclusive with the last band closed at the top, so
 * a perfect 100 lands in the top band instead of falling out of every one.
 */
export function scoreBandName(score, scales) {
  if (score == null || !scales?.bands) return null

  const bands = Object.entries(scales.bands)
    .map(([name, [low, high]]) => ({ name, low, high }))
    .sort((a, b) => a.low - b.low)

  const lastBandClosed =
    scales.band_bounds === 'lower_inclusive_upper_exclusive_last_band_inclusive'

  for (let i = 0; i < bands.length; i++) {
    const { name, low, high } = bands[i]
    const isLast = i === bands.length - 1
    if (score < low) continue
    if (score < high) return name
    if (isLast && lastBandClosed && score <= high) return name
  }

  return null
}

/**
 * The running totals a commit would carry.
 *
 * NOT THE PAYLOAD'S OWN FIGURES. What is SELECTED changes as suggestions are
 * toggled and zones are drawn, so the numbers have to be recomputed from the
 * current selection rather than read off the recommendation the backend sent.
 * `eligible_acres` is the exception -- it describes the ground, not the choice.
 *
 * THE TOTALS CHIP IT WAS WRITTEN FOR IS GONE. What it is still for is the
 * ceiling advisory below, which is a reading of the same arithmetic and was
 * always the only part of that chip that said something the user had to act
 * on. Exported so the test can assert the arithmetic without a map.
 */
export function totalsFor(payload, selectedIds, drawnFeatures) {
  const rows = payload?.zones ?? []
  const parcelAcres = payload?.summary?.total_acres ?? 0

  const selectedAcres = rows
    .filter((zone) => selectedIds.has(zone.feature_id))
    .reduce((sum, zone) => sum + (zone.area_acres ?? 0), 0)
  const drawnAcres = drawnFeatures.reduce(
    (sum, feature) => sum + (feature.properties?.acres ?? 0),
    0
  )
  const total = selectedAcres + drawnAcres

  return {
    selectedAcres: total,
    pctOfParcel: parcelAcres > 0 ? (total / parcelAcres) * 100 : null,
    zoneCount: rows.filter((zone) => selectedIds.has(zone.feature_id)).length + drawnFeatures.length,
  }
}

/** Start drawing a zone of your own. */
const LANDFORM_DRAW = armButton({
  key: 'draw',
  tool: 'draw',
  label: 'Draw a Zone',
})

/**
 * ONE BUTTON, NOT A PAIR, and that is the case the schema exists to allow.
 *
 * A ring going down has no forward move to offer: it is finished by clicking
 * its first corner, on the map, where the gesture is. The only thing the
 * banner can usefully offer is the way out -- so it offers exactly that, and
 * the banner renders one button because the definition declared one.
 */
const LANDFORM_CANCEL = disarmButton({ key: 'cancel', label: 'Cancel' })

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
      committableCount === 0 ? 'Commit no zones for this step' : 'Commit Zones',
    canCommit: () => true,
    blockedReason: () => null,
  },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen landform?' },
  proposalCollection: 'suggested_zones',
  shape: LANDFORM_SHAPE,

  /* --- Landform's chrome -------------------------------------------------
     The same four states boundary uses, saying landform's own sentences. The
     shell reads the key; it never reads which step wrote it. */
  instructions: {
    [IDLE]: 'Production zones on the ground the parcel can actually support.',
    [GENERATING]: 'Reading the parcel — slope, soil, canopy, roads, and the setback…',
    [REVIEWING]: 'Click zones to select. Draw to add your own.',
    [EDITING]: 'Click to place each corner. Click the first corner to close.',
    [COMMITTING]: 'Saving these zones…',
    [STEP_COMMITTED]: 'These zones are committed. Every step after this is measured against them.',
  },
  buttons: {
    [IDLE]: [GENERATE_BUTTON],
    [GENERATING]: [],
    [REVIEWING]: [LANDFORM_DRAW, COMMIT_BUTTON],
    // ONE. See LANDFORM_CANCEL.
    [EDITING]: [LANDFORM_CANCEL],
    [COMMITTING]: [],
    [STEP_COMMITTED]: [REOPEN_BUTTON],
  },

  /**
   * THE TWO THINGS ONLY THIS STEP KNOWS ARE WORTH SAYING.
   *
   * 1. WHICH CHECKS DID NOT RUN. A standing line for the whole time this step
   *    is open, because it changes what the eligible highlight MEANS: ground
   *    that was never tested is drawn exactly like ground that passed.
   *
   * 2. THE 80% CEILING. It used to be printed under the totals chip, and the
   *    chip is gone; the advisory is not, because it is the only part of that
   *    block that asked the user to reconsider something. Advisory, never
   *    blocking -- see CEILING_ADVISORY_PCT.
   */
  notices: ({ proposals, draft }) => {
    if (!proposals) return []
    const lines = []

    for (const layer of proposals.exclusion_layers ?? []) {
      if (layer.data_available) continue
      lines.push({
        key: `unavailable-${layer.type}`,
        tone: 'caution',
        text:
          `${UNAVAILABLE_CONSEQUENCE[layer.type] ?? `${layer.label} was unavailable.`} ` +
          'Walk those areas before committing to them.',
      })
    }

    const totals = totalsFor(proposals, new Set(draft.selectedFeatureIds), draft.drawnFeatures)
    if (totals.pctOfParcel > CEILING_ADVISORY_PCT) {
      lines.push({
        key: 'ceiling',
        tone: 'advisory',
        text: 'Selecting this much leaves little room for water, roads, and trees.',
      })
    }

    return lines
  },

  /**
   * ONE TAB PER ZONE -- the payload's suggestions first, in the rank order it
   * shipped them in, then whatever the user drew.
   *
   * ACRES AND SCORE, which is what a zone is measured by. A drawn zone has no
   * score and prints an em dash rather than a zero: it was never scored, and a
   * 0.0 there would read as "scored, and badly".
   *
   * `selected` is carried so the strip can show what a commit would take. It
   * is a READING, not an affordance -- the tabs do not toggle in this branch;
   * the map's select gesture is still the one way to change a selection.
   */
  tabs: ({ proposals, draft }) => {
    const selected = new Set(draft.selectedFeatureIds)
    const tabs = (proposals?.zones ?? []).map((zone) => ({
      id: zone.feature_id,
      name: `Zone ${zone.rank}`,
      selected: selected.has(zone.feature_id),
      rows: [
        { value: measure(zone.area_acres), label: 'acres' },
        { value: measure(zone.score), label: 'score' },
      ],
    }))

    draft.drawnFeatures.forEach((feature, index) => {
      tabs.push({
        id: feature.id,
        name: `Drawn ${index + 1}`,
        drawn: true,
        selected: true,
        rows: [
          { value: measure(feature.properties?.acres), label: 'acres' },
          { value: measure(null), label: 'score' },
        ],
      })
    })

    return tabs
  },
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
