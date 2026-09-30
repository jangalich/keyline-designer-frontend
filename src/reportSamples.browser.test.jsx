/**
 * @vitest-environment node
 *
 * reportSamples.browser.test.jsx
 *
 * THE MAXIMISED PAGE'S GEOMETRY, IN A REAL ENGINE: what jsdom cannot answer
 * because it lays nothing out.
 *
 * The maximised view is the point of the feature, and its two claims are
 * both widths:
 *
 *   AT 390px IT IS A FULL-WIDTH RENDER THAT SCROLLS. The page is no wider
 *   than the screen, nothing scrolls sideways, and the panel scrolls
 *   vertically for the rest of the page.
 *
 *   AT DESKTOP WIDTH IT IS LEGIBLE. The water page's table figures are
 *   8.75pt in the PDF, the smallest type on the three pages that has to be
 *   read, and they render at 11px only when the page is at least 768px wide
 *   on screen. So on a 1440 × 900 screen -- where fitting the page to the
 *   height would leave it about 620px wide -- the page holds 768px and the
 *   panel scrolls, rather than shrinking to fit.
 *
 * And the slots themselves: the thumbnail rather than the full render is
 * what they load, and at 390px they stack one under another, in the
 * stylesheet's existing narrow-screen rule for the row.
 *
 * The app is index.html as served by Vite. The map's tiles are stubbed; the
 * section is below the map and nothing here touches the wizard. Set
 * KD_SCREENSHOTS to a directory to write a screenshot of each case there.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CHROMIUM = '/opt/pw-browsers/chromium'
const available = existsSync(CHROMIUM)
const describeIf = available ? describe : describe.skip
const SLOW = 60_000

/** App.css's floor on the maximised page's width, in px: 48rem. */
const LEGIBLE_WIDTH = 768

/** US Letter, as the render is: 1275 × 1650. */
const LETTER = 1275 / 1650

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

/** The page, scrolled to the report section, with the report assets' requests recorded. */
async function openSection(viewport) {
  const page = await browser.newPage({ viewport })
  const loaded = []
  page.on('response', (response) => {
    const url = response.url()
    // Image fetches only. In dev, Vite also serves each asset's URL as a
    // module (`?import`) when ReportSamples.jsx loads; that is the path
    // string, not the picture.
    if (url.includes('/assets/report/') && response.request().resourceType() === 'image') {
      loaded.push(url.slice(url.lastIndexOf('/') + 1))
    }
  })
  // No imagery: the tiles are not what is being measured.
  await page.route(/arcgisonline\.com/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.addInitScript(() => {
    localStorage.setItem('kd.tutorial.seen', JSON.stringify(['orientation', 'boundary']))
  })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.sample-row').scrollIntoViewIfNeeded()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.sample__thumb')].every((img) => img.complete && img.naturalWidth > 0)
  )
  return { page, loaded }
}

/** Open one page's maximised view and wait for its render to arrive. */
async function maximise(page, id) {
  await page.click(`[data-testid="sample-open-${id}"]`)
  await page.waitForSelector('[data-testid="sample-view"]')
  await page.waitForFunction(() => {
    const img = document.querySelector('.sample-view__page')
    return img && img.complete && img.naturalWidth > 0
  })
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
    }
    const scroll = document.querySelector('.sample-view__scroll')
    return {
      img: box(document.querySelector('.sample-view__page')),
      panel: box(document.querySelector('.sample-view__panel')),
      scrollsVertically: scroll.scrollHeight > scroll.clientHeight,
      scrollsSideways: scroll.scrollWidth > scroll.clientWidth,
      pageScrollsSideways: document.documentElement.scrollWidth > innerWidth,
      focusedIsScroller: document.activeElement === scroll,
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
}

