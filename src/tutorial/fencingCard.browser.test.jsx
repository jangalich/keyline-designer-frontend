/**
 * @vitest-environment node
 *
 * fencingCard.browser.test.jsx
 *
 * THE FENCING CARD IN A REAL ENGINE, on cards-harness.html: what jsdom cannot
 * answer because it applies no stylesheet, resolves no var() and paints no
 * pixel.
 *
 *   - a fence line strokes in the ink the --fence token resolves to, at the
 *     row's weight and dash, and the layer paints nothing else;
 *   - THE REVEAL PAINTS NOTHING: before a fence is uncovered, the pixels where
 *     it will run -- over stock, the field wash, the hatches, the water area
 *     -- are exactly the pixels with no fence layer at all;
 *   - the visible dash pattern is static while a fence draws;
 *   - under reduced motion nothing runs, the cursor is gone, and the card
 *     rests with three fences and three ticked tabs;
 *   - at 380px nothing overflows, every label sits in its box, and the
 *     perimeter fence reads apart from the parcel boundary.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FENCES, PARCEL } from './farmScene.jsx'

const CHROMIUM = '/opt/pw-browsers/chromium'
const available = existsSync(CHROMIUM)
const describeIf = available ? describe : describe.skip
const SLOW = 60_000

let server = null
let browser = null

beforeAll(async () => {
  if (!available) return
  const { createServer } = await import('vite')
  const { chromium } = await import('playwright')
  server = await createServer({ server: { port: 0 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({ executablePath: CHROMIUM })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function openHarness({ width = 1280, height = 860, reduced = false, at = null, css = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const query = at == null ? '' : `&at=${at}`
  await page.goto(`${base}/src/tutorial/cards-harness.html?step=fencing${query}`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="tutorial-step-card"]')
  await page.evaluate(() => document.fonts.ready)
  if (css) await page.addStyleTag({ content: css })
  // Two frames, so a frozen frame and an added rule are both painted.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page
}

/** The diagram's pixels, as a PNG buffer. */
async function shot(page) {
  return page.locator('.tutorial-anim--fencing').screenshot({ animations: 'allow' })
}

const HIDE_FENCES = '[data-layer="fences"] { display: none !important; }'
const HIDE_PERIMETER = '.tutorial-anim__fence--boundary { display: none !important; }'

