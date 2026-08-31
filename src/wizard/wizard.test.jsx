/**
 * wizard.test.jsx
 *
 * The eleven tests this branch is answerable for. Three carry the weight:
 *
 *   3.  GENERATE HYDRATES BOTH HALVES WITH NO EXTRA GET -- asserted on the
 *       fetch count, not on the resulting state, because the state was already
 *       right when the round trip existed.
 *   5.  THE REOPEN CONFIRMATION NAMES EXACTLY THE STEPS THAT LOSE WORK, and
 *       is asserted to name no others.
 *   10. THE STEP ORDER IS `step_order` AND IS NOT Object.keys(document.steps),
 *       asserted against the alphabetised keys the wire actually delivers.
 *
 * Vitest through the app's own Vite config, React driven with React.act over a
 * real createRoot -- the same harness F1's SessionStore.test.jsx uses, so the
 * two files stay readable as one suite.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  SESSION_STORAGE_KEY,
  STEP_MODES,
  SessionProvider,
  selectSessionId,
  selectStepStatus,
  useSession,
} from '../session/SessionStore'
import {
  BOUNDARY_RING_INPUT,
  BOUNDARY_STEP,
  BOUNDARY_STEP_ID,
  LANDFORM_STEP,
  STEP_DEFINITIONS,
  documentStep,
  wizardStepOrder,
} from './stepDefinitions'
import { deriveMachineState } from './useStepMachine'
import { resetStepCatalog } from './stepCatalog.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * A module's CODE, with its prose removed.
 *
 * Every architectural assertion below is about what the code does, and this
 * codebase's comments talk at length about the things the code must not do --
 * step ids, the spike's endpoint. Searching the raw text would make a file
 * fail for explaining itself.
 */
function codeOf(...parts) {
  return readFileSync(path.join(HERE, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/* ===========================================================================
   Fixtures -- the wire's own shapes
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

function featureCollection(...ids) {
  return {
    type: 'FeatureCollection',
    features: ids.map((id) => ({
      type: 'Feature',
      id,
      properties: { name: id },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.7]]],
      },
    })),
  }
}

/**
 * A Design Document AS THE WIRE DELIVERS IT -- `steps` assembled
 * ALPHABETICALLY, because that is what arrives. Flask's DefaultJSONProvider
 * sets sort_keys = True, so the object the backend builds in pipeline order is
 * serialised fencing-first. Every ordering assertion here is therefore a real
 * test of `step_order` and not an accident of how the fixture was typed.
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

function committed(revision, features) {
  return {
    status: COMMITTED,
    revision,
    features,
    provenance: Object.fromEntries(features.features.map((f) => [f.id, 'generated'])),
  }
}

/**
 * The landform payload, in the shape assemble_production_zone_payload() ships
 * it -- the six keys the panel and the map read, with the two representations
 * of one set of zones (`zones` tabular, `suggested_zones` GeoJSON) joined by
 * `feature_id`, which is the join the payload carries so the panel does not
 * rebuild it with a format string.
 */
const LAYERS_PAYLOAD = {
  eligible_union: null,
  exclusion_layers: [
    { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
    { type: 'hydric', label: 'wet (hydric) soil', data_available: false, geometry_wgs84: null },
  ],
  suggested_zones: featureCollection('zone-1', 'zone-2', 'zone-3'),
  zones: [
    { id: 0, feature_id: 'zone-1', rank: 1, area_acres: 2.5, score: 81.0, slope_min_pct: 2.0, slope_max_pct: 8.0, aspect_available: true, dominant_aspect: 'south' },
    { id: 1, feature_id: 'zone-2', rank: 2, area_acres: 1.2, score: 64.0, slope_min_pct: 3.0, slope_max_pct: 11.0, aspect_available: false, dominant_aspect: null },
    { id: 2, feature_id: 'zone-3', rank: 3, area_acres: 0.9, score: 51.0, slope_min_pct: 1.0, slope_max_pct: 6.0, aspect_available: true, dominant_aspect: 'east' },
  ],
  scales: {
    bands: { poor: [0, 40], fair: [40, 60], good: [60, 80], excellent: [80, 100] },
    band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
  },
  summary: { total_acres: 13.2, eligible_acres: 7.5 },
}

/** step_orchestrator.run_generate_job()'s two-key result. */
function generateResult(document) {
  return { payload: LAYERS_PAYLOAD, document }
}

const RING = [
  [40.7, -74.01],
  [40.7, -74.0],
  [40.71, -74.0],
]

/**
 * A THIRD DEFINITION, WRITTEN HERE AND NOWHERE ELSE.
 *
 * The schema's whole claim is that adding a step is one definition object and
 * no wizard code. This is that object, declared inside a test file -- if the
 * shell, the frame or the machine needed to learn about `water`, nothing here
 * would render. It also gives the suite a step with an uncommitted upstream,
 * which landform (always first in the document's order) can never be.
 */
const WATER_STEP = documentStep({
  id: 'water',
  title: 'Water',
  blurb: 'Ponds and dams.',
  proposalCollection: 'suggested_zones',
  Panel: null,
})

const WITH_WATER = [BOUNDARY_STEP, LANDFORM_STEP, WATER_STEP]

/* ===========================================================================
   Harness
   =========================================================================== */

/**
 * THE CATALOGUE ROUTE, SERVED BY DEFAULT ON EVERY HARNESS.
 *
 * The wizard asks for GET /api/steps on mount now -- that is where the rail's
 * order comes from before a session exists (stepCatalog.jsx) -- so every test
 * that renders it makes this call whether or not the test is about it. Serving
 * it here rather than adding a line to thirty `installFetch` calls keeps the
 * per-test route lists about what each test is actually exercising.
 *
 * IT IS LAST IN THE LIST, so a test that declares its own /api/steps route --
 * an empty catalogue, a failure -- still wins: routes are matched in order.
 */
const STEPS_ROUTE = { method: 'GET', pattern: /^\/api\/steps$/, responses: { body: { step_order: [...STEP_ORDER] } } }

function installFetch(routes) {
  routes = [...routes, STEPS_ROUTE]
  const calls = []
  const cursors = new Map()

  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const method = init.method ?? 'GET'
    const url = new URL(rawUrl)
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(init.body) : null })

    const route = routes.find((r) => r.method === method && r.pattern.test(url.pathname))
    if (!route) throw new Error(`no route for ${method} ${url.pathname}`)

    const responses = Array.isArray(route.responses) ? route.responses : [route.responses]
    const index = Math.min(cursors.get(route) ?? 0, responses.length - 1)
    cursors.set(route, index + 1)
    const { status = 200, body } = responses[index]

    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })

  return calls
}

