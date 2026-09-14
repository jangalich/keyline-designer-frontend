/**
 * layoutHarness.jsx  —  the chrome, in a real browser, with nothing else.
 *
 * WHY THIS EXISTS. layout.test.jsx asserts on RENDERED WIDTHS: that no region
 * spans the frame, that the instruction card is centred and capped, that the
 * tab strip's right edge stops before the action card at every tab count.
 * Those are questions about layout, and jsdom does no layout -- it applies no
 * stylesheet and every getBoundingClientRect() is zero. The suite's existing
 * style tests answer what they can from the PARSED STYLESHEET, which catches a
 * rule naming a class nothing renders and cannot catch a box that is 1440px
 * wide. A claim about widths has to be measured somewhere that computes them.
 *
 * So this page renders the shell into a real Chromium and layout.test.jsx
 * measures it. It is the SHIPPED components and the SHIPPED stylesheets --
 * WizardShell, its five regions, index.css and App.css in main.jsx's order --
 * inside the same `.map-stage` element App.jsx puts them in.
 *
 * WHAT IS NOT HERE, AND WHY THAT IS THE POINT. No Leaflet, no tiles, no
 * network. The map is what the chrome floats OVER; it contributes nothing to
 * where the chrome sits (the overlay is absolutely positioned across the whole
 * stage and its own grid decides the rest), and a page that had to wait on
 * tile fetches would make a geometry test flaky for a reason unrelated to
 * geometry. The stage gets a flat backdrop instead.
 *
 * THE STEP IS A REAL DEFINITION, built through defineStep like any other. The
 * schema's whole claim is that the shell reads a step rather than knowing
 * about one -- so a definition declared here exercises exactly the code a
 * shipped step does, and lets a test ask for eleven tabs or a 400-character
 * notice without a fixture payload standing in the way.
 *
 * EVERYTHING IS DRIVEN BY THE QUERY STRING, so one page serves every case and
 * a test names its case in its URL:
 *
 *   ?tabs=N        how many tabs the step offers        (default 0)
 *   ?notice=...    'long' | 'stacked' | 'short'         (default none)
 *   ?steps=0       serve NO step catalogue              (default: the six)
 *   ?buttons=N     how many buttons the action card has (default 2)
 *   ?detail=N      give the step a detail of N rows over four groups
 *                  (default 0). NOTHING IS FOCUSED -- click a tab for that.
 *   ?format=1      the SHARED PANEL FORMAT, with production's own tabs and
 *                  rows, for the typographic claims jsdom cannot read. See
 *                  SHARED_FORMAT. Overrides ?tabs= and ?detail=.
 *   ?reopen=1      the SHIPPED steps over a hydrated document, with landform
 *                  committed and three steps below it holding work -- the
 *                  page the reopen confirmation is read on. See REOPEN below.
 *   ?waiting=1     a commit that never answers, so the instruction card can be
 *                  measured while the waiting phrases turn over. See WAITING.
 */

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../index.css'
import '../App.css'

import { SessionProvider, useSession } from '../session/SessionStore'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'
import {
  BOUNDARY_STEP,
  STEP_DEFINITIONS,
  documentStep,
  measure,
  registryProposalFeatures,
  stepButton,
} from './stepDefinitions'
import { EM_DASH, PANEL_BREAK, categoricalRow, measuredRow } from './shell/panelFormat.js'
import {
  PIN_GLYPH_PATH,
  buildZonePattern,
  injectZonePatterns,
  marksItsOwnEdge,
  zoneMark,
  zoneTreatmentSpec,
} from '../ProductionHatchPattern.jsx'
import {
  CASING_WEIGHT,
  ELIGIBLE_OPACITY,
  LINE_WEIGHT,
  SITE_PIN_HALO_WIDTH,
  SITE_PIN_SIZE,
} from '../map/layers.jsx'
import { readToken } from '../geo.js'

const params = new URLSearchParams(window.location.search)
const number = (key, fallback) => {
  const raw = params.get(key)
  return raw === null ? fallback : Number(raw)
}

/**
 * THE STEP CATALOGUE, SERVED FROM A STUB. The page makes exactly one request
 * -- GET /api/steps -- and there is no backend behind this harness, so it is
 * answered here. `?steps=0` refuses it, which is the no-catalogue case.
 */
const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

window.fetch = async (rawUrl) => {
  const url = new URL(rawUrl, window.location.origin)
  if (url.pathname === '/api/steps') {
    if (params.get('steps') === '0') return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
  }
  // The one document this page ever hydrates. See REOPEN_DOCUMENT.
  if (REOPEN && url.pathname === '/api/sessions/sess-1') {
    return { ok: true, status: 200, json: async () => REOPEN_DOCUMENT }
  }
  throw new Error(`layoutHarness makes no request to ${url.pathname}`)
}

/* ===========================================================================
   ?reopen=1  --  THE REOPEN CONFIRMATION, ON A REAL DOCUMENT
   ===========================================================================
   WHY THIS CASE IS NOT LIKE THE OTHERS. Every case above drives ONE harness
   step, because what is being measured is a box -- a width, a margin, a
   corner -- and a fabricated step gets a test to that box without a fixture
   payload in the way.

   The confirmation is not a box. What has to be read off it is the FACE its
   question is set in, WHICH of its two buttons carries the accent, and WHAT
   each downstream step says it loses -- and the last of those comes from the
   shipped definitions reading a real document (their own `resetNote`). A
   harness step declaring notes of its own would be this page answering the
   question the test is asking.

   SO THIS MODE REGISTERS THE SHIPPED STEPS and hydrates a document through
   the store's own `resume`, the same door a reload goes through. Landform is
   committed with three zones; water, roads and trees below it hold work, so
   the reset list has three rows and two of them carry a counted figure -- one
   off committed features, one off recorded inputs.

   NO SESSION IS STARTED AND NOTHING IS GENERATED. The document arrives whole,
   which is what a resume is, and the page makes exactly two requests: the step
   catalogue and this document.
   =========================================================================== */

const REOPEN = params.get('reopen') === '1'

/** One committed step entry, in the shape the wire delivers. */
function committedStep(ids, { provenance = {}, inputs = null } = {}) {
  const entry = {
    status: 'committed',
    revision: 1,
    features: {
      type: 'FeatureCollection',
      features: ids.map((id) => ({
        type: 'Feature',
        id,
        properties: { name: id },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.7]]],
        },
      })),
    },
    provenance: Object.fromEntries(ids.map((id) => [id, provenance[id] ?? 'generated'])),
  }
  if (inputs) entry.inputs = inputs
  return entry
}

/**
 * THE DOCUMENT, ALPHABETICAL, because that is how Flask serialises it and the
 * order the shell reads is `step_order`.
 *
 * ONE DRAWN ZONE among landform's three: a drawn shape is the one piece of
 * work in this pipeline that generating again cannot bring back, and
 * landform's own note says so separately. Nothing on this page reads it --
 * landform is the step being REOPENED here, so its note is not in its own
 * list -- but a document that carries only generated features would make the
 * fixture quietly narrower than the thing it stands for.
 */
const REOPEN_DOCUMENT = {
  schema_version: 1,
  session_id: 'sess-1',
  document_revision: 4,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
  boundary: [[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.71]],
  step_order: [...STEP_ORDER],
  steps: {
    fencing: { status: 'not_started' },
    landform: committedStep(['zone-1', 'zone-2', 'zone-3'], {
      provenance: { 'zone-3': 'user_added' },
    }),
    roads: committedStep(['road-1'], {
      inputs: { access_points: [[-74.0, 40.7], [-74.005, 40.705], [-74.008, 40.703]] },
    }),
    structures: { status: 'not_started' },
    trees: committedStep(['belt-1']),
    water: committedStep(['pond-1', 'pond-2']),
  },
}

/**
 * Hydrate the document, ONCE, before anything is measured.
 *
 * The ref is not belt and braces: `actions` is rebuilt on every store change,
 * so an effect that depends on it and dispatches would resume, re-render and
 * resume again -- and this page's whole job is to hold still while something
 * measures it.
 */
function ResumeDocument() {
  const { actions } = useSession()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    actions.resume('sess-1')
  }, [actions])
  return null
}

/* ===========================================================================
   The step under the chrome
   =========================================================================== */

/**
 * A tab in the shape TabStrip reads: a name and two measured rows.
 *
 * THE SECOND ROW CARRIES A SCALE IN ITS LABEL, because a shipped one does and
 * that is the wider case. Water's tab reads its suitability against the
 * ceiling the payload sent -- "0.56", "of 0.68 suitability" -- so the label
 * column is three words rather than one, and the strip's geometry tests (does
 * it end before the action card, does it size to its tabs, does it hold two
 * columns on a narrow stage) have to be asked at the width the shell actually
 * renders. A one-word label would make every one of them pass on a tab
 * narrower than any real step's.
 */
function tab(index) {
  return {
    id: `zone-${index + 1}`,
    name: `Zone ${index + 1}`,
    rows: [
      { value: measure(2.5 + index), label: 'acres' },
      { value: measure((81 - index) / 100, 2), label: 'of 0.82 suitability' },
    ],
    checkbox: true,
    selected: true,
    removable: false,
    drawn: false,
  }
}

/**
 * The notices a case asks for.
 *
 *   'long'     ONE notice long enough to prove the cap. This is the 80%
 *              advisory's shape -- prose with a measured figure in it -- run
 *              out to a length no single line should ever carry, because the
 *              thing being tested is that the card WRAPS rather than growing.
 *   'stacked'  Several at once, which is the height case: a step can raise its
 *              own advisory while the machine is also reporting two rejections.
 */
const LONG_NOTICE = [
  'Selecting ',
  { measure: '83.3%' },
  ' of the parcel leaves little room for the roads, water lines, tree belts and ',
  'fencing the later steps of this pipeline have to fit into the ground you have ',
  'not committed to production, and every one of those has to cross ground this ',
  'selection would otherwise take. Consider whether the lower-ranked zones are ',
  'worth their acreage before committing this step.',
]

function noticesFor(kind) {
  if (kind === 'long') return [{ key: 'ceiling', tone: 'advisory', text: LONG_NOTICE }]
  if (kind === 'short') return [{ key: 'ceiling', tone: 'advisory', text: 'Two zones overlap.' }]
  if (kind === 'stacked') {
    return [
      { key: 'ceiling', tone: 'advisory', text: LONG_NOTICE },
      { key: 'second', tone: 'caution', text: 'The last shape was trimmed to the parcel boundary.' },
      { key: 'third', tone: 'error', text: 'zone-4 lies partly outside the parcel boundary.' },
    ]
  }
  return []
}

