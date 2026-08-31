/**
 * SessionStore.test.jsx
 *
 * The nine tests this branch is answerable for. Numbered as in the brief, and
 * three of them are load-bearing rather than incidental:
 *
 *   2. WHOLESALE APPLICATION -- a commit response carrying a cascade is
 *      applied entirely, resets included, with nothing retained.
 *   3. 409 RECONCILIATION   -- the one shared path every step depends on.
 *   9. NO DERIVED DESIGN CONTENT -- an architectural assertion, written so it
 *      bites: the reducer is walked action by action and a rogue write is
 *      shown to fail.
 *
 * Vitest, run through the app's own Vite config (see vite.config.js), so the
 * tests compile the same way the shipped code does. React is driven with
 * React.act over a real createRoot rather than a testing library -- react-dom
 * is already a dependency and the provider's whole surface is one context
 * value, so there is nothing here a query API would make clearer.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ALL_ACTIONS,
  ACTIVE_STEP_SET,
  COMMITTED,
  DOCUMENT_HYDRATED,
  DRAFT_DISCARDED,
  DRAFT_INPUT_SET,
  DRAFT_SEEDED,
  DRAFT_SELECTION_SET,
  DRAFT_SELECTION_TOGGLED,
  DRAFT_SHAPE_ADDED,
  DRAFT_SHAPE_REMOVED,
  FEATURE_WRITING_ACTIONS,
  GENERATED,
  JOB_FORGOTTEN,
  JOB_OBSERVED,
  JOB_SUBMITTED,
  NOT_STARTED,
  RESUME_ABSENT,
  RESUME_STARTED,
  SESSION_CLEARED,
  SESSION_ERROR_SET,
  SESSION_STORAGE_KEY,
  STEP_ERROR_CLEARED,
  STEP_ERROR_SET,
  STEP_PROPOSALS_CLEARED,
  STEP_PROPOSALS_LOADED,
  SessionProvider,
  assertFeaturesCameFromServer,
  initialState,
  reducer,
  selectDownstreamSteps,
  selectFailedLayer,
  selectIsStepReachable,
  selectJobForStep,
  selectRejectionFor,
  selectStepFeatures,
  selectStepOrder,
  selectStepProposals,
  selectStepRejections,
  selectStepStatus,
  selectStepsResetByReopen,
  useSession,
} from './SessionStore'

/* ===========================================================================
   Fixtures
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

function featureCollection(...ids) {
  return {
    type: 'FeatureCollection',
    features: ids.map((id) => ({
      type: 'Feature',
      id,
      properties: { name: id },
      geometry: { type: 'Polygon', coordinates: [[[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.7]]] },
    })),
  }
}

/**
 * A Design Document AS THE WIRE DELIVERS IT.
 *
 * `steps` is assembled in ALPHABETICAL order on purpose. That is what actually
 * arrives: Flask's DefaultJSONProvider sets sort_keys = True, so the object the
 * backend builds in pipeline order is serialised fencing-first. Every ordering
 * assertion below is therefore a real test of the step_order field rather than
 * an accident of how the fixture happened to be typed.
 */
function serverDocument({ sessionId = 'sess-1', steps = {}, revision = 0 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) {
    entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    document_revision: revision,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: [[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.71]],
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

function committed(revision, features, extra = {}) {
  return {
    status: COMMITTED,
    revision,
    features,
    provenance: Object.fromEntries(features.features.map((f) => [f.id, 'generated'])),
    ...extra,
  }
}

const LAYERS_PAYLOAD = {
  suggested_zones: featureCollection('zone-1', 'zone-2', 'zone-3'),
  summary: { parcel_acres: 13.2 },
}

/**
 * A generate job's `done` result: BOTH HALVES.
 *
 * step_orchestrator.run_generate_job() returns {payload, document} -- the
 * step's layers and the document the generate moved to `generated`, the
 * latter byte-identical to what GET /api/sessions/{id} would serve. The store
 * hydrates both from this one response, which is why nothing below routes a
 * session GET after a generate.
 */
function generateResult(document = serverDocument({ steps: { landform: { status: GENERATED } } })) {
  return { payload: LAYERS_PAYLOAD, document }
}

function hydrateInto(state, document) {
  return reducer(state, { type: DOCUMENT_HYDRATED, document })
}

/* ===========================================================================
   HTTP harness
   =========================================================================== */

/**
 * A fetch double that routes on method + path and can answer differently on
 * successive calls, which is what a job poll needs (running, then done).
 */
function installFetch(routes) {
  const calls = []
  const cursors = new Map()

  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const method = init.method ?? 'GET'
    const path = new URL(rawUrl).pathname
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : null })

    const route = routes.find((r) => r.method === method && r.pattern.test(path))
    if (!route) throw new Error(`no route for ${method} ${path}`)

    const responses = Array.isArray(route.responses) ? route.responses : [route.responses]
    const index = Math.min(cursors.get(route) ?? 0, responses.length - 1)
    cursors.set(route, index + 1)
    const { status = 200, body } = responses[index]

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }
  })

  return calls
}