describeIf('the sample pages, in the shipped app', () => {
  it(
    'at 390px: the thumbnails stack, and a maximised page is full-width with no sideways scroll',
    async () => {
      const { page, loaded } = await openSection({ width: 390, height: 844 })
      const row = await page.evaluate(() => {
        const thumbs = [...document.querySelectorAll('.sample__thumb')].map((img) => img.getBoundingClientRect())
        return {
          tops: thumbs.map((t) => Math.round(t.top)),
          widths: thumbs.map((t) => t.width),
          sideways: document.documentElement.scrollWidth > innerWidth,
        }
      })
      // Stacked: three different tops, each the section's full measure, no sideways scroll.
      expect(new Set(row.tops).size, JSON.stringify(row)).toBe(3)
      for (const width of row.widths) expect(width).toBeGreaterThan(300)
      expect(row.sideways).toBe(false)
      // The row loads the thumbnails and only the thumbnails.
      expect(loaded.filter((f) => f.includes('-thumb'))).toHaveLength(3)
      expect(loaded.filter((f) => !f.includes('-thumb'))).toHaveLength(0)

      const m = await maximise(page, 'water')
      if (process.env.KD_SCREENSHOTS) {
        await page.screenshot({ path: path.join(process.env.KD_SCREENSHOTS, 'sample-water-390.png') })
      }
      expect(m.focusedIsScroller).toBe(true)
      // Full width: the page fills the panel, and the panel the screen less its gutter.
      expect(m.img.width).toBeLessThanOrEqual(m.viewport.width)
      expect(m.img.width).toBeGreaterThan(m.viewport.width * 0.9)
      expect(m.img.left).toBeGreaterThanOrEqual(0)
      expect(m.img.right).toBeLessThanOrEqual(m.viewport.width)
      expect(m.img.width / m.img.height).toBeCloseTo(LETTER, 2)
      // Nothing scrolls sideways -- not the panel, not the page under it. (A
      // Letter page at 358px is 463px tall, so on this screen it happens to
      // fit without scrolling down; the type is for pinch zoom at that size.)
      expect(m.scrollsSideways).toBe(false)
      expect(m.pageScrollsSideways).toBe(false)
      expect(m.panel.bottom).toBeLessThanOrEqual(m.viewport.height)
      // Now the full render has loaded, and only this one.
      expect(loaded.filter((f) => !f.includes('-thumb'))).toEqual(['page-11-water.webp'])
      await page.close()
    },
    SLOW
  )

  it(
    'at 1440 × 900: the page holds the legible width and scrolls, rather than shrinking to fit',
    async () => {
      const { page } = await openSection({ width: 1440, height: 900 })
      for (const id of ['climate', 'water', 'layout']) {
        const m = await maximise(page, id)
        if (process.env.KD_SCREENSHOTS) {
          await page.screenshot({ path: path.join(process.env.KD_SCREENSHOTS, `sample-${id}-1440.png`) })
        }
        // At least the legibility floor wide, at Letter's ratio, inside the screen.
        expect(m.img.width, id).toBeGreaterThanOrEqual(LEGIBLE_WIDTH - 2)
        expect(m.img.width / m.img.height).toBeCloseTo(LETTER, 2)
        expect(m.panel.left).toBeGreaterThanOrEqual(0)
        expect(m.panel.right).toBeLessThanOrEqual(m.viewport.width)
        expect(m.panel.top).toBeGreaterThanOrEqual(0)
        expect(m.panel.bottom).toBeLessThanOrEqual(m.viewport.height)
        // 768 wide is 994 tall, which a 900 screen cannot show at once: the panel scrolls.
        expect(m.scrollsVertically).toBe(true)
        expect(m.scrollsSideways).toBe(false)
        // Escape closes it and the thumbnail has focus again.
        await page.keyboard.press('Escape')
        await page.waitForSelector('[data-testid="sample-view"]', { state: 'detached' })
        const focused = await page.evaluate(() => document.activeElement?.dataset.testid)
        expect(focused).toBe(`sample-open-${id}`)
      }
      await page.close()
    },
    SLOW
  )
})
