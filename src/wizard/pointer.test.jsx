/**
 * @vitest-environment node
 *
 * THE ENVIRONMENT IS `node`, NOT THE PROJECT'S jsdom, for layout.test.jsx's
 * reason and one of its own. jsdom computes no layout, so every
 * getBoundingClientRect is zero and document.elementFromPoint has nothing to
 * answer with -- which makes the question this file exists to ask unaskable
 * there. It also cannot run in one: Vite's dev server loads esbuild, which
 * asserts that `new TextEncoder().encode('')` is a `Uint8Array` -- true in
 * node and false under jsdom, whose globals come from a different realm.
 */
/**
 * pointer.test.jsx
 *
 * THE SHELL'S CONTROLS, PRESSED WITH A REAL MOUSE.
 *
 * WHY THIS FILE EXISTS. A bug was reported as "a water zone whose eye is
 * closed cannot be opened again", with a symptom that named the mechanism
 * before anyone looked: THE CLOSED EYE HAD NO HOVER STATE. An open eye
 * highlights under the pointer; a closed one did not. That is not a state bug
 * and not an event-propagation bug. It is the browser deciding that the
 * element under the cursor is something else, and it is invisible to every
 * test in this repo, because every test of that control REACHES THE HANDLER:
 *
 * THE EYE IS A CHECKBOX NOW, AND THAT IS WHY THIS FILE STILL MATTERS. The
 * control changed shape and label; it did not move, did not leave the corner
 * an overflowing tab name lands in, and did not stop being an in-flow sibling
 * of a body that grows a stacking context when it goes quiet. It INHERITS the
 * defect exactly, so it inherits these assertions exactly: the box is topmost
 * at its own centre CHECKED and UNCHECKED, at both stages.
 *
 *   - water.test.jsx drives the store's reducer through the strip's own
 *     arithmetic (selectionAfterCheck + setSelection), for every step that
 *     renders a box;
 *   - interaction.test.jsx and water.test.jsx's live cases call `.click()` on
 *     a node they queried by test id, which dispatches straight at it;
 *   - shell.test.jsx renders the strip and asserts on the state that came out.
 *
 * All three call the handler. NONE of them resolves a screen position to an
 * element. A handler bound to a control nothing can reach passes every one.
 *
 * SO THIS FILE NEVER CALLS A HANDLER. Every gesture under test is a mouse
 * moved to a coordinate and pressed there, in Chromium, with the browser's own
 * hit-testing deciding what receives it -- and the assertions are the two
 * halves of what the user saw: the SELECTION changed, and the box was the
 * element at its own centre. The second is the hover affordance itself, stated
 * as a claim a suite can hold.
 *
 * ONE CONTROL HERE IS NOT A TAB AT ALL. The report button sits below the
 * rail's seven rows and exists in exactly one state of the application -- a
 * design with every step committed -- which makes it the control least likely
 * to be noticed if it were unreachable. It gets the same two claims: topmost
 * at its own centre at both widths, and a real press that does something.
 *
 * IT RUNS AT TWO STAGE WIDTHS, AND THE NARROW ONE IS THE TEST. The defect was
 * never visible at a roomy width: the tabs had room, nothing overflowed, and
 * the control was on top in both states. It appears the moment the strip is
 * squeezed -- measured on the reference parcel at 1120px for water and 980px
 * for landform, which is the whole of "why water and not landform". A suite
 * that only ever renders 1280px cannot see it, so SQUEEZED is where the claims
 * are made and ROOMY is there to say the wide case still holds.
 *
 * HOW TO RUN IT:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/wizard/pointer.test.jsx
 *
 * SKIPPED, NOT FAILED, WITHOUT CHROMIUM OR WITHOUT A BACKEND -- layout.test
 * .jsx's posture and water.test.jsx's. A red suite that means "your machine is
 * different" teaches people to ignore red suites. It is not silent: see the
 * console lines in beforeAll.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** Where the environment keeps its Chromium. Not downloaded, not resolved. */
const CHROMIUM = '/opt/pw-browsers/chromium'

/** The backend, by the same constant apiClient reads. */
const API_URL = process.env.VITE_API_URL || 'http://localhost:5000'

/**
 * THE TWO STAGES. Roomy is the frame every other measurement in this suite is
 * taken at. Squeezed is a stage narrow enough that the tab strip's free track
 * cannot hold its tabs at their content width -- an ordinary half-screen
 * window, and the width at which the reported bug lives.
 */
const ROOMY = { width: 1280, height: 800 }
const SQUEEZED = { width: 900, height: 800 }
const STAGES = [
  ['a roomy stage', ROOMY],
  ['a squeezed stage', SQUEEZED],
]

/**
 * roads.test.jsx's own access points: on the reference parcel, and they route.
 *
 * KEPT IN STEP WITH THAT FILE, and C moved when it did. It was
 * [40.6434565, -79.9825183] and against this same backend it now routes
 * NOTHING -- PRODUCTION_SERVICE_RADIUS_METERS is 25 m rather than 100, so the
 * cheapest extension from there costs more per acre than the router will pay.
 * The generate fails with `no_candidate` and produces no network, and the
 * three-tab strip this file measures never reaches three. Re-surveyed with
 * ONE water zone committed, which is what the flow below commits.
 */
const ACCESS_A = [40.6434533, -79.9836992]
const ACCESS_B = [40.6458784, -79.9829624]
const ACCESS_C = [40.6450957852739, -79.9813830891847]

/** A real generate against a real DEM, twice over, is not a 5s test. */
const SLOW = 900_000

const available = existsSync(CHROMIUM)
let live = false
let server = null
let browser = null

/** The one page every section advances; see the note on ORDER below. */
let page = null

beforeAll(async () => {
  if (!available) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n  pointer.test.jsx SKIPPED: no Chromium at ${CHROMIUM}. These are the ` +
        `only assertions in the suite that HIT-TEST a control; everything else\n` +
        `  about the strip's behaviour is asserted through its handlers.\n`
    )
    return
  }
  try {
    const response = await fetch(`${API_URL}/api/health`)
    live = response.ok
  } catch {
    live = false
  }
  if (!live) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n  No backend at ${API_URL}. pointer.test.jsx is SKIPPED.\n` +
        '  Start one with: python serve_test_backend.py 5099\n'
    )
    return
  }

  const { createServer } = await import('vite')
  const { chromium } = await import('playwright')

  // The project's OWN dev server, so the harness builds through the same
  // plugin pipeline and the same stylesheets the app does. A static page with
  // hand-copied CSS would be a second copy of the thing under test.
  server = await createServer({ server: { port: 0 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({ executablePath: CHROMIUM })
  page = await browser.newPage({ viewport: ROOMY })

  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/src/wizard/pointer-harness.html`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.harnessReady === 'true')
  await page.waitForSelector('[data-testid="stage"] .chrome')
}, 300_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const describeIf = available ? describe : describe.skip
const liveIt = (name, fn) =>
  it(name, async (context) => (live ? fn(context) : context.skip()), SLOW)

/* ---------------------------------------------------------------------------
   The gestures, and the one reading that matters
   --------------------------------------------------------------------------- */

/**
 * PRESS SOMETHING WITH THE MOUSE, AT ITS OWN CENTRE.
 *
 * `page.mouse` rather than `locator.click()` on purpose, and the difference is
 * the whole file. Playwright's click performs an ACTIONABILITY CHECK first and
 * throws a readable error when the point is covered -- which is a fine way to
 * find this bug and a poor way to state it, because the failure would be
 * Playwright's opinion rather than the browser's behaviour. Moving the mouse
 * to a coordinate and pressing it is what the user does: whatever is on top
 * gets the press, and what the app does next is the assertion.
 */
async function press(testid) {
  const box = await page.locator(`[data-testid="${testid}"]`).boundingBox()
  expect(box, `${testid} has a rendered box to press`).not.toBeNull()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
  // One frame for React to commit, and one settle for the store.
  await page.waitForTimeout(150)
}

/**
 * WHAT IS ACTUALLY AT THIS CONTROL'S CENTRE.
 *
 * The hover affordance, stated as a fact the suite can hold: a control the
 * pointer cannot reach shows no hover, takes no click, and looks exactly like
 * one that does. `hits` is true when the topmost element at the centre is the
 * control or something inside it. A checkbox has no children -- its tick is a
 * pseudo-element and a pseudo-element takes no clicks -- so for it this is the
 * strict claim: the input itself is what the browser finds there.
 */
function topAt(testid) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { missing: true }
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    const name = (node) => {
      if (!node) return 'nothing'
      const className = typeof node.className === 'string' ? node.className : node.className?.baseVal
      return node.tagName.toLowerCase() + (className ? `.${String(className).split(' ')[0]}` : '')
    }
    return {
      hits: el === top || el.contains(top),
      top: name(top),
      testid: top?.closest?.('[data-testid]')?.dataset?.testid ?? null,
    }
  }, testid)
}

const evaluate = (fn, arg) => page.evaluate(fn, arg)

/** The strip's own reading of one tab's box: 'true', 'false', or undefined. */
const checkedOf = (tabId) =>
  evaluate((id) => document.querySelector(`[data-testid="tab-${id}"]`)?.dataset.checked, tabId)

/** Every tab the strip is rendering right now, in render order. */
const shownTabs = () =>
  evaluate(() => [...document.querySelectorAll('[data-tab-id]')].map((li) => li.dataset.tabId))

/** Every tab that is rendering a checkbox right now. */
const shownBoxes = () =>
  evaluate(() =>
    [...document.querySelectorAll('[data-tab-id]')]
      .filter((li) => li.querySelector('.chrome-tab__check'))
      .map((li) => li.dataset.tabId)
  )

/** What the control at this test id actually IS, and what state it is in. */
const isCheckbox = (testid) =>
  evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    return el ? { tag: el.tagName, type: el.type, checked: el.checked } : null
  }, testid)

/** What the commit would send for a step, as a string, so it compares byte for byte. */
const commitBody = (stepId) =>
  evaluate(
    (id) =>
      JSON.stringify(
        window.__probe.buildCommitBody(window.__probe.state, id, window.__probe.registryProposalFeatures)
      ),
    stepId
  )

/**
 * How many paths the map is drawing, all in.
 *
 * A COUNT RATHER THAN A LOOKUP BY ID, because the id a zone's path carries is
 * the layer stack's business and not this file's -- what the box promises is
 * that un-checking it takes the shape OFF the map and checking it puts the
 * shape BACK, and a count either side of the pair says exactly that.
 * water.test.jsx counts the same way, per pane.
 */
const pathsOnMap = () =>
  evaluate(() => document.querySelectorAll('.leaflet-container path').length)

const statusOf = (stepId) =>
  evaluate((id) => window.__probe.selectStepStatus(window.__probe.state, id), stepId)

async function resize(viewport) {
  await page.setViewportSize(viewport)
  await page.waitForTimeout(200)
}

async function waitForStore(fn, timeout = SLOW) {
  await page.waitForFunction(fn, null, { timeout })
}

/**
 * EVERY POINT MARKER ON THE MAP RIGHT NOW, BY KIND, WITH THE COLOUR THE
 * BROWSER ACTUALLY PAINTS IT -- the rendered half of the rule written
 * beside --ochre in index.css: ochre means a LIVE point marker, a committed
 * one joins its layer's settled treatment, and no two kinds of point marker
 * share a colour on one map at any step.
 *
 * COMPUTED, NOT DECLARED. A stylesheet can say two classes read two tokens
 * and still paint them the same if the tokens resolve alike; this reads
 * what the engine resolved. A kind is a marker class plus the modifiers
 * that change its colour (live against committed, pending, rejected); two
 * markers of one kind share a colour by definition, and that is not what
 * the rule forbids.
 */
