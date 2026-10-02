/**
 * @vitest-environment node
 *
 * stepCardFit.browser.test.jsx
 *
 * EVERY STEP CARD ON A SHORT STAGE, on cards-harness.html. When the stage is
 * shorter than the card, the card meets its max-height and scrolls; the
 * diagram's frame must not be squeezed instead. It is a flex item with
 * overflow hidden -- minimum height 0 -- so without flex-shrink: 0 the column
 * crops the foot of the diagram, which is where the tab strip sits.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CHROMIUM = '/opt/pw-browsers/chromium'
const available = existsSync(CHROMIUM)
const describeIf = available ? describe : describe.skip
const SLOW = 120_000

const STEPS = ['boundary', 'landform', 'water', 'roads', 'trees', 'fencing']
const VIEWPORTS = [
  { width: 1280, height: 420 },
  { width: 380, height: 500 },
]

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

describeIf('the step cards, on a short stage', () => {
  it(
    'show the whole diagram on every page: the frame is never shorter than its drawing',
    async () => {
      const base = server.resolvedUrls.local[0].replace(/\/$/, '')
      for (const viewport of VIEWPORTS) {
        for (const step of STEPS) {
          const page = await browser.newPage({ viewport })
          await page.goto(`${base}/src/tutorial/cards-harness.html?step=${step}`, { waitUntil: 'load' })
          await page.waitForSelector('[data-testid="tutorial-step-card"]')
          await page.evaluate(() => document.fonts.ready)
          const pages = Math.max(1, await page.$$eval('.tutorial__dot', (dots) => dots.length))
          for (let n = 0; n < pages; n += 1) {
            if (n > 0) await page.click('[data-testid="tutorial-step-next"]')
            const read = await page.evaluate(() => {
              const figure = document.querySelector('.tutorial__figure')
              return {
                frame: figure.clientHeight,
                drawing: figure.querySelector('svg').getBoundingClientRect().height,
              }
            })
            expect(read.drawing, `${step} page ${n + 1} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(read.frame + 1)
          }
          await page.close()
        }
      }
    },
    SLOW
  )
})
