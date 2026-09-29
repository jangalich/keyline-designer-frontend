/**
 * @vitest-environment node
 *
 * roadsCard.browser.test.jsx
 *
 * THE ROADS CARD IN A REAL ENGINE, on cards-harness.html: what jsdom cannot
 * answer because it applies no stylesheet and resolves no var().
 *
 *   - a track strokes in --road with nothing under it; a generated marker
 *     fills --ochre in a --halo ring, a pending one paper in dashed ochre;
 *   - frozen at the loop's moments, the engine draws what the selection model
 *     says: both markers always, only the focused network's lines, the tick
 *     on the focused tab;
 *   - under reduced motion nothing runs, the cursor is gone, and the card
 *     rests on its finished frame;
 *   - at 380px nothing overflows, every label sits in its box, the two
 *     markers are told apart on the boundary, and no track runs through the
 *     block or the water area.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

async function openHarness({ width = 1280, height = 860, reduced = false, at = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const query = at == null ? '' : `&at=${at}`
  await page.goto(`${base}/src/tutorial/cards-harness.html?step=roads${query}`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="tutorial-step-card"]')
  await page.evaluate(() => document.fonts.ready)
  return page
}

/** What the engine is drawing, as the selection model names it. */
function readFrame() {
  const svg = document.querySelector('.tutorial-anim--roads')
  const opacity = (el) => {
    let value = 1
    for (let node = el; node && node !== svg; node = node.parentElement) {
      value *= Number(getComputedStyle(node).opacity)
    }
    return value
  }
  const on = (sel) => opacity(svg.querySelector(sel)) > 0
  const ids = ['1', '2']
  return {
    markers: ids.filter((id) => on(`[data-layer="access-points"] [data-point="${id}"]`)),
    pending: ids.filter((id) => on(`[data-layer="access-points-pending"] [data-point="${id}"]`)),
    networks: ids.filter((id) => on(`[data-layer="tracks"] [data-network="${id}"]`)),
    ringed: ids.filter((id) => on(`.tutorial-anim__mark--roads-${id}`)),
    ticked: ids.filter((id) => on(`.tutorial-anim__tick--roads-${id}`)),
    tabs: ids.filter((id) => on(`.tutorial-anim__tab--roads-${id}`)),
    banner: ['idle', 'armed', 'generating', 'reviewing'].filter((b) => on(`[data-banner="${b}"]`)),
  }
}

