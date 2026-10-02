/**
 * report.test.jsx
 *
 * THE DELIVERY STATE AND THE REPORT PAGE: WHEN THEY EXIST, WHAT PRESSING
 * THEM DOES, AND WHAT THEY SAY WHEN THE REPORT CANNOT BE MADE.
 *
 * The report is the one action in this app that is about the SESSION rather
 * than about a step. It has no candidates, nothing to select and nothing to
 * commit, it is in no document's `step_order`, and it is a terminal action
 * over a design whose every step is decided.
 *
 * THE CLAIM THIS FILE IS BUILT AROUND IS TEST 2, AND EVERYTHING ELSE IS
 * AROUND IT. The button's presence is DERIVED from the document -- every step
 * reading `committed` -- and is not a flag anything sets. The difference
 * between those two designs is invisible on a finished design: both render
 * the button in the same place with the same label, and test 1 passes either
 * way. It shows the moment a step in the MIDDLE of the chain is reopened: the
 * cascade puts every step below it back to `not_started` in the document the
 * server returns, a derivation goes false on the next hydrate, and a flag set
 * when the last step committed does not. So test 2 reopens `roads`, four of
 * six, and the assertion is that the button is gone.
 *
 * WHAT IS MOCKED IS THE WIRE, AND ONLY THE WIRE. rail.test.jsx's arrangement:
 * a `globalThis.fetch` that answers the routes the store calls, a real
 * SessionProvider, the real WizardShell, the real step definitions, and the
 * real report page mounted the way App.jsx mounts it -- as a layer over the
 * shell whenever the location is /report. Every document below comes INTO
 * the store through its own resume path, so what is asserted is what the
 * rail renders from a document the store actually hydrated -- not from a
 * state a test reached in and wrote.
 *
 * THE CASES:
 *
 *   1. The delivery card renders only when EVERY step is committed.
 *   2. Reopening a MID-CHAIN step removes it -- the cascade is what does it.
 *   3. Generating from the report page submits, polls, and produces a PDF link.
 *   4. The wait is a progress bar drawn from the job's own count: it moves
 *      only when a snapshot says work completed, holds on a stall with its
 *      label, never goes backwards, and stays where it stopped on failure.
 *      No cycling phrases, no pulse, no long-wait line.
 *   5. An expired session's message says reopen and recommit.
 *   6. A source failure's message does not suggest retrying differently;
 *      a NAMED source (`failed_layer`) is named.
 *   7. The rail's SEVEN ROWS are unchanged, and nothing hangs below them.
 *   8. The report page: the delivery card navigates to it; what it says, in
 *      what order; the user's own Landform pages come with NO report POST
 *      and no job; going back is the browser's back, with focus returned;
 *      a report under way keeps running while the person is back on the
 *      map. The route's own resume path and the layering over the map are
 *      report/route.test.jsx's, over the whole App.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_URL } from '../session/apiClient'
import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  SessionProvider,
  selectDesignIsComplete,
  selectReportIsOffered,
  useSession,
} from '../session/SessionStore'
import { resetStepCatalog } from './stepCatalog.jsx'
import { BOUNDARY_STEP_ID, STEP_DEFINITIONS, registryProposalFeatures } from './stepDefinitions'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'
import { DETAIL_COPY, STAGE_COPY, STARTING_COPY } from './shell/ReportProgress.jsx'
import {
  PROGRESS_POLL_DELAY_MS,
  PROGRESS_STALLED_POLL_DELAY_MS,
  PROGRESS_STALL_POLLS,
  progressPace,
} from '../session/jobs'
import ReportPage, {
  BACK_LABEL,
  CONTENTS_HEADING,
  FIGURES_HEADING,
  KEY_FIGURES,
  OWN_PAGES_BODY,
  OWN_PAGES_HEADING,
  OWN_PAGES_WAITING,
  PAGE_TITLE,
  REPORT_CONTENTS,
  REPORT_FAILURE_COPY,
  REPORT_LABEL,
} from '../report/ReportPage.jsx'
import { resetLandformPages } from '../report/landformPages.js'
import { REPORT_PATH, isReportPath, useLocation } from '../router.jsx'
import { DELIVERY_LABEL, DELIVERY_TITLE } from './shell/DeliveryPanel.jsx'
import { AUTO_KEY } from '../tutorial/prefs.js'

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/** The rail's own length: the boundary this client owns, plus the six. */
const RAIL_ROWS = STEP_ORDER.length + 1

/**
 * THE API'S OWN ADDRESS, read from the module that owns it rather than
 * written down here. It is configurable (VITE_API_URL), so a literal would
 * be a second copy that is right only when nothing is configured -- and the
 * claim being made below is precisely that the download href is joined
 * against THIS, whatever it is.
 */
const API = API_URL
const SESSION_ID = 'sess-report'
const REPORT_ID = 'rpt-1'
const DOWNLOAD_PATH = `/api/reports/${REPORT_ID}`
const PAGES_PATH = `/api/sessions/${SESSION_ID}/landform-pages`

/** The manifest GET .../landform-pages answers (landform_pages.py). */
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

function featureCollection(...ids) {
  return {
    type: 'FeatureCollection',
    features: ids.map((id) => ({ type: 'Feature', id, properties: { id }, geometry: null })),
  }
}

/**
 * A document with each named step at a status, in Flask's own ALPHABETICAL
 * key order -- the reason `step_order` travels as an array at all, and a
 * fixture that emitted pipeline order would let a rail reading Object.keys()
 * pass.
 */
