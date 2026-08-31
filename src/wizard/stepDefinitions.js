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
 *                      decision in hand.
 *
 *                      `text` IS A STRING OR A LIST OF PARTS, and the list is
 *                      how a measured figure gets into the middle of a
 *                      sentence. A part is a string, or `{measure}` for a
 *                      number the pipeline produced -- which the bar sets in
 *                      the data face, because the whole reason this project
 *                      loads three faces is that a reader can tell at a glance
 *                      which half of a line was measured and which was
 *                      written. See measured().
 *
 *   tabs(context)      One tab per feature this step is carrying, as
 *                      [{id, name, rows: [{value, label}], eye?, removable?,
 *                      drawn?}]. `rows` is the acreage chip's treatment
 *                      generalised: a right-aligned monospace value and a
 *                      left-aligned label, one per row.
 *
 *                      IT IS THE STEP'S BECAUSE THE FIGURES ARE. A boundary
 *                      counts points and encloses acres; a landform zone has
 *                      acres and a score. No reading of a Feature reaches
 *                      either, so a generic strip would have had to learn
 *                      which step it was drawing.
 *
 *                      `eye`         The feature is in the commit and may be
 *                                    taken out. Omitted for a tab whose
 *                                    feature is not a commit decision at all
 *                                    -- the boundary's ring is the step, not a
 *                                    candidate within it.
 *
 *                      `removable`   The feature can be DESTROYED, and the tab
 *                                    carries an ×. Declared, never inferred
 *                                    from `drawn`: the strip must not decide
 *                                    on its own what may be destroyed. Only a
 *                                    shape the USER authored is removable -- a
 *                                    suggestion cannot be destroyed because
 *                                    the server will regenerate it, so its
 *                                    only removal is the eye, and the
 *                                    asymmetry is honest and meant to be
 *                                    visible at a glance.
 *
 *   detail(context,    What the DETAIL PANEL shows for one feature, or null
 *          featureId)  when this step has nothing to say about that id:
 *                      {name, fields: [{label, value, measured}], cautions}.
 *
 *                      THE FIELDS ARE THE ONES THE TAB HAD NO ROOM FOR. A tab
 *                      is three rows; the panel is where the rest of what the
 *                      pipeline measured goes. `cautions` are carried through
 *                      as the payload shipped them -- {type, label, acres} --
 *                      because a caution's LABEL IS THE LAYER'S OWN WORDS and
 *                      re-writing it client-side would put this app's
 *                      vocabulary in front of the backend's.
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
 *   filter   Optional. A predicate over one Feature. Present means "this layer
 *            is the SUBSET of its source that satisfies this", absent means
 *            the whole of it.
 *
 *   treatment  Optional, and only meaningful on a `polygon`. Names a stroke
 *            treatment: the renderer reads the token `--<treatment>` for its
 *            colour, casts the --halo casing under it, and hangs the class
 *            `zone--<treatment>` on the path. Absent means the generic
 *            treatment the band and source already imply.
 *
 * ONE LAYER F2 DECLARED IS NOT DECLARED HERE, and it is reported rather than
 * absorbed: see LANDFORM_STEP's `exclusion_layers` note.
 *
 * TWO FIELDS THE WATER STEP ADDED, AND BOTH ARE THE SCHEMA FAILING RATHER
 * THAN THE STEP BEING UNUSUAL. Recorded here in the same posture as the
 * three fields the stack forced, because this is the second definition and
 * the point of a second definition is to find out which of the first one's
 * shapes were general:
 *
 *   4. `key` ASSUMES ONE COLLECTION PER LAYER. Landform's payload puts each
 *      of its layers under its own key -- `suggested_zones`, `eligible_union`,
 *      `exclusion_layers` -- so `proposals[layer.key]` was a complete address.
 *      Water's two survey types arrive in ONE FeatureCollection under one key
 *      (`survey_zones`), distinguished by each feature's own `layer` and
 *      `survey_type` properties, because the backend's entry point is ONE call
 *      that sees both surfaces and reports the agreement between them. The
 *      schema had no way to say "the embankment half of that collection", and
 *      the alternatives were both worse: teaching the stack that a particular
 *      key holds mixed types is step knowledge in the file that must have
 *      none, and asking the backend to split the collection would break the
 *      one-call contract cross_type_overlaps depends on. Hence `filter`.
 *
 *   5. A POLYGON'S TREATMENT WAS DERIVED, AND DERIVING IT ONLY WORKS WHILE A
 *      STEP HAS ONE. layers.jsx picked the mark from the layer's band and
 *      source -- settled, proposal, drawn -- which is three treatments for
 *      three MEANINGS. Water has two layers with the same band, the same
 *      source and the same meaning that must still be told apart, because
 *      embankment and excavated are two survey instruments and a user selects
 *      across both. There was no field that could say so. Hence `treatment`,
 *      which names a token rather than carrying a colour: the literals stay
 *      at :root and this file stays free of them.
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
 * A measured figure, for the middle of a sentence.
 *
 * THE NOTICES ARE WHERE THE PANEL COLUMN'S FIGURES ENDED UP, and a figure set
 * as prose in a warning is the one place the three-face rule matters most: a
 * sentence saying "you have selected too much" is worth much less than one
 * naming how much. The bar renders these in mono with tabular figures; a bare
 * string part is prose.
 */
