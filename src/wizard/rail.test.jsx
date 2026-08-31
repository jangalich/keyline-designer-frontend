/**
 * rail.test.jsx
 *
 * THE STEP RAIL SHOWS THE WHOLE PIPELINE FROM THE FIRST SCREEN, AND THE ORDER
 * IT SHOWS IT IN COMES FROM THE BACKEND EITHER WAY.
 *
 * WHAT WAS WRONG. The rail was one row long during the boundary step and seven
 * rows long after the first commit. The cause was not the rail: before POST
 * /api/sessions there is no document, so there is no `step_order`, so the rail
 * had nothing to enumerate and drew the honest one-row answer.
 *
 * The fix that was NOT taken is the one that would have been quickest -- six
 * step ids in a constant over here. design_document.document_body()'s own
 * docstring is an argument against exactly that, and it does not stop applying
 * because the session has not started yet: a second copy read ONLY by the
 * pre-session case is worse than a second copy read by everything, because a
 * drift between it and the backend would show on the first screen and nowhere
 * else, and it would show as six plausible step ids in a plausible order.
 *
 * So there are TWO SOURCES AND ONE ARRAY -- GET /api/steps before a session,
 * the document's own `step_order` after one -- and the thing worth testing is
 * that they agree and that the rail cannot tell them apart. Section 2 asserts
 * that agreement against a deliberately DIFFERENT catalogue, so a rail that
 * quietly kept reading the pre-session answer would fail rather than pass by
 * coincidence.
 *
 * WHY THIS FILE AND NOT wizard.test.jsx. That file is about the step schema
 * and the machine. This is about where a list comes from, which is a question
 * about the wire and the provider, and it wants a harness that can serve two
 * different orders and see which one wins.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { resetStepCatalog } from './stepCatalog.jsx'
import { BOUNDARY_STEP_ID, STEP_DEFINITIONS } from './stepDefinitions'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

/**
 * The backend's STEP_ORDER, as a fixture. It is written out because a test
 * fixture has to state what it expects -- the point of the assertions below is
 * that the RAIL does not hold a copy, not that this file does not.
 */
const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/** The one step this build has chrome for, besides the boundary. */
const REGISTERED = 'landform'

function serverDocument({ sessionId = 'sess-1', stepOrder = STEP_ORDER, steps = {} } = {}) {
  const entries = {}
  // Alphabetical, as Flask serialises it -- the whole reason `step_order`
  // travels as an array. A fixture that emitted them in pipeline order would
  // let a rail reading `Object.keys(steps)` pass.
  for (const stepId of [...stepOrder].sort()) {
    entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    document_revision: 0,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: [
      [-74.01, 40.7],
      [-74.0, 40.7],
      [-74.0, 40.71],
      [-74.01, 40.71],
    ],
    step_order: [...stepOrder],
    steps: entries,
  }
}

/* ===========================================================================
   Harness
   =========================================================================== */

/**
 * A fetch that answers /api/steps with `catalogue` and /api/sessions/<id> with
 * `document`, and records every path it was asked for.
 *
 * ONE DOCUMENT, DECLARED IN ONE PLACE. `renderRail({ resume })` resumes into
 * whatever THIS serves rather than taking a document of its own -- a harness
 * that let a test name two would let a test assert against a document the
 * store never saw, which is a green test over a broken rail.
 *
 * `catalogue: null` is a route that FAILS -- the no-backend case, which the
 * rail has to survive rather than render an error for.
 */
function installFetch({ catalogue = STEP_ORDER, document = null } = {}) {
  const calls = []
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    calls.push({ method: init.method ?? 'GET', path: url.pathname })

    if (url.pathname === '/api/steps') {
      if (catalogue === null) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ step_order: [...catalogue] }) }
    }
    if (document && url.pathname.startsWith('/api/sessions/')) {
      return { ok: true, status: 200, json: async () => document }
    }
    throw new Error(`no route for ${init.method ?? 'GET'} ${url.pathname}`)
  })
  return calls
}

