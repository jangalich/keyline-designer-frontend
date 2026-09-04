/**
 * @vitest-environment node
 *
 * THE ENVIRONMENT IS `node`, NOT THE PROJECT'S jsdom, AND THAT IS THE POINT.
 * This file's whole reason for existing is that jsdom computes no layout; it
 * has no DOM of its own to want. It also cannot run in one: Vite's dev server
 * loads esbuild, which asserts that `new TextEncoder().encode('')` is a
 * `Uint8Array` -- true in node and false under jsdom, whose globals come from
 * a different realm. So the docblock is load-bearing, not tidiness.
 */
/**
 * layout.test.jsx
 *
 * THE CHROME'S GEOMETRY, MEASURED IN A REAL ENGINE.
 *
 * WHY THIS FILE IS DIFFERENT FROM EVERY OTHER TEST HERE. style.test.jsx says
 * plainly what it cannot do: jsdom applies no stylesheet, so it reads the
 * PARSED stylesheet instead and matches it against the class names components
 * emit. That catches a rule naming a class nothing renders, a face never
 * referenced, a colour literal below :root -- and it cannot catch a box that
 * is 1440px wide, because nothing in jsdom ever computes a width.
 *
 * The claims this branch makes are exactly the ones that only a computed width
 * can settle:
 *
 *   NO REGION SPANS THE FRAME.        A width, against the stage's width.
 *   THE INSTRUCTION CARD IS CENTRED.  Two margins, equal.
 *   IT IS CAPPED AT READING MEASURE.  A width, against 680px, with a notice
 *                                     long enough that an uncapped card would
 *                                     sail past it.
 *   THE STRIP STOPS BEFORE THE CARD.  Two x-coordinates, at every tab count.
 *   "+N MORE" GROWS UPWARD.           A top that moves and a card that does not.
 *
 * Asserting any of those on a class name would be asserting that the CSS was
 * written, which is what the author already knows and not what the reader is
 * asking. So this file drives the SHIPPED components and the SHIPPED
 * stylesheets in Chromium (layoutHarness.jsx) and reads getBoundingClientRect.
 *
 * IT RUNS UNDER VITEST LIKE EVERYTHING ELSE. One `npm test`, one suite, no
 * second runner to configure and keep in agreement with the first -- the
 * browser is a separate process and every assertion here is over numbers that
 * came back from it. Only the environment differs, and the docblock at the
 * top says why.
 *
 * THE BROWSER IS THE ONE THE ENVIRONMENT SHIPS. Chromium is pre-installed and
 * `executablePath` points straight at it, so nothing is downloaded at test
 * time. If it is ever absent, the suite SKIPS this file with a message rather
 * than failing: a missing browser is a fact about the machine, and a red suite
 * that means "your machine is different" trains people to ignore red suites.
 * It is not silent -- see the console line in beforeAll.
 */

import { existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** Where the environment keeps its Chromium. Not downloaded, not resolved. */
const CHROMIUM = '/opt/pw-browsers/chromium'

/** The stage these measurements are taken at. A desktop frame. */
const VIEWPORT = { width: 1280, height: 800 }

/** Every mark the harness swatches: the three zone treatments and the road line. */
const SWATCH_TREATMENTS = ['production', 'survey-embankment', 'survey-excavated', 'road']

/** App.css's --measure, in px. The prose cap the instruction card takes. */
const READING_MEASURE = 680

/** App.css's --space-3, in px: the inset every region keeps from the edge. */
const INSET = 12

/**
 * App.css's cap on the detail panel: `min(30rem, ...)` in px, at the root
 * font size these pages render at.
 *
 * THE OTHER TERM OF THAT min() IS THE ROW'S OWN HEIGHT, so this is the cap
 * only on a stage tall enough for it -- which the 800px default viewport is
 * and the 480px case deliberately is not. The one test that asserts this
 * number takes it at the default viewport; the short-frame cases assert the
 * containment the percentage term gives instead.
 */
const PANEL_CAP = 480

/**
 * `.map-stage` carries a hairline of its own, and getBoundingClientRect gives
 * the BORDER box -- so a region inset by --space-3 sits 13px from the stage's
 * measured left edge, not 12. Named rather than absorbed into a fudge factor,
 * because the difference between "12, give or take" and "12 plus a border we
 * can point at" is the difference between a tolerance and an explanation.
 */
const STAGE_BORDER = 1

/** Where a region's edge should be, measured from the stage's border box. */
const EDGE = INSET + STAGE_BORDER

const available = existsSync(CHROMIUM)

/**
 * Per-test budgets. A real browser page load through a dev server is tens of
 * times slower than a jsdom render, and vitest's 5s default is written for the
 * latter -- so these are stated rather than left to time out and read as a
 * layout failure. SLOW is one page; MANY_PAGES is the tab-count sweep, which
 * opens one per count on purpose (see there).
 */
const SLOW = 30_000
const MANY_PAGES = 180_000

let server = null
let browser = null

/** The harness URL for one case. */
function pageUrl(query = {}) {
  const search = new URLSearchParams(query).toString()
  const base = `${server.resolvedUrls.local[0].replace(/\/$/, '')}/src/wizard/layout-harness.html`
  return search ? `${base}?${search}` : base
}

/**
 * Open the harness, wait for it to say it has settled, and hand back a page
 * plus the two things every assertion here needs.
 *
 * `box(selector)` is the rendered rectangle, or null when the element is not
 * in the document -- which is a real answer: the tab strip renders nothing at
 * all when the step offers no tabs, and the detail panel is absent rather than
 * hidden when nothing is selected.
 */
async function openHarness(query = {}) {
  const page = await browser.newPage({ viewport: VIEWPORT })
  await page.goto(pageUrl(query), { waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.harnessReady === 'true')
  await page.waitForSelector('[data-testid="stage"] .chrome')

  const box = async (selector) => {
    const handle = await page.$(selector)
    return handle ? await handle.boundingBox() : null
  }

  return {
    page,
    box,
    stage: async () => await box('[data-testid="stage"]'),
    close: () => page.close(),
  }
}

/**
 * Every region that can be on screen at once, by the class the stylesheet
 * styles it under. Class names, because a region IS its class here -- the
 * assertions below are about the boxes these resolve to, never about the
 * strings.
 */
const REGIONS = {
  rail: '.chrome-rail',
  instruction: '.chrome-bar',
  tabs: '.chrome-tabs',
  action: '.chrome-banner',
  detail: '.chrome-detail',
}

beforeAll(async () => {
  if (!available) {
    // eslint-disable-next-line no-console
    console.warn(
      `layout.test.jsx SKIPPED: no Chromium at ${CHROMIUM}. These are the only ` +
        `assertions in the suite that measure rendered geometry; everything ` +
        `else about the chrome's treatment is covered in style.test.jsx.`
    )
    return
  }
  const { createServer } = await import('vite')
  const { chromium } = await import('playwright')

  // The project's OWN dev server, so the harness builds through the same
  // plugin pipeline and the same stylesheets the app does. A static fixture
  // page with hand-copied CSS would be a second copy of the thing under test.
  server = await createServer({ server: { port: 0 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({ executablePath: CHROMIUM })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const describeIf = available ? describe : describe.skip

/* ===========================================================================
   3. NO REGION SPANS THE FRAME
   =========================================================================== */

describeIf('3. every region is a card on the map', () => {
  it('renders no region as wide as the stage, at any content it can hold', async () => {
    // THE HARDEST CASE FOR THE CLAIM, not the easiest: a long notice stacked
    // with two more (the instruction card's widest content), eleven tabs (the
    // strip's), and both action buttons. If anything is going to reach the
    // edge, it is this.
    const ui = await openHarness({ tabs: 11, notice: 'stacked', buttons: 2 })
    const stage = await ui.stage()

    for (const [name, selector] of Object.entries(REGIONS)) {
      const box = await ui.box(selector)
      if (!box) continue // a region that is not on screen spans nothing

      // NOT THE FULL WIDTH, and by a real margin rather than by a pixel: the
      // inset is --space-3 on each side, so anything wider than the stage
      // less two of those is touching an edge somewhere.
      expect(box.width, `${name} must not span the stage`).toBeLessThan(stage.width)
      expect(box.width, `${name} must stay inside the stage's inset`).toBeLessThanOrEqual(
        stage.width - 2 * INSET + 1
      )

      // AND IT KEEPS ITS INSET ON BOTH SIDES. A card flush to an edge is the
      // same failure as a full-width band, one edge at a time.
      expect(box.x - stage.x, `${name} keeps its left inset`).toBeGreaterThanOrEqual(EDGE)
      expect(
        stage.x + stage.width - (box.x + box.width),
        `${name} keeps its right inset`
      ).toBeGreaterThanOrEqual(EDGE)
    }

    await ui.close()
  }, SLOW)

  it('leaves the middle of the map clear between the top and bottom rows', async () => {
    // The regions are cards ON the map, which is only true if there is map
    // left between them. Asserted as a real gap rather than as a grid area.
    const ui = await openHarness({ tabs: 3, notice: 'short' })
    const stage = await ui.stage()
    const instruction = await ui.box(REGIONS.instruction)
    const action = await ui.box(REGIONS.action)

    const gap = action.y - (instruction.y + instruction.height)
    expect(gap).toBeGreaterThan(stage.height / 2)

    await ui.close()
  }, SLOW)
})

/* ===========================================================================
   4. EACH TAB CARRIES ITS OWN SURFACE; THE STRIP CARRIES NONE
   =========================================================================== */

describeIf('4. the tab strip is a layout, not a surface', () => {
  it('gives every tab an opaque surface and the strip none', async () => {
    const ui = await openHarness({ tabs: 3 })

    // THE STRIP IS TRANSPARENT AND HAS NO EDGE. Read off the computed style
    // in the browser, so this is what the cascade actually resolved to and not
    // what the rule said -- which is the one thing style.test.jsx cannot check.
    const strip = await ui.page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.chrome-tabs'))
      return {
        background: s.backgroundColor,
        borderTop: s.borderTopWidth,
        borderBottom: s.borderBottomWidth,
        borderLeft: s.borderLeftWidth,
        borderRight: s.borderRightWidth,
      }
    })
    expect(strip.background).toBe('rgba(0, 0, 0, 0)')
    expect(strip.borderTop).toBe('0px')
    expect(strip.borderBottom).toBe('0px')
    expect(strip.borderLeft).toBe('0px')
    expect(strip.borderRight).toBe('0px')

    // EVERY TAB CARRIES ONE. Opaque -- alpha 1, so nothing of the imagery
    // behind it comes through -- and a hairline on all four sides.
    const tabs = await ui.page.evaluate(() =>
      [...document.querySelectorAll('.chrome-tab')].map((el) => {
        const s = getComputedStyle(el)
        return {
          background: s.backgroundColor,
          borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        }
      })
    )
    expect(tabs).toHaveLength(3)
    for (const tab of tabs) {
      expect(tab.background).not.toContain('rgba')
      expect(tab.background).not.toBe('rgba(0, 0, 0, 0)')
      for (const width of tab.borders) expect(width).not.toBe('0px')
    }

    await ui.close()
  }, SLOW)

  it('gives the "+N more" affordance the same surface as a tab', async () => {
    // It was transparent, which read correctly only while the strip behind it
    // had a surface to be transparent AGAINST. With the strip gone it would be
    // the one element in the shell floating on bare imagery.
    const ui = await openHarness({ tabs: 9 })

    const [tab, more] = await ui.page.evaluate(() => {
      const read = (el) => {
        const s = getComputedStyle(el)
        return { background: s.backgroundColor, borderStyle: s.borderTopStyle }
      }
      return [
        read(document.querySelector('.chrome-tab:not(.chrome-tab--more)')),
        read(document.querySelector('.chrome-tab--more')),
      ]
    })

    expect(more.background).toBe(tab.background)
    expect(more.background).not.toBe('rgba(0, 0, 0, 0)')
    // Dashed rather than solid: it is a control, not a feature.
    expect(more.borderStyle).toBe('dashed')
    expect(tab.borderStyle).toBe('solid')

    await ui.close()
  }, SLOW)
})

/* ===========================================================================
   5. THE INSTRUCTION CARD: CENTRED, AND CAPPED AT READING MEASURE
   =========================================================================== */

describeIf('5. the instruction card', () => {
  it('is centred horizontally, near the top', async () => {
    const ui = await openHarness({ notice: 'short' })
    const stage = await ui.stage()
    const card = await ui.box(REGIONS.instruction)

    const left = card.x - stage.x
    const right = stage.x + stage.width - (card.x + card.width)
    // Centred within a pixel. Not "roughly": a card that is centred by a
    // margin somebody typed drifts the moment the other side's content
    // changes, and this is what tells the two apart.
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)

    // NEAR THE TOP, at its inset -- not floating in the middle of the frame.
    expect(card.y - stage.y).toBeCloseTo(EDGE, 0)

    await ui.close()
  }, SLOW)

  it('is sized to its content when the content is short', async () => {
    // The cap is a ceiling, not a width. A three-word direction does not draw
    // a 680px box around itself.
    const ui = await openHarness({ notice: 'none' })
    const card = await ui.box(REGIONS.instruction)
    expect(card.width).toBeLessThan(READING_MEASURE)
    await ui.close()
  }, SLOW)

  it('caps at reading measure and WRAPS a long notice rather than widening', async () => {
    const short = await openHarness({ notice: 'short' })
    const shortCard = await short.box(REGIONS.instruction)
    await short.close()

    const long = await openHarness({ notice: 'long' })
    const longCard = await long.box(REGIONS.instruction)

    // THE CAP HOLDS. The 80% advisory here is ~400 characters; unwrapped it
    // would be several thousand pixels of line.
    expect(longCard.width).toBeLessThanOrEqual(READING_MEASURE)

    // AND IT WRAPPED RATHER THAN BEING TRUNCATED: the card is TALLER than the
    // short one, which is what says the text is all still there. A cap that
    // clipped would pass the width assertion above on its own.
    expect(longCard.height).toBeGreaterThan(shortCard.height)

    // THE NOTICE'S OWN TEXT IS LAID OUT OVER SEVERAL LINE BOXES.
    //
    // Through a Range over the element's CONTENTS rather than
    // element.getClientRects(). A block-level box has exactly one rect however
    // many lines it holds -- that reads as "did not wrap" for any notice and
    // would have passed here on a card with no cap at all. A Range returns one
    // rect per line box, which is the thing being asserted.
    const lines = await long.page.evaluate(() => {
      const el = document.querySelector('.chrome-bar__notice')
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getClientRects().length
    })
    expect(lines).toBeGreaterThan(1)

    await long.close()
  }, SLOW)

  it('holds the cap and stays centred with notices stacked', async () => {
    // The other case worth checking: several notices at once, which is height
    // rather than width, and must not break either property.
    const ui = await openHarness({ notice: 'stacked' })
    const stage = await ui.stage()
    const card = await ui.box(REGIONS.instruction)

    expect(card.width).toBeLessThanOrEqual(READING_MEASURE)
    const left = card.x - stage.x
    const right = stage.x + stage.width - (card.x + card.width)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)

    // Three notices are on screen, so the height being tested is real.
    expect(await ui.page.locator('.chrome-bar__notice').count()).toBe(3)

    await ui.close()
  }, SLOW)
})

/* ===========================================================================
   6. THE BOTTOM ROW: THE ACTION CARD HOLDS THE CORNER
   =========================================================================== */

describeIf('6. the bottom row', () => {
  it('puts the action card in the bottom-right corner, at its inset', async () => {
    const ui = await openHarness({ tabs: 3 })
    const stage = await ui.stage()
    const action = await ui.box(REGIONS.action)

    const right = stage.x + stage.width - (action.x + action.width)
    const bottom = stage.y + stage.height - (action.y + action.height)
    expect(right).toBeCloseTo(EDGE, 0)
    expect(bottom).toBeCloseTo(EDGE, 0)

    // It is in the RIGHT half, which is the part a reader would call "bottom
    // right" rather than "bottom".
    expect(action.x).toBeGreaterThan(stage.x + stage.width / 2)

    await ui.close()
  }, SLOW)

  it("ends the tab strip before the action card at every tab count", async () => {
    // EVERY COUNT, not a representative one: 1 through the collapsed cap, the
    // count that first overflows, and well past it. The failure this guards
    // against is a strip that fits at three tabs and runs under the card at
    // five, which no single-count test would find.
    for (const count of [1, 2, 3, 4, 5, 9, 11, 20]) {
      const ui = await openHarness({ tabs: count })
      const strip = await ui.box(REGIONS.tabs)
      const action = await ui.box(REGIONS.action)
      const rail = await ui.box(REGIONS.rail)

      expect(strip, `${count} tabs must render a strip`).not.toBeNull()

      // NEVER UNDERNEATH. The strip's right edge stops before the action
      // card's left edge, with the row's gap between them.
      expect(
        strip.x + strip.width,
        `${count} tabs: the strip must end before the action card`
      ).toBeLessThanOrEqual(action.x)

      // AND IT STARTS AFTER THE RAIL, which is the other end of the same
      // claim: the strip owns the space between them and neither edge of it.
      expect(strip.x, `${count} tabs: the strip must start after the rail`).toBeGreaterThanOrEqual(
        rail.x + rail.width
      )

      // Both keep their inset from the stage's own edges.
      const stage = await ui.stage()
      expect(strip.y + strip.height).toBeLessThanOrEqual(stage.y + stage.height - INSET)

      await ui.close()
    }
  }, MANY_PAGES)

  it('narrows to two columns on a small stage without giving one tab two', async () => {
    // THE MECHANISM THIS BRANCH INTRODUCED, and the one place it could be
    // wrong. The strip's column count is set INLINE by the component, and an
    // inline custom property cannot be overridden from a stylesheet -- so the
    // media query reads a SECOND variable rather than clamping the first. Two
    // variables is a thing that can silently stop agreeing, so both ends are
    // measured here: the cap holds at four tabs, and it does not pad a single
    // tab out to two columns.
    const ui = await openHarness({ tabs: 4 })

    await ui.page.setViewportSize({ width: 600, height: 800 })
    const columns = await ui.page.evaluate(
      () => getComputedStyle(document.querySelector('.chrome-tabs__list')).gridTemplateColumns
    )
    expect(columns.split(' ')).toHaveLength(2)
    await ui.close()

    const one = await openHarness({ tabs: 1 })
    await one.page.setViewportSize({ width: 600, height: 800 })
    const oneColumn = await one.page.evaluate(
      () => getComputedStyle(document.querySelector('.chrome-tabs__list')).gridTemplateColumns
    )
    expect(oneColumn.split(' ')).toHaveLength(1)

    // And the strip still stops before the action card at that width.
    const strip = await one.box(REGIONS.tabs)
    const action = await one.box(REGIONS.action)
    expect(strip.x + strip.width).toBeLessThanOrEqual(action.x)

    await one.close()
  }, SLOW)

  it('sizes the strip to its tabs rather than to the space available', async () => {
    // The claim "sized to its content" is only a claim until two different
    // counts produce two different widths.
    const one = await openHarness({ tabs: 1 })
    const oneWide = (await one.box(REGIONS.tabs)).width
    await one.close()

    const three = await openHarness({ tabs: 3 })
    const threeWide = (await three.box(REGIONS.tabs)).width
    const action = await three.box(REGIONS.action)
    await three.close()

    expect(oneWide).toBeLessThan(threeWide)
    // And neither of them took the whole track it was given.
    expect(threeWide).toBeLessThan(action.x)
  }, SLOW)
})

/* ===========================================================================
   7. "+N MORE" GROWS UPWARD
   =========================================================================== */

describeIf('7. expanding the tab strip', () => {
  it('grows upward from the bottom and does not move the action card', async () => {
    const ui = await openHarness({ tabs: 11 })

    const before = {
      strip: await ui.box(REGIONS.tabs),
      action: await ui.box(REGIONS.action),
    }
    // Collapsed: one row, and a "+N more" in its last cell.
    expect(await ui.page.locator('.chrome-tab--more').count()).toBe(1)

    await ui.page.click('[data-testid="tabs-more-landform"]')
    await ui.page.waitForFunction(
      () => document.querySelector('.chrome-tabs')?.dataset.expanded === 'true'
    )

    const after = {
      strip: await ui.box(REGIONS.tabs),
      action: await ui.box(REGIONS.action),
    }

    // IT GOT TALLER.
    expect(after.strip.height).toBeGreaterThan(before.strip.height)

    // UPWARD: the top moved up, and the BOTTOM did not move. Both halves
    // matter -- a strip that grew downward would also get taller, and would
    // push its own last row off the bottom of the frame.
    expect(after.strip.y).toBeLessThan(before.strip.y)
    expect(Math.abs(after.strip.y + after.strip.height - (before.strip.y + before.strip.height))
    ).toBeLessThanOrEqual(1)

    // AND THE ACTION CARD DID NOT MOVE, in either axis. It shares the row and
    // is anchored to the same bottom edge; the strip growing is not its
    // business.
    expect(Math.abs(after.action.x - before.action.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.action.y - before.action.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.action.width - before.action.width)).toBeLessThanOrEqual(1)

    // STILL CLEAR OF IT. The expanded strip is the widest the strip ever gets.
    expect(after.strip.x + after.strip.width).toBeLessThanOrEqual(after.action.x)

    await ui.close()
  }, SLOW)

  it('holds its footprint at three rows and scrolls past them', async () => {
    // The cap the previous branch set, restated here because "grows upward" is
    // only safe while the growth is bounded: an unbounded strip growing upward
    // would reach the instruction card.
    const ui = await openHarness({ tabs: 40 })
    await ui.page.click('[data-testid="tabs-more-landform"]')
    await ui.page.waitForFunction(
      () => document.querySelector('.chrome-tabs')?.dataset.expanded === 'true'
    )

    const stage = await ui.stage()
    const strip = await ui.box(REGIONS.tabs)
    const instruction = await ui.box(REGIONS.instruction)

    // It scrolls rather than growing past its cap.
    const list = await ui.page.evaluate(() => {
      const el = document.querySelector('.chrome-tabs__list')
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    })
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)

    // And it is nowhere near the instruction card, or half the map.
    expect(strip.y).toBeGreaterThan(instruction.y + instruction.height)
    expect(strip.height).toBeLessThan(stage.height / 2)

    await ui.close()
  }, SLOW)
})

/* ===========================================================================
   THE RAIL, MEASURED
   =========================================================================== */

describeIf('the rail, on screen', () => {
  it('draws all seven rows with no session and keeps them off the bottom row', async () => {
    const ui = await openHarness({ tabs: 3 })
    const rail = await ui.box(REGIONS.rail)
    const stage = await ui.stage()

    // Seven rows: the boundary plus the catalogue's six.
    expect(await ui.page.locator('[data-testid="wizard-order"] > li').count()).toBe(7)

    // The rail is a card at the left, inset, and it does not reach the bottom
    // row -- which is the collision the bottom grid's empty first track is
    // reserved against.
    expect(rail.x - stage.x).toBeCloseTo(EDGE, 0)
    expect(rail.width).toBeLessThan(stage.width / 3)

    const strip = await ui.box(REGIONS.tabs)
    expect(rail.x + rail.width).toBeLessThanOrEqual(strip.x)

    await ui.close()
  }, SLOW)
})

/* ===========================================================================
   THE DETAIL PANEL: IT MOVES NOTHING, AND ITS FOOTPRINT IS A CONSTANT
   ===========================================================================
   THE BUG THESE WERE WRITTEN AGAINST. Selecting a zone opened the panel in the
   TOP RIGHT and pushed the tab strip at the BOTTOM downward -- off the stage
   entirely on a panel with enough rows.

   It happened through the grid row the panel sits in. `.chrome`'s middle row
   was `1fr`, which is `minmax(auto, 1fr)`: an AUTO MINIMUM, meaning the row is
   at least as tall as its content. Past the leftover space the row grew, the
   three rows stopped summing to the container, and the bottom row went down by
   the excess. Measured here before the fix, at 1280x800 with realistic water
   rows: 13 rows moved the strip 0px, 14 moved it 51px, and 19 -- water's
   maximal panel -- moved it 203px, which is 190px below the stage's bottom
   edge. A threshold and then a drop that tracks the content, which is why the
   symptom read as "some zones push it and some do not".

   ONLY A REAL ENGINE CAN SETTLE ANY OF THIS. `minmax(auto, 1fr)` vs
   `minmax(0, 1fr)` is a difference in what the layout algorithm does with a
   row, and jsdom runs no layout algorithm. style.test.jsx can assert the
   stylesheet says `minmax(0, 1fr)`; it cannot assert that the strip did not
   move, which is the actual claim.

   THE PANEL IS OPENED BY CLICKING A TAB, which is the gesture that opens it in
   the app -- and the reason these measure BEFORE and AFTER on ONE page rather
   than comparing two. Two pages are two layouts; "it did not move" is a claim
   about one.
   =========================================================================== */

describeIf('the detail panel, measured', () => {
  /** Open the panel the way a user does, and wait for it to be laid out. */
  async function openPanel(ui) {
    await ui.page.click('[data-testid="tab-zone-1"]')
    await ui.page.waitForSelector('.chrome-detail')
  }

  it('does not move the tab strip when it opens', async () => {
    // TEST 1. The whole branch in one assertion.
    const ui = await openHarness({ tabs: 3, detail: 14 })

    const before = {
      strip: await ui.box(REGIONS.tabs),
      action: await ui.box(REGIONS.action),
      rail: await ui.box(REGIONS.rail),
    }
    // The panel is genuinely absent to begin with -- so what follows is an
    // opening, not a re-measure of something already there.
    expect(await ui.box(REGIONS.detail), 'no panel before the click').toBeNull()

    await openPanel(ui)
    expect(await ui.box(REGIONS.detail), 'the panel opened').not.toBeNull()

    const after = {
      strip: await ui.box(REGIONS.tabs),
      action: await ui.box(REGIONS.action),
      rail: await ui.box(REGIONS.rail),
    }

    // THE STRIP DID NOT MOVE. Not "moved less"; did not move.
    expect(after.strip.y, 'the tab strip must not move when the panel opens').toBeCloseTo(
      before.strip.y,
      0
    )
    expect(after.strip.x).toBeCloseTo(before.strip.x, 0)
    expect(after.strip.height).toBeCloseTo(before.strip.height, 0)

    // NOR DID THE OTHER TWO REGIONS SHARING ITS ROWS. The claim is that the
    // panel affects NO region's position, and the strip is only the one the
    // bug was reported through.
    expect(after.action.y).toBeCloseTo(before.action.y, 0)
    expect(after.action.x).toBeCloseTo(before.action.x, 0)
    expect(after.rail.y).toBeCloseTo(before.rail.y, 0)

    // AND THE STRIP IS STILL ON THE STAGE, which is what the drop was
    // ultimately costing.
    const stage = await ui.stage()
    expect(after.strip.y + after.strip.height).toBeLessThanOrEqual(
      stage.y + stage.height - INSET
    )

    await ui.close()
  }, SLOW)

  it('puts the strip in the same place for a one-group panel and a four-group one', async () => {
    // TEST 2. THE SECOND SYMPTOM THE COUPLING PREDICTED: a drop that varied
    // with how much the panel held. That is what made it a property of the
    // ROW rather than of any one height -- and it is why a fixed panel height
    // alone would have been the wrong fix, freezing the strip at a wrong
    // position instead of restoring it.
    //
    // FOUR COUNTS ACROSS THE OLD THRESHOLD: two below it, one just past it,
    // and water's maximal panel well past it. Before the fix the first two
    // agreed and the last two did not.
    //
    // ONE ROW IS THE ONE-GROUP CASE. detailGroups() deals rows round the four
    // groups, so the group COUNT is min(rows, 4) -- two rows is already two
    // groups, and one row is the only single-group panel there is.
    const positions = []
    for (const rows of [1, 8, 14, 19]) {
      const ui = await openHarness({ tabs: 3, detail: rows })
      await openPanel(ui)
      const strip = await ui.box(REGIONS.tabs)
      const panel = await ui.box(REGIONS.detail)
      const groups = await ui.page.locator('.chrome-detail__group').count()
      positions.push({ rows, y: strip.y, panelHeight: panel.height, groups })
      await ui.close()
    }

    // The cases really are different panels -- one group against four -- so
    // the agreement below is not four measurements of the same thing.
    expect(positions[0].groups).toBe(1)
    expect(positions[3].groups).toBe(4)
    expect(positions[3].panelHeight).toBeGreaterThan(positions[0].panelHeight)

    // AND THE STRIP IS IN THE SAME PLACE IN ALL FOUR.
    for (const position of positions) {
      expect(
        position.y,
        `${position.rows} rows: the strip must sit where it sits with every other panel`
      ).toBeCloseTo(positions[0].y, 0)
    }

    await Promise.resolve()
  }, MANY_PAGES)

  it('scrolls its content past the cap without changing its own height', async () => {
    // TEST 3. The cap is only a cap if the content that exceeds it is still
    // REACHABLE -- otherwise it is a crop.
    const under = await openHarness({ tabs: 3, detail: 6 })
    await openPanel(under)
    const underBox = await under.box(REGIONS.detail)
    const underScroll = await under.page.evaluate(() => {
      const el = document.querySelector('.chrome-detail__body')
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    })
    await under.close()

    // A panel comfortably under the cap does NOT scroll -- so the assertion
    // below is about the cap and not about a body that always overflows.
    expect(underScroll.scrollHeight).toBeLessThanOrEqual(underScroll.clientHeight + 1)

    const over = await openHarness({ tabs: 3, detail: 30 })
    await openPanel(over)
    const overBox = await over.box(REGIONS.detail)
    const overScroll = await over.page.evaluate(() => {
      const el = document.querySelector('.chrome-detail__body')
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    })

    // IT SCROLLS: there is more content than box.
    expect(overScroll.scrollHeight).toBeGreaterThan(overScroll.clientHeight)

    // AND THE BOX IS THE CAP, not the content. Five times the rows, same
    // footprint -- which is the property the layout gets to depend on.
    expect(overBox.height).toBeGreaterThan(underBox.height) // 6 rows is under the cap
    expect(overBox.height).toBeCloseTo(PANEL_CAP, 0)

    // THE CONTENT REALLY IS REACHABLE. Scroll to the bottom and the body's
    // last child is inside the visible box.
    const lastVisible = await over.page.evaluate(() => {
      const body = document.querySelector('.chrome-detail__body')
      body.scrollTop = body.scrollHeight
      const last = body.lastElementChild.getBoundingClientRect()
      const box = body.getBoundingClientRect()
      return last.bottom <= box.bottom + 1 && last.top >= box.top - 1
    })
    expect(lastVisible, 'the last row must be reachable by scrolling').toBe(true)

    await over.close()
  }, SLOW)

  it('keeps the header visible while the body scrolls', async () => {
    // TEST 4. The panel exists to say what ONE zone is; a reader who has
    // scrolled to a caution while the zone's name has left the box is reading
    // figures about something they can no longer identify.
    const ui = await openHarness({ tabs: 3, detail: 30 })
    await openPanel(ui)

    const heading = '.chrome-detail__name'
    const before = await ui.box(heading)
    expect(before).not.toBeNull()

    await ui.page.evaluate(() => {
      const body = document.querySelector('.chrome-detail__body')
      body.scrollTop = body.scrollHeight
    })
    const scrolled = await ui.page.evaluate(
      () => document.querySelector('.chrome-detail__body').scrollTop
    )
    expect(scrolled, 'the body actually scrolled').toBeGreaterThan(0)

    // THE HEADING DID NOT MOVE, and is still inside the panel.
    const after = await ui.box(heading)
    expect(after.y).toBeCloseTo(before.y, 0)
    const panel = await ui.box(REGIONS.detail)
    expect(after.y).toBeGreaterThanOrEqual(panel.y - 1)
    expect(after.y + after.height).toBeLessThanOrEqual(panel.y + panel.height + 1)

    // AND IT STILL SAYS THE ZONE'S NAME.
    expect(await ui.page.locator(heading).textContent()).toBe('Embankment 1')

    await ui.close()
  }, SLOW)

  it('moves nothing on the NARROW layout either, where the grid is a different one', async () => {
    // THE SAME CLAIM, ON THE OTHER GRID, and it needs its own test because the
    // wide layout's fix cannot reach this one.
    //
    // Under `max-width: 46rem` the chrome re-lays out: the rail goes
    // horizontal and joins the panel in a row of their own, and the free map
    // becomes a row BELOW them ('rail detail' / 'free free'). So the panel's
    // row is `auto` -- content-sized -- rather than the `1fr` the wide layout
    // gives it. Two consequences, and both bite:
    //
    //   The panel's height goes straight back into the row stack, pushing the
    //   free row and the bottom row down. Measured here before the narrow
    //   cap: a 30-row panel moved the strip and the action card 830px, off
    //   the stage.
    //
    //   And the shared rule's percentage term resolves against an INDEFINITE
    //   height, so it silently evaluates to `none` and the cap collapses to a
    //   flat 30rem -- taller than the map it is sitting on. A cap that fails
    //   quietly is worse than one that fails loudly, so it is measured.
    const ui = await openHarness({ tabs: 3, detail: 30 })
    await ui.page.setViewportSize({ width: 700, height: 620 })
    await ui.page.waitForFunction(
      () => getComputedStyle(document.querySelector('.chrome')).gridTemplateAreas.includes('free')
    )

    const before = { strip: await ui.box(REGIONS.tabs), action: await ui.box(REGIONS.action) }
    await openPanel(ui)
    const after = { strip: await ui.box(REGIONS.tabs), action: await ui.box(REGIONS.action) }

    expect(after.strip.y, 'the narrow layout must not move the strip either').toBeCloseTo(
      before.strip.y,
      0
    )
    expect(after.action.y).toBeCloseTo(before.action.y, 0)

    // AND NOTHING LEFT THE STAGE.
    const stage = await ui.stage()
    const panel = await ui.box(REGIONS.detail)
    for (const [name, box] of Object.entries({ ...after, panel })) {
      expect(
        box.y + box.height,
        `${name} must stay on the stage at 700x620`
      ).toBeLessThanOrEqual(stage.y + stage.height + 1)
    }

    // The flat-30rem failure would put the panel at 480px on a 620px frame.
    expect(panel.height).toBeLessThan(PANEL_CAP)

    await ui.close()
  }, SLOW)

  it('stays in the open map band and off the parcel, at four viewport heights', async () => {
    // TEST 5. WHAT "DOES NOT COVER THE PARCEL" IS MEASURED AS, said plainly
    // because the honest version is not the obvious one.
    //
    // There is no parcel on this page -- the harness mounts no Leaflet, for
    // the reasons its own docblock gives -- and driving the real map to a
    // committed boundary would make a geometry assertion depend on a session,
    // a backend and a tile fetch. What CAN be measured is the property that
    // actually keeps the parcel visible, and it is a stronger claim than
    // "does not overlap some rectangle":
    //
    //   THE PANEL NEVER LEAVES THE OPEN MAP BAND. Clear of the instruction
    //   card above and of the bottom row below, at every height. This is the
    //   one that matters most after the decoupling: an item that can no longer
    //   PUSH the strip can still be DRAWN OVER it, and that would be the same
    //   bug wearing a different coat.
    //
    //   IT LEAVES THE MAP'S CENTRE CLEAR. Leaflet centres a fitted parcel in
    //   its container, so the container's centre is the middle of the parcel
    //   at whole-parcel zoom whatever the zoom actually is. A panel covering
    //   that point is covering the parcel's middle.
    //
    //   AND IT IS A CORNER CARD, NOT A SIDEBAR. Bounded well under a third of
    //   the stage's area, at every height.
    for (const height of [1000, 800, 620, 480]) {
      const ui = await openHarness({ tabs: 3, detail: 30 }) // past the cap: the tallest it gets
      await ui.page.setViewportSize({ width: 1280, height })
      await openPanel(ui)

      const stage = await ui.stage()
      const panel = await ui.box(REGIONS.detail)
      const bar = await ui.box(REGIONS.instruction)
      const strip = await ui.box(REGIONS.tabs)
      const action = await ui.box(REGIONS.action)

      // IN THE BAND, touching neither the row above nor the row below.
      expect(overlaps(panel, bar), `${height}px: panel clear of the instruction card`).toBe(
        false
      )
      expect(overlaps(panel, strip), `${height}px: panel clear of the tab strip`).toBe(false)
      expect(overlaps(panel, action), `${height}px: panel clear of the action card`).toBe(false)
      expect(panel.y + panel.height, `${height}px: panel above the bottom row`).toBeLessThanOrEqual(
        strip.y + 1
      )

      // THE MAP'S CENTRE IS NOT UNDER IT.
      const centre = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 }
      const coversCentre =
        centre.x >= panel.x &&
        centre.x <= panel.x + panel.width &&
        centre.y >= panel.y &&
        centre.y <= panel.y + panel.height
      expect(coversCentre, `${height}px: the panel must not cover the map's centre`).toBe(false)

      // A CORNER CARD.
      const share = (panel.width * panel.height) / (stage.width * stage.height)
      expect(share, `${height}px: the panel must stay a corner card`).toBeLessThan(0.25)

      await ui.close()
    }
  }, MANY_PAGES)
})

/* ===========================================================================
   THE ATTRIBUTION, IN THE TOP-LEFT GAP, AT THREE VIEWPORT HEIGHTS
   ===========================================================================
   THIS ONE OPENS THE APP, NOT THE HARNESS, and it is the only test in this
   file that does. The harness deliberately mounts NO LEAFLET -- its own
   docblock says why: the chrome floats over the map and takes nothing from it,
   and a page waiting on tile fetches makes a geometry test flaky for a reason
   unrelated to geometry. But the credit IS a Leaflet control, positioned by
   Leaflet into a corner Leaflet owns, and the claim under test is where that
   corner lands relative to a chrome region. A stand-in element with the same
   class in a hand-built corner would be a copy of the thing under test, which
   is the failure mode the harness exists to avoid.

   So this drives the shipped index.html through the same dev server. THE
   TILES ARE ABORTED at the route level: there is no route to Esri from a
   sandbox, and the control container's geometry does not depend on whether a
   tile arrived. Nothing else is stubbed.

   THREE HEIGHTS, because the gap the credit sits in is made by the rail being
   top-inset under a bar of its own, and "that gap exists" is a claim about a
   layout that could close up on a shorter window.
   =========================================================================== */

describeIf('the attribution, at four viewport heights', () => {
  /** The app's own page, with the basemap's tiles refused. */
  async function openApp(height) {
    const page = await browser.newPage({ viewport: { width: 1280, height } })
    await page.route('**/server.arcgisonline.com/**', (route) => route.abort())
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'load' })
    await page.waitForSelector('.leaflet-control-attribution')
    const box = async (selector) => {
      const handle = await page.$(selector)
      return handle ? await handle.boundingBox() : null
    }
    return { page, box, close: () => page.close() }
  }

  for (const height of [1000, 800, 620, 480]) {
    it(`sits in the top-left card gap, clear of the rail, at ${height}px`, async () => {
      const ui = await openApp(height)

      const credit = await ui.box('.leaflet-control-attribution')
      const stage = await ui.box('.map-stage')
      const rail = await ui.box('.chrome-rail')
      const bar = await ui.box('.chrome-bar')

      expect(credit, 'the credit is rendered').not.toBeNull()
      expect(rail, 'the rail is rendered').not.toBeNull()

      // IT HAS A BOX AT ALL, which is the first thing a card has and a bare
      // haloed line does not.
      expect(credit.width).toBeGreaterThan(0)
      expect(credit.height).toBeGreaterThan(0)

      // TOP-LEFT, AT THE CARD INSET -- the same --space-3 every other region
      // keeps from the stage's edge, rather than the chrome-dodging offsets
      // Leaflet's other three corners take.
      expect(credit.x - stage.x, 'the credit keeps the card inset on the left').toBeCloseTo(
        EDGE,
        0
      )
      expect(credit.y - stage.y, 'the credit keeps the card inset at the top').toBeCloseTo(EDGE, 0)

      // CLEAR OF THE RAIL, WHICH IS THE WHOLE POINT OF THE GAP. The rail
      // begins in the grid row below the instruction bar; the credit sits in
      // the row above it. No overlap, in either axis-pair.
      expect(
        overlaps(credit, rail),
        `the credit must not collide with the rail at ${height}px`
      ).toBe(false)

      // AND CLEAR OF THE INSTRUCTION BAR, which is centred in that same row --
      // the gap is what the centring leaves on the left.
      expect(
        overlaps(credit, bar),
        `the credit must not collide with the instruction bar at ${height}px`
      ).toBe(false)

      // IT IS NOT OVER THE OPEN MAP EITHER: it is at the edge, in the corner
      // the layout left for it.
      expect(credit.x + credit.width).toBeLessThan(stage.x + stage.width / 2)

      await ui.close()
    }, SLOW)
  }

  it('keeps the floating-card treatment rather than sitting bare on the imagery', async () => {
    const ui = await openApp(800)
    const style = await ui.page.$eval('.leaflet-control-attribution', (node) => {
      const computed = getComputedStyle(node)
      return {
        background: computed.backgroundColor,
        borderWidth: computed.borderTopWidth,
        borderStyle: computed.borderTopStyle,
        color: computed.color,
        textShadow: computed.textShadow,
      }
    })

    // AN OPAQUE SURFACE. Not transparent, and not the halo it used to carry:
    // both of those read as the one region that failed to get a background,
    // now that it sits among the cards rather than alone over the imagery.
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.background).not.toBe('transparent')
    expect(style.textShadow === 'none' || style.textShadow === '').toBe(true)
    // A HAIRLINE, on all four sides.
    expect(style.borderStyle).toBe('solid')
    expect(parseFloat(style.borderWidth)).toBeCloseTo(1, 1)

    await ui.close()
  }, SLOW)
})

