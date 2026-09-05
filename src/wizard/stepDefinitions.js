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
 *     (payload)        payload. The store takes a reader as a REQUIRED prop
 *                      and has no default -- there is no safe guess, since an
 *                      unrecognised payload reads as no features and no
 *                      features is a legal commit. registryProposalFeatures()
 *                      is what fills it in.
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
 *                      [{id, name, rows: [{value, label}], checkbox?,
 *                      removable?, drawn?}]. `rows` is the acreage chip's
 *                      treatment generalised: a right-aligned monospace value
 *                      and a left-aligned label, one per row.
 *
 *                      IT IS THE STEP'S BECAUSE THE FIGURES ARE. A boundary
 *                      counts points and encloses acres; a landform zone has
 *                      acres and a score. No reading of a Feature reaches
 *                      either, so a generic strip would have had to learn
 *                      which step it was drawing.
 *
 *                      `checkbox`    The tab carries a CHECKBOX: checked is in
 *                                    the commit and drawn, unchecked is out of
 *                                    the commit and hidden. Omitted for a tab
 *                                    whose feature is not a commit decision at
 *                                    all -- the boundary's ring is the step,
 *                                    not a candidate within it.
 *
 *                                    IT WAS `eye` AND THE RENAME IS THE
 *                                    CHANGE. The control said SHOW/HIDE and
 *                                    had always decided INCLUDE/EXCLUDE; the
 *                                    behaviour is unchanged in both
 *                                    directions and the name now matches it.
 *
 *                      `removable`   The feature can be DESTROYED, and the tab
 *                                    carries an ×. Declared, never inferred
 *                                    from `drawn`: the strip must not decide
 *                                    on its own what may be destroyed. Only a
 *                                    shape the USER authored is removable -- a
 *                                    suggestion cannot be destroyed because
 *                                    the server will regenerate it, so
 *                                    un-checking it is its only removal, and
 *                                    the asymmetry is honest and meant to be
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
 * SIX FIELDS THE ROADS STEP ADDED, and every one is the schema admitting it
 * assumed landform and water's shape. The third definition is the first that
 * ACCUMULATES candidates across generates, the first that COLLECTS AN INPUT,
 * and the first whose checkbox is a RADIO; each of those was a place the
 * schema had no word, and the word was added rather than the shell learning a
 * step. A SEVENTH came with the checkbox -- item 12.
 *
 *   6. `kind: 'line'` and `kind: 'point'`. Every layer so far was ground. A
 *      road is a LineString per branch and an access point is one coordinate;
 *      neither is a polygon and neither takes a fill, so LAYER_KINDS grew two
 *      values with two renderers. A `point` layer declares `points(value)`, a
 *      reader from its source's value to [{id, position}], the way `filter`
 *      is a reader over one Feature -- the stack never learns what a network
 *      record or an access-point input looks like.
 *
 *   7. `show: 'focused'` on a layer. THE VISIBILITY EXCEPTION. Everywhere
 *      else focus changes a mark's OPACITY and every checked feature stays
 *      drawn; three routed networks over one parcel is unreadable line
 *      density, so a layer carrying this rule draws ONLY the focused
 *      candidate and nothing when nothing is focused. index.css's
 *      pattern-levels block records the exception beside the levels it
 *      departs from, so the remaining three steps do not inherit it by
 *      accident: a layer that does not get it gets the pattern language.
 *
 *      IT IS NO LONGER DECLARED ON THE LAYER, AND THAT IS ITEM 12'S DOING.
 *      It was, and it agreed with the step's checkbox by hand. The rule is
 *      unchanged; where it comes from is not.
 *
 *   8. `groupOf(feature)` on the definition. A tab is a UNIT OF THE COMMIT
 *      DECISION, and for two steps the unit was one feature. A road network
 *      commits as one feature PER BRANCH -- the backend's own wire shape,
 *      trunk and spurs each carrying their grade and length -- so the unit is
 *      the GROUP of features sharing `properties.network_id`. Tabs carry
 *      `featureIds`, the checkbox toggles all of them, focusing a branch
 *      focuses its network, and the stack draws by group. The backend says
 *      the same thing as `feature_group` in its commit contract.
 *
 *   9. `selection: {mode: 'radio'}`. Commit-one-or-none. Ticking a tab
 *      un-ticks every other. Landform and water are `multiple`, which was the
 *      only mode there was -- so it was not a field. The backend declares
 *      `max_features: 1` counted by network; this is the client reading that
 *      constraint off its own definition rather than the strip hardcoding
 *      which step is a radio.
 *
 *      THE MODE IS NOT THE CONTROL. Every one of these steps renders a
 *      CHECKBOX; the mode says what happens to the OTHER boxes when one is
 *      ticked. A radio input could not express roads' legal empty commit,
 *      which is reached by un-ticking the last network.
 *
 *  10. `accumulate`. One generate per step was the whole model: proposals
 *      REPLACE. Roads generates ONE network per access point and keeps them
 *      side by side, up to a cap the server enforces. The declaration names
 *      the input a candidate set is keyed by, the document key every tried
 *      value is recorded under, the payload record that lists the candidate
 *      sets, and the cap -- so the buttons, the notices and the discard verb
 *      read the shape rather than knowing it.
 *
 *  11. `inputs[].commitValue(context)` and `removeTab`, `resetNote`,
 *      `focusSeed`. An input's value at COMMIT time is not the draft's --
 *      roads commits every access point the SERVER recorded, not the one
 *      pending in the draft -- and the schema had only "the draft's inputs".
 *      `removeTab` says what a tab's × does when it is not a drawn shape (a
 *      server verb, here). `resetNote` says what a reset of this step costs,
 *      for another step's reopen confirmation. `focusSeed` says what to look
 *      at when the draft is first seeded. Each is a step's own knowledge the
 *      shell used to have no way to ask for.
 *
 *  12. `selection: {follows: 'focus'}`. THE FIELD THAT COLLAPSED TWO FACTS
 *      INTO ONE, and the reason item 7 no longer says anything about a layer.
 *
 *      Roads' tab body checks its box: clicking a tab is choosing the network
 *      that commits, and clicking a checked one un-checks it -- which is how
 *      a user reaches the empty commit `min_features: 0` allows. So roads has
 *      NO "focused but unchecked" state: what you are looking at is what
 *      commits. The layer's `show: 'focused'` and the tab's checkbox were two
 *      fields saying that one thing, agreeing by hand.
 *
 *      TWO FIELDS THAT HAPPEN TO AGREE IS A DIVERGENCE WAITING FOR ITS FIRST
 *      EDIT. So the fact is declared ONCE, on the step, and the layer rule is
 *      DERIVED from it: an editable line or polygon layer of a focus-bound
 *      step resolves to `show: 'focused'`, every other layer to `show: 'all'`,
 *      and a layer declaring `show` for itself is REFUSED by defineLayer().
 *      There is nothing left to keep in step by hand.
 *
 *      IT IMPLIES `mode: 'radio'`, AND defineStep() SAYS SO. One focus slot
 *      holds one thing; a `multiple` step binding its checkboxes to it could
 *      never hold two checked tabs, which is what `multiple` means.
 *
 *      LANDFORM AND WATER DECLARE NO `follows`, and that is the whole of what
 *      keeps them as they were: focus and the commit decision are independent
 *      there, and clicking a tab body focuses without changing what a commit
 *      would send.
 *
 * NO FIELD THE TREES STEP ADDED, and that is the finding: trees is landform's
 * shape (select-only candidates PLUS drawing) over roads' sourcing (every
 * upstream decision is a committed edge), and the schema already had words
 * for both halves. Its cautions read a `reference` layer off its own payload
 * -- `crossing_grounds`, the four grounds the backend resolves at commit,
 * shipped in WGS84 -- under exactly the declaration landform's exclusion
 * gates use. A `step` field briefly let a reference layer name another
 * step's committed collection, while the payload carried only two of the
 * four grounds and the client unioned those two itself; the payload carries
 * all four now, from the one resolver the commit runs, and the field went
 * with its only consumer rather than staying declared with none.
 *
 * WHAT IS NOT IN HERE. No step registers structures or fencing: those are
 * later branches, and a definition written now against a payload nobody has
 * seen would be a guess dressed as a contract. The order they run in is not
 * here either -- it comes off the document's `step_order` (see
 * wizardStepOrder), because the backend owns it.
 */

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  selectIsStepReachable,
  selectBoundaryRing,
  selectSessionId,
  selectStepFeatures,
  selectStepInputs,
  selectStepProvenance,
  selectStepsHoldingWork,
  selectStepOrder,
  selectStepStatus,
  PROVENANCE_USER_ADDED,
} from '../session/SessionStore'
import { polygonAreaAcres, pointFromGeoJSON, pointToGeoJSON } from '../geo.js'
import { commitInputsFor, commitValueOf, requiredInputsMissing } from './stepInputs.js'
import { cautionsFor, clampToBoundary, exclusionGrounds } from '../zoneGeometry.js'
import {
  COMMITTING,
  EDITING,
  GENERATING,
  IDLE,
  LOADING,
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

/* ---------------------------------------------------------------------------
   WHAT A RESET COSTS, and the two readings every step's answer is built from
   ---------------------------------------------------------------------------
   A step declares `resetNote(state)` so ANOTHER step's reopen confirmation can
   say what losing this one actually means -- "3 placed access points and the
   networks routed from them" rather than "roads resets". The shell asks every
   step in the reset list for its own note and renders whatever comes back; it
   holds no sentence about any step and must not learn one.

   THESE TWO HELPERS ARE READINGS, NOT WORDS. Counting the features a step
   committed is the same arithmetic for every step; what those features ARE --
   zones, survey areas, a road -- is the step's own knowledge, and each note
   below says it in its own vocabulary.

   NEVER A COUNT THE DOCUMENT DOES NOT CARRY. A step holding work with nothing
   committed yet (generated, reopened, mid-review) has a real loss and no
   number to put on it, so its note describes the KIND of work instead. A
   fabricated figure in a warning is worse than no figure: it is the one line
   in this dialogue a person would check afterwards.
   --------------------------------------------------------------------------- */

/** How many features a step has committed. 0 when it has committed none. */
function committedFeatureCount(state, stepId) {
  return selectStepFeatures(state, stepId)?.features?.length ?? 0
}

/** How many of a step's committed features the user drew rather than picked. */
function drawnFeatureCount(state, stepId) {
  const provenance = selectStepProvenance(state, stepId)
  if (provenance == null) return 0
  return Object.values(provenance).filter((value) => value === PROVENANCE_USER_ADDED).length
}

/** 's', unless there is exactly one of them. */
const plural = (count) => (count === 1 ? '' : 's')

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
  // THE ROADS STEP'S TWO. A `line` is a FeatureCollection of LineStrings
  // drawn as cased strokes -- a road is a line, so the no-stroke rule for
  // ZONES does not apply to it, and the halo casing that rule was written
  // against is exactly what keeps it legible over imagery. A `point` is one
  // or more coordinates drawn as markers, read off its source through the
  // layer's own `points()` reader. See LAYER SCHEMA item 6.
  'line',
  'point',
])

/**
 * WHICH of a layer's features are drawn, beyond the checkbox.
 *
 *   'all'      the pattern language: every checked feature is drawn, and
 *              focus changes the focused one's opacity.
 *   'focused'  THE EXCEPTION. Only the focused candidate is drawn, at the
 *              focused level; nothing is drawn when nothing is focused.
 *
 * IT IS RESOLVED, NOT DECLARED. A layer does not choose this for itself --
 * see showFor() and LAYER SCHEMA items 7 and 12. Today exactly one layer
 * resolves to 'focused': the roads step's editable networks.
 */
export const LAYER_SHOW = Object.freeze(['all', 'focused'])