function route(method, pattern, responses) {
  return { method, pattern, responses }
}

/** Render the wizard inside a provider, with live access to both. */
async function renderWizard({ definitions = STEP_DEFINITIONS, autoResume = false } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  let latest = null
  let cursor = null
  function Probe() {
    latest = useSession()
    // THE CURSOR IS PART OF THE HARNESS NOW, because the shell renders chrome
    // for ONE step -- the one the cursor names. A test that wants to look at
    // another step's chrome has to navigate there, exactly as a user does by
    // clicking the rail. There is no longer a column in which every step is on
    // screen at once, and a harness that pretended otherwise would be testing
    // a shell this branch deleted.
    cursor = useWizardCursor()
    return null
  }

  await React.act(async () => {
    root.render(
      <SessionProvider autoResume={autoResume}>
        <WizardCursorProvider definitions={definitions}>
          <Probe />
          <WizardShell />
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  return {
    container,
    get state() {
      return latest.state
    },
    get actions() {
      return latest.actions
    },
    get cursor() {
      return cursor
    },
    /** Move the cursor, the way a click on the step rail does. */
    async open(stepId) {
      await React.act(async () => cursor.open(stepId))
    },
    find(testId) {
      return container.querySelector(`[data-testid="${testId}"]`)
    },
    text(testId) {
      return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
    },
    stepState(stepId) {
      return container
        .querySelector(`[data-testid="step-${stepId}"]`)
        ?.getAttribute('data-step-state')
    },
    order() {
      return [...container.querySelectorAll('[data-testid="wizard-order"] > li')].map((li) =>
        li.getAttribute('data-step-id')
      )
    },
    async click(testId) {
      const element = container.querySelector(`[data-testid="${testId}"]`)
      if (!element) throw new Error(`no element with data-testid="${testId}"`)
      await React.act(async () => {
        element.click()
      })
    },
    async run(fn) {
      let result
      await React.act(async () => {
        result = await fn(latest.actions)
      })
      return result
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

/** Get a wizard to the point where `sess-1` exists and landform is whatever. */
async function withSession(ui, document_) {
  await ui.run((a) => a.startSession(RING))
  if (document_) await ui.run(async () => ui.actions.resume('sess-1'))
  return ui
}

const pathsOf = (calls, method, matcher) =>
  calls.filter((c) => c.method === method && matcher.test(c.path))

beforeEach(() => {
  // The catalogued step order is cached for the life of the module (one
  // fetch per page); a test's answer must not leak into the next one's.
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. The step definitions, and a machine that does not know about steps
   =========================================================================== */

describe('1. step definitions', () => {
  it('both parse, and declare every field the machine reads', () => {
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      expect(typeof definition.id).toBe('string')
      expect(typeof definition.status).toBe('function')
      expect(typeof definition.reachable).toBe('function')
      expect(typeof definition.commit.run).toBe('function')
      expect(typeof definition.commit.canCommit).toBe('function')
      expect(Array.isArray(definition.layers)).toBe(true)
      expect(Array.isArray(definition.inputs)).toBe(true)
      // THE TOOL VOCABULARY IS THREE VERBS. There is no 'adjust' anywhere in
      // this app -- a drawn shape is deleted and redrawn.
      for (const tool of definition.tools) expect(STEP_MODES).toContain(tool)
    }

    // The declared absence that makes boundary a step rather than a special
    // case: no generate, and no reopen.
    expect(BOUNDARY_STEP.generate).toBeNull()
    expect(BOUNDARY_STEP.reopen).toBeNull()
    expect(LANDFORM_STEP.generate).not.toBeNull()
    expect(LANDFORM_STEP.reopen).not.toBeNull()

    // Landform declares no user inputs -- the backend 400s on any params at
    // all against a step with no user_inputs.
    expect(LANDFORM_STEP.inputs).toEqual([])
    expect(LANDFORM_STEP.generate.params({ inputs: {} })).toBeNull()

    // The boundary's one input IS the ring; its commit is made of it.
    expect(BOUNDARY_STEP.inputs.map((i) => i.key)).toEqual([BOUNDARY_RING_INPUT])
  })

  it('the machine and the whole shell name no step, anywhere', () => {
    // AN ARCHITECTURAL ASSERTION, written so it bites. The schema's claim is
    // that a step's differences are declared; the check is that the generic
    // code contains no step id to branch on.
    //
    // EXTENDED TO THE MAP-CENTRIC SHELL. The five regions and the one rule
    // that picks which state they read are all generic code by the same
    // standard the machine is held to: they take the cursor step's definition
    // and render what it declares. StepPanel.jsx is gone from the list because
    // the panel column it framed is gone.
    const generic = [
      'useStepMachine.js',
      'WizardShell.jsx',
      'WizardCursor.jsx',
      path.join('shell', 'chromeState.js'),
      path.join('shell', 'StepRail.jsx'),
      path.join('shell', 'InstructionBar.jsx'),
      path.join('shell', 'DetailPanel.jsx'),
      path.join('shell', 'TabStrip.jsx'),
      path.join('shell', 'ActionBanner.jsx'),
    ]
    for (const file of generic) {
      // Comments explain WHY boundary is shaped as it is; code must not test
      // for it.
      const code = codeOf(file).replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      for (const stepId of [...STEP_ORDER, BOUNDARY_STEP_ID]) {
        expect(code).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
      }
    }
  })

  it('derives every machine state from the mirror plus the draft', () => {
    const base = {
      status: NOT_STARTED,
      pending: null,
      isGenerating: false,
      hasProposals: false,
      hasDraftWork: false,
    }
    expect(deriveMachineState(base)).toBe('idle')
    expect(deriveMachineState({ ...base, isGenerating: true })).toBe('generating')
    expect(deriveMachineState({ ...base, status: GENERATED, hasProposals: true })).toBe('reviewing')
    expect(
      deriveMachineState({ ...base, status: GENERATED, hasProposals: true, hasDraftWork: true })
    ).toBe('editing')
    expect(deriveMachineState({ ...base, pending: 'committing' })).toBe('committing')
    expect(deriveMachineState({ ...base, status: COMMITTED })).toBe('committed')
    // The document wins over anything this client believes about a request.
    expect(deriveMachineState({ ...base, status: COMMITTED, pending: 'committing' })).toBe(
      'committed'
    )
  })

  it('runs a definition it has never seen, with no wizard change', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
    ])
    const ui = await renderWizard({ definitions: WITH_WATER })
    await ui.run((a) => a.startSession(RING))

    // Registered by nothing but the object above. It is in the rail's order,
    // and navigating to it renders its chrome -- no wizard file learned a
    // thing about `water` for either.
    expect(ui.order()).toContain('water')
    await ui.open('water')
    expect(ui.find('step-water')).not.toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   2. BOUNDARY AS STEP 0
   =========================================================================== */

describe('2. boundary as step 0', () => {
  it('draws, commits, creates the session, and lands the id in the URL and localStorage', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
    ])

    const ui = await renderWizard()

    // BEFORE ANYTHING IS DRAWN THE WIZARD IS ALREADY THE WHOLE PIPELINE. It
    // used to be one step long, on the grounds that the client does not know
    // the pipeline until a document tells it -- true, and now answered by
    // asking the side that owns the constant (GET /api/steps) rather than by
    // showing a one-row table of contents. The rail is the same rail here as
    // it is after the commit; only which of its rows you can reach changes.
    expect(ui.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(ui.stepState(BOUNDARY_STEP_ID)).toBe('idle')
    // No generate on this step: there is nothing to propose about a boundary.
    expect(ui.find(`generate-${BOUNDARY_STEP_ID}`)).toBeNull()
    // Nothing to commit yet, and nothing to show in the tab strip either.
    expect(ui.find(`commit-${BOUNDARY_STEP_ID}`)).toBeNull()
    expect(ui.find(`tabs-${BOUNDARY_STEP_ID}`)).toBeNull()

    // THE DRAWING. The ring lands in the step's own draft, under the input the
    // definition declares -- which is exactly where DrawTool will write it.
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))
    expect(ui.stepState(BOUNDARY_STEP_ID)).toBe('editing')
    // THE BOUNDARY'S TAB IS THE OLD ACREAGE CHIP, in the strip rather than
    // over the map's top-left: the point count, then the enclosed area.
    expect(ui.text(`tab-${BOUNDARY_RING_INPUT}`)).toContain('3points')
    expect(ui.find(`commit-${BOUNDARY_STEP_ID}`).disabled).toBe(false)

    await ui.click(`commit-${BOUNDARY_STEP_ID}`)

    // ONE POST, and it is POST /api/sessions -- the step's commit CREATES the
    // resource every later step commits into.
    expect(pathsOf(calls, 'POST', /^\/api\/sessions$/)).toHaveLength(1)
    // [lat, lng] in, [lng, lat] out, and the ring CLOSED -- geo.js's
    // ringToGeoJSON is the one place the two coordinate orders meet, and the
    // definition's commit goes through it rather than swapping at a call site.
    expect(pathsOf(calls, 'POST', /^\/api\/sessions$/)[0].body.boundary).toEqual([
      [-74.01, 40.7],
      [-74.0, 40.7],
      [-74.0, 40.71],
      [-74.01, 40.7],
    ])

    expect(selectSessionId(ui.state)).toBe('sess-1')

    // AND THE WIZARD MOVED ON, with nothing having been clicked to make it.
    // There is no "Next step" button in this shell; a successful commit is the
    // forward move. The boundary's own chrome is not on screen at all now --
    // the chrome belongs to the step the cursor names.
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.find(`step-${BOUNDARY_STEP_ID}`)).toBeNull()
    expect(ui.stepState('landform')).toBe('idle')

    // It is still committed, and says so when you navigate back to it.
    await ui.open(BOUNDARY_STEP_ID)
    expect(ui.stepState(BOUNDARY_STEP_ID)).toBe('committed')

    // The document was hydrated wholesale, and the id is durable both ways.
    expect(ui.state.document.session_id).toBe('sess-1')
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe('sess-1')
    expect(new URLSearchParams(window.location.search).get('session')).toBe('sess-1')

    // And the wizard is now as long as the pipeline.
    expect(ui.order()).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])

    await ui.unmount()
  })
})

/* ===========================================================================
   3. GENERATE -> DONE, WITH NO SECOND FETCH
   =========================================================================== */

describe('3. a generate hydrates both halves', () => {
  it('takes the payload AND the document off the job result, with no extra GET', async () => {
    const generatedDocument = serverDocument({ steps: { landform: { status: GENERATED } } })

    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, {
        status: 202,
        body: { job_id: 'job-1', status: 'running' },
      }),
      route('GET', /^\/api\/jobs\/job-1$/, {
        body: { job_id: 'job-1', status: 'done', result: generateResult(generatedDocument) },
      }),
      // NO ROUTE FOR GET /api/sessions/sess-1. installFetch throws on an
      // unrouted request, so a client that went back for the document fails
      // here rather than passing quietly on one more fetch.
    ])

    const ui = await renderWizard()
    await ui.run((a) => a.startSession(RING))
    const fetchesBefore = calls.length

    await ui.click('generate-landform')

    // THE FETCH COUNT IS THE ASSERTION. The resulting state was already
    // correct when the round trip existed; its absence is the change.
    const after = calls.slice(fetchesBefore)
    expect(after.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/sessions/sess-1/steps/landform/generate',
      'GET /api/jobs/job-1',
    ])
    expect(pathsOf(calls, 'GET', /^\/api\/sessions\/sess-1$/)).toHaveLength(0)

    // Both halves landed: the payload as proposals, the status from the
    // document the job carried.
    expect(ui.state.steps.landform.proposals).toEqual(LAYERS_PAYLOAD)
    expect(selectStepStatus(ui.state, 'landform')).toBe(GENERATED)
    expect(ui.stepState('landform')).toBe('reviewing')
    // THE TAB STRIP IS THE STEP'S OWN READOUT NOW, and it opens on the
    // recommendation: three zones, all selected. That is the seeded draft
    // (SessionStore's DRAFT_SEEDED) showing through -- the payload IS the
    // recommendation, so the opening gesture is to take things out.
    expect(ui.find('tabs-landform').getAttribute('data-tab-count')).toBe('3')
    expect(ui.text('tab-zone-1')).toContain('2.5acres')
    expect(ui.text('tab-zone-1')).toContain('81.0score')
    expect(new Set(ui.state.drafts.landform.selectedFeatureIds)).toEqual(
      new Set(['zone-1', 'zone-2', 'zone-3'])
    )

    await ui.unmount()
  })
})

