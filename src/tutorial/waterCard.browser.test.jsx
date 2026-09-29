/**
 * @vitest-environment node
 *
 * waterCard.browser.test.jsx
 *
 * THE WATER CARD IN A REAL ENGINE, on cards-harness.html: what jsdom cannot
 * answer because it applies no stylesheet and resolves no var().
 *
 *   - the tint fills in --survey-embankment; the dot field's dots fill in
 *     --survey-excavated while its shape fills with a pattern; each outline
 *     is its own token;
 *   - Block 1 is drawn quieter here than on the landform cards;
 *   - under reduced motion nothing runs, the cursor is gone, and the card
 *     rests on its finished frame;
 *   - at 380px nothing overflows, every tab label sits in its tab, and the
 *     two areas still overlap by more than a hairline on screen.
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

async function openHarness({ step = 'water', width = 1280, height = 860, reduced = false, page2 = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/src/tutorial/cards-harness.html?step=${step}`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="tutorial-step-card"]')
  if (page2) await page.click('[data-testid="tutorial-step-next"]')
  await page.evaluate(() => document.fonts.ready)
  return page
}

describeIf('the water card, in a real engine', () => {
  it(
    'fills the tint with --survey-embankment and the dot field with a pattern of --survey-excavated dots',
    async () => {
      const page = await openHarness()
      const read = await page.evaluate(() => {
        const token = (name) => {
          const probe = document.createElement('div')
          probe.style.color = `var(${name})`
          document.body.appendChild(probe)
          const value = getComputedStyle(probe).color
          probe.remove()
          return value
        }
        const svg = document.querySelector('.tutorial-anim--water')
        const tint = getComputedStyle(svg.querySelector('.farm-scene__survey--embankment'))
        const field = getComputedStyle(svg.querySelector('.farm-scene__survey--excavated'))
        const dot = getComputedStyle(svg.querySelector('.farm-scene__stipple-dot'))
        return {
          embankment: token('--survey-embankment'),
          excavated: token('--survey-excavated'),
          tint: { fill: tint.fill, stroke: tint.stroke },
          field: { fill: field.fill, stroke: field.stroke },
          dot: { fill: dot.fill, stroke: dot.stroke },
        }
      })
      expect(read.embankment).toBe('rgb(109, 164, 198)')
      expect(read.excavated).toBe('rgb(61, 90, 108)')
      expect(read.tint).toEqual({ fill: read.embankment, stroke: read.embankment })
      expect(read.field.fill).toMatch(/^url\("?#farm-stipple-/)
      expect(read.field.stroke).toBe(read.excavated)
      expect(read.dot).toEqual({ fill: read.excavated, stroke: 'none' })
      await page.close()
    },
    SLOW
  )

  it(
    'draws Block 1 quieter here than the landform cards draw it',
    async () => {
      const opacityOf = async (step) => {
        const page = await openHarness({ step, reduced: true })
        const value = await page.evaluate(() =>
          Number(getComputedStyle(document.querySelector('.tutorial-anim [data-layer="blocks"]')).opacity)
        )
        await page.close()
        return value
      }
      const water = await opacityOf('water')
      const landform = await opacityOf('landform')
      expect(landform).toBe(1)
      expect(water).toBeLessThan(landform)
    },
    SLOW
  )

  it(
    'runs nothing under reduced motion, and rests on the finished frame with no cursor',
    async () => {
      const page = await openHarness({ reduced: true })
      const read = await page.evaluate(() => {
        const svg = document.querySelector('.tutorial-anim--water')
        const opacity = (sel) => Number(getComputedStyle(svg.querySelector(sel)).opacity)
        return {
          running: svg.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).length,
          longestTransition: Math.max(
            0,
            ...svg
              .getAnimations({ subtree: true })
              .filter((a) => a instanceof CSSTransition)
              .map((a) => Number(a.effect.getTiming().duration))
          ),
          cursor: getComputedStyle(svg.querySelector('.tutorial-anim__cursor')).display,
          frame: {
            embankment: opacity('[data-layer="survey-embankment"]'),
            excavated: opacity('[data-layer="survey-excavated"]'),
            mark: opacity('.tutorial-anim__mark--water'),
            tabMark: opacity('.tutorial-anim__tab-mark--water'),
            panel: opacity('.tutorial-anim__panel--water'),
            row1: opacity('.tutorial-anim__reading--water-1'),
            row2: opacity('.tutorial-anim__reading--water-2'),
            excavatedTab: opacity('.tutorial-anim__tab--water-excavated'),
            excavatedTick: opacity('.tutorial-anim__tick--water-excavated'),
            embankmentTick: opacity('.tutorial-anim__tick--water-embankment'),
          },
        }
      })
      expect(read.running).toBe(0)
      expect(read.longestTransition).toBeLessThanOrEqual(0.01)
      expect(read.cursor).toBe('none')
      expect(read.frame).toEqual({
        embankment: 1,
        excavated: 0,
        mark: 1,
        tabMark: 1,
        panel: 1,
        row1: 1,
        row2: 1,
        excavatedTab: 0.45,
        excavatedTick: 0,
        embankmentTick: 1,
      })
      await page.close()
    },
    SLOW
  )

  it(
    'fits at 380px: no overflow, every tab label in its tab, and the two areas still overlap on screen',
    async () => {
      const page = await openHarness({ width: 380, height: 760 })
      const read = await page.evaluate(() => {
        const card = document.querySelector('.tutorial__card')
        const inside = (inner, outer) =>
          inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
        const tabs = [...document.querySelectorAll('.tutorial-anim__tab')].map((tab) =>
          inside(tab.querySelector('text').getBoundingClientRect(), tab.querySelector('.tutorial-anim__tab-card').getBoundingClientRect())
        )
        const panel = document.querySelector('.tutorial-anim__panel--water rect').getBoundingClientRect()
        const rows = [...document.querySelectorAll('.tutorial-anim__panel--water text')].map((t) => inside(t.getBoundingClientRect(), panel))
        const button = document.querySelector('.tutorial-anim__commit-button--water')
        const buttonFits = inside(button.querySelector('text').getBoundingClientRect(), button.querySelector('rect').getBoundingClientRect())
        // The shared ground, in CSS pixels: sample the excavated box on a
        // 1px grid and count the points inside both shapes.
        const svg = document.querySelector('.tutorial-anim--water')
        const emb = svg.querySelector('.farm-scene__survey--embankment')
        const exc = svg.querySelector('.farm-scene__survey--excavated')
        const scale = svg.getBoundingClientRect().width / 400
        let shared = 0
        const point = svg.createSVGPoint()
        const step = 1 / scale
        for (let x = 160; x < 230; x += step) {
          for (let y = 145; y < 210; y += step) {
            point.x = x
            point.y = y
            if (emb.isPointInFill(point) && exc.isPointInFill(point)) shared += 1
          }
        }
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardOverflow: card.scrollWidth - card.clientWidth,
          tabs,
          rows,
          buttonFits,
          scale,
          sharedPx: shared,
        }
      })
      expect(read.pageOverflow).toBe(0)
      expect(read.cardOverflow).toBe(0)
      expect(read.tabs).toEqual([true, true])
      for (const fits of read.rows) expect(fits).toBe(true)
      expect(read.buttonFits).toBe(true)
      // Several hundred square pixels of shared ground: an overlap, not a touch.
      expect(read.sharedPx).toBeGreaterThan(200)
      await page.close()
    },
    SLOW
  )
})
