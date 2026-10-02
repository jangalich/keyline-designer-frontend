/**
 * route.test.jsx
 *
 * THE REPORT ROUTE OVER THE WHOLE APP: its resume path, its layering over the
 * wizard page, and what a direct load does with a link that holds nothing.
 *
 * report.test.jsx covers what the page says and does over the shell alone.
 * This file mounts App.jsx -- the real providers, the real map, the real
 * router -- because the two claims that matter most about the route cannot
 * be made over the shell:
 *
 *   THE WIZARD STAYS MOUNTED, AND BACK IS INSTANT. The page is a layer over
 *   the wizard page, not a component swapped in for it. Going back must not
 *   re-hydrate (no second GET of the session) and must not re-fit the map
 *   (ResumeFit fires on the resume landing and never again). Both are
 *   counted here: the fetch calls, and L.Map.prototype.fitBounds. The map
 *   container is the SAME DOM NODE before and after, which is what "not
 *   remounted" means.
 *
 *   A DIRECT LOAD WORKS. Someone who bookmarks /report?session=…, refreshes
 *   it, or returns to it from a payment provider gets a working page: the
 *   session provider reads the query on mount whatever the pathname, the
 *   document hydrates through the one resume path, and the free pages are
 *   asked for once it has. An unknown or expired id lands on a page that
 *   says so and offers the map, with nothing else asked of the server.
 *
 * WHAT IS MOCKED IS THE WIRE. The map's tiles are <img> requests Leaflet
 * makes, which jsdom does not fetch; nothing here waits on them.
 */

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_URL } from '../session/apiClient'
import { COMMITTED, NOT_STARTED, SESSION_STORAGE_KEY } from '../session/SessionStore'
import { AUTO_KEY, ORIENTATION_ID, SEEN_KEY } from '../tutorial/prefs.js'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { REPORT_PATH } from '../router.jsx'
import { ABSENT_ACTION, PAGE_TITLE } from './ReportPage.jsx'
import { resetLandformPages } from './landformPages.js'

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']
const SESSION_ID = 'sess-route'
const PAGES_PATH = `/api/sessions/${SESSION_ID}/landform-pages`

// [lng, lat], as the wire carries it: a real ring, so the resume fit has a
// box to fit.
const BOUNDARY = [
  [-79.9838, 40.6458],
  [-79.9837, 40.6429],
  [-79.9805, 40.6446],
  [-79.9827, 40.6459],
]

function serverDocument(status = COMMITTED) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) {
    entries[stepId] =
      status === COMMITTED
        ? {
            status,
            revision: 1,
            features: { type: 'FeatureCollection', features: [] },
            provenance: {},
          }
        : { status }
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

function pagesManifest() {
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

/**
 * The wire. `session` is what GET /api/sessions/<id> answers: a document, or
 * a status to fail with. Layers for a committed step answer 409 as the real
 * server does for a step with no proposals cached; nothing here is about them.
 */
function installFetch({ session = serverDocument(), pages = pagesManifest() } = {}) {
  const calls = []
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl, API_URL)
    const method = init.method ?? 'GET'
    calls.push({ method, path: url.pathname })
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
    if (url.pathname === '/api/steps') return json(200, { step_order: [...STEP_ORDER] })
    if (method === 'GET' && url.pathname === `/api/sessions/${SESSION_ID}`) {
      return typeof session === 'number' ? json(session, { error: 'no' }) : json(200, session)
    }
    if (method === 'GET' && url.pathname === PAGES_PATH) {
      return typeof pages === 'number' ? json(pages, { error: 'no' }) : json(200, pages)
    }
    if (method === 'GET' && url.pathname.endsWith('/layers')) return json(409, { error: 'not generated' })
    throw new Error(`no route for ${method} ${url.pathname}`)
  })
  return calls
}

const q = (testid) => document.querySelector(`[data-testid="${testid}"]`)