async function pointMarkersOnMap() {
  return evaluate(() => {
    const kinds = new Map()
    const add = (kind, colour, opacity) => {
      if (!kinds.has(kind)) kinds.set(kind, { colour, opacity, count: 0 })
      kinds.get(kind).count += 1
    }
    const visible = (el) => {
      const box = el.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    for (const el of document.querySelectorAll('.leaflet-container .access-point-marker')) {
      if (!visible(el)) continue
      const style = getComputedStyle(el)
      const mods = ['committed', 'pending', 'focused'].filter((m) => el.classList.contains(`access-point-marker--${m}`))
      add(`access point${mods.length ? ` (${mods.join(', ')})` : ' (live)'}`, style.backgroundColor, Number(style.opacity))
    }
    for (const el of document.querySelectorAll('.leaflet-container .site-pin')) {
      if (!visible(el)) continue
      const body = el.querySelector('.site-pin__body')
      const mods = ['committed', 'pending', 'rejected', 'placed', 'focused'].filter((m) => el.classList.contains(`site-pin--${m}`))
      add(`site pin${mods.length ? ` (${mods.join(', ')})` : ' (live)'}`, getComputedStyle(body).fill, Number(getComputedStyle(el).opacity))
    }
    for (const el of document.querySelectorAll('.leaflet-container .vertex-marker')) {
      if (!visible(el)) continue
      add('vertex', getComputedStyle(el).backgroundColor, Number(getComputedStyle(el).opacity))
    }
    for (const el of document.querySelectorAll('.leaflet-container .caution-marker')) {
      if (!visible(el)) continue
      add('caution', getComputedStyle(el).backgroundColor, Number(getComputedStyle(el).opacity))
    }
    return [...kinds.entries()].map(([kind, v]) => ({ kind, ...v }))
  })
}

/**
 * THE CLAIM, AT ONE STEP: every kind of point marker on the map paints in a
 * colour no other kind on the same map paints in. Modifiers that do not
 * change the colour (placed, focused) are folded into their base kind
 * first, so a focused live pin and a live pin are one kind, as they should
 * be. Returns what it saw, for the log.
 */
async function assertPointMarkersDistinct(step) {
  const markers = await pointMarkersOnMap()
  const base = (kind) => kind.replace(/ \((?:placed|focused)(?:, (?:placed|focused))*\)$/, ' (live)').replace(', placed', '').replace(', focused', '')
  const byBase = new Map()
  for (const m of markers) {
    const key = base(m.kind)
    if (!byBase.has(key)) byBase.set(key, m.colour)
    expect(byBase.get(key), `${step}: ${m.kind} paints like the rest of its kind`).toBe(m.colour)
  }
  const kinds = [...byBase.entries()]
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      expect(
        kinds[i][1],
        `${step}: "${kinds[i][0]}" and "${kinds[j][0]}" must not share a colour on one map`
      ).not.toBe(kinds[j][1])
    }
  }
  // eslint-disable-next-line no-console
  console.log(`    markers at ${step.padEnd(10)} ${markers.map((m) => `${m.kind}=${m.colour}@${m.opacity}×${m.count}`).join('  ') || '(none)'}`)
  return markers
}

/** The colour the engine resolves a token to, so an assertion can name it. */
const tokenColour = (token) =>
  evaluate((name) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${name})`
    document.body.appendChild(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  }, token)

/**
 * A NUMERIC TOKEN'S VALUE, off the page, the way tokenColour reads a colour.
 *
 * BECAUSE A LEVEL IS index.css's TO CHOOSE. The committed opacity was asserted
 * here as the literal 0.4, which is a second copy of --pattern-committed, and
 * it broke the day the scale was raised to 0.55 -- with nothing about the
 * access point having changed. What this file has to say about a committed
 * point is that it is drawn at the COMMITTED LEVEL, whatever that is; the
 * number is the stylesheet's business and is asserted there.
 */
const tokenNumber = (token) =>
  evaluate(
    (name) => Number(getComputedStyle(document.documentElement).getPropertyValue(name).trim()),
    token
  )

/* ---------------------------------------------------------------------------
   ORDER, AND WHY THERE IS ONLY ONE PAGE
   ---------------------------------------------------------------------------
   Every section below runs against the SAME page, and each one's FIRST case
   advances the pipeline to its own step. That is not tidiness: reaching the
   water step means a real boundary commit, a real landform generate over the
   parcel's DEM and a real commit, and reaching roads means all of that plus a
   water commit and a road route. A page per test would multiply a five-minute
   walk by the number of claims made along it.

   The cost is that these sections are ORDERED. It is the same arrangement the
   live sections of water.test.jsx and roads.test.jsx already make with their
   `through...` helpers, one page further along.
   --------------------------------------------------------------------------- */

async function startSession() {
  await evaluate(() =>
    window.__probe.actions.setDraftInput('boundary', 'ring', window.__probe.BOUNDARY)
  )
  await press('commit-boundary')
  await waitForStore(() => Boolean(window.__probe.state.sessionId), 300_000)
}

async function generate(stepId) {
  await press(`generate-${stepId}`)
  // BOTH CONDITIONS, because they are two different facts: the payload has
  // landed, and the draft the strip renders from has been seeded off it. A
  // strip asked for its tabs between the two is a strip with none.
  //
  // OR A FAILED JOB, so a backend that cannot run this step fails the case
  // in seconds with the server's own reason rather than waiting out SLOW.
  await page.waitForFunction(
    (id) =>
      (window.__probe.selectStepStatus(window.__probe.state, id) === 'generated' &&
        window.__probe.state.drafts[id] !== undefined) ||
      Object.values(window.__probe.state.jobs).some(
        (job) => job.stepId === id && job.status === 'failed'
      ),
    stepId,
    { timeout: SLOW }
  )
  const failed = await evaluate(
    (id) =>
      Object.values(window.__probe.state.jobs).find((job) => job.stepId === id && job.status === 'failed')
        ?.error ?? null,
    stepId
  )
  expect(failed, `${stepId} generated rather than failed`).toBeNull()
}

async function commit(stepId) {
  await press(`commit-${stepId}`)
  await page.waitForFunction(
    (id) => window.__probe.selectStepStatus(window.__probe.state, id) === 'committed',
    stepId,
    { timeout: SLOW }
  )
}

/**
 * THE CLAIM, ONE TAB AT A TIME, AND IT IS THE WHOLE FILE IN SIX LINES.
 *
 * The box is topmost at its own centre while it is CHECKED. A real press
 * un-checks it. It is STILL topmost at its own centre -- this is the assertion
 * nothing in the repo made, and the one the user could see and the suite could
 * not. A second real press checks it again.
 */
async function pressableBothWays(stepId, tabId, where) {
  const at = `${stepId}/${tabId} on ${where}`

  expect(await checkedOf(tabId), `${at}: starts checked`).toBe('true')
  expect(await isCheckbox(`tab-check-${tabId}`), `${at}: it is a real checkbox`).toMatchObject({
    tag: 'INPUT',
    type: 'checkbox',
    checked: true,
  })
  expect(await topAt(`tab-check-${tabId}`), `${at}: the CHECKED box is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-check-${tabId}`)
  expect(await checkedOf(tabId), `${at}: a real click un-checked it`).toBe('false')
  expect(await isCheckbox(`tab-check-${tabId}`), `${at}: and the element itself says so`)
    .toMatchObject({ checked: false })

  expect(await topAt(`tab-check-${tabId}`), `${at}: the UNCHECKED box is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-check-${tabId}`)
  expect(await checkedOf(tabId), `${at}: a real click on the UNCHECKED box checked it again`).toBe('true')
}

/**
 * THE SAME CLAIM FOR A BOX THAT MAY ALREADY BE UNCHECKED.
 *
 * A radio step's strip has at most one checked box, so "start from checked" is
 * not a thing every tab can do. This drives whatever state the tab is in down
 * to UNCHECKED and back up, asserting the reading at each stop -- which is the
 * reported gesture exactly: a control that is off, pressed, and on again.
 */
async function checkableFromOff(stepId, tabId, where) {
  const at = `${stepId}/${tabId} on ${where}`

  expect(await isCheckbox(`tab-check-${tabId}`), `${at}: it is a real checkbox`).toMatchObject({
    tag: 'INPUT',
    type: 'checkbox',
  })
  expect(await topAt(`tab-check-${tabId}`), `${at}: the box is topmost at its own centre`)
    .toMatchObject({ hits: true })

  if ((await checkedOf(tabId)) === 'true') {
    await press(`tab-check-${tabId}`)
    expect(await checkedOf(tabId), `${at}: a real click un-checked it`).toBe('false')
  }

  expect(await topAt(`tab-check-${tabId}`), `${at}: the UNCHECKED box is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-check-${tabId}`)
  expect(await checkedOf(tabId), `${at}: a real click on the UNCHECKED box checked it again`).toBe('true')
}

/* ===========================================================================
   0. THE FOUR FLOATING COMPONENTS, AT REST
   ===========================================================================
   THE ACTION REGION GAVE UP ITS CARD AND THE ZOOM CONTROL GAINED A SURFACE,
   AND BOTH OF THOSE ARE HIT-TEST QUESTIONS BEFORE THEY ARE ANYTHING ELSE.

   The card's removal is the sharper of the two. A region that draws no
   background is still a BOX: `.chrome__bottom` turns pointer events on for
   each of its children, so the region's box -- the buttons plus the gap
   between them -- would have gone on swallowing clicks while showing nothing,
   which is the worst version of this defect rather than a new one. It is
   answered by making the region transparent to the pointer and handing the
   events back to the three things it places, and the only honest test of that
   is a browser resolving a coordinate to an element.

   The zoom control is the other half: it is the ONLY zoom affordance in the
   app -- scroll-wheel zoom is off permanently -- it is on screen in every
   state of every step, it sits in the corner the detail panel also claims,
   and nothing in this suite had ever asked whether it could be pressed.

   THIS SECTION RUNS FIRST AND PRESSES NOTHING. Every section below advances
   the pipeline and the sections are ordered (see ORDER); this one reads the
   page as it loads -- the boundary step, no session, one button in the corner
   -- so it can make the single-button claim, which is the only state that has
   one. The presses are at the bottom of the file, where a changed zoom level
   costs nothing.
   =========================================================================== */

/** Where a control's own centre lands, and what the browser finds there. */
const ZOOM_IN = '.leaflet-control-zoom-in'
const ZOOM_OUT = '.leaflet-control-zoom-out'

/**
 * press, for a control Leaflet names by class rather than by test id.
 *
 * The same gesture as press() and for the same reason: a real mouse at a real
 * coordinate, so the browser's own hit-testing decides what receives it.
 * Leaflet's own controls carry no data-testid and it is not this branch's
 * business to give them one -- the class IS their identity, and it is the
 * identity the stylesheet addresses them by too.
 */
async function pressSelector(selector) {
  const box = await page.locator(selector).boundingBox()
  expect(box, `${selector} has a rendered box to press`).not.toBeNull()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
  await page.waitForTimeout(400)
}

/** topAt, for a control Leaflet names by class rather than by test id. */
function topAtSelector(selector) {
  return page.evaluate((css) => {
    const el = document.querySelector(css)
    if (!el) return { missing: true }
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return { hits: el === top || el.contains(top), tag: top?.tagName ?? null }
  }, selector)
}

describeIf('0. the four floating components', () => {
  it('renders no card behind a single button, and leaves the gap to the map', async () => {
    // THE STATE: the boundary step with no session, which is the one state in
    // the build that offers exactly one button.
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll('.chrome-banner__button')].map((el) => el.textContent)
    )
    expect(buttons).toHaveLength(1)

    // THE REGION DRAWS NOTHING. Read off the cascade, which is the half
    // style.test.jsx cannot do: transparent, no border, no radius.
    const region = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.chrome-banner'))
      return {
        background: s.backgroundColor,
        borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        pointerEvents: s.pointerEvents,
      }
    })
    expect(region.background).toBe('rgba(0, 0, 0, 0)')
    for (const width of region.borders) expect(width).toBe('0px')
    expect(region.pointerEvents).toBe('none')

    // AND THE BUTTON IS ITS OWN SURFACE, opaque, with the casing under it.
    const button = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.chrome-banner__button'))
      return { background: s.backgroundColor, shadow: s.boxShadow }
    })
    expect(button.background).not.toContain('rgba')
    // --oxide laid solid: this state's one button is the forward move.
    expect(button.background).toBe('rgb(156, 74, 47)')
    // The ring in --paper (#fdfcf9) and a drop under it.
    expect(button.shadow).toContain('rgb(253, 252, 249)')
    expect(button.shadow.split(',').length).toBeGreaterThan(1)
  })

  it('leaves every control in all four components topmost at its own centre, at both widths', async () => {
    for (const [where, viewport] of STAGES) {
      await resize(viewport)

      // A: THE RAIL. Every row, not the cursor's alone -- a row that cannot be
      // pressed is a step you cannot open, and the ahead rows are the ones a
      // reader is most likely to try.
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('.chrome-rail__step')].map((el) => el.dataset.testid)
      )
      expect(rows.length).toBeGreaterThan(1)
      for (const testid of rows) {
        expect(await topAt(testid), `${testid} is topmost at its own centre on ${where}`)
          .toMatchObject({ hits: true })
      }

      // B: THE INSTRUCTION BAR. It holds no control in this state -- the undo
      // is the only one it can carry and nothing has been destroyed -- so what
      // is asserted is that the CARD is where the pointer finds it, which is
      // the same claim one level up: a region nothing can reach is a region
      // whose undo nobody can press.
      expect(await topAtSelector('.chrome-bar'), `the instruction bar on ${where}`)
        .toMatchObject({ hits: true })

      // E: THE ACTION REGION'S BUTTON, which is the card-less case.
      expect(await topAt('draw-boundary'), `the forward move on ${where}`)
        .toMatchObject({ hits: true })

      // AND THE GAP BESIDE IT IS MAP. The region's box is wider than its one
      // button by its own padding-free layout; a point just outside the button
      // and inside the region must reach the map, or the transparent region is
      // still swallowing clicks.
      const spill = await page.evaluate(() => {
        const region = document.querySelector('.chrome-banner').getBoundingClientRect()
        const button = document.querySelector('.chrome-banner__button').getBoundingClientRect()
        // A point on the region's own row, one pixel outside the button.
        const x = button.x - 1
        const y = button.y + button.height / 2
        if (x <= region.x) return { insideRegion: false }
        const top = document.elementFromPoint(x, y)
        return {
          insideRegion: true,
          reachesMap: Boolean(top?.closest('.leaflet-container')),
          top: top?.className ?? null,
        }
      })
      if (spill.insideRegion) {
        expect(spill.reachesMap, `the region's own gap is map on ${where}`).toBe(true)
      }

      // THE ZOOM CONTROL: both buttons, which is the only zoom in the app.
      for (const selector of [ZOOM_IN, ZOOM_OUT]) {
        expect(await topAtSelector(selector), `${selector} is topmost at its own centre on ${where}`)
          .toMatchObject({ hits: true })
      }
    }
    await resize(ROOMY)
  })

  it('gives the zoom control the shared surface, a hairline between its buttons, and a ring', async () => {
    // THE CASCADE, NOT THE STYLESHEET. Leaflet's own rules outrank a bare
    // class -- `.leaflet-bar a`, `.leaflet-touch .leaflet-bar` -- so the only
    // way to know the default is gone is to read what the engine resolved.
    const read = await page.evaluate(() => {
      const card = document.querySelector('.leaflet-control-zoom')
      const [plus, minus] = card.querySelectorAll('a')
      const s = getComputedStyle(card)
      const b = getComputedStyle(plus)
      return {
        card: {
          background: s.backgroundColor,
          border: s.borderTopWidth,
          borderColor: s.borderTopColor,
          radius: s.borderTopLeftRadius,
          shadow: s.boxShadow,
          overflow: s.overflow,
        },
        button: {
          background: b.backgroundColor,
          color: b.color,
          family: b.fontFamily,
          ownBorder: b.borderTopWidth,
        },
        divider: getComputedStyle(minus).borderTopWidth,
        dividerColor: getComputedStyle(minus).borderTopColor,
      }
    })

    // THE SHARED SURFACE: --paper, a --rule hairline, the system's --radius.
    expect(read.card.background).toBe('rgb(253, 252, 249)')
    expect(read.card.border).toBe('1px')
    expect(read.card.borderColor).toBe('rgb(221, 214, 200)')
    expect(read.card.radius).toBe('4px')
    expect(read.card.overflow).toBe('hidden')
    // Leaflet's own drop shadow is off: the other cards in this shell have
    // none, and this is a card.
    expect(read.card.shadow).toBe('none')

    // THE HAIRLINE BETWEEN THE TWO, which is the rail's device on a list of
    // two -- and not Leaflet's own 1px #ccc, which is a different colour.
    expect(read.divider).toBe('1px')
    expect(read.dividerColor).toBe('rgb(221, 214, 200)')
    // The first button carries no rule of its own; the card's edge is above it.
    expect(read.button.ownBorder).toBe('0px')

    // THE GLYPHS ARE THE SYSTEM'S FACE, not Lucida Console at 18px bold.
    expect(read.button.family).toContain('Source Serif')
    expect(read.button.color).toBe('rgb(43, 43, 38)')
    expect(read.button.background).toBe('rgb(253, 252, 249)')

    // AND A KEYBOARD USER CAN SEE WHERE THEY ARE, ON BOTH BUTTONS.
    //
    // KEYBOARD FIRST, THEN FOCUS. :focus-visible is a heuristic about how the
    // focus ARRIVED -- a control focused while the last interaction was a
    // mouse press does not match it, and `element.focus()` on a page that has
    // only ever been clicked is that case. So a Tab puts the page in keyboard
    // mode first, which is layout.test.jsx's method for the same question.
    await page.keyboard.press('Tab')
    for (const selector of [ZOOM_IN, ZOOM_OUT]) {
      const ring = await page.evaluate((css) => {
        const el = document.querySelector(css)
        el.focus()
        const s = getComputedStyle(el)
        const out = {
          visible: el.matches(':focus-visible'),
          width: s.outlineWidth,
          style: s.outlineStyle,
          colour: s.outlineColor,
          offset: s.outlineOffset,
        }
        el.blur()
        return out
      }, selector)
      expect(ring.visible, `${selector} matches :focus-visible`).toBe(true)
      expect(ring.style, `${selector} draws a ring`).toBe('solid')
      expect(ring.width).toBe('2px')
      expect(ring.colour).not.toBe('rgba(0, 0, 0, 0)')
      // INSET, for the rail's reason: the card clips its two rows, and a ring
      // at the reset's +2px offset would sit outside that clip -- present in
      // the accessibility tree and invisible on screen.
      expect(ring.offset).toBe('-3px')
    }
  })
})

