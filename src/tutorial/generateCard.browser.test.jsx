/**
 * @vitest-environment node
 *
 * generateCard.browser.test.jsx
 *
 * A STEP'S CARD OPEN DURING ITS GENERATE, IN THE SHIPPED APP, IN A REAL
 * ENGINE: what jsdom cannot answer because it lays nothing out.
 *
 * The card opens on the generate press, into a wait of thirty to sixty
 * seconds whose only evidence that the app has not stopped is the waiting
 * line in the instruction bar. So, at 380px and at desktop width:
 *
 *   - the card's box and the instruction bar's box do not intersect;
 *   - the waiting line is on screen, and the topmost element at its centre is
 *     the line itself -- not the card, and not the card's dim.
 *
 * The app is index.html as served by Vite; the backend is Playwright's route
 * table: a session with the boundary committed, landform not started, and a
 * generate whose job stays running. Set KD_SCREENSHOTS to a directory to
 * write a screenshot of each width there.
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

const API = 'http://localhost:5000'
const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

function serverDocument() {
  const steps = {}
  for (const stepId of [...STEP_ORDER].sort()) steps[stepId] = { status: 'not_started' }
  return {
    schema_version: 1,
    session_id: 'sess-1',
    document_revision: 0,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: [
      [-79.9838154, 40.6458343],
      [-79.9836701, 40.6428581],
      [-79.9813665, 40.6440549],
      [-79.9804741, 40.6445667],
      [-79.9827466, 40.6458894],
    ],
    step_order: [...STEP_ORDER],
    steps,
  }
}

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

/** The app at landform, generate pressed, card open, waiting line showing. */
async function openDuringGenerate({ width, height }) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.route(`${API}/**`, (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname === '/api/steps') return route.fulfill({ json: { step_order: STEP_ORDER } })
    if (url.pathname === '/api/sessions/sess-1' && method === 'GET') return route.fulfill({ json: serverDocument() })
    if (url.pathname.endsWith('/steps/landform/generate') && method === 'POST') {
      return route.fulfill({ status: 202, json: { job_id: 'job-1', status: 'running' } })
    }
    if (url.pathname === '/api/jobs/job-1') return route.fulfill({ json: { job_id: 'job-1', status: 'running' } })
    return route.fulfill({ status: 404, json: {} })
  })
  // No imagery: the tiles are not what is being measured.
  await page.route(/arcgisonline\.com/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.addInitScript(() => {
    localStorage.setItem('keyline.sessionId', 'sess-1')
    localStorage.setItem('kd.tutorial.seen', JSON.stringify(['orientation', 'boundary']))
    localStorage.setItem('kd.tutorial.auto', 'true')
  })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="generate-landform"]:not([disabled])')
  await page.evaluate(() => document.fonts.ready)
  // The map is below the fold on a phone; bring it into view as a person would.
  await page.locator('.map-stage').scrollIntoViewIfNeeded()
  await page.click('[data-testid="generate-landform"]')
  await page.waitForSelector('[data-testid="tutorial-step-card"][data-step="landform"]')
  // The waiting line earns its first phrase after PHRASE_INTERVAL_MS.
  await page.waitForSelector('[data-testid="waiting-phrase-landform"]', { timeout: 10_000 })
  // Let the card's entrance finish before measuring.
  await page.waitForTimeout(600)
  return page
}

function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
    }
    const card = document.querySelector('[data-testid="tutorial-step-card"]')
    const bar = document.querySelector('.chrome-bar')
    const phrase = document.querySelector('[data-testid="waiting-phrase-landform"]')
    const p = box(phrase)
    const x = p.left + p.width / 2
    const y = p.top + p.height / 2
    const hit = document.elementFromPoint(x, y)
    return {
      card: box(card),
      bar: box(bar),
      phrase: p,
      phraseText: phrase.textContent,
      hitIsPhrase: hit === phrase || phrase.contains(hit),
      hitInCard: card.contains(hit),
      hitIsDim: hit?.classList?.contains('tutorial__backdrop') ?? false,
      viewport: { width: innerWidth, height: innerHeight },
      scrollX: document.documentElement.scrollWidth > innerWidth,
    }
  })
}

const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describeIf('a step card open during its generate, in the shipped app', () => {
  for (const [label, viewport] of [
    ['380px', { width: 380, height: 760 }],
    ['desktop', { width: 1280, height: 860 }],
  ]) {
    it(
      `at ${label}: the card does not overlap the waiting line`,
      async () => {
        const page = await openDuringGenerate(viewport)
        const m = await measure(page)
        if (process.env.KD_SCREENSHOTS) {
          await page.screenshot({ path: path.join(process.env.KD_SCREENSHOTS, `generate-card-${label}.png`) })
        }
        // The card and the bar that holds the line do not intersect.
        expect(intersects(m.card, m.bar), JSON.stringify(m)).toBe(false)
        expect(m.card.top).toBeGreaterThanOrEqual(m.bar.bottom)
        // The line is on screen...
        expect(m.phrase.width).toBeGreaterThan(0)
        expect(m.phrase.top).toBeGreaterThanOrEqual(0)
        expect(m.phrase.bottom).toBeLessThanOrEqual(m.viewport.height)
        expect(m.phrase.right).toBeLessThanOrEqual(m.viewport.width)
        // ...and nothing of the card's is on top of it: not the card, not its dim.
        expect(m.hitInCard).toBe(false)
        expect(m.hitIsDim).toBe(false)
        expect(m.hitIsPhrase, JSON.stringify(m)).toBe(true)
        expect(m.scrollX).toBe(false)
        await page.close()
      },
      SLOW
    )
  }
})