function serverDocument(statuses = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) {
    const status = statuses[stepId] ?? NOT_STARTED
    entries[stepId] =
      status === COMMITTED
        ? {
            status,
            revision: 1,
            features: featureCollection(`${stepId}-1`),
            provenance: { [`${stepId}-1`]: 'generated' },
          }
        : { status }
  }
  return {
    schema_version: 1,
    session_id: SESSION_ID,
    document_revision: 1,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: [
      [-74.01, 40.7],
      [-74.0, 40.7],
      [-74.0, 40.71],
      [-74.01, 40.71],
    ],
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

const allCommitted = () =>
  serverDocument(Object.fromEntries(STEP_ORDER.map((stepId) => [stepId, COMMITTED])))

/**
 * WHAT A REOPEN OF `stepId` ACTUALLY RETURNS, cascade included: the step goes
 * back to `generated` and EVERY step below it to `not_started`.
 *
 * BUILT FROM design_document._reset_downstream()'s rule rather than
 * hand-listed, because the whole point of test 2 is that the cascade -- and
 * not the reopened step alone -- is what removes the button. A fixture that
 * only moved `roads` would be a weaker document than the server sends, and
 * the test would pass for a reason the product does not have.
 */
function afterReopen(stepId) {
  const index = STEP_ORDER.indexOf(stepId)
  const statuses = {}
  STEP_ORDER.forEach((id, position) => {
    if (position < index) statuses[id] = COMMITTED
    else if (position === index) statuses[id] = GENERATED
    else statuses[id] = NOT_STARTED
  })
  return serverDocument(statuses)
}

/* ===========================================================================
   The wire
   =========================================================================== */

/**
 * A fetch over the routes the store touches, with the report job scripted.
 *
 * THE REPORT POLLS FOR REAL. `jobPolls` is how many `running` snapshots the
 * job returns before its terminal one, so the tests below exercise the actual
 * poll loop in jobs.js rather than a promise that resolves immediately. The
 * backoff starts at a second, which is why the tests that poll drive fake
 * timers through it.
 */
function installFetch({
  document: doc = allCommitted(),
  reportTerminal = {
    job_id: 'job-r1',
    status: 'done',
    result: {
      report_id: REPORT_ID,
      download_url: DOWNLOAD_PATH,
      filename: 'site-data-report.pdf',
      size_bytes: 425225,
    },
  },
  jobPolls = 1,
  // THE PROGRESS EACH `running` POLL CARRIES, in order, the last repeating --
  // the job's own count, as report_progress.py sends it. Empty: none.
  jobSnapshots = [],
  reportAccepted = { job_id: 'job-r1', status: 'running' },
  reportStatus = 202,
  // THE FREE PAGES' ROUTE: the manifest, or a status to fail with.
  pagesStatus = 200,
} = {}) {
  const calls = []
  let polls = 0
  const state = { document: doc }

  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl, API)
    const method = init.method ?? 'GET'
    calls.push({
      method,
      path: url.pathname,
      body: init.body ? JSON.parse(init.body) : null,
      at: Date.now(),
    })

    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    if (method === 'GET' && url.pathname === `/api/sessions/${SESSION_ID}`) {
      return { ok: true, status: 200, json: async () => state.document }
    }
    if (method === 'POST' && url.pathname.endsWith('/reopen')) {
      const stepId = url.pathname.split('/').at(-2)
      state.document = afterReopen(stepId)
      return { ok: true, status: 200, json: async () => state.document }
    }
    if (method === 'GET' && url.pathname === PAGES_PATH) {
      if (pagesStatus !== 200) {
        return { ok: false, status: pagesStatus, json: async () => ({ error: 'could not be made right now' }) }
      }
      return { ok: true, status: 200, json: async () => pagesManifest() }
    }
    if (method === 'POST' && url.pathname === `/api/sessions/${SESSION_ID}/report`) {
      if (reportStatus !== 202) {
        return { ok: false, status: reportStatus, json: async () => reportAccepted }
      }
      return { ok: true, status: 202, json: async () => reportAccepted }
    }
    if (method === 'GET' && url.pathname === '/api/jobs/job-r1') {
      polls += 1
      if (polls <= jobPolls) {
        const progress = jobSnapshots.length
          ? jobSnapshots[Math.min(polls - 1, jobSnapshots.length - 1)]
          : undefined
        const body = { job_id: 'job-r1', status: 'running', ...(progress ? { progress } : {}) }
        return { ok: true, status: 200, json: async () => body }
      }
      return { ok: true, status: 200, json: async () => reportTerminal }
    }
    // A step's layers, which the machine asks for on a generated step.
    if (method === 'GET' && url.pathname.endsWith('/layers')) {
      return { ok: false, status: 409, json: async () => ({ error: 'not generated' }) }
    }
    throw new Error(`no route for ${method} ${url.pathname}`)
  })

  return { calls, setDocument: (next) => (state.document = next) }
}

/* ===========================================================================
   The render
   =========================================================================== */

/**
 * THE REPORT PAGE, MOUNTED AS App.jsx MOUNTS IT: a layer over the shell
 * whenever the location is /report, under the same providers. The shell is
 * not unmounted by it -- which is the arrangement the whole route rests on,
 * and route.test.jsx proves over the real App with the map.
 */
function RouteLayer() {
  const { pathname } = useLocation()
  return isReportPath(pathname) ? <ReportPage /> : null
}

