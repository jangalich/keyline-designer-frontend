/**
 * @vitest-environment node
 *
 * reportPage.browser.test.jsx
 *
 * THE REPORT PAGE IN A REAL ENGINE: its layout at 1440 and 390 with the
 * user's own Landform pages in it, and the way back to the wizard being the
 * layer leaving rather than a reload.
 *
 * jsdom lays nothing out, so three claims are made here and nowhere else:
 *
 *   AT 1440 THE THREE PAGES SIT IN ONE ROW, each a legible thumbnail, under
 *   the lede and the four figures, above the contents and the action.
 *
 *   AT 390 NOTHING SCROLLS SIDEWAYS. The pages stack, the contents' names
 *   go above their lines, the foot stacks, and the page is no wider than the
 *   screen.
 *
 *   BACK IS INSTANT. The map's container is the same node before and after
 *   (so it was not remounted), its panes carry the same transforms (so it
 *   did not move: any setView or fitBounds rewrites them), and the server
 *   was asked for nothing on the way back.
 *
 * The app is index.html as served by Vite, loaded directly at the route (the
 * dev server's SPA fallback, as the host's rewrite does in production). The
 * API is answered by Playwright's route handler: the session document, the
 * pages' manifest and, for the page images, the marketing page's sample
 * renders standing in for the generated ones -- the same sizes (1275 x 1650,
 * 480 x 621), so the geometry under test is the geometry shipped. The tiles
 * are stubbed. Set KD_SCREENSHOTS to a directory to write a screenshot of
 * each width there.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CHROMIUM = '/opt/pw-browsers/chromium'
const available = existsSync(CHROMIUM)
const describeIf = available ? describe : describe.skip
const SLOW = 90_000

const API = 'http://localhost:5000'
const SESSION_ID = 'sess-browser'
const PAGES_PATH = `/api/sessions/${SESSION_ID}/landform-pages`
const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const ASSETS = path.resolve(__dirname, '../assets/report')
const STAND_INS = {
  1: ['page-03-climate.webp', 'page-03-climate-thumb.webp'],
  2: ['page-11-water.webp', 'page-11-water-thumb.webp'],
  3: ['page-19-layout.webp', 'page-19-layout-thumb.webp'],
}

// [lng, lat]: the reference parcel's ring, so the committed boundary draws.
const BOUNDARY = [
  [-79.9838154, 40.6458343],
  [-79.9836701, 40.6428581],
  [-79.9813665, 40.6440549],
  [-79.9804741, 40.6445667],
  [-79.9827466, 40.6458894],
]

function serverDocument() {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) {
    entries[stepId] = {
      status: 'committed',
      revision: 1,
      features: { type: 'FeatureCollection', features: [] },
      provenance: {},
    }
  }
  return {
    schema_version: 1,
    session_id: SESSION_ID,
    document_revision: 1,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: BOUNDARY,
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

function manifest() {
  return {
    session_id: SESSION_ID,
    generated_on: '2026-10-02',
    section: { number: 'III', name: 'Landform' },
    pages: [1, 2, 3].map((number) => ({
      number,
      label: number === 1 ? 'III · Landform' : 'III · Landform, continued',
      alt: `Landform, page ${number}`,
      url: `${PAGES_PATH}/${number}`,
      thumb_url: `${PAGES_PATH}/${number}?size=thumb`,
      width: 1275,
      height: 1650,
      thumb_width: 480,
      thumb_height: 621,
    })),
  }
}

// A 1x1 transparent PNG for the basemap tiles.
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

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

/** A page at `viewport`, with the API answered and every request to it counted. */
async function openPage(viewport, { pathname = `/report?session=${SESSION_ID}` } = {}) {
  const context = await browser.newContext({ viewport })
  // A returning person: no orientation gate, no step cards.
  await context.addInitScript(() => {
    window.localStorage.setItem('kd.tutorial.seen', JSON.stringify(['orientation']))
    window.localStorage.setItem('kd.tutorial.auto', JSON.stringify(false))
  })
  const page = await context.newPage()
  const apiCalls = []
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url())
    apiCalls.push(url.pathname + url.search)
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/steps') return json({ step_order: STEP_ORDER })
    if (url.pathname === `/api/sessions/${SESSION_ID}`) return json(serverDocument())
    if (url.pathname === PAGES_PATH) return json(manifest())
    const image = /\/landform-pages\/(\d)$/.exec(url.pathname)
    if (image) {
      const [full, thumb] = STAND_INS[image[1]]
      const file = url.searchParams.get('size') === 'thumb' ? thumb : full
      return route.fulfill({ status: 200, contentType: 'image/webp', body: readFileSync(path.join(ASSETS, file)) })
    }
    if (url.pathname.endsWith('/layers')) return json({ error: 'not generated' }, 409)
    return json({ error: `unrouted ${url.pathname}` }, 404)
  })
  await page.route('**/server.arcgisonline.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE })
  )
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  await page.goto(`${base}${pathname}`, { waitUntil: 'load' })
  return { page, context, apiCalls }
}