async function renderRail({ resume = false } = {}) {
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
      <SessionProvider autoResume={false}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <Probe />
          <WizardShell />
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  // A document, through the store's OWN resume path -- GET /api/sessions/<id>
  // then hydrate. Not a hand-built state: the point of these assertions is
  // where the rail's order comes from, and reaching past the fetch to seed the
  // store would skip the half of that journey the store owns.
  if (resume) {
    await React.act(async () => {
      await session.actions.resume(typeof resume === 'string' ? resume : 'sess-1')
    })
  }

  const rows = () => [...container.querySelectorAll('[data-testid="wizard-order"] > li')]

  return {
    container,
    get cursor() {
      return cursor
    },
    /** Every rail row's step id, in the order the rail drew them. */
    order: () => rows().map((li) => li.getAttribute('data-step-id')),
    /** Every row's reachability, as the rail rendered it. */
    reachability: () =>
      Object.fromEntries(
        rows().map((li) => [
          li.getAttribute('data-step-id'),
          li.getAttribute('data-step-reachable') === 'true',
        ])
      ),
    cursorRow: () => rows().find((li) => li.getAttribute('data-cursor') === 'true')?.dataset.stepId,
    statusWord: (stepId) =>
      container.querySelector(`[data-testid="rail-${stepId}"] .chrome-rail__status`)?.textContent,
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  // One fetch per page is cached at module level; a test's catalogue must not
  // leak into the next test's rail.
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => vi.restoreAllMocks())

/* ===========================================================================
   1. THE RAIL AT THE BOUNDARY, WITH NO SESSION
   =========================================================================== */

describe('1. the rail at the boundary step', () => {
  it('renders every step with no session, boundary current and the rest not reachable', async () => {
    installFetch({ catalogue: STEP_ORDER })
    const ui = await renderRail()

    // THE WHOLE PIPELINE, before anything has been drawn: the boundary plus
    // the backend's six. Seven rows, because the boundary is a step of the
    // wizard and is deliberately NOT one of the document's six -- it is a
    // top-level field, not an entry in `steps`. The six are what /api/steps
    // serves; the seventh is this client's own.
    expect(ui.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    for (const stepId of STEP_ORDER) expect(ui.order()).toContain(stepId)

    // BOUNDARY IS CURRENT. It is the first uncommitted step, and with no
    // session that is what it is by definition.
    expect(ui.cursorRow()).toBe(BOUNDARY_STEP_ID)
    expect(
      ui.container.querySelector(`[data-testid="rail-${BOUNDARY_STEP_ID}"]`).getAttribute('aria-current')
    ).toBe('step')

    // AND THE REST ARE NOT REACHABLE -- all six of them, because nothing is
    // committed and reachability is "everything before this is committed".
    const reachable = ui.reachability()
    expect(reachable[BOUNDARY_STEP_ID]).toBe(true)
    for (const stepId of STEP_ORDER) {
      expect(reachable[stepId], `${stepId} must not be reachable yet`).toBe(false)
    }

    // IT READS AS NOT YET REACHABLE, not merely as data. The class the
    // stylesheet dims is on the row, and the status column says so in words.
    for (const stepId of STEP_ORDER) {
      const row = ui.container.querySelector(`[data-testid="rail-${stepId}"]`)
      expect(row.className).toContain('chrome-rail__step--ahead')
    }
    // A BUILT STEP SAYS WHAT IS TRUE OF IT: not yet. An unbuilt one says
    // something more specific -- not built yet -- and that outranks
    // reachability, because "you cannot get here" and "this does not exist" are
    // different answers to someone looking at a dimmed row.
    //
    // WATER MOVED FROM THE SECOND LIST TO THE FIRST, which is this branch's
    // doing and is the only change here: it has a definition now, so it says
    // the same thing landform says. The four still to come keep saying the
    // other thing, which is what keeps the distinction meaningful.
    expect(ui.statusWord(REGISTERED)).toBe('not yet')
    expect(ui.statusWord('water')).toBe('not yet')
    for (const unbuilt of ['roads', 'trees', 'structures', 'fencing']) {
      expect(ui.statusWord(unbuilt), `${unbuilt} has no definition yet`).toBe('not built yet')
    }

    // BOUNDARY IS NOT DIMMED and is fully usable: it is the step being asked
    // for, and the rail showing six rows behind it changes nothing about it.
    expect(
      ui.container.querySelector(`[data-testid="rail-${BOUNDARY_STEP_ID}"]`).className
    ).not.toContain('chrome-rail__step--ahead')

    await ui.unmount()
  })

  it('falls back to the boundary alone when the catalogue cannot be fetched', async () => {
    // NO BACKEND, NO ERROR. There is nothing a user could do about a failed
    // /api/steps and nothing for them to read; the rail is a shorter table of
    // contents, and the boundary step is fully usable while it is the only
    // row. An error banner over the map for this would be the more visible
    // failure and the less useful one.
    installFetch({ catalogue: null })
    const ui = await renderRail()

    expect(ui.order()).toEqual([BOUNDARY_STEP_ID])
    expect(ui.cursorRow()).toBe(BOUNDARY_STEP_ID)
    expect(ui.container.querySelector('[data-testid="step-boundary"]')).not.toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   2. ONE ARRAY, TWO SOURCES
   =========================================================================== */

describe('2. where the order comes from', () => {
  it('reads GET /api/steps before a session and step_order after, and they agree', async () => {
    const calls = installFetch({ catalogue: STEP_ORDER, document: serverDocument() })
    const ui = await renderRail()

    // PRE-SESSION: the route was asked, and its answer is what the rail drew.
    expect(calls.filter((c) => c.path === '/api/steps')).toHaveLength(1)
    const beforeSession = ui.order()
    expect(beforeSession).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])

    // POST-SESSION: the same rail, from the document's own array.
    const withDocument = await renderRail({ resume: true })
    const afterSession = withDocument.order()

    // THE TWO AGREE. This is the assertion the route exists for: the fallback
    // is a second SOURCE for one array, never a second array.
    expect(afterSession).toEqual(beforeSession)
    expect(afterSession).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])

    await withDocument.unmount()
    await ui.unmount()
  })

  it('lets the document override the catalogue, rather than the other way round', async () => {
    // THE DOCUMENT IS THE AUTHORITY, and this is what proves the ordering is
    // real rather than an accident of the two agreeing. The catalogue here is
    // deliberately WRONG for this document -- a different order, one step
    // short -- which is what a deploy that changed STEP_ORDER under an open
    // session would look like. The session keeps the order it was created
    // with, which is the only answer that could be right for it.
    const stale = ['fencing', 'structures', 'trees']
    installFetch({ catalogue: stale, document: serverDocument() })

    const before = await renderRail()
    expect(before.order()).toEqual([BOUNDARY_STEP_ID, ...stale])
    await before.unmount()

    const after = await renderRail({ resume: true })
    expect(after.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(after.order()).not.toEqual([BOUNDARY_STEP_ID, ...stale])
    await after.unmount()
  })

  it('never reads the order off the steps object, which Flask sorts', async () => {
    // The document fixture emits `steps` alphabetically, as Flask does. A rail
    // reading the keys would give six real step ids in a stable, wrong order
    // and nothing would throw -- which is the failure `step_order` exists to
    // prevent and the reason /api/steps serves an array rather than a map.
    const document = serverDocument()
    installFetch({ catalogue: STEP_ORDER, document })
    expect(Object.keys(document.steps)).toEqual([...STEP_ORDER].sort())

    const ui = await renderRail({ resume: true })
    expect(ui.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(ui.order().slice(1)).not.toEqual(Object.keys(document.steps))

    await ui.unmount()
  })

  it('marks steps reachable as commits land, and the rail follows', async () => {
    // The same rail, the same rendering: what changes as the pipeline advances
    // is which rows are reachable, not how many there are.
    installFetch({
      catalogue: STEP_ORDER,
      document: serverDocument({
        steps: {
          landform: {
            status: 'committed',
            revision: 1,
            features: { type: 'FeatureCollection', features: [] },
            provenance: {},
          },
        },
      }),
    })
    const ui = await renderRail({ resume: true })

    expect(ui.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])

    const reachable = ui.reachability()
    // Boundary and landform are committed, so water is now the first thing
    // you can get to; everything after it still is not.
    expect(reachable[BOUNDARY_STEP_ID]).toBe(true)
    expect(reachable.landform).toBe(true)
    expect(reachable.water).toBe(true)
    expect(reachable.roads).toBe(false)
    expect(reachable.fencing).toBe(false)
    expect(ui.statusWord('landform')).toBe('done')

    await ui.unmount()
  })
})