describeIf('the fencing card, in Chromium', () => {
  it('strokes each fence in the ink --fence resolves to, at the row’s weight and dash, and paints nothing else', async () => {
    const page = await openHarness()
    const read = await page.evaluate(() => {
      const svg = document.querySelector('.tutorial-anim--fencing')
      const probe = document.createElement('div')
      probe.style.color = 'var(--fence)'
      document.body.appendChild(probe)
      const fence = getComputedStyle(probe).color
      probe.style.color = 'var(--ink)'
      const ink = getComputedStyle(probe).color
      probe.remove()
      const layer = svg.querySelector('[data-layer="fences"]')
      const lines = [...layer.querySelectorAll('.farm-scene__fence')].map((el) => {
        const s = getComputedStyle(el)
        return { stroke: s.stroke, width: s.strokeWidth, dash: s.strokeDasharray, fill: s.fill, cap: s.strokeLinecap }
      })
      const painted = [...layer.querySelectorAll('*')].filter((el) => !el.closest('mask') && el.tagName !== 'defs')
      const mask = getComputedStyle(layer.querySelector('mask')).maskType
      return { fence, ink, lines, painted: painted.length, mask }
    })
    expect(read.fence).toBe(read.ink)
    expect(read.lines).toHaveLength(3)
    for (const line of read.lines) {
      expect(line).toEqual({ stroke: read.ink, width: '1.25px', dash: '8px, 5px', fill: 'none', cap: 'round' })
    }
    expect(read.painted).toBe(3)
    expect(read.mask).toBe('alpha')
    await page.close()
  }, SLOW)

  it('paints nothing over the map before a fence is uncovered: the pixels are the no-fence pixels', async () => {
    // AT THE OPEN: no fence drawn. The whole diagram matches one with no fence layer.
    const bare = await openHarness({ at: 0.02, css: HIDE_FENCES })
    const opening = await openHarness({ at: 0.02 })
    expect(Buffer.compare(await shot(opening), await shot(bare))).toBe(0)
    await bare.close()
    await opening.close()

    // AFTER THE PERIMETER, BEFORE THE WATER FENCE: with the one drawn line
    // taken out, the water and tree fences -- over the field wash, the
    // embankment's tint, the tree hatch and the tracks -- add not one pixel.
    const without = await openHarness({ at: 0.32, css: HIDE_FENCES })
    const waiting = await openHarness({ at: 0.32, css: HIDE_PERIMETER })
    expect(Buffer.compare(await shot(waiting), await shot(without))).toBe(0)
    // And the perimeter IS drawn at that frame: the frame differs with it in.
    const drawn = await openHarness({ at: 0.32 })
    expect(Buffer.compare(await shot(drawn), await shot(without))).not.toBe(0)
    await without.close()
    await waiting.close()
    await drawn.close()
  }, SLOW)

  it('uncovers the perimeter along its length while its dash pattern stays put', async () => {
    const offsets = []
    for (const at of [0.1, 0.18, 0.26]) {
      const page = await openHarness({ at })
      offsets.push(
        await page.evaluate(() => {
          const svg = document.querySelector('.tutorial-anim--fencing')
          const line = getComputedStyle(svg.querySelector('.tutorial-anim__fence--boundary'))
          const reveal = getComputedStyle(svg.querySelector('.tutorial-anim__fence-reveal--boundary'))
          return { line: [line.strokeDashoffset, line.strokeDasharray], reveal: Number.parseFloat(reveal.strokeDashoffset) }
        })
      )
      await page.close()
    }
    for (const { line } of offsets) expect(line).toEqual(['0px', '8px, 5px'])
    const reveals = offsets.map((o) => o.reveal)
    expect(reveals[0]).toBeGreaterThan(reveals[1])
    expect(reveals[1]).toBeGreaterThan(reveals[2])
    expect(reveals[0]).toBeLessThan(1)
    expect(reveals[2]).toBeGreaterThan(0)
  }, SLOW)

  it('under reduced motion runs nothing, hides the cursor, and rests with three fences and three ticked tabs', async () => {
    const page = await openHarness({ reduced: true })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const read = await page.evaluate(() => {
      const svg = document.querySelector('.tutorial-anim--fencing')
      const opacity = (el) => {
        let value = 1
        for (let node = el; node && node !== svg; node = node.parentElement) value *= Number(getComputedStyle(node).opacity)
        return value
      }
      return {
        running: svg.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).length,
        cursor: getComputedStyle(svg.querySelector('.tutorial-anim__cursor')).display,
        reveals: [...svg.querySelectorAll('.farm-scene__fence-reveal')].map((el) => getComputedStyle(el).strokeDashoffset),
        fences: [...svg.querySelectorAll('.farm-scene__fence')].map(opacity),
        tabs: [...svg.querySelectorAll('.tutorial-anim__tab')].map((tab) => [
          tab.querySelector('text').textContent,
          opacity(tab),
          opacity(tab.querySelector('.tutorial-anim__tick')),
        ]),
        body: document.querySelector('[data-testid="tutorial-step-body"]').textContent,
      }
    })
    expect(read.running).toBe(0)
    expect(read.cursor).toBe('none')
    expect(read.reveals).toEqual(['0px', '0px', '0px'])
    expect(read.fences).toEqual([1, 1, 1])
    expect(read.tabs).toEqual([
      ['Boundary fencing', 1, 1],
      ['Water area fencing', 1, 1],
      ['Tree zone fencing', 1, 1],
    ])
    expect(read.body).toContain('Recommended to commit all three types.')
    // And the fences are really on the pixels: the frame differs from one without them.
    const bare = await openHarness({ reduced: true, css: HIDE_FENCES })
    expect(Buffer.compare(await shot(page), await shot(bare))).not.toBe(0)
    await bare.close()
    await page.close()
  }, SLOW)

  it('fits at 380px: nothing overflows, every label sits in its box, the perimeter reads apart from the boundary', async () => {
    const page = await openHarness({ width: 380, height: 820 })
    const read = await page.evaluate(() => {
      const svg = document.querySelector('.tutorial-anim--fencing')
      const card = document.querySelector('[data-testid="tutorial-step-card"]').getBoundingClientRect()
      const inside = (inner, outer) =>
        inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
      const labels = [...svg.querySelectorAll('.tutorial-anim__tab')].map((tab) =>
        inside(tab.querySelector('text').getBoundingClientRect(), tab.querySelector('.tutorial-anim__tab-card').getBoundingClientRect())
      )
      const button = svg.querySelector('.tutorial-anim__commit-button')
      const commit = inside(button.querySelector('text').getBoundingClientRect(), button.querySelector('rect').getBoundingClientRect())
      const box = svg.getBoundingClientRect()
      const parcel = getComputedStyle(svg.querySelector('.farm-scene__parcel')).strokeWidth
      const fence = getComputedStyle(svg.querySelector('.farm-scene__fence')).strokeWidth
      const nameSize = Number.parseFloat(getComputedStyle(svg.querySelector('.tutorial-anim__name')).fontSize)
      return {
        scroll: document.documentElement.scrollWidth,
        card: [card.left, card.right],
        svg: [box.left, box.right, box.width],
        labels,
        commit,
        parcel: Number.parseFloat(parcel),
        fence: Number.parseFloat(fence),
        nameSize,
      }
    })
    expect(read.scroll).toBeLessThanOrEqual(380)
    expect(read.card[0]).toBeGreaterThanOrEqual(0)
    expect(read.card[1]).toBeLessThanOrEqual(380)
    expect(read.labels).toEqual([true, true, true])
    expect(read.commit).toBe(true)
    // THE GAP, in device-independent pixels at this width: the nearest the
    // perimeter comes to the boundary, centre to centre, less half of each
    // line's width, has to leave clear ground between the two lines.
    const scale = read.svg[2] / 400
    let nearest = Infinity
    const perimeter = FENCES.find((fence) => fence.id === 'boundary').d.match(/-?\d+(\.\d+)?/g).map(Number)
    const corners = []
    for (let i = 0; i < perimeter.length; i += 2) corners.push([perimeter[i], perimeter[i + 1]])
    for (let i = 0; i < corners.length; i++) {
      const [ax, ay] = corners[i]
      const [bx, by] = corners[(i + 1) % corners.length]
      for (let k = 0; k <= 50; k++) {
        const x = ax + ((bx - ax) * k) / 50
        const y = ay + ((by - ay) * k) / 50
        for (let j = 0; j < PARCEL.length; j++) {
          const p = PARCEL[j]
          const q = PARCEL[(j + 1) % PARCEL.length]
          const dx = q.x - p.x
          const dy = q.y - p.y
          const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy)))
          nearest = Math.min(nearest, Math.hypot(x - p.x - t * dx, y - p.y - t * dy))
        }
      }
    }
    const clear = nearest * scale - ((read.parcel + read.fence) / 2) * scale
    expect(clear, `clear ground between fence and boundary: ${clear.toFixed(2)}px`).toBeGreaterThanOrEqual(1.5)
    // NEITHER LINE WAS THICKENED to buy the gap.
    expect(read.fence).toBe(1.25)
    expect(read.parcel).toBe(2)
    // Type still sets at about 8px or more on the narrowest card.
    expect(read.nameSize * scale).toBeGreaterThanOrEqual(8)
    await page.close()
  }, SLOW)
})
