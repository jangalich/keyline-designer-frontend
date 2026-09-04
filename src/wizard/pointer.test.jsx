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
 * test in this repo, because every eye test in this repo REACHES THE HANDLER:
 *
 *   - water.test.jsx drives the store's reducer through the strip's own
 *     arithmetic (selectionAfterEye + setSelection);
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
 * halves of what the user saw: the SELECTION changed, and the eye was the
 * element at its own centre. The second is the hover affordance itself, stated
 * as a claim a suite can hold.
 *
 * IT RUNS AT TWO STAGE WIDTHS, AND THE NARROW ONE IS THE TEST. The defect was
 * never visible at a roomy width: the tabs had room, nothing overflowed, and
 * the eye was on top in both states. It appears the moment the strip is
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
 * control or something inside it -- the eye's own <svg> and its <path> both
 * count, because a press on either is a press on the button.
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

/** The strip's own reading of one tab's eye: 'on', 'off', or undefined. */
const eyeOf = (tabId) =>
  evaluate((id) => document.querySelector(`[data-testid="tab-${id}"]`)?.dataset.eye, tabId)

/** Every tab the strip is rendering right now, in render order. */
const shownTabs = () =>
  evaluate(() => [...document.querySelectorAll('[data-tab-id]')].map((li) => li.dataset.tabId))

/** Every tab that is rendering an eye right now. */
const shownEyes = () =>
  evaluate(() =>
    [...document.querySelectorAll('[data-tab-id]')]
      .filter((li) => li.querySelector('.chrome-tab__eye'))
      .map((li) => li.dataset.tabId)
  )

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
 * the layer stack's business and not this file's -- what the eye promises is
 * that closing it takes the shape OFF the map and opening it puts the shape
 * BACK, and a count either side of the pair says exactly that. water.test.jsx
 * counts the same way, per pane.
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
  await page.waitForFunction(
    (id) =>
      window.__probe.selectStepStatus(window.__probe.state, id) === 'generated' &&
      window.__probe.state.drafts[id] !== undefined,
    stepId,
    { timeout: SLOW }
  )
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
 * The eye is topmost at its own centre while it is OPEN. A real press closes
 * it. It is STILL topmost at its own centre -- this is the assertion nothing
 * in the repo made, and the one the user could see and the suite could not.
 * A second real press opens it again.
 */
async function pressableBothWays(stepId, tabId, where) {
  const at = `${stepId}/${tabId} on ${where}`

  expect(await eyeOf(tabId), `${at}: starts open`).toBe('on')
  expect(await topAt(`tab-eye-${tabId}`), `${at}: the OPEN eye is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-eye-${tabId}`)
  expect(await eyeOf(tabId), `${at}: a real click closed it`).toBe('off')

  expect(await topAt(`tab-eye-${tabId}`), `${at}: the CLOSED eye is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-eye-${tabId}`)
  expect(await eyeOf(tabId), `${at}: a real click on the CLOSED eye opened it again`).toBe('on')
}

/**
 * THE SAME CLAIM FOR AN EYE THAT MAY ALREADY BE CLOSED.
 *
 * A radio step's strip has at most one open eye, so "start from open" is not
 * a thing every tab can do. This drives whatever state the tab is in down to
 * CLOSED and back up, asserting the reading at each stop -- which is the
 * reported gesture exactly: an eye that is off, pressed, and on again.
 */
async function openableFromOff(stepId, tabId, where) {
  const at = `${stepId}/${tabId} on ${where}`

  expect(await topAt(`tab-eye-${tabId}`), `${at}: the eye is topmost at its own centre`)
    .toMatchObject({ hits: true })

  if ((await eyeOf(tabId)) === 'on') {
    await press(`tab-eye-${tabId}`)
    expect(await eyeOf(tabId), `${at}: a real click closed it`).toBe('off')
  }

  expect(await topAt(`tab-eye-${tabId}`), `${at}: the CLOSED eye is topmost at its own centre`)
    .toMatchObject({ hits: true })

  await press(`tab-eye-${tabId}`)
  expect(await eyeOf(tabId), `${at}: a real click on the CLOSED eye opened it again`).toBe('on')
}

/* ===========================================================================
   1. THE MULTI-SELECT STEPS, DERIVED RATHER THAN LISTED
   =========================================================================== */