/* ===========================================================================
   1. THE MULTI-SELECT STEPS, DERIVED RATHER THAN LISTED
   =========================================================================== */

describeIf('the checkbox takes a real click in both directions', () => {
  liveIt('reaches the landform step', async () => {
    await startSession()
    // [5] THE BOUNDARY IS COMMITTED AND NO POINT MARKER IS LEFT: nothing
    // ochre, nothing at all, on the map at landform.
    await assertPointMarkersDistinct('boundary')
    await generate('landform')
    expect(await statusOf('landform')).toBe('generated')
    expect((await shownBoxes()).length).toBeGreaterThan(0)
    await assertPointMarkersDistinct('landform')
  })

  /**
   * THE LIST IS THE BUILD'S, NOT THIS FILE'S -- the both-directions assertion
   * in water.test.jsx derives its cases the same way, and for the same reason:
   * a step registered later with checkboxes joins these cases by existing
   * rather than by someone remembering. It is asserted rather than merely
   * iterated so that a new one FAILS here until its section below exists.
   */
  liveIt('covers every multi-select step this build registers', async () => {
    const registered = await evaluate(() =>
      window.__probe.STEP_DEFINITIONS.filter(
        (definition) => definition.selection?.mode === 'multiple' && definition.proposalCollection
      ).map((definition) => definition.id)
    )
    // TREES JOINED BY EXISTING, and has its own section below. So did
    // STRUCTURES, whose placed tabs carry the × as well, and FENCING, whose
    // tab is a fence TYPE and whose box toggles every loop of it.
    expect(registered).toEqual(['landform', 'water', 'trees', 'structures', 'fencing'])
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`landform: every box, un-checked and checked by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('landform', tabId, where)
      }
      await resize(ROOMY)
    })
  }

  /**
   * ...AND WITH THE DETAIL PANEL OPEN, WHICH IS A STATE THE BOX NOW HAS.
   *
   * The panel is a floating card in the map's top-right corner and the strip
   * is in the bottom row, so on paper they never meet -- layout.test.jsx
   * measures exactly that and does it at four viewport heights. What layout
   * cannot answer is the question this file exists for: whether the browser
   * agrees about which element is at a coordinate. The panel is a positioned
   * card over the same overlay; "they do not overlap" and "the box still takes
   * the press" are two different claims and only one of them has been made.
   *
   * IT IS ALSO A NEW STATE. The panel used to open on a click and say the same
   * kind of thing at any width; it now repeats the tab's OWN ROWS above its
   * break, so it grows with the strip's content rather than independently of
   * it, and the squeezed stage is where a growing card finds a control.
   *
   * AND THE PANEL ITSELF OFFERS NOTHING TO PRESS, which is asserted rather
   * than assumed -- "any panel control" has an answer, and the answer is that
   * under the shared format there are none. A step that adds one joins this
   * case by failing it.
   */
  liveIt('keeps the box pressable with the detail panel open, at both widths', async () => {
    const boxes = await shownBoxes()
    expect(boxes[0], 'landform has a tab to focus').toBeDefined()

    // THE TALLEST PANEL, NOT THE FIRST ONE. A block's panel is no longer a
    // fixed number of rows: the soil run is one to three, so which block is
    // focused decides how far the card reaches down the stage. The press below
    // has to be made under the WORST case, and the worst case is measured here
    // rather than guessed at -- a hard-coded tab id would stop being the tall
    // one the first time the fixture's soils change.
    let first = boxes[0]
    let tallest = -1
    let continuations = 0
    for (const tabId of boxes) {
      await press(`tab-focus-${tabId}`)
      const measured = await evaluate(() => ({
        rows: document.querySelectorAll('.chrome-detail__rows > *').length,
        continuations: document.querySelectorAll('[data-row="continuation"]').length,
      }))
      if (measured.rows > tallest) {
        tallest = measured.rows
        first = tabId
      }
      continuations = Math.max(continuations, measured.continuations)
      await press(`tab-focus-${tabId}`)
    }
    // AND THE TALL CASE IS REAL ON THIS PAYLOAD. A run of one on every block
    // would make the whole measurement above a no-op, and the press below
    // would be testing the panel this branch did not change.
    expect(continuations, 'some block renders a multi-row soil run').toBeGreaterThan(0)

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      // THE PANEL OPENS ON A REAL PRESS of the tab body, which is the gesture.
      await press(`tab-focus-${first}`)
      const open = await evaluate(() => document.querySelector('.chrome-detail') !== null)
      expect(open, `${where}: the panel opened`).toBe(true)

      // IT IS THE SHARED FORMAT that is on screen -- the rows grid, with the
      // tab's own rows repeated above a break.
      expect(
        await evaluate(() => document.querySelectorAll('.chrome-detail__rows hr').length),
        `${where}: the panel shows the format's break`
      ).toBe(1)

      // NOTHING IN THE PANEL IS A CONTROL. No button, no input, no link, and
      // nothing given a role or a tabindex that makes it one.
      expect(
        await evaluate(() =>
          [
            ...document.querySelectorAll(
              '.chrome-detail button, .chrome-detail input, .chrome-detail select, ' +
                '.chrome-detail textarea, .chrome-detail a[href], .chrome-detail [tabindex], ' +
                '.chrome-detail [role="button"], .chrome-detail [onclick]'
            ),
          ].map((el) => el.tagName)
        ),
        `${where}: the detail panel offers nothing to press`
      ).toEqual([])

      // THE SOIL RUN IS ON SCREEN, which is what makes this the tall panel.
      expect(
        await evaluate(() => document.querySelectorAll('[data-row="continuation"]').length),
        `${where}: the tallest panel carries its soil continuations`
      ).toBeGreaterThan(0)

      // AND THE BOX IS STILL THE ELEMENT AT ITS OWN CENTRE, both ways, with
      // the panel on screen the whole time.
      await pressableBothWays('landform', first, `${where} with the panel open`)
      expect(
        await evaluate(() => document.querySelector('.chrome-detail') !== null),
        `${where}: the panel is still open after the presses`
      ).toBe(true)

      // Let go of the focus, so the next width starts from the same place.
      await press(`tab-focus-${first}`)
    }
    await resize(ROOMY)
  })
})