/**
 * What ticking one tab's checkbox does to the OTHER tabs' -- never what the
 * control is, which is a checkbox in both modes.
 *
 *   'multiple'  every box is its own.
 *   'radio'     one or none: ticking a tab un-ticks every other, and
 *               un-ticking the last one is a legal empty commit.
 */
export const SELECTION_MODES = Object.freeze(['multiple', 'radio'])

/**
 * WHAT A STEP'S SELECTION FOLLOWS, when it is not its own fact.
 *
 *   null      focus and the commit decision are independent. Clicking a tab
 *             body focuses; the checkbox decides the commit. Landform, water.
 *   'focus'   THEY ARE ONE FACT. What is focused is what is checked: the tab
 *             body ticks the box, the box moves the focus, and the step has
 *             no "focused but unchecked" state. Implies `mode: 'radio'` --
 *             one focus slot holds one thing -- and it is what resolves the
 *             step's editable geometry to `show: 'focused'`. See LAYER SCHEMA
 *             item 12.
 */
export const SELECTION_FOLLOWS = Object.freeze([null, 'focus'])

/**
 * The kinds whose drawn set `show` actually decides -- the two that resolve to
 * a feature list a renderer filters. A `point` layer draws every marker it is
 * given whatever is focused (the access points are what tell the candidates
 * apart), and `ring`, `scrim`, `highlight` and `reference` have no candidates
 * to choose between at all.
 */
const SHOW_APPLIES_TO = Object.freeze(['polygon', 'line'])

/**
 * THE VISIBILITY RULE FOR ONE LAYER, DERIVED FROM THE STEP.
 *
 * The step says whether its focus IS its commit decision; this reads that one
 * declaration and hands each layer the rule that follows from it. Nothing is
 * kept in agreement by hand, which is the whole reason it lives here rather
 * than on the layers -- see LAYER SCHEMA item 12.
 */
function showFor(layer, follows) {
  const candidates = layer.band === 'editable' && SHOW_APPLIES_TO.includes(layer.kind)
  return follows === 'focus' && candidates ? 'focused' : 'all'
}

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
function defineLayer(stepId, layer, follows) {
  const { id, band, kind, source, key = null, filter = null, treatment = null, points = null } = layer

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

  // `show` IS RESOLVED, NEVER DECLARED. It used to be a per-layer field that
  // roads set to 'focused' and every other layer left at 'all' -- a second
  // statement of the step's own `selection.follows`, kept true by hand. This
  // refusal is what makes the derivation the only way to get one. See
  // LAYER SCHEMA item 12.
  if ('show' in layer) {
    throw new Error(
      `Step '${stepId}' layer '${id}' declares \`show\`. Visibility that tracks focus ` +
        `is a STEP-level fact -- declare \`selection: { follows: 'focus' }\` on the step ` +
        `and the layers that need it resolve to '${LAYER_SHOW[1]}'.`
    )
  }
  const show = showFor({ band, kind }, follows)

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

  if (kind === 'point' && typeof points !== 'function') {
    throw new Error(
      `Step '${stepId}' layer '${id}' is a point layer with no \`points\` reader. ` +
        'A point layer says how its source becomes [{id, position}]; the stack ' +
        'never learns what the source looks like.'
    )
  }
  if (kind !== 'point' && points !== null) {
    throw new Error(
      `Step '${stepId}' layer '${id}' declares \`points\` but is a ${kind}, not a point layer.`
    )
  }

  return Object.freeze({ id, band, kind, source, key, filter, treatment, show, points })
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
  instructions = {},
  buttons = {},
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
    /**
     * THE `loading` CHROME IS THE FACTORY'S, and every document-backed step
     * gets it without asking.
     *
     * It is the one state no step has anything of its own to say about: the
     * fact is "this step's payload has not arrived", which is the same fact
     * for landform, water and the four still to come. A per-step sentence
     * would be four rewrites of one sentence.
     *
     * NO BUTTONS AT ALL, which is the whole point of the state. The bar and
     * the banner both fall back safely for an undeclared state -- the blurb,
     * and nothing -- but falling back is not the same as saying so, and the
     * commit this state exists to withhold is too important to leave to a
     * default. See LOADING in useStepMachine for what an armed commit costs
     * here.
     *
     * A STEP MAY OVERRIDE EITHER, the same as every other default in this
     * factory: the spread puts the step's own declaration last.
     */
    instructions: { [LOADING]: 'Fetching what this step proposed…', ...instructions },
    buttons: { [LOADING]: [], ...buttons },
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
      // THE DECLARED INPUTS RIDE THE COMMIT, assembled from the declarations
      // rather than read raw off the draft -- see commitInputsFor. A step
      // declaring none sends none, exactly as before.
      run:
        commit?.run ??
        ((actions, context) =>
          actions.commit(context.stepId, {
            inputs: commitInputsFor(context.definition, context),
          })),
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
    groupOf = null,
    selection = { mode: 'multiple' },
    accumulate = null,
    removeTab = null,
    resetNote = null,
    focusSeed = null,
  } = definition

  if (!id) throw new Error('A step definition needs an id.')
  if (!SELECTION_MODES.includes(selection?.mode)) {
    throw new Error(
      `Step '${id}' declares selection mode '${selection?.mode}'. ` +
        `It has to be one of: ${SELECTION_MODES.join(', ')}.`
    )
  }
  const follows = selection?.follows ?? null
  if (!SELECTION_FOLLOWS.includes(follows)) {
    throw new Error(
      `Step '${id}' declares selection.follows='${follows}'. ` +
        `It has to be one of: ${SELECTION_FOLLOWS.map(String).join(', ')}.`
    )
  }
  // ONE FOCUS SLOT HOLDS ONE THING. A step whose checkboxes follow the focus
  // could never hold two checked tabs, which is exactly what 'multiple' means
  // -- so the pair is refused here rather than producing a strip that quietly
  // behaves like a radio while its definition says otherwise.
  if (follows === 'focus' && selection.mode !== 'radio') {
    throw new Error(
      `Step '${id}' binds its selection to the focus but declares mode ` +
        `'${selection.mode}'. Focus is one feature, so \`follows: 'focus'\` is ` +
        `only coherent with 'radio'.`
    )
  }
  if (groupOf !== null && typeof groupOf !== 'function') {
    throw new Error(`Step '${id}' declares a non-function \`groupOf\`.`)
  }
  if (accumulate !== null) {
    for (const field of ['inputKey', 'inputsList', 'candidates', 'candidateKey']) {
      if (typeof accumulate[field] !== 'string' || !accumulate[field]) {
        throw new Error(`Step '${id}' accumulates but declares no \`accumulate.${field}\`.`)
      }
    }
    if (!inputs.some((input) => input.key === accumulate.inputKey)) {
      throw new Error(
        `Step '${id}' accumulates by input '${accumulate.inputKey}', which it does not declare.`
      )
    }
    if (!Number.isInteger(accumulate.max) || accumulate.max < 1) {
      throw new Error(`Step '${id}' accumulates with no positive \`accumulate.max\`.`)
    }
  }
  for (const input of inputs) {
    if (!input.key) throw new Error(`Step '${id}' declares an input with no key.`)
  }
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
    layers: Object.freeze(layers.map((layer) => defineLayer(id, layer, follows))),
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
    groupOf,
    selection: Object.freeze({ mode: selection.mode, follows }),
    accumulate: accumulate && Object.freeze({ ...accumulate }),
    removeTab,
    resetNote,
    focusSeed,
  })
}