function route(method, pattern, responses) {
  return { method, pattern, responses }
}

/** Render a provider and hand back live access to its context value. */
async function renderProvider(props = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  let latest = null
  function Probe() {
    latest = useSession()
    return null
  }

  await React.act(async () => {
    root.render(
      <SessionProvider {...props}>
        <Probe />
      </SessionProvider>
    )
  })

  return {
    get state() {
      return latest.state
    },
    get actions() {
      return latest.actions
    },
    async run(fn) {
      let result
      await React.act(async () => {
        result = await fn(latest.actions)
      })
      return result
    },
    async advance(ms) {
      await React.act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. Hydration
   =========================================================================== */

describe('1. hydration', () => {
  it('populates the store from a document response, with every status matching', () => {
    const document = serverDocument({
      steps: {
        landform: committed(2, featureCollection('zone-1', 'zone-4'), { inputs: { keyline_offset: 3 } }),
        water: { status: GENERATED },
      },
    })

    const state = hydrateInto(initialState, document)

    expect(state.sessionId).toBe('sess-1')
    expect(Object.fromEntries(STEP_ORDER.map((id) => [id, selectStepStatus(state, id)]))).toEqual({
      landform: COMMITTED,
      water: GENERATED,
      roads: NOT_STARTED,
      trees: NOT_STARTED,
      structures: NOT_STARTED,
      fencing: NOT_STARTED,
    })

    expect(selectStepFeatures(state, 'landform')).toBe(document.steps.landform.features)
    expect(state.steps.landform.revision).toBe(2)
    expect(state.steps.landform.inputs).toEqual({ keyline_offset: 3 })
    // A step never committed reports base_revision 0, matching
    // design_document.commit_step()'s current.get("revision", 0).
    expect(state.steps.roads.revision).toBe(0)
    expect(selectStepFeatures(state, 'roads')).toBeNull()
  })

  it('takes the step order from step_order, not from the (alphabetised) steps keys', () => {
    const document = serverDocument()
    // What the wire actually delivers, and why reading the keys is a trap:
    expect(Object.keys(document.steps)).toEqual([
      'fencing', 'landform', 'roads', 'structures', 'trees', 'water',
    ])

    const state = hydrateInto(initialState, document)

    expect(selectStepOrder(state)).toEqual(STEP_ORDER)
    expect(selectDownstreamSteps(state, 'roads')).toEqual(['trees', 'structures', 'fencing'])
  })

  it('refuses a document with no step_order rather than guessing at one', () => {
    const document = serverDocument()
    delete document.step_order
    expect(() => hydrateInto(initialState, document)).toThrow(/step_order/)
  })

  it('reports reachability and the reopen cascade off the mirror', () => {
    const state = hydrateInto(
      initialState,
      serverDocument({
        steps: {
          landform: committed(1, featureCollection('zone-1')),
          water: committed(1, featureCollection('pond-1')),
          roads: { status: GENERATED },
        },
      })
    )

    expect(selectIsStepReachable(state, 'landform')).toBe(true)
    expect(selectIsStepReachable(state, 'roads')).toBe(true)
    expect(selectIsStepReachable(state, 'trees')).toBe(false)

    // The dialogue names what actually gets discarded -- roads holds work,
    // trees/structures/fencing were never reached.
    expect(selectDownstreamSteps(state, 'landform')).toEqual([
      'water', 'roads', 'trees', 'structures', 'fencing',
    ])
    expect(selectStepsResetByReopen(state, 'landform')).toEqual(['water', 'roads'])
  })
})

/* ===========================================================================
   2. WHOLESALE APPLICATION
   =========================================================================== */

describe('2. wholesale application of a commit response', () => {
  it('applies a cascade entirely -- no step retains stale features', () => {
    const staleWater = featureCollection('pond-1', 'pond-2')
    const staleRoads = featureCollection('road-1')

    const before = hydrateInto(
      initialState,
      serverDocument({
        steps: {
          landform: committed(1, featureCollection('zone-1')),
          water: committed(3, staleWater, { inputs: { dam_height_m: 2 } }),
          roads: committed(1, staleRoads),
        },
      })
    )
    // Proposals from a layers fetch sit alongside the mirror.
    const withProposals = reducer(before, {
      type: STEP_PROPOSALS_LOADED, stepId: 'water', payload: LAYERS_PAYLOAD,
    })

    expect(selectStepFeatures(withProposals, 'water')).toBe(staleWater)
    expect(selectStepFeatures(withProposals, 'roads')).toBe(staleRoads)

    // Re-committing landform resets everything downstream -- design_document's
    // _reset_downstream() writes a bare {status: not_started} for each.
    const after = hydrateInto(
      withProposals,
      serverDocument({
        revision: 4,
        steps: { landform: committed(2, featureCollection('zone-1', 'zone-7')) },
      })
    )

    expect(selectStepStatus(after, 'landform')).toBe(COMMITTED)
    expect(after.steps.landform.revision).toBe(2)

    for (const stepId of ['water', 'roads', 'trees', 'structures', 'fencing']) {
      expect(selectStepStatus(after, stepId)).toBe(NOT_STARTED)
      expect(selectStepFeatures(after, stepId)).toBeNull()
      expect(after.steps[stepId].provenance).toBeNull()
      expect(after.steps[stepId].inputs).toBeNull()
      // Revision drops to 0: a reset step reads as never committed, so its
      // next commit carries base_revision 0.
      expect(after.steps[stepId].revision).toBe(0)
      // Proposals are derived bulk data belonging to the step entry that was
      // just discarded, so they go with it.
      expect(selectStepProposals(after, stepId)).toBeNull()
    }

    // ASSERTED GLOBALLY, not just per key: neither stale collection survives
    // anywhere in the mirror. A patch-style update is exactly what would leave
    // one of these hanging off a step nobody thought to clear.
    const surviving = Object.values(after.steps).map((s) => s.features)
    expect(surviving).not.toContain(staleWater)
    expect(surviving).not.toContain(staleRoads)
  })

  it('drops a draft whose step the cascade reset, and keeps one whose step survived', () => {
    let state = hydrateInto(
      initialState,
      serverDocument({
        steps: {
          landform: committed(1, featureCollection('zone-1')),
          water: { status: GENERATED },
        },
      })
    )
    state = reducer(state, { type: DRAFT_SELECTION_SET, stepId: 'water', featureIds: ['pond-2'] })
    state = reducer(state, { type: DRAFT_SELECTION_SET, stepId: 'landform', featureIds: ['zone-1'] })

    const after = hydrateInto(
      state,
      serverDocument({ steps: { landform: committed(2, featureCollection('zone-1')) } })
    )

    // water was reset to not_started: its selections were made against a
    // candidate set the new landform commit invalidated.
    expect(after.drafts.water).toBeUndefined()
    // landform survived as a committed step, so its draft is still the user's.
    expect(after.drafts.landform.selectedFeatureIds).toEqual(['zone-1'])
  })
})

/* ===========================================================================
   3. 409 RECONCILIATION
   =========================================================================== */

describe('3. 409 reconciliation', () => {
  it('hydrates the carried document and preserves the draft', async () => {
    // The state another tab left behind: landform committed at revision 1.
    const conflictDocument = serverDocument({
      revision: 1,
      steps: { landform: committed(1, featureCollection('zone-9')) },
    })

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('POST', /\/steps\/landform\/commit$/, {
        status: 409,
        body: {
          error: "revision conflict on step 'landform': expected base_revision 1, received 0",
          step_id: 'landform',
          expected_base_revision: 1,
          received_base_revision: 0,
          document: conflictDocument,
        },
      }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01], [40.7, -74.0], [40.71, -74.0]]))
    await ui.run((a) => a.loadLayers('landform'))
    await ui.run((a) => a.setSelection('landform', ['zone-1', 'zone-3']))
    await ui.run((a) =>
      a.addDrawnFeature('landform', { type: 'Feature', id: 'drawn-1', properties: {}, geometry: null })
    )

    expect(ui.state.steps.landform.revision).toBe(0)

    const outcome = await ui.run((a) => a.commit('landform'))
    expect(outcome).toBe('conflict')

    // THE CARRIED DOCUMENT IS HYDRATED -- no second GET was needed to learn
    // the current state.
    expect(ui.state.document.document_revision).toBe(1)
    expect(selectStepStatus(ui.state, 'landform')).toBe(COMMITTED)
    expect(ui.state.steps.landform.revision).toBe(1)
    expect(selectStepFeatures(ui.state, 'landform')).toEqual(conflictDocument.steps.landform.features)

    // THE DRAFT SURVIVED, both halves of it. Its base step came back
    // `committed` rather than reset, so the user's work is still the user's
    // and the re-prompt has something to offer them.
    // THE DRAWN SHAPE IS IN THE SELECTION TOO. `selectedFeatureIds` is the set
    // a commit body is assembled from, and it covers every feature in the
    // draft rather than only the proposals -- so the tab strip's eye can take
    // a drawn zone out of the commit without destroying it. A drawn shape
    // joins the set the moment it is added: someone who has just drawn
    // something has said they want it.
    expect(ui.state.drafts.landform.selectedFeatureIds).toEqual(['zone-1', 'zone-3', 'drawn-1'])
    expect(ui.state.drafts.landform.drawnFeatures.map((f) => f.id)).toEqual(['drawn-1'])

    // And the re-prompt has a marker to render.
    expect(ui.state.steps.landform.error).toMatchObject({
      kind: 'conflict',
      expectedBaseRevision: 1,
      receivedBaseRevision: 0,
    })

    await ui.unmount()
  })

  it('does not treat an upstream-not-committed 409 as a conflict', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/water\/commit$/, {
        status: 409,
        body: {
          error: "step 'water' requires 'landform' to be committed",
          step_id: 'water',
          upstream_step: 'landform',
          upstream_status: 'not_started',
        },
      }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))
    const before = ui.state.document

    const outcome = await ui.run((a) => a.commit('water'))

    // A different path entirely: no document to hydrate, nothing to rebase,
    // and the mirror is untouched. It names the step to go back to.
    expect(outcome).toBe('step_state')
    expect(ui.state.document).toBe(before)
    expect(ui.state.steps.water.error).toMatchObject({
      kind: 'step_state',
      upstreamStep: 'landform',
      upstreamStatus: 'not_started',
    })

    await ui.unmount()
  })
})