export function measured(value, dp = MEASURE_DP) {
  return { measure: measure(value, dp) }
}

/**
 * A measured value at fixed width, or an em dash where the pipeline sent null.
 * null means "not known" throughout this contract and must never be printed as
 * a 0.0 that reads as a measurement.
 *
 * `dp` IS A PARAMETER NOW, AND THE DEFAULT IS STILL MEASURE_DP. The constant's
 * own note says what it is: a MIRROR of the pipeline's rounding boundary, and
 * the boundary it mirrors is production_area_ceiling._round1()'s -- landform's.
 * Water's suitability is not on that boundary. It is a 0-1 weighted-overlay
 * fraction the backend ships at four decimal places (0.5260, 0.7933, 0.5586),
 * and printing it at one decimal collapses all three to "0.5" -- a column of
 * identical figures for zones the pipeline scored differently, which is worse
 * than no column. So the step that knows its own figure's precision says so,
 * and MEASURE_DP stops being a claim about every payload.
 *
 * WHAT THIS IS NOT is a rescale. Water's mean_suitability is 0-1 and is
 * printed as 0-1; multiplying by 100 to make it look like landform's 0-100
 * score would be this app inventing a unit the backend does not use.
 */
export function measure(value, dp = MEASURE_DP) {
  return value == null ? '—' : Number(value).toFixed(dp)
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
  const { id, band, kind, source, key = null, filter = null, treatment = null } = layer

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

  if (filter !== null && typeof filter !== 'function') {
    throw new Error(
      `Step '${stepId}' layer '${id}' declares a non-function \`filter\`. ` +
        'A filter is a predicate over one Feature; the stack applies it and reads nothing else.'
    )
  }

  if (treatment !== null && !/^[a-z0-9-]+$/.test(treatment)) {
    throw new Error(
      `Step '${stepId}' layer '${id}' declares treatment='${treatment}'. ` +
        'A treatment names a token (--<treatment>) and a class (zone--<treatment>), ' +
        'so it has to be lower-case, digits and dashes.'
    )
  }

  return Object.freeze({ id, band, kind, source, key, filter, treatment })
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
  // SECONDARY, and the tone is the argument. Oxide marks the single FORWARD
  // move, and reopening a committed step is a move backwards into work that
  // was finished -- offered, never urged. A committed step's chrome therefore
  // shows no oxide at all, which is correct: the way on from a finished step
  // is the next step, and the rail is what carries that.
  tone: 'secondary',
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
    detail = () => null,
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
    detail,
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
  label: 'Draw the boundary',
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
  label: 'Undo last point',
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
  label: 'Finish boundary',
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
  label: 'Clear and redraw',
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
    // NO EYE AND NO ×. The ring is not a candidate within the step, it IS the
    // step -- there is nothing to include it in, and clearing it is what the
    // banner's "Clear and redraw" is for.
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
      //
      // PARTS RATHER THAN A SENTENCE, so the acreage the clamp removed is set
      // in the data face like every other measured value. It was a template
      // literal, which put a pipeline figure into prose -- the one thing the
      // three-face rule exists to prevent.
      notice:
        removedAcres > 0
          ? [measured(removedAcres), ' acres outside the property boundary were trimmed off.']
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
  label: 'Draw a zone',
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
      committableCount === 0 ? 'Commit no zones for this step' : 'Commit zones',
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

    // NOTHING ON THIS PARCEL CLEARS EVERY GATE. A real answer, and one the
    // panel column used to state plainly; without it the step reads as a
    // generate that quietly returned nothing.
    if ((proposals.zones ?? []).length === 0) {
      lines.push({
        key: 'no-ground',
        tone: 'caution',
        text:
          'No ground on this parcel clears every check. The highlight shows what is ' +
          'eligible; nothing in it is large or gentle enough to suggest.',
      })
    }

    const totals = totalsFor(proposals, new Set(draft.selectedFeatureIds), draft.drawnFeatures)
    if (totals.pctOfParcel > CEILING_ADVISORY_PCT) {
      // THE FIGURE IS THE ADVISORY. It used to sit above this line as a
      // `% of parcel` column in the totals block, and the advisory read
      // "this much" because the number was already on screen an inch away.
      // The block is gone; carrying the number into the sentence is what
      // keeps the advisory worth reading, and it is the first measured value
      // in the new shell to land mid-sentence rather than in a value column.
      lines.push({
        key: 'ceiling',
        tone: 'advisory',
        text: [
          'Selecting ',
          measured(totals.pctOfParcel),
          '% of the parcel leaves little room for water, roads, and trees.',
        ],
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

    // THE SUGGESTIONS. Every one carries an eye and none carries an ×: a
    // suggestion cannot be destroyed, because the server made it and will make
    // it again on the next generate. Closing its eye is the only removal there
    // is, and offering an × that quietly did the same thing would be a lie
    // about what the button does.
    const tabs = (proposals?.zones ?? []).map((zone) => ({
      id: zone.feature_id,
      name: `Zone ${zone.rank}`,
      eye: true,
      selected: selected.has(zone.feature_id),
      rows: [
        { value: measure(zone.area_acres), label: 'acres' },
        { value: measure(zone.score), label: 'score' },
      ],
    }))

    // THE DRAWN ZONES. An eye AND an ×, and the two mean different things:
    // the eye takes the zone out of the commit and leaves it to be put back,
    // the × destroys it. Nothing else in this app can be destroyed by the
    // user, which is why only these carry one.
    draft.drawnFeatures.forEach((feature, index) => {
      tabs.push({
        id: feature.id,
        name: `Drawn ${index + 1}`,
        drawn: true,
        eye: true,
        removable: true,
        selected: selected.has(feature.id),
        rows: [
          { value: measure(feature.properties?.acres), label: 'acres' },
          { value: measure(null), label: 'score' },
        ],
      })
    })

    return tabs
  },

  /**
   * WHAT THE DETAIL PANEL SAYS ABOUT ONE ZONE.
   *
   * THE FIELDS ARE THE ONES THE TAB HAD NO ROOM FOR. A tab is a name and two
   * figures -- acres and score, which is what you compare zones BY. The slope
   * range, the aspect and the score's band are what you read once you have
   * picked one out, and they are exactly the columns the panel column's zone
   * list carried before it was deleted.
   *
   * TWO KINDS OF FEATURE, ONE SHAPE OF ANSWER. A suggestion's measurements are
   * in the payload's `zones` table, joined on `feature_id`; a drawn zone's are
   * its own properties, and there are fewer of them because nothing measured
   * it -- it was traced by hand, which is what `confidence: 'low'` on it says.
   * An em dash where a figure does not exist, never a zero.
   */
  detail: ({ proposals, draft }, featureId) => {
    const drawn = draft.drawnFeatures.find((feature) => feature.id === featureId)
    if (drawn) {
      return {
        name: `Drawn zone`,
        fields: [
          { label: 'acres', value: measure(drawn.properties?.acres), measured: true },
          // Traced by hand: the pipeline never scored it, never measured its
          // slope and never read its aspect. Said as an absence rather than
          // omitted, so the panel reads the same for both kinds of zone.
          { label: 'confidence', value: drawn.properties?.confidence ?? '—' },
          { label: 'source', value: 'drawn by hand' },
        ],
        cautions: drawn.properties?.cautions ?? [],
      }
    }

    const zone = (proposals?.zones ?? []).find((row) => row.feature_id === featureId)
    if (!zone) return null

    return {
      name: `Zone ${zone.rank}`,
      fields: [
        { label: 'acres', value: measure(zone.area_acres), measured: true },
        { label: 'score', value: measure(zone.score), measured: true },
        // THE BAND COMES OFF THE PAYLOAD'S OWN `scales`, never off a threshold
        // written here -- a copy of those numbers on this side goes stale
        // silently the first time the backend retunes them.
        { label: 'band', value: scoreBandName(zone.score, proposals?.scales) ?? '—' },
        // TWO FIGURES WITH THE DASH BETWEEN THEM, not one cell holding
        // "5.7-19.8". A range has two decimal points and a single cell can
        // only ever align one of them.
        {
          label: 'slope %',
          value: `${measure(zone.slope_min_pct)}–${measure(zone.slope_max_pct)}`,
          measured: true,
        },
        {
          label: 'aspect',
          // aspect_available false means the ground is too flat for a
          // well-defined downhill direction, and the pipeline's aspect figure
          // is then a neutral default rather than a measurement. Printing it
          // would state a fact about the land that was never measured.
          value:
            zone.aspect_available && zone.dominant_aspect
              ? `${zone.dominant_aspect}-facing`
              : '—',
        },
      ],
      // A suggested zone is a strict subset of ground that already cleared
      // every gate, so it cannot cross an exclusion. Empty, and asserted so in
      // DEV by assertSuggestedZonesAreClean.
      cautions: [],
    }
  },
})


/* ===========================================================================
   THE WATER STEP
   ===========================================================================
   Stage 3's first step, and the second definition this file registers. What
   it is FOR is testing whether the schema above generalises past the step it
   was written against; where it did not, the gap is recorded at the field
   that was missing rather than worked around here. There are five, and they
   are named in four places: LAYER SCHEMA items 4 and 5 (`filter`,
   `treatment`), measure()'s `dp`, DetailPanel.jsx's GROUPS note, and
   registryProposalFeatures() below.
   --------------------------------------------------------------------------- */

/**
 * The two zone layers the backend's water commit contract accepts, verbatim.
 *
 * step_registry's WATER entry declares `layers=("survey_zone_embankment",
 * "survey_zone_excavated")` -- wire_translation.LAYER_SURVEY_ZONES -- and
 * refuses a committed feature carrying any other. The MEMBER layers
 * (survey_zone_member_<type>) and the dropped layer are deliberately absent
 * from that contract: a member is a sub-feature of a zone and a dropped zone
 * is under the acreage floor, so neither is selectable and a commit carrying
 * one is rejected BY NAME.
 *
 * Which is why this is a table rather than a prefix test. "Starts with
 * survey_zone_" is true of a member layer too, and a client that selected on
 * it would send members to a contract that names exactly two strings.
 */
export const SURVEY_ZONE_LAYERS = Object.freeze({
  embankment: 'survey_zone_embankment',
  excavated: 'survey_zone_excavated',
})

const SURVEY_ZONE_LAYER_SET = new Set(Object.values(SURVEY_ZONE_LAYERS))

/** Is this Feature a committable survey zone -- an envelope, not a member? */
export function isSurveyZone(feature) {
  return SURVEY_ZONE_LAYER_SET.has(feature?.properties?.layer)
}

/** One survey type's zones. The layer name IS the type, on the wire. */
function isSurveyZoneOfType(surveyType) {
  return (feature) => feature?.properties?.layer === SURVEY_ZONE_LAYERS[surveyType]
}

/**
 * A zone's identity: ITS TYPE AND ITS RANK, never the rank alone.
 *
 * RANK IS PER TYPE on the backend -- rank_survey_zones_per_type() ranks each
 * survey type's zones independently -- so there is an embankment rank 1 AND an
 * excavated rank 1 on the same parcel, describing different ground. "Zone 1"
 * would name two things. The type is what disambiguates it and it is not
 * decoration.
 *
 * SET AS PROSE, not in the figure column. The survey type is categorical --
 * the same rule that put the score band and the aspect in prose rather than in
 * the aligned column of figures.
 */
export function surveyZoneName(properties) {
  const type = properties?.survey_type
  const title = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Zone'
  return `${title} ${properties?.rank ?? '?'}`
}

/**
 * WHAT A ZONE'S FLAGS MEAN, in the terms someone standing on the land would
 * use. Keyed on water_survey_areas' own FLAG_* constants, which are the stable
 * identifiers -- the same posture UNAVAILABLE_CONSEQUENCE takes toward the
 * exclusion layers' `type`.
 */
const ZONE_FLAG_CONSEQUENCE = {
  below_min_area: 'its envelope is under the minimum area floor',
  sparse_anchor: 'little of the envelope is high-suitability ground',
  no_service_relationship: 'no committed production area is within service range',
}

/**
 * WHICH CHECKS DID NOT RUN, for a step whose availability signals are shaped
 * nothing like landform's.
 *
 * LANDFORM READS A TABLE; WATER READS SENTINELS, and the difference is the
 * payload's, not this function's. landform's `exclusion_layers` is five
 * wrappers each carrying `{type, label, data_available}` -- a per-gate table a
 * consumer can walk. The water payload has no such table. What it has is:
 *
 *   summary.soil_checked      one step-level boolean, the whole soil answer.
 *   the three overlap fields  None = never checked, 0.0 = checked and
 *                             genuinely none, PER ZONE.
 *
 * So "was canopy checked" is not a field to read; it is a fact about whether
 * every zone's canopy_overlap_pct came back null. That is what makes these
 * three predicates rather than lookups, and it is why the consequence strings
 * live here rather than in a helper shared with landform: there is no shared
 * shape to share.
 */
const WATER_UNCHECKED_CONSEQUENCE = {
  canopy_overlap_pct:
    'Canopy data was unavailable, so wooded ground inside these areas has not been measured.',
  road_overlap_pct:
    'Road data was unavailable, so existing farm roads inside these areas have not been measured.',
  production_overlap_pct:
    'Overlap with the committed production areas could not be measured, so these areas may sit on ground already given to production.',
}

/**
 * Every zone envelope in a water payload, members dropped.
 *
 * THE COLLECTION HOLDS MORE THAN THE STEP COMMITS, which is new. Landform's
 * `suggested_zones` is exactly its candidates; water's `survey_zones` carries
 * every zone envelope AND every member footprint, because the backend's one
 * entry point built both and the payload assembler carries its collection
 * through unchanged rather than rebuilding it.
 *
 * THIS IS LOAD-BEARING TWICE OVER, not tidiness. useStepMachine seeds the
 * draft's selection from this list, and buildCommitBody picks the committed
 * features out of it by id. A member left in here would be selected on the
 * first generate and sent in the commit body -- to a contract that names two
 * layers and refuses everything else. The 422 would be correct and the cause
 * would be here.
 */
export function surveyZoneFeatures(payload) {
  const features = payload?.survey_zones?.features
  return Array.isArray(features) ? features.filter(isSurveyZone) : []
}

/** One zone's Feature, by the feature id the tabs and the map both key on. */
function zoneFeature(proposals, featureId) {
  return surveyZoneFeatures(proposals).find((feature) => feature.id === featureId) ?? null
}

/**
 * THE GRAVITY READING, in one prose line.
 *
 * WHY IT IS HERE AND NOT IN THE TAB. On a keyline farm "can this pond reach
 * production without a pump" is arguably the most decision-relevant thing
 * about a site, which is the case for putting it in the tab's three rows. It
 * does not survive that case. A tab row is a right-aligned monospace value
 * against a left-aligned label, and this reading is CATEGORICAL -- it has no
 * decimal point to hold still and nothing above or below it to line up with.
 * Landing it in that column would right-align a word against nothing and widen
 * the figure track for every other tab, which is the exact failure the detail
 * panel's own measured/prose split was introduced to fix.
 *
 * So it leads the DETAIL PANEL instead, and it leads it -- first field of the
 * first group, ahead of the acreage. Acreage and suitability keep the tab
 * because they are what you COMPARE zones by and they are figures; gravity is
 * what you read once you have picked one out, and it is the first thing you
 * should read.
 *
 * THREE ANSWERS, NOT TWO. `has_service_relationship` false is a real, computed
 * "nothing in range" -- the backend flags it rather than dropping the zone,
 * because gravity is ranking context and never a gate -- and a below-elevation
 * relationship survives with its meaning intact: the water is there, it just
 * needs a pump to get where it is going.
 */
export function gravityReading(properties) {
  const primary = properties?.primary_production_area_relationship
  if (!properties?.has_service_relationship || !primary) {
    return 'no production area within service range'
  }
  return primary.above_production_area
    ? `sits above production area ${primary.production_area_id} — gravity feed`
    : `sits below production area ${primary.production_area_id} — a pump would be needed`
}

/**
 * THE AGREEMENT REPORT: what share of THIS zone's envelope each surviving zone
 * of the OTHER type covers.
 *
 * THE MOST INTERESTING FIELD ON THIS PANEL, and the reason is that it is the
 * only one that is about two things at once. Every other figure is one survey
 * instrument's reading of one piece of ground. This is the two instruments --
 * the embankment surface and the excavated surface, scored separately, ranked
 * separately -- independently arriving at the same ground. Someone choosing
 * across both types is choosing partly on this.
 *
 * IT DOES NOT MOVE WHEN THE SELECTION DOES. attach_cross_type_overlaps() runs
 * at GENERATE time over the SURVIVING zones and is not recomputed against a
 * commit set, on purpose: it is a finding about the ground, not about the
 * choice. Closing a zone's eye does not make the other instrument stop
 * agreeing with it. So this reads the payload's own value and never the
 * draft's -- there is no `draft` in this function's arguments and that is
 * deliberate.
 *
 * THE PERCENT IS A UNIT RESTATEMENT, NOT A DERIVATION. The feature carries
 * `fraction` (0.0-1.0); the backend's own narrative digest of the same value
 * carries `overlap_pct` as round(fraction * 100, 1). Both are the same
 * measurement -- this prints the one the feature carries, in the unit the
 * backend itself prints it in, rather than joining across two representations
 * of one number.
 */
export function crossTypeReadings(proposals, properties) {
  const overlaps = properties?.cross_type_overlaps ?? []
  if (!overlaps.length) return []

  // The other zones, by their INTERNAL zone_id -- which is what
  // cross_type_overlaps names, and is not the wire feature id.
  const byZoneId = new Map(
    surveyZoneFeatures(proposals).map((feature) => [feature.properties?.zone_id, feature.properties])
  )

  return overlaps.map((entry) => {
    const other = byZoneId.get(entry.zone_id)
    return {
      label: `% overlapped by ${other ? surveyZoneName(other) : `zone ${entry.zone_id}`}`,
      value: measure(entry.fraction == null ? null : entry.fraction * 100),
      measured: true,
    }
  })
}

/**
 * How many decimal places water's own figures carry.
 *
 * NOT MEASURE_DP, AND SEE measure()'s NOTE FOR WHY. mean_suitability is a
 * weighted-overlay fraction on 0-1 (0.5260, 0.7933, 0.5586 on the reference
 * parcel), so one decimal place prints all three as "0.5" -- a column of
 * identical numbers for zones the pipeline ranked apart. Depth and catchment
 * are small metric and acreage figures for the same reason.
 */
const SUITABILITY_DP = 2
const METRIC_DP = 2
const COUNT_DP = 0

export const WATER_STEP = documentStep({
  id: 'water',
  title: 'Water',
  blurb: 'Ground worth surveying for a pond, from two independent readings.',
  layers: [
    // Same context mark landform draws, declared again rather than shared: a
    // layer belongs to the step that declares it, and the scrim is derived
    // from the committed boundary rather than from either step's payload.
    { id: 'water-offparcel', band: 'context', kind: 'scrim', source: 'document' },

    /* TWO EDITABLE LAYERS OVER ONE PAYLOAD KEY, which is the shape LAYER
       SCHEMA item 4 exists for. Both come out of `survey_zones`; `filter`
       splits them and `treatment` tells them apart on the map.

       ENVELOPES ONLY -- NO MEMBER LAYER, and that is a decision rather than an
       omission. See WATER_STEP's own note below. */
    {
      id: 'water-embankment',
      band: 'editable',
      kind: 'polygon',
      source: 'proposals',
      key: 'survey_zones',
      filter: isSurveyZoneOfType('embankment'),
      treatment: 'survey-embankment',
    },
    {
      id: 'water-excavated',
      band: 'editable',
      kind: 'polygon',
      source: 'proposals',
      key: 'survey_zones',
      filter: isSurveyZoneOfType('excavated'),
      treatment: 'survey-excavated',
    },
    { id: 'water-committed', band: 'committed', kind: 'polygon', source: 'document' },
  ],

  /**
   * ONE VERB. No `draw`, no `delete`.
   *
   * Every committable feature in this step is one the pipeline generated over
   * a suitability surface, and the backend says so structurally: the WATER
   * commit contract declares `internal_id_parameter=None` because there is no
   * drawn shape to allocate an id for, and its rehydrator refuses a feature
   * whose id does not parse rather than inventing one. An invented id would be
   * a survey recommendation for ground no suitability surface ever nominated.
   *
   * WHICH IS WHY NO WATER TAB CARRIES AN ×. The × destroys, and nothing here
   * is the user's to destroy: the server made these and will make them again
   * on the next generate. The eye is the only removal there is.
   */
  tools: ['select'],

  // None. The backend's water entry declares no user_inputs.
  inputs: [],
  generate: { label: 'Generate water survey areas' },

  commit: {
    /**
     * AN EMPTY COMMIT IS LEGAL AND DELIBERATE, AND THE BUTTON SAYS SO --
     * landform's shape, and this is the step where it stops being theoretical.
     *
     * "No water system on this parcel" is a DECISION. The backend's water
     * contract sets `min_features=0` for exactly this, and the empty commit
     * reaches five downstream consumers as water_suitability.NO_WATER_ZONE --
     * a sentinel, never a None -- so every one of them receives an ANSWER
     * rather than an absence.
     *
     * So the commit is never blocked. But it must never be a silent empty
     * submit either: the button renames itself and states the decision.
     */
    label: ({ committableCount }) =>
      committableCount === 0 ? 'Commit no water zones' : 'Commit water zones',
    canCommit: () => true,
    blockedReason: () => null,
  },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen water?' },

  /* The name the reopen restore matches committed ids against -- the water
     entry's own `proposal_collection`. */
  proposalCollection: 'survey_zones',

  /* MEMBERS ARE NOT PROPOSALS. See surveyZoneFeatures(). */
  proposalFeatures: surveyZoneFeatures,

  // NOTHING IS DRAWN HERE, so there is no shape to read. `null` is the
  // declared value for that and the draw gesture is never mounted anyway --
  // `tools` names no `draw`.
  shape: null,

  instructions: {
    [IDLE]: 'Ground worth surveying for a pond, from two independent readings.',
    [GENERATING]: 'Reading the parcel — wetness, depressions, catchment, slope, and soil…',
    [REVIEWING]: 'Click an area to read it. The eye on its tab decides whether it is committed.',
    [EDITING]: 'Click an area to read it.',
    [COMMITTING]: 'Saving these survey areas…',
    [STEP_COMMITTED]:
      'These survey areas are committed. Roads, trees and fencing are measured against them.',
  },
  buttons: {
    [IDLE]: [GENERATE_BUTTON],
    [GENERATING]: [],
    // ONE BUTTON. Landform offers "Draw a zone" beside the commit; there is
    // nothing to draw here, and a second button offering the only other verb
    // this step has -- none -- would be a control that does nothing.
    [REVIEWING]: [COMMIT_BUTTON],
    [EDITING]: [COMMIT_BUTTON],
    [COMMITTING]: [],
    [STEP_COMMITTED]: [REOPEN_BUTTON],
  },

  /**
   * THE TWO THINGS ONLY THIS STEP KNOWS ARE WORTH SAYING.
   *
   * 1. WHICH CHECKS DID NOT RUN, in consequence terms, keyed on the stable
   *    flag rather than on display prose -- landform's rule, applied to a
   *    payload with a completely different flag surface. See
   *    WATER_UNCHECKED_CONSEQUENCE.
   *
   * 2. WHAT THE GENERATE FOUND AND IS NOT SHOWING. `dropped_count` IS on the
   *    wire -- the backend carries floor-dropped zones "visible and
   *    attributed, never silently" and its narrative digest counts them -- so
   *    this states the count it was given. It is not inferred and it is not
   *    computed: with no `dropped_count` there would be nothing honest to say
   *    and this would say nothing.
   */
  notices: ({ proposals }) => {
    if (!proposals) return []
    const summary = proposals.summary ?? {}
    const zones = surveyZoneFeatures(proposals)
    const lines = []

    // SOIL IS ONE STEP-LEVEL BOOLEAN, not a per-zone sentinel: the water
    // scorer's own posture is all three soil inputs or none, so the answer is
    // the same for every zone by construction.
    if (summary.soil_checked === false) {
      lines.push({
        key: 'unchecked-soil',
        tone: 'caution',
        text:
          'Soil survey data was unavailable, so soil was not scored for any of these areas. ' +
          'Walk them before committing to them.',
      })
    }

    // THE THREE OVERLAPS, EACH INDEPENDENTLY UNCHECKABLE. A check counts as
    // not run only when EVERY zone came back null for it -- a single null
    // among measured values is a fact about one zone and belongs in that
    // zone's panel, not in a standing line about the parcel.
    for (const field of Object.keys(WATER_UNCHECKED_CONSEQUENCE)) {
      if (!zones.length) continue
      if (!zones.every((feature) => feature.properties?.[field] == null)) continue
      lines.push({
        key: `unchecked-${field}`,
        tone: 'caution',
        text: WATER_UNCHECKED_CONSEQUENCE[field],
      })
    }

    // NOTHING CLEARED THE THRESHOLD. A real answer, and without it the step
    // reads as a generate that quietly returned nothing.
    if (summary.zone_count === 0) {
      lines.push({
        key: 'no-areas',
        tone: 'caution',
        text:
          'No ground on this parcel scored high enough to be worth surveying for a pond. ' +
          'Committing no water zones is a decision this design can carry.',
      })
    }

    // FOUND AND NOT SHOWN. The COUNT is the payload's; the reason is the
    // backend's own drop_reason for every one of them.
    //
    // THE FLOOR ITSELF IS NOT NAMED, because the floor is not on the wire.
    // MIN_SURVEY_REGION_AREA_ACRES is a backend constant and no key in this
    // payload carries it -- so the notice says what happened and declines to
    // quote a number it would have had to hardcode. A second copy of that
    // constant on this side goes stale silently the first time it is retuned,
    // which is the same argument scoreBandName() makes about band thresholds.
    if (summary.dropped_count > 0) {
      lines.push({
        key: 'dropped',
        tone: 'advisory',
        text: [
          'The generate found ',
          measured(summary.dropped_count, COUNT_DP),
          ' more survey areas and is not showing them: each one’s envelope measured under the minimum area floor.',
        ],
      })
    }

    return lines
  },

  /**
   * ONE TAB PER ZONE ENVELOPE, both types in one strip.
   *
   * ONE COLLECTION, ONE STRIP, and the strip is not grouped by type. The
   * backend returns both types from one call because they share the gate mask,
   * the soil scorer and the derived screens; a user selects across both freely
   * and the commit contract accepts both layers in one body. Splitting them
   * into two strips would state a separation the pipeline does not make.
   *
   * THE IDENTITY CARRIES THE TYPE. See surveyZoneName() -- rank is per type,
   * so a rank without its type beside it names two different pieces of ground.
   *
   * `zone_acres`, NOT `member_acres`. The dual acreage is deliberate on the
   * backend and the two mean different things: member_acres is the ANCHORING
   * SIGNAL (the cells that actually cleared the suitability threshold) and
   * zone_acres is the clipped envelope the backend's own comment calls "the
   * ground to walk". The walkable one belongs in the tab; the other one leads
   * the panel, where there is room to say which is which.
   */
  tabs: ({ proposals, draft }) => {
    const selected = new Set(draft.selectedFeatureIds)

    // EVERY TAB CARRIES AN EYE AND NO TAB CARRIES AN ×. Nothing here is
    // user-authored, so nothing here can be destroyed -- see `tools` above.
    // `removable` is simply not declared, which is how the strip is told.
    return surveyZoneFeatures(proposals).map((feature) => ({
      id: feature.id,
      name: surveyZoneName(feature.properties),
      eye: true,
      selected: selected.has(feature.id),
      rows: [
        { value: measure(feature.properties?.zone_acres), label: 'acres' },
        {
          value: measure(feature.properties?.mean_suitability, SUITABILITY_DP),
          label: 'suitability',
        },
      ],
    }))
  },

  /**
   * WHAT THE DETAIL PANEL SAYS ABOUT ONE SURVEY AREA: four groups, in the
   * order they should be read.
   *
   * IT READS THE FEATURE, NOT THE NARRATIVE TABLE. The payload carries both --
   * `survey_zones` (the FeatureCollection) and `zones` (the backend's imperial
   * digest of the same zones) -- and everything below is on the FEATURE. That
   * is one join fewer (the digest's `id` is the internal zone id, while the
   * tabs, the map and the commit all key on the wire feature id) and it is
   * also the only complete source: slope_median_pct, representative_elevation_m,
   * served_production_area_ids and soil_coverage_fraction are on the feature
   * and are not in the digest at all.
   *
   * THE SENTINELS SURVIVE BECAUSE NOTHING COERCES THEM. measure() prints an em
   * dash for null and "0.0" for zero, and the three overlap fields reach it
   * exactly as the wire sent them. That matters more here than anywhere else
   * in this app: canopy, road and production can each be independently
   * unchecked, so a `?? 0` anywhere on this path would print three separate
   * measured zeros for three things nobody looked at.
   */
  detail: ({ proposals }, featureId) => {
    const feature = zoneFeature(proposals, featureId)
    if (!feature) return null
    const p = feature.properties ?? {}

    return {
      name: surveyZoneName(p),
      groups: [
        {
          /* 1. GRAVITY, THEN THE OTHER ACREAGE.
             Gravity leads because it is the most decision-relevant fact about
             a pond site and it could not go in the tab (see gravityReading()).
             The acreage follows because the difference between the anchoring
             signal and the walkable envelope is the most EXPLANATORY thing
             about a survey area -- the tab showed one of the pair, and this is
             where the other one and its meaning live. */
          label: 'gravity and acreage',
          fields: [
            { label: 'gravity', value: gravityReading(p) },
            {
              label: 'serves',
              value: p.served_production_area_ids?.length
                ? p.served_production_area_ids.join(', ')
                : '—',
            },
            {
              label: 'anchor acres',
              value: measure(p.member_acres),
              measured: true,
            },
            { label: 'members', value: measure(p.member_count, COUNT_DP), measured: true },
          ],
        },
        {
          label: 'terrain',
          fields: [
            { label: 'slope % median', value: measure(p.slope_median_pct), measured: true },
            {
              label: 'depression m',
              value: measure(p.depression_depth_max_m, METRIC_DP),
              measured: true,
            },
            {
              label: 'catchment ac',
              value: measure(p.contributing_area_acres_at_wettest_cell, METRIC_DP),
              measured: true,
            },
            {
              label: 'elevation m',
              value: measure(p.representative_elevation_m),
              measured: true,
            },
          ],
        },
        {
          /* 3. THE TWO INSTRUMENTS AGREEING. Empty when they do not, rather
             than a line saying they do not: an absent overlap is not a
             measurement and has nothing to report. */
          label: 'agreement',
          fields: crossTypeReadings(proposals, p),
        },
        {
          /* 4. CAUTIONS.
             THE THREE OVERLAPS ARE MEASURED FIELDS, NOT `cautions`. The
             panel's caution channel carries the exclusion layers' own
             `{type, label, acres}` -- an ACREAGE and the layer's own words --
             and these are percentages of an envelope with no layer behind
             them. Putting them through that channel would have meant either
             rewriting what a caution is or printing a percentage under a
             heading that says acres. */
          label: 'cautions',
          fields: [
            { label: 'canopy %', value: measure(p.canopy_overlap_pct), measured: true },
            { label: 'road %', value: measure(p.road_overlap_pct), measured: true },
            { label: 'production %', value: measure(p.production_overlap_pct), measured: true },
            {
              label: 'sparse anchor',
              value: p.sparse_anchor ? 'yes' : 'no',
            },
            {
              label: 'below floor',
              value: p.below_min_area ? 'yes' : 'no',
            },
            {
              label: 'flags',
              value: p.flags?.length
                ? p.flags.map((flag) => ZONE_FLAG_CONSEQUENCE[flag] ?? flag).join('; ')
                : 'none',
            },
          ],
        },
      ],
      // A survey zone crosses no exclusion gate this step measured with an
      // acreage, and the three overlaps it DOES measure are percentages in the
      // cautions group above. The channel stays landform's.
      cautions: [],
    }
  },
})

/* ===========================================================================
   The registry, and the order steps run in
   =========================================================================== */

/** Every definition this build registers, keyed by id. */
export const STEP_DEFINITIONS = Object.freeze([BOUNDARY_STEP, LANDFORM_STEP, WATER_STEP])

/**
 * WHICH COLLECTION A COMMIT'S FEATURES COME OUT OF, for the store.
 *
 * THIS COMPLETES A SEAM THE STORE ALREADY NAMED, and finding that it was never
 * connected is the second definition's doing. SessionStore's
 * defaultProposalFeatures() says so in its own note: "per-step payload
 * knowledge belongs in the step definitions (F2), not here. The provider takes
 * this as a prop so F2 can hand it the registry's answer without this module
 * growing a table of step ids it cannot see." Nothing ever handed it one, so
 * buildCommitBody() has been reading `payload.suggested_zones` for every step.
 *
 * That worked while landform was the only step with a commit. It does not
 * survive a second: water's proposals are under `survey_zones`, so every water
 * commit would have assembled an empty FeatureCollection and succeeded --
 * min_features is 0, so an empty body is a VALID commit meaning "no water
 * zones on this parcel". The user's selection would have vanished into a legal
 * request. That is the worst shape a bug can have here and it is why this is
 * wired rather than reported and left.
 *
 * THE SEAM IS NARROWER THAN THE QUESTION, AND THAT IS THE GAP TO REPORT. The
 * prop is `(payload) => features`; it is never told WHICH STEP the payload
 * belongs to, so this cannot look the step up. It identifies the step by the
 * collection its payload carries instead -- the first registered definition
 * whose `proposalCollection` is present as a FeatureCollection wins, and that
 * definition's own `proposalFeatures` reads it (which is what drops water's
 * member footprints).
 *
 * That is sound today and it is sound for a reason rather than by luck: a
 * `proposalCollection` is the name of ONE step's proposals on the wire, and
 * two steps sharing one would be two steps sharing a commit contract. But it
 * is an identification where the caller already had an identity, and the fix
 * is one parameter in the store -- `proposalFeatures(payload, stepId)` -- not
 * a cleverer function here.
 */
export function registryProposalFeatures(payload, definitions = STEP_DEFINITIONS) {
  for (const definition of definitions) {
    const collection = payload?.[definition.proposalCollection]
    if (Array.isArray(collection?.features)) return definition.proposalFeatures(payload)
  }
  return []
}

export function definitionMap(definitions = STEP_DEFINITIONS) {
  const map = new Map()
  for (const definition of definitions) map.set(definition.id, definition)
  return map
}

/**
 * The wizard's step order: boundary, then the pipeline's own.
 *
 * FROM `step_order`, NEVER FROM `Object.keys(document.steps)` -- the store's
 * stepOrderFrom() is the one reader of that field and this builds on its
 * answer. Flask serialises the steps object alphabetically (fencing, landform,
 * roads, structures, trees, water), so reading the keys would give six real
 * step ids in a stable, wrong order and nothing would throw.
 *
 * TWO SOURCES, ONE ARRAY, AND THE DOCUMENT ALWAYS WINS.
 *
 * `fallback` is the catalogued order from GET /api/steps (stepCatalog.jsx),
 * used ONLY while no document has arrived. This used to return ['boundary']
 * in that case, on the grounds that the client does not know the pipeline
 * until a document tells it. That was right about the constraint and wrong
 * about the fix: the answer was not to hardcode the list over here, it was to
 * ask the side that owns it. The backend serves the same STEP_ORDER under the
 * same key it puts on every document, so this is one shape from two sources
 * rather than two copies of a list -- which is what the old note was actually
 * protecting against.
 *
 * A document's own array wins whenever there is one, and that ordering is not
 * a tie-break: `step_order` is the pipeline THAT DOCUMENT was created against,
 * and a constant fetched at page load is not. They agree today and the backend
 * asserts the identity; this is what keeps the agreement from being
 * load-bearing.
 *
 * WITH NEITHER, IT IS STILL ['boundary'] -- a rail one row long, which is the
 * honest length when the fetch has not landed, and a boundary step that is
 * fully usable while it is the only row.
 */
export function wizardStepOrder(state, fallback = []) {
  const fromDocument = selectStepOrder(state)
  return [BOUNDARY_STEP_ID, ...(fromDocument.length ? fromDocument : fallback)]
}

export { COMMITTED, GENERATED, NOT_STARTED }