/* ===========================================================================
   2. THE × ON A DRAWN TAB, IN EVERY STATE IT RENDERS IN
   ===========================================================================
   The × is the other control on a tab, it is the only one that DESTROYS, and
   it renders in four combinations: box checked or not, focused or not. The
   defect this file was written for is "a control is styled interactive and is
   not hit-testable in one of its states", so every state it has is asked.
   =========================================================================== */

describeIf('the × on a drawn tab', () => {
  const DRAWN = 'drawn-pointer-probe'

  /** The drawn tab's box, moved through the store: setup, never the gesture. */
  const setDrawnBox = async (on) => {
    await evaluate(
      ([id, wanted]) =>
        window.__probe.actions.setSelection('landform', (current) =>
          wanted ? [...new Set([...current, id])] : current.filter((each) => each !== id)
        ),
      [DRAWN, on]
    )
    await page.waitForTimeout(120)
  }

  liveIt('is hit-testable with the box checked or not, focused or not, at both widths', async () => {
    // THE SHAPE IS SETUP, NOT THE GESTURE UNDER TEST. Tracing a polygon with
    // the mouse is DrawGesture's claim and it is asserted where that lives;
    // what is asked here is whether the tab's × can be pressed once the tab
    // exists, so the shape arrives by the same action the gesture ends in.
    await evaluate((id) => {
      const [lat, lng] = window.__probe.BOUNDARY[0]
      const d = 0.0004
      window.__probe.actions.addDrawnFeature('landform', {
        type: 'Feature',
        id,
        properties: { provenance: 'user_added', acres: 0.4 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat - d], [lng, lat - d], [lng, lat]]],
        },
      })
    }, DRAWN)
    await page.waitForTimeout(200)
    expect(await shownTabs()).toContain(DRAWN)

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const focused of [false, true]) {
        if (focused) await press(`tab-focus-${DRAWN}`)
        for (const checked of [true, false]) {
          // THE BOX IS MOVED THROUGH THE STORE HERE, and only here. It is a
          // STATE this control has to survive, not the gesture being asked
          // about -- and pressing it with the mouse would make this test fail
          // for the checkbox's reasons rather than the ×'s, which is exactly
          // the confusion a control-specific claim should not carry.
          await setDrawnBox(checked)
          expect(await checkedOf(DRAWN)).toBe(String(checked))
          expect(
            await topAt(`tab-remove-${DRAWN}`),
            `the × is topmost at its own centre on ${where}, checked ${checked}, focused ${focused}`
          ).toMatchObject({ hits: true })
        }
        await setDrawnBox(true)
        if (focused) await press(`tab-focus-${DRAWN}`)
      }
    }
    await resize(ROOMY)
  })

  liveIt('destroys the tab when the mouse presses it', async () => {
    expect(await shownTabs()).toContain(DRAWN)
    await press(`tab-remove-${DRAWN}`)
    expect(await shownTabs()).not.toContain(DRAWN)
  })
})

/* ===========================================================================
   2b. THE CANCELLED RING LEAVES NOTHING TO PRESS
   =========================================================================== */

describeIf('a cancelled ring', () => {
  /** A [lat, lng] on the parcel as a page coordinate, through Leaflet's own projection. */
  const pixelFor = (latlng) =>
    evaluate((coords) => {
      const p = window.__probe.map.latLngToContainerPoint(coords)
      const box = window.__probe.map.getContainer().getBoundingClientRect()
      return { x: box.x + p.x, y: box.y + p.y }
    }, latlng)

  const clickMap = async (latlng) => {
    const point = await pixelFor(latlng)
    await page.mouse.move(point.x, point.y)
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(120)
    return point
  }

  /**
   * Every VERTEX the zone tool has on the map right now.
   *
   * `.vertex-marker` rather than `.leaflet-marker-icon`: a caution marker is a
   * Leaflet marker too, and the ring's own crossings are exactly what a
   * half-drawn block over the hydric mask puts on the map. Counting both would
   * make this test about two things and fail for whichever moved.
   */
  const vertexMarkers = () =>
    evaluate(() => document.querySelectorAll('.vertex-marker').length)

  /** And every caution the gesture is showing -- cleared with the ring. */
  const cautionMarkers = () =>
    evaluate(() => document.querySelectorAll('.caution-marker').length)

  /**
   * WHAT THE BROWSER FINDS AT A VERTEX'S OWN POSITION.
   *
   * THIS IS THE TEST. A cancelled ring's vertices were left on the map with no
   * way to clear them, so "gone" has to mean gone from the hit-testing too --
   * a marker that is invisible but still under the pointer is the same class
   * of defect as the eye that could not be clicked, one level down. Asked of
   * elementFromPoint rather than of the DOM, because a node that is still
   * there and a node that is not look identical to every other test in this
   * repo.
   */
  const whatIsAt = (point) =>
    evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y)
      const stack = document.elementsFromPoint(x, y)
      return {
        top: top ? top.className?.baseVal ?? String(top.className) : 'nothing',
        markers: stack.filter((node) => node.classList?.contains('vertex-marker')).length,
      }
    }, point)

  liveIt('leaves no vertex, no panel and nothing under the pointer', async () => {
    // The step is landform and nothing is armed -- the sections above left it
    // generated, with one drawn tab destroyed by the mouse.
    expect(await statusOf('landform')).toBe('generated')

    // DRAW THREE CORNERS WITH THE MOUSE, and do not close the ring.
    await press('draw-landform')
    expect(await evaluate(() => window.__probe.cursor.armed)).toBe('draw')
    const corners = [
      [40.6448, -79.9825],
      [40.6446, -79.9818],
      [40.6442, -79.9822],
    ]
    const placed = []
    for (const corner of corners) placed.push(await clickMap(corner))

    // The gesture is live: the panel counts the vertices and the map carries
    // one marker per corner.
    expect(await evaluate(() => document.querySelector('[data-testid="detail-name-landform"]')?.textContent))
      .toBe('Drawing a zone')
    expect(await vertexMarkers()).toBe(corners.length)

    // CANCEL, with the mouse.
    await press('cancel-landform')

    // THE TOOL IS OFF, the panel is out of the drawing state, and the ring is
    // gone from the DOM.
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()
    expect(await evaluate(() => document.querySelector('[data-testid="detail-vertices-landform"]'))).toBeNull()
    expect(await vertexMarkers()).toBe(0)
    // The ring's live cautions go with it: they were the gesture's, and the
    // gesture is over.
    expect(await cautionMarkers()).toBe(0)

    // AND NOTHING IS LEFT UNDER THE POINTER at any corner the user placed.
    for (const [index, point] of placed.entries()) {
      const at = await whatIsAt(point)
      expect(at.markers, `nothing to press where corner ${index + 1} was`).toBe(0)
    }

    // THE NEXT RING STARTS FROM ONE. The abandoned gesture is not waiting to
    // be finished, which is what "no way to clear them" meant for the user.
    await press('draw-landform')
    await clickMap(corners[0])
    expect(
      await evaluate(
        () => document.querySelector('[data-testid="detail-vertices-landform"] .measure')?.textContent
      )
    ).toBe('1')
    expect(await vertexMarkers()).toBe(1)

    // Leave the step as this section found it: nothing armed, nothing drawn.
    await press('cancel-landform')
    expect(await vertexMarkers()).toBe(0)
    expect(await evaluate(() => window.__probe.selectDraft(window.__probe.state, 'landform').drawnFeatures.length)).toBe(0)
  })
})

/* ===========================================================================
   3. WATER: THE STEP THE BUG WAS REPORTED ON
   =========================================================================== */