/* ===========================================================================
   4. 422 rejections, per feature
   =========================================================================== */

describe('4. 422 commit rejection', () => {
  it('lands rejections per feature, addressable by feature_id', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('POST', /\/steps\/landform\/commit$/, {
        status: 422,
        body: {
          error: 'commit rejected',
          rejections: [
            { feature_id: 'zone-2', code: 'outside_eligible_area', reason: 'Zone 2 overlaps a wetland exclusion.' },
            { feature_id: 'zone-3', code: 'invalid_geometry', reason: 'Zone 3 self-intersects.' },
          ],
        },
      }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))
    await ui.run((a) => a.loadLayers('landform'))
    await ui.run((a) => a.setSelection('landform', ['zone-1', 'zone-2', 'zone-3']))

    const outcome = await ui.run((a) => a.commit('landform'))
    expect(outcome).toBe('rejected')

    // ADDRESSABLE BY FEATURE ID -- the map walks its own features and asks
    // about each one. Nothing is collapsed into a single message.
    expect(selectRejectionFor(ui.state, 'landform', 'zone-2')).toEqual({
      feature_id: 'zone-2',
      code: 'outside_eligible_area',
      reason: 'Zone 2 overlaps a wetland exclusion.',
    })
    expect(selectRejectionFor(ui.state, 'landform', 'zone-3').code).toBe('invalid_geometry')
    expect(selectRejectionFor(ui.state, 'landform', 'zone-1')).toBeNull()
    expect(Object.keys(selectStepRejections(ui.state, 'landform'))).toEqual(['zone-2', 'zone-3'])

    // A rejected commit is not a commit: the mirror did not move and the
    // draft is still there to fix.
    expect(selectStepStatus(ui.state, 'landform')).toBe(NOT_STARTED)
    expect(ui.state.drafts.landform.selectedFeatureIds).toHaveLength(3)

    await ui.unmount()
  })

  it('sends only server-produced features plus what the user drew', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('POST', /\/steps\/landform\/commit$/, {
        body: serverDocument({ steps: { landform: committed(1, featureCollection('zone-1')) } }),
      }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))
    await ui.run((a) => a.loadLayers('landform'))
    await ui.run((a) => a.toggleSelection('landform', 'zone-1'))
    await ui.run((a) =>
      a.addDrawnFeature('landform', { type: 'Feature', id: 'drawn-1', properties: {}, geometry: null })
    )
    await ui.run((a) => a.setDraftInput('landform', 'keyline_offset', 3))
    await ui.run((a) => a.commit('landform'))

    const body = calls.find((c) => c.path.endsWith('/commit')).body
    expect(body.base_revision).toBe(0)
    expect(body.features.type).toBe('FeatureCollection')
    expect(body.features.features.map((f) => f.id)).toEqual(['zone-1', 'drawn-1'])
    // Two kinds of provenance and only two -- there is no 'user_modified'.
    expect(body.provenance).toEqual({ 'zone-1': 'generated', 'drawn-1': 'user_added' })
    expect(body.inputs).toEqual({ keyline_offset: 3 })

    // The selected feature is the server's own object, passed through untouched.
    expect(body.features.features[0]).toEqual(LAYERS_PAYLOAD.suggested_zones.features[0])

    // A successful commit clears the draft: it is in the document now.
    expect(ui.state.drafts.landform).toBeUndefined()

    await ui.unmount()
  })
})