/**
 * ?waiting=1  --  A COMMIT THAT IS OUT AND STAYS OUT.
 *
 * THE ONE CLAIM THE WAITING LINE MAKES THAT ONLY AN ENGINE CAN SETTLE. Its
 * phrases cycle through the direction slot every two seconds, and the
 * instruction card is `width: fit-content` and centred -- so "the card does
 * not resize while it cycles" is a statement about four computed widths and
 * cannot be checked anywhere jsdom runs. waiting.test.jsx proves the phrases
 * turn over; this page is where the box they turn over inside is measured.
 *
 * HELD OPEN RATHER THAN SLOW. The commit's `run` returns a promise that never
 * settles, so the machine's own `pending` flag parks the step in `committing`
 * for as long as the test needs and the state under measurement does not
 * depend on a timeout somewhere being longer than the measurements are.
 *
 * THE PRESS COMES FROM `idle`, WHICH IS WHERE THIS PAGE ACTUALLY RESTS. There
 * is no session and no payload behind the harness, so a step declaring itself
 * `generated` reads as `loading` -- proposals the client does not have -- and
 * a state that withholds the commit on purpose is the wrong door to knock on.
 * This case says `not_started` instead and puts the forward move where a step
 * with nothing yet offers one. What is being measured is the state the press
 * leads to, and that state is the shipped one either way.
 */
const WAITING = params.get('waiting') === '1'

const BUTTONS = [
  stepButton({
    key: 'commit',
    label: 'Commit these zones',
    tone: 'primary',
    // Every other case measures the button as a BOX and never presses it, so
    // its run is a no-op. The waiting case is the one that needs the press to
    // reach the machine, because `committing` is what it is measuring.
    run: WAITING ? (chrome) => chrome.machine.commit() : () => {},
  }),
  stepButton({ key: 'discard', label: 'Discard', tone: 'secondary', run: () => {} }),
]

const TAB_COUNT = number('tabs', 0)
const BUTTON_COUNT = number('buttons', 2)
const NOTICE_KIND = params.get('notice') ?? 'none'

/**
 * ?detail=N  focus a feature and give its panel N field ROWS, in four groups.
 *
 * THE DETAIL PANEL IS A HEIGHT CASE AND NOTHING ELSE MEASURED IT. Every other
 * case here varies the bottom row or the instruction card; the panel sits in
 * the middle row, is sized entirely by its own content, and the middle row is
 * the `1fr` that the bottom row's position depends on. A step with four groups
 * and fourteen rows is a real payload's panel, not a stress case.
 */
const DETAIL_ROWS = number('detail', 0)

/**
 * N FIELD ROWS, DEALT ROUND FOUR GROUPS -- water's shape, which is the panel
 * this branch has to hold.
 *
 * Referenced by HARNESS_STEP since the `?detail=` case was scaffolded and
 * never written, so the case threw a ReferenceError the moment anything asked
 * for it. Nothing did, which is why it sat.
 *
 * THE ROWS ARE WATER'S OWN, NOT INVENTED ONES, and that matters for the only
 * number this case is used to choose: the panel's height cap. A synthetic row
 * carrying a phrase long enough to wrap is a TALLER row than the backend ever
 * sends -- water's panel values are an acreage, "embankment", "2 of 3",
 * "gravity_feed" -- and a cap measured against wrapped rows would be sized for
 * a panel that does not exist. So the cycle below is build_zone_panel's own
 * rows, in its own order, with its own values, and a measured row and a prose
 * one alternate because the backend's do.
 *
 * PAST THE CYCLE THE ROWS REPEAT, which is what makes a count far above any
 * real payload (the scroll case) still a panel of realistic rows rather than
 * one row's height multiplied.
 *
 * GROUPS ARE FILLED IN ORDER AND AN EMPTY ONE IS DROPPED -- groupsOf() filters
 * those anyway, so ?detail=2 is two rows in one group rather than two rows and
 * three empty headings.
 */
const DETAIL_GROUP_LABELS = ['Extent', 'Terrain', 'Agreement', 'Sources']

/** build_zone_panel's rows, as the wire sends them. */
const DETAIL_ROW_CYCLE = [
  { label: 'area to survey (acres)', value: measure(12.4), measured: true },
  { label: 'survey type', value: 'embankment', measured: false },
  { label: 'suitability', value: measure(0.53), measured: true },
  { label: 'rank', value: '2 of 3', measured: false },
  { label: 'water delivery', value: 'gravity_feed', measured: false },
  { label: 'elevation above production area (feet)', value: measure(31), measured: true },
  { label: 'canopy overlap (%)', value: measure(4.2), measured: true },
  { label: 'confidence', value: 'moderate', measured: false },
]

/**
 * ?format=1  THE SHARED PANEL FORMAT, with production's own rows.
 *
 * WHY IT IS A CASE HERE AND NOT A jsdom TEST. The format's central claim is
 * TYPOGRAPHIC -- a measured value is set in the data face with tabular figures
 * and right-aligned in a track a long word cannot widen; a categorical is set
 * in the prose face, in the value position, out of that track. jsdom applies no
 * stylesheet, so every one of those is unreadable there: a class name asserted
 * in jsdom says the component asked for a treatment, not that the treatment
 * exists or that the cascade delivered it. It is the same split style.test.jsx
 * already documents, and this is the half that needs a browser.
 *
 * PRODUCTION'S OWN ROWS, VERBATIM. A synthetic row would measure a panel
 * nobody ships; these are LANDFORM_STEP's, including the two em-dashed pending
 * rows, and one categorical long enough to have widened the old column
 * ("northeast facing") so the track's independence is measured rather than
 * assumed.
 */
const SHARED_FORMAT = params.get('format') === '1'

const FORMAT_TABS = [
  {
    id: 'production-area-1',
    name: 'Block 1',
    checkbox: true,
    selected: true,
    rows: [
      { value: measure(4.0), label: 'acres' },
      // DECLARED, NOT PRINTED. The strip renders "score" and the panel renders
      // "/100 score" off this one row -- panelFormat.denominated().
      { value: measure(42.9), label: 'score', denominator: 100 },
    ],
  },
  {
    id: 'production-area-3',
    name: 'Block 3',
    checkbox: true,
    selected: true,
    rows: [
      // THE STRIP SAYS "acres" AND THE PANEL SAYS "survey acres", off this one
      // row -- panelFormat.qualified(), the same one-declaration-two-renderings
      // the denominator below uses. Water's own tab is where this came from.
      { value: measure(0.6), label: 'acres', qualifier: 'survey' },
      { value: measure(52), label: 'score', denominator: 100 },
    ],
  },
  {
    id: 'production-area-2',
    name: 'Block 2',
    checkbox: true,
    selected: true,
    rows: [
      { value: measure(11.7), label: 'acres' },
      { value: measure(100), label: 'score', denominator: 100 },
    ],
  },
  {
    // ROADS' OWN TAB, and it is here for its LABELS rather than for its step.
    // "crosses production block ft" is the longest label the shipped panels
    // carry after water's, and the label track has to wrap it the same way.
    // Four tabs is still one row (TAB_COLUMNS), so nothing about the strip's
    // geometry changes by its being here.
    id: 'road-network-1',
    name: 'Road Network 1',
    checkbox: true,
    selected: true,
    rows: [
      { value: measure(3.4), label: 'acres served' },
      { value: measure(61, 0), label: 'score', denominator: 100 },
    ],
  },
]

const FORMAT_ROWS = {
  // Block 1: everything measured that can be, and the two pending rows.
  'production-area-1': [
    categoricalRow('south facing', 'aspect'),
    categoricalRow('upper field', 'position'),
    measuredRow(measure(3.2), 'median slope %'),
    categoricalRow(EM_DASH, 'soil'),
    categoricalRow(EM_DASH, 'drainage class'),
  ],
  /* Block 3: THE LONG LABELS, which are water's own and are the case the label
     track has to wrap for. "contributing acres at dam site" and "shared ground
     w/ Excavated 2 %" do not fit a 15rem panel beside a 6ch number track, and
     a label track that refuses to wrap pushes the grid wider than the card and
     makes the panel scroll sideways. */
  'production-area-3': [
    categoricalRow('gravity feed', 'water delivery'),
    measuredRow(measure(2.4), 'contributing acres'),
    measuredRow(measure(31.2), 'contributing acres at dam site'),
    measuredRow(measure(4.0), 'median slope %'),
    PANEL_BREAK,
    measuredRow(measure(0.1), 'production overlap %'),
    measuredRow(measure(60.0), 'shared ground w/ Excavated 2 %'),
  ],
  /* Road Network 1: ROADS' PANEL, VERBATIM -- ROADS_STEP.detail's rows over
     the fixture figures. Its own long label is "crosses production block ft",
     which does not fit beside a 6ch figure in a 15rem panel either, so it is
     held to the same wrap as water's. TWO STEPS' WORTH OF LONG LABELS IN THE
     HARNESS, because the claim the track makes is about the FORMAT: a panel
     that wrapped water's rows and scrolled under roads' would be one step's
     luck rather than a rule. */
  'road-network-1': [
    measuredRow(measure(1340, 0), 'length ft'),
    measuredRow(measure(4.2), 'avg grade %'),
    measuredRow(measure(9.8), 'max grade %'),
    PANEL_BREAK,
    measuredRow(measure(85, 0), 'crosses production block ft'),
    measuredRow(measure(120, 0), 'crosses canopy ft'),
  ],
  // Block 2: the long categorical, and both flags absent -- the two em dashes
  // that are NOT the pending rows.
  'production-area-2': [
    categoricalRow('northeast facing', 'aspect'),
    categoricalRow(EM_DASH, 'position'),
    measuredRow(measure(12.75), 'median slope %'),
    categoricalRow(EM_DASH, 'soil'),
    categoricalRow(EM_DASH, 'drainage class'),
  ],
}

function detailGroups(rows) {
  const groups = DETAIL_GROUP_LABELS.map((label) => ({ label, fields: [] }))
  for (let i = 0; i < rows; i += 1) {
    const row = DETAIL_ROW_CYCLE[i % DETAIL_ROW_CYCLE.length]
    groups[i % DETAIL_GROUP_LABELS.length].fields.push({ ...row, label: `${row.label} ${i + 1}` })
  }
  return groups.filter((group) => group.fields.length)
}

/**
 * ?zones=1  render the zone MARKS -- production's hatch and both water tints --
 *           at three levels each, in one SVG, at a fixed size.
 *
 * WHY THE MARKS COME HERE RATHER THAN TO A MAP. What has to be measured is
 * whether one mark at its active level and the same mark at its focused level
 * are TELLABLE APART at the size a whole parcel occupies, and whether
 * production's mark and water's are different marks. Neither is a question
 * about Leaflet, tiles, projection or a session: it is a question about how
 * much ink two fills put on a page. Driving the real map to ask it would make
 * the answer depend on a tile fetch and a zoom level.
 *
 * THE SIZE IS THE POINT. Each swatch is 90px square, which is about what one
 * of the reference parcel's survey zones occupies with the whole parcel in
 * frame -- so "distinguishable here" is the claim the fix actually has to
 * make, rather than "distinguishable when you zoom in".
 */
