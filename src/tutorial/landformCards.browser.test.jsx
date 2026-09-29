/**
 * @vitest-environment node
 *
 * landformCards.browser.test.jsx
 *
 * THE LANDFORM CARDS IN A REAL ENGINE, on cards-harness.html: what jsdom
 * cannot answer because it applies no stylesheet and resolves no var().
 *
 *   - the hatch rule's stroke resolves to the oxide token;
 *   - under reduced motion nothing runs, the cursor is gone, and each card
 *     rests on its finished frame;
 *   - at 380px nothing overflows and every tab label sits inside its tab.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives: Vite's dev server
 * loads esbuild, which refuses jsdom's TextEncoder. Skipped where there is
 * no Chromium.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* ===========================================================================
   In a real engine
   =========================================================================== */

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

async function openHarness({ width = 1280, height = 860, reduced = false, page2 = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/src/tutorial/cards-harness.html?step=landform`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="tutorial-step-card"]')
  if (page2) await page.click('[data-testid="tutorial-step-next"]')
  await page.evaluate(() => document.fonts.ready)
  return page
}

describeIf('the landform cards, in a real engine', () => {
  it(
    "resolves the hatch rule's stroke to the oxide token",
    async () => {
      const page = await openHarness()
      const read = await page.evaluate(() => {
        const line = document.querySelector('.farm-scene__hatch-line')
        const probe = document.createElement('div')
        probe.style.color = 'var(--oxide)'
        document.body.appendChild(probe)
        return { stroke: getComputedStyle(line).stroke, oxide: getComputedStyle(probe).color }
      })
      expect(read.stroke).toBe(read.oxide)
      expect(read.oxide).toBe('rgb(156, 74, 47)')
      await page.close()
    },
    SLOW
  )

  it(
    'runs nothing under reduced motion, and rests on each finished frame with no cursor',
    async () => {
      for (const page2 of [false, true]) {
        const page = await openHarness({ reduced: true, page2 })
        const read = await page.evaluate(() => {
          const svg = document.querySelector('.tutorial-anim--landform')
          const opacity = (sel) => Number(getComputedStyle(svg.querySelector(sel)).opacity)
          return {
            // The cards' timelines are CSS animations. A CSS transition can
            // also be in flight for a frame after load, collapsed to 0.01ms by
            // the foundation's reduced-motion rule (index.css): not motion,
            // but held to that ceiling below.
            running: svg.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).length,
            longestTransition: Math.max(
              0,
              ...svg
                .getAnimations({ subtree: true })
                .filter((a) => a instanceof CSSTransition)
                .map((a) => Number(a.effect.getTiming().duration))
            ),
            cursor: getComputedStyle(svg.querySelector('.tutorial-anim__cursor')).display,
            read: svg.classList.contains('tutorial-anim--landform-read')
              ? {
                  mark3: opacity('.tutorial-anim__mark--landform-3'),
                  mark1: opacity('.tutorial-anim__mark--landform-1'),
                  panel: opacity('.tutorial-anim__panel--landform'),
                  body3: opacity('.tutorial-anim__panel-body--3'),
                  body1: opacity('.tutorial-anim__panel-body--1'),
                }
              : null,
            set: svg.classList.contains('tutorial-anim--landform-set')
              ? {
                  drawn: opacity('.tutorial-anim__drawn'),
                  block2: opacity(".farm-scene__block[data-block='2']"),
                  total: [...svg.querySelectorAll('.tutorial-anim__total')]
                    .filter((t) => Number(getComputedStyle(t).opacity) > 0)
                    .map((t) => t.textContent),
                }
              : null,
          }
        })
        expect(read.running, `page ${page2 ? 2 : 1}`).toBe(0)
        expect(read.longestTransition).toBeLessThanOrEqual(0.01)
        expect(read.cursor).toBe('none')
        if (!page2) expect(read.read).toEqual({ mark3: 1, mark1: 0, panel: 1, body3: 1, body1: 0 })
        else expect(read.set).toEqual({ drawn: 1, block2: 0, total: ['3 blocks · 7.4 ac'] })
        await page.close()
      }
    },
    SLOW
  )

  it(
    'fits at 380px: no page overflow, and every tab label and the total inside its box',
    async () => {
      for (const page2 of [false, true]) {
        const page = await openHarness({ width: 380, height: 760, page2 })
        const read = await page.evaluate(() => {
          const card = document.querySelector('.tutorial__card')
          const figure = document.querySelector('.tutorial__figure').getBoundingClientRect()
          const inside = (inner, outer) =>
            inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
          const tabs = [...document.querySelectorAll('.tutorial-anim__tab')].map((tab) => ({
            fits: inside(tab.querySelector('text').getBoundingClientRect(), tab.querySelector('.tutorial-anim__tab-card').getBoundingClientRect()),
          }))
          const totals = [...document.querySelectorAll('.tutorial-anim__total')].map((t) => inside(t.getBoundingClientRect(), figure))
          return {
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            cardOverflow: card.scrollWidth - card.clientWidth,
            tabs,
            totals,
          }
        })
        expect(read.pageOverflow).toBe(0)
        expect(read.cardOverflow).toBe(0)
        expect(read.tabs.length).toBeGreaterThan(0)
        for (const tab of read.tabs) expect(tab.fits).toBe(true)
        for (const fits of read.totals) expect(fits).toBe(true)
        await page.close()
      }
    },
    SLOW
  )
})