describeIf('water', () => {
  liveIt('reaches the water step', async () => {
    await commit('landform')
    await assertPointMarkersDistinct('water')
    expect(await evaluate(() => window.__probe.cursor.cursorStepId)).toBe('water')
    await generate('water')

    // THE STRIP AS IT COMES UP, whatever shape that is -- and on this parcel
    // the shape CHANGED under this test.
    //
    // It used to assert the strip collapses here ("more zones than a row
    // holds"), which was true while the payload carried every surviving zone.
    // build_water_payload() now narrows to the PRESENTED set -- two of each
    // type -- so the parcel ships exactly one row's worth and the strip does
    // not collapse. That is the backend's decision and not a regression here,
    // but the sentence this test was written around is no longer true of the
    // fixture, so it is corrected rather than relaxed.
    //
    // WHAT IS ASSERTED NOW is that the strip came up with tabs at all and that
    // its count is the payload's presented count -- the thing that has to hold
    // for every press below to be pressing a real tab. The tests that follow
    // press whatever the strip is showing, collapsed or not, so none of them
    // depended on the old sentence; this one did.
    const tabCount = Number(
      await evaluate(() => document.querySelector('[data-testid="tabs-water"]').dataset.tabCount)
    )
    const presented = Number(
      await evaluate(() => window.__probe.state.steps.water.proposals.summary.presentation.presented_count)
    )
    expect(tabCount).toBeGreaterThan(0)
    expect(tabCount).toBe(presented)
    // eslint-disable-next-line no-console
    console.log(
      `POINTER WATER  ${tabCount} tab(s) on the strip, presented_count ${presented} -- ` +
        `${tabCount > 4 ? 'collapsed' : 'one row, not collapsed'}`
    )
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`every box on the collapsed strip, un-checked and checked by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('water', tabId, `${where}, collapsed`)
      }
      await resize(ROOMY)
    })
  }

  liveIt('every box on the expanded strip, on both stages', async () => {
    const more = await page.$('[data-testid="tabs-more-water"]')
    if (more) await press('tabs-more-water')
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('water', tabId, `${where}, expanded`)
      }
      await resize(ROOMY)
    }
  })

  /**
   * OFF THEN ON RESTORES THE ZONE TO THE MAP AND TO THE COMMIT BODY, BYTE FOR
   * BYTE -- and every press here is a real one, which is what this adds to the
   * assertion water.test.jsx already makes through the store.
   */
  liveIt('restores the zone to the map and to the commit body, byte for byte', async () => {
    await resize(SQUEEZED)
    const [tabId] = await shownBoxes()
    const untouched = await commitBody('water')
    const paths = await pathsOnMap()
    expect(paths).toBeGreaterThan(0)

    await press(`tab-check-${tabId}`)
    expect(await checkedOf(tabId)).toBe('false')
    expect(await pathsOnMap(), 'the zone left the map').toBeLessThan(paths)
    expect(JSON.parse(await commitBody('water')).features.features.map((f) => f.id)).not.toContain(tabId)

    await press(`tab-check-${tabId}`)
    expect(await checkedOf(tabId)).toBe('true')
    expect(await pathsOnMap(), 'the zone came back to the map').toBe(paths)
    expect(await commitBody('water'), 'and the commit body is the one it started as').toBe(untouched)
    await resize(ROOMY)
  })
})

/* ===========================================================================
   4. THE ROADS CHECKBOX, WHICH IS THE SAME BOX IN A DIFFERENT MODE
   ===========================================================================
   Roads is radio: one network or none. Its off state is reachable by pressing
   its own box (which empties the selection) and by ticking another network.
   An unpressable unchecked box there would be exactly as invisible as
   water's, and the tab markup is shared -- so the claim is made here rather
   than assumed from the shared component.
   =========================================================================== */

describeIf('the roads checkbox', () => {
  /** How many networks the payload is carrying right now. */
  const networkCount = () =>
    evaluate(() => (window.__probe.selectStepProposals(window.__probe.state, 'roads')?.networks ?? []).length)

  /**
   * ARM, THEN CLICK THE MAP WITH THE MOUSE at a coordinate on the parcel --
   * projected through the map's own transform, so the press lands where
   * Leaflet thinks the point is rather than where this file guessed.
   */
  async function placeAccessPoint(latlng) {
    await press('access-roads')
    const point = await evaluate((coords) => {
      const p = window.__probe.map.latLngToContainerPoint(coords)
      const box = window.__probe.map.getContainer().getBoundingClientRect()
      return { x: box.x + p.x, y: box.y + p.y }
    }, latlng)
    await page.mouse.move(point.x, point.y)
    await page.mouse.click(point.x, point.y)
    await waitForStore(
      () => window.__probe.selectDraft(window.__probe.state, 'roads').inputs.access_point !== undefined,
      60_000
    )
  }

  /** Generate, and wait until the payload is carrying `expected` networks. */
  async function generateNetwork(expected) {
    await press('generate-roads')
    await page.waitForFunction(
      (want) =>
        (window.__probe.selectStepProposals(window.__probe.state, 'roads')?.networks ?? []).length === want,
      expected,
      { timeout: SLOW }
    )
    await page.waitForTimeout(300)
  }

  liveIt('is hit-testable in its off state, and a real click opens it again', async () => {
    await evaluate(() => {
      const ids = window.__probe
        .registryProposalFeatures(window.__probe.selectStepProposals(window.__probe.state, 'water'), 'water')
        .map((feature) => feature.id)
      window.__probe.actions.setSelection('water', [ids[0]])
    })
    await page.waitForTimeout(150)
    await commit('water')
    expect(await evaluate(() => window.__probe.cursor.cursorStepId)).toBe('roads')

    await placeAccessPoint(ACCESS_A)

    // NOT `drafts.roads !== undefined`: the access point IS a draft input, so
    // the draft exists the moment the map is clicked and a wait on it would
    // resolve before the router had run. The network is what arrives.
    // NOT `drafts.roads !== undefined`: the access point IS a draft input, so
    // the draft exists the moment the map is clicked and a wait on it would
    // resolve before the router had run. The network is what arrives.
    await generateNetwork(1)

    // THREE POINTS, NOT ONE, AND THE COUNT IS THE TEST. One network is one
    // tab, one tab is one column, and one column has all the room there is --
    // so a single-network strip is the one arrangement that CANNOT squeeze,
    // and a claim made only there would pass with the defect in place. Three
    // is what the step allows and what makes this strip the shape water's is.
    for (const point of [ACCESS_B, ACCESS_C]) {
      await placeAccessPoint(point)
      await generateNetwork((await networkCount()) + 1)
    }
    expect(await networkCount()).toBe(3)

    // [4] THREE LIVE ACCESS POINTS, ALL OCHRE, at full weight; nothing else
    // on the map is a point marker. [5] One kind, so nothing to clash with.
    const atRoads = await assertPointMarkersDistinct('roads')
    const liveAccess = atRoads.filter((m) => m.kind.startsWith('access point') && !m.kind.includes('committed'))
    expect(liveAccess.reduce((n, m) => n + m.count, 0)).toBe(3)
    for (const m of liveAccess) {
      expect(m.colour).toBe(await tokenColour('--ochre'))
      expect(m.opacity).toBe(1)
    }
    expect(atRoads.some((m) => m.kind.includes('committed'))).toBe(false)

    const boxes = await shownBoxes()
    expect(boxes.length, 'the access points routed networks, so their tabs carry boxes').toBe(3)

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const tabId of boxes) await checkableFromOff('roads', tabId, where)
      await resize(ROOMY)
    }
  })
})

/* ===========================================================================
   4b. TREES: THE SAME TWO CONTROLS, ONE STEP FURTHER ALONG
   ===========================================================================
   Trees is landform's shape -- candidates with checkboxes, plus drawn tabs
   carrying an × -- rendered over a strip that follows a roads commit. The
   claim is the file's: the box is topmost at its own centre CHECKED and
   UNCHECKED, and the × is topmost in every combination of checked and
   focused, at both stages. Asked here rather than assumed from the shared
   markup, because that is exactly the assumption the eye bug hid behind.
   =========================================================================== */

/**
 * REACH TREES FROM WHEREVER THE PAGE IS. Run after the sections above, the
 * page is on roads with a network routed and this commits it. Run on its
 * own (`-t 'the trees checkbox'`), it walks the pipeline itself, so the
 * section stands alone against the same served backend as the rest.
 */
const cursorStep = () => evaluate(() => window.__probe.cursor.cursorStepId)
async function reachTrees() {
  if ((await cursorStep()) === 'trees') return
  if (!(await evaluate(() => Boolean(window.__probe.state.sessionId)))) await startSession()
  if ((await cursorStep()) === 'landform') {
    await generate('landform')
    await commit('landform')
  }
  if ((await cursorStep()) === 'water') {
    await generate('water')
    await evaluate(() => {
      const ids = window.__probe
        .registryProposalFeatures(window.__probe.selectStepProposals(window.__probe.state, 'water'), 'water')
        .map((feature) => feature.id)
      window.__probe.actions.setSelection('water', [ids[0]])
    })
    await page.waitForTimeout(150)
    await commit('water')
  }
  if ((await cursorStep()) === 'roads') {
    const networks = () =>
      evaluate(() => (window.__probe.selectStepProposals(window.__probe.state, 'roads')?.networks ?? []).length)
    if ((await networks()) === 0) {
      await press('access-roads')
      const point = await evaluate((coords) => {
        const p = window.__probe.map.latLngToContainerPoint(coords)
        const box = window.__probe.map.getContainer().getBoundingClientRect()
        return { x: box.x + p.x, y: box.y + p.y }
      }, ACCESS_A)
      await page.mouse.move(point.x, point.y)
      await page.mouse.click(point.x, point.y)
      await waitForStore(
        () => window.__probe.selectDraft(window.__probe.state, 'roads').inputs.access_point !== undefined,
        60_000
      )
      await press('generate-roads')
      await page.waitForFunction(
        () => (window.__probe.selectStepProposals(window.__probe.state, 'roads')?.networks ?? []).length === 1,
        null,
        { timeout: SLOW }
      )
      await page.waitForTimeout(300)
    }
    await commit('roads')
  }
  expect(await cursorStep()).toBe('trees')
}

describeIf('the trees checkbox and ×', () => {
  const DRAWN = 'drawn-tree-pointer-probe'

  const setDrawnBox = async (on) => {
    await evaluate(
      ([id, wanted]) =>
        window.__probe.actions.setSelection('trees', (current) =>
          wanted ? [...new Set([...current, id])] : current.filter((each) => each !== id)
        ),
      [DRAWN, on]
    )
    await page.waitForTimeout(120)
  }

  liveIt('reaches the trees step and generates', async () => {
    await reachTrees()
    await generate('trees')
    expect(await statusOf('trees')).toBe('generated')
    expect((await shownBoxes()).length, 'the fixture yields tree zone candidates').toBeGreaterThan(0)
    // [4] THE COMMITTED ACCESS POINT HAS TURNED TO INK, at committed muting:
    // the road's own token, --road, which is --ink; and nothing ochre is
    // left on the map, because nothing here is a live point.
    const atTrees = await assertPointMarkersDistinct('trees')
    const committedAccess = atTrees.find((m) => m.kind === 'access point (committed)')
    expect(committedAccess, 'the committed access point is still on the map').toBeDefined()
    expect(committedAccess.colour).toBe(await tokenColour('--ink'))
    expect(committedAccess.colour).toBe(await tokenColour('--road'))
    expect(committedAccess.opacity).toBeCloseTo(await tokenNumber('--pattern-committed'), 5)
    const ochre = await tokenColour('--ochre')
    expect(atTrees.some((m) => m.colour === ochre)).toBe(false)
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`every candidate's box, un-checked and checked by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('trees', tabId, where)
      }
      await resize(ROOMY)
    })
  }

  liveIt('the × on a drawn tree zone is hit-testable checked or not, focused or not, at both widths', async () => {
    // THE SHAPE IS SETUP, NOT THE GESTURE UNDER TEST -- the landform section's
    // reason. It arrives by the action the draw gesture ends in.
    await evaluate((id) => {
      const [lat, lng] = window.__probe.BOUNDARY[0]
      const d = 0.0004
      window.__probe.actions.addDrawnFeature('trees', {
        type: 'Feature',
        id,
        properties: { layer: 'tree_zone_candidate', provenance: 'user_added', acres: 0.4, cautions: [] },
        geometry: {
          type: 'Polygon',
          coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat - d], [lng, lat - d], [lng, lat]]],
        },
      })
    }, DRAWN)
    await page.waitForTimeout(200)
    // THE STRIP MAY COLLAPSE: the drawn tab is last, and a parcel with more
    // candidates than a row holds hides it behind "+N more" until expanded.
    // Expanded is the state a user reaches a hidden tab in, so it is asked
    // there; water's expanded case makes the same move.
    if (await page.$('[data-testid="tabs-more-trees"]')) await press('tabs-more-trees')
    expect(await shownTabs()).toContain(DRAWN)

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const focused of [false, true]) {
        if (focused) await press(`tab-focus-${DRAWN}`)
        for (const checked of [true, false]) {
          await setDrawnBox(checked)
          expect(await checkedOf(DRAWN)).toBe(String(checked))
          expect(
            await topAt(`tab-remove-${DRAWN}`),
            `the × is topmost at its own centre on ${where}, checked ${checked}, focused ${focused}`
          ).toMatchObject({ hits: true })
          expect(
            await topAt(`tab-check-${DRAWN}`),
            `the drawn tab's box is topmost at its own centre on ${where}, checked ${checked}, focused ${focused}`
          ).toMatchObject({ hits: true })
        }
        await setDrawnBox(true)
        if (focused) await press(`tab-focus-${DRAWN}`)
      }
    }
    await resize(ROOMY)
  })

  liveIt('destroys the drawn tree zone when the mouse presses its ×', async () => {
    expect(await shownTabs()).toContain(DRAWN)
    await press(`tab-remove-${DRAWN}`)
    expect(await shownTabs()).not.toContain(DRAWN)
  })
})

