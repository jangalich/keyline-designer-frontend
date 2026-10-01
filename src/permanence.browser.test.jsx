/**
 * @vitest-environment node
 *
 * permanence.browser.test.jsx
 *
 * THE SCALE OF PERMANENCE LADDER IN A REAL ENGINE: what jsdom cannot answer
 * because it lays nothing out and synthesises no key presses.
 *
 *   THE TINT COLUMN STAYS EVEN WITH RUNGS OPEN. The tint is the header row's
 *   height, so opening three rungs grows the rungs and not their tints: every
 *   tint matches its own header, and the tints match each other.
 *
 *   THE KEYBOARD PATH. Tab reaches all eight rungs in order; Enter and Space
 *   both toggle the one with focus; focus shows a ring.
 *
 *   AT 390px IT IS ONE COLUMN with nothing scrolling sideways.
 *
 * The app is index.html as served by Vite, map tiles stubbed. Set
 * KD_SCREENSHOTS to a directory to write a screenshot of each state there.
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

const IDS = ['climate', 'landform', 'water', 'access', 'trees', 'buildings', 'fencing', 'soil']

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

async function openSection(viewport) {
  const page = await browser.newPage({ viewport })
  await page.route(/arcgisonline\.com/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.addInitScript(() => {
    localStorage.setItem('kd.tutorial.seen', JSON.stringify(['orientation', 'boundary']))
  })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.locator('[data-testid="permanence"]').scrollIntoViewIfNeeded()
  return page
}

/** The whole section -- heading, lede and ladder -- for a screenshot. */
async function shoot(page, name) {
  if (!process.env.KD_SCREENSHOTS) return
  const section = page.locator('section', { has: page.locator('[data-testid="permanence"]') })
  await section.screenshot({ path: path.join(process.env.KD_SCREENSHOTS, `${name}.png`) })
}

function measure(page) {
  return page.evaluate((ids) => {
    const box = (el) => el.getBoundingClientRect()
    return {
      rungs: ids.map((id) => {
        const toggle = document.querySelector(`[data-testid="rung-toggle-${id}"]`)
        const tint = document.querySelector(`[data-testid="rung-tint-${id}"]`)
        const rung = document.querySelector(`[data-testid="rung-${id}"]`)
        const body = document.querySelector(`[data-testid="rung-body-${id}"]`)
        return {
          id,
          open: toggle.getAttribute('aria-expanded') === 'true',
          head: box(toggle).height,
          tint: box(tint).height,
          tintTop: box(tint).top,
          headTop: box(toggle).top,
          rung: box(rung).height,
          bodyLeft: box(body.querySelector('p')).left,
          tintRight: box(tint).right,
          opacity: Number(getComputedStyle(tint).opacity),
          tintColour: getComputedStyle(tint).backgroundColor,
        }
      }),
      sideways: document.documentElement.scrollWidth > innerWidth,
    }
  }, IDS)
}

