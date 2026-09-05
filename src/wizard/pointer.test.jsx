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
   1. THE MULTI-SELECT STEPS, DERIVED RATHER THAN LISTED
   =========================================================================== */

describeIf('the checkbox takes a real click in both directions', () => {
  liveIt('reaches the landform step', async () => {
    await startSession()
    await generate('landform')
    expect(await statusOf('landform')).toBe('generated')
    expect((await shownBoxes()).length).toBeGreaterThan(0)
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
    // TREES JOINED BY EXISTING, and has its own section below.
    expect(registered).toEqual(['landform', 'water', 'trees'])
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
   3. WATER: THE STEP THE BUG WAS REPORTED ON
   =========================================================================== */

describeIf('water', () => {
  liveIt('reaches the water step', async () => {
    await commit('landform')
    expect(await evaluate(() => window.__probe.cursor.cursorStepId)).toBe('water')
    await generate('water')
    // THE STRIP COLLAPSES ON THIS PARCEL -- more zones than a row holds -- and
    // the reported gesture is on the row as it comes up, so the collapsed
    // strip is what the first assertions below press.
    expect(Number(await evaluate(() => document.querySelector('[data-testid="tabs-water"]').dataset.tabCount)))
      .toBeGreaterThan(4)
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

  liveIt('reaches the trees step and generates', async () => {
    await reachTrees()
    await generate('trees')
    expect(await statusOf('trees')).toBe('generated')
    expect((await shownBoxes()).length, 'the fixture yields tree zone candidates').toBeGreaterThan(0)
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