/* ===========================================================================
   5. Job lifecycle
   =========================================================================== */

describe('5. job lifecycle', () => {
  it('goes submitted -> running -> done, with the result in the store', async () => {
    vi.useFakeTimers()

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, { status: 202, body: { job_id: 'job-1', status: 'running' } }),
      route('GET', /^\/api\/jobs\/job-1$/, [
        { body: { job_id: 'job-1', status: 'running' } },
        { body: { job_id: 'job-1', status: 'done', result: generateResult() } },
      ]),
      // NO ROUTE FOR GET /api/sessions/sess-1, deliberately. installFetch()
      // throws on an unrouted request, so a store that went back for the
      // document fails here rather than passing quietly on a second fetch.
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))

    let done
    await React.act(async () => {
      done = ui.actions.generate('landform')
    })

    // The first poll has already been answered: running.
    expect(selectJobForStep(ui.state, 'landform')).toMatchObject({ jobId: 'job-1', status: 'running' })

    await ui.advance(1000)
    const ok = await ui.run(() => done)

    expect(ok).toBe(true)
    expect(selectJobForStep(ui.state, 'landform')).toMatchObject({ status: 'done', error: null })
    expect(selectJobForStep(ui.state, 'landform').result).toEqual(generateResult())
    // The PAYLOAD half became the proposals; the document half was hydrated.
    expect(selectStepProposals(ui.state, 'landform')).toEqual(LAYERS_PAYLOAD)

    // The status came from the document the JOB carried -- still a server
    // document, still never a local patch, and now with no second request.
    expect(selectStepStatus(ui.state, 'landform')).toBe(GENERATED)
    expect(
      globalThis.fetch.mock.calls.filter(([u]) => new URL(u).pathname === '/api/sessions/sess-1')
    ).toHaveLength(0)

    await ui.unmount()
  })

  it('supersedes a running generate when a second one is submitted', async () => {
    vi.useFakeTimers()

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, [
        { status: 202, body: { job_id: 'job-1', status: 'running' } },
        { status: 202, body: { job_id: 'job-2', status: 'running' } },
      ]),
      route('GET', /^\/api\/jobs\/job-1$/, { body: { job_id: 'job-1', status: 'running' } }),
      route('GET', /^\/api\/jobs\/job-2$/, { body: { job_id: 'job-2', status: 'done', result: generateResult() } }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))

    let first
    await React.act(async () => {
      first = ui.actions.generate('landform')
    })
    expect(selectJobForStep(ui.state, 'landform').jobId).toBe('job-1')

    let second
    await React.act(async () => {
      second = ui.actions.generate('landform')
    })

    await ui.run(() => Promise.all([first, second]))

    // ONE ANSWER, NOT A RACE. The first job is dropped from the store the
    // moment it is superseded; it keeps running server-side, harmlessly.
    expect(ui.state.jobs['job-1']).toBeUndefined()
    expect(selectJobForStep(ui.state, 'landform')).toMatchObject({ jobId: 'job-2', status: 'done' })

    await ui.unmount()
  })

  it('stops polling when the provider unmounts mid-job', async () => {
    vi.useFakeTimers()

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, { status: 202, body: { job_id: 'job-1', status: 'running' } }),
      route('GET', /^\/api\/jobs\/job-1$/, { body: { job_id: 'job-1', status: 'running' } }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))

    await React.act(async () => {
      ui.actions.generate('landform')
    })
    const pollsBefore = globalThis.fetch.mock.calls.filter(([u]) => u.includes('/api/jobs/')).length
    expect(pollsBefore).toBe(1)

    await ui.unmount()

    // The abort has to reach the SLEEP, not just the fetch: most of a poll
    // cycle is spent waiting, and a backoff already at seconds would otherwise
    // fire one more request into an unmounted tree.
    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    const pollsAfter = globalThis.fetch.mock.calls.filter(([u]) => u.includes('/api/jobs/')).length
    expect(pollsAfter).toBe(pollsBefore)
  })
})