/* ===========================================================================
   4c. STRUCTURES: THE SAME TWO CONTROLS, AND A SITE PLACED WITH THE MOUSE
   ===========================================================================
   Structures is trees' shape one step further along: candidates with
   checkboxes, plus PLACED tabs carrying an ×. The placed site arrives the
   way a user makes one -- "Place a site" pressed with the mouse, then the
   map pressed at a spot inside the parcel -- so the free-point gesture is
   hit-tested here too, not only its handler. The claim is the file's: the
   box is topmost at its own centre CHECKED and UNCHECKED, and the × is
   topmost in every combination of checked and focused, at both stages.
   =========================================================================== */

describeIf('the structures checkbox and ×', () => {
  /**
   * A spot twelve metres west of the reference parcel's rank-1 site --
   * structures.test.jsx's CLEAN, surveyed against the same served backend.
   * It scores, clears every siting rule, and ranks below the three.
   */
  const CLEAN = [40.64328007915633, -79.98334560864593]

  const placedIds = () =>
    evaluate(() => window.__probe.selectDraft(window.__probe.state, 'structures').drawnFeatures.map((f) => f.id))

  const setPlacedBox = async (id, on) => {
    await evaluate(
      ([featureId, wanted]) =>
        window.__probe.actions.setSelection('structures', (current) =>
          wanted ? [...new Set([...current, featureId])] : current.filter((each) => each !== featureId)
        ),
      [id, on]
    )
    await page.waitForTimeout(120)
  }

  /** Reach structures from wherever the page is: after 4b it is on trees, generated. */
  async function reachStructures() {
    if ((await cursorStep()) === 'structures') return
    await reachTrees()
    if ((await statusOf('trees')) !== 'generated') await generate('trees')
    await commit('trees')
    expect(await cursorStep()).toBe('structures')
  }

  liveIt('reaches the structures step and generates, with nothing armed', async () => {
    await reachStructures()
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()
    await generate('structures')
    expect(await statusOf('structures')).toBe('generated')
    // HOW MANY SITES THIS RUN FOUND, READ OFF THE PAYLOAD rather than typed.
    //
    // This asserted a literal 3, and the number is not the fixture's to
    // promise: how many pads survive depends on what the four upstream steps
    // COMMITTED, and this file reaches structures by a different path from
    // structures.test.jsx -- its own trees selection becomes a buffer that
    // gates solar candidates. The run that produced 3 and the run that
    // produces 2 are both correct; a literal here was asserting one path's
    // arithmetic in a file that is about whether controls can be pressed.
    //
    // WHAT MATTERS TO THIS FILE is that there ARE candidates, that every one
    // of them carries a box (which is what the presses below iterate), and
    // that the map drew exactly as many pins as the strip drew tabs. Those
    // are the claims a hit-testing file makes, and none of them needs a
    // particular number.
    const siteCount = Number(
      await evaluate(() => window.__probe.state.steps.structures.proposals.structure_sites.features.length)
    )
    expect(siteCount, 'the fixture must yield structure sites, or every press below is vacuous').toBeGreaterThan(0)
    expect((await shownBoxes()).length, 'every generated site carries a box').toBe(siteCount)
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()
    // eslint-disable-next-line no-console
    console.log(`POINTER STRUCTURES  ${siteCount} generated site(s) on this path`)

    // [1] ONE PIN PER SITE, EACH THE SILHOUETTE TWICE AND NOTHING INSIDE.
    // [2] OCHRE, and the same size on screen at two zooms. [4] The committed
    // access point beside them is ink at committed muting. [5] The two kinds
    // on this map paint in two colours -- the pair the rule exists for.
    const pins = await evaluate(() =>
      [...document.querySelectorAll('.leaflet-container .site-pin')].map((el) => ({
        paths: [...el.querySelectorAll('svg *')].map((n) => n.tagName.toLowerCase()),
        d: new Set([...el.querySelectorAll('path')].map((p) => p.getAttribute('d'))).size,
        box: el.getBoundingClientRect().width + 'x' + el.getBoundingClientRect().height,
      }))
    )
    expect(pins).toHaveLength(siteCount)
    for (const pin of pins) {
      expect(pin.paths).toEqual(['path', 'path'])
      expect(pin.d).toBe(1)
    }
    const sizeAtZoom = async (zoom) => {
      await evaluate((z) => window.__probe.map.setZoom(z, { animate: false }), zoom)
      await page.waitForTimeout(150)
      // An array of the distinct sizes: a Set does not cross the page boundary.
      return evaluate(() => [
        ...new Set(
          [...document.querySelectorAll('.leaflet-container .site-pin')].map(
            (el) => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`
          )
        ),
      ])
    }
    const zoomIn = await sizeAtZoom(19)
    const zoomOut = await sizeAtZoom(16)
    expect(zoomIn).toEqual(zoomOut)
    expect(zoomIn).toHaveLength(1)
    expect(zoomIn[0]).toBe('28x28')
    await evaluate(() => window.__probe.map.setZoom(19, { animate: false }))
    await page.waitForTimeout(150)

    const atStructures = await assertPointMarkersDistinct('structures')
    const livePin = atStructures.find((m) => m.kind === 'site pin (live)')
    expect(livePin.count).toBe(siteCount)
    expect(livePin.colour).toBe(await tokenColour('--ochre'))
    expect(livePin.opacity).toBe(1)
    const committedAccess = atStructures.find((m) => m.kind === 'access point (committed)')
    expect(committedAccess.colour).toBe(await tokenColour('--ink'))
    expect(committedAccess.opacity).toBeCloseTo(await tokenNumber('--pattern-committed'), 5)
    expect(committedAccess.colour).not.toBe(livePin.colour)
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`every candidate's box, un-checked and checked by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('structures', tabId, where)
      }
      await resize(ROOMY)
    })
  }

  liveIt('places a site with the mouse: the button arms, the map takes the press, the site scores and gets a tab', async () => {
    expect(await topAt('place-structures'), '"Place a site" is topmost at its own centre').toMatchObject({ hits: true })
    await press('place-structures')
    expect(await evaluate(() => window.__probe.cursor.armed)).toBe('draw')
    // BRING THE SPOT TO THE MIDDLE OF THE STAGE FIRST, as a user would: the
    // harness opens on the parcel's north-west corner and this spot lies
    // south of it, under the bottom row of chrome at a roomy stage. A press
    // there hits the strip, not the map -- correctly -- so the map is panned
    // before the coordinate is resolved to a pixel.
    const point = await evaluate((coords) => {
      window.__probe.map.panTo(coords, { animate: false })
      const p = window.__probe.map.latLngToContainerPoint(coords)
      const box = window.__probe.map.getContainer().getBoundingClientRect()
      return { x: box.x + p.x, y: box.y + p.y }
    }, CLEAN)
    await page.waitForTimeout(200)
    // THE SPOT IS REACHABLE: what the browser finds at that pixel is the map
    // itself, not a card floating over it -- a placement the chrome covers
    // is a click that places nothing, and looks exactly like a dead tool.
    const under = await evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return {
        onMap: Boolean(el?.closest?.('.leaflet-container')),
        inChrome: Boolean(el?.closest?.('.chrome')),
        tag: el?.tagName?.toLowerCase() ?? 'nothing',
        className: typeof el?.className === 'string' ? el.className : el?.className?.baseVal ?? '',
      }
    }, point)
    expect(under, `the spot at ${JSON.stringify(point)} is on the map and under no chrome`).toMatchObject({
      onMap: true,
      inChrome: false,
    })
    await page.mouse.move(point.x, point.y)
    await page.mouse.click(point.x, point.y)
    await page.waitForFunction(
      () =>
        window.__probe.selectDraft(window.__probe.state, 'structures').drawnFeatures.length === 1 ||
        window.__probe.state.steps.structures?.error != null ||
        document.querySelector('[data-testid="structures-notice"]') != null,
      null,
      { timeout: 60_000 }
    )
    const outcome = await evaluate(() => ({
      placed: window.__probe.selectDraft(window.__probe.state, 'structures').drawnFeatures.length,
      error: window.__probe.state.steps.structures?.error ?? null,
      notice: document.querySelector('[data-testid="structures-notice"]')?.textContent ?? null,
    }))
    // THE PRESS PLACED A SITE. A notice may stand beside it -- the spot is
    // near a committed tree zone's clearance, and a site that breaks a rule
    // is placed AND told so -- but never a refusal, and never a step error.
    expect(outcome, `the press placed a site: ${JSON.stringify(outcome)}`).toMatchObject({ placed: 1, error: null })
    if (outcome.notice != null) expect(outcome.notice).toMatch(/^Placed, and scored/)
    const [placed] = await placedIds()
    expect(placed).toMatch(/^structure-site-placed-/)
    expect(await evaluate(() => window.__probe.cursor.armed), 'the tool went down').toBeNull()
    // THE STRIP MAY COLLAPSE: four tabs fit a row; the placed one is last.
    if (await page.$('[data-testid="tabs-more-structures"]')) await press('tabs-more-structures')
    expect(await shownTabs()).toContain(placed)
    expect(await checkedOf(placed)).toBe('true')
    // [5] WITH A PLACED PIN ON THE MAP TOO: it is the live pin's colour --
    // one kind, marked as the user's by its stroke, not by a colour of its
    // own -- and still nothing shares a colour with anything else.
    const withPlaced = await assertPointMarkersDistinct('structures+placed')
    expect(withPlaced.find((m) => m.kind === 'site pin (placed)')?.colour).toBe(await tokenColour('--ochre'))
  })

  liveIt('the × on a placed site is hit-testable checked or not, focused or not, at both widths', async () => {
    const [placed] = await placedIds()
    if (await page.$('[data-testid="tabs-more-structures"]')) await press('tabs-more-structures')
    expect(await shownTabs()).toContain(placed)
    // NO × ON A GENERATED CANDIDATE, at either width.
    for (const tabId of (await shownTabs()).filter((id) => id !== placed)) {
      expect(await page.$(`[data-testid="tab-remove-${tabId}"]`), `${tabId} carries no ×`).toBeNull()
    }

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const focused of [false, true]) {
        if (focused) await press(`tab-focus-${placed}`)
        for (const checked of [true, false]) {
          await setPlacedBox(placed, checked)
          expect(await checkedOf(placed)).toBe(String(checked))
          expect(
            await topAt(`tab-remove-${placed}`),
            `the × is topmost at its own centre on ${where}, checked ${checked}, focused ${focused}`
          ).toMatchObject({ hits: true })
          expect(
            await topAt(`tab-check-${placed}`),
            `the placed tab's box is topmost at its own centre on ${where}, checked ${checked}, focused ${focused}`
          ).toMatchObject({ hits: true })
        }
        await setPlacedBox(placed, true)
        if (focused) await press(`tab-focus-${placed}`)
      }
    }
    await resize(ROOMY)
  })

  liveIt('destroys the placed site when the mouse presses its ×, and the slot is free again', async () => {
    const [placed] = await placedIds()
    expect(await shownTabs()).toContain(placed)
    await press(`tab-remove-${placed}`)
    expect(await shownTabs()).not.toContain(placed)
    expect(await placedIds()).toEqual([])
    expect(await topAt('place-structures')).toMatchObject({ hits: true })
    expect(await evaluate(() => document.querySelector('[data-testid="place-structures"]').disabled)).toBe(false)
  })
})