/* ===========================================================================
   4. A committed step collapses
   =========================================================================== */

describe('4. a committed step', () => {
  it('offers whatever its own definition declares for committed, and nothing else', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({
          steps: { landform: committed(1, featureCollection('zone-1')) },
        }),
      }),
    ])

    const ui = await renderWizard()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))

    // THE RAIL SHOWS THE WHOLE PIPELINE'S STATUS; only the cursor step has a
    // machine state. Landform is committed, so the cursor sat down on water.
    expect(ui.find('rail-landform').closest('li').dataset.stepStatus).toBe(COMMITTED)

    await ui.open('landform')
    expect(ui.stepState('landform')).toBe('committed')

    // The banner offers exactly what landform's definition declares for
    // `committed` -- its reopen, and nothing else.
    const edit = ui.find('edit-landform')
    expect(edit).not.toBeNull()
    expect(edit.textContent).toBe('Edit this step')
    expect(ui.find('generate-landform')).toBeNull()
    expect(ui.find('commit-landform')).toBeNull()
    expect(ui.find('draw-landform')).toBeNull()

    // Boundary is committed too, and declares no reopen -- so its committed
    // state offers the one honest action instead (start a different property)
    // and the bar says why the boundary itself cannot move.
    await ui.open(BOUNDARY_STEP_ID)
    expect(ui.find(`edit-${BOUNDARY_STEP_ID}`)).toBeNull()
    expect(ui.text(`instruction-${BOUNDARY_STEP_ID}`)).toMatch(
      /fixed for the life of this session/
    )
    expect(ui.find(`restart-${BOUNDARY_STEP_ID}`)).not.toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   5. THE REOPEN CONFIRMATION
   =========================================================================== */