const SHOW_ZONES = params.get('zones') === '1'
const SWATCH_PX = 90

const TREATMENTS = ['production', 'survey-embankment', 'survey-excavated', 'road', 'tree', 'structure', 'fence']

/**
 * THE ROAD, ONCE MORE WITHOUT ITS CASING. Roads are lines, and a line's
 * legibility over imagery is the casing's doing (layers.jsx LineLayer): the
 * two ground rows carry the cased road at each level like every other mark,
 * and these two cells beside them carry the same line with the halo pass
 * left out, so the measurement can say what the casing is worth rather than
 * assume it.
 */
const UNCASED = [
  { treatment: 'road', state: 'committed', uncased: true },
  { treatment: 'road', state: 'active', uncased: true },
  // THE PIN, ONCE MORE WITHOUT ITS HALO: the same question asked of the
  // structure site's glyph, whose body is ochre over soil that is nearly
  // ochre. Two cells beside the cased ones, so the halo's worth is a number.
  { treatment: 'structure', state: 'committed', uncased: true },
  { treatment: 'structure', state: 'active', uncased: true },
  // THE FENCE, ONCE MORE WITHOUT ITS CASING: the shipped fence mark, the
  // same question the road answers.
  { treatment: 'fence', state: 'committed', uncased: true },
  { treatment: 'fence', state: 'active', uncased: true },
]

/**
 * THE TWO FENCE COLOUR CANDIDATES, MEASURED BEFORE ONE WAS CHOSEN.
 *
 * A fence is the other LINE on this map, and two tokens from the palette
 * were under consideration for it: --rule (#ddd6c8, the hairline colour) and
 * --ink-muted (#8a8477, the caption colour). Rather than argue which reads
 * over imagery, both are drawn here exactly as the shipped mark is drawn --
 * the road's cased line at each level, and the bare line beside it -- over
 * both grounds, so layout.test.jsx can report `addedInkOver` for each and
 * the choice in index.css can quote the numbers. `lineToken` overrides the
 * mark's own token for these cells only; the shipped `fence` treatment is
 * still measured above under its own name, so whichever token it resolves
 * to is held to the floor like every other mark.
 */
/**
 * THE OPAQUE REFERENCE: --oxide laid solid, over each ground.
 *
 * WHAT A MARK IS A FRACTION OF. "Is this still a hatch or is it a fill" is only
 * answerable against the fill it would be -- the same colour, the same ground,
 * covering all of it. The water tests already ask this of a tint and compute
 * the reference arithmetically against a flat mid-grey; that shortcut does not
 * work over canopy or soil, where the ground is nowhere near grey, so the
 * opaque case is RENDERED here and differenced like every other cell.
 *
 * NOT A STATE. It is deliberately not `--pattern-focused`, which is also 1:
 * focused is a hatch at full strength and this is paint. The point of the pair
 * is the distance between them.
 */
const OPAQUE = [
  { id: 'oxide', opaque: '--oxide' },
  // AND --rule LAID SOLID, which is what a STACK of screens is a fraction of.
  // Every screen on this map is --rule (see screenNode), so "how much of the
  // frame do two or three of them take" is only answerable against the cover
  // they are all approaching. Added with the stacking measurement; the same
  // argument as the row above it, asked of a ground rather than of a mark.
  { id: 'rule', opaque: '--rule' },
]

/**
 * THE LANDFORM CASE: production's mark ON THE ELIGIBLE HIGHLIGHT.
 *
 * EVERY OTHER GROUND CELL HERE IS A DOWNSTREAM CELL, and that asymmetry is the
 * bug the casing was added to fix. From water onward the hatch sits on bare
 * imagery; during LANDFORM it sits on --eligible at ELIGIBLE_OPACITY, and that
 * tint is most of what the mark reads against. The levels were tuned on the
 * downstream case, which is why they looked right and the result did not.
 *
 * A CASING BUILT TO LIFT A MARK OFF IMAGERY MAY BE REDUNDANT OR HEAVY OVER A
 * TINT, so the combination is measured rather than assumed -- the highlight
 * alone, then the mark on it at each level. The first cell is the highlight by
 * itself, which is what the other three are differenced against: what is being
 * asked is what the MARK adds over the ground it actually has during landform.
 */
const ELIGIBLE = [
  { id: 'eligible', eligible: true },
  { treatment: 'production', state: 'committed', eligible: true },
  { treatment: 'production', state: 'active', eligible: true },
  { treatment: 'production', state: 'focused', eligible: true },
]

/**
 * THE SCREEN UNDER PRODUCTION'S HATCH: the candidates, swept.
 *
 * WHY THERE IS A SCREEN AT ALL. A committed production block is barely visible
 * from the water step onward, and the cause is the GROUND rather than the mark.
 * During landform the hatch sits on the eligible highlight and reads against
 * that tint; downstream the highlight is gone and the same ruling sits on bare
 * imagery, where a mid-tone oxide diagonal over closed canopy measures 0.0089
 * against a 0.004 floor. The screen puts the ground back. See
 * ProductionHatchPattern's screenNode().
 *
 * NOT --eligible, WHICH IS THE ONE OBVIOUS ANSWER AND IS WRONG. Reusing the
 * highlight's token downstream would say "this ground is eligible" about a
 * committed block on the water step, which is a claim about a gate that is no
 * longer being run. The screen has to be NEUTRAL: a ground, not a reading.
 *
 * SO THE TWO NEUTRALS THE SYSTEM HAS ARE MEASURED AGAINST EACH OTHER, at three
 * alphas each, the way the fence's two colour candidates were. --stock is the
 * page background and --rule is the hairline; both are warm light neutrals and
 * they differ by about a third of a step in lightness, which is exactly the
 * kind of difference an ink measure can settle and an eye cannot.
 *
 * EACH CANDIDATE GETS TWO CELLS PER LEVEL: the hatch ON the screen, and the
 * SCREEN ALONE. The second is the one that decides it -- a screen heavy enough
 * to read as a layer of its own has stopped being a ground and started being a
 * wash over the block, which is a mark nobody declared.
 */
const HATCH_SCREEN_CANDIDATES = []
for (const token of ['--stock', '--rule']) {
  for (const alpha of [0.06, 0.12, 0.2, 0.3]) {
    const id = `screen${token.replace('--', '-')}-${String(alpha).replace('0.', '')}`
    for (const state of ['committed', 'active', 'focused']) {
      HATCH_SCREEN_CANDIDATES.push({
        treatment: 'production',
        id,
        screenToken: token,
        screenAlpha: alpha,
        state,
      })
      HATCH_SCREEN_CANDIDATES.push({
        treatment: 'production',
        id,
        screenToken: token,
        screenAlpha: alpha,
        state,
        screenOnly: true,
      })
    }
  }
}

/**
 * PRODUCTION'S SHIPPED HATCH WITH ITS SCREEN LIFTED OFF, at all three levels --
 * the bare ruling, which is what the screen is worth measured against. The
 * cloning pass removes the screen pass from the local <pattern> clone, so this
 * is the same tile minus one rect.
 */
const UNSCREENED = ['committed', 'active', 'focused'].map((state) => ({
  treatment: 'production',
  state,
  unscreened: true,
}))

/**
 * THE SCREEN UNDER THE EXCAVATED DOT FIELD: --rule, SWEPT.
 *
 * THE SAME PROBLEM AS PRODUCTION'S AND A DIFFERENT MARK. An excavated zone is
 * a lattice of dots that inks about an eighth of what it covers; the other
 * seven eighths are bare frame, which is why it has always been the quietest
 * mark on this map over imagery. The screen is the other seven eighths.
 *
 * WHAT THIS SWEEP REPLACED WAS A SCREEN IN THE MARK'S OWN COLOUR, at 0.28,
 * and the report that sent this branch looking is that the zone was STILL hard
 * to find. --survey-excavated is a mid-dark blue and closed canopy is dark, so
 * a screen in that colour moves the ground toward the mark instead of away
 * from it: every point of it bought tone and spent contrast, and the ceiling
 * the old sweep found (0.32, where the overlap's texture fell through the
 * floor) was that trade running out rather than a preference.
 *
 * --rule, WHICH IS WHAT PRODUCTION LANDED ON. Measured against --stock at four
 * alphas over both grounds on production's own branch, and chosen there for
 * reasons that are not about the hatch: it is quieter as a layer at every
 * alpha on both grounds, and a screen of the PAGE COLOUR laid over aerial
 * imagery is a claim about the document rather than about the land, where
 * --rule already means a quiet neutral that separates without being a thing.
 * Reusing it keeps ONE screen treatment across the build. The colour is
 * settled; what this sweep asks is whether the ALPHA holds for a lattice.
 *
 * UNOUTLINED, ALL OF THEM. The question is what the screen does for and to the
 * DOTS, and the outline is a 2px edge that would sit inside every reading --
 * it is measured on its own by the shipped-mark cells beside these.
 */
const STIPPLE_SCREEN_CANDIDATES = []
for (const [token, alphas] of [
  ['--rule', [0.02, 0.03, 0.04, 0.06, 0.12, 0.2, 0.3]],
  // THE REJECTED SCREEN, KEPT AS A CELL. --survey-excavated at 0.28 is what
  // this mark shipped with, and "the user tried a blue tint and it did not
  // work" is worth a NUMBER from the same instrument as its replacement rather
  // than a comparison across two branches' differently-dressed swatches. One
  // alpha, because 0.28 was that sweep's own chosen ceiling.
  ['--survey-excavated', [0.28]],
]) {
  for (const alpha of alphas) {
    const id = `dotscreen-${token.replace('--', '')}-${String(alpha).replace('0.', '')}`
    for (const state of ['committed', 'active', 'focused']) {
      const base = {
        treatment: 'survey-excavated',
        id,
        screenToken: token,
        screenAlpha: alpha,
        state,
        unoutlined: true,
      }
      STIPPLE_SCREEN_CANDIDATES.push(base)
      STIPPLE_SCREEN_CANDIDATES.push({ ...base, screenOnly: true })
    }
  }
}