describeIf('the roads card, in a real engine', () => {
  it(
    'strokes a track in --road with no casing, and draws each marker state in its tokens',
    async () => {
      const page = await openHarness({ reduced: true })
      const read = await page.evaluate(() => {
        const token = (name) => {
          const probe = document.createElement('div')
          probe.style.color = `var(${name})`
          document.body.appendChild(probe)
          const value = getComputedStyle(probe).color
          probe.remove()
          return value
        }
        const svg = document.querySelector('.tutorial-anim--roads')
        const style = (sel) => getComputedStyle(svg.querySelector(sel))
        const track = style('.farm-scene__track')
        const generated = style('.farm-scene__access-point--generated')
        const pending = style('.farm-scene__access-point--pending')
        return {
          road: token('--road'),
          ink: token('--ink'),
          ochre: token('--ochre'),
          halo: token('--halo'),
          paper: token('--paper'),
          track: { stroke: track.stroke, fill: track.fill },
          paths: svg.querySelectorAll('[data-layer="tracks"] [data-network="1"] path').length,
          generated: { fill: generated.fill, stroke: generated.stroke },
          pending: { fill: pending.fill, stroke: pending.stroke, dash: pending.strokeDasharray },
        }
      })
      expect(read.road).toBe(read.ink)
      expect(read.track).toEqual({ stroke: read.road, fill: 'none' })
      expect(read.paths).toBe(2)
      expect(read.generated).toEqual({ fill: read.ochre, stroke: read.halo })
      expect(read.pending.fill).toBe(read.paper)
      expect(read.pending.stroke).toBe(read.ochre)
      expect(read.pending.dash).not.toBe('none')
      await page.close()
    },
    SLOW
  )

  it(
    'draws what the selection model says at every moment of the loop',
    async () => {
      const frames = {}
      for (const at of [0.05, 0.14, 0.2, 0.36, 0.44, 0.5, 0.66, 0.76, 0.9]) {
        const page = await openHarness({ at })
        frames[at] = await page.evaluate(readFrame)
        await page.close()
      }
      // Nothing placed; one button.
      expect(frames[0.05]).toEqual({ markers: [], pending: [], networks: [], ringed: [], ticked: [], tabs: [], banner: ['idle'] })
      // Armed, nothing placed yet.
      expect(frames[0.14]).toMatchObject({ markers: [], pending: [], banner: ['armed'] })
      // The first point placed, pending.
      expect(frames[0.2]).toMatchObject({ markers: [], pending: ['1'], networks: [], banner: ['armed'] })
      // Network 1 generated: focused, drawn, ticked.
      expect(frames[0.36]).toEqual({
        markers: ['1'], pending: [], networks: ['1'], ringed: ['1'], ticked: ['1'], tabs: ['1'], banner: ['reviewing'],
      })
      // Armed again: the blur takes network 1 off the map and its tick with it; its marker stays.
      expect(frames[0.44]).toEqual({
        markers: ['1'], pending: [], networks: [], ringed: [], ticked: [], tabs: ['1'], banner: ['armed'],
      })
      expect(frames[0.5]).toMatchObject({ markers: ['1'], pending: ['2'], networks: [], ticked: [] })
      // THE SPEC'S FRAME: both markers, network 2 focused, network 1's lines absent.
      expect(frames[0.66]).toEqual({
        markers: ['1', '2'], pending: [], networks: ['2'], ringed: ['2'], ticked: ['2'], tabs: ['1', '2'], banner: ['reviewing'],
      })
      // Network 1's tab clicked: the lines, the ring and the tick move together.
      for (const at of [0.76, 0.9]) {
        expect(frames[at]).toEqual({
          markers: ['1', '2'], pending: [], networks: ['1'], ringed: ['1'], ticked: ['1'], tabs: ['1', '2'], banner: ['reviewing'],
        })
      }
    },
    SLOW * 3
  )

  it(
    'runs nothing under reduced motion, and rests on the finished frame with no cursor',
    async () => {
      const page = await openHarness({ reduced: true })
      const read = await page.evaluate(() => {
        const svg = document.querySelector('.tutorial-anim--roads')
        return {
          running: svg.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).length,
          cursor: getComputedStyle(svg.querySelector('.tutorial-anim__cursor')).display,
          tab2: Number(getComputedStyle(svg.querySelector('.tutorial-anim__tab--roads-2')).opacity),
          offsets: [...svg.querySelectorAll('[data-layer="tracks"] [data-network="1"] path')].map((p) => getComputedStyle(p).strokeDashoffset),
        }
      })
      const frame = await page.evaluate(readFrame)
      expect(read.running).toBe(0)
      expect(read.cursor).toBe('none')
      expect(frame).toEqual({
        markers: ['1', '2'], pending: [], networks: ['1'], ringed: ['1'], ticked: ['1'], tabs: ['1', '2'], banner: ['reviewing'],
      })
      expect(read.tab2).toBe(0.55)
      // Network 1 is drawn whole.
      expect(read.offsets).toEqual(['0px', '0px'])
      await page.close()
    },
    SLOW
  )

  it(
    'fits at 380px: no overflow, every label in its box, the markers apart, and no track through the block or the water',
    async () => {
      const page = await openHarness({ width: 380, height: 760, reduced: true })
      const read = await page.evaluate(() => {
        const card = document.querySelector('.tutorial__card')
        const inside = (inner, outer) =>
          inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
        const svg = document.querySelector('.tutorial-anim--roads')
        const tabs = [...svg.querySelectorAll('.tutorial-anim__tab')].map((tab) =>
          inside(tab.querySelector('text').getBoundingClientRect(), tab.querySelector('.tutorial-anim__tab-card').getBoundingClientRect())
        )
        const buttons = [...svg.querySelectorAll('.tutorial-anim__commit-button, .tutorial-anim__draw-button')].map((b) =>
          inside(b.querySelector(':scope > text').getBoundingClientRect(), b.querySelector(':scope > rect').getBoundingClientRect())
        )
        const circles = [...svg.querySelectorAll('[data-layer="access-points"] circle')]
        const [m1, m2] = circles.map((c) => c.getBoundingClientRect())
        // The marker as drawn: its fill box and the ring stroked around it.
        const scale = svg.getBoundingClientRect().width / 400
        const ring = parseFloat(getComputedStyle(circles[0]).strokeWidth) * scale
        const marker = m1.width + ring
        const gap = m2.left - m1.right - ring
        // Every track, sampled along its length, against the settled shapes.
        const block = svg.querySelector('.farm-scene__block-base')
        const water = svg.querySelector('.farm-scene__survey--embankment')
        const point = svg.createSVGPoint()
        const crossings = []
        for (const path of svg.querySelectorAll('.farm-scene__track')) {
          const length = path.getTotalLength()
          for (let s = 0; s <= length; s += 0.5) {
            const p = path.getPointAtLength(s)
            point.x = p.x
            point.y = p.y
            if (block.isPointInFill(point) || water.isPointInFill(point)) crossings.push([p.x, p.y])
          }
        }
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardOverflow: card.scrollWidth - card.clientWidth,
          tabs,
          buttons,
          marker,
          gap,
          crossings,
        }
      })
      expect(read.pageOverflow).toBe(0)
      expect(read.cardOverflow).toBe(0)
      expect(read.tabs).toEqual([true, true])
      expect(read.buttons.length).toBeGreaterThanOrEqual(5)
      for (const fits of read.buttons) expect(fits).toBe(true)
      // A marker is a dot a person can see, and the two are far apart.
      expect(read.marker).toBeGreaterThanOrEqual(9)
      expect(read.gap).toBeGreaterThan(40)
      expect(read.crossings).toEqual([])
      await page.close()
    },
    SLOW
  )
})
