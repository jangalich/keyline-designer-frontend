/**
 * report.test.jsx
 *
 * THE DELIVERY STATE AND THE REPORT OVERLAY: WHEN THEY EXIST, WHAT PRESSING
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
 * SessionProvider, the real WizardShell, the real step definitions. Every
 * document below comes INTO the store through its own resume path, so what is
 * asserted is what the rail renders from a document the store actually
 * hydrated -- not from a state a test reached in and wrote.
 *
 * THE CASES:
 *
 *   1. The delivery card renders only when EVERY step is committed.
 *   2. Reopening a MID-CHAIN step removes it -- the cascade is what does it.
 *   3. Generating from the overlay submits, polls, and produces a PDF link.
 *   4. The wait is a progress bar drawn from the job's own count: it moves
 *      only when a snapshot says work completed, holds on a stall with its
 *      label, never goes backwards, and stays where it stopped on failure.
 *      No cycling phrases, no pulse, no long-wait line.
 *   5. An expired session's message says reopen and recommit.
 *   6. A source failure's message does not suggest retrying differently;
 *      a NAMED source (`failed_layer`) is named.
 *   7. The rail's SEVEN ROWS are unchanged, and nothing hangs below them.
 *   8. The overlay: its contents, and its keyboard -- focus in, Tab held,
 *      Escape out, focus back to the button -- and dismissing it generates
 *      nothing.
 *
 * THE OVERLAY IS PORTALLED into the map stage, or <body> where there is no
 * stage -- which is the case here -- so the queries below read the document
 * rather than the shell's own container.
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
import {
  CLOSE_LABEL,
  OVERLAY_TITLE,
  REPORT_CONTENTS,
  REPORT_FAILURE_COPY,
  REPORT_LABEL,
} from './shell/ReportOverlay.jsx'
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

  // THE DOCUMENT, NOT THE CONTAINER: the overlay is portalled out of it.
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
    overlay: () => q('report-dialog'),
    generateButton: () => q('report-generate'),
    downloadLink: () => q('report-download'),
    failureNote: () => q('report-failure'),
    waitingNote: () => q('report-waiting'),
    async press(testid) {
      await React.act(async () => {
        q(testid).click()
      })
    },
    /** Open the overlay from the delivery card, then press generate in it. */
    async generate() {
      if (!q('report-dialog')) {
        await React.act(async () => {
          q('report-open').click()
        })
      }
      await React.act(async () => {
        q('report-generate').click()
      })
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
    // ONE ACTION, AND IT OPENS; IT DOES NOT GENERATE. Generation runs from
    // the overlay, one deliberate press further on.
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

describe('3. generating from the overlay submits, polls, and produces a downloadable PDF', () => {
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
 * the overlay is what the backend sends, not a shape written to suit them.
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

/** What the overlay's bar says right now. */
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
    expect(ui.overlay().querySelector('.chrome-banner__pulse')).toBeNull()
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
   8. THE OVERLAY: WHAT IT SAYS, AND THE KEYBOARD
   =========================================================================== */

describe('8. the overlay', () => {
  // NO STEP CARD. A first visit's tutorial card auto-opens on arrival and is
  // a dialogue of its own, with its own hold on Tab; what is under test here
  // is this dialogue's. A returning user has the auto-open off.
  beforeEach(() => {
    window.localStorage.setItem(AUTO_KEY, JSON.stringify(false))
  })

  it('lists the sections, ends on the design, and names no back matter', async () => {
    installFetch({ document: allCommitted() })
    const ui = await renderShell()
    await ui.press('report-open')

    const dialog = ui.overlay()
    expect(dialog, 'the overlay opens').not.toBeNull()
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const title = window.document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(title.textContent).toBe(OVERLAY_TITLE)

    const names = [...dialog.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(names).toEqual(REPORT_CONTENTS.map((section) => section.name))
    // ENDS ON THE DESIGN. The sources-and-methods pages are not listed.
    expect(names.at(-1)).toBe('The design')
    const text = dialog.textContent.toLowerCase()
    for (const absent of ['sources', 'methods', 'references', 'bibliography']) {
      expect(text, `the overlay does not list "${absent}"`).not.toContain(absent)
    }
    // NO EXCLUSIVITY CLAIMED: it says the data is public.
    expect(text).toContain('public survey data')
    for (const claim of ['exclusive', 'proprietary', 'only we', 'nowhere else']) {
      expect(text).not.toContain(claim)
    }

    // THE THREE LINES THAT DO THE MOST WORK, and they are the emphasised ones.
    const keys = [...dialog.querySelectorAll('[data-testid="report-key-line"]')].map(
      (el) => el.textContent
    )
    expect(keys).toEqual([
      'the seasonal water table month by month',
      'what the soil survey says about building a lane',
      'what each species yields on this soil',
    ])

    // NO PREVIEW, NO PLACEHOLDER, NO PRICE: no image, no frame, no currency.
    expect(dialog.querySelector('img, figure, iframe')).toBeNull()
    expect(dialog.textContent).not.toMatch(/[$£€]|\bprice\b|\bbuy\b|\bpurchase\b/i)

    // ONE ACTION, and it generates as it always has.
    expect(ui.generateButton().textContent).toBe(REPORT_LABEL)
    await ui.unmount()
  })

  it('takes focus, holds Tab inside, closes on Escape, and returns focus to the button', async () => {
    const wire = installFetch({ document: allCommitted() })
    const ui = await renderShell()

    ui.openButton().focus()
    await ui.press('report-open')
    const dialog = ui.overlay()
    expect(window.document.activeElement, 'focus moves into the dialog').toBe(dialog)
    expect(ui.openButton().getAttribute('aria-expanded')).toBe('true')

    // TAB IS HELD. From the dialog itself forward is the first control (the
    // close), shift+Tab off the first is the last (the action), and Tab off
    // the last wraps to the first.
    const close = dialog.querySelector(`[aria-label="${CLOSE_LABEL}"]`)
    const action = ui.generateButton()
    await ui.key('Tab')
    expect(window.document.activeElement).toBe(close)
    await ui.key('Tab', { shiftKey: true })
    expect(window.document.activeElement).toBe(action)
    await ui.key('Tab')
    expect(window.document.activeElement).toBe(close)

    // ESCAPE CLOSES, AND FOCUS GOES BACK TO WHAT OPENED IT.
    await ui.key('Escape')
    expect(ui.overlay(), 'Escape closes the overlay').toBeNull()
    expect(window.document.activeElement, 'focus returns to the button').toBe(ui.openButton())
    expect(ui.openButton().getAttribute('aria-expanded')).toBe('false')

    // DISMISSED WITHOUT GENERATING: nothing was asked of the server.
    expect(wire.calls.filter((c) => c.path.endsWith('/report'))).toHaveLength(0)
    expect(ui.session.state.report.status).toBe('idle')
    await ui.unmount()
  })

  it('closes from the × and from the dim, without generating', async () => {
    const wire = installFetch({ document: allCommitted() })
    const ui = await renderShell()
    await ui.press('report-open')
    await ui.press('report-close')
    expect(ui.overlay()).toBeNull()
    expect(window.document.activeElement).toBe(ui.openButton())
    await ui.press('report-open')
    await ui.press('report-backdrop')
    expect(ui.overlay()).toBeNull()
    expect(wire.calls.filter((c) => c.path.endsWith('/report'))).toHaveLength(0)
    await ui.unmount()
  })

  it('does not cancel a report when closed mid-wait, and the card says it is under way', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // THE JOB KEEPS COUNTING WHILE THE OVERLAY IS SHUT.
    installFetch({
      document: allCommitted(),
      jobPolls: Number.MAX_SAFE_INTEGER,
      jobSnapshots: [P.wetlands, P.wetlands, P.flood],
    })
    const ui = await renderShell()
    await ui.generate()
    // THE PRESS DISABLED THE BUTTON; FOCUS STAYED IN THE DIALOGUE.
    expect(window.document.activeElement).toBe(ui.overlay())
    await ui.key('Escape')
    expect(ui.overlay()).toBeNull()
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