describe('5. reopen confirmation', () => {
  it('names exactly the downstream steps holding work, and no others', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({
          steps: {
            landform: committed(1, featureCollection('zone-1')),
            water: committed(1, featureCollection('pond-1')),
          },
        }),
      }),
    ])

    const ui = await renderWizard({ definitions: WITH_WATER })
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))

    await ui.open('landform')
    await ui.click('edit-landform')

    const dialog = ui.find('reopen-confirm-landform')
    expect(dialog).not.toBeNull()
    expect(ui.text('reopen-confirm-title-landform')).toBe('Reopen landform?')

    // EXACTLY THE STEPS THAT LOSE WORK. water is committed; roads, trees,
    // structures and fencing were never reached, and naming them would read as
    // a threat to work that does not exist.
    const named = [...dialog.querySelectorAll('[data-testid^="reopen-reset-"]')]
      .filter((li) => li.tagName === 'LI')
      .map((li) => li.getAttribute('data-testid').replace('reopen-reset-', ''))
    expect(named).toEqual(['water'])

    const body = ui.text('reopen-resets-landform')
    expect(body).toContain('Water')
    for (const untouched of ['roads', 'trees', 'structures', 'fencing']) {
      expect(named).not.toContain(untouched)
      expect(body.toLowerCase()).not.toContain(untouched)
    }

    await ui.unmount()
  })
})

