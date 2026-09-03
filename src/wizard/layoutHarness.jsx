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
 */

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../index.css'
import '../App.css'

import { SessionProvider } from '../session/SessionStore'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'
import {
  BOUNDARY_STEP,
  documentStep,
  measure,
  registryProposalFeatures,
  stepButton,
} from './stepDefinitions'
import { injectZonePatterns, zoneMark } from '../ProductionHatchPattern.jsx'

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
  throw new Error(`layoutHarness makes no request to ${url.pathname}`)
}

/* ===========================================================================
   The step under the chrome
   =========================================================================== */

/** A tab in the shape TabStrip reads: a name and two measured rows. */
function tab(index) {
  return {
    id: `zone-${index + 1}`,
    name: `Zone ${index + 1}`,
    rows: [
      { value: measure(2.5 + index), label: 'acres' },
      { value: measure(81 - index), label: 'score' },
    ],
    eye: true,
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

const BUTTONS = [
  stepButton({ key: 'commit', label: 'Commit these zones', tone: 'primary', run: () => {} }),
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

const TREATMENTS = ['production', 'survey-embankment', 'survey-excavated']

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

/** Clear of the mid-grey grid above, which is three rows of SWATCH_PX. */
const GROUND_TOP = SWATCH_PX * 3 + 20

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
      if (mark.kind === 'pattern') {
        const source = document.getElementById(`zone-pattern-${treatment}`)
        if (!source) continue
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        const clone = source.cloneNode(true)
        clone.setAttribute('id', `local-${svg.dataset.testid}`)
        defs.appendChild(clone)
        svg.insertBefore(defs, svg.firstChild)
        svg.querySelector('rect').setAttribute('fill', `url(#local-${svg.dataset.testid})`)
        continue
      }
      // A TINT: the wash, then its outline over it -- one colour, one line,
      // nothing under it. Insetting by half the stroke keeps the whole
      // outline inside the swatch, so the screenshot measures all of it
      // instead of half of it.
      svg.querySelector('rect').setAttribute('fill', mark.fill)
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

  const cells = []
  for (const treatment of TREATMENTS) {
    for (const state of ['committed', 'active', 'focused']) cells.push({ treatment, state })
  }

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
      {GROUNDS.map((ground, row) =>
        [null, ...cells].map((cell, column) => (
          <div
            key={`${ground.id}-${cell ? `${cell.treatment}-${cell.state}` : 'bare'}`}
            data-testid={
              cell
                ? `ground-${ground.id}-${cell.treatment}-${cell.state}`
                : `ground-${ground.id}-bare`
            }
            style={{
              position: 'absolute',
              left: column * SWATCH_PX,
              top: GROUND_TOP + row * SWATCH_PX,
              width: SWATCH_PX,
              height: SWATCH_PX,
              background: ground.color,
            }}
          >
            {cell ? (
              <svg
                data-testid={`ground-mark-${ground.id}-${cell.treatment}-${cell.state}`}
                data-treatment={cell.treatment}
                data-state={cell.state}
                width={SWATCH_PX}
                height={SWATCH_PX}
              >
                <rect
                  width={SWATCH_PX}
                  height={SWATCH_PX}
                  fillOpacity={fillLevel(cell.treatment, cell.state)}
                />
              </svg>
            ) : null}
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
  status: () => 'generated',
  reachable: () => true,
  blockedBy: () => null,
  instructions: {
    reviewing: 'Review the proposed production zones and commit the ones you want.',
  },
  buttons: { reviewing: BUTTONS.slice(0, BUTTON_COUNT) },
  notices: () => noticesFor(NOTICE_KIND),
  tabs: () => Array.from({ length: TAB_COUNT }, (_, i) => tab(i)),
  detail: () =>
    DETAIL_ROWS > 0
      ? { name: 'Embankment 1', groups: detailGroups(DETAIL_ROWS), cautions: [] }
      : null,
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
      <WizardCursorProvider definitions={[BOUNDARY_STEP, HARNESS_STEP]}>
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