describeIf('the eye takes a real click in both directions', () => {
  liveIt('reaches the landform step', async () => {
    await startSession()
    await generate('landform')
    expect(await statusOf('landform')).toBe('generated')
    expect((await shownEyes()).length).toBeGreaterThan(0)
  })

  /**
   * THE LIST IS THE BUILD'S, NOT THIS FILE'S -- the both-directions assertion
   * in water.test.jsx derives its cases the same way, and for the same reason:
   * a step registered later with checkbox eyes joins these cases by existing
   * rather than by someone remembering. It is asserted rather than merely
   * iterated so that a new one FAILS here until its section below exists.
   */
  liveIt('covers every multi-select step this build registers', async () => {
    const registered = await evaluate(() =>
      window.__probe.STEP_DEFINITIONS.filter(
        (definition) => definition.selection?.mode === 'multiple' && definition.proposalCollection
      ).map((definition) => definition.id)
    )
    expect(registered).toEqual(['landform', 'water'])
  })

  for (const [where, viewport] of STAGES) {
    liveIt(`landform: every eye, closed and opened by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownEyes()) {
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
   it renders in four combinations: eye open or closed, focused or not. The
   defect this file was written for is "a control is styled interactive and is
   not hit-testable in one of its states", so every state it has is asked.
   =========================================================================== */

describeIf('the × on a drawn tab', () => {
  const DRAWN = 'drawn-pointer-probe'

  /** The drawn tab's eye, moved through the store: setup, never the gesture. */
  const setDrawnEye = async (on) => {
    await evaluate(
      ([id, wanted]) =>
        window.__probe.actions.setSelection('landform', (current) =>
          wanted ? [...new Set([...current, id])] : current.filter((each) => each !== id)
        ),
      [DRAWN, on]
    )
    await page.waitForTimeout(120)
  }

  liveIt('is hit-testable with the eye open or closed, focused or not, at both widths', async () => {
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
        for (const eye of ['on', 'off']) {
          // THE EYE IS MOVED THROUGH THE STORE HERE, and only here. It is a
          // STATE this control has to survive, not the gesture being asked
          // about -- and pressing it with the mouse would make this test fail
          // for the eye's reasons rather than the ×'s, which is exactly the
          // confusion a control-specific claim should not carry.
          await setDrawnEye(eye === 'on')
          expect(await eyeOf(DRAWN)).toBe(eye)
          expect(
            await topAt(`tab-remove-${DRAWN}`),
            `the × is topmost at its own centre on ${where}, eye ${eye}, focused ${focused}`
          ).toMatchObject({ hits: true })
        }
        await setDrawnEye(true)
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
    liveIt(`every eye on the collapsed strip, closed and opened by the mouse, on ${where}`, async () => {
      await resize(viewport)
      for (const tabId of await shownEyes()) {
        await pressableBothWays('water', tabId, `${where}, collapsed`)
      }
      await resize(ROOMY)
    })
  }

  liveIt('every eye on the expanded strip, on both stages', async () => {
    const more = await page.$('[data-testid="tabs-more-water"]')
    if (more) await press('tabs-more-water')
    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const tabId of await shownEyes()) {
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
    const [tabId] = await shownEyes()
    const untouched = await commitBody('water')
    const paths = await pathsOnMap()
    expect(paths).toBeGreaterThan(0)

    await press(`tab-eye-${tabId}`)
    expect(await eyeOf(tabId)).toBe('off')
    expect(await pathsOnMap(), 'the zone left the map').toBeLessThan(paths)
    expect(JSON.parse(await commitBody('water')).features.features.map((f) => f.id)).not.toContain(tabId)

    await press(`tab-eye-${tabId}`)
    expect(await eyeOf(tabId)).toBe('on')
    expect(await pathsOnMap(), 'the zone came back to the map').toBe(paths)
    expect(await commitBody('water'), 'and the commit body is the one it started as').toBe(untouched)
    await resize(ROOMY)
  })
})

/* ===========================================================================
   4. THE ROADS EYE, WHICH IS THE SAME EYE IN A DIFFERENT MODE
   ===========================================================================
   Roads is radio: one network or none. Its off state is reachable by pressing
   its own eye (which empties the selection) and by turning another network on.
   An unpressable off-eye there would be exactly as invisible as water's, and
   the tab markup is shared -- so the claim is made here rather than assumed
   from the shared component.
   =========================================================================== */

describeIf('the roads eye', () => {
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

    const eyes = await shownEyes()
    expect(eyes.length, 'the access points routed networks, so their tabs carry eyes').toBe(3)

    for (const [where, viewport] of STAGES) {
      await resize(viewport)
      for (const tabId of eyes) await openableFromOff('roads', tabId, where)
      await resize(ROOMY)
    }
  })
})

/* ===========================================================================
   5. THE REOPEN CONFIRMATION, WHICH HAS NEVER BEEN HIT-TESTED
   ===========================================================================
   THE SAME DEFECT CLASS AS THE EYE, ASKED OF A CARD THAT WAS NEVER ASKED. The
   eye bug was a control that looked pressable and was not, and every test in
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