async function renderShell() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = window.document.createElement('div')
  window.document.body.appendChild(container)
  const root = createRoot(container)

  let session = null
  let cursor = null
  function Probe() {
    session = useSession()
    cursor = useWizardCursor()
    return null
  }

  await React.act(async () => {
    root.render(
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <Probe />
          <WizardShell />
          <RouteLayer />
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  // THROUGH THE STORE'S OWN RESUME. Reaching in and writing state would skip
  // the half of the journey the store owns, and the question here is what the
  // rail renders from a HYDRATED document. The document is the installed
  // fetch's, so a test names one in exactly one place.
  await React.act(async () => {
    await session.actions.resume(SESSION_ID)
  })

  const q = (testid) => window.document.querySelector(`[data-testid="${testid}"]`)

  return {
    container,
    get session() {
      return session
    },
    get cursor() {
      return cursor
    },
    q,
    rows: () => [...container.querySelectorAll('[data-testid="wizard-order"] > li')],
    reportAction: () => q('delivery'),
    openButton: () => q('report-open'),
    page: () => q('report-page'),
    generateButton: () => q('report-generate'),
    downloadLink: () => q('report-download'),
    failureNote: () => q('report-failure'),
    waitingNote: () => q('report-waiting'),
    async press(testid) {
      await React.act(async () => {
        q(testid).click()
      })
    },
    /** Go to the report page from the delivery card, then press generate there. */
    async generate() {
      if (!q('report-page')) {
        await React.act(async () => {
          q('report-open').click()
        })
      }
      await React.act(async () => {
        q('report-generate').click()
      })
    },
    /** The page's own way back: its link, which is the browser's back. */
    async back() {
      await React.act(async () => {
        q('report-back').click()
      })
      // jsdom traverses its session history on a timer of its own, a few
      // milliseconds later; the popstate that follows is what the router
      // listens for. Waited for, under real or fake timers.
      for (let i = 0; i < 20 && window.location.pathname === REPORT_PATH; i += 1) {
        await React.act(async () => {
          if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(5)
          else await new Promise((resolve) => setTimeout(resolve, 5))
        })
      }
    },
    /** A key, dispatched where focus is, as a keyboard would. */
    async key(key, init = {}) {
      await React.act(async () => {
        const target = window.document.activeElement ?? window.document.body
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
        )
      })
    },
    async resume() {
      await React.act(async () => {
        await session.actions.resume(SESSION_ID)
      })
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  resetStepCatalog()
  resetLandformPages()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. ONLY WHEN EVERY STEP IS COMMITTED
   =========================================================================== */

describe('1. the delivery card renders only when every step is committed', () => {
  it('is absent on a design with one step outstanding, and present when none is', async () => {
    // FIVE OF SIX. The last step is the one left, which is the state a user
    // is in for the whole of the fencing step -- and the one where a button
    // appearing early would offer a report of a design with a hole in it.
    installFetch({
      document: serverDocument({
        landform: COMMITTED,
        water: COMMITTED,
        roads: COMMITTED,
        trees: COMMITTED,
        structures: COMMITTED,
        fencing: GENERATED,
      }),
    })
    const ui = await renderShell()
    expect(ui.reportAction(), 'no report while a step is outstanding').toBeNull()
    expect(selectDesignIsComplete(ui.session.state)).toBe(false)
    await ui.unmount()

    // ALL SIX.
    installFetch({ document: allCommitted() })
    const done = await renderShell()
    expect(done.reportAction(), 'the report is offered on a finished design').not.toBeNull()
    expect(done.openButton().textContent).toBe(DELIVERY_LABEL)
    expect(done.reportAction().textContent).toContain(DELIVERY_TITLE)
    // ONE ACTION, AND IT NAVIGATES; IT DOES NOT GENERATE. Generation runs
    // from the report page, one deliberate press further on.
    expect(done.reportAction().querySelectorAll('button, a')).toHaveLength(1)
    expect(done.generateButton(), 'nothing generates from the card').toBeNull()
    expect(selectDesignIsComplete(done.session.state)).toBe(true)
    expect(selectReportIsOffered(done.session.state)).toBe(true)
    await done.unmount()
  })

  it('is absent before a session exists at all', async () => {
    // AN EMPTY `step_order` MUST NOT READ AS "every step is committed".
    // `[].every()` is true, which is exactly the way this derivation can be
    // written wrong, and the boundary screen is where it would show.
    installFetch()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = window.document.createElement('div')
    window.document.body.appendChild(container)
    const root = createRoot(container)
    let session = null
    function Probe() {
      session = useSession()
      return null
    }
    await React.act(async () => {
      root.render(
        <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
          <WizardCursorProvider definitions={STEP_DEFINITIONS}>
            <Probe />
            <WizardShell />
          </WizardCursorProvider>
        </SessionProvider>
      )
    })
    expect(session.state.stepOrder).toEqual([])
    expect(selectDesignIsComplete(session.state)).toBe(false)
    expect(container.querySelector('[data-testid="delivery"]')).toBeNull()
    await React.act(async () => root.unmount())
    container.remove()
  })
})

/* ===========================================================================
   2. REOPENING A MID-CHAIN STEP REMOVES IT
   ===========================================================================
   THE TEST THAT TELLS A DERIVATION FROM A FLAG, and the reason it reopens
   `roads` -- four of six, with two steps below it -- rather than `fencing`.

   Reopening the LAST step would prove much less: `fencing` itself goes to
   `generated`, so even a rule that only looked at the step it was told about
   would answer correctly. `roads` is the case where the reopened step is not
   the only one that changed: the cascade puts `trees`, `structures` and
   `fencing` back to `not_started`, and a `designComplete` flag written when
   `fencing` committed would still be set, because nothing about a reopen
   writes it. That design passes test 1 and fails this.
   =========================================================================== */

describe('2. reopening any step removes it, because the cascade does', () => {
  it('goes when a MID-CHAIN step is reopened, and comes back when the chain does', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()
    expect(ui.reportAction(), 'offered on the finished design').not.toBeNull()

    // THE REOPEN, THROUGH THE STORE'S OWN ACTION, against a wire that sends
    // back the document the server would: roads `generated`, everything below
    // it `not_started`.
    await React.act(async () => {
      await ui.session.actions.reopen('roads')
    })

    const statuses = Object.fromEntries(
      STEP_ORDER.map((stepId) => [stepId, ui.session.state.steps[stepId].status])
    )
    expect(statuses).toEqual({
      landform: COMMITTED,
      water: COMMITTED,
      roads: GENERATED,
      trees: NOT_STARTED,
      structures: NOT_STARTED,
      fencing: NOT_STARTED,
    })

    // THE CLAIM. Nothing told the button; the document changed.
    expect(ui.reportAction(), 'reopening roads takes the report away').toBeNull()
    expect(selectDesignIsComplete(ui.session.state)).toBe(false)

    // AND IT IS NOT A ONE-WAY DOOR. Re-committing the chain brings it back,
    // from the same derivation and with nothing having been reset.
    await React.act(async () => {
      installFetch({ document: allCommitted() })
      await ui.session.actions.resume(SESSION_ID)
    })
    expect(ui.reportAction(), 'a finished design offers it again').not.toBeNull()
    await ui.unmount()
  })

  it('drops a PRODUCED report too, not just the button', async () => {
    // A LINK TO A PDF OF A DESIGN THE SESSION NO LONGER HOLDS. The file still
    // exists and still describes the design as it was; offering it beside a
    // rail that now says three steps are outstanding would say the two agree.
    // The button is derived away; the produced report is STATE and has to be
    // dropped.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installFetch({ document: allCommitted(), jobPolls: 0 })
    const ui = await renderShell()
    await ui.generate()
    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(ui.downloadLink(), 'a report was produced').not.toBeNull()

    await React.act(async () => {
      await ui.session.actions.reopen('roads')
    })
    expect(ui.reportAction()).toBeNull()
    expect(ui.session.state.report.status).toBe('idle')
    expect(ui.session.state.report.download).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   3. PRESS, POLL, DOWNLOAD
   =========================================================================== */

describe('3. generating from the report page submits, polls, and produces a downloadable PDF', () => {
  it('POSTs the session report route, polls the job, and offers the link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // TWO `running` SNAPSHOTS BEFORE THE ANSWER, so the real poll loop in
    // jobs.js runs rather than a promise that was already resolved.
    const wire = installFetch({ document: allCommitted(), jobPolls: 2 })
    const ui = await renderShell()

    await ui.generate()

    // THE PRESS CHANGES THE SCREEN BEFORE THE SERVER AGREES -- the store
    // dispatches REPORT_STARTED ahead of the first await, for the same reason
    // a generate does.
    expect(ui.session.state.report.status).toBe('working')
    expect(ui.generateButton().disabled).toBe(true)
    expect(ui.waitingNote(), 'the wait says something').not.toBeNull()
    expect(ui.downloadLink()).toBeNull()

    // THE POLLS. jobs.js starts at a second and backs off by 1.5x.
    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // THE ROUTE IT ASKED FOR: session-scoped, with no step id in it, because
    // the report is not a step.
    const submit = wire.calls.find((c) => c.method === 'POST' && c.path.endsWith('/report'))
    expect(submit.path).toBe(`/api/sessions/${SESSION_ID}/report`)
    expect(submit.path).not.toContain('/steps/')
    expect(wire.calls.filter((c) => c.path === '/api/jobs/job-r1').length).toBeGreaterThanOrEqual(3)

    // AND THE ANSWER IS A LINK.
    const link = ui.downloadLink()
    expect(link, 'a finished report offers a download').not.toBeNull()
    // ABSOLUTE, against the API's origin. The server sends a PATH -- it does
    // not know what origin it is reached on -- and the app is served from a
    // different one, so a relative href would resolve against the frontend
    // and 404.
    expect(link.getAttribute('href')).toBe(`${API}${DOWNLOAD_PATH}`)
    expect(link.getAttribute('download')).toBe('site-data-report.pdf')
    expect(ui.q('report-ready-note').textContent).toContain('PDF')
    expect(ui.waitingNote(), 'the wait is over').toBeNull()
    expect(ui.failureNote()).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   4. THE WAIT IS THE JOB'S OWN COUNT
   =========================================================================== */

/**
 * SNAPSHOTS FROM A REAL RUN. Each is a `progress` object exactly as GET
 * /api/jobs returned it on a live warm report of the reference parcel
 * (diagnose_report_progress.py in the backend) -- so what these tests feed
 * the page is what the backend sends, not a shape written to suit them.
 */
const P = Object.freeze({
  unplanned: { fraction: 0.0, percent: 0, completed: 0, total: 0, fetches: { completed: 0, total: 0 }, stage: null, detail: null, failed: false },
  climate: { fraction: 0.0, percent: 0, completed: 0, total: 39, fetches: { completed: 0, total: 21 }, stage: 'records', detail: 'climate', failed: false },
  one: { fraction: 0.0381, percent: 3, completed: 1, total: 39, fetches: { completed: 1, total: 21 }, stage: 'records', detail: null, failed: false },
  wetlands: { fraction: 0.1905, percent: 19, completed: 5, total: 39, fetches: { completed: 5, total: 21 }, stage: 'records', detail: 'wetlands', failed: false },
  flood: { fraction: 0.2286, percent: 22, completed: 6, total: 39, fetches: { completed: 6, total: 21 }, stage: 'records', detail: 'flood', failed: false },
  maps: { fraction: 0.8867, percent: 88, completed: 34, total: 39, fetches: { completed: 21, total: 21 }, stage: 'maps', detail: null, failed: false },
  terrain: { fraction: 0.8933, percent: 89, completed: 35, total: 39, fetches: { completed: 21, total: 21 }, stage: 'terrain', detail: null, failed: false },
})

/** What the page's bar says right now. */
function readBar(ui) {
  const fill = ui.q('report-progress-fill')
  const bar = ui.q('report-progress-bar')
  const match = /scaleX\(([\d.]+)\)/.exec(fill?.style.transform ?? '')
  return {
    fraction: match ? Number(match[1]) : null,
    percent: bar ? Number(bar.getAttribute('aria-valuenow')) : null,
    label: ui.q('report-progress-label')?.textContent ?? null,
    detail: ui.q('report-progress-detail')?.textContent ?? null,
  }
}

async function tick(ms) {
  await React.act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('4. the wait is a progress bar drawn from the job\'s own count', () => {
  it('follows the job through a real run, stage by stage, and never goes backwards', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const sequence = [P.unplanned, P.climate, P.one, P.wetlands, P.flood, P.maps, P.terrain]
    installFetch({ document: allCommitted(), jobPolls: Number.MAX_SAFE_INTEGER, jobSnapshots: sequence })
    const ui = await renderShell()
    await ui.generate()

    // THE FIRST POLL: the job exists and has not counted its work yet.
    expect(readBar(ui)).toMatchObject({ fraction: 0, percent: 0, label: STARTING_COPY })

    const seen = []
    for (const expected of sequence.slice(1)) {
      // The count advances every poll here, so the pace stays at a second.
      await tick(PROGRESS_POLL_DELAY_MS)
      const bar = readBar(ui)
      seen.push(bar.fraction)
      expect(bar.fraction).toBeCloseTo(expected.fraction, 4)
      expect(bar.percent).toBe(expected.percent)
      expect(bar.label).toBe(STAGE_COPY[expected.stage])
      if (expected.stage === 'records') {
        // THE KIND OF DATA AND THE COUNT, never a layer's module name.
        expect(bar.detail).toContain(`${expected.fetches.completed} of 21 records`)
        if (expected.detail) expect(bar.detail).toContain(DETAIL_COPY[expected.detail])
        expect(bar.detail).not.toMatch(/nhd|nfhl|ssurgo|naip|daymet|_/i)
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(readBar(ui).label).toBe('Measuring the terrain')

    // NOTHING ELSE EXPLAINS THE WAIT: no cycling phrase, no pulse.
    expect(ui.q('waiting-phrase-report')).toBeNull()
    expect(ui.page().querySelector('.chrome-banner__pulse')).toBeNull()
    await ui.unmount()
  })

  it('holds still on a stall, keeps naming it, eases its polls to three seconds, and snaps back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // THE FLOOD MAPS OUTSTANDING, poll after poll: the same count every time.
    const snapshots = [P.flood]
    const wire = installFetch({
      document: allCommitted(),
      jobPolls: Number.MAX_SAFE_INTEGER,
      jobSnapshots: snapshots,
    })
    const ui = await renderShell()
    await ui.generate()
    await tick(0)
    const held = readBar(ui)
    expect(held).toMatchObject({ percent: 22, label: STAGE_COPY.records })
    expect(held.detail).toContain('Flood maps')

    // FORTY SECONDS OF NOTHING COMPLETING. Checked every second: the bar and
    // the label are exactly what they were.
    for (let second = 0; second < 40; second += 1) {
      await tick(1000)
      expect(readBar(ui)).toEqual(held)
    }

    // THE PACE READ THE COUNT: a second while nothing had yet repeated five
    // times, then easing out, and never past three.
    const polls = wire.calls.filter((c) => c.path === '/api/jobs/job-r1').map((c) => c.at)
    const gaps = polls.slice(1).map((at, i) => at - polls[i])
    expect(gaps.slice(0, PROGRESS_STALL_POLLS - 1).every((gap) => gap === PROGRESS_POLL_DELAY_MS)).toBe(true)
    expect(Math.max(...gaps)).toBe(PROGRESS_STALLED_POLL_DELAY_MS)
    expect(gaps.at(-1)).toBe(PROGRESS_STALLED_POLL_DELAY_MS)
    expect(polls.length).toBeLessThan(20)

    // THE FLOOD MAPS ANSWER. The first poll that sees it moves the bar, and
    // the next poll is a second after it -- the pace snaps back.
    snapshots.splice(0, snapshots.length, { ...P.flood, fraction: 0.2667, percent: 26, completed: 7,
      fetches: { completed: 7, total: 21 }, detail: 'land_cover' })
    await tick(PROGRESS_STALLED_POLL_DELAY_MS)
    expect(readBar(ui).percent).toBe(26)
    expect(readBar(ui).detail).toContain('Land cover')
    const before = wire.calls.filter((c) => c.path === '/api/jobs/job-r1').length
    await tick(PROGRESS_POLL_DELAY_MS)
    expect(wire.calls.filter((c) => c.path === '/api/jobs/job-r1').length).toBe(before + 1)

    // AND PAST THE OLD 150 s THRESHOLD, NO LONG-WAIT LINE: the bar and its
    // label are the whole of what the wait says.
    await tick(160000)
    expect(ui.q('waiting-long-report')).toBeNull()
    expect(ui.q('waiting-phrase-report')).toBeNull()
    expect(readBar(ui).percent).toBe(26)
    await ui.unmount()
  })

  it('never draws a lower fraction than one it has already drawn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // A SNAPSHOT THAT WOULD GO BACKWARDS. The backend cannot send one; the
    // store refuses it anyway, so the bar cannot be the thing that lies.
    installFetch({
      document: allCommitted(),
      jobPolls: Number.MAX_SAFE_INTEGER,
      jobSnapshots: [P.flood, P.wetlands],
    })
    const ui = await renderShell()
    await ui.generate()
    await tick(0)
    expect(readBar(ui).percent).toBe(22)
    await tick(PROGRESS_POLL_DELAY_MS * 3)
    expect(readBar(ui).percent).toBe(22)
    expect(readBar(ui).fraction).toBeCloseTo(P.flood.fraction, 4)
    await ui.unmount()
  })

  it('stays where the run stopped when it fails, beside the notice -- not cleared, not completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installFetch({
      document: allCommitted(),
      jobPolls: 2,
      jobSnapshots: [P.wetlands, P.flood],
      reportTerminal: {
        job_id: 'job-r1',
        status: 'failed',
        error: {
          error: 'The report could not be generated: the Daily climate records could not be retrieved.',
          failed_layer: { type: 'daymet', label: 'Daily climate records', reason: 'source_unavailable' },
          report_failed: { actionable: true },
        },
        progress: { ...P.flood, failed: true },
      },
    })
    const ui = await renderShell()
    await ui.generate()
    await tick(5000)

    expect(ui.session.state.report.status).toBe('failed')
    const stopped = ui.q('report-stopped')
    expect(stopped, 'the bar is still there').not.toBeNull()
    expect(stopped.querySelector('[data-testid="report-progress"]').getAttribute('data-state')).toBe('failed')
    expect(readBar(ui).fraction).toBeCloseTo(P.flood.fraction, 4)
    expect(readBar(ui).percent).toBe(22)
    expect(readBar(ui).label).toBe('Stopped at 22%')
    expect(ui.failureNote(), 'and the failure says what happened').not.toBeNull()
    expect(ui.downloadLink()).toBeNull()
    expect(ui.waitingNote()).toBeNull()
    await ui.unmount()
  })
})

describe("4. the report's poll pace reads the count, not the clock", () => {
  it('is a second while the count advances, eases to three after five repeats, and snaps back', () => {
    const pace = progressPace()
    const at = (completed) => ({ status: 'running', progress: { completed } })
    expect([1, 2, 3].map((n) => pace(at(n)))).toEqual([1000, 1000, 1000])
    // Four repeats: still a second. The fifth and on: easing, capped at three.
    expect([3, 3, 3, 3].map((n) => pace(at(n)))).toEqual([1000, 1000, 1000, 1000])
    expect([3, 3, 3, 3].map((n) => pace(at(n)))).toEqual([1500, 2250, 3000, 3000])
    expect(pace(at(4))).toBe(1000)
  })
})

/* ===========================================================================
   5 + 6. THE TWO FAILURES, WHICH READ DIFFERENTLY
   =========================================================================== */

const EXPIRED_ERROR = {
  error:
    "session 'sess-report': step 'landform' is committed, but the generated run its " +
    'narrative is read from is no longer cached -- this session\'s working data has ' +
    'expired; reopen and recommit to generate a report.',
  session_expired: {
    session_id: SESSION_ID,
    step_id: 'landform',
    remedy: 'reopen_and_recommit',
  },
}

const UNAVAILABLE_ERROR = {
  error:
    'The report could not be generated. Something outside your design did not respond ' +
    '-- the narrative service or the map imagery. Your committed design is unharmed and ' +
    'nothing about it needs to change.',
  report_failed: { actionable: false },
}

async function failWith(error) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  installFetch({
    document: allCommitted(),
    jobPolls: 0,
    reportTerminal: { job_id: 'job-r1', status: 'failed', error },
  })
  const ui = await renderShell()
  await ui.generate()
  await React.act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  return ui
}

describe('5. an expired session says reopen and recommit', () => {
  it('names the remedy, and names it because of the KEY the payload carried', async () => {
    const ui = await failWith(EXPIRED_ERROR)

    expect(ui.session.state.report.status).toBe('failed')
    expect(ui.session.state.report.failure.kind).toBe('expired')
    const note = ui.failureNote()
    expect(note, 'the failure is on screen').not.toBeNull()
    expect(note.dataset.failure).toBe('expired')

    // THE ACTION IS IN THE COPY. This is the ONE report failure with
    // something behind it, and the whole reason the two kinds are kept apart.
    const text = note.textContent.toLowerCase()
    expect(text).toContain('reopen')
    expect(text).toContain('commit it again')
    // AND IT SAYS THE DESIGN IS SAFE, because it is -- the committed design
    // is in the Design Document and only the session's working data expired.
    expect(text).toContain('safe')
    // NOT AN ERROR ABOUT THEIR DESIGN.
    expect(text).not.toContain('invalid')
    expect(text).not.toContain('wrong with')

    // THE BUTTON IS STILL THERE, because the design is still finished. It is
    // not an invitation; it is the absence of a punishment for having pressed.
    expect(ui.generateButton()).not.toBeNull()
    expect(ui.generateButton().disabled).toBe(false)
    await ui.unmount()
  })
})

describe('6. a source failure does not suggest retrying differently', () => {
  it('says what happened and that the design is unharmed, and asks for nothing', async () => {
    const ui = await failWith(UNAVAILABLE_ERROR)

    expect(ui.session.state.report.failure.kind).toBe('unavailable')
    const note = ui.failureNote()
    expect(note.dataset.failure).toBe('unavailable')
    const text = note.textContent.toLowerCase()

    // THE CLAIM. There is no different attempt to make, so the copy must not
    // imply there is -- and it must not send someone back through their
    // design looking for a mistake they did not make.
    for (const forbidden of [
      'try again',
      'retry',
      'reopen',
      'recommit',
      'commit it again',
      'check your',
      'make sure',
      'please',
    ]) {
      expect(text, `the unactionable failure must not say "${forbidden}"`).not.toContain(forbidden)
    }

    // WHAT IT DOES SAY: what happened, and that the design is untouched.
    expect(text).toContain('did not answer')
    expect(text).toContain('nothing about your design is wrong')

    // AND IT IS NOT THE EXPIRED COPY. The two are different sentences because
    // they are different situations.
    expect(note.textContent).not.toBe(REPORT_FAILURE_COPY.expired)
    expect(note.textContent).toBe(REPORT_FAILURE_COPY.default)
    await ui.unmount()
  })

  it('reads an UNRECOGNISED failure shape as the one that asks for nothing', async () => {
    // BY THE KEY IT CARRIES, NEVER BY THE ONE IT LACKS. A client that read
    // "no session_expired" as "must be expired" would tell someone to reopen
    // and commit every step again -- the most expensive instruction this app
    // can give -- against something a recommit cannot touch.
    const ui = await failWith({ error: 'Something went wrong.' })
    expect(ui.session.state.report.failure.kind).toBe('unavailable')
    expect(ui.failureNote().textContent).toBe(REPORT_FAILURE_COPY.default)
    expect(ui.failureNote().textContent.toLowerCase()).not.toContain('reopen')
    await ui.unmount()
  })

  it('NAMES the source when the payload carries failed_layer, as session creation does', async () => {
    // WHAT A DAYMET OUTAGE SENDS: session_report._failed_layer_payload().
    // The generic copy used to render here, with the layer thrown away.
    const ui = await failWith({
      error:
        'The report could not be generated: the climate records could not be retrieved. ' +
        'Your committed design is unharmed and nothing about it needs to change.',
      failed_layer: { type: 'climate', label: 'climate records', reason: 'source_unavailable' },
      report_failed: { actionable: true },
    })
    const note = ui.failureNote()
    expect(ui.session.state.report.failure.failedLayer.type).toBe('climate')
    expect(note.dataset.failure).toBe('unavailable')
    expect(note.dataset.failedLayer, 'keyed on the stable type').toBe('climate')
    const text = note.textContent
    // THE LABEL, VERBATIM -- the backend's display prose, never reworded.
    expect(text).toContain('The climate records source did not respond')
    expect(text).not.toBe(REPORT_FAILURE_COPY.default)
    // AN OUTAGE PASSES, and the backend says a retry can help -- so this one
    // says to try again, in the session-creation notice's words.
    expect(text).toContain('Try again in a moment.')
    // NEVER THE DESIGN'S FAULT, and never the server's own sentence.
    expect(text.toLowerCase()).toContain('your design is unaffected')
    expect(text).not.toContain('could not be retrieved')
    expect(text.toLowerCase()).not.toContain('reopen')
    await ui.unmount()
  })

  it('says a source with NO DATA for this land will not change on another attempt', async () => {
    const ui = await failWith({
      error: 'There is no climate records data available for this land ...',
      failed_layer: { type: 'climate', label: 'climate records', reason: 'no_data_for_parcel' },
      report_failed: { actionable: false },
    })
    const text = ui.failureNote().textContent
    expect(text).toContain('climate records')
    expect(text).toContain('not an outage')
    for (const forbidden of ['try again', 'retry', 'reopen', 'recommit', 'check your', 'please']) {
      expect(text.toLowerCase(), `a permanent gap must not say "${forbidden}"`).not.toContain(forbidden)
    }
    await ui.unmount()
  })

  it('does not leave the last failure under a new attempt', async () => {
    const ui = await failWith(UNAVAILABLE_ERROR)
    expect(ui.failureNote()).not.toBeNull()

    // A SECOND ATTEMPT THAT DOES NOT RESOLVE, so what is asserted is the
    // state the PRESS puts the screen into rather than whatever the second
    // answer happens to be. Re-installed rather than parameterised: the point
    // is a fresh request, and a fresh request is a fresh wire.
    installFetch({ document: allCommitted(), jobPolls: Number.MAX_SAFE_INTEGER })
    await ui.generate()

    expect(ui.session.state.report.status).toBe('working')
    expect(ui.failureNote(), 'the old failure goes when a new request starts').toBeNull()
    // AND A LINK FROM A PREVIOUS REPORT WOULD GO WITH IT -- the slice is
    // replaced whole, so there is exactly one shape for "a request is out".
    expect(ui.session.state.report.download).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   7. THE RAIL IS STILL SEVEN ROWS
   =========================================================================== */

describe('7. the rail is unchanged -- no eighth row, and nothing below the rows', () => {
  it('lists the boundary and the six steps, with the report outside the list', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()

    const ids = ui.rows().map((li) => li.getAttribute('data-step-id'))
    expect(ids).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(ids).toHaveLength(RAIL_ROWS)
    expect(ids).not.toContain('report')

    // THE REPORT IS ON SCREEN AND IS NOT IN THE LIST. Both halves: a test
    // that only counted rows would pass on a build where the report was not
    // rendering at all.
    const action = ui.reportAction()
    expect(action, 'the report is rendered').not.toBeNull()
    expect(action.closest('ol'), 'and it is not inside the rail list').toBeNull()
    expect(action.closest('[data-testid="wizard-order"]')).toBeNull()
    // IT IS IN THE ACTION AREA, NOT THE RAIL. The rail is a progress
    // indicator and the report is not a step in it; a button hung below the
    // last row read as one that had lost its number.
    expect(action.closest('[data-testid="step-rail"]'), 'it is not in the rail').toBeNull()
    expect(action.closest('.chrome__actions'), 'it heads the action area').not.toBeNull()
    // AND IT IS NOT INSIDE THE STEP'S BANNER, which is step-scoped chrome and
    // keeps its own controls beneath it.
    expect(action.closest('.chrome-banner')).toBeNull()
    // NOTHING BELOW THE ROWS: the rail holds its list and only its list.
    const rail = ui.q('step-rail')
    expect([...rail.children].map((child) => child.tagName)).toEqual(['OL'])

    // AND NO DOCUMENT GREW A REPORT STEP.
    expect(ui.session.state.stepOrder).toEqual(STEP_ORDER)
    expect(ui.session.state.steps.report).toBeUndefined()
    expect(ui.cursor.order).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(STEP_DEFINITIONS.some((definition) => definition.id === 'report')).toBe(false)
    await ui.unmount()
  })

  it('is on the last step only, with that step\'s own control beneath it', async () => {
    // THE FINISH STATE IS THE END OF THE SEQUENCE. A finished design lands on
    // the last step, and that is where the card is; opening Water from the
    // rail to look at it shows Water's own committed chrome and no card.
    installFetch({ document: allCommitted() })
    const ui = await renderShell()
    expect(ui.cursor.cursorStepId).toBe('fencing')
    expect(ui.reportAction(), 'the card on the last step').not.toBeNull()

    // THE STEP'S OWN REOPEN STAYS, beneath it and in the same column -- the
    // only way back into the last step that does not cascade.
    const banner = ui.q('banner-fencing')
    expect(banner).not.toBeNull()
    expect(banner.closest('.chrome__actions')).toBe(ui.reportAction().closest('.chrome__actions'))
    expect(banner.closest('.chrome__actions').classList.contains('chrome__actions--delivering')).toBe(true)
    // ONE OXIDE: the card's. The reopen is secondary.
    expect(
      window.document.querySelectorAll('.chrome__actions .chrome-banner__button--primary')
    ).toHaveLength(1)
    expect(ui.q('edit-fencing').dataset.tone).toBe('secondary')

    for (const stepId of ['water', 'landform']) {
      await React.act(async () => {
        ui.cursor.open(stepId)
      })
      expect(ui.reportAction(), `no card while ${stepId} is open`).toBeNull()
      expect(ui.q(`edit-${stepId}`), `${stepId}'s own reopen is there`).not.toBeNull()
      expect(ui.container.querySelector('.chrome__actions--delivering')).toBeNull()
    }

    // BACK TO THE END, AND IT IS BACK.
    await React.act(async () => {
      ui.cursor.open('fencing')
    })
    expect(ui.reportAction()).not.toBeNull()
    await ui.unmount()
  })

  it('stands down while the last step is being reopened, and is gone once water is', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()

    // A REOPEN CONFIRMATION UP ON THE LAST STEP: someone on their way back
    // into the design. A finish card above that question would contradict it.
    await ui.press('edit-fencing')
    expect(ui.q('reopen-confirm-fencing')).not.toBeNull()
    expect(ui.reportAction(), 'no card over a reopen question').toBeNull()
    await ui.press('reopen-confirm-no-fencing')
    expect(ui.reportAction(), 'kept as it is: the card returns').not.toBeNull()

    // REOPENING WATER. The cascade puts water back to generated and every
    // step below it to not_started, so the design is not finished and there
    // is no card anywhere -- on water, where the cursor is, or at the end.
    await React.act(async () => {
      await ui.session.actions.reopen('water')
    })
    for (const stepId of ['water', 'fencing']) {
      await React.act(async () => {
        ui.cursor.open(stepId)
      })
      expect(ui.reportAction(), `no card on ${stepId} after water is reopened`).toBeNull()
    }
    await ui.unmount()
  })

  it('keeps seven rows through every report state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installFetch({ document: allCommitted(), jobPolls: 0 })
    const ui = await renderShell()
    const count = () => ui.rows().length

    expect(count()).toBe(RAIL_ROWS)
    await ui.generate()
    expect(count(), 'seven while it works').toBe(RAIL_ROWS)
    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(ui.downloadLink()).not.toBeNull()
    expect(count(), 'seven when it is ready').toBe(RAIL_ROWS)
    await ui.unmount()
  })
})

/* ===========================================================================
   8. THE REPORT PAGE: WHERE IT IS, WHAT IT SAYS, AND THE WAY BACK
   =========================================================================== */

describe('8. the report page', () => {
  // NO STEP CARD. A first visit's tutorial card auto-opens on arrival and is
  // a dialogue of its own; what is under test here is the page. A returning
  // user has the auto-open off.
  beforeEach(() => {
    window.localStorage.setItem(AUTO_KEY, JSON.stringify(false))
  })

  it('is a route the delivery card navigates to, with the session in the query', async () => {
    const wire = installFetch({ document: allCommitted() })
    const ui = await renderShell()
    expect(ui.page(), 'no page until it is asked for').toBeNull()
    const depth = window.history.length

    await ui.press('report-open')

    // THE URL CHANGED, AND IT CARRIES THE SESSION -- the same query resume
    // reads, so the page is linkable, survives a refresh and has somewhere
    // for a payment provider to return to.
    expect(window.location.pathname).toBe(REPORT_PATH)
    expect(new URLSearchParams(window.location.search).get('session')).toBe(SESSION_ID)
    expect(window.history.length, 'a pushed entry, so back works').toBe(depth + 1)
    expect(window.history.state).toEqual({ from: 'wizard' })
    expect(ui.page(), 'the page is up').not.toBeNull()
    expect(window.document.title).toContain(PAGE_TITLE)

    // THE SHELL IS STILL MOUNTED UNDER IT: the card is still in the tree.
    expect(ui.reportAction(), 'the wizard chrome was not unmounted').not.toBeNull()

    // NOTHING GENERATED, AND NO JOB: the arrival asked for the free pages
    // and nothing else of the session.
    expect(wire.calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect(wire.calls.filter((c) => c.path.startsWith('/api/jobs'))).toHaveLength(0)
    expect(wire.calls.filter((c) => c.path === PAGES_PATH)).toHaveLength(1)
    expect(ui.session.state.report.status).toBe('idle')
    await ui.unmount()
  })

  it('says what the report is, then four figures, then the user\'s own pages, then the contents, then the action', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()
    await ui.press('report-open')
    const page = ui.page()

    // THE HEADING FIRST, AND FOCUS ON IT.
    const h1 = page.querySelector('h1')
    expect(h1.textContent).toBe(PAGE_TITLE)
    expect(window.document.activeElement, 'focus moves to the page heading').toBe(h1)

    // THE ORDER, read off the document: lede, figures, own pages, contents, foot.
    const order = ['report-lede', 'report-figures', 'own-pages', 'report-contents', 'report-action'].map(
      (id) => ui.q(id)
    )
    for (const element of order) expect(element).not.toBeNull()
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${order[i].dataset.testid} follows ${order[i - 1].dataset.testid}`
      ).toBeTruthy()
    }

    // 1. WHAT IT IS: the desk study, the day's work, under a minute. Public
    // data, no exclusivity claimed.
    const lede = ui.q('report-lede').textContent.toLowerCase()
    expect(lede).toContain('desk study')
    expect(lede).toContain('site visit')
    expect(lede).toContain('under a minute')
    const text = page.textContent.toLowerCase()
    expect(text).toContain('public survey data')
    for (const claim of ['exclusive', 'proprietary', 'only we', 'nowhere else']) {
      expect(text).not.toContain(claim)
    }

    // 2. FOUR NAMED FIGURES, not eight summaries, and they are the four.
    const headings = [...page.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual([FIGURES_HEADING, OWN_PAGES_HEADING, CONTENTS_HEADING])
    const figures = [...ui.q('report-figures').querySelectorAll('li')]
    expect(figures).toHaveLength(4)
    expect(figures.map((li) => li.dataset.figure)).toEqual(KEY_FIGURES.map((f) => f.id))
    const names = figures.map((li) => li.querySelector('strong').textContent.toLowerCase())
    expect(names[0]).toContain('seasonal water table')
    expect(names[0]).toContain('month by month')
    expect(names[1]).toContain('road-construction ratings')
    expect(names[2]).toContain('site index by species')
    expect(names[3]).toContain('design storm depths')

    // 3. THE USER'S OWN PAGES: three, theirs, free, and said so.
    const own = page.textContent
    expect(own).toContain(OWN_PAGES_BODY)
    expect(OWN_PAGES_BODY.toLowerCase()).toContain('three')
    expect(OWN_PAGES_BODY.toLowerCase()).toContain('twenty-four')
    expect(OWN_PAGES_BODY.toLowerCase()).toContain('your own land')
    expect(OWN_PAGES_BODY.toLowerCase()).toContain('free')
    const images = [...ui.q('own-pages').querySelectorAll('img')]
    expect(images, 'three page images').toHaveLength(3)
    expect(images.map((img) => img.getAttribute('src'))).toEqual(
      [1, 2, 3].map((n) => `${API}${PAGES_PATH}/${n}?size=thumb`)
    )
    expect(images.map((img) => img.getAttribute('width'))).toEqual(['480', '480', '480'])
    expect([...ui.q('own-pages').querySelectorAll('figcaption')].map((c) => c.textContent)).toEqual([
      'III · Landform',
      'III · Landform, continued',
      'III · Landform, continued',
    ])
    // NO PROGRESS BAR FOR THEM, landed or not.
    expect(ui.q('own-pages-waiting')).toBeNull()
    expect(page.querySelector('[data-testid="own-pages"] .report-progress')).toBeNull()

    // 4. THE CONTENTS, as they read: eight sections ending on the design, no
    // back matter, the three phrases in weight.
    const contents = ui.q('report-contents')
    const sectionNames = [...contents.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(sectionNames).toEqual(REPORT_CONTENTS.map((section) => section.name))
    expect(sectionNames.at(-1)).toBe('The design')
    for (const absent of ['sources and methods', 'references', 'bibliography']) {
      expect(text, `the page does not list "${absent}"`).not.toContain(absent)
    }
    const keys = [...contents.querySelectorAll('[data-testid="report-key-line"]')].map((el) => el.textContent)
    expect(keys).toEqual([
      'the seasonal water table month by month',
      'what the soil survey says about building a lane',
      'what each species yields on this soil',
    ])

    // 5. THE ACTION, LAST -- and nothing that implies a price.
    expect(ui.generateButton().textContent).toBe(REPORT_LABEL)
    expect(ui.q('report-action').textContent).not.toMatch(/[$£€]|\bprice\b|\bbuy\b|\bpurchase\b/i)
    await ui.unmount()
  })

  it('opens one of its pages at full size, and the view is titled by the page, not a count', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()
    await ui.press('report-open')
    await ui.press('own-page-open-2')
    const view = ui.q('sample-view')
    expect(view, 'the maximised view opens').not.toBeNull()
    const titleId = view.querySelector('[role="dialog"]').getAttribute('aria-labelledby')
    expect(window.document.getElementById(titleId).textContent).toBe('III · Landform, continued')
    expect(view.querySelector('img').getAttribute('src')).toBe(`${API}${PAGES_PATH}/2`)
    await ui.key('Escape')
    expect(ui.q('sample-view')).toBeNull()
    expect(window.document.activeElement).toBe(ui.q('own-page-open-2'))
    await ui.unmount()
  })

  it('shows the page while the free pages come, and says so once; a failure says so and leaves the page readable', async () => {
    // HELD: the manifest never answers during this test.
    let release
    const held = new Promise((resolve) => (release = resolve))
    installFetch({ document: allCommitted() })
    const inner = globalThis.fetch
    globalThis.fetch = vi.fn(async (rawUrl, init) => {
      if (new URL(rawUrl, API).pathname === PAGES_PATH) await held
      return inner(rawUrl, init)
    })
    const ui = await renderShell()
    await ui.press('report-open')
    // READABLE WHILE IT WORKS: the lede, the figures, the contents and the
    // action are all there; the slots hold their place with one line.
    for (const id of ['report-lede', 'report-figures', 'report-contents', 'report-generate']) {
      expect(ui.q(id), `${id} is on screen during the wait`).not.toBeNull()
    }
    expect(ui.q('own-pages').dataset.status).toBe('pending')
    expect(ui.q('own-pages-waiting').textContent).toBe(OWN_PAGES_WAITING)
    expect(ui.page().querySelector('.report-progress'), 'no bar for a two-second wait').toBeNull()
    await React.act(async () => {
      release()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(ui.q('own-pages').dataset.status).toBe('ready')
    expect(ui.q('own-pages-waiting')).toBeNull()
    await ui.unmount()

    // THE ONE FAILURE: a 502 from a rebuild that could not refetch. The
    // cache forgotten first -- the pages above would otherwise be served.
    resetLandformPages()
    installFetch({ document: allCommitted(), pagesStatus: 502 })
    const failed = await renderShell()
    await failed.press('report-open')
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const note = failed.q('own-pages-failed')
    expect(note, 'the failure is said').not.toBeNull()
    expect(note.textContent.toLowerCase()).toContain('nothing about your design has changed')
    expect(note.textContent.toLowerCase()).not.toContain('error')
    expect(failed.generateButton(), 'the report itself is still offered').not.toBeNull()
    expect(failed.q('report-contents')).not.toBeNull()
    await failed.unmount()
  })

  it('goes back with the browser\'s own back, returns focus to the card\'s button, and asks the server for nothing', async () => {
    const wire = installFetch({ document: allCommitted() })
    const ui = await renderShell()
    ui.openButton().focus()
    await ui.press('report-open')
    expect(ui.page()).not.toBeNull()
    const link = ui.q('report-back')
    expect(link.textContent).toContain(BACK_LABEL)
    expect(link.getAttribute('href')).toBe(`/?session=${SESSION_ID}`)
    const before = wire.calls.length

    await ui.back()

    expect(window.location.pathname, 'back is the wizard').toBe('/')
    expect(new URLSearchParams(window.location.search).get('session'), 'with the session along').toBe(SESSION_ID)
    expect(ui.page(), 'the page is gone').toBeNull()
    expect(window.document.activeElement, 'focus returns to the button').toBe(ui.openButton())
    expect(window.document.title).not.toContain(PAGE_TITLE)
    // NO HYDRATION, NO FETCH OF ANY KIND: going back is the layer leaving.
    expect(wire.calls.length).toBe(before)

    // AND FORWARD AGAIN IS INSTANT: the pages were kept, nothing is refetched.
    await ui.press('report-open')
    expect(ui.q('own-pages').dataset.status).toBe('ready')
    expect(wire.calls.filter((c) => c.path === PAGES_PATH)).toHaveLength(1)
    await ui.unmount()
  })

  it('does not cancel a report when the person goes back mid-wait, and the card says it is under way', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // THE JOB KEEPS COUNTING WHILE THE PAGE IS NOT UP.
    installFetch({
      document: allCommitted(),
      jobPolls: Number.MAX_SAFE_INTEGER,
      jobSnapshots: [P.wetlands, P.wetlands, P.flood],
    })
    const ui = await renderShell()
    await ui.generate()
    expect(ui.generateButton().disabled).toBe(true)
    await ui.back()
    expect(ui.page()).toBeNull()
    expect(ui.session.state.report.status).toBe('working')
    expect(ui.q('delivery-state').textContent).toBe('Your report is being made.')
    // THE POLLS GO ON WITH NOBODY LOOKING.
    await tick(PROGRESS_POLL_DELAY_MS * 3)
    // AND OPENING IT AGAIN SHOWS WHERE THE JOB IS NOW, not where it was.
    await ui.press('report-open')
    expect(ui.generateButton().disabled).toBe(true)
    expect(ui.waitingNote()).not.toBeNull()
    expect(readBar(ui).percent).toBe(22)
    expect(readBar(ui).detail).toContain('Flood maps')
    await ui.unmount()
  })
})
