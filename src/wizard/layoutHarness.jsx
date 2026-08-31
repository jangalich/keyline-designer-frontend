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
  stepButton,
} from './stepDefinitions'
import { injectZonePatterns } from '../ProductionHatchPattern.jsx'

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
 * ?zones=1  render the zone PATTERNS -- production hatch and both water
 *           stipples -- at three levels each, in one SVG, at a fixed size.
 *
 * WHY THE PATTERNS COME HERE RATHER THAN TO A MAP. What has to be measured is
 * whether one pattern at --pattern-active and the same pattern at
 * --pattern-focused are TELLABLE APART at the size a whole parcel occupies,
 * and whether production's mark and water's are different marks. Neither is a
 * question about Leaflet, tiles, projection or a session: it is a question
 * about how much ink two fills put on a page. Driving the real map to ask it
 * would make the answer depend on a tile fetch and a zoom level.
 *
 * THE SIZE IS THE POINT. Each swatch is 90px square, which is about what one
 * of the reference parcel's survey zones occupies with the whole parcel in
 * frame -- so "distinguishable here" is the claim the fix actually has to
 * make, rather than "distinguishable when you zoom in".
 */
const SHOW_ZONES = params.get('zones') === '1'
const SWATCH_PX = 90

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
      const source = document.getElementById(`zone-pattern-${treatment}`)
      if (!source) continue
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
      const clone = source.cloneNode(true)
      clone.setAttribute('id', `local-${svg.dataset.testid}`)
      defs.appendChild(clone)
      svg.insertBefore(defs, svg.firstChild)
      svg.querySelector('rect').setAttribute('fill', `url(#local-${svg.dataset.testid})`)
    }
    setReady(true)
  }, [])

  const level = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(`--pattern-${name}`).trim()

  const cells = []
  for (const treatment of ['production', 'survey-embankment', 'survey-excavated']) {
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
          width={SWATCH_PX}
          height={SWATCH_PX}
          style={{
            position: 'absolute',
            left: (i % 3) * SWATCH_PX,
            top: Math.floor(i / 3) * SWATCH_PX,
          }}
        >
          <rect width={SWATCH_PX} height={SWATCH_PX} fillOpacity={level(state)} />
        </svg>
      ))}
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
  // ?detail=N also FOCUSES a feature, because the panel is absent unless one
  // is focused -- that absence is the shell's own design and not something to
  // arrange around. The id is the first tab's, so the case is one a click
  // could actually produce.
  useEffect(() => {
    if (DETAIL_ROWS > 0) focusFeature('zone-1')
  }, [focusFeature])
  return null
}

function Harness() {
  return (
    <SessionProvider autoResume={false}>
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