describeIf('the Scale of Permanence, in the shipped app', () => {
  it(
    'loads with Climate open, and keeps the tint column even with three rungs open',
    async () => {
      const page = await openSection({ width: 1440, height: 900 })
      await shoot(page, 'permanence-loaded')
      const loaded = await measure(page)
      expect(loaded.rungs.filter((r) => r.open).map((r) => r.id)).toEqual(['climate'])
      // --terrain, resolved.
      expect(loaded.rungs[0].tintColour).toBe('rgb(122, 92, 58)')

      // All closed.
      await page.click('[data-testid="rung-toggle-climate"]')
      await shoot(page, 'permanence-collapsed')
      const closed = await measure(page)
      expect(closed.rungs.every((r) => !r.open)).toBe(true)
      // A closed rung is its hairline and its header and nothing else: no
      // band under the tint.
      for (const r of closed.rungs) expect(Math.abs(r.rung - 1 - r.head), r.id).toBeLessThan(0.5)

      // Three open: one at the top, one in the middle, one at the bottom.
      for (const id of ['climate', 'trees', 'soil']) await page.click(`[data-testid="rung-toggle-${id}"]`)
      await page.mouse.move(0, 0)
      await shoot(page, 'permanence-three-open')
      const three = await measure(page)
      expect(three.rungs.filter((r) => r.open).map((r) => r.id)).toEqual(['climate', 'trees', 'soil'])

      for (const [i, r] of three.rungs.entries()) {
        // The tint is its header row, top to bottom, and no more.
        expect(Math.abs(r.tint - r.head), r.id).toBeLessThan(0.5)
        expect(Math.abs(r.tintTop - r.headTop), r.id).toBeLessThan(0.5)
        // An open rung grew; its tint did not.
        expect(Math.abs(r.tint - closed.rungs[i].tint), r.id).toBeLessThan(0.5)
        if (r.open) expect(r.rung, r.id).toBeGreaterThan(r.head + 40)
        // The paragraph sits clear of the tint column.
        expect(r.bodyLeft, r.id).toBeGreaterThan(r.tintRight)
      }
      // Even: the eight tints are one height, within a pixel, at this width.
      const heights = three.rungs.map((r) => r.tint)
      expect(Math.max(...heights) - Math.min(...heights), JSON.stringify(heights)).toBeLessThan(1)
      // And the gradient steps down monotonically.
      const opacities = three.rungs.map((r) => r.opacity)
      for (let i = 1; i < opacities.length; i += 1) expect(opacities[i]).toBeLessThan(opacities[i - 1])
      await page.close()
    },
    SLOW
  )

  it(
    'takes the keyboard through all eight rungs, Enter and Space both toggling',
    async () => {
      const page = await openSection({ width: 1440, height: 900 })
      await page.focus('[data-testid="rung-toggle-climate"]')
      const visited = []
      for (const [i, id] of IDS.entries()) {
        if (i > 0) await page.keyboard.press('Tab')
        const state = await page.evaluate(() => {
          const el = document.activeElement
          return {
            id: el.dataset.testid,
            expanded: el.getAttribute('aria-expanded'),
            ring: getComputedStyle(el).outlineStyle,
            ringWidth: getComputedStyle(el).outlineWidth,
          }
        })
        visited.push(state.id)
        expect(state.ring, id).toBe('solid')
        expect(state.ringWidth, id).toBe('2px')
        const before = state.expanded
        // Enter toggles it one way, Space toggles it back.
        await page.keyboard.press('Enter')
        const afterEnter = await page.getAttribute(`[data-testid="rung-toggle-${id}"]`, 'aria-expanded')
        expect(afterEnter, id).toBe(before === 'true' ? 'false' : 'true')
        await page.keyboard.press(' ')
        const afterSpace = await page.getAttribute(`[data-testid="rung-toggle-${id}"]`, 'aria-expanded')
        expect(afterSpace, id).toBe(before)
      }
      expect(visited).toEqual(IDS.map((id) => `rung-toggle-${id}`))
      await page.close()
    },
    SLOW
  )

  it(
    'at 390px: one column, nothing sideways, and the tints still their header rows',
    async () => {
      const page = await openSection({ width: 390, height: 844 })
      await shoot(page, 'permanence-390')
      const m = await measure(page)
      expect(m.sideways).toBe(false)
      for (const r of m.rungs) {
        expect(Math.abs(r.tint - r.head), r.id).toBeLessThan(0.5)
        expect(r.bodyLeft, r.id).toBeGreaterThan(r.tintRight)
      }
      if (process.env.KD_SCREENSHOTS) {
        for (const id of ['trees', 'soil']) await page.click(`[data-testid="rung-toggle-${id}"]`)
        await page.mouse.move(0, 0)
        await shoot(page, 'permanence-390-three-open')
      }
      await page.close()
    },
    SLOW
  )
})