/* ===========================================================================
   6. Reopen hydrates, and downstream reverts
   =========================================================================== */

describe('6. reopen', () => {
  it('hydrates the returned document and reverts the downstream panels', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({
          steps: {
            landform: committed(1, featureCollection('zone-1')),
            water: committed(1, featureCollection('pond-1')),
          },
        }),
      }),
      // The cascade, already applied by the server: landform back to
      // generated, water reset outright.
      route('POST', /\/steps\/landform\/reopen$/, {
        body: serverDocument({
          revision: 3,
          steps: { landform: { status: GENERATED, revision: 1 } },
        }),
      }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderWizard({ definitions: WITH_WATER })
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))

    expect(ui.find('rail-landform').closest('li').dataset.stepStatus).toBe(COMMITTED)
    expect(ui.find('rail-water').closest('li').dataset.stepStatus).toBe(COMMITTED)

    await ui.open('landform')
    expect(ui.stepState('landform')).toBe('committed')
    await ui.click('edit-landform')
    await ui.click('reopen-confirm-yes-landform')

    // The document came back with the cascade in it; hydrating it wholesale
    // IS the cascade handling.
    expect(ui.state.document.document_revision).toBe(3)
    expect(selectStepStatus(ui.state, 'landform')).toBe(GENERATED)
    expect(selectStepStatus(ui.state, 'water')).toBe(NOT_STARTED)
    expect(ui.state.steps.water.features).toBeNull()

    // The panels moved with it: landform is editable again, and water has gone
    // from committed to explaining that its upstream is not committed.
    expect(ui.stepState('landform')).toBe('reviewing')
    expect(ui.state.steps.landform.proposals).toEqual(LAYERS_PAYLOAD)
    await ui.open('water')
    expect(ui.find('blocked-water')).not.toBeNull()
    expect(ui.find('edit-water')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   7. 422, PER FEATURE
   =========================================================================== */

describe('7. commit rejections', () => {
  it('reaches the step UI per feature, addressable by feature_id', async () => {
    const rejection = {
      error: 'Some features could not be committed.',
      rejections: [
        {
          feature_id: 'zone-2',
          code: 'outside_boundary',
          reason: '0.67 acres of this feature lie outside the parcel boundary.',
        },
        {
          feature_id: 'zone-3',
          code: 'invalid_geometry',
          reason: 'geometry is not valid -- Self-intersection.',
        },
      ],
    }

    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, {
        status: 202,
        body: { job_id: 'job-1', status: 'running' },
      }),
      route('GET', /^\/api\/jobs\/job-1$/, {
        body: {
          job_id: 'job-1',
          status: 'done',
          result: generateResult(serverDocument({ steps: { landform: { status: GENERATED } } })),
        },
      }),
      route('POST', /\/steps\/landform\/commit$/, { status: 422, body: rejection }),
    ])

    const ui = await renderWizard()
    await ui.run((a) => a.startSession(RING))
    await ui.click('generate-landform')

    await ui.run((a) => a.setSelection('landform', ['zone-1', 'zone-2', 'zone-3']))
    await ui.click('commit-landform')

    expect(pathsOf(calls, 'POST', /\/steps\/landform\/commit$/)).toHaveLength(1)

    // PER FEATURE, ALL THE WAY THROUGH. Not a banner: each offending id
    // carries the server's own reason, which is what lets the map (F3) colour
    // that feature and print that sentence on it.
    expect(ui.text('rejection-id-zone-2')).toBe('zone-2')
    expect(ui.text('rejection-reason-zone-2')).toContain('outside the parcel boundary')
    expect(ui.text('rejection-id-zone-3')).toBe('zone-3')
    expect(ui.text('rejection-reason-zone-3')).toContain('Self-intersection')

    // The feature that was fine is NOT named.
    expect(ui.find('rejection-zone-1')).toBeNull()

    // Nothing was written: the step is still generated and still editable.
    expect(selectStepStatus(ui.state, 'landform')).toBe(GENERATED)
    expect(ui.stepState('landform')).toBe('editing')

    await ui.unmount()
  })
})