/** Do two rendered rectangles share any area? */
function overlaps(a, b) {
  if (!a || !b) return false
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

/* ===========================================================================
   THE ZONE PATTERNS, RENDERED: ARE THE STATES ACTUALLY TELLABLE APART?
   ===========================================================================
   THE ONLY PLACE THIS QUESTION CAN BE ASKED. Every other assertion about the
   pattern scheme is about which fill and which opacity a path is given;
   whether two of them look different is a fact about rendered pixels, and
   jsdom paints none.

   MEASURED AS INK COVERAGE. Each swatch is a 90px square -- about what one of
   the reference parcel's survey zones occupies with the whole parcel in frame
   -- filled with one treatment's pattern at one level, over a flat mid-grey.
   Counting how far the pixels move from that grey gives one number per
   swatch, and the comparisons below are between those numbers. It is a
   deliberately crude measure and that is the point: if a crude measure can
   separate two states, an eye can.
   =========================================================================== */

describeIf('the zone patterns, rendered', () => {
  /**
   * INK COVERAGE OF ONE SWATCH, FROM WHAT CHROMIUM ACTUALLY PAINTED.
   *
   * A SCREENSHOT RATHER THAN A RE-RENDER. The first version of this
   * serialised each swatch's SVG and rasterised it on a canvas in the page,
   * which measured a second drawing of the pattern rather than the one on
   * screen -- and did it unreliably, because a standalone SVG document has to
   * carry its own paint servers and an <img> decode is not finished when its
   * load event fires. Screenshotting the element asks the browser what it put
   * on the glass, which is the question.
   *
   * THE MEASURE IS MEAN DEVIATION FROM THE FLAT GREY BACKDROP, 0..1. It is
   * deliberately crude: it cannot see shape and does not try to. If a measure
   * this blunt separates two states, an eye looking for the difference will.
   */
  /**
   * How much ink one swatch puts on the page.
   *
   * `inset` CROPS THE BORDER OFF, and exists for one question: whether a tint
   * is a SCREEN. A tinted swatch carries its outline and the halo casing under
   * it, both at full-strength opacity, and on a 90px square that border is a
   * fifth of the pixels -- so measuring the whole swatch measures mostly the
   * line. On a real survey zone the same border is a rim around a shape many
   * times the size and contributes almost nothing. Cropping past it measures
   * the wash, which is what "screened" is a claim about. 8px clears the 4px
   * casing and its antialiasing.
   */
  async function inkOf(page, treatment, state, { inset = 0 } = {}) {
    const element = await page.$(`[data-testid="swatch-${treatment}-${state}"]`)
    if (!inset) return meanDeviation(decodePng(await element.screenshot({ type: 'png' })))
    const box = await element.boundingBox()
    const shot = await page.screenshot({
      type: 'png',
      clip: {
        x: box.x + inset,
        y: box.y + inset,
        width: box.width - 2 * inset,
        height: box.height - 2 * inset,
      },
    })
    return meanDeviation(decodePng(shot))
  }

  let page = null

  beforeAll(async () => {
    if (!available) return
    page = await browser.newPage({ viewport: VIEWPORT })
    await page.goto(pageUrl({ zones: 1 }), { waitUntil: 'load' })
    await page.waitForFunction(() => document.documentElement.dataset.harnessReady === 'true')
    // The swatches clone their pattern in an effect, so "ready" is the flag
    // they raise once the clones are in place, not React having committed.
    await page.waitForFunction(
      () => document.querySelector('[data-swatches-ready="true"]') !== null
    )
  }, 60_000)

  it('tells the focused state from the active one at whole-parcel size', async () => {
    for (const treatment of SWATCH_TREATMENTS) {
      const active = await inkOf(page, treatment, 'active')
      const focused = await inkOf(page, treatment, 'focused')
      const committed = await inkOf(page, treatment, 'committed')
      // eslint-disable-next-line no-console
      console.log(
        `    ink  ${treatment.padEnd(18)} committed ${committed.toFixed(4)}  ` +
          `active ${active.toFixed(4)}  focused ${focused.toFixed(4)}  ` +
          `(focused/active ${(focused / active).toFixed(2)}x)`
      )

      // FOCUSED IS MORE PRESENT -- the direction the scheme chose, because it
      // changes one mark instead of every other one.
      expect(focused, `${treatment}: focused must be more present`).toBeGreaterThan(active)

      // AND BY ENOUGH TO SEE. A pattern is mostly unfilled, so a small step in
      // opacity vanishes at this size; the fix is a wide gap between levels
      // rather than a hope about perception. Half again as much ink is the
      // floor this asserts against.
      expect(focused / active, `${treatment}: focused vs active`).toBeGreaterThan(1.5)
    }
  }, SLOW)

  it('mutes a committed zone below an active one, without erasing it', async () => {
    for (const treatment of SWATCH_TREATMENTS) {
      const committed = await inkOf(page, treatment, 'committed')
      const active = await inkOf(page, treatment, 'active')
      expect(committed, `${treatment}: committed is quieter`).toBeLessThan(active)
      // STILL THERE. A committed layer is context for the step in hand, not a
      // layer that has been turned off -- and from the roads step onward
      // several of them share the map.
      expect(committed, `${treatment}: committed is still visible`).toBeGreaterThan(0.004)
    }
  }, SLOW)

  it('draws three KINDS of mark, so the step AND the survey type are told by shape', async () => {
    // The claim is that a reader can tell WHICH STEP a mark belongs to, and --
    // for the one step whose two types overlap on purpose -- WHICH TYPE. The
    // ink measure cannot see shape, so this asks the geometry directly.
    const marks = await page.evaluate(() => {
      const defOf = (t) => document.getElementById(`zone-pattern-${t}`)
      const shapesOf = (t) =>
        defOf(t) ? [...new Set([...defOf(t).children].map((n) => n.tagName.toLowerCase()))] : null
      const fillOf = (t) =>
        document.querySelector(`[data-testid="swatch-${t}-active"] rect`).getAttribute('fill')
      return {
        production: { shapes: shapesOf('production'), fill: fillOf('production') },
        embankment: { shapes: shapesOf('survey-embankment'), fill: fillOf('survey-embankment') },
        excavated: {
          shapes: shapesOf('survey-excavated'),
          fill: fillOf('survey-excavated'),
          dots: defOf('survey-excavated').children.length,
          radii: [
            ...new Set([...defOf('survey-excavated').children].map((n) => n.getAttribute('r'))),
          ],
          strokes: [...defOf('survey-excavated').children].filter((n) =>
            n.hasAttribute('stroke')
          ).length,
        },
      }
    })

    // PRODUCTION: ruled paths in a paint server, and NO outline anywhere.
    expect(marks.production.shapes).toEqual(['path'])

    // EMBANKMENT: no paint server at all. A wash's fill is a colour, and an
    // empty def nothing references would be the smell.
    expect(marks.embankment.shapes).toBeNull()
    expect(marks.embankment.fill).not.toMatch(/^url\(#/)

    // EXCAVATED: a paint server too, and it is a FIELD OF DOTS rather than
    // ruled lines -- so the two survey types differ in the KIND of mark, not
    // just in the value of one mark. That is what makes their overlap read as
    // two zones sharing ground instead of as a third, darker zone.
    expect(marks.excavated.shapes).toEqual(['circle'])
    expect(marks.excavated.fill).toMatch(/^url\(#/)
    expect(marks.excavated.fill).not.toBe(marks.production.fill)

    // MANY, AND FINE. "Static" is a fine dense irregular field; a handful of
    // large dots is a texture with structure in it, which is what the previous
    // stipple was.
    expect(marks.excavated.dots).toBeGreaterThan(200)
    expect(Number(marks.excavated.radii[0])).toBeLessThanOrEqual(0.75)

    // AND NO PER-DOT CASING. The casing rule is for a LINE that has to survive
    // imagery alone; a ring at the dot's own frequency is a second texture, and
    // it is what killed the previous stipple.
    expect(marks.excavated.strokes).toBe(0)
  }, SLOW)

  it('outlines both survey marks in their own colour, with nothing under the line', async () => {
    const outlined = await page.evaluate(() => {
      const halo = getComputedStyle(document.documentElement).getPropertyValue('--halo').trim()
      const excavated = getComputedStyle(document.documentElement)
        .getPropertyValue('--survey-excavated')
        .trim()
      return ['survey-embankment', 'survey-excavated'].map((t) => {
        const svg = document.querySelector(`[data-testid="swatch-${t}-active"]`)
        const strokes = [...svg.querySelectorAll('rect[stroke]')]
        const fill = svg.querySelector('rect').getAttribute('fill')
        return {
          outlined: svg.dataset.outlined === 'true',
          count: strokes.length,
          // THE LINE IS THE MARK'S OWN COLOUR. For the wash that is literally
          // its fill; for the dot field the fill is a paint server, so the
          // comparison is against the token both the dots and the line read.
          lineIsTheMark:
            strokes[0]?.getAttribute('stroke') === (fill.startsWith('url(#') ? excavated : fill),
          anyHalo: strokes.some((rect) => rect.getAttribute('stroke') === halo),
        }
      })
    })
    // ONE LINE, ONE COLOUR, AND IT IS THE MARK'S. A second stroked rect would
    // be a casing, which neither mark takes -- see the --survey-* note in
    // index.css for what that costs and why.
    for (const mark of outlined) {
      expect(mark.outlined).toBe(true)
      expect(mark.count).toBe(1)
      expect(mark.lineIsTheMark).toBe(true)
      expect(mark.anyHalo).toBe(false)
    }
  }, SLOW)

  it('keeps water a SCREEN rather than paint, and keeps production visible beside it', async () => {
    /**
     * WHAT THIS REPLACED, AND WHY THE OLD ASSERTION COULD NOT SURVIVE THE MARK
     * CHANGE. This held the hatch and the stipple within 2.5x of each other's
     * ink, because both were sparse PATTERNS and a pattern that inks five
     * times as much page as its neighbour reads as the important one whatever
     * it means. That comparison assumed two marks of the same kind. A tint
     * covers all of the ground it is over and a hatch covers an eighth of it,
     * so measured this way water now reads about 19x the hatch -- and that is
     * a fact about the two KINDS of mark, not a regression a number can hold
     * back. Lowering the tint until the ink matched would need an alpha around
     * 0.012, which is not a tint, it is nothing.
     *
     * SO THE GUARD MOVED TO THE CLAIM THAT IS STILL TRUE OF A TINT: it must be
     * a SCREEN. The ground has to read through it, and that is measurable --
     * against the same colour at full opacity, which is arithmetic rather than
     * a second render. The ratio between the two IS the effective alpha, and
     * the assertion is that the aerial frame is more than half of what you see
     * even on the most present state there is.
     *
     * MEASURED INSIDE THE OUTLINE. The wash is what is being asked about; the
     * line around it is ink at full strength and is meant to be. See inkOf's
     * own note for why that matters at 90px and not on a real zone.
     */
    const opaqueDeviation = await page.evaluate((state) => {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue('--survey-embankment')
        .trim()
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      // meanDeviation's own measure, against its own mid-grey base, for the
      // colour laid down solid.
      return (Math.abs(r - 128) + Math.abs(g - 128) + Math.abs(b - 128)) / (3 * 255)
    })

    const hatch = await inkOf(page, 'production', 'active')
    for (const tint of ['survey-embankment', 'survey-excavated']) {
      const focused = await inkOf(page, tint, 'focused', { inset: 8 })
      const screened = focused / opaqueDeviation
      // eslint-disable-next-line no-console
      console.log(
        `    ink  ${tint.padEnd(18)} focused ${focused.toFixed(4)}  ` +
          `opaque ${opaqueDeviation.toFixed(4)}  (screened ${screened.toFixed(2)})`
      )
      expect(screened, `${tint} must remain a screen`).toBeLessThan(0.5)
    }

    // AND PRODUCTION IS STILL THERE BESIDE IT. The hatch is the quieter mark
    // by construction now; what it may not be is invisible, because from the
    // roads step onward both are on the map at once.
    expect(hatch, 'the hatch is still on the page').toBeGreaterThan(0.004)
  }, SLOW)

  /**
   * HOW MUCH INK A MARK ADDS OVER THE GROUND IT IS ON, 0..1.
   *
   * The mid-grey measure above is deviation from a KNOWN flat base, which is
   * the right measure when the base is neutral and the question is "how much
   * ink". Over canopy or soil the ground is itself far from grey, so that
   * measure would report the ground and the mark together. This subtracts:
   * the same swatch with the mark and the bare ground beside it, differenced
   * pixel for pixel. What comes out is the mark's own contribution, which is
   * the thing legibility is a claim about.
   */
  /** One ground cell, decoded, by its full test id. */
  async function swatchOf(page, testid) {
    return decodePng(
      await (await page.$(`[data-testid="${testid}"]`)).screenshot({ type: 'png' })
    )
  }

  async function addedInkOver(page, ground, treatment, state) {
    const marked = decodePng(
      await (await page.$(`[data-testid="ground-${ground}-${treatment}-${state}"]`)).screenshot({
        type: 'png',
      })
    )
    const bare = decodePng(
      await (await page.$(`[data-testid="ground-${ground}-bare"]`)).screenshot({ type: 'png' })
    )
    return meanAbsDifference(marked, bare)
  }

  it('keeps a committed zone legible over canopy and over bare soil', async () => {
    /**
     * THE ADJUSTMENT THIS TEST EXISTS FOR. --pattern-committed was 0.3 and
     * committed landform zones read as "barely visible" on imagery while the
     * water step was being worked. The mid-grey measure could not see it: on
     * a neutral backdrop 0.3 is plainly there, and the two tests above both
     * passed throughout.
     *
     * THE FLOOR IS THE SAME NUMBER THE MID-GREY MEASURE USES -- 0.004, the
     * visibility floor those tests assert the committed hatch against -- held
     * over each of the two extremes rather than over their average. That is
     * the whole of the tightening: the claim was always "a committed layer is
     * context, not a layer that has been turned off", and this is that claim
     * asked where it can actually fail.
     *
     * AND STILL QUIETER THAN ACTIVE, on the same ground. Raising committed
     * until it competed with the step in hand would trade one wrong reading
     * for another, and the relationship between the three levels is what the
     * scale is.
     */
    for (const ground of ['canopy', 'soil']) {
      for (const treatment of SWATCH_TREATMENTS) {
        const committed = await addedInkOver(page, ground, treatment, 'committed')
        const active = await addedInkOver(page, ground, treatment, 'active')
        // eslint-disable-next-line no-console
        console.log(
          `    ink  ${ground.padEnd(6)} ${treatment.padEnd(18)} ` +
            `committed ${committed.toFixed(4)}  active ${active.toFixed(4)}  ` +
            `(committed/active ${(committed / active).toFixed(2)}x)`
        )
        expect(
          committed,
          `${treatment} committed must be legible over ${ground}`
        ).toBeGreaterThan(0.004)
        expect(
          committed,
          `${treatment} committed must stay quieter than active over ${ground}`
        ).toBeLessThan(active)
      }
    }
  }, SLOW)

  /**
   * THE ROAD IS A LINE, AND A LINE OVER IMAGERY IS ITS CASING.
   *
   * The no-stroke rule is for ZONES: a zone is an area, and an outline around
   * an area is a second mark competing with the fill. A road has no area --
   * the line IS the mark -- so the rule does not apply, and the opposite
   * concern does: a 2px umber line is dark, canopy is dark, and without a
   * light pass under it the committed road (0.4) would vanish exactly where
   * the trees step needs it as context. LineLayer draws a 4px --halo casing
   * under every branch for that reason. This measures the same line with and
   * without the casing, over both grounds, so the claim is a number.
   *
   * TWO GROUNDS, TWO PASSES. Over canopy the umber line alone is all but
   * gone (measured: 0.0008 added ink at the committed level, a fifth of the
   * visibility floor) and the casing is the whole of what the eye finds --
   * twenty times the ink. Over bare soil the halo is nearly the ground's own
   * colour and adds nothing; there the dark line is what reads. Neither pass
   * survives both grounds on its own, which is the reason a cased line has
   * two, and why the assertion on the casing is made over canopy and not
   * over soil.
   */
  it('keeps a road legible over canopy and soil, and the casing is what does it', async () => {
    for (const ground of ['canopy', 'soil']) {
      for (const state of ['committed', 'active']) {
        const cased = await addedInkOver(page, ground, 'road', state)
        const uncased = await addedInkOver(page, ground, 'road', `${state}-uncased`)
        // eslint-disable-next-line no-console
        console.log(
          `    ink  ${ground.padEnd(6)} road ${state.padEnd(9)} ` +
            `cased ${cased.toFixed(4)}  uncased ${uncased.toFixed(4)}  ` +
            `(cased/uncased ${(cased / uncased).toFixed(2)}x)`
        )
        expect(cased, `road ${state} must be legible over ${ground}`).toBeGreaterThan(0.004)
        if (ground === 'canopy') {
          expect(uncased, `the bare line is lost over ${ground}`).toBeLessThan(0.004)
          expect(cased / uncased, `the casing is what carries the road over ${ground}`).toBeGreaterThan(5)
        }
      }
      const committed = await addedInkOver(page, ground, 'road', 'committed')
      const active = await addedInkOver(page, ground, 'road', 'active')
      expect(committed, `road committed must stay quieter than active over ${ground}`).toBeLessThan(active)
    }
  }, SLOW)

  it('lets production-committed and water-committed share the map readably', async () => {
    // THE STATE FROM THE ROADS STEP ONWARD. Both present and both above the
    // visibility floor. The old form of this asserted that the committed
    // production hatch was QUIETER than the active water wash, which was a
    // real comparison while both were patterns on one scale; a wash and a
    // hatch are two kinds of ink and ranking them by this measure says nothing
    // about which one a reader notices.
    const committedProduction = await inkOf(page, 'production', 'committed')
    const committedWater = await inkOf(page, 'survey-embankment', 'committed')
    const activeWater = await inkOf(page, 'survey-embankment', 'active')
    expect(committedProduction).toBeGreaterThan(0.004)
    expect(committedWater).toBeGreaterThan(0.004)
    // A committed water zone is context, not a decision being made.
    expect(committedWater).toBeLessThan(activeWater)
  }, SLOW)

  /**
   * THE EXCAVATED DOT FIELD, MEASURED OVER BOTH GROUNDS.
   *
   * WHY THIS MARK GETS ITS OWN MEASUREMENT. #3d5a6c is the darker of the two
   * survey blues and the dots sit DIRECTLY ON IMAGERY rather than on a wash --
   * which over canopy is dark on dark, the same situation the road line hit
   * before its casing carried it (the bare umber line measured 0.0008, a fifth
   * of the floor). A dot field cannot take the road's answer: a per-dot halo is
   * a ring at the dot's own frequency, a second texture rather than a support
   * for the first, and it is what killed the previous stipple. So the only two
   * levers are DENSITY and OPACITY, and this is the measurement that says
   * whether they were enough.
   *
   * THE FIELD IS MEASURED WITHOUT ITS OUTLINE TOO, for the same reason the
   * road is measured without its casing: a mark whose interior texture is
   * carried entirely by its border is a mark that disappears in the middle of
   * a large zone, and the outline would hide that in the combined figure.
   */
  it('keeps the excavated dot field legible over canopy and soil on density alone', async () => {
    for (const ground of ['canopy', 'soil']) {
      for (const state of ['committed', 'active']) {
        const whole = await addedInkOver(page, ground, 'survey-excavated', state)
        const field = await addedInkOver(page, ground, 'survey-excavated', `${state}-unoutlined`)
        // eslint-disable-next-line no-console
        console.log(
          `    ink  ${ground.padEnd(6)} survey-excavated ${state.padEnd(9)} ` +
            `whole ${whole.toFixed(4)}  field-only ${field.toFixed(4)}  ` +
            `(outline adds ${(whole - field).toFixed(4)})`
        )
        // ABOVE THE FLOOR ON BOTH GROUNDS, whole mark and field alone. The
        // second is the load-bearing one: it is what says the DENSITY carries
        // the mark, so the outline never had to take a halo casing.
        expect(whole, `excavated ${state} must be legible over ${ground}`).toBeGreaterThan(0.004)
        expect(
          field,
          `the excavated dot field must carry itself over ${ground} at ${state}`
        ).toBeGreaterThan(0.004)
      }
      // AND STILL QUIETER WHEN COMMITTED, on this ground, like every other mark.
      const committed = await addedInkOver(page, ground, 'survey-excavated', 'committed')
      const active = await addedInkOver(page, ground, 'survey-excavated', 'active')
      expect(committed).toBeLessThan(active)
    }
  }, SLOW)

  /**
   * THE OVERLAP, WHICH IS THE CASE THE PAIR OF MARKS EXISTS FOR.
   *
   * `cross_type_overlaps` is the payload's record of the two survey
   * instruments independently identifying the same ground. While both types
   * were washes, two translucent fills stacked multiplied into a third,
   * darker fill and the overlap read as its own zone -- destroying exactly the
   * reading the field is there to support.
   *
   * TWO MARKS, TWO SIGNATURES, MEASURED APART. A wash shifts the ground's mean
   * tone and adds almost no local variation; a dot field barely moves the mean
   * and adds a great deal of local variation. So the overlap is asked for both
   * at once: is the wash's tone shift still there (compared with the dot field
   * alone), and is the dot field's texture still there (compared with the wash
   * alone). A single blended fill would fail the second -- that is what "one
   * darker fill" means numerically.
   */
  it('keeps BOTH marks present where the two survey types coincide', async () => {
    for (const ground of ['canopy', 'soil']) {
      const bare = await swatchOf(page, `ground-${ground}-bare`)
      const wash = await swatchOf(page, `ground-${ground}-survey-embankment-active`)
      const dots = await swatchOf(page, `ground-${ground}-survey-excavated-active`)
      const both = await swatchOf(page, `ground-${ground}-overlap-active`)

      const tone = (png) => meanAbsDifference(png, bare)
      // TEXTURE IS MEASURED IN THE INTERIOR, away from the outline. Every one
      // of these marks draws a 2px edge, and an edge is two hard steps in
      // every scanline -- which is local variation that says nothing about
      // whether the FILL is a texture or a wash. Cropping it out is what makes
      // the wash's reading the near-zero it ought to be.
      const texture = (png) => localVariation(crop(png, 8))

      // eslint-disable-next-line no-console
      console.log(
        `    overlap ${ground.padEnd(6)} tone  wash ${tone(wash).toFixed(4)} ` +
          `dots ${tone(dots).toFixed(4)} both ${tone(both).toFixed(4)}   ` +
          `texture wash ${texture(wash).toFixed(4)} dots ${texture(dots).toFixed(4)} ` +
          `both ${texture(both).toFixed(4)}`
      )

      // THE WASH IS STILL THERE. The overlap shifts the ground's tone by more
      // than the dot field alone does -- the wash's own contribution survives
      // having a texture laid over it.
      expect(tone(both), `the embankment wash survives the overlap over ${ground}`).toBeGreaterThan(
        tone(dots)
      )

      // THE CONTROL THAT MAKES THE NEXT ASSERTION MEAN SOMETHING. A wash
      // covers every pixel equally, so its interior has essentially no local
      // variation -- which is exactly what a SINGLE BLENDED FILL would read
      // as, whatever its tone.
      expect(texture(wash), `a wash has no texture of its own over ${ground}`).toBeLessThan(0.001)

      // THE DOTS ARE STILL THERE, and this is the assertion a single blended
      // fill fails. Held against the same 0.004 visibility floor the ink
      // measures use, so "present" means the same thing here as it does there.
      expect(
        texture(both),
        `the excavated dot field survives the overlap over ${ground}`
      ).toBeGreaterThan(0.004)
      // MOST OF IT, NOT ALL OF IT, AND THE SHORTFALL IS HONEST PHYSICS. The
      // two survey values are one tonal pair, so the embankment wash moves the
      // ground TOWARD the excavated dots' own colour and the dot-to-ground
      // delta shrinks. Over canopy that costs about half the field's local
      // contrast -- which is a cost, not a failure: the dots are still four
      // times the wash's own reading, so the overlap still reads as a texture
      // on a wash rather than as one darker fill.
      expect(
        texture(both) / texture(dots),
        `the overlap keeps the dot field's texture over ${ground}`
      ).toBeGreaterThan(0.4)
    }
  }, SLOW)
})


/* ---------------------------------------------------------------------------
   A minimal PNG reader, for the swatch measurements above
   ---------------------------------------------------------------------------
   PLAYWRIGHT HANDS BACK A PNG BUFFER AND NODE CANNOT READ ONE. Rather than add
   an image dependency for two assertions, this inflates the shapes Playwright
   produces -- 8-bit truecolour, with or without alpha, uninterlaced -- with
   the zlib that ships with node. Anything else it refuses BY NAME rather than
   returning wrong numbers quietly, which is how the colour type it actually
   emits (2, not 6) was found rather than silently mismeasured.
   --------------------------------------------------------------------------- */

function decodePng(buffer) {
  let offset = 8 // the signature
  let width = 0
  let height = 0
  let channels = 3
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body.readUInt8(8)
      const colour = body.readUInt8(9)
      const interlace = body.readUInt8(12)
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
        throw new Error(`unexpected PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`)
      }
      channels = colour === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  // Undo the per-scanline filters. The five are PNG's own and the arithmetic
  // is the specification's.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
      let value = line[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter}`)
      }
      pixels[y * stride + x] = value & 0xff
    }
  }
  return { width, height, channels, pixels }
}

/**
 * How far, on average, two images of the same size sit from each other.
 *
 * meanDeviation's measure with the base read per pixel out of a second image
 * instead of given as a constant -- so it answers the same question in the
 * same units over a ground that is not grey. Same 0..1 range, same three
 * channels, same mean.
 */
function meanAbsDifference(a, b) {
  if (a.pixels.length !== b.pixels.length || a.channels !== b.channels) {
    throw new Error('meanAbsDifference needs two images of the same size and shape')
  }
  let sum = 0
  let count = 0
  for (let i = 0; i < a.pixels.length; i += a.channels) {
    sum +=
      Math.abs(a.pixels[i] - b.pixels[i]) +
      Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) +
      Math.abs(a.pixels[i + 2] - b.pixels[i + 2])
    count++
  }
  return sum / count / (3 * 255)
}

/** The image with `inset` pixels taken off every side. */
function crop({ pixels, channels, width, height }, inset) {
  const w = width - 2 * inset
  const h = height - 2 * inset
  const out = new Uint8Array(w * h * channels)
  for (let y = 0; y < h; y += 1) {
    const from = ((y + inset) * width + inset) * channels
    out.set(pixels.subarray(from, from + w * channels), y * w * channels)
  }
  return { width: w, height: h, channels, pixels: out }
}

/**
 * HOW MUCH THE IMAGE CHANGES FROM ONE PIXEL TO THE NEXT -- the signature of a
 * TEXTURE, as opposed to the signature of a wash.
 *
 * The mean-difference measures above answer "how much ink" and cannot tell a
 * flat fill from a field of dots that puts the same total ink on the page:
 * both shift the average by the same amount. This is the other half. A wash
 * covers every pixel equally, so its horizontal neighbour differences are
 * near zero; a 1px dot field alternates ink and ground at nearly every step,
 * so they are large. That difference is what makes "the overlap is not a
 * single blended fill" a measurement rather than an opinion.
 *
 * HORIZONTAL NEIGHBOURS ONLY, which is enough: an isotropic field shows the
 * same variation along either axis, and one pass is one pass.
 */
function localVariation({ pixels, channels, width, height }) {
  let sum = 0
  let count = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const i = (y * width + x) * channels
      const j = i + channels
      sum +=
        Math.abs(pixels[i] - pixels[j]) +
        Math.abs(pixels[i + 1] - pixels[j + 1]) +
        Math.abs(pixels[i + 2] - pixels[j + 2])
      count += 1
    }
  }
  return sum / count / (3 * 255)
}

/** How far, on average, the image sits from the harness's flat mid-grey. */
function meanDeviation({ pixels, channels }, base = 128) {
  let sum = 0
  let count = 0
  for (let i = 0; i < pixels.length; i += channels) {
    sum +=
      Math.abs(pixels[i] - base) + Math.abs(pixels[i + 1] - base) + Math.abs(pixels[i + 2] - base)
    count++
  }
  return sum / count / (3 * 255)
}