export { commitValueOf, requiredInputsMissing, commitInputsFor }

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

  /* NO `resetNote`, AND IT IS THE SAME FACT AS `reopen: null` READ FROM THE
     OTHER END. A reset note is what a step says when SOMETHING ABOVE IT is
     reopened; nothing is above the boundary, so it can never appear in a
     reset list and a note here would be prose no dialogue can reach. Every
     step that CAN appear in one declares its own -- see landform, water and
     roads. */
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
    // NO CHECKBOX AND NO ×. The ring is not a candidate within the step, it IS the
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
    return cautionsFor(multi, exclusionGrounds(references[LANDFORM_EXCLUSIONS_LAYER]))
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

    const cautions = cautionsFor(multi, exclusionGrounds(references[LANDFORM_EXCLUSIONS_LAYER]))
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
    /* THE THREE ZONE LAYERS, ALL CARRYING PRODUCTION'S OWN MARK.
       `treatment` is declared on each rather than left to be derived, and
       that is the change this step needed once a second step existed: the
       hatch used to be pinned to every proposal polygon by one blanket
       stylesheet rule, so water inherited production's mark the moment it
       declared a layer. A step's mark follows its declaration now.

       THE COMMITTED LAYER DECLARES IT TOO, which is what makes a committed
       zone keep its hatch instead of collapsing to an outline. It is the same
       ground and the same purpose; what changed is that the decision is made,
       and that is said by the pattern's LEVEL (--pattern-committed) rather
       than by swapping the mark for a different one. */
    { id: 'landform-suggested', band: 'editable', kind: 'polygon', source: 'proposals', key: 'suggested_zones', treatment: 'production' },
    { id: 'landform-drawn', band: 'editable', kind: 'polygon', source: 'draft', treatment: 'production' },
    { id: 'landform-committed', band: 'committed', kind: 'polygon', source: 'document', treatment: 'production' },
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

  /**
   * WHAT A RESET OF THIS STEP COSTS, in landform's own terms.
   *
   * Landform is only ever reset by a reopen of the step above it, so this is
   * written for a confirmation nothing in this build can currently raise --
   * the boundary declares no reopen. It is declared anyway, because the
   * alternative is the shell having a step in a reset list it can say nothing
   * about, and because the day a step lands between the boundary and this one
   * is not the day to notice.
   *
   * A DRAWN ZONE IS NAMED SEPARATELY WHEN THERE IS ONE. Every committed zone
   * is work; a drawn one is the only work here that cannot be recovered by
   * generating again and picking the same shapes, and a person deciding
   * whether to reopen needs that difference more than they need the total.
   * Off the document's own provenance map -- the same record the commit
   * wrote -- rather than inferred from a feature id.
   */
  resetNote: (state) => {
    const zones = committedFeatureCount(state, 'landform')
    if (!zones) return 'the production ground decided for this parcel'
    const drawn = drawnFeatureCount(state, 'landform')
    const note = [measured(zones, 0), ` committed production zone${plural(zones)}`]
    if (drawn) note.push(', ', measured(drawn, 0), ' of them drawn by hand')
    return note
  },

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
   * `selected` is carried so the strip can show what a commit would take, and
   * it is what the tab's CHECKBOX reads.
   */
  tabs: ({ proposals, draft }) => {
    const selected = new Set(draft.selectedFeatureIds)

    // THE SUGGESTIONS. Every one carries a checkbox and none carries an ×: a
    // suggestion cannot be destroyed, because the server made it and will make
    // it again on the next generate. Un-checking it is the only removal there
    // is, and offering an × that quietly did the same thing would be a lie
    // about what the button does.
    const tabs = (proposals?.zones ?? []).map((zone) => ({
      id: zone.feature_id,
      name: `Zone ${zone.rank}`,
      checkbox: true,
      selected: selected.has(zone.feature_id),
      rows: [
        { value: measure(zone.area_acres), label: 'acres' },
        { value: measure(zone.score), label: 'score' },
      ],
    }))

    // THE DRAWN ZONES. A checkbox AND an ×, and the two mean different
    // things: un-checking takes the zone out of the commit and leaves it to be
    // put back, the × destroys it. Nothing else in this app can be destroyed
    // by the user, which is why only these carry one.
    draft.drawnFeatures.forEach((feature, index) => {
      tabs.push({
        id: feature.id,
        name: `Drawn ${index + 1}`,
        drawn: true,
        checkbox: true,
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

/* THE FLAG-CONSEQUENCE TABLE IS GONE, and its absence is the point.
   It translated water_survey_areas' FLAG_* constants into the terms someone
   standing on the land would use -- which is exactly the editorial decision
   the backend's `panel` block now makes, beside the measurements, as data.
   A second table over here would be a second set of words for one set of
   facts, and the one over here is the copy that goes stale silently.
   (UNAVAILABLE_CONSEQUENCE and WATER_UNCHECKED_CONSEQUENCE stay: those are
   STEP-LEVEL notices about checks that did not run, which no per-zone panel
   row answers.) */

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
 * THE PANEL: THE SERVER'S OWN ROWS FOR ONE ZONE, joined by feature id.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A REFACTOR. This panel used to be four
 * groups of fields chosen HERE -- gravity and acreage, terrain, agreement,
 * cautions -- each reading a named property off the feature. Two things were
 * wrong with that and only one of them was verbosity.
 *
 * THE TYPE. `anchor acres` and `members` are EXCAVATED vocabulary. An
 * embankment zone is a valley compartment and has neither, so those two rows
 * rendered an em dash on half the zones on the map -- not a missing
 * measurement, a question that does not apply. A field list written on this
 * side cannot dispatch on a type whose vocabulary it does not own.
 *
 * THE ALTITUDE. A survey panel answers one question -- SHOULD I WALK THIS --
 * and slope, depression depth, catchment acreage, representative elevation
 * and the per-criterion scores do not help answer it. They are the DIAGNOSTIC
 * record, they are all still on the feature, and the diagnostic view is the
 * export.
 *
 * Both are editorial decisions about measurements, and they belong beside the
 * measurements. water_survey_areas.build_zone_panel() now makes them and
 * ships the result as DATA: an ordered list of {key, label, value, unit}, type
 * dispatched, cautions present only when they fire. So the panel can be
 * retuned -- a row added, dropped, reordered, relabelled -- without a
 * deploy of this file, and the two survey types cannot drift into being
 * rendered by one hardcoded list again.
 *
 * WHAT THIS SIDE STILL OWNS is typography: which column a value sits in, and
 * how a scale is read against it. That is the split the backend's own note
 * makes -- `key` is the stable identifier, `label` is display prose.
 *
 * THE JOIN IS ON feature_id, WHICH THE PAYLOAD GIVES US. `payload.zones` is
 * the backend's tabular digest, keyed by the INTERNAL zone id; the tabs, the
 * map and the commit body all key on the WIRE feature id. Every row carries
 * `feature_id` -- carried off its own feature by the assembler, never rebuilt
 * from a template -- so this is a lookup rather than a reconstruction. The
 * same precedent production's zone list follows.
 */
export function surveyZonePanel(proposals, featureId) {
  const row = (proposals?.zones ?? []).find((entry) => entry.feature_id === featureId)
  return Array.isArray(row?.panel) ? row.panel : []
}

/**
 * ONE PANEL ROW, rendered.
 *
 * NULL IS AN EM DASH AND IS NEVER A ZERO. The backend puts a never-checked
 * overlap on the panel as its own row with a null value precisely so it can be
 * told apart from a measured 0.0 -- which it omits entirely, having nothing to
 * caution anyone about. A `?? 0` anywhere on this path would print an
 * unmeasured thing as a measured absence, which is the one coercion this whole
 * contract exists to prevent.
 *
 * A BOOLEAN ROW IS PRESENT ONLY WHEN IT FIRES, so `true` is the only value one
 * can carry and "yes" is what it says. There is no "no" case to render.
 *
 * TWO ROWS READ AGAINST THE `scales` BLOCK, which is the whole reason that
 * block is on the wire:
 *
 *   rank         `2` alone is not a reading. `scales.rank[type].count` is the
 *                denominator and rank is PER TYPE, so it renders "2 of 3".
 *   suitability  `0.53` against a theoretical 1.0 says "barely half". The
 *                soil criterion's parcel range caps the blend, so the honest
 *                denominator is the parcel's own attainable ceiling --
 *                `scales.suitability.parcel_observed_max[type]`, measured by
 *                the backend off its own surface.
 *
 * Both fall back to the bare number when the scale is absent: a payload
 * without scales is older, not wrong, and a missing denominator must not blank
 * a measurement.
 *
 * EVERY OTHER NUMBER IS PRINTED AS THE BACKEND SENT IT -- no toFixed, no
 * rescale. The pipeline rounds at its own documented boundary and those values
 * are contractually FINAL; a second rounding pass here would be a second
 * boundary for numbers that already have one.
 */
export function panelValue(row, scales, surveyType) {
  if (row.value == null) return '\u2014'
  if (row.value === true) return 'yes'
  if (row.key === 'rank') {
    const count = scales?.rank?.[surveyType]?.count
    return count == null ? String(row.value) : `${row.value} of ${count}`
  }
  if (row.key === 'suitability') {
    const ceiling = suitabilityCeiling(scales, surveyType)
    return ceiling == null ? String(row.value) : `${row.value} of ${ceiling}`
  }
  return String(row.value)
}

/**
 * THE PARCEL'S OWN ATTAINABLE SUITABILITY, for one survey type, or null.
 *
 * ONE READER FOR THE ONE FIGURE TWO SURFACES SHOW. The detail panel and the
 * tab both print `mean_suitability`, and a fraction is only readable against
 * a denominator -- so both have to reach the same one, off the same key, and
 * a second spelling of that path is a second answer waiting to disagree with
 * the first.
 *
 * WHY THIS DENOMINATOR RATHER THAN 1.0. `scales.suitability` says min 0.0,
 * max 1.0 -- and reading 0.53 against 1.0 says "barely half" when the honest
 * reading is "0.53 of an attainable 0.68". The soil criterion's own parcel
 * range caps the blend: on a parcel whose best soil scores 0.6, no cell can
 * reach 1.0 however good its slope, catchment and wetness. The backend
 * measures the ceiling off its own gate-masked surface and ships it PER TYPE,
 * because the two surfaces are kept apart end to end and are never comparable
 * on one scale.
 *
 * NULL WHEN THE PAYLOAD DOES NOT CARRY IT, and every caller falls back to the
 * bare number. A payload without `scales` is OLDER, not wrong, and a missing
 * denominator must not blank a measurement.
 *
 * NO THRESHOLD AND NO DEFAULT CEILING IS WRITTEN HERE. That is the same rule
 * scoreBandName() states for landform's bands: a copy of the backend's own
 * numbers on this side is a second source of truth that goes stale silently
 * the first time they are retuned.
 */
export function suitabilityCeiling(scales, surveyType) {
  return scales?.suitability?.parcel_observed_max?.[surveyType] ?? null
}

/**
 * The backend's rows as detail-panel fields, in the backend's order.
 *
 * MEASURED IFF THE VALUE IS A NUMBER, which is what puts figures in the fixed
 * width first column and leaves categorical readings -- the survey type, the
 * water-delivery answer, which terminator a dam reach sits against -- as prose
 * spanning both. The panel's own two-column rule, applied to a row set this
 * side did not choose.
 *
 * THE UNIT RIDES THE LABEL, not the figure. "20 feet" in the figure column
 * widens the column for every other row with a word, which is the exact
 * failure the measured/prose split was introduced to fix; the backend's labels
 * deliberately never spell their own unit, so appending it here adds the
 * backend's own word rather than one of ours.
 */
export function panelFields(rows, scales) {
  const surveyType = rows.find((row) => row.key === 'survey_type')?.value
  return rows.map((row) => ({
    label: row.unit ? `${row.label} (${row.unit})` : row.label,
    value: panelValue(row, scales, surveyType),
    measured: typeof row.value === 'number',
  }))
}

/**
 * How many decimal places water's own figures carry.
 *
 * NOT MEASURE_DP, AND SEE measure()'s NOTE FOR WHY. mean_suitability is a
 * weighted-overlay fraction on 0-1 (0.5260, 0.7933, 0.5586 on the reference
 * parcel), so one decimal place prints all three as "0.5" -- a column of
 * identical numbers for zones the pipeline ranked apart.
 *
 * TWO OF THE THREE WENT WITH THE PANEL. METRIC_DP existed for the depth and
 * catchment figures the detail panel printed, and those are not on the panel
 * any more (they are on the feature, and the export reads them); the
 * PANEL's own numbers are printed as the backend sent them, at the backend's
 * own rounding boundary -- see panelValue(). What is left is the TAB's
 * suitability figure, which this side still chooses the precision of because
 * the tab's two rows are this side's design, and the dropped-count in the
 * step notice.
 */
const SUITABILITY_DP = 2
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
    /* TWO COMMITTED LAYERS, FOR THE REASON THERE ARE TWO EDITABLE ONES. A
       committed water step carries both survey types in one FeatureCollection
       -- the document holds what was committed, and a commit spans both
       layers freely -- so the same `filter` that splits the proposals splits
       the document, and each half keeps its own value at the committed level.
       One undifferentiated committed layer would have been the one place the
       two types stopped being told apart, which is exactly where a later step
       is reading them. */
    {
      id: 'water-committed-embankment',
      band: 'committed',
      kind: 'polygon',
      source: 'document',
      filter: isSurveyZoneOfType('embankment'),
      treatment: 'survey-embankment',
    },
    {
      id: 'water-committed-excavated',
      band: 'committed',
      kind: 'polygon',
      source: 'document',
      filter: isSurveyZoneOfType('excavated'),
      treatment: 'survey-excavated',
    },
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
   * on the next generate. Un-checking the box is the only removal there is.
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

  /**
   * WHAT A RESET OF THIS STEP COSTS, for the landform step's reopen dialogue.
   *
   * "SURVEY AREAS", WHICH IS THIS STEP'S OWN WORD FOR THEM -- its committed
   * instruction says "These survey areas are committed", and a confirmation
   * calling them something else would be the shell paraphrasing a step it
   * does not understand.
   *
   * THE COUNT IS THE COMMITTED ONE, not the generated one. What a reset takes
   * is the DECISION -- which ground out of the two surveys' reading this
   * design is committing to pond -- and the proposals come back with the next
   * generate. A step holding work with nothing committed has no honest number
   * and gets the sentence below instead.
   */
  resetNote: (state) => {
    const areas = committedFeatureCount(state, 'water')
    if (!areas) return 'the survey areas picked out on this parcel'
    return [measured(areas, 0), ` committed survey area${plural(areas)}`]
  },

  /* MEMBERS ARE NOT PROPOSALS. See surveyZoneFeatures(). */
  proposalFeatures: surveyZoneFeatures,

  // NOTHING IS DRAWN HERE, so there is no shape to read. `null` is the
  // declared value for that and the draw gesture is never mounted anyway --
  // `tools` names no `draw`.
  shape: null,

  instructions: {
    [IDLE]: 'Ground worth surveying for a pond, from two independent readings.',
    [GENERATING]: 'Reading the parcel — wetness, depressions, catchment, slope, and soil…',
    [REVIEWING]: 'Click an area to read it. The checkbox on its tab decides whether it is committed.',
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
    const scales = proposals?.scales

    // EVERY TAB CARRIES A CHECKBOX AND NO TAB CARRIES AN ×. Nothing here is
    // user-authored, so nothing here can be destroyed -- see `tools` above.
    // `removable` is simply not declared, which is how the strip is told.
    return surveyZoneFeatures(proposals).map((feature) => {
      const ceiling = suitabilityCeiling(scales, feature.properties?.survey_type)
      return {
        id: feature.id,
        name: surveyZoneName(feature.properties),
        checkbox: true,
        selected: selected.has(feature.id),
        rows: [
          { value: measure(feature.properties?.zone_acres), label: 'acres' },
          {
            /**
             * THE SUITABILITY, AGAINST THE SCALE THE PAYLOAD SHIPPED FOR IT.
             *
             * A BARE "0.56" IS NOT A READING. It was the last figure on this
             * step still printed with nothing to read it against -- the detail
             * panel has read `scales` since the panel became the server's own
             * rows, and the tab had not caught up. Two decimals of a 0-1
             * fraction with no denominator is a number nobody can act on, and
             * this tab exists to be acted on: it is the two figures someone
             * scans to decide which area to walk.
             *
             * THE DENOMINATOR RIDES THE LABEL, NOT THE FIGURE, which is the
             * rule the panel's own units follow (see panelFields). The value
             * column is a fixed-width monospace column whose whole job is to
             * hold the decimal point still down a strip of tabs; "0.56 of
             * 0.68" in it widens that column for every tab and turns a column
             * of figures into a column of phrases. The label is the prose
             * half, and "of 0.68 suitability" is prose.
             *
             * NO BAND NAME, AND THAT IS THE PAYLOAD'S SHAPE RATHER THAN A
             * CHOICE. Landform's `scales` carries `bands` and `band_bounds`,
             * so scoreBandName() can name 74 "good" without this side knowing
             * where good starts. WATER'S CARRIES NEITHER -- its scales block
             * is {suitability, rank, overlap_pct, boundary_adjacency_pct,
             * pinch_drainage_score, compartment_rank_score} -- so there is no
             * band to look up, and inventing one here would mean writing this
             * pipeline's thresholds down on the client, which is the one thing
             * the block exists to prevent. What water DOES ship is the
             * parcel's own measured ceiling, and that is what is rendered.
             *
             * BOTH FIGURES AT THE TAB'S OWN PRECISION. SUITABILITY_DP is this
             * side's choice (see its note) and the ceiling is printed at it
             * too -- "0.56 of 0.675" would be two precisions in one reading.
             * The panel, which prints the backend's numbers as sent, shows the
             * unrounded pair.
             */
            value: measure(feature.properties?.mean_suitability, SUITABILITY_DP),
            label:
              ceiling == null
                ? 'suitability'
                : `of ${measure(ceiling, SUITABILITY_DP)} suitability`,
          },
        ],
      }
    })
  },

  /**
   * WHAT THE DETAIL PANEL SAYS ABOUT ONE SURVEY AREA: THE SERVER'S ROWS, IN
   * THE SERVER'S ORDER.
   *
   * ONE UNLABELLED GROUP, WHICH IS THE HONEST SHAPE NOW. The four labelled
   * groups this replaces existed because the ORDER was this file's argument
   * and the groups were how it was made. The order is the backend's argument
   * now -- build_zone_panel() ships the rows already sequenced, the five
   * always-rows first and every caution after them, present only when it
   * fires -- so grouping them again over here would be this side re-asserting
   * a structure it no longer decides.
   *
   * IT READS THE TABULAR ROW, NOT THE FEATURE, AND THAT IS THE REVERSAL. The
   * old note here argued for reading the feature because it was "the only
   * complete source" -- slope, elevation, soil coverage and the rest are on
   * the feature and not in the digest. All of that is still true and none of
   * it is on this panel any more: those are the DIAGNOSTIC record, the
   * feature keeps every one of them, and the export is where they are read.
   * What this panel needs is the curated subset, and that is on the row.
   *
   * THE NAME STILL COMES FROM THE FEATURE. surveyZoneName() is this app's
   * vocabulary for an identity the tabs and the map use too, and it must be
   * the same words in all three places.
   *
   * THE SENTINELS SURVIVE BECAUSE NOTHING COERCES THEM, still. The backend
   * omits a measured 0.0 overlap (nothing to caution about) and KEEPS a
   * never-checked one as a row with a null value; panelValue() prints an em
   * dash for that null and nothing on this path can turn it into a zero.
   *
   * NO cautions CHANNEL. That channel carries the exclusion layers' own
   * `{type, label, acres}` and a survey zone crosses none of them; the
   * cautions that DO apply to a zone are rows the backend chose, in the run
   * of rows above.
   */
  detail: ({ proposals }, featureId) => {
    const feature = zoneFeature(proposals, featureId)
    if (!feature) return null
    const rows = surveyZonePanel(proposals, featureId)
    if (!rows.length) return null

    return {
      name: surveyZoneName(feature.properties),
      fields: panelFields(rows, proposals?.scales),
      cautions: [],
    }
  },
})

/* ===========================================================================
   THE ROADS STEP
   ===========================================================================
   The third definition, and the first that breaks the model the first two
   share. Landform and water receive N candidates from ONE generate and the
   user picks among them. Roads receives ONE NETWORK per generate -- the
   branches inside it are a tree, not alternatives -- and the CANDIDATES ARE
   NETWORKS, made by generating from different access points. They
   accumulate, up to three; any may be discarded; exactly one, or none, is
   committed. See LAYER SCHEMA items 6-11 for the six fields that cost.
   --------------------------------------------------------------------------- */

/**
 * The layer name the backend's roads commit contract requires, verbatim:
 * wire_translation.LAYER_ROAD_CORRIDOR.
 */
export const ROAD_CORRIDOR_LAYER = 'suggested_road_corridor'

/** The input the roads step collects, and the document key every tried value is recorded under. */
export const ACCESS_POINT_INPUT = 'access_point'
export const ACCESS_POINTS_LIST = 'access_points'

/**
 * The cap on candidate networks. THE SERVER OWNS THIS -- step_registry's
 * Accumulation.max_candidates -- and refuses a fourth generate with a 409
 * naming the three it holds. The client reads its own copy only to say so
 * before the request; a drift between the two would show as a refusal the
 * client did not predict, never as a fourth candidate.
 */
export const MAX_ROAD_NETWORKS = 3

/** The branch roles the backend emits, in the order a panel lists them. */
const BRANCH_ROLE_WORDS = Object.freeze({ trunk: 'Trunk', spur: 'Spur', water_spur: 'Water spur' })

/** Whole feet: the tab's length figure. build_narrative_data() ships one decimal; a tab has no room for it. */
const LENGTH_DP = 0

/**
 * WHICH NETWORK A BRANCH BELONGS TO. The backend stamps every branch with
 * its network's id (`properties.network_id`, the same key the commit
 * contract groups by), so grouping is a property read and never an
 * inference from geometry.
 */
export function roadNetworkOf(feature) {
  return feature?.properties?.network_id ?? null
}

/** The candidate records a roads payload carries, in the order tried. */
export function roadNetworks(payload) {
  return Array.isArray(payload?.networks) ? payload.networks : []
}

/** One network's record, by its id. */
function roadNetwork(payload, networkId) {
  return roadNetworks(payload).find((network) => network.network_id === networkId) ?? null
}

/**
 * The access points a roads payload's networks were generated from, as
 * markers: one per candidate, keyed by the network so a click on the marker
 * is a click on the network.
 *
 * WIRE ORDER IN, MAP ORDER OUT. The record carries [lon, lat]; a marker takes
 * [lat, lng]. pointFromGeoJSON does the one swap, the single-point sibling of
 * the ring helper every other reader of wire coordinates uses (a one-point
 * ring would "close on itself" and come back empty).
 */
export function networkAccessPoints(networks) {
  return roadNetworks({ networks }).map((network, index) => ({
    id: network.network_id,
    position: pointFromGeoJSON(network.access_point),
    label: `Access point ${index + 1}`,
  }))
}

/** The access point placed and not yet generated from, if any. Held in [lat, lng]. */
function pendingAccessPoint(value) {
  return Array.isArray(value) && value.length === 2 ? [{ id: 'pending', position: value }] : []
}

/**
 * The committed network's access point, off the committed features
 * themselves: every branch carries `properties.access_point` [lon, lat], and
 * every branch of one network carries the same one.
 */
function committedAccessPoints(collection) {
  const seen = new Map()
  for (const feature of collection?.features ?? []) {
    const id = roadNetworkOf(feature)
    const point = feature.properties?.access_point
    if (id && Array.isArray(point) && !seen.has(id)) {
      seen.set(id, { id, position: pointFromGeoJSON(point), label: 'Access point' })
    }
  }
  return [...seen.values()]
}

/** The ordinal of a network among the candidates, 1-based, or null. */
function networkIndex(payload, networkId) {
  const index = roadNetworks(payload).findIndex((network) => network.network_id === networkId)
  return index < 0 ? null : index + 1
}

/**
 * A NETWORK'S NAME: "Access point N".
 *
 * THE DISTINGUISHING FACT IS WHERE THE DRIVEWAY MEETS THE ROAD, and the
 * coordinates that say so are eleven digits each -- far too long for a tab
 * row, and unreadable as an identity even if they fit. The ordinal is the
 * order the user tried them in, which they will remember ("the second one I
 * placed"), and the marker on the map is the location. The panel could
 * carry the coordinates and does not: a lat/lng pair tells nobody standing
 * on a field anything the marker does not.
 *
 * "Road network N" was the alternative and it names the wrong thing: the
 * networks are what differ, but the ACCESS POINT is what the user chose and
 * the network is what the pipeline made of it.
 */
export function roadNetworkName(payload, networkId) {
  const index = networkIndex(payload, networkId)
  return index == null ? 'Access point' : `Access point ${index}`
}

/**
 * The [lon, lat] a generate sends for the draft's pending access point.
 * The tool writes [lat, lng] (Leaflet's order, every drawing tool's); the
 * wire wants [lon, lat]; pointToGeoJSON does the swap.
 */
export function accessPointParams(draft) {
  const pending = draft?.inputs?.[ACCESS_POINT_INPUT]
  if (!Array.isArray(pending) || pending.length !== 2) return null
  return { [ACCESS_POINT_INPUT]: pointToGeoJSON(pending) }
}

/**
 * EVERY ACCESS POINT THE SERVER RECORDED for this step, in wire order --
 * what the commit sends under `access_points`.
 *
 * OFF THE MIRROR, NOT THE DRAFT. The draft holds the ONE point pending a
 * generate; the list of every point tried is server state, written by each
 * generate and each discard onto the document's step entry
 * (design_document.record_step_inputs) and mirrored here. A commit body
 * carries all of them, including the alternatives, so a reopen restores the
 * user's whole work rather than the network they picked.
 *
 * [] WHEN NONE WAS EVER PLACED, and never undefined: "no road, and no access
 * point was placed" is a legal empty commit. What would be undefined is a
 * step entry that carries a list under some other shape, and that is a
 * contract breach rather than an empty decision.
 */
export function recordedAccessPoints(state, stepId) {
  const inputs = selectStepInputs(state, stepId)
  const list = inputs?.[ACCESS_POINTS_LIST]
  if (inputs == null || inputs[ACCESS_POINTS_LIST] === undefined) return []
  return Array.isArray(list) ? list : undefined
}

/** How many candidate slots are free. Reads the recorded list, which the cap is enforced against. */
export function roadSlotsRemaining(state, stepId) {
  const recorded = recordedAccessPoints(state, stepId) ?? []
  return Math.max(0, MAX_ROAD_NETWORKS - recorded.length)
}

/** Is the pending point one the server already holds -- a regenerate rather than a fourth candidate? */
function pendingIsRecorded(state, stepId, draft) {
  const params = accessPointParams(draft)
  if (!params) return false
  const [lon, lat] = params[ACCESS_POINT_INPUT]
  return (recordedAccessPoints(state, stepId) ?? []).some(
    (point) => Number(point[0]) === lon && Number(point[1]) === lat
  )
}

/**
 * Why a new access point cannot be added, or null when one can.
 *
 * THE UI REFLECTS THE CAP; IT DOES NOT OWN IT. The sentence is here so the
 * button can say why before the server says 409, and the number comes off
 * the same declaration the button reads.
 */
export function addAccessPointBlocked(context) {
  if (roadSlotsRemaining(context.state, context.stepId) > 0) return null
  return (
    `${MAX_ROAD_NETWORKS} access points are placed, which is the most this step ` +
    'compares. Discard one to try another.'
  )
}

/**
 * THE ONE BUTTON THAT PLACES AND GENERATES, in two states.
 *
 * With no point pending it ARMS the placement tool; with one pending it
 * GENERATES from it. One slot in the banner carries both because they are
 * one gesture in two halves -- put the point down, then route from it -- and
 * the banner holds two buttons, the other of which is the commit.
 *
 * NEVER AUTO-ARMED. The step opens with this button and nothing armed; the
 * user asks to place a point. A tool that armed itself on step entry would
 * turn every stray map click into a decision about where the driveway is.
 */
const ROADS_ACCESS_SPEC = {
  key: 'access',
  label: ({ machine }) =>
    accessPointParams(machine.draft) ? 'Generate from this point' : 'Add access point',
  enabled: ({ machine }) => {
    if (accessPointParams(machine.draft)) return machine.canGenerate
    return machine.reachable && addAccessPointBlocked(machine.context) == null
  },
  blocked: ({ machine }) =>
    accessPointParams(machine.draft) ? null : addAccessPointBlocked(machine.context),
  run: async ({ machine, arm, disarm, focusFeature }) => {
    if (!accessPointParams(machine.draft)) return arm('draw')
    return generateRoadNetwork({ machine, disarm, focusFeature })
  },
}

/**
 * THE SAME BUTTON, TWICE, AND THE ONLY DIFFERENCE IS THE ACCENT.
 *
 * ONE ACCENT PER STATE, and the accent is the state's FORWARD MOVE. From an
 * empty step, placing the access point is the forward move -- there is
 * nothing else to move toward -- so it carries the oxide. From `reviewing`
 * there is already a network and the forward move is the COMMIT; adding
 * another access point is a lateral one, a second thing to compare, and a
 * step that painted it in the accent beside the commit would be offering two
 * forward moves and letting the user pick which one the design meant.
 *
 * THE PRECEDENT IS LANDFORM'S, EXACTLY. Its `reviewing` is [LANDFORM_DRAW,
 * COMMIT_BUTTON] -- "Draw a zone" beside the commit -- and LANDFORM_DRAW
 * takes stepButton's default `secondary`. This is the same pairing and now
 * takes the same answer; it did not, and roads was simply never in the loop
 * that checks the rule (style.test.jsx section 4, which now includes it).
 */
const ROADS_ACCESS = stepButton({ ...ROADS_ACCESS_SPEC, tone: 'primary' })
const ROADS_ACCESS_BESIDE_COMMIT = stepButton({ ...ROADS_ACCESS_SPEC, tone: 'secondary' })

/**
 * Route a network from the pending access point.
 *
 * THE PENDING POINT IS CLEARED ON SUCCESS AND FOCUS MOVES TO THE NEW
 * NETWORK. The server has recorded the point (it is in the document that
 * came back with the payload), so the draft's copy would now draw a second
 * marker over the server's; and the network just made is the one the user
 * is about to look at. On failure the point stays, so the retry is one click.
 *
 * THE CAP IS THE SERVER'S. A fourth point is refused with a 409 naming the
 * three held (CandidateCapReachedError); the store surfaces it as a step
 * error and the bar prints it. addAccessPointBlocked() means the button is
 * disabled before that request goes out, so the 409 is the backstop and not
 * the message.
 */
async function generateRoadNetwork({ machine, disarm, focusFeature }) {
  const params = accessPointParams(machine.draft)
  if (!params) return false
  disarm()
  const before = new Set(roadNetworks(machine.proposals).map((n) => n.network_id))
  const generated = await machine.generate()
  if (!generated) return false
  machine.actions.setDraftInput(machine.stepId, ACCESS_POINT_INPUT, undefined)
  // THE NETWORK THIS GENERATE ADDED is the one not there before it, read off
  // the payload the generate resolved with (the machine in this closure still
  // holds the payload from before the request). An access point already
  // tried comes back as the same network (the ids are stable), so that one is
  // found by its point instead. Not by comparing the point sent with the
  // point returned, which the wire may have rounded.
  const [lon, lat] = params[ACCESS_POINT_INPUT]
  const made = roadNetworks(typeof generated === 'object' ? generated : null)
  const target =
    made.find((n) => !before.has(n.network_id)) ??
    made.find((n) => Number(n.access_point?.[0]) === lon && Number(n.access_point?.[1]) === lat)
  if (!target) return true
  if (focusFeature) focusFeature(target.network_id)
  // THE FIRST NETWORK IS THE ONE THAT COMMITS UNTIL THE USER SAYS OTHERWISE.
  // A draft that has selected nothing (the point was placed before any
  // proposals existed, so the store's seed never ran) takes this one; a later
  // generate is a comparison and does not take the tick off the network the
  // user has already chosen.
  if (!machine.draft?.selectedFeatureIds?.length && target.feature_ids?.length) {
    machine.actions.setSelection(machine.stepId, [...target.feature_ids])
  }
  return true
}

/** While placing: generate from what is placed, or put the tool down. */
const ROADS_GENERATE = stepButton({
  key: 'generate',
  tone: 'primary',
  label: 'Generate network',
  enabled: ({ machine }) =>
    Boolean(accessPointParams(machine.draft)) &&
    machine.canGenerate &&
    (pendingIsRecorded(machine.context.state, machine.stepId, machine.draft) ||
      addAccessPointBlocked(machine.context) == null),
  blocked: ({ machine }) =>
    accessPointParams(machine.draft)
      ? addAccessPointBlocked(machine.context)
      : 'Click the property boundary where it meets the road.',
  run: ({ machine, disarm, focusFeature }) => generateRoadNetwork({ machine, disarm, focusFeature }),
})

/** Cancel placing: the tool goes down and the pending point with it. */
const ROADS_CANCEL = disarmButton({
  key: 'cancel',
  label: 'Cancel',
  run: ({ machine, disarm }) => {
    machine.actions.setDraftInput(machine.stepId, ACCESS_POINT_INPUT, undefined)
    disarm()
  },
})

/**
 * THE CONSTRAINTS A NETWORK WAS ROUTED UNDER, in consequence terms -- the
 * same rule landform's UNAVAILABLE_CONSEQUENCE follows. A constraint that
 * never ran is reported as NOT APPLIED, never as silently satisfied:
 * build_narrative_data() carries `*_available` flags for exactly this.
 */
const ROADS_UNCHECKED_CONSEQUENCE = {
  floodplain_data_available:
    'Floodplain and wet-soil data was unavailable, so these networks were not routed around wet ground.',
  canopy_data_available:
    'Canopy data was unavailable, so these networks pay nothing for crossing wooded ground.',
}

/** A yes/no reading for a boolean the backend measured. */
function yesNo(value) {
  return value == null ? '—' : value ? 'yes' : 'no'
}

export const ROADS_STEP = documentStep({
  id: 'roads',
  title: 'Roads',
  blurb: 'Farm roads grown from where the property meets the road.',
  layers: [
    { id: 'roads-offparcel', band: 'context', kind: 'scrim', source: 'document' },
    /* THE NETWORKS. One collection carries every candidate's branches
       (`road_corridors`), each branch stamped with its network; the stack
       draws by group, and ONLY THE FOCUSED GROUP.

       THAT RULE IS NOT WRITTEN HERE, AND THAT IS THE POINT. It used to be --
       `show: 'focused'` on this object -- and it said the same thing as the
       step's checkbox two declarations further down, kept true by hand. This
       is the one editable line layer of a step declaring
       `selection: { follows: 'focus' }`, so defineLayer RESOLVES it to
       `show: 'focused'` and there is nothing here to fall out of step with.
       See LAYER SCHEMA items 7 and 12. */
    {
      id: 'roads-networks',
      band: 'editable',
      kind: 'line',
      source: 'proposals',
      key: 'road_corridors',
      treatment: 'road',
    },
    /* THE ACCESS POINTS, ONE MARKER PER CANDIDATE, ALWAYS DRAWN. They are
       what distinguishes the alternatives, so they stay whatever is focused
       and whatever the checkboxes say -- which is also why `show` never
       reaches a point layer (see SHOW_APPLIES_TO). Keyed by the network, so a
       click on one is a click on its network -- the third way into the FOCUS
       sync beside the tab and the line; it reads a candidate rather than
       choosing it. Above the lines in the band. */
    {
      id: 'roads-access-points',
      band: 'editable',
      kind: 'point',
      source: 'proposals',
      key: 'networks',
      points: networkAccessPoints,
    },
    /* THE POINT PENDING A GENERATE, from the draft. The placement tool
       writes it and draws it while armed; this declaration is what keeps it
       on the map once the tool is down, and what the `draw` verb claims. */
    {
      id: 'roads-pending-access-point',
      band: 'editable',
      kind: 'point',
      source: 'draft',
      key: ACCESS_POINT_INPUT,
      points: pendingAccessPoint,
    },
    /* COMMITTED: the one network, dimmed by the pattern level and drawn
       whole -- `show: 'all'`, the default, because a settled network is
       context for every later step and is not a candidate any more. Its
       access point stays with it. */
    { id: 'roads-committed', band: 'committed', kind: 'line', source: 'document', treatment: 'road' },
    {
      id: 'roads-committed-access-point',
      band: 'committed',
      kind: 'point',
      source: 'document',
      points: committedAccessPoints,
    },
  ],

  /**
   * SELECT AND DRAW. `draw` is the access-point placement -- a `draw` over a
   * POINT layer, which StepTools serves with the point tool -- and `select`
   * is what renders the candidates and takes the click that focuses one. No
   * `delete`: a network is not destroyed by a map click, it is DISCARDED by
   * its tab's ×, which is a server verb (see removeTab).
   */
  tools: ['select', 'draw'],

  /**
   * THE ACCESS POINT, DECLARED. The first input any step collects. Its
   * generate value is the pending point in the draft (accessPointParams);
   * its COMMIT value is every point the server recorded, under
   * `access_points` -- see recordedAccessPoints. Required: a commit with no
   * list is refused before any request, and an EMPTY list is a value.
   */
  inputs: [
    {
      key: ACCESS_POINT_INPUT,
      label: 'Access point',
      kind: 'point',
      required: true,
      commitKey: ACCESS_POINTS_LIST,
      commitValue: ({ state, stepId }) => recordedAccessPoints(state, stepId),
    },
  ],
  generate: { label: 'Generate network', params: accessPointParams },

  /**
   * ACCUMULATE. The declaration the buttons, the discard and the cap read.
   * `candidates` names the payload record listing the sets (`networks`) and
   * `candidateKey` the id each carries and every branch is stamped with.
   */
  accumulate: {
    inputKey: ACCESS_POINT_INPUT,
    inputsList: ACCESS_POINTS_LIST,
    candidates: 'networks',
    candidateKey: 'network_id',
    max: MAX_ROAD_NETWORKS,
  },

  /**
   * ONE NETWORK OR NONE, AND THE TAB IS THAT DECISION.
   *
   * `mode: 'radio'` is the backend's max_features: 1 counted by network --
   * ticking one tab un-ticks the others, and un-ticking the last one is the
   * legal empty commit `min_features: 0` allows. There is no separate "commit
   * no road" affordance because there does not need to be one: the toggle is
   * the gesture.
   *
   * `follows: 'focus'` IS THE COLLAPSE, DECLARED RATHER THAN IMPLIED. Roads'
   * tab body checks its box, so through the strip what you are looking at is
   * what commits: there is no "focused but unchecked" tab to have. That one
   * fact is ALSO what makes the editable network layer draw only the focused
   * candidate -- `show: 'focused'` is RESOLVED from this line, not declared
   * up there beside the geometry where it would have to be kept in agreement
   * by hand. Two fields that happen to agree is a divergence waiting for its
   * first edit; this is one field. See LAYER SCHEMA item 12.
   *
   * WHAT IT DOES NOT REACH, because neither is the strip: the map's own click
   * (an access-point marker, a branch, the bare map) still FOCUSES and
   * changes no selection, and a later generate focuses the network it just
   * routed without taking the tick off the one already chosen. Both are
   * readings rather than choices, and both are exactly as they were.
   *
   * The one tab the collapse leaves out is the one with no checkbox -- an
   * access point that routed nothing (see `tabs`). Its body focuses, because
   * there is no network for the focus to commit.
   */
  selection: { mode: 'radio', follows: 'focus' },
  groupOf: roadNetworkOf,

  commit: {
    label: ({ committableCount }) =>
      committableCount === 0 ? 'Commit no road for this step' : 'Commit this network',
    canCommit: () => true,
    blockedReason: () => null,
  },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen roads?' },
  proposalCollection: 'road_corridors',
  shape: null,

  /**
   * WHAT A RESET OF THIS STEP COSTS, for the water step's reopen dialogue.
   * Reopening water resets roads to not_started and discards every placed
   * access point and the networks routed from them -- more work than any
   * prior step loses to a cascade, and the confirmation says so in those
   * terms rather than only naming the step.
   */
  resetNote: (state) => {
    const count = (recordedAccessPoints(state, 'roads') ?? []).length
    // NO POINTS AND STILL IN THE LIST is the deliberate empty commit -- "no
    // road for this step" -- and that decision is the loss. It used to return
    // null here, which put roads in the reset list with nothing after its
    // name: the one row in the dialogue that said only that a step resets.
    if (!count) return 'the decision to run no road on this property'
    return [
      measured(count, 0),
      ` placed access point${plural(count)} and the network${plural(count)} routed from ${
        count === 1 ? 'it' : 'them'
      }`,
    ]
  },

  /**
   * DISCARD IS A SERVER VERB. The × on a network's tab frees its slot on the
   * server (POST .../discard) and refetches the candidates; it is not a draft
   * deletion and it has no undo -- the way back is to place the point again.
   */
  removeTab: async (actions, context, tabId) => {
    const network = roadNetwork(context.proposals, tabId)
    if (!network) return false
    return actions.discardCandidate(context.stepId, {
      [ACCESS_POINT_INPUT]: network.access_point,
    })
  },

  /** When the draft is first seeded, look at the network it selected. */
  focusSeed: ({ draft, proposals }) => {
    const selected = new Set(draft.selectedFeatureIds)
    return (
      roadNetworks(proposals).find((n) => n.feature_ids?.some((id) => selected.has(id)))
        ?.network_id ?? null
    )
  },

  instructions: {
    [IDLE]: 'Add an access point where the property meets the road, and a network is routed from it.',
    [EDITING]: 'Click the property boundary where it meets the road.',
    [GENERATING]: 'Routing a network from the access point — grade, wet ground, canopy, and the water zone…',
    [REVIEWING]:
      'Click a network or its access point to read it. Clicking its tab is what commits it — one network, or none.',
    [COMMITTING]: 'Saving this network…',
    [STEP_COMMITTED]: 'This network is committed. Trees, structures and fencing are measured against it.',
  },
  buttons: {
    [IDLE]: [ROADS_ACCESS],
    [EDITING]: [ROADS_CANCEL, ROADS_GENERATE],
    [GENERATING]: [],
    [REVIEWING]: [ROADS_ACCESS_BESIDE_COMMIT, COMMIT_BUTTON],
    [COMMITTING]: [],
    [STEP_COMMITTED]: [REOPEN_BUTTON],
  },

  /**
   * WHAT ONLY THIS STEP KNOWS IS WORTH SAYING: the cap, a candidate that
   * routed nothing, and a constraint that did not run.
   */
  notices: ({ state, stepId, proposals }) => {
    const lines = []
    const networks = roadNetworks(proposals)

    if (networks.length && roadSlotsRemaining(state, stepId) === 0) {
      lines.push({
        key: 'cap',
        tone: 'advisory',
        text: [
          measured(MAX_ROAD_NETWORKS, 0),
          ' access points are placed, which is the most this step compares. Discard one to try another.',
        ],
      })
    }

    // A CANDIDATE THAT ROUTED NOTHING. Rare now and no longer what a FAILED
    // generate looks like: the server does not record an access point its
    // router refused, so a fresh one never becomes a candidate at all -- that
    // failure is reported as `no_candidate` and the bar prints it. What can
    // still reach here is a candidate recorded when it DID route and rebuilt
    // later, on a cold cache, into nothing.
    //
    // AND THE 'corridor_too_short' BRANCH IS GONE WITH THE FLOOR THAT RAISED
    // IT. road_corridors.MIN_CORRIDOR_LENGTH_METERS is deleted, so no run
    // produces that stop_reason and a sentence for it would be a special case
    // for a value that cannot arrive.
    networks.forEach((network, index) => {
      if (network.network_found) return
      lines.push({
        key: `no-network-${network.network_id}`,
        tone: 'caution',
        text: `Access point ${index + 1} routed no network: the router stopped (${network.stop_reason}).`,
      })
    })

    for (const flag of Object.keys(ROADS_UNCHECKED_CONSEQUENCE)) {
      if (!networks.length) continue
      if (!networks.every((network) => network.determination?.[flag] === false)) continue
      lines.push({ key: `unchecked-${flag}`, tone: 'caution', text: ROADS_UNCHECKED_CONSEQUENCE[flag] })
    }
    if (networks.length && networks.every((n) => n.determination?.floodplain_data_is_fallback)) {
      lines.push({
        key: 'floodplain-fallback',
        tone: 'caution',
        text: 'Wet ground was estimated from elevation alone, not from stream or soil survey data.',
      })
    }
    return lines
  },

  /**
   * ONE TAB PER NETWORK, NEVER PER BRANCH. A network's branches are a tree;
   * a spur without its trunk is incoherent and the backend rejects exactly
   * that. So the tab is the unit of the commit decision and carries every
   * branch id (`featureIds`), the checkbox toggles all of them, and the strip
   * marks it focused when any of them is.
   *
   * THREE ROWS: identity, total length, served acres -- the shape landform
   * and water set. Whole feet, because the tab has no room for a decimal
   * that build_narrative_data() ships and nobody reads on a tab.
   *
   * A CANDIDATE THAT ROUTED NOTHING KEEPS ITS TAB, without a checkbox: the
   * access point was tried and the slot is held, so it can be discarded,
   * and there is no network to put in the commit.
   */
  tabs: ({ proposals, draft }) => {
    const selected = new Set(draft.selectedFeatureIds)
    return roadNetworks(proposals).map((network, index) => {
      const featureIds = network.feature_ids ?? []
      const tab = {
        id: network.network_id,
        name: `Access point ${index + 1}`,
        featureIds,
        removable: true,
        rows: [
          { value: measure(network.access?.total_length_ft, LENGTH_DP), label: 'feet' },
          { value: measure(network.access?.served_acres), label: 'acres served' },
        ],
      }
      if (featureIds.length) {
        tab.checkbox = true
        tab.selected = featureIds.every((id) => selected.has(id))
      }
      return tab
    })
  },

  /**
   * THE PANEL: network-level readings the tab had no room for, then one
   * group per branch. A click on a branch focuses its network and names the
   * branch, so the panel scrolls to that branch's group (`scrollTo`).
   *
   * PER-FEATURE VALUES OFF THE BRANCH FEATURES; STEP-LEVEL OFF
   * build_narrative_data() -- the two-source split water established. Every
   * figure is FINAL and printed as sent, through measure() so a null is an
   * em dash and never a 0.0: a grade the pipeline did not measure is not a
   * flat road.
   */
  detail: ({ proposals }, focusedId) => {
    const features = (proposals?.road_corridors?.features ?? []).filter(
      (feature) => feature.id === focusedId || roadNetworkOf(feature) === focusedId
    )
    const branch = features.find((feature) => feature.id === focusedId) ?? null
    const networkId = branch ? roadNetworkOf(branch) : focusedId
    const network = roadNetwork(proposals, networkId)
    if (!network) return null

    const access = network.access ?? {}
    const determination = network.determination ?? {}
    const branches = (proposals?.road_corridors?.features ?? []).filter(
      (feature) => roadNetworkOf(feature) === networkId
    )

    const groups = [
      {
        id: 'network',
        label: null,
        fields: [
          { label: 'feet of road', value: measure(access.total_length_ft, LENGTH_DP), measured: true },
          { label: 'acres served', value: measure(access.served_acres), measured: true },
          { label: 'acres unserved', value: measure(access.unserved_acres), measured: true },
          { label: '% of production served', value: measure(access.served_pct_of_production), measured: true },
          { label: 'max grade %', value: measure(determination.max_grade_pct), measured: true },
          { label: 'steep feet', value: measure(determination.steep_ft), measured: true },
          { label: 'branches', value: String(access.branch_count ?? '—') },
          { label: 'reaches the water zone', value: yesNo(access.reaches_water_zone) },
          { label: 'water zone excluded', value: yesNo(determination.water_zone_excluded) },
          {
            label: 'wet ground avoided',
            value: determination.floodplain_data_available
              ? determination.floodplain_data_is_fallback
                ? 'estimated from elevation'
                : 'yes'
              : 'not applied',
          },
          { label: 'canopy avoided', value: determination.canopy_data_available ? 'yes' : 'not applied' },
          { label: 'stopped because', value: String(network.stop_reason ?? '—') },
        ],
      },
    ]

    for (const feature of branches) {
      const p = feature.properties ?? {}
      const role = BRANCH_ROLE_WORDS[p.branch_role] ?? p.branch_role ?? 'Branch'
      groups.push({
        id: feature.id,
        label: `${role} ${Number(p.branch_index ?? 0) + 1}`,
        fields: [
          { label: 'feet', value: measure(p.length_ft, LENGTH_DP), measured: true },
          { label: 'avg grade %', value: measure(p.avg_grade_pct), measured: true },
          { label: 'max grade %', value: measure(p.max_grade_pct), measured: true },
          { label: 'steep feet', value: measure(p.steep_ft, LENGTH_DP), measured: true },
          { label: 'acres newly served', value: measure(p.newly_served_acres), measured: true },
          { label: 'crosses wet ground', value: yesNo(p.crosses_floodplain) },
          { label: 'crosses production ground', value: yesNo(p.crosses_production_zone) },
        ],
      })
    }

    return {
      name: roadNetworkName(proposals, networkId),
      groups,
      cautions: [],
      scrollTo: branch ? branch.id : null,
    }
  },
})

/* ===========================================================================
   THE TREES STEP
   ===========================================================================
   The fourth definition. LANDFORM-SHAPED -- select-only candidates PLUS
   zones the user draws -- and sourced like roads: every upstream decision
   reaches it as a committed edge.

   READ THIS BEFORE TOUCHING A LABEL. Tree zones are a MARGINAL-LAND CROP.
   The backend's scoring rewards what production rejects: slope_factor is
   INVERTED from production's, hydric overlap carries the heaviest weight,
   soil marginality is REWARDED, a stream nearby is a positive. A HIGH SCORE
   IS GOOD, and it means steep, wet, poor-soil ground near water. So every
   factor row in the panel is a MERIT -- "wet ground" is why a zone scores
   well, not a warning about it -- and a label that would read as a defect
   elsewhere in this app needs different words here.

   That one fact is also why everything about this step that looks backwards
   from landform's is deliberate: no eligible highlight (tree ground is not
   gated), no slope or hydric caution (a drawn zone on hydric soil is the
   step working), and the cautions measured against what the user has
   COMMITTED rather than against the exclusion gates.
   --------------------------------------------------------------------------- */

/**
 * The layer name the backend's trees commit contract requires, verbatim:
 * wire_translation.LAYER_TREE_ZONE. step_registry's TREES entry declares
 * `layers=("tree_zone_candidate",)` and refuses a feature carrying any other.
 */
export const TREE_ZONE_LAYER = 'tree_zone_candidate'

/**
 * The layer id trees reads its crossing grounds off. Its own declaration's --
 * landform's LANDFORM_EXCLUSIONS_LAYER, for trees.
 */
export const TREES_GROUNDS_LAYER = 'trees-grounds'

/**
 * WHAT A DRAWN TREE ZONE IS MEASURED AGAINST: THE FOUR GROUNDS THE PAYLOAD
 * SHIPS, and nothing this side assembles.
 *
 * NOT THE EXCLUSION GATES. The backend's TREES commit contract declares four
 * crossing grounds and says so at length (step_registry.CrossingGround):
 * the committed production areas, the committed water zone, the committed
 * road corridor, and existing canopy. NOT hydric and NOT slope -- steep, wet
 * ground is THE POINT of this step, and a caution there would contradict it.
 *
 * ALL FOUR ARRIVE ON THE PAYLOAD as `crossing_grounds`, each
 * `{type, label, geometry_wgs84}` -- the exclusion layers' own convention --
 * resolved by step_orchestrator.wire_crossing_grounds() from the SAME
 * resolver the commit runs and shipped in WGS84. Two of them this client
 * could never have derived: the road ground is the network's CELL
 * FOOTPRINT, a real width the committed LineStrings do not carry, and the
 * canopy is the session's exclusion gate, otherwise never on the wire. So
 * the caution shown while drawing and the crossing the document records on
 * commit are two readings of one geometry, and the client unions nothing.
 *
 * NO SENTINEL PATH. Every ground that resolved is present with a geometry;
 * a ground that did not resolve ("no water zone on this parcel") is ABSENT
 * from the list, exactly as the commit path records nothing for it. There
 * is no `data_available` here to read and no "never checked" to render --
 * the em dash belongs in the factor rows, and only there.
 *
 * `type` is the stable key; `label` is the server's prose, carried verbatim
 * onto the caution and never reworded here. What THIS side adds is one
 * distinction in copy, and it is canopy's: see TREES_STEP's notices.
 */
export const TREE_CROSSING_GROUND_TYPES = Object.freeze(['production', 'water', 'road', 'canopy'])

/** The type whose crossing means "there are already trees here", not "you committed this". */
export const CANOPY_GROUND = 'canopy'

/** The payload's grounds, off the reference layer the stack carried. */
export function treeCrossingGrounds(references) {
  const grounds = references?.[TREES_GROUNDS_LAYER]
  return Array.isArray(grounds) ? grounds : []
}

/**
 * HOW TREES READS A SHAPE THE USER DREW. LANDFORM_SHAPE's two halves --
 * clamp to the parcel, caution against the grounds -- over trees' grounds
 * and trees' layer name. The boundary is still the only hard gate: a zone
 * drawn over a committed production area is warned about, not refused, and
 * the server records the crossing and commits it (commit_validation.
 * annotate_crossings).
 *
 * THE FOUR PROPERTIES ARE THE SCHEMA'S. feature_schema.py refuses a feature
 * missing `layer`, `confidence` or a non-empty `confidence_notes`; the TREES
 * contract refuses a `layer` that is not tree_zone_candidate. And NOTHING A
 * PIPELINE WOULD HAVE COMPUTED: no score, no factor, no rank. The backend's
 * own drawn-zone fixture carries exactly this shape, and its rehydrator
 * asserts every scoring field is ABSENT on a drawn zone rather than zeroed.
 */
export const TREES_SHAPE = Object.freeze({
  live: ({ points, parcel, references }) => {
    if (points.length < 3) return []
    const { multi } = clampToBoundary(points, parcel)
    return cautionsFor(multi, treeCrossingGrounds(references))
  },

  close: ({ points, parcel, references }) => {
    if (points.length < 3) return null
    const { multi, acres, removedAcres } = clampToBoundary(points, parcel)
    if (!multi.length) {
      return {
        feature: null,
        notice: 'That zone fell entirely outside the property boundary and was not added.',
      }
    }

    const cautions = cautionsFor(multi, treeCrossingGrounds(references))
    return {
      feature: {
        type: 'Feature',
        // Local to the draft; the commit path allocates the internal id
        // (the TREES entry's `internal_id_parameter`, parsed by
        // internal_tree_zone_id, which keeps the generated ids and numbers a
        // drawn one above them).
        id: `drawn-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        geometry: { type: 'MultiPolygon', coordinates: multi },
        properties: {
          layer: TREE_ZONE_LAYER,
          label: 'Drawn tree zone',
          confidence: 'low',
          confidence_notes: 'Drawn by hand on the map; no survey backs it.',
          acres,
          cautions,
        },
      },
      notice:
        removedAcres > 0
          ? [measured(removedAcres), ' acres outside the property boundary were trimmed off.']
          : null,
    }
  },
})

/**
 * THE FOUR FACTORS, AS MERITS.
 *
 * `key` is the payload's own name for the factor -- the key under
 * `selection.factor_weights_pct` and under each zone row's `factors` -- and
 * `gate` is the flag under `summary.gates` (and on every feature) that says
 * whether the factor was MEASURED. `label` is this side's, and it is the
 * whole editorial decision of this panel: each names what the ground HAS
 * that earned it credit. "Wet ground" and "steep ground" would be defects on
 * landform's panel; here they are the two heaviest merits, and the wording
 * has to read that way beside the score they explain.
 *
 * SLOPE HAS NO GATE, and that is the payload's fact rather than an
 * omission: the slope factor is read off the DEM every generate has, and
 * the backend ships availability flags only for the three network-fetched
 * factors. A slope row is always a measurement.
 *
 * NO WEIGHT IS WRITTEN DOWN HERE. The share each factor carries comes off
 * `selection.factor_weights_pct` on every render; the order the rows are
 * shown in is that share, descending, read off the same block.
 */
export const TREE_FACTORS = Object.freeze([
  Object.freeze({ key: 'hydric_overlap', gate: 'hydric_data_available', label: 'wet ground' }),
  Object.freeze({ key: 'slope', gate: null, label: 'steep ground' }),
  Object.freeze({ key: 'soil_marginality', gate: 'soil_marginality_data_available', label: 'poor farmland' }),
  Object.freeze({ key: 'stream_proximity', gate: 'stream_data_available', label: 'near a stream' }),
])

/** A weight is a whole share of the score; the payload rounds it to one place. */
const WEIGHT_DP = 0
const COUNT_DP_TREES = 0

/** The factors in the order of the share each carries, heaviest first. Off the payload. */
export function treeFactorsByWeight(weights) {
  return [...TREE_FACTORS].sort(
    (a, b) => (weights?.[b.key] ?? 0) - (weights?.[a.key] ?? 0)
  )
}

/**
 * ONE FACTOR ROW FOR ONE ZONE -- and the sentinel path, which IS here.
 *
 * soil_marginality_factor defaults to the backend's _NEUTRAL_FACTOR_VALUE
 * (0.5) when the prime-farmland data was unavailable, and the other two
 * network-fetched factors do the same. A neutral 0.5 is INDISTINGUISHABLE
 * from a measured 0.5 unless the gate is read -- which is exactly why the
 * gates are on the wire. So a factor whose gate is false renders an EM DASH,
 * never its neutral default and never the 50 the row would otherwise print.
 * Water's overlap sentinels, the same discipline.
 *
 * The weight rides the label because the panel's field is a value and a
 * label and nothing else, and the row's FIGURE is the credit: "78.0 |
 * wet ground · N% of the score". Read off the payload, never written here.
 */
export function treeFactorField(factor, zone, gates, weights) {
  const measuredHere = factor.gate == null || gates?.[factor.gate] !== false
  const weight = weights?.[factor.key]
  const share = weight == null ? '' : ` · ${measure(weight, WEIGHT_DP)}% of the score`
  return {
    label: `${factor.label}${share}`,
    value: measuredHere ? measure(zone?.factors?.[factor.key]) : measure(null),
    measured: true,
  }
}

/**
 * WHICH FACTORS WERE NOT MEASURED, in consequence terms, keyed on the stable
 * flag -- production's UNAVAILABLE_CONSEQUENCE, over a flag surface that is
 * three booleans under `summary.gates`. Each names the factor's share of the
 * score off the payload, because "the row reads as unmeasured" matters in
 * proportion to how much of every score that row would have carried.
 */
const TREES_UNCHECKED_CONSEQUENCE = {
  hydric_data_available: (share) => [
    'Soil survey data was unavailable, so no zone was credited for wet ground — ',
    share,
    '% of every score — and that row reads as unmeasured.',
  ],
  soil_marginality_data_available: (share) => [
    'Farmland classification data was unavailable, so no zone was credited for poor farmland — ',
    share,
    '% of every score — and that row reads as unmeasured.',
  ],
  stream_data_available: (share) => [
    'Stream data was unavailable, so no zone was credited for being near a stream — ',
    share,
    '% of every score — and that row reads as unmeasured.',
  ],
}

/** The gate a flag guards, by flag. */
const FACTOR_BY_GATE = Object.fromEntries(
  TREE_FACTORS.filter((factor) => factor.gate).map((factor) => [factor.gate, factor])
)

/** Start drawing a zone of your own. */
const TREES_DRAW = armButton({ key: 'draw', tool: 'draw', label: 'Draw a zone' })

/** ONE BUTTON, NOT A PAIR -- landform's reason: a ring is closed on the map. */
const TREES_CANCEL = disarmButton({ key: 'cancel', label: 'Cancel' })

/** The tabular row for a candidate, by the wire id every reader keys on. */
function treeZoneRow(proposals, featureId) {
  return (proposals?.zones ?? []).find((row) => row.feature_id === featureId) ?? null
}

export const TREES_STEP = documentStep({
  id: 'trees',
  title: 'Trees',
  blurb: 'Tree crops on the ground production does not want: steep, wet, poor, and near water.',
  layers: [
    /* THE OFF-PARCEL SCRIM, like every step's. It marks what is not the
       user's land at all, which is true at every step -- and it matters MORE
       here: trees is the last zone step and its purpose is filling unused
       ground, so the user is working right up against the parcel edge, and
       the scrim is what shows where that edge is. */
    { id: 'trees-offparcel', band: 'context', kind: 'scrim', source: 'document' },

    /* NO HIGHLIGHT, NO ELIGIBILITY MASK. Landform tints the ground that
       cleared its gates because production ground is GATED; tree ground is
       not. What counts as marginal ground worth planting is the user's call,
       and a highlight would be this app answering it for them. The search
       space the payload ships is a diagnostic of what the generate scored,
       not a drawing guide and not an eligibility hint -- so it is not
       declared, and it renders nothing. */

    /* THE FOUR GROUNDS THE CAUTIONS READ, off the payload. Consumed by the
       draw tool; painted by nothing -- the committed bands already draw
       three of them at their own steps' marks, and the canopy is a mask the
       map has never painted. Landform's exclusion declaration, exactly. */
    { id: TREES_GROUNDS_LAYER, band: 'context', kind: 'reference', source: 'proposals', key: 'crossing_grounds' },

    /* THE THREE ZONE LAYERS, ALL CARRYING THE TREE MARK -- landform's
       arrangement exactly: candidates, drawn, committed. */
    { id: 'trees-candidates', band: 'editable', kind: 'polygon', source: 'proposals', key: 'tree_zones', treatment: 'tree' },
    { id: 'trees-drawn', band: 'editable', kind: 'polygon', source: 'draft', treatment: 'tree' },
    { id: 'trees-committed', band: 'committed', kind: 'polygon', source: 'document', treatment: 'tree' },
  ],
  tools: ['select', 'draw', 'delete'],
  // None. The TREES entry declares no user_inputs.
  inputs: [],
  generate: { label: 'Generate tree zones' },
  commit: {
    // AN EMPTY COMMIT IS A DECISION -- "no tree crop on this parcel" -- and
    // the contract's min_features=0 carries it. Never blocked, never silent.
    label: ({ committableCount }) =>
      committableCount === 0 ? 'Commit no tree zones' : 'Commit tree zones',
    canCommit: () => true,
    blockedReason: () => null,
  },
  reopen: { label: 'Edit this step', confirmTitle: 'Reopen trees?' },
  proposalCollection: 'tree_zones',
  shape: TREES_SHAPE,

  /** What a reset of this step costs, for roads' reopen dialogue. */
  resetNote: (state) => {
    const zones = committedFeatureCount(state, 'trees')
    if (!zones) return 'the decision to plant no tree crop on this parcel'
    const drawn = drawnFeatureCount(state, 'trees')
    const note = [measured(zones, COUNT_DP_TREES), ` committed tree zone${plural(zones)}`]
    if (drawn) note.push(', ', measured(drawn, COUNT_DP_TREES), ' of them drawn by hand')
    return note
  },

  instructions: {
    [IDLE]: 'Tree crops on the ground production does not want: steep, wet, poor, and near water.',
    [GENERATING]: 'Scoring the ground left after production, water and roads — wetness, slope, soil, and streams…',
    [REVIEWING]: 'Click zones to select. Draw to add your own.',
    [EDITING]: 'Click to place each corner. Click the first corner to close.',
    [COMMITTING]: 'Saving these tree zones…',
    [STEP_COMMITTED]: 'These tree zones are committed. Structures and fencing are measured against them.',
  },
  buttons: {
    [IDLE]: [GENERATE_BUTTON],
    [GENERATING]: [],
    [REVIEWING]: [TREES_DRAW, COMMIT_BUTTON],
    [EDITING]: [TREES_CANCEL],
    [COMMITTING]: [],
    [STEP_COMMITTED]: [REOPEN_BUTTON],
  },

  /**
   * WHAT ONLY THIS STEP KNOWS IS WORTH SAYING: which factors were not
   * measured, what ground the generate actually scored, a drawn zone on
   * existing canopy, and a generate that found nothing.
   */
  notices: ({ proposals, draft }) => {
    if (!proposals) return []
    const summary = proposals.summary ?? {}
    const weights = summary.selection?.factor_weights_pct ?? {}
    const lines = []

    // THE THREE GATES, keyed on the flag. A false flag means every zone's row
    // for that factor is an em dash, and the score was composed without it.
    for (const flag of Object.keys(TREES_UNCHECKED_CONSEQUENCE)) {
      if (summary.gates?.[flag] !== false) continue
      const factor = FACTOR_BY_GATE[flag]
      lines.push({
        key: `unchecked-${flag}`,
        tone: 'caution',
        text: TREES_UNCHECKED_CONSEQUENCE[flag](measured(weights[factor.key], WEIGHT_DP)),
      })
    }

    // WHAT WAS SCORED. The search space is the parcel less what the three
    // steps before this one claimed; the figures are the payload's own, and
    // they are what makes "no candidates" or "three candidates" legible --
    // the same number of zones means something different on two acres left
    // than on twenty.
    const space = summary.search_space ?? {}
    if (space.search_space_acres != null && space.parcel_acres != null) {
      lines.push({
        key: 'search-space',
        tone: 'advisory',
        text: [
          'After production, water and roads, ',
          measured(space.search_space_acres),
          ' of the parcel’s ',
          measured(space.parcel_acres),
          ' acres were left to score.',
        ],
      })
    }

    // CANOPY IS A DIFFERENT KIND OF STATEMENT. A production, water or road
    // crossing means "this overlaps something you committed"; the caution
    // line in the panel says so in the server's words. A canopy crossing
    // means "there are already trees here" -- and these are tree CROPS, a
    // different thing from standing canopy. Planting into occupied ground
    // is worth flagging, so it is said, per drawn zone, as a caution and
    // not a rule. The acreage is the caution's own, in the data face.
    draft.drawnFeatures.forEach((feature, index) => {
      const canopy = (feature.properties?.cautions ?? []).find((c) => c.type === CANOPY_GROUND)
      if (!canopy) return
      lines.push({
        key: `canopy-${feature.id}`,
        tone: 'caution',
        text: [
          `Drawn ${index + 1} sits on `,
          measured(canopy.acres),
          ' acres of existing canopy: there are already trees here. A tree crop is a different ' +
            'thing from standing canopy, so this is a caution, not a rule.',
        ],
      })
    })

    // NOTHING CLEARED THE FLOOR. The floor is the payload's, so it is named.
    if (summary.candidate_count === 0) {
      const floor = summary.selection?.min_suitability_score
      lines.push({
        key: 'no-candidates',
        tone: 'caution',
        text:
          floor == null
            ? ['No leftover ground scored high enough to suggest as a tree crop. Draw a zone, or commit none.']
            : [
                'No leftover ground scored ',
                measured(floor),
                ' or better, the floor a tree zone has to clear. Draw a zone, or commit none.',
              ],
      })
    }

    return lines
  },

  /**
   * ONE TAB PER ZONE -- the candidates in rank order, then whatever the user
   * drew. Acres and score, both measured; the score is already 0-100 on the
   * backend's SUITABILITY_SCORE_SCALE, so it is printed as sent. A drawn zone
   * has no score and prints an em dash: it was never scored, and a 0.0 there
   * would read as "scored, and badly" -- which is the reading the backend
   * deliberately refuses to produce for one.
   */
  tabs: ({ proposals, draft }) => {
    const selected = new Set(draft.selectedFeatureIds)

    const tabs = (proposals?.zones ?? []).map((zone) => ({
      id: zone.feature_id,
      name: `Zone ${zone.rank}`,
      checkbox: true,
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
        checkbox: true,
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
   * A CANDIDATE: the figures the tab had no room for, then WHAT EARNED THE
   * SCORE -- one row per factor, the credit it earned in the figure column
   * and its share of the score on the label, both off the payload. The
   * floor the zone cleared is the payload's `min_suitability_score`. Nothing
   * numeric on this panel is written in this file.
   *
   * A DRAWN ZONE CARRIES NO FACTORS AT ALL, and the panel shows the ABSENCE.
   * The backend does not score a drawn zone -- a zone scoring below the
   * floor would read as scored badly rather than unscored -- so there is no
   * factor group here, not a group of zeros and not a group of dashes (a
   * dash is what an UNMEASURED factor prints on a scored zone, and a drawn
   * zone is a different fact). One categorical row says so in words.
   */
  detail: ({ proposals, draft }, featureId) => {
    const drawn = draft.drawnFeatures.find((feature) => feature.id === featureId)
    if (drawn) {
      return {
        name: 'Drawn tree zone',
        fields: [
          { label: 'acres', value: measure(drawn.properties?.acres), measured: true },
          { label: 'score', value: measure(null), measured: true },
          { label: 'scoring', value: 'not scored: drawn by hand, no factor measured' },
          { label: 'confidence', value: drawn.properties?.confidence ?? '—' },
        ],
        cautions: drawn.properties?.cautions ?? [],
      }
    }

    const zone = treeZoneRow(proposals, featureId)
    if (!zone) return null
    const summary = proposals?.summary ?? {}
    const weights = summary.selection?.factor_weights_pct ?? {}
    const gates = summary.gates ?? {}

    return {
      name: `Zone ${zone.rank}`,
      groups: [
        {
          id: 'zone',
          label: null,
          fields: [
            { label: 'acres', value: measure(zone.area_acres), measured: true },
            { label: 'score', value: measure(zone.score), measured: true },
            { label: 'score floor', value: measure(summary.selection?.min_suitability_score), measured: true },
            { label: 'avg slope %', value: measure(zone.avg_slope_pct), measured: true },
            { label: 'position', value: zone.position_in_parcel ?? '—' },
          ],
        },
        {
          id: 'merits',
          label: 'What earned the score',
          fields: treeFactorsByWeight(weights).map((factor) =>
            treeFactorField(factor, zone, gates, weights)
          ),
        },
      ],
      // A candidate is carved out of the search space, which is the parcel
      // LESS the committed claims -- so it cannot cross either ground.
      cautions: [],
    }
  },
})


/* ===========================================================================
   The registry, and the order steps run in
   =========================================================================== */

/** Every definition this build registers, keyed by id. */
export const STEP_DEFINITIONS = Object.freeze([
  BOUNDARY_STEP,
  LANDFORM_STEP,
  WATER_STEP,
  ROADS_STEP,
  TREES_STEP,
])

/**
 * WHICH COLLECTION A COMMIT'S FEATURES COME OUT OF, for the store.
 *
 * THIS COMPLETES A SEAM THE STORE NAMED AND NOBODY CONNECTED. SessionStore
 * declared `proposalFeatures` as a prop so that per-step payload knowledge
 * could live here rather than there, and defaulted it to a reader for
 * `suggested_zones` in the meantime. Nothing ever passed one, so every commit
 * in the app read landform's collection -- and water's proposals are under
 * `survey_zones`, so a full water selection resolved to an empty
 * FeatureCollection and went out as a VALID request. `min_features` is 0,
 * because "no water zones on this parcel" is a decision the pipeline has to
 * be able to carry, so the server answered 200 and the user's choice was
 * replaced by its opposite with nothing reporting a problem. The store has no
 * default any more; this is the only reader in the app.
 *
 *
 * IT RESOLVES BY THE STEP BEING COMMITTED, WHICH IT USED TO HAVE TO GUESS
 *
 * The first version of this took no `stepId`. It walked the registry and
 * returned the first definition whose `proposalCollection` was present in the
 * payload as a FeatureCollection -- an identification by the payload's SHAPE,
 * made at a call site that already knew the step's IDENTITY.
 *
 * That was sound for a reason rather than by luck: a `proposalCollection` is
 * the name of ONE step's proposals on the wire, and two steps sharing one
 * would be two steps sharing a commit contract. But soundness that rests on
 * "no two payloads collide" is a property of today's four collections, and
 * four more definitions are coming. Demonstrated rather than imagined: given a
 * payload carrying both `suggested_zones` and `survey_zones`, a WATER commit
 * resolved through landform's reader and sent `[]`.
 *
 * The store knows which step it is building a body for. It passes it now.
 *
 *
 * TWO ANSWERS THAT LOOK THE SAME AND ARE NOT
 *
 *   NO PAYLOAD -> no proposals. A step whose layers have not arrived, or a
 *   step that proposes nothing and commits only what the user drew. Neither
 *   can lose a selection: the first is `loading` to the machine, which
 *   withholds the commit button entirely (see useStepMachine's LOADING), and
 *   the second has no proposals for a selection to be lost from while its
 *   drawn features come off the draft untouched.
 *
 *   A PAYLOAD WITHOUT THIS STEP'S COLLECTION -> an error, raised. The
 *   definition and the payload disagree about what this step's proposals are
 *   called, and there is no reading of that worth guessing at. The guess the
 *   old resolver made was "no features", which is precisely the legal empty
 *   commit this whole class of bug hides inside.
 */
export function registryProposalFeatures(payload, stepId, definitions = STEP_DEFINITIONS) {
  const definition = definitions.find((entry) => entry.id === stepId)
  if (!definition) {
    throw new Error(
      `No step definition is registered for '${stepId}', so there is nothing to say ` +
        'which collection its commit reads. A step that can be committed has a ' +
        'definition; one that has none cannot assemble a body.'
    )
  }

  const collection = definition.proposalCollection
  if (!collection) {
    throw new Error(
      `Step '${stepId}' declares no \`proposalCollection\`, so its proposals cannot be ` +
        'read out of a layers payload. A step that commits something other than ' +
        'proposals says how in its own `commit.run`.'
    )
  }

  // Nothing has arrived, or this step never proposes anything. See above.
  if (payload == null) return []

  if (!Array.isArray(payload?.[collection]?.features)) {
    throw new Error(
      `Step '${stepId}' declares its proposals live under '${collection}', and the ` +
        `payload in hand does not carry a FeatureCollection there (it has: ` +
        `${Object.keys(payload).join(', ') || 'nothing'}). That is the definition and ` +
        'the wire disagreeing. Resolving it to no features would be a LEGAL empty ' +
        'commit, so it is raised instead.'
    )
  }

  return definition.proposalFeatures(payload)
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