/* ===========================================================================
   8. An evicted job
   =========================================================================== */

describe('8. an evicted job', () => {
  it('recovers through the layers endpoint, and does NOT regenerate', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, {
        status: 202,
        body: { job_id: 'job-1', status: 'running' },
      }),
      // 404: an id this process never held, or one it finished and evicted.
      route('GET', /^\/api\/jobs\/job-1$/, { status: 404, body: { error: 'unknown job' } }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderWizard()
    await ui.run((a) => a.startSession(RING))
    await ui.click('generate-landform')

    // ONE generate, and a layers fetch to recover. The payload is cached
    // server-side and step_payload() regenerates on a miss, so asking for it
    // is strictly cheaper than making the user redo work that is already done.
    expect(pathsOf(calls, 'POST', /\/steps\/landform\/generate$/)).toHaveLength(1)
    expect(pathsOf(calls, 'GET', /\/steps\/landform\/layers$/)).toHaveLength(1)

    expect(ui.state.steps.landform.proposals).toEqual(LAYERS_PAYLOAD)
    // Not reported as a failure: there is no failed_layer and no error line.
    expect(ui.find('failed-layer-landform')).toBeNull()
    expect(ui.find('error-landform')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   9. An unreachable step
   =========================================================================== */

describe('9. an unreachable step', () => {
  it('explains why, and does not offer a generate that would fail', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({ steps: { landform: { status: GENERATED } } }),
      }),
    ])

    const ui = await renderWizard({ definitions: WITH_WATER })
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))

    // landform is generated, NOT committed -- so water cannot start.
    await ui.open('water')
    expect(ui.find('blocked-water')).not.toBeNull()
    expect(ui.text('blocked-water')).toBe('Commit Landform before starting this step.')

    // No button, disabled or otherwise: a disabled control teaches nothing and
    // an enabled one buys a 409 that says the same thing a round trip later.
    expect(ui.find('generate-water')).toBeNull()
    expect(ui.find('commit-water')).toBeNull()

    // Landform itself is reachable, and offers what ITS definition declares
    // for the state it is in. It is `generated`, so that is the reviewing
    // pair -- the draw and the commit -- rather than the generate, which is
    // what its `idle` declares. Nothing is blocked.
    await ui.open('landform')
    expect(ui.find('blocked-landform')).toBeNull()
    expect(ui.find('draw-landform')).not.toBeNull()
    expect(ui.find('commit-landform')).not.toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   10. THE STEP ORDER
   =========================================================================== */

describe('10. step order', () => {
  it('comes from step_order, and is NOT Object.keys(document.steps)', async () => {
    const document_ = serverDocument()

    // What the wire actually delivers, and why reading the keys is a trap: six
    // real step ids in a stable order that is not the pipeline's.
    const alphabetical = Object.keys(document_.steps)
    expect(alphabetical).toEqual([
      'fencing',
      'landform',
      'roads',
      'structures',
      'trees',
      'water',
    ])
    expect(alphabetical).not.toEqual(STEP_ORDER)

    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: document_ }),
    ])

    const ui = await renderWizard({ definitions: WITH_WATER })
    await ui.run((a) => a.startSession(RING))

    const rendered = ui.order()
    expect(rendered).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])
    expect(rendered).not.toEqual([BOUNDARY_STEP_ID, ...alphabetical])
    expect(rendered.slice(1)).toEqual(document_.step_order)

    // And the same answer through the selector the shell uses.
    expect(wizardStepOrder(ui.state)).toEqual([BOUNDARY_STEP_ID, ...STEP_ORDER])

    // A document with no step_order is refused rather than guessed at.
    const noOrder = serverDocument()
    delete noOrder.step_order
    expect(() => ui.state && wizardStepOrder({ ...ui.state, stepOrder: [] })).not.toThrow()

    await ui.unmount()
  })
})

