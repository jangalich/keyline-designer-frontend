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

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** Where the environment keeps its Chromium. Not downloaded, not resolved. */
const CHROMIUM = '/opt/pw-browsers/chromium'

/** The stage these measurements are taken at. A desktop frame. */
const VIEWPORT = { width: 1280, height: 800 }

/** App.css's --measure, in px. The prose cap the instruction card takes. */
const READING_MEASURE = 680

/** App.css's --space-3, in px: the inset every region keeps from the edge. */
const INSET = 12

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