/**
 * THE DOT FIELD WITH ITS SCREEN LIFTED OFF, and the SHIPPED SCREEN with its
 * dots lifted off -- the two halves of the shipped mark, separately.
 *
 * THE MID-VALUE QUESTION NEEDS BOTH. Production's rules LOST contrast under
 * its screen: oxide is mid-dark and canopy is dark, so a light screen lifts
 * the ground toward the mark's own value before it goes past it, and the
 * ruling ended up reading 0.76x what it read on bare imagery with its texture
 * spread about halved. --survey-excavated is also mid-dark, so the same trap
 * is there to walk into -- but a lattice is not a ruling and its texture may
 * survive differently. So it is measured rather than assumed, and the two
 * cells below are what the shipped mark is differenced against:
 *
 *   -unscreened   the lattice on bare ground, which is what the screen is
 *                 worth measured against.
 *   -screen       the shipped screen alone, which the shipped mark is
 *                 differenced against to isolate the DOTS on the ground they
 *                 now have. (addedInkOver differences against bare ground,
 *                 which on a screened mark is mostly a reading of the screen:
 *                 a wash covers all of the cell and a dot field an eighth.)
 *
 * Both unoutlined, for the reason the sweep above is.
 */
const EXCAVATED_HALVES = ['committed', 'active', 'focused'].flatMap((state) => [
  { treatment: 'survey-excavated', state, unscreened: true, unoutlined: true },
  { treatment: 'survey-excavated', state, screenPassOnly: true, unoutlined: true },
])

/**
 * SCREENS STACKED: ONE, TWO AND THREE, AT THE COMMITTED LEVEL.
 *
 * THE QUESTION THE BUILD IS WALKING INTO. Production carries a screen and the
 * excavated survey type now carries the same one, which makes this the first
 * real instance of two screened layers on one piece of ground -- and by
 * fencing there could be five committed layers on a parcel. A screen is a
 * ground rather than a mark, and grounds ADD: two of them are not twice as
 * quiet as one, they are a second wash over the imagery. If the imagery stops
 * reading through, that is a finding about the approach rather than a detail,
 * and it belongs in the build before a third layer adopts the treatment.
 *
 * AT COMMITTED, WHICH IS WHERE IT HAPPENS. A stack is settled layers: the step
 * in hand is one layer and everything under it is committed, which is the
 * quietest level and the one a screen is scaled by. Stacking at `focused`
 * would measure a state no parcel can be in.
 *
 * THE SHIPPED SCREENS, NOT A RECONSTRUCTION. Each layer is a real treatment
 * dressed with `screenPassOnly`, so the alphas are TREATMENT_MARKS' own and
 * this file holds no copy of them. THE THIRD LAYER IS PRODUCTION'S SCREEN
 * AGAIN, because only two treatments carry one today -- which is exactly what
 * a third adopter would add, since the whole argument for --rule is that every
 * screen on this map is the same screen.
 */
const STACKED_SCREENS = [1, 2, 3].map((count) => ({
  id: `screens-${count}`,
  overlap: ['production', 'survey-excavated', 'production'].slice(0, count),
  state: 'committed',
  screenPassOnly: true,
  unoutlined: true,
}))

/**
 * LEVER 1: A WHITER SCREEN, AT HIGHER ALPHAS.
 *
 * THE PREDICTION THIS EXISTS TO TEST, STATED BEFORE THE NUMBERS. The excavated
 * dot reads LIGHTER than closed canopy, so a screen that lifts the ground moves
 * it TOWARD the dot; on the embankment wash the ground already sits about 8
 * of 255 below the dot, and the screen closes that gap. A WHITER screen lifts
 * FASTER per unit alpha, so the crossover should arrive SOONER and the overlap
 * ceiling should DROP rather than rise -- whiter-plus-more-opaque would push
 * both dials toward collapse and the lever would be exhausted. If that is what
 * the sweep says, the measured negative is the finding.
 *
 * THE LADDER, ALL OF IT TOKENS. --rule (#ddd6c8) is what ships; --stock is the
 * page background and the palette's whiter candidate, which production measured
 * LOUDER than --rule at every alpha on both grounds; --halo is #ffffff, the
 * casing colour, and it is PURE WHITE -- so the direction is tested at its
 * extreme without reaching outside the palette for a literal. (--paper sits
 * between --stock and --halo and is omitted as indistinguishable from --halo
 * at these alphas.)
 *
 * ABOVE 0.12, WHICH IS THE HALF OF THE SWEEP THAT IS NEW. --rule was ceilinged
 * at 0.03 by the overlap, so the question "does a whiter screen buy room at a
 * HIGHER alpha" is the one being asked, and the ladder runs to 0.3.
 *
 * AT `active` ONLY, AND THAT IS PROPORTIONATE RATHER THAN LAZY. The three
 * levels scale one tile together, so a candidate that loses at active loses at
 * all three in the same ratio; the shipped mark and the --rule ladder are both
 * measured at every level beside these. A finalist here would be re-measured
 * across the scale before it shipped.
 */
const WHITER_SCREENS = []
for (const token of ['--stock', '--halo']) {
  for (const alpha of [0.03, 0.06, 0.12, 0.2, 0.3]) {
    const id = `whiter-${token.replace('--', '')}-${String(alpha).replace('0.', '')}`
    const base = {
      treatment: 'survey-excavated',
      id,
      screenToken: token,
      screenAlpha: alpha,
      state: 'active',
      unoutlined: true,
    }
    WHITER_SCREENS.push(base, { ...base, screenOnly: true })
  }
}

/** The same ladder under the overlap, where the ceiling actually binds. */
const WHITER_SCREEN_OVERLAPS = []
for (const token of ['--stock', '--halo']) {
  for (const alpha of [0.03, 0.06, 0.12, 0.2, 0.3]) {
    WHITER_SCREEN_OVERLAPS.push({
      id: `whiteroverlap-${token.replace('--', '')}-${String(alpha).replace('0.', '')}`,
      overlap: ['survey-embankment', 'survey-excavated'],
      state: 'active',
      screenToken: token,
      screenAlpha: alpha,
    })
  }
}

/**
 * LEVER 2: A DENSER LATTICE, AND A BIGGER DOT.
 *
 * THIS ONE DOES NOT FIGHT THE CROSSOVER, IT SIDESTEPS IT. The screen levers
 * all trade per-dot contrast for ground lift; density trades nothing -- more
 * dots is more ink at the SAME per-dot contrast, so it should move block ink
 * without moving the dot-to-ground delta the overlap depends on.
 *
 * WHAT IT SPENDS INSTEAD IS THE LATTICE. The two-treatment design is that
 * excavated is a TEXTURE and embankment is a WASH, so their overlap reads as
 * two marks. A stipple dense enough to CLOSE is a second wash arrived at by
 * another route, and the design collapses -- so the boundary is the constraint
 * and it is measured rather than assumed.
 *
 * TWO AXES, SWEPT SEPARATELY, because they are not the same lever even where
 * they buy the same coverage. `grid` is dots per tile side and moves the
 * SPACING; `radius` moves the DOT. Coverage is pi*r^2*grid^2/tile^2, so
 * (grid 10, r 1.6) and (grid 8, r 2.0) both ink 19.6% of the ground -- one as
 * more small dots, the other as fewer large ones. Whether those read alike is
 * exactly what a coverage figure cannot say, which is the lesson the 1.1px dot
 * left behind (see the shipped row's note).
 *
 * NO SCREEN ON THESE, so the lever is isolated. The combination grid below is
 * where the two are put together.
 *
 * THE SHIPPED LATTICE IS grid 8 / r 1.6 -- 8.00px spacing, 3.2px dots, 12.6%
 * covered -- and it is already on the page as the unscreened cells, which is
 * what these are read against.
 *
 * AND THE TWO AXES CAME APART ON AN INSTRUMENT NEITHER OF THEM WAS SWEPT FOR,
 * which is the finding worth carrying forward. On ink, texture, gaps and the
 * overlap, the radius axis is the better half at equal coverage -- r24 beats
 * g12 on every one of them. ON MOIRE IT IS THE WORSE HALF BY A FACTOR OF
 * THREE: a bigger dot at the SAME 8px pitch beats against 5px ground structure
 * at 0.0085 against a 0.004 bound, where g12's tighter pitch measures 0.0028
 * and is QUIETER than the shipped field. A denser lattice moves the pitch away
 * from the ground frequencies that beat with it; a fatter dot leaves the pitch
 * where it is and gives the beat more to work with. See the moire sweep, which
 * runs over every geometry here for exactly this reason.
 */
/**
 * EVERY CANDIDATE NAMES BOTH FIELDS, and that is a correction rather than
 * verbosity. These were written as PARTIAL overrides -- `{ radius: 2.4 }`,
 * meaning "the shipped lattice with a bigger dot" -- and the day the shipped
 * grid moved from 8 to 12 every radius candidate silently became a different
 * geometry: r32 at grid 12 puts 6.4px dots on a 5.33px pitch, which is not a
 * lattice at all but a solid fill, and the sweep would have gone on reporting
 * it under the same name. A candidate that is defined relative to the thing it
 * is being compared against stops being a fixed point the moment that thing
 * moves.
 */
const STIPPLE_GEOMETRIES = [
  ['g8', { grid: 8, radius: 1.6 }],
  ['g10', { grid: 10, radius: 1.6 }],
  ['g12', { grid: 12, radius: 1.6 }],
  ['g16', { grid: 16, radius: 1.6 }],
  ['r20', { grid: 8, radius: 2.0 }],
  ['r24', { grid: 8, radius: 2.4 }],
  ['r32', { grid: 8, radius: 3.2 }],
]

const STIPPLE_CANDIDATES = []
for (const [label, spec] of STIPPLE_GEOMETRIES) {
  for (const state of ['committed', 'active', 'focused']) {
    STIPPLE_CANDIDATES.push({
      treatment: 'survey-excavated',
      id: `stipple-${label}`,
      spec: { ...spec, screen: 0 },
      state,
      unoutlined: true,
    })
  }
}

/** Each candidate lattice under the overlap, for the texture floor. */
const STIPPLE_CANDIDATE_OVERLAPS = STIPPLE_GEOMETRIES.map(([label, spec]) => ({
  id: `stippleoverlap-${label}`,
  overlap: ['survey-embankment', 'survey-excavated'],
  state: 'active',
  spec: { ...spec, screen: 0 },
}))

/**
 * THE TWO LEVERS TOGETHER -- three densities against three screens.
 *
 * THEY INTERACT, WHICH IS WHY TWO SEPARATE SWEEPS CANNOT ANSWER IT. A denser
 * lattice has more ink to lose to a screen, and a screen has more dots to wash
 * out; the sign of the combination is not the sum of the two signs. Each cell
 * carries a block reading and an overlap reading, so the trade is visible in
 * one table rather than inferred across two.
 *
 * THE DENSITIES ARE THE SHIPPED ONE AND THE TWO THAT BRACKET THE LATTICE
 * BOUNDARY; the screens are the shipped --rule 0.03, the --rule 0.12
 * production landed on (which the overlap already refused for this mark), and
 * --stock 0.12 as the whiter lever's best case.
 */