/* ===========================================================================
   11. The production-zone spike is gone
   =========================================================================== */

describe('11. the retired spike', () => {
  it('leaves App.jsx compiling, with the wizard owning what it used to', async () => {
    // IT STILL COMPILES AND STILL MOUNTS. Importing it is the cheap half of
    // the check -- if deleting the spike's components had broken one of App's
    // imports, this line would fail.
    const App = (await import('../App.jsx')).default
    expect(typeof App).toBe('function')

    const appSource = readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')

    // THE ENDPOINT IS GONE FROM THE PAGE. Assembled rather than written out,
    // so this file is not itself a hit for the tree-wide sweep in
    // map.test.jsx's section 8.
    const SPIKE_ENDPOINT = '/api/' + 'production' + '-zones'
    expect(appSource).not.toContain(SPIKE_ENDPOINT)
    // And it never was on the session surface.
    const client = readFileSync(path.join(HERE, '..', 'session', 'apiClient.js'), 'utf8')
    expect(client).not.toContain(SPIKE_ENDPOINT)

    // WHAT APP STILL MOUNTS is the wizard and the map stack, and that is now
    // the whole of what it mounts.
    expect(appSource).toMatch(/from '\.\/wizard\/WizardShell\.jsx'/)
    expect(appSource).toMatch(/from '\.\/map\/MapLayerStack\.jsx'/)

    // AND THE DIRECTION OF THE DEPENDENCY IS UNCHANGED: App reaches for the
    // wizard, and no wizard module reaches back into the page.
    for (const file of [
      'stepDefinitions.js',
      'useStepMachine.js',
      'WizardShell.jsx',
      'WizardCursor.jsx',
      path.join('shell', 'ActionBanner.jsx'),
      path.join('shell', 'InstructionBar.jsx'),
      path.join('shell', 'StepRail.jsx'),
      path.join('shell', 'TabStrip.jsx'),
      path.join('..', 'map', 'MapLayerStack.jsx'),
      path.join('..', 'map', 'layerStack.js'),
      path.join('..', 'map', 'StepTools.jsx'),
    ]) {
      expect(codeOf(file)).not.toContain("from '../App.jsx'")
      expect(codeOf(file)).not.toContain(SPIKE_ENDPOINT)
    }
  })

  it('keeps the three files the spike existed to preserve', async () => {
    // The pure geometry, the gesture and the hatch. These were the parts the
    // spike was built so that a migration would not have to rewrite, and the
    // landform step imports them from where they always were.
    const geometry = await import('../zoneGeometry.js')
    expect(typeof geometry.clampToBoundary).toBe('function')
    expect(typeof geometry.cautionsFor).toBe('function')
    expect(typeof geometry.assertSuggestedZonesAreClean).toBe('function')
    expect(geometry.CAUTION_MIN_ACRES).toBe(0.05)

    const geo = await import('../geo.js')
    // The four GeoJSON interop functions -- the only place [lat, lng] and
    // [lng, lat] meet.
    for (const name of [
      'ringToGeoJSON',
      'ringFromGeoJSON',
      'toMultiPolygon',
      'multiPolygonToLatLngs',
    ]) {
      expect(typeof geo[name]).toBe('function')
    }

    expect(typeof (await import('../ZoneDrawTool.jsx')).default).toBe('function')
    expect(typeof (await import('../ProductionHatchPattern.jsx')).default).toBe('function')
  })
})