/* ===========================================================================
   4c. THE FENCING CHECKBOX -- A TAB THAT IS A FENCE TYPE
   ===========================================================================
   The sixth step's tab is a GROUP: one box toggles every loop of a fence
   type. The strip is the same strip, so the claim is the same claim -- the
   box is topmost at its own centre in both states, at both widths -- asked
   of a tab whose id is not a feature id and whose box moves several. The
   fencing step is reached from wherever the page is: structures, generated
   with three candidates and no placed site, is committed whole.
   =========================================================================== */

describeIf('the fencing checkbox', () => {
  async function reachFencing() {
    if ((await cursorStep()) === 'fencing') return
    if ((await cursorStep()) !== 'structures') {
      await reachTrees()
      if ((await statusOf('trees')) !== 'generated') await generate('trees')
      await commit('trees')
    }
    if ((await statusOf('structures')) !== 'generated') await generate('structures')
    await commit('structures')
    expect(await cursorStep()).toBe('fencing')
  }

  liveIt('reaches the fencing step and generates, with no tool at all', async () => {
    await reachFencing()
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()
    expect(await evaluate(() => window.__probe.cursor.tools)).toEqual(['select'])
    await generate('fencing')
    expect(await statusOf('fencing')).toBe('generated')
    const tabs = await shownTabs()
    expect(tabs.length, 'one tab per candidate fence type').toBeGreaterThanOrEqual(1)
    expect(tabs.length).toBeLessThanOrEqual(3)
    // EVERY TAB IS A TYPE, NOT A FEATURE: its id is a fence type, its box
    // carries every feature of that type.
    const types = await evaluate(() =>
      window.__probe.state.steps.fencing.proposals.candidate_fence_types
    )
    expect(tabs).toEqual(types)
    expect((await shownBoxes()).length).toBe(tabs.length)
    // [5] THE MARKERS THAT SHARE THIS MAP: the committed access point and
    // the committed site pins, each in its settled colour, nothing live.
    const markers = await assertPointMarkersDistinct('fencing')
    expect(markers.find((m) => m.kind.startsWith('access point')).kind).toBe('access point (committed)')
    expect(markers.some((m) => m.kind.includes('(live)'))).toBe(false)
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`every type's box, un-checked and checked by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownBoxes()) {
        await pressableBothWays('fencing', tabId, where)
        // AND THE BOX MOVED THE WHOLE TYPE: the selection holds every one of
        // its feature ids once it is back on.
        const ids = await evaluate(
          (type) =>
            window.__probe.state.steps.fencing.proposals.fence_types.find((b) => b.fence_type === type).feature_ids,
          tabId
        )
        const selected = await evaluate(() => window.__probe.selectDraft(window.__probe.state, 'fencing').selectedFeatureIds)
        for (const id of ids) expect(selected).toContain(id)
      }
      await resize(ROOMY)
    })
  }

  liveIt('leaves the whole type out of the commit body when its box is off, and puts it all back', async () => {
    const [tabId] = await shownBoxes()
    const ids = await evaluate(
      (type) => window.__probe.state.steps.fencing.proposals.fence_types.find((b) => b.fence_type === type).feature_ids,
      tabId
    )
    expect(ids.length).toBeGreaterThan(0)
    const before = JSON.parse(await commitBody('fencing'))
    for (const id of ids) expect(before.features.features.map((f) => f.id)).toContain(id)
    await press(`tab-check-${tabId}`)
    const off = JSON.parse(await commitBody('fencing'))
    for (const id of ids) expect(off.features.features.map((f) => f.id)).not.toContain(id)
    await press(`tab-check-${tabId}`)
    const back = JSON.parse(await commitBody('fencing'))
    expect(back.features.features.map((f) => f.id).sort()).toEqual(before.features.features.map((f) => f.id).sort())
  })
})

/* ===========================================================================
   4d. THE REPORT BUTTON, WHICH IS NOT A STEP AND NOT A ROW
   ===========================================================================
   THE SAME DEFECT CLASS, ASKED OF THE ONE CONTROL THAT IS ABOUT THE WHOLE
   SESSION. report.test.jsx drives it through the store in jsdom, which
   computes no layout: it can say the button renders and that pressing it
   submits, and it cannot say the browser would give the press to the button.

   THIS CONTROL IS THE ONE MOST EXPOSED TO THAT. It sits BELOW the rail's
   seven rows, in a region that grows and shrinks with the rail's own length,
   at the left edge where the map's chrome overlays each other -- and it is
   rendered only in one state of the whole application, so it is the control
   least likely to be noticed if it were unreachable.

   IT ALSO ASSERTS THE OTHER HALF: that it is NOT a row. The help control in
   the corner was a row of this rail once and read as an eighth step, and the
   thing that stops this one being read that way is that it is outside the
   <ol> -- which is a claim about the DOM, checked here in the browser that
   actually builds it.

   THE LAST COMMIT THE PIPELINE NEEDS HAPPENS HERE: 4c leaves fencing
   generated with every box back on, so committing it makes every step of
   STEP_ORDER committed -- the one state in which this control exists.
   PRESSED BUT NOT AWAITED TO A PDF: the report needs a live narrative
   service, which the test backend has no key for, so what is asserted of the
   press is that it reached the handler and the screen changed. The PDF
   itself is the backend suite's assertion, over its bytes.
   =========================================================================== */

describeIf('the report button', () => {
  const reportOffered = () =>
    evaluate(() => Boolean(document.querySelector('[data-testid="report-action"]')))

  const railRows = () =>
    evaluate(() =>
      [...document.querySelectorAll('[data-testid="wizard-order"] > li')].map(
        (li) => li.dataset.stepId
      )
    )

  liveIt('is absent until the last step commits, and present the moment it does', async () => {
    // FENCING IS STILL OPEN HERE, which is exactly the state a report must
    // not be offered in: five of six committed is a design with a hole in it.
    expect(await statusOf('fencing')).toBe('generated')
    expect(await reportOffered(), 'no report while a step is outstanding').toBe(false)

    await commit('fencing')
    for (const stepId of ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']) {
      expect(await statusOf(stepId), `${stepId} is committed`).toBe('committed')
    }
    expect(await reportOffered(), 'a finished design offers the report').toBe(true)
  })

  liveIt('is topmost at its own centre, at both widths', async () => {
    // THE CLAIM THIS FILE EXISTS FOR, over the one control in the app that
    // only ever appears on a finished design. The squeezed stage is where it
    // matters: the rail is fixed-width but the regions around it are not, and
    // a control below a list that grew is where something lands on top.
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      expect(
        await topAt('report-generate'),
        `the report button is topmost at its own centre on ${where}`
      ).toMatchObject({ hits: true })
      expect(
        await evaluate(() => document.querySelector('[data-testid="report-generate"]').disabled),
        `and is not disabled on ${where}`
      ).toBe(false)
    }
    await resize(ROOMY)
  })

  liveIt('is not a row of the rail, and the rail is still seven rows', async () => {
    expect(await railRows()).toEqual([
      'boundary', 'landform', 'water', 'roads', 'trees', 'structures', 'fencing',
    ])
    // OUTSIDE THE LIST, checked in the browser that built the DOM. This is
    // the structural half of "it must not read as an eighth step"; the
    // treatment is the other half and is the stylesheet's.
    expect(
      await evaluate(() => {
        const action = document.querySelector('[data-testid="report-action"]')
        return {
          inList: Boolean(action.closest('[data-testid="wizard-order"]')),
          inRail: Boolean(action.closest('[data-testid="step-rail"]')),
          inBanner: Boolean(action.closest('.chrome-banner')),
        }
      })
    ).toEqual({ inList: false, inRail: true, inBanner: false })
  })

  liveIt('takes a real press and starts the wait', async () => {
    // HIT-TESTABLE IS NOT THE SAME CLAIM AS WIRED -- this file's own
    // argument, applied to its own new control.
    await press('report-generate')
    await page.waitForFunction(
      () => window.__probe.state.report.status !== 'idle',
      null,
      { timeout: 60_000 }
    )
    // THE PRESS CHANGED THE SCREEN. What the request then does depends on a
    // narrative service this backend has no key for, so `working` OR a
    // recorded failure is the honest assertion -- what must NOT happen is
    // nothing at all.
    const report = await evaluate(() => window.__probe.state.report)
    expect(['working', 'ready', 'failed']).toContain(report.status)
    expect(
      await evaluate(() => Boolean(document.querySelector('[data-testid="report-action"]'))),
      'and the control is still on screen whatever happened'
    ).toBe(true)
  })
})

/* ===========================================================================
   5. THE REOPEN CONFIRMATION, WHICH HAS NEVER BEEN HIT-TESTED
   ===========================================================================
   THE SAME DEFECT CLASS AS THE STRIP'S, ASKED OF A CARD THAT WAS NEVER ASKED. The
   defect was a control that looked pressable and was not, and every test in
   the repo passed because every one of them reached the handler. This
   dialogue's two buttons have never had a coordinate resolved to them by
   anything: jsdom clicks them by test id, and the browser tests that read
   their faces and their fills use Playwright's own click, which performs an
   actionability check first and would report Playwright's opinion rather than
   the browser's behaviour.

   So this presses them with the mouse, at their own centres, and asks what
   the browser says is there.

   IT ARRIVES THE WAY THE REPORT DID: a real press on the RAIL, back onto a
   committed step from a later one. That is the gesture the whole complaint
   starts with, and it is also the claim that the dialogue does not open by
   itself -- landform is committed and the card offers the affordance, and
   nothing is asking anything until the affordance is pressed.
   =========================================================================== */

/* ===========================================================================
   A COMMITTED STEP, LOOKED AT
   ===========================================================================

   REVIEW REMOVES CONTROLS, AND A REMOVAL IS EXACTLY THE CLAIM THIS PAGE
   EXISTS TO CHECK. The commit set is fixed until a reopen, so a checkbox here
   would be either inert-but-pressable -- the defect this whole file was built
   for, wearing a different label -- or a control that appears to change a
   decision that is made. So there is none, and no × either.

   "ABSENT" IS ASSERTED IN THE BROWSER THAT HIT-TESTS rather than in jsdom,
   because the two failures look identical from a query: a control that is
   absent and a control that is present and unreachable both fail
   `document.querySelector` on nothing and both fail a click. What is asserted
   is both halves -- the DOM holds no box and no ×, and the one thing that IS
   there, the tab body, is topmost at its own centre and does something when
   pressed.
   =========================================================================== */

describeIf('a committed step in review', () => {
  liveIt('offers a tab body that works and no control that does not', async () => {
    // BACK TO THE COMMITTED STEP, ON THE RAIL, WITH THE MOUSE.
    await press('rail-landform')
    expect(await evaluate(() => window.__probe.cursor.cursorStepId)).toBe('landform')
    expect(await statusOf('landform')).toBe('committed')

    // THE STRIP IS THERE, so the absences below are absences within something
    // rather than the absence of the strip.
    const tabs = await shownTabs()
    expect(tabs.length, 'a committed step lists what it committed').toBeGreaterThan(0)

    // NO BOX AND NO ×, AT BOTH WIDTHS. The squeezed stage is where the
    // reported defect lived, so it is where the removal is checked hardest.
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      expect(await shownBoxes(), `no checkbox in review on ${where}`).toEqual([])
      expect(
        await evaluate(() => document.querySelectorAll('.chrome-tabs .chrome-tab__remove').length),
        `no × in review on ${where}`
      ).toBe(0)

      // AND NOTHING ELSE PRESSABLE THAT IS NOT A TAB BODY. The strip's whole
      // interactive surface, enumerated by class rather than counted: every
      // control in it is a tab body or the "+N more" that expands the row.
      const controls = await evaluate(() =>
        [...document.querySelectorAll('.chrome-tabs button, .chrome-tabs input')].map((el) =>
          el.classList.contains('chrome-tab__body')
            ? 'body'
            : el.classList.contains('chrome-tab__more')
              ? 'more'
              : `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`
        )
      )
      expect(
        [...new Set(controls)].filter((kind) => kind !== 'body' && kind !== 'more'),
        `nothing in the strip but tab bodies and the overflow control on ${where}`
      ).toEqual([])
    }
    await resize(ROOMY)

    // THE TAB BODY IS TOPMOST AT ITS OWN CENTRE, which is the hover
    // affordance stated as a claim -- and it is the control that is supposed
    // to be there, so this is the half that must NOT be an absence.
    const [first] = tabs
    expect(await topAt(`tab-focus-${first}`), 'the tab body is reachable in review')
      .toMatchObject({ hits: true })

    // AND IT DOES SOMETHING: a real press focuses the feature and opens the
    // panel, exactly as it does on a live step.
    await press(`tab-focus-${first}`)
    expect(await evaluate(() => window.__probe.cursor.focusedFeatureId)).not.toBeNull()
    expect(await page.$('[data-testid="detail-landform"]')).not.toBeNull()

    // NOTHING WAS COMMITTED AND NOTHING WAS ARMED BY LOOKING.
    expect(await statusOf('landform')).toBe('committed')
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()

    // A BARE-MAP PRESS LETS GO, and the panel goes with the focus.
    const map = await page.locator('.leaflet-container').boundingBox()
    await page.mouse.click(map.x + 12, map.y + map.height - 12)
    await page.waitForTimeout(150)
    expect(await evaluate(() => window.__probe.cursor.focusedFeatureId)).toBeNull()
    expect(await page.$('[data-testid="detail-landform"]')).toBeNull()
  })
})

describeIf('the reopen confirmation', () => {
  liveIt('opens only when the affordance is pressed, and both answers take a real click', async () => {
    // BACK TO A COMMITTED STEP, ON THE RAIL, WITH THE MOUSE.
    await press('rail-landform')
    expect(await evaluate(() => window.__probe.cursor.cursorStepId)).toBe('landform')
    expect(await statusOf('landform')).toBe('committed')

    // ARRIVING IS NOT ASKING. A confirmation nobody requested is its own
    // defect; what a committed step offers is the way back in.
    expect(await page.$('[data-testid="reopen-confirm-landform"]')).toBeNull()
    expect(await topAt('edit-landform'), 'the affordance is topmost at its own centre')
      .toMatchObject({ hits: true })

    await press('edit-landform')
    expect(await page.$('[data-testid="reopen-confirm-landform"]')).not.toBeNull()

    // AND THE AFFORDANCE IS GONE WHILE THE DIALOGUE IS UP. This is the
    // reported bug in its own terms: it used to render above the open
    // dialogue, where a press reached requestReopen() and set a flag that was
    // already set -- a live control with nothing left to do, which looks
    // exactly like a dead one.
    expect(await page.$('[data-testid="edit-landform"]')).toBeNull()
    expect(await page.$('[data-testid="actions-landform"]')).toBeNull()

    // BOTH ANSWERS, AT BOTH WIDTHS. The card is in the corner the tab strip
    // shares, and the strip grows leftward and upward into that row -- so a
    // squeezed stage is where a control in this card would be covered.
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const testid of ['reopen-confirm-yes-landform', 'reopen-confirm-no-landform']) {
        expect(await topAt(testid), `${testid} is topmost at its own centre on ${where}`)
          .toMatchObject({ hits: true })
      }
    }
    await resize(ROOMY)

    // THE SAFE ANSWER TAKES A REAL PRESS: the dialogue closes, the step is
    // still committed, and the way back in is where it was.
    await press('reopen-confirm-no-landform')
    expect(await page.$('[data-testid="reopen-confirm-landform"]')).toBeNull()
    expect(await statusOf('landform')).toBe('committed')
    expect(await topAt('edit-landform')).toMatchObject({ hits: true })

    // AND SO DOES THE DESTRUCTIVE ONE -- hit-testable is not the same claim as
    // wired, and this is the last section on this page precisely so the
    // cascade it sets off can be asserted rather than avoided.
    await press('edit-landform')
    await press('reopen-confirm-yes-landform')
    await waitForStore(
      () => window.__probe.selectStepStatus(window.__probe.state, 'landform') === 'generated',
      60_000
    )
    expect(await statusOf('water'), 'the cascade reached the step below').toBe('not_started')
  })
})

/* ===========================================================================
   THE TWO-BUTTON CASE, WHICH IS THE ONE THE CARD WAS KEEPING
   ===========================================================================
   THE OBJECTION TO REMOVING THE ACTION REGION'S CARD, IN ITS OWN STATE.

   Five of the six steps offer an escape beside a commit, so two buttons is the
   commonest arrangement in the shell rather than an edge case, and the whole
   argument against a card-less region was about it: a secondary with no
   surface of its own sits directly on imagery. It has one -- it has carried
   --paper since it was written, and layout.test.jsx measures what it puts on
   canopy and on soil -- so what is left to ask here is the part a stylesheet
   cannot answer: with no card behind them, are BOTH still reachable, is the
   gap between them map, and is exactly one of them still the accent.

   LAST IN THE FILE, because it presses the zoom buttons: the map's level is
   the one piece of page state every section above reads coordinates through,
   and changing it anywhere earlier would be changing the ground under them.
   The reopen above leaves landform generated and the cursor on it, which is a
   two-button state without arranging one.
   =========================================================================== */

describeIf('the action region with two buttons, and the zoom', () => {
  liveIt('keeps both reachable with no card, one accent, and the gap between them map', async () => {
    // THE STATE, as the reopen above left it: a generated step being reviewed.
    expect(await statusOf('landform')).toBe('generated')

    // AND WAITED FOR RATHER THAN ASSUMED. A reopen refetches the step's
    // layers, so the chrome passes through `loading` on its way back to
    // `reviewing` -- and `loading` declares NO buttons, which is a real state
    // and not the one this section is about. The row's own appearance is the
    // signal that the machine has arrived.
    await page.waitForSelector('[data-testid="actions-landform"]', { timeout: SLOW })

    // AND THE POINTER IS PARKED SOMEWHERE ELSE FIRST. Every gesture in this
    // file leaves the mouse where it last pressed, and a button under the
    // pointer is a button in its HOVER fill -- measured here as --stock,
    // #f4f1ea, on the first run of this case, which is the hover working
    // rather than the resting fill being wrong. The claim below is about the
    // resting one.
    await page.mouse.move(4, 4)

    const tones = await evaluate(() =>
      [...document.querySelectorAll('.chrome-banner__button')].map((el) => ({
        testid: el.dataset.testid,
        tone: el.dataset.tone,
        background: getComputedStyle(el).backgroundColor,
        shadow: getComputedStyle(el).boxShadow,
      }))
    )
    expect(tones).toHaveLength(2)

    // ONE OXIDE PER STATE, read off the pixels rather than off the tone
    // attribute: #9c4a2f is --oxide, and exactly one button carries it.
    const oxide = tones.filter((b) => b.background === 'rgb(156, 74, 47)')
    expect(oxide).toHaveLength(1)
    expect(oxide[0].tone).toBe('primary')

    // AND THE OTHER IS A SURFACE RATHER THAN AN OUTLINE. --paper, #fdfcf9,
    // opaque -- which is the fact the card's removal turns on.
    const secondary = tones.find((b) => b.tone === 'secondary')
    expect(secondary.background).toBe('rgb(253, 252, 249)')
    expect(secondary.background).not.toContain('rgba')

    // BOTH CARRY THE CASING, which is what the card was supplying.
    for (const button of tones) {
      expect(button.shadow, `${button.testid} is cased`).toContain('rgb(253, 252, 249)')
    }

    // BOTH TOPMOST AT THEIR OWN CENTRES, AT BOTH WIDTHS. The squeezed stage is
    // the one that matters: the strip grows leftward-bounded and upward into
    // this row, and a region with no surface gives no visual warning when
    // something lands on top of it.
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const button of tones) {
        expect(
          await topAt(button.testid),
          `${button.testid} is topmost at its own centre on ${where}`
        ).toMatchObject({ hits: true })
      }

      // THE GAP BETWEEN THEM IS MAP. This is the defect the card's removal
      // would have introduced if the region had kept its pointer events: the
      // region's box spans both buttons AND the --space-3 between them, and a
      // transparent box that takes clicks is worse than a visible one that
      // does, because nothing on screen says why the map stopped responding.
      const gap = await evaluate(() => {
        const boxes = [...document.querySelectorAll('.chrome-banner__button')].map((el) =>
          el.getBoundingClientRect()
        )
        boxes.sort((a, b) => a.x - b.x)
        const x = (boxes[0].x + boxes[0].width + boxes[1].x) / 2
        const y = boxes[0].y + boxes[0].height / 2
        const top = document.elementFromPoint(x, y)
        return { reachesMap: Boolean(top?.closest('.leaflet-container')), tag: top?.tagName }
      })
      expect(gap.reachesMap, `the gap between the two buttons is map on ${where}`).toBe(true)
    }
    await resize(ROOMY)

    // AND THE ESCAPE TAKES A REAL PRESS. Hit-testable is not the same claim as
    // wired, which is the argument this whole file is built on.
    await press('draw-landform')
    expect(await evaluate(() => window.__probe.cursor.armed)).not.toBeNull()
    await press('cancel-landform')
    expect(await evaluate(() => window.__probe.cursor.armed)).toBeNull()
  })

  liveIt('zooms the map with a real press, in both directions, at both widths', async () => {
    // THE ONLY ZOOM AFFORDANCE IN THE APP. Scroll-wheel zoom is off
    // permanently and the trackpad pinch goes through the same handler, so a
    // + that cannot be pressed is a map that cannot be zoomed -- and nothing
    // in this suite had ever pressed one.
    for (const [where, viewport] of STAGES) {
      await resize(viewport)

      const before = await evaluate(() => window.__probe.map.getZoom())

      await pressSelector(ZOOM_IN)
      const zoomedIn = await evaluate(() => window.__probe.map.getZoom())
      // THE HALF STEP, WHICH IS zoomDelta AND zoomSnap TOGETHER. A fractional
      // delta with the default snap of 1 rounds straight back to a whole
      // level, so this reading is the one that says both are still set.
      expect(zoomedIn - before, `+ moves half a level on ${where}`).toBeCloseTo(0.5, 5)

      await pressSelector(ZOOM_OUT)
      expect(
        await evaluate(() => window.__probe.map.getZoom()),
        `- brings it back on ${where}`
      ).toBeCloseTo(before, 5)

      // AND BOTH ARE STILL TOPMOST AFTERWARDS. A control that works once and
      // is then covered by what it did is the shape of the original bug.
      for (const selector of [ZOOM_IN, ZOOM_OUT]) {
        expect(
          await topAtSelector(selector),
          `${selector} is still topmost after a press on ${where}`
        ).toMatchObject({ hits: true })
      }
    }
    await resize(ROOMY)
  })
})