const COMBO_DENSITIES = [
  ['g8', { grid: 8, radius: 1.6 }],
  ['g12', { grid: 12, radius: 1.6 }],
  ['g16', { grid: 16, radius: 1.6 }],
  // AND THE RADIUS AXIS AT THE SAME TWO COVERAGES, because the screenless
  // sweep says the two axes are NOT interchangeable at equal ink: r24 covers
  // the same 28% as g12 and reads better on every instrument, and r32 covers
  // the same 50% as g16 and is still gaining texture where g16 has turned
  // over. A grid that swept only the spacing would have recommended the worse
  // half of the lever -- and then moire ruled the radius axis out entirely.
  ['r24', { grid: 8, radius: 2.4 }],
  ['r32', { grid: 8, radius: 3.2 }],
]
const COMBO_SCREENS = [
  ['rule03', { screen: 0.03, screenToken: '--rule' }],
  ['rule12', { screen: 0.12, screenToken: '--rule' }],
  ['stock12', { screen: 0.12, screenToken: '--stock' }],
]
const COMBO_CELLS = []
for (const [dLabel, density] of COMBO_DENSITIES) {
  for (const [sLabel, screen] of COMBO_SCREENS) {
    const spec = { ...density, ...screen }
    COMBO_CELLS.push({
      treatment: 'survey-excavated',
      id: `combo-${dLabel}-${sLabel}`,
      spec,
      state: 'active',
      unoutlined: true,
    })
    COMBO_CELLS.push({
      id: `combooverlap-${dLabel}-${sLabel}`,
      overlap: ['survey-embankment', 'survey-excavated'],
      state: 'active',
      spec,
    })
  }
}

/**
 * THE SHIPPING COMBINATION, SWEPT FOR ITS ALPHA: grid 12 under a --halo screen.
 *
 * WHY THIS NEEDED ITS OWN SWEEP RATHER THAN A ROW OF THE GRID ABOVE. The
 * whiter-screen ladder was measured on the SHIPPED g8 lattice, where --halo's
 * overlap texture fell through the floor between 0.03 and 0.06. A denser
 * lattice carries MORE overlap texture to begin with -- g12 reads 0.0152
 * unscreened against g8's 0.0083 -- so the alpha a whiter screen can afford is
 * not the one the g8 ladder found, and picking it off that ladder would be
 * reading a ceiling measured against a different mark.
 *
 * FINER STEPS THAN EITHER LADDER, because the answer is known to sit between
 * 0.03 and 0.12 and the question is where exactly.
 */
const HALO_SHIP_ALPHAS = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.12]

const HALO_SHIP_CANDIDATES = []
for (const alpha of HALO_SHIP_ALPHAS) {
  const id = `haloship-${String(alpha).replace('0.', '')}`
  for (const state of ['committed', 'active', 'focused']) {
    HALO_SHIP_CANDIDATES.push({
      treatment: 'survey-excavated',
      id,
      spec: { grid: 12, screen: alpha, screenToken: '--halo' },
      state,
      unoutlined: true,
    })
  }
  HALO_SHIP_CANDIDATES.push({
    id: `haloshipoverlap-${String(alpha).replace('0.', '')}`,
    overlap: ['survey-embankment', 'survey-excavated'],
    state: 'active',
    spec: { grid: 12, screen: alpha, screenToken: '--halo' },
  })
}

const FENCE_CANDIDATES = []
for (const [id, lineToken] of [
  ['fence-rule', '--rule'],
  ['fence-ink-muted', '--ink-muted'],
]) {
  for (const state of ['committed', 'active']) {
    FENCE_CANDIDATES.push({ treatment: 'fence', id, lineToken, state })
    FENCE_CANDIDATES.push({ treatment: 'fence', id, lineToken, state, uncased: true })
  }
}

/**
 * THE TWO SURVEY MARKS ON THE SAME GROUND, WHICH IS THE CASE THE PAIR EXISTS
 * FOR.
 *
 * `cross_type_overlaps` is the payload's record of the two survey instruments
 * independently identifying the same ground, and the module treats a
 * high-overlap area as worth evaluating for either pond type. While both types
 * were washes, the overlap was two translucent fills multiplying into a third,
 * darker fill -- so the one place the reading mattered was the one place the
 * render destroyed it.
 *
 * SO IT IS MEASURED RATHER THAN ARGUED. This cell stacks the embankment wash
 * and the excavated dot field in the order the map stacks them (the panes are
 * z-ordered embankment then excavated), on the same ground as the cells beside
 * it, so layout.test.jsx can ask whether BOTH marks are still recoverable from
 * the result: the wash by the tone it shifts the ground to, the dots by the
 * high-frequency variation they add on top of it.
 */
const OVERLAP = [{ overlap: ['survey-embankment', 'survey-excavated'], state: 'active' }]

/**
 * THE OVERLAP, AT EVERY CANDIDATE SCREEN -- the sweep the cell above could not
 * answer on its own.
 *
 * WHY THE OVERLAP GETS ITS OWN SWEEP. The screen under the dot field is chosen
 * on bare imagery, where a zone has to be findable; the overlap is the one
 * place the SAME screen can destroy the reading it was added to help. Both are
 * real constraints and they pull opposite ways, so the alpha has to be chosen
 * against both at once rather than picked on one and checked against the other.
 *
 * THE MECHANISM, WHICH IS WHY THIS IS NOT OBVIOUS. Over canopy the excavated
 * dot is LIGHTER than its ground -- --survey-excavated at the pattern level
 * over a dark green reads up, not down -- so a light screen lifts the ground
 * TOWARD the
 * dot rather than away from it. On bare canopy that is a cost worth paying,
 * because the screen itself is what makes the block findable. On the
 * EMBANKMENT WASH the ground is already lifted, and the screen carries it the
 * rest of the way to the dot's own value: the two cross over and the field
 * stops being a texture.
 *
 * A `tint` ROW IGNORES A SCREEN CANDIDATE, which is what makes one cell-level
 * override enough here: the cloning pass only dresses paint-server marks, so
 * the embankment wash under these is the shipped wash and only the excavated
 * lattice is swept.
 *
 * 0 IS IN THE SWEEP AS THE CONTROL -- a candidate rect at zero opacity is the
 * shipped screen removed and nothing put back, which is the reading every
 * other row is a cost against.
 */
const OVERLAP_SCREEN_CANDIDATES = [0, 0.02, 0.03, 0.04, 0.06, 0.09, 0.12].map((alpha) => ({
  id: `overlapscreen-${String(alpha).replace('0.', '')}`,
  overlap: ['survey-embankment', 'survey-excavated'],
  state: 'active',
  screenToken: '--rule',
  screenAlpha: alpha,
}))

/**
 * THE DOT FIELD ON ITS OWN, WITHOUT ITS OUTLINE.
 *
 * The road's cased/uncased pair asks what a line's casing is worth. This asks
 * the same question of the one mark that CANNOT take a casing: a per-dot halo
 * is what killed the previous stipple (a ring at the dot's own frequency is a
 * second texture, not a support for the first), so the only levers a dot field
 * has are DENSITY and OPACITY. These cells are the field alone, over both
 * grounds, so "the density carries it over canopy" is a number rather than an
 * inference from a measurement the outline is also inside.
 *
 * ALL THREE LEVELS, NOT TWO. The mid-value measurement differences the shipped
 * mark against its own screen to isolate the dots, and it has to do that
 * without an outline inside either half of the difference -- so the shipped
 * mark needs an unoutlined cell wherever that measurement is taken, which is
 * at every level the screen is scaled by.
 */
const UNOUTLINED = ['committed', 'active', 'focused'].map((state) => ({
  treatment: 'survey-excavated',
  state,
  unoutlined: true,
}))

/**
 * THE MOIRE ROW: the dot field over ground that HAS STRUCTURE, at a range of
 * structure frequencies.
 *
 * WHY THE TWO GROUNDS ABOVE CANNOT ASK THIS. They are flat colours on
 * purpose -- the measure they serve is the ink a mark ADDS over its own
 * ground, and that subtraction needs a ground with no texture of its own to
 * be confused with the mark's. A flat ground also cannot BEAT against
 * anything, so it is exactly the wrong ground for the one question a regular
 * lattice raises and a jittered field did not: two periodic signals laid over
 * each other interfere, and the interference is a third, much coarser pattern
 * that neither one contains.
 *
 * WHAT VARIES IS THE GROUND, NOT THE MARK, AND THAT IS THE ZOOM RANGE. The
 * pattern is a <pattern> in screen units, so the lattice is the same 2.67px
 * cell at every zoom -- panning and zooming the map does not stretch it. What
 * changes with zoom is the IMAGERY: a tree crown that is 3px across at parcel
 * zoom is 30px across four levels in. So sweeping the ground's period from
 * under the cell spacing to well over it IS sweeping the zoom range, and it
 * is the honest way round -- driving a real map would make the answer depend
 * on a tile fetch.
 *
 * A GRID, NOT STRIPES. Imagery structure is two-dimensional and a lattice can
 * beat on either axis; a striped ground would only ever test one of them, and
 * would pass a field that banged badly against the other. These periods
 * bracket the 2.67px cell spacing from half of it to nine times it, in steps
 * fine enough that a beat cannot hide between two of them.
 */
/**
 * THE TWO CROP HATCHES ON ONE GROUND, AT THE SIZES A ZONE OCCUPIES.
 *
 * WHY THIS PAIR NEEDS ITS OWN BLOCK. Trees now carries production's hatch
 * MIRRORED -- the opposite diagonal at the same 8px pitch -- and opposite
 * diagonals at identical pitch are the classic interference pair. The two
 * layers are not hypothetical neighbours either: production is one of trees'
 * four crossing grounds, so a real parcel puts one on top of the other.
 *
 * WHAT VARIES IS THE SIZE, AND THAT IS THE ZOOM RANGE. Both patterns are
 * userSpaceOnUse, so the ruling is the same 8px pitch at every zoom and any
 * beat between them is a fixed screen-space figure. What zooming changes is
 * how much of that figure fits inside the zone: at whole-parcel zoom a zone is
 * about 90px across and a coarse beat would be one blotch; four levels in the
 * same zone is several hundred px and a beat becomes banding across it. So
 * sweeping the CELL SIZE is the honest way to sweep the zoom range -- the same
 * argument MOIRE_PERIODS makes for sweeping the ground instead of driving a
 * real map.
 *
 * FOUR CELLS PER SIZE, PER GROUND: the ground bare, each hatch alone, and the
 * two together. Alone-versus-together is what makes a beat measurable --
 * interference is coarse structure that NEITHER mark contains on its own.
 */
const CROP_OVERLAP_SIZES = [90, 180, 360]
const CROP_OVERLAP_CELLS = ['bare', 'production', 'tree', 'both']