/* ===========================================================================
   6. Job failure
   =========================================================================== */

describe('6. job failure', () => {
  it('surfaces a 200-whose-body-failed as a failure with failed_layer intact', async () => {
    const failure = {
      job_id: 'job-1',
      status: 'failed',
      error: {
        error: 'Production zones could not be generated.',
        failed_layer: { type: 'canopy', label: 'tree canopy height' },
      },
    }

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, { status: 202, body: { job_id: 'job-1', status: 'running' } }),
      // HTTP 200. A finished-with-failure job is a SUCCESSFUL poll.
      route('GET', /^\/api\/jobs\/job-1$/, { status: 200, body: failure }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))
    const ok = await ui.run((a) => a.generate('landform'))

    expect(ok).toBe(false)

    const job = selectJobForStep(ui.state, 'landform')
    expect(job.status).toBe('failed')
    // NOT a successful result: the absent half of the snapshot is absent.
    expect(job.result).toBeNull()
    expect(job.error.failed_layer).toEqual({ type: 'canopy', label: 'tree canopy height' })

    // Branch on the stable type, display the label -- what the existing panel
    // already does against the older endpoint.
    expect(selectFailedLayer(ui.state, 'landform')).toEqual({ type: 'canopy', label: 'tree canopy height' })

    // A failed generate is not a generate: the document did not move, and this
    // is not a transport error either.
    expect(selectStepStatus(ui.state, 'landform')).toBe(NOT_STARTED)
    expect(ui.state.error).toBeNull()
    expect(ui.state.steps.landform.error).toBeNull()

    await ui.unmount()
  })

  it('recovers a 404-on-poll through the layers endpoint instead of reporting failure', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, { status: 202, body: { job_id: 'job-1', status: 'running' } }),
      route('GET', /^\/api\/jobs\/job-1$/, { status: 404, body: { error: 'unknown job' } }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderProvider({ autoResume: false })
    await ui.run((a) => a.startSession([[40.7, -74.01]]))
    const ok = await ui.run((a) => a.generate('landform'))

    // An evicted job is not a failed one -- the work may well have landed.
    expect(ok).toBe(true)
    expect(selectStepProposals(ui.state, 'landform')).toEqual(LAYERS_PAYLOAD)
    expect(selectFailedLayer(ui.state, 'landform')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   7. Resume
   =========================================================================== */

describe('7. resume', () => {
  it('hydrates on load from a session id in the URL', async () => {
    window.history.replaceState({}, '', '/?session=sess-1')
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({ steps: { landform: committed(1, featureCollection('zone-1')) } }),
      }),
    ])

    const ui = await renderProvider()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/sessions/sess-1' })
    expect(ui.state.resume).toBe('ready')
    expect(ui.state.sessionId).toBe('sess-1')
    expect(selectStepStatus(ui.state, 'landform')).toBe(COMMITTED)

    // Resume is the document and nothing else -- no speculative layers fetch.
    expect(calls.filter((c) => c.path.includes('/layers'))).toHaveLength(0)

    await ui.unmount()
  })

  it('prefers the URL over a different id in localStorage', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'sess-stored')
    window.history.replaceState({}, '', '/?session=sess-1')
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/sess-1$/, { body: serverDocument() }),
    ])

    const ui = await renderProvider()
    expect(calls[0].path).toBe('/api/sessions/sess-1')
    await ui.unmount()
  })

  it('falls back to localStorage when the URL carries nothing', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'sess-1')
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/sess-1$/, { body: serverDocument() }),
    ])

    const ui = await renderProvider()
    expect(calls[0].path).toBe('/api/sessions/sess-1')
    // The id is put back in the URL so the tab is now a shareable handle.
    expect(new URLSearchParams(window.location.search).get('session')).toBe('sess-1')
    await ui.unmount()
  })
})