async function settle(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

async function renderApp() {
  const App = (await import('../App.jsx')).default
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => root.render(<App />))
  await settle()
  return {
    container,
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

let fitBounds

beforeEach(() => {
  resetStepCatalog()
  resetLandformPages()
  window.localStorage.clear()
  // A RETURNING PERSON: the orientation gate is behind them and the step
  // cards are off, so the wizard chrome mounts (gate.test.jsx owns the entry).
  window.localStorage.setItem(SEEN_KEY, JSON.stringify([ORIENTATION_ID]))
  window.localStorage.setItem(AUTO_KEY, JSON.stringify(false))
  fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function fit() {
    return this
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
  document.documentElement.style.overflow = ''
})

describe('a direct load of the route', () => {
  it('hydrates through the wizard\'s resume path, generates the pages, and renders them over the wizard', async () => {
    window.history.replaceState({}, '', `${REPORT_PATH}?session=${SESSION_ID}`)
    const calls = installFetch()
    const app = await renderApp()

    // THE PAGE IS UP, AND IT IS READY: the document came in through the one
    // resume path, from the URL's query, with the pathname being /report.
    const page = q('report-page')
    expect(page, 'the report page renders on a direct load').not.toBeNull()
    expect(page.dataset.state).toBe('ready')
    expect(page.querySelector('h1').textContent).toBe(PAGE_TITLE)
    expect(calls.filter((c) => c.path === `/api/sessions/${SESSION_ID}`), 'hydrated once').toHaveLength(1)
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ID)

    // THE PAGES CAME, from one request, after the document.
    expect(calls.filter((c) => c.path === PAGES_PATH)).toHaveLength(1)
    const sessionAt = calls.findIndex((c) => c.path === `/api/sessions/${SESSION_ID}`)
    const pagesAt = calls.findIndex((c) => c.path === PAGES_PATH)
    expect(pagesAt).toBeGreaterThan(sessionAt)
    expect(q('own-pages').dataset.status).toBe('ready')
    expect(q('own-pages').querySelectorAll('img')).toHaveLength(3)

    // NOTHING ELSE WAS ASKED FOR: no report POST, no job, no generate.
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
    expect(calls.filter((c) => c.path.startsWith('/api/jobs'))).toHaveLength(0)

    // THE WIZARD PAGE IS UNDERNEATH, MOUNTED AND INERT. The map initialised
    // (Leaflet's container is in the tree) and the resume fit ran on the
    // landing, under the layer, so going back lands on the parcel.
    const wizard = q('wizard-page')
    expect(wizard.hasAttribute('inert')).toBe(true)
    expect(wizard.getAttribute('aria-hidden')).toBe('true')
    expect(wizard.querySelector('.leaflet-container'), 'the map is mounted beneath').not.toBeNull()
    expect(fitBounds, 'the resume fit ran once, on the landing').toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.overflow, 'the document scroll is locked').toBe('hidden')
    await app.unmount()
  })

  it('goes back to the wizard with no second hydration, no second fit, and the same map', async () => {
    window.history.replaceState({}, '', `${REPORT_PATH}?session=${SESSION_ID}`)
    const calls = installFetch()
    const app = await renderApp()
    const mapNode = q('wizard-page').querySelector('.leaflet-container')
    const before = calls.length
    const fits = fitBounds.mock.calls.length

    // THE PAGE'S OWN WAY BACK. A direct load has no wizard entry behind it,
    // so the link navigates to the wizard with the session along.
    await React.act(async () => {
      q('report-back').click()
    })
    await settle(5)

    expect(window.location.pathname).toBe('/')
    expect(new URLSearchParams(window.location.search).get('session')).toBe(SESSION_ID)
    expect(q('report-page')).toBeNull()
    const wizard = q('wizard-page')
    expect(wizard.hasAttribute('inert')).toBe(false)
    expect(wizard.hasAttribute('aria-hidden')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('')
    // INSTANT: the same node, nothing fetched, nothing fitted.
    expect(wizard.querySelector('.leaflet-container'), 'the map was not remounted').toBe(mapNode)
    expect(calls.length, 'back asked the server for nothing').toBe(before)
    expect(fitBounds.mock.calls.length, 'back did not re-fit the map').toBe(fits)
    await app.unmount()
  })
})

describe('from the wizard and back', () => {
  it('leaves the wizard where it was: no hydration, no fit, the same map node', async () => {
    window.history.replaceState({}, '', `/?session=${SESSION_ID}`)
    const calls = installFetch()
    const app = await renderApp()
    expect(q('report-page')).toBeNull()
    expect(q('report-open'), 'a finished design offers the report').not.toBeNull()
    const mapNode = q('wizard-page').querySelector('.leaflet-container')
    const fits = fitBounds.mock.calls.length
    const hydrations = () => calls.filter((c) => c.path === `/api/sessions/${SESSION_ID}`).length
    expect(hydrations()).toBe(1)
    expect(fits).toBe(1)

    // A real press focuses the button before it fires; jsdom's click() does
    // not, and the focus return on the way back is to whatever had it.
    q('report-open').focus()
    await React.act(async () => {
      q('report-open').click()
    })
    await settle(5)
    expect(window.location.pathname).toBe(REPORT_PATH)
    expect(q('report-page').dataset.state).toBe('ready')
    expect(q('wizard-page').hasAttribute('inert')).toBe(true)
    expect(q('wizard-page').querySelector('.leaflet-container')).toBe(mapNode)

    await React.act(async () => {
      q('report-back').click()
    })
    // The wizard is one entry back, so the link is history.back(); jsdom
    // traverses on a timer of its own.
    for (let i = 0; i < 20 && window.location.pathname === REPORT_PATH; i += 1) await settle(1)

    expect(window.location.pathname).toBe('/')
    expect(q('report-page')).toBeNull()
    expect(q('wizard-page').hasAttribute('inert')).toBe(false)
    expect(q('wizard-page').querySelector('.leaflet-container'), 'the same map').toBe(mapNode)
    expect(hydrations(), 'no re-hydration').toBe(1)
    expect(fitBounds.mock.calls.length, 'no re-fit').toBe(fits)
    expect(document.activeElement, 'focus is back on the card\'s button').toBe(q('report-open'))
    await app.unmount()
  })
})

describe('a route load with a link that holds nothing', () => {
  it('says there is no design on an unknown or expired id, offers the map, and asks for no pages', async () => {
    window.history.replaceState({}, '', `${REPORT_PATH}?session=${SESSION_ID}`)
    const calls = installFetch({ session: 404 })
    const app = await renderApp()

    const page = q('report-page')
    expect(page.dataset.state).toBe('absent')
    const notice = q('report-absent')
    expect(notice, 'the page says so').not.toBeNull()
    expect(notice.textContent.toLowerCase()).toContain('no design on this link')
    expect(q('report-absent-action').textContent).toBe(ABSENT_ACTION)
    // THE REST OF THE PAGE STILL READS -- it is about the report, which
    // exists whatever the link held -- but nothing is offered for a design
    // that is not there: no pages, no generate.
    expect(q('report-lede')).not.toBeNull()
    expect(q('own-pages')).toBeNull()
    expect(q('report-generate')).toBeNull()
    expect(calls.filter((c) => c.path === PAGES_PATH), 'no pages asked for').toHaveLength(0)
    // The stale id is forgotten, as the wizard forgets it.
    expect(new URLSearchParams(window.location.search).get('session')).toBeNull()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()

    // THE WAY OUT GOES TO THE MAP.
    await React.act(async () => {
      q('report-absent-action').click()
    })
    expect(window.location.pathname).toBe('/')
    expect(q('report-page')).toBeNull()
    await app.unmount()
  })

  it('says the same with no session on the link at all', async () => {
    window.history.replaceState({}, '', REPORT_PATH)
    const calls = installFetch()
    const app = await renderApp()
    expect(q('report-page').dataset.state).toBe('absent')
    expect(q('report-absent')).not.toBeNull()
    expect(calls.filter((c) => c.path.startsWith('/api/sessions'))).toHaveLength(0)
    await app.unmount()
  })

  it('says the server did not answer when the resume fails for any other reason', async () => {
    window.history.replaceState({}, '', `${REPORT_PATH}?session=${SESSION_ID}`)
    installFetch({ session: 500 })
    const app = await renderApp()
    expect(q('report-page').dataset.state).toBe('error')
    expect(q('report-error')).not.toBeNull()
    expect(q('report-error').textContent.toLowerCase()).toContain('try again')
    expect(q('own-pages')).toBeNull()
    await app.unmount()
  })

  it('shows a failure line, not a hang, when the free pages cannot be made', async () => {
    window.history.replaceState({}, '', `${REPORT_PATH}?session=${SESSION_ID}`)
    installFetch({ pages: 502 })
    const app = await renderApp()
    expect(q('report-page').dataset.state).toBe('ready')
    expect(q('own-pages-failed')).not.toBeNull()
    expect(q('own-pages-waiting')).toBeNull()
    expect(q('report-generate'), 'the report itself is still offered').not.toBeNull()
    await app.unmount()
  })
})