const MOIRE_PERIODS = [1.5, 2, 2.5, 2.67, 3, 3.5, 4, 5, 6, 8, 11, 16, 24]

/**
 * THE LATTICES THE MOIRE SWEEP IS RUN OVER.
 *
 * ONE PER CANDIDATE GEOMETRY, because moire is a property of the lattice's
 * PITCH and every density candidate changes it. The shipped field is 8.00px
 * between dots; r24 is the same spacing with a bigger dot, and g12 and g16 are
 * 5.33px and 4.00px. A beat that hides at one pitch is loud at another, so a
 * density recommendation that skipped this would be recommending an untested
 * interference pattern.
 *
 * `null` IS THE SHIPPED MARK and takes the plain `moire-` ids the original
 * sweep already uses, so that measurement is unchanged and still comparable.
 */
const MOIRE_LATTICES = [
  ['', null],
  // THE TWO MARKS THIS ONE REPLACED, screens included, so each comparison is
  // like for like. A screenless control would read louder for a reason that
  // has nothing to do with pitch -- more dot-to-ground contrast is a stronger
  // beat -- and the question here is what the GEOMETRY changes did.
  ['-g8', { grid: 8, radius: 1.6, screen: 0.03, screenToken: '--rule' }],
  ['-g12', { grid: 12, radius: 1.6, screen: 0.03, screenToken: '--halo' }],
  ['-g16', { grid: 16, radius: 1.6, screen: 0 }],
  ['-r24', { grid: 8, radius: 2.4, screen: 0 }],
  ['-r32', { grid: 8, radius: 3.2, screen: 0 }],
]

/** A textured ground: canopy, with a finer/darker grid at `period` px over it. */
function moireGround(period) {
  return {
    backgroundColor: '#2e3a24',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, rgba(0,0,0,0) 1px ' +
      `${period}px), ` +
      'repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 1px, rgba(0,0,0,0) 1px ' +
      `${period}px)`,
  }
}

/** The test-id suffix one ground cell answers to. */
function cellId(cell) {
  if (!cell) return 'bare'
  // A STACK MAY NAME ITSELF. The survey pair's overlap cell does not and takes
  // the derived name it always had; the stacked-screen cells do, because what
  // tells them apart is HOW MANY screens are in them and not their state.
  if (cell.overlap) return cell.id ?? `overlap-${cell.state}`
  // COMPOSED RATHER THAN CHOSEN, and the difference is the stipple sweep's.
  // These were mutually exclusive while each cell dropped exactly one pass;
  // the dot field's screen candidates drop TWO (the outline, so what is
  // measured is the lattice alone, and the marks, for the screen-alone cell),
  // and a chain of ternaries silently named both of those the same thing. Each
  // flag that is set contributes its own suffix, in a fixed order, so every
  // combination has its own id and every single-flag cell keeps the id it had.
  const suffix =
    (cell.uncased ? '-uncased' : '') +
    (cell.unoutlined ? '-unoutlined' : '') +
    (cell.unscreened ? '-unscreened' : '') +
    (cell.screenPassOnly ? '-screen' : '') +
    (cell.screenOnly ? '-alone' : '')
  // A CELL MAY HAVE NO STATE, AND MAY HAVE NO MARK. The opaque reference is one
  // colour laid solid -- not a state of a mark, but the thing every state is a
  // fraction of -- and the eligible-only cell is a GROUND rather than a mark at
  // all, so it takes its id alone: "eligible", which is what the three marks on
  // it are differenced against.
  if (!cell.treatment) return `${cell.id}${suffix}`
  const state = cell.state ? `-${cell.state}` : ''
  const ground = cell.eligible ? '-eligible' : ''
  return `${cell.id ?? cell.treatment}${state}${ground}${suffix}`
}

/**
 * THE SAME MARKS, OVER GROUND THEY ACTUALLY HAVE TO SIT ON.
 *
 * The grid above sits on flat mid-grey, which is the right backdrop for the
 * questions it answers -- two STATES of one mark compared with each other,
 * where a neutral ground keeps the comparison about the opacity step and
 * nothing else. It is the wrong backdrop for one question, and that question
 * is the whole of what a committed zone's level has to satisfy: is the mark
 * still THERE, on the imagery, at whole-parcel zoom.
 *
 * Mid-grey flatters every mark equally. An aerial frame does not: canopy is
 * dark and desaturated, bare soil is bright and warm, and one parcel carries
 * both in the same frame. A committed level tuned against grey can be legible
 * there and gone over one of these two -- which is exactly the report that
 * sent this branch looking ("barely visible" over committed landform zones
 * during water).
 *
 * TWO TONES, THE EXTREMES RATHER THAN THE AVERAGE. Closed deciduous canopy
 * and dry bare soil are about as far apart as one NAIP frame of a small
 * property gets, so a mark that holds up on both holds up on what is between
 * them. Flat colours rather than a photograph: the measure below is the ink a
 * mark ADDS over its own ground, and that subtraction needs a ground with no
 * texture of its own to be confused with the mark's.
 */
const GROUNDS = [
  { id: 'canopy', color: '#2e3a24' },
  { id: 'soil', color: '#cbb896' },
]

/** Clear of the mid-grey grid above, which is one row of SWATCH_PX per treatment. */
const GROUND_TOP = SWATCH_PX * TREATMENTS.length + 20

/** A ground's cells wrap at this many columns, to stay inside a 1280px frame. */
const GROUND_COLUMNS = 14

/**
 * EVERY CELL ONE GROUND CARRIES, in the order they are laid out. Named once
 * because THREE things need it and they must agree: the layout below, the row
 * height each ground block takes, and where the moire sweep starts under them.
 *
 * IT WAS A LITERAL 12 AND THAT WAS A TRAP. `MOIRE_TOP` was `GROUND_TOP +
 * SWATCH_PX * 12` -- the row count as it happened to be, with a comment saying
 * the height "is computed the same way" when it was not computed at all. Adding
 * cells silently slid the ground block down OVER the moire swatches, and what
 * failed was the moire assertion: the dot field appeared to have gained coarse
 * structure (0.0044 against a 0.004 ceiling) because a production swatch was
 * sitting on top of the cell being screenshotted. A layout fixture that
 * overlaps is not a fixture, and the failure it produces accuses the wrong
 * thing. Derived now, so a cell added anywhere below cannot do it again.
 */
const GROUND_CELLS = () => [
  null,
  ...cellsFor(),
  ...UNCASED,
  ...UNOUTLINED,
  ...OVERLAP,
  ...OVERLAP_SCREEN_CANDIDATES,
  ...WHITER_SCREENS,
  ...WHITER_SCREEN_OVERLAPS,
  ...STIPPLE_CANDIDATES,
  ...STIPPLE_CANDIDATE_OVERLAPS,
  ...COMBO_CELLS,
  ...HALO_SHIP_CANDIDATES,
  ...FENCE_CANDIDATES,
  ...HATCH_SCREEN_CANDIDATES,
  ...UNSCREENED,
  ...STIPPLE_SCREEN_CANDIDATES,
  ...EXCAVATED_HALVES,
  ...STACKED_SCREENS,
  ...OPAQUE,
  ...ELIGIBLE,
]

/** The three states of every treatment -- the block the ground rows open with. */
function cellsFor() {
  const cells = []
  for (const treatment of TREATMENTS) {
    for (const state of ['committed', 'active', 'focused']) cells.push({ treatment, state })
  }
  return cells
}

/** How many rows ONE ground's block of cells takes. */
const GROUND_ROWS = Math.ceil(GROUND_CELLS().length / GROUND_COLUMNS)

/** Clear of both ground blocks above, at whatever height they actually are. */
const MOIRE_TOP = GROUND_TOP + GROUND_ROWS * GROUNDS.length * SWATCH_PX + 20

/**
 * HOW TALL ONE LATTICE'S MOIRE BLOCK IS -- two rows per wrap, bare above field.
 *
 * DERIVED, LIKE GROUND_CELLS' OWN ROW COUNT, and for the reason recorded there:
 * a literal here slid one block over another the last time cells were added,
 * and the failure it produced accused the dot field of gaining coarse
 * structure when what it had gained was a swatch sitting on top of it.
 */
const MOIRE_LATTICE_HEIGHT = Math.ceil(MOIRE_PERIODS.length / GROUND_COLUMNS) * 2 * SWATCH_PX

/** Clear of every lattice's moire sweep above. */
const CROP_OVERLAP_TOP = MOIRE_TOP + MOIRE_LATTICES.length * MOIRE_LATTICE_HEIGHT + 20

/**
 * WHERE ONE (ground, size) BLOCK OF FOUR CELLS STARTS, and how tall it is.
 *
 * FOUR CELLS IN A 2x2 RATHER THAN A ROW, for one flat reason: at the largest
 * size a row of four is 1440px and the harness frame is 1280. A square block
 * is 2*size wide at worst, which fits at every size and keeps the layout the
 * same shape for all three.
 */
function cropOverlapBlockTop(groundIndex, sizeIndex) {
  const heightsBefore = CROP_OVERLAP_SIZES.slice(0, sizeIndex).reduce((a, b) => a + 2 * b, 0)
  const groundHeight = CROP_OVERLAP_SIZES.reduce((a, b) => a + 2 * b, 0)
  return CROP_OVERLAP_TOP + groundIndex * groundHeight + heightsBefore
}

/**
 * WHAT THE SWATCH FOR ONE TREATMENT IS MADE OF -- read from the same table the
 * map reads, so a swatch cannot be a picture of a mark the map does not draw.
 * A pattern treatment gets a paint-server reference; a tint gets its colour
 * and its outline, in that one colour, with NOTHING under the line -- which is
 * exactly what styleFor() puts on the map, casing pass included by being
 * excluded.
 */
const OUTLINE_WEIGHT = 2

/** The pattern defs, without a map. See injectZonePatterns. */
function ZonePatternHost() {
  useEffect(() => injectZonePatterns(document.body), [])
  return null
}

/**
 * THE SWATCH'S OWN DISPLAY RECT -- the one the cell paints -- and never a rect
 * that happens to live inside the pattern def cloned in above it.
 *
 * `:scope > rect` RATHER THAN `querySelector('rect')`, and the difference is
 * not pedantry. The clone is inserted as the svg's FIRST child, so a bare
 * `querySelector('rect')` returns the first rect in document order ANYWHERE
 * under the svg -- which was the display rect only for as long as no pattern
 * tile contained a rect of its own. The excavated stipple's screen is exactly
 * such a rect, and the failure it produced was silent and total: the fill was
 * set on the pattern's screen instead, making the tile reference itself, and
 * the swatch rendered as flat dark ground whose appearance did not respond to
 * the screen's opacity at all. Every ink and texture measurement over it was
 * measuring nothing.
 */