/* ===========================================================================
   8. Resume 404
   =========================================================================== */

describe('8. resume 404', () => {
  it('clears the stored id and starts fresh, with no error state', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'sess-gone')
    window.history.replaceState({}, '', '/?session=sess-gone')
    installFetch([
      route('GET', /^\/api\/sessions\/sess-gone$/, { status: 404, body: { error: 'session not found' } }),
    ])

    const ui = await renderProvider()

    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(new URLSearchParams(window.location.search).get('session')).toBeNull()
    expect(ui.state.sessionId).toBeNull()
    expect(ui.state.resume).toBe('absent')

    // A STALE BOOKMARK IS NOT A FAILURE STATE. There is nothing the user could
    // do about it, so there is nothing for them to dismiss.
    expect(ui.state.error).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   9. NO DERIVED DESIGN CONTENT
   =========================================================================== */

describe('9. no derived design content', () => {
  /** Representative payloads, one per action type, so the walk below is total. */
  function representativeActions(document) {
    return {
      [DOCUMENT_HYDRATED]: { type: DOCUMENT_HYDRATED, document },
      [SESSION_CLEARED]: { type: SESSION_CLEARED },
      [RESUME_STARTED]: { type: RESUME_STARTED },
      [RESUME_ABSENT]: { type: RESUME_ABSENT },
      [SESSION_ERROR_SET]: { type: SESSION_ERROR_SET, error: { kind: 'network', message: 'x' } },
      [ACTIVE_STEP_SET]: { type: ACTIVE_STEP_SET, stepId: 'water' },
      [STEP_PROPOSALS_LOADED]: { type: STEP_PROPOSALS_LOADED, stepId: 'water', payload: LAYERS_PAYLOAD },
      [STEP_PROPOSALS_CLEARED]: { type: STEP_PROPOSALS_CLEARED, stepId: 'water' },
      [STEP_ERROR_SET]: { type: STEP_ERROR_SET, stepId: 'water', error: { kind: 'rejected' } },
      [STEP_ERROR_CLEARED]: { type: STEP_ERROR_CLEARED, stepId: 'water' },
      [DRAFT_SEEDED]: {
        type: DRAFT_SEEDED,
        stepId: 'water',
        selectedFeatureIds: ['pond-1'],
        drawnFeatures: [],
      },
      [DRAFT_SELECTION_SET]: { type: DRAFT_SELECTION_SET, stepId: 'water', featureIds: ['pond-1'] },
      [DRAFT_SELECTION_TOGGLED]: { type: DRAFT_SELECTION_TOGGLED, stepId: 'water', featureId: 'pond-1' },
      [DRAFT_SHAPE_ADDED]: {
        type: DRAFT_SHAPE_ADDED,
        stepId: 'water',
        // A user-drawn Feature: client-authored, and legitimately so. It goes
        // into the DRAFT, never into steps[].features.
        feature: { type: 'Feature', id: 'drawn-1', properties: {}, geometry: null },
      },
      [DRAFT_SHAPE_REMOVED]: { type: DRAFT_SHAPE_REMOVED, stepId: 'water', featureId: 'drawn-1' },
      [DRAFT_INPUT_SET]: { type: DRAFT_INPUT_SET, stepId: 'roads', key: 'access_point', value: [40.7, -74.0] },
      [DRAFT_DISCARDED]: { type: DRAFT_DISCARDED, stepId: 'water' },
      [JOB_SUBMITTED]: { type: JOB_SUBMITTED, jobId: 'job-1', stepId: 'water' },
      [JOB_OBSERVED]: { type: JOB_OBSERVED, snapshot: { job_id: 'job-1', status: 'done', result: LAYERS_PAYLOAD } },
      [JOB_FORGOTTEN]: { type: JOB_FORGOTTEN, jobId: 'job-1' },
    }
  }

  const seeded = () =>
    hydrateInto(
      initialState,
      serverDocument({
        steps: {
          landform: committed(1, featureCollection('zone-1')),
          water: committed(2, featureCollection('pond-1'), { inputs: { dam_height_m: 2 } }),
        },
      })
    )

  it('has a representative action for every action the reducer declares', () => {
    // If this fails, a new action type was added without being considered
    // against rule 2 -- which is the point of the list.
    expect(Object.keys(representativeActions(serverDocument())).sort()).toEqual([...ALL_ACTIONS].sort())
  })

  it('never writes a features value that did not come from a server response', () => {
    const before = seeded()
    const document = serverDocument({ steps: { landform: committed(2, featureCollection('zone-5')) } })
    const actions = representativeActions(document)

    for (const type of ALL_ACTIONS) {
      const after = reducer(before, actions[type])

      // The invariant itself: every features value is either the one it
      // already had, or the one this action's own server document carried.
      // There is no third provenance.
      expect(() => assertFeaturesCameFromServer(before, after, actions[type])).not.toThrow()

      if (!FEATURE_WRITING_ACTIONS.includes(type)) {
        for (const stepId of STEP_ORDER) {
          expect(after.steps[stepId].features).toBe(before.steps[stepId].features)
        }
      }
    }
  })

  it('sources a hydrated features value from the response object itself, by reference', () => {
    const document = serverDocument({ steps: { landform: committed(2, featureCollection('zone-5')) } })
    const after = hydrateInto(seeded(), document)
    expect(after.steps.landform.features).toBe(document.steps.landform.features)
  })

  it('BITES: a fabricated features value fails the assertion', () => {
    const before = seeded()
    const rogue = {
      ...before,
      steps: {
        ...before.steps,
        // What a "just patch it locally" shortcut looks like -- a plausible
        // FeatureCollection this client made up.
        water: { ...before.steps.water, features: featureCollection('pond-1', 'pond-invented') },
      },
    }
    expect(() =>
      assertFeaturesCameFromServer(before, rogue, { type: DRAFT_SHAPE_ADDED })
    ).toThrow(/did not come from a server document/)
  })

  it('keeps user-drawn geometry in the draft, out of the mirror', () => {
    const drawn = { type: 'Feature', id: 'drawn-1', properties: {}, geometry: null }
    const after = reducer(seeded(), { type: DRAFT_SHAPE_ADDED, stepId: 'water', feature: drawn })

    expect(after.drafts.water.drawnFeatures).toEqual([drawn])
    // The one legitimately client-authored thing in this store did not reach
    // the committed feature set.
    expect(selectStepFeatures(after, 'water').features.map((f) => f.id)).toEqual(['pond-1'])
  })
})