async function pagesLanded(page) {
  await page.waitForSelector('[data-testid="own-pages"][data-status="ready"]', { timeout: 30_000 })
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid="own-pages"] img')].length === 3 &&
      [...document.querySelectorAll('[data-testid="own-pages"] img')].every((img) => img.complete && img.naturalWidth > 0)
  )
}

async function screenshot(page, name) {
  const dir = process.env.KD_SCREENSHOTS
  if (!dir) return
  await page.screenshot({ path: path.join(dir, name) })
}

const rect = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  })

describeIf('the report page, laid out', () => {
  it(
    'at 1440: the three pages in one row under the lede and the figures, above the contents and the action',
    async () => {
      const { page, context } = await openPage({ width: 1440, height: 900 })
      await pagesLanded(page)

      const thumbs = await page.$$eval('[data-testid="own-pages"] img', (imgs) =>
        imgs.map((img) => {
          const r = img.getBoundingClientRect()
          return { top: Math.round(r.top), width: Math.round(r.width), natural: img.naturalWidth }
        })
      )
      expect(thumbs.map((t) => t.natural)).toEqual([480, 480, 480])
      expect(new Set(thumbs.map((t) => t.top)).size, 'one row').toBe(1)
      expect(Math.min(...thumbs.map((t) => t.width))).toBeGreaterThan(180)

      // THE ORDER ON THE SCREEN: lede, figures, pages, contents, action.
      const tops = []
      for (const id of ['report-lede', 'report-figures', 'own-pages', 'report-contents', 'report-action']) {
        tops.push((await rect(page, `[data-testid="${id}"]`)).top)
      }
      expect([...tops].sort((a, b) => a - b)).toEqual(tops)

      // SCROLL TO THE PAGES, so the screenshot shows them with the figures.
      await page.$eval('[data-testid="own-pages"]', (el) => el.scrollIntoView({ block: 'center' }))
      await screenshot(page, 'report-page-1440.png')

      // A PRESS ON A PAGE OPENS IT AT FULL SIZE, OVER THIS PAGE. The view is
      // portalled to <body> and stacked against the root context, where the
      // route's layer also is: the point at the centre of the screen has to
      // hit the view, not the page under it.
      await page.click('[data-testid="own-page-open-2"]')
      await page.waitForSelector('[data-testid="sample-view"]')
      const hit = await page.evaluate(() => {
        const at = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
        return Boolean(at?.closest('[data-testid="sample-view"]'))
      })
      expect(hit, 'the maximised view is on top of the report page').toBe(true)
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.querySelector('[data-testid="sample-view"]'))
      await context.close()
    },
    SLOW
  )

  it(
    'at 390: nothing scrolls sideways, the pages stack, and the action is full width',
    async () => {
      const { page, context } = await openPage({ width: 390, height: 844 })
      await pagesLanded(page)

      const widths = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="report-page"]')
        return {
          document: document.documentElement.scrollWidth,
          layerScroll: layer.scrollWidth,
          layerClient: layer.clientWidth,
          inner: window.innerWidth,
        }
      })
      expect(widths.document).toBeLessThanOrEqual(widths.inner)
      expect(widths.layerScroll, 'the layer does not scroll sideways').toBeLessThanOrEqual(widths.layerClient)

      const thumbs = await page.$$eval('[data-testid="own-pages"] img', (imgs) =>
        imgs.map((img) => Math.round(img.getBoundingClientRect().top))
      )
      expect(new Set(thumbs).size, 'stacked, one under another').toBe(3)

      const action = await rect(page, '[data-testid="report-generate"]')
      const foot = await rect(page, '[data-testid="report-action"]')
      expect(action.width).toBeGreaterThan(foot.width * 0.9)

      await page.$eval('[data-testid="own-pages"]', (el) => el.scrollIntoView({ block: 'start' }))
      await screenshot(page, 'report-page-390.png')
      await context.close()
    },
    SLOW
  )

  it(
    'back from the route is the layer leaving: the same map, unmoved, and nothing fetched',
    async () => {
      const { page, context, apiCalls } = await openPage({ width: 1440, height: 900 }, {
        pathname: `/?session=${SESSION_ID}`,
      })
      // THE WIZARD, with its map fitted to the committed boundary on the
      // resume landing, and the delivery card offered. The view is read off
      // the panes Leaflet positions: the map pane's transform and the zoom
      // proxy's are rewritten by every view change and by nothing else.
      await page.waitForSelector('[data-testid="report-open"]')
      // Where a person is when they press: the card in view. Taken before
      // the snapshot, so the scroll a press needs is not read as a move.
      await page.$eval('[data-testid="report-open"]', (el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(500)
      const view = () =>
        page.evaluate(() => ({
          pane: document.querySelector('.leaflet-map-pane')?.style.transform ?? null,
          proxy: document.querySelector('.leaflet-proxy')?.style.transform ?? null,
          zoomOut: document.querySelector('.leaflet-control-zoom-out')?.className ?? null,
          scrollY: window.scrollY,
        }))
      const before = await view()
      await page.$eval('.leaflet-container', (map) => {
        map.dataset.witness = 'mounted-once'
      })
      const calls = apiCalls.length

      await page.click('[data-testid="report-open"]')
      await page.waitForSelector('[data-testid="report-page"]')
      await pagesLanded(page)
      expect(new URL(page.url()).pathname).toBe('/report')
      expect(await page.$eval('[data-testid="wizard-page"]', (el) => el.hasAttribute('inert'))).toBe(true)

      const started = Date.now()
      await page.click('[data-testid="report-back"]')
      await page.waitForFunction(() => !document.querySelector('[data-testid="report-page"]'))
      const elapsed = Date.now() - started

      const after = await view()
      const witness = await page.$eval('.leaflet-container', (map) => map.dataset.witness)
      expect(new URL(page.url()).pathname).toBe('/')
      expect(witness, 'the map was not remounted').toBe('mounted-once')
      expect(after, 'the map did not move and the page is where it was left').toEqual(before)
      // NOTHING WAS HYDRATED AGAIN: every request after the press is the
      // free pages' (the manifest and the images), and the trip back made
      // none. The document's own GETs all happened before the press -- two
      // of them under the dev server, where StrictMode runs the provider's
      // mount effect twice; that is main.jsx's StrictMode, not the route.
      const since = apiCalls.slice(calls)
      expect(since.length).toBeGreaterThan(0)
      expect(since.every((c) => c.startsWith(PAGES_PATH)), `only the pages were asked for: ${since}`).toBe(true)
      expect(elapsed, 'instant, in human terms').toBeLessThan(1000)
      await context.close()
    },
    SLOW
  )
})