function swatchRect(svg) {
  return svg.querySelector(':scope > rect')
}

function ZoneSwatches() {
  const [ready, setReady] = useState(false)
  const host = useRef(null)

  /**
   * CLONE EACH PATTERN INTO THE SWATCH THAT USES IT.
   *
   * The defs the map injects live in their own hidden <svg>, which is right
   * for the map -- panes come and go and several reference the same pattern.
   * It is wrong for MEASURING one, because the measurement serialises a swatch
   * and rasterises it on a canvas, and a serialised SVG cannot reach a paint
   * server in another document. So each swatch carries its own copy under its
   * own id, and what gets measured is a self-contained picture of exactly the
   * pattern the map draws.
   */
  useEffect(() => {
    if (!host.current) return
    for (const svg of host.current.querySelectorAll('svg[data-treatment]')) {
      const treatment = svg.dataset.treatment
      const mark = zoneMark(treatment)
      if (!mark) continue
      if (mark.kind === 'pattern' || mark.kind === 'stipple') {
        /* A CANDIDATE TILE IS BUILT, NOT CLONED, and everything else is
           cloned. The two dressings answer two different questions.

           CLONING answers "what does the SHIPPED mark do here" -- the map's
           own def, copied so a serialised swatch can reach a paint server in
           its own document, then optionally stripped of a pass.

           BUILDING answers "what would moving a lever COST" -- a lattice at a
           density the table does not carry, a bigger dot, a screen at an alpha
           or in a token nothing ships. Those tiles do not exist in the map's
           defs, so there is nothing to clone; `data-spec` names the fields to
           override and ProductionHatchPattern's own builder makes the tile, so
           a candidate is the shipped mark with one field changed rather than
           this file's idea of what a stipple looks like. */
        const override = svg.dataset.spec ? JSON.parse(svg.dataset.spec) : null
        const source = override
          ? buildZonePattern({ ...zoneTreatmentSpec(treatment), ...override }, 'candidate')
          : document.getElementById(`zone-pattern-${treatment}`)
        if (!source) continue
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        const clone = override ? source : source.cloneNode(true)
        clone.setAttribute('id', `local-${svg.dataset.testid}`)
        // THE SCREEN IS THE THING UNDER TEST ON SOME OF THESE CELLS, so the
        // clone is dressed three ways. Every pass is found BY NAME (the tile
        // builders tag it) rather than by position, so a row with no screen
        // yields nothing to remove instead of losing its marks.
        //
        //   data-unscreened     the shipped tile with its screen lifted off --
        //                       the bare mark, which is what the screen is
        //                       worth measured against.
        //   data-screen-token   a CANDIDATE screen: a full-tile rect in that
        //                       token at that alpha, pushed under the marks.
        //                       This is how a colour that is not shipped gets
        //                       measured, the way the fence's two candidates
        //                       are measured through data-line-token.
        //   data-screen-only    the candidate screen with the marks removed --
        //                       the tint on its own.
        if (svg.dataset.unscreened === 'true' || svg.dataset.screenToken) {
          for (const pass of clone.querySelectorAll('[data-pass="screen"]')) pass.remove()
        }
        // data-screen-pass-only     THE SHIPPED SCREEN AND NOTHING ELSE: every
        //                          child that is not the screen pass removed,
        //                          which leaves the tile the map actually draws
        //                          minus its marks. The inverse of
        //                          data-unscreened, and it exists because the
        //                          stacking measurement has to stack the
        //                          SHIPPED screen -- a candidate rect at an
        //                          alpha typed into this file would be a second
        //                          copy of a number that lives in
        //                          TREATMENT_MARKS, and would go stale there.
        if (svg.dataset.screenPassOnly === 'true') {
          for (const node of [...clone.children]) {
            if (node.dataset?.pass !== 'screen') node.remove()
          }
        }
        if (svg.dataset.screenToken) {
          if (svg.dataset.screenOnly === 'true') {
            while (clone.firstChild) clone.removeChild(clone.firstChild)
          }
          const size = Number(clone.getAttribute('width'))
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('width', String(size))
          rect.setAttribute('height', String(size))
          rect.setAttribute('fill', readToken(svg.dataset.screenToken))
          rect.setAttribute('fill-opacity', svg.dataset.screenAlpha)
          clone.insertBefore(rect, clone.firstChild)
        }
        defs.appendChild(clone)
        svg.insertBefore(defs, svg.firstChild)
        swatchRect(svg).setAttribute('fill', `url(#local-${svg.dataset.testid})`)
        // A STIPPLE FALLS THROUGH TO THE OUTLINE PASS BELOW; a hatch does
        // not. Both are paint servers and only one of them draws its own
        // edge, which is marksItsOwnEdge()'s distinction and not this file's.
        if (!marksItsOwnEdge(mark)) continue
      }
      // ...unless this is the cell that asks what the field carries alone.
      if (svg.dataset.unoutlined === 'true') continue
      if (mark.kind === 'pin') {
        // THE SITE PIN: the glyph the map draws (layers.jsx sitePinIcon) at
        // its own screen size, centred in the swatch, the halo pass under
        // the body, the whole glyph at the state's pattern level -- which is
        // what App.css's .site-pin rules do. `data-uncased` leaves the halo
        // out, for the measurement that asks what it is worth.
        swatchRect(svg).setAttribute('fill', 'none')
        const level = patternLevel(svg.dataset.state)
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const scale = SITE_PIN_SIZE / 24
        const offset = (SWATCH_PX - SITE_PIN_SIZE) / 2
        group.setAttribute('transform', `translate(${offset} ${offset}) scale(${scale})`)
        group.setAttribute('opacity', level)
        const passes = svg.dataset.uncased === 'true' ? [] : [['halo', readToken('--halo')]]
        passes.push(['body', mark.fill])
        for (const [pass, colour] of passes) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', PIN_GLYPH_PATH)
          if (pass === 'halo') {
            path.setAttribute('fill', 'none')
            path.setAttribute('stroke', colour)
            path.setAttribute('stroke-width', String(SITE_PIN_HALO_WIDTH))
            path.setAttribute('stroke-linejoin', 'round')
          } else {
            path.setAttribute('fill', colour)
          }
          group.appendChild(path)
        }
        svg.appendChild(group)
        svg.dataset.cased = svg.dataset.uncased === 'true' ? 'false' : 'true'
        continue
      }
      if (mark.kind === 'line') {
        // A ROAD: a cased line corner to corner, the halo pass under the
        // coloured line, both at the state's level -- which is what LineLayer
        // draws. `data-uncased` leaves the halo pass out, for the one
        // measurement that asks what the casing is worth.
        swatchRect(svg).setAttribute('fill', 'none')
        const level = patternLevel(svg.dataset.state)
        const passes = svg.dataset.uncased === 'true' ? [] : [[readToken('--halo'), CASING_WEIGHT]]
        // A CANDIDATE CELL draws the same line in another token -- see
        // FENCE_CANDIDATES. The shipped mark's own cells carry no override.
        passes.push([svg.dataset.lineToken ? readToken(svg.dataset.lineToken) : mark.stroke, LINE_WEIGHT])
        for (const [stroke, weight] of passes) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          line.setAttribute('x1', '0')
          line.setAttribute('y1', String(SWATCH_PX))
          line.setAttribute('x2', String(SWATCH_PX))
          line.setAttribute('y2', '0')
          line.setAttribute('stroke', stroke)
          line.setAttribute('stroke-width', String(weight))
          line.setAttribute('stroke-opacity', level)
          line.setAttribute('stroke-linecap', 'round')
          svg.appendChild(line)
        }
        svg.dataset.cased = svg.dataset.uncased === 'true' ? 'false' : 'true'
        continue
      }
      // A MARK THAT DRAWS ITS OWN EDGE: the fill (a wash for a tint, a dot
      // field for a stipple -- already set above for the latter), then its
      // outline over it. One colour, one line, nothing under it. Insetting by
      // half the stroke keeps the whole outline inside the swatch, so the
      // screenshot measures all of it instead of half of it.
      if (mark.kind === 'tint') swatchRect(svg).setAttribute('fill', mark.fill)
      const inset = OUTLINE_WEIGHT / 2
      const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      outline.setAttribute('x', String(inset))
      outline.setAttribute('y', String(inset))
      outline.setAttribute('width', String(SWATCH_PX - OUTLINE_WEIGHT))
      outline.setAttribute('height', String(SWATCH_PX - OUTLINE_WEIGHT))
      outline.setAttribute('fill', 'none')
      outline.setAttribute('stroke', mark.stroke)
      outline.setAttribute('stroke-width', String(OUTLINE_WEIGHT))
      outline.setAttribute('stroke-opacity', patternLevel(svg.dataset.state))
      svg.dataset.outlined = 'true'
      svg.appendChild(outline)
    }
    setReady(true)
  }, [])

  const patternLevel = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(`--pattern-${name}`).trim()
  const tintLevel = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(`--tint-${name}`).trim()
  // THE SCALE IS THE MARK'S, not the swatch's -- a hatch is ink at full
  // strength and a tint is a screen, and index.css says which takes which.
  const fillLevel = (treatment, state) =>
    zoneMark(treatment)?.kind === 'tint' ? tintLevel(state) : patternLevel(state)

  const cells = cellsFor()

  return (
    <div
      ref={host}
      data-testid="zone-swatches"
      data-swatches-ready={ready ? 'true' : 'false'}
      style={{ position: 'absolute', inset: 0, background: '#808080' }}
    >
      {cells.map(({ treatment, state }, i) => (
        <svg
          key={`${treatment}-${state}`}
          data-testid={`swatch-${treatment}-${state}`}
          data-treatment={treatment}
          data-state={state}
          width={SWATCH_PX}
          height={SWATCH_PX}
          style={{
            position: 'absolute',
            left: (i % 3) * SWATCH_PX,
            top: Math.floor(i / 3) * SWATCH_PX,
          }}
        >
          <rect width={SWATCH_PX} height={SWATCH_PX} fillOpacity={fillLevel(treatment, state)} />
        </svg>
      ))}
      {/* THE MOIRE SWEEP. Each period gets the field alone (no outline, so
          what is measured is the lattice and nothing else) and the same
          ground bare beside it, for the difference the test takes. */}
      {MOIRE_LATTICES.map(([suffix, spec], latticeIndex) =>
        MOIRE_PERIODS.map((period, index) =>
          ['bare', 'field'].map((which) => (
            <div
              key={`moire${suffix}-${period}-${which}`}
              data-testid={`moire-${which}${suffix}-${period}`}
              style={{
                position: 'absolute',
                left: (index % GROUND_COLUMNS) * SWATCH_PX,
                top:
                  MOIRE_TOP +
                  latticeIndex * MOIRE_LATTICE_HEIGHT +
                  (Math.floor(index / GROUND_COLUMNS) * 2 + (which === 'field' ? 1 : 0)) *
                    SWATCH_PX,
                width: SWATCH_PX,
                height: SWATCH_PX,
                ...moireGround(period),
              }}
            >
              {which === 'field' ? (
                <svg
                  data-testid={`moire-mark${suffix}-${period}`}
                  data-treatment="survey-excavated"
                  data-state="active"
                  data-unoutlined="true"
                  data-spec={spec ? JSON.stringify(spec) : undefined}
                  width={SWATCH_PX}
                  height={SWATCH_PX}
                >
                  <rect
                    width={SWATCH_PX}
                    height={SWATCH_PX}
                    fillOpacity={fillLevel('survey-excavated', 'active')}
                  />
                </svg>
              ) : null}
            </div>
          ))
        )
      )}
      {/* THE TWO CROP HATCHES, over both grounds, at three zone sizes. Each
          block is the ground bare, each hatch alone, and the two together --
          the four readings a beat has to be recovered from. Every mark is an
          ordinary data-treatment svg, so the cloning pass above dresses these
          without knowing the block exists; `data-unoutlined` is not needed
          because a hatch draws no outline. */}
      {GROUNDS.map((ground, groundIndex) =>
        CROP_OVERLAP_SIZES.map((size, sizeIndex) =>
          CROP_OVERLAP_CELLS.map((which, cellIndex) => (
            <div
              key={`crops-${ground.id}-${size}-${which}`}
              data-testid={`crops-${ground.id}-${size}-${which}`}
              style={{
                position: 'absolute',
                left: (cellIndex % 2) * size,
                top: cropOverlapBlockTop(groundIndex, sizeIndex) + Math.floor(cellIndex / 2) * size,
                width: size,
                height: size,
                background: ground.color,
              }}
            >
              {(which === 'both' ? ['production', 'tree'] : which === 'bare' ? [] : [which]).map(
                (treatment, depth) => (
                  <svg
                    key={treatment}
                    /* ITS OWN data-testid, AND THE CLONING PASS IS WHY. Each
                       swatch gets its own copy of the pattern under an id
                       derived from THIS attribute; without it every svg here
                       would mint `local-undefined`, every rect would resolve to
                       whichever def landed first, and all four cells would draw
                       one pattern -- which is a measurement of nothing. */
                    data-testid={`crops-mark-${ground.id}-${size}-${which}-${treatment}`}
                    data-treatment={treatment}
                    data-state="active"
                    width={size}
                    height={size}
                    style={{ position: 'absolute', left: 0, top: 0, zIndex: depth }}
                  >
                    <rect
                      width={size}
                      height={size}
                      fillOpacity={fillLevel(treatment, 'active')}
                    />
                  </svg>
                )
              )}
            </div>
          ))
        )
      )}
      {GROUNDS.map((ground, row) =>
        GROUND_CELLS().map((cell, index) => (
          <div
            key={`${ground.id}-${cellId(cell)}`}
            data-testid={`ground-${ground.id}-${cellId(cell)}`}
            style={{
              position: 'absolute',
              left: (index % GROUND_COLUMNS) * SWATCH_PX,
              top:
                GROUND_TOP +
                (row * GROUND_ROWS + Math.floor(index / GROUND_COLUMNS)) * SWATCH_PX,
              width: SWATCH_PX,
              height: SWATCH_PX,
              background: ground.color,
            }}
          >
            {/* THE ELIGIBLE HIGHLIGHT, UNDER THE MARK, at the alpha layers.jsx
                draws it at. A plain tinted layer rather than a Leaflet path:
                what is being measured is the ground the hatch sits on during
                landform, and a tint over a colour is a tint over a colour. */}
            {cell?.eligible ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--eligible)',
                  opacity: ELIGIBLE_OPACITY,
                }}
              />
            ) : null}
            {/* THE OPAQUE REFERENCE: the mark's own colour, covering the cell.
                No pattern, no level -- see OPAQUE. */}
            {cell?.opaque ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `var(${cell.opaque})`,
                }}
              />
            ) : null}
            {/* THE OVERLAP CELL IS TWO MARKS IN ONE CELL, stacked in the
                order the map's panes stack them. Each is an ordinary
                data-treatment svg, so the cloning pass above dresses both
                without knowing this cell exists. */}
            {(cell?.overlap ?? (cell?.treatment ? [cell.treatment] : [])).map((treatment, depth) => (
              <svg
                /* THE DEPTH IS IN THE KEY AND IN THE ID, and it has to be: a
                   stack may carry the SAME treatment twice (three screens, and
                   only two treatments ship one), and without the index both
                   copies would mint one `local-` pattern id -- the second
                   clone overwriting the first, leaving a measurement of one
                   layer wearing a stack's name. */
                key={`${treatment}-${depth}`}
                data-testid={`ground-mark-${ground.id}-${cellId(cell)}${cell?.overlap ? `-${treatment}-${depth}` : ''}`}
                data-treatment={treatment}
                data-state={cell.state}
                data-uncased={cell.uncased ? 'true' : undefined}
                data-unoutlined={cell.unoutlined ? 'true' : undefined}
                data-line-token={cell.lineToken ?? undefined}
                data-unscreened={cell.unscreened ? 'true' : undefined}
                data-screen-pass-only={cell.screenPassOnly ? 'true' : undefined}
                data-spec={cell.spec ? JSON.stringify(cell.spec) : undefined}
                data-screen-token={cell.screenToken ?? undefined}
                data-screen-alpha={cell.screenAlpha ?? undefined}
                data-screen-only={cell.screenOnly ? 'true' : undefined}
                width={SWATCH_PX}
                height={SWATCH_PX}
                style={
                  cell?.overlap || cell?.eligible
                    ? { position: 'absolute', left: 0, top: 0, zIndex: depth + 1 }
                    : undefined
                }
              >
                <rect
                  width={SWATCH_PX}
                  height={SWATCH_PX}
                  fillOpacity={fillLevel(treatment, cell.state)}
                />
              </svg>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

/**
 * THROUGH documentStep(), NOT defineStep(). documentStep is what every real
 * step in this build is made with -- it supplies the commit contract, the
 * status reader, the reachability reader and the proposal accessors, and a
 * step assembled without them is a step the machine cannot run. Only the four
 * things a layout case actually varies are overridden here.
 *
 * `status` and `reachable` are two of those, because there is no session
 * behind this page: without them the step would read not_started and blocked,
 * which is a real state and not the one whose layout is being measured.
 */
const HARNESS_STEP = documentStep({
  id: 'landform',
  title: 'Landform',
  blurb: 'Where production can go.',
  proposalCollection: 'suggested_zones',
  Panel: null,
  status: () => (WAITING ? 'not_started' : 'generated'),
  reachable: () => true,
  blockedBy: () => null,
  instructions: {
    reviewing: 'Review the proposed production zones and commit the ones you want.',
    // The declared line the waiting phrases replace once the wait has lasted.
    // A real step's own words, so the swap being measured is the shipped one.
    committing: 'Saving these zones…',
  },
  buttons: {
    reviewing: BUTTONS.slice(0, BUTTON_COUNT),
    idle: WAITING ? BUTTONS.slice(0, 1) : [],
    committing: [],
  },
  // A REQUEST THAT NEVER ANSWERS, for ?waiting=1 only. Every other case leaves
  // documentStep's own commit in place and never presses it.
  commit: WAITING ? { run: () => new Promise(() => {}) } : undefined,
  notices: () => noticesFor(NOTICE_KIND),
  tabs: () =>
    SHARED_FORMAT ? FORMAT_TABS : Array.from({ length: TAB_COUNT }, (_, i) => tab(i)),
  detail: (_context, featureId) => {
    // THE SHARED FORMAT DECLARES ROWS AND NOTHING ELSE -- no name and no tab
    // rows, because the panel reads both off tabs(). `name` is the fallback
    // for a feature with no tab and is deliberately WRONG here, so a test can
    // tell the tab's header from the detail's.
    if (SHARED_FORMAT) {
      return FORMAT_ROWS[featureId]
        ? { name: 'not the header', rows: FORMAT_ROWS[featureId], cautions: [] }
        : null
    }
    return DETAIL_ROWS > 0
      ? { name: 'Embankment 1', groups: detailGroups(DETAIL_ROWS), cautions: [] }
      : null
  },
})

/**
 * Put the cursor on the step under test.
 *
 * The cursor derives to the first UNCOMMITTED step, which with no session is
 * always the boundary -- and the boundary's chrome is one button and no tabs,
 * which is not the layout these tests are about. This is the same door a rail
 * click goes through (`open`), so the shell is in a state a user can actually
 * reach rather than one this file has arranged behind it.
 */
function OpenStep({ stepId }) {
  const { open, focusFeature } = useWizardCursor()
  useEffect(() => open(stepId), [open, stepId])
  // NOTHING IS FOCUSED HERE, AND THAT IS DELIBERATE. The detail panel is
  // absent unless a feature is focused, and the gesture that focuses one is a
  // TAB CLICK (TabStrip's onClick -> focusFeature). A test that wants the
  // panel clicks a tab, which is both the real gesture and the only way to
  // measure the shell BEFORE and AFTER the panel opens on ONE page -- two
  // pages would be two layouts, and "the strip did not move" is a claim about
  // one. `focusFeature` stays in the destructuring above for the panel's own
  // absence to be the shell's design rather than this file's arrangement.
  void focusFeature
  return null
}

function Harness() {
  return (
    <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
      <WizardCursorProvider definitions={REOPEN ? STEP_DEFINITIONS : [BOUNDARY_STEP, HARNESS_STEP]}>
        {REOPEN ? <ResumeDocument /> : null}
        <OpenStep stepId="landform" />
        {/* THE SHIPPED STAGE ELEMENT. `.map-stage` is what carries the chrome's
            own measurements (--rail-width, --bar-height) and the height the
            overlay is laid out against; rendering the shell outside it would
            be measuring a layout the app never has. */}
        <div className="map-stage" data-testid="stage">
          {SHOW_ZONES ? <ZonePatternHost /> : null}
          {SHOW_ZONES ? <ZoneSwatches /> : <WizardShell />}
        </div>
      </WizardCursorProvider>
    </SessionProvider>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)

// The signal layout.test.jsx waits on before it measures anything: React has
// committed, the catalogue request has settled, and fonts are done loading --
// a card sized to its content is sized to its content IN A FACE, and measuring
// mid-swap would read a fallback's metrics.
Promise.all([document.fonts.ready, new Promise((r) => requestAnimationFrame(() => r()))]).then(
  () => {
    document.documentElement.dataset.harnessReady = 'true'
  }
)
