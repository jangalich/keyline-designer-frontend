/**
 * shell.test.jsx
 *
 * THE MAP-CENTRIC SHELL. What this branch is answerable for, and nothing the
 * suites beside it already hold:
 *
 *   wizard.test.jsx  the machine, the schema, the order, the reopen.
 *   map.test.jsx     the stack, the arming, the page end to end.
 *   landform.test.jsx the real backend.
 *
 * Three of the eight below carry the weight:
 *
 *   3.  THE INSTRUCTION AND THE BUTTON PAIR BOTH MOVE WITH THE STATE, and both
 *       come off the definition -- asserted by declaring a step with sentences
 *       nothing else in this codebase has ever seen and watching them appear.
 *   4.  NO STEP ID IN THE SHELL, the F2 assertion extended to all six new
 *       files, run against the prose-stripped source so a file may still
 *       explain itself.
 *   7.  THE THREE DELETIONS, asserted as absences in the rendered document and
 *       as absences in the tree, not as a changelog entry.
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  SessionProvider,
  useSession,
} from '../session/SessionStore'
import {
  BOUNDARY_RING_INPUT,
  BOUNDARY_STEP,
  BOUNDARY_STEP_ID,
  CEILING_ADVISORY_PCT,
  LANDFORM_STEP,
  STEP_DEFINITIONS,
  defineStep,
  documentStep,
  stepButton,
  totalsFor,
} from './stepDefinitions'
import {
  COMMITTING,
  EDITING,
  GENERATING,
  IDLE,
  MACHINE_STATES,
  REVIEWING,
  STEP_COMMITTED,
} from './useStepMachine'
import { chromeStateFor } from './shell/chromeState.js'
import { COLLAPSED_TAB_CAP, TAB_COLUMNS, TAB_ROWS_MAX } from './shell/TabStrip.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..')

/**
 * Source with its prose removed -- a file may explain what it must not do.
 *
 * EVERY ABSENCE ASSERTED BELOW IS ABOUT CODE. This codebase's comments talk at
 * length about what was deleted and why: App.jsx's header names the boundary
 * buttons it no longer renders and the access point it no longer holds, and
 * App.css's own rule quotes the map height it replaced. A file that records
 * what it gave up is doing the right thing, and a sweep that failed it would
 * teach people to delete the record instead.
 */
function stripProse(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

function codeOf(...parts) {
  return stripProse(readFileSync(path.join(HERE, ...parts), 'utf8'))
}

/** App.jsx and App.css, as code. */
const appCode = () => stripProse(readFileSync(path.join(SRC, 'App.jsx'), 'utf8'))
const cssCode = () => readFileSync(path.join(SRC, 'App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/* ===========================================================================
   Fixtures
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const RING = [
  [40.7, -74.01],
  [40.7, -74.0],
  [40.71, -74.0],
]

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

/** A landform payload with `count` zones, each measured. */
function payloadWith(count, { totalAcres = 100 } = {}) {
  const ids = Array.from({ length: count }, (_, i) => `zone-${i + 1}`)
  return {
    eligible_union: null,
    exclusion_layers: [
      { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
    ],
    suggested_zones: featureCollection(...ids),
    zones: ids.map((featureId, i) => ({
      id: i,
      feature_id: featureId,
      rank: i + 1,
      area_acres: 2.5,
      score: 81 - i,
      slope_min_pct: 2,
      slope_max_pct: 8,
      aspect_available: false,
      dominant_aspect: null,
    })),
    scales: {
      bands: { poor: [0, 40], fair: [40, 60], good: [60, 80], excellent: [80, 100] },
      band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
    },
    summary: { total_acres: totalAcres, eligible_acres: totalAcres / 2 },
  }
}

/* ===========================================================================
   Harness
   =========================================================================== */

function installFetch(routes) {
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

async function renderShell({ definitions = STEP_DEFINITIONS } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
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
      return session.state
    },
    get cursor() {
      return cursor
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    /** The banner's buttons, in order, as [testid-key, label] pairs. */
    buttons(stepId) {
      const actions = container.querySelector(`[data-testid="actions-${stepId}"]`)
      return [...(actions?.querySelectorAll('button') ?? [])].map((b) => [
        b.dataset.testid.replace(`-${stepId}`, ''),
        b.textContent,
      ])
    },
    instruction: (stepId) =>
      container.querySelector(`[data-testid="instruction-${stepId}"]`)?.textContent ?? null,
    async click(id) {
      const element = container.querySelector(`[data-testid="${id}"]`)
      if (!element) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => element.click())
    },
    async open(stepId) {
      await React.act(async () => cursor.open(stepId))
    },
    async arm(tool) {
      await React.act(async () => cursor.arm(tool))
    },
    async run(fn) {
      let out
      await React.act(async () => {
        out = await fn(session.actions, cursor)
      })
      return out
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

const pathsOf = (calls, method, matcher) =>
  calls.filter((c) => c.method === method && matcher.test(c.path))

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. BOUNDARY, END TO END, IN THE NEW SHELL
   =========================================================================== */

describe('1. boundary end to end in the new shell', () => {
  it('places, undoes, finishes, clears, redraws, finishes, commits, and AUTO-ADVANCES', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
    ])

    const ui = await renderShell()
    expect(ui.cursor.cursorStepId).toBe(BOUNDARY_STEP_ID)

    // IDLE. One button, and it is the tool -- there is nothing to move forward
    // to yet.
    expect(ui.buttons(BOUNDARY_STEP_ID)).toEqual([['draw', 'Draw the boundary']])
    await ui.click(`draw-${BOUNDARY_STEP_ID}`)
    expect(ui.cursor.armed).toBe('draw')

    // EDITING: the arming is what puts the chrome here, and the pair is the
    // undo and the finish.
    expect(ui.instruction(BOUNDARY_STEP_ID)).toBe('Click to place each corner.')
    expect(ui.buttons(BOUNDARY_STEP_ID)).toEqual([
      ['undo', 'Undo last point'],
      ['finish', 'Finish boundary'],
    ])

    // FOUR POINTS DOWN, then UNDO LAST POINT takes one back off the draft --
    // the same place DrawTool writes them.
    await ui.run((a) =>
      a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, [...RING, [40.71, -74.01]])
    )
    expect(ui.text(`tab-${BOUNDARY_RING_INPUT}`)).toContain('4points')
    await ui.click(`undo-${BOUNDARY_STEP_ID}`)
    expect(ui.state.drafts[BOUNDARY_STEP_ID].inputs[BOUNDARY_RING_INPUT]).toEqual(RING)
    expect(ui.text(`tab-${BOUNDARY_RING_INPUT}`)).toContain('3points')

    // FINISH BOUNDARY. Disarming IS finishing, and it is the whole of what
    // moves the chrome to its reviewing pair.
    await ui.click(`finish-${BOUNDARY_STEP_ID}`)
    expect(ui.cursor.armed).toBeNull()
    expect(ui.instruction(BOUNDARY_STEP_ID)).toBe('Check the shape before sending.')
    expect(ui.buttons(BOUNDARY_STEP_ID)).toEqual([
      ['redraw', 'Clear and redraw'],
      ['commit', 'Commit'],
    ])

    // CLEAR AND REDRAW empties the ring AND re-arms, because the button says
    // redraw. Clearing alone would leave the user reviewing a shape that is
    // not there, with no offered way back to placing points.
    await ui.click(`redraw-${BOUNDARY_STEP_ID}`)
    expect(ui.state.drafts[BOUNDARY_STEP_ID].inputs[BOUNDARY_RING_INPUT]).toEqual([])
    expect(ui.cursor.armed).toBe('draw')
    expect(ui.instruction(BOUNDARY_STEP_ID)).toBe('Click to place each corner.')
    expect(ui.find(`tabs-${BOUNDARY_STEP_ID}`)).toBeNull()

    // REDRAW, FINISH, COMMIT.
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))
    await ui.click(`finish-${BOUNDARY_STEP_ID}`)
    expect(ui.find(`commit-${BOUNDARY_STEP_ID}`).disabled).toBe(false)
    await ui.click(`commit-${BOUNDARY_STEP_ID}`)

    // THE SESSION EXISTS.
    expect(pathsOf(calls, 'POST', /^\/api\/sessions$/)).toHaveLength(1)
    expect(ui.state.sessionId).toBe('sess-1')

    // AND THE WIZARD ADVANCED, with nothing clicked to make it. No "Next
    // step": the commit is the forward move.
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.find(`step-${BOUNDARY_STEP_ID}`)).toBeNull()
    expect(ui.find('step-landform').dataset.stepState).toBe(IDLE)
    expect(ui.buttons('landform')).toEqual([['generate', 'Generate production zones']])

    await ui.unmount()
  })

  it('does not advance on a commit that failed', async () => {
    // THE AUTO-ADVANCE IS ON THE OUTCOME, not on the click. A step change over
    // a failed commit would hide the failure behind a navigation.
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 500, body: { error: 'nope' } }),
    ])

    const ui = await renderShell()
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))
    await ui.click(`commit-${BOUNDARY_STEP_ID}`)

    expect(ui.state.sessionId).toBeNull()
    expect(ui.cursor.cursorStepId).toBe(BOUNDARY_STEP_ID)

    await ui.unmount()
  })
})

/* ===========================================================================
   2. LANDFORM IN THE NEW SHELL
   =========================================================================== */

describe('2. landform in the new shell', () => {
  it('generates, renders one tab per proposal, keeps click-to-toggle, and commits', async () => {
    const payload = payloadWith(3)
    const generated = serverDocument({ steps: { landform: { status: GENERATED } } })
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, {
        status: 202,
        body: { job_id: 'job-1', status: 'running' },
      }),
      route('GET', /^\/api\/jobs\/job-1$/, {
        body: { job_id: 'job-1', status: 'done', result: { payload, document: generated } },
      }),
      route('POST', /\/steps\/landform\/commit$/, {
        body: serverDocument({
          revision: 2,
          steps: {
            landform: {
              status: COMMITTED,
              revision: 1,
              features: featureCollection('zone-1', 'zone-2', 'zone-3'),
              provenance: { 'zone-1': 'generated', 'zone-2': 'generated', 'zone-3': 'generated' },
            },
          },
        }),
      }),
    ])

    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    expect(ui.cursor.cursorStepId).toBe('landform')

    await ui.click('generate-landform')

    // ONE TAB PER PROPOSAL, showing acres and score -- the acreage chip's
    // treatment, generalised.
    const strip = ui.find('tabs-landform')
    expect(strip.dataset.tabCount).toBe('3')
    expect(ui.text('tab-zone-1')).toBe('Zone 12.5acres81.0score')
    expect(ui.text('tab-zone-3')).toBe('Zone 32.5acres79.0score')
    // No "+N more": three is under the cap.
    expect(ui.find('tabs-more-landform')).toBeNull()

    // THE EYE IS WHAT INCLUDES A FEATURE IN THE COMMIT, and it is the same
    // store action a click used to make from the map. Off, and the tab says so
    // and stays -- which is what lets the map stop drawing a declined
    // suggestion at all.
    expect(ui.find('tab-zone-2').dataset.eye).toBe('on')
    await ui.click('tab-eye-zone-2')
    expect(ui.find('tab-zone-2').dataset.eye).toBe('off')
    expect(ui.find('tab-zone-2').className).toContain('chrome-tab--off')
    expect(ui.state.drafts.landform.selectedFeatureIds).not.toContain('zone-2')
    await ui.click('tab-eye-zone-2')
    expect(ui.find('tab-zone-2').dataset.eye).toBe('on')

    // A SUGGESTION HAS NO ×. It cannot be destroyed -- the server will
    // regenerate it -- so the eye is its only removal.
    expect(ui.find('tab-remove-zone-2')).toBeNull()

    // ...and the eye put the machine in `editing` while nothing is armed,
    // which the chrome reads as reviewing: the user is choosing among
    // proposals, not placing points.
    expect(ui.find('step-landform').dataset.stepState).toBe(EDITING)
    expect(ui.find('step-landform').dataset.chromeState).toBe(REVIEWING)
    expect(ui.instruction('landform')).toBe('Click zones to select. Draw to add your own.')

    await ui.click('commit-landform')
    expect(pathsOf(calls, 'POST', /\/steps\/landform\/commit$/)).toHaveLength(1)
    expect(calls.at(-1).body.selected_feature_ids ?? calls.at(-1).body.features).toBeDefined()
    // Committed, and on again.
    expect(ui.cursor.cursorStepId).toBe('water')

    await ui.unmount()
  })
})

/* ===========================================================================
   3. PER-STATE CHROME
   =========================================================================== */

describe('3. the instruction and the buttons are keyed to the state', () => {
  /**
   * A STEP THIS CODEBASE HAS NEVER SEEN, declared here and nowhere else, with
   * sentences and button labels that appear in no other file.
   *
   * That is the assertion. If the bar or the banner held a table of their own,
   * or fell back to something generic, none of the strings below could reach
   * the screen -- and if they had to be added to a shell file to get there,
   * the schema would have failed.
   */
  const SEEN = []
  const marker = (key, label) =>
    stepButton({ key, label, run: () => SEEN.push(key) })

  const INVENTED = documentStep({
    id: 'water',
    title: 'Water',
    blurb: 'Ponds and dams.',
    generate: { label: 'Find the pond sites' },
    instructions: {
      [IDLE]: 'Nothing has been proposed for water yet.',
      [REVIEWING]: 'Pick the dams worth building.',
      [EDITING]: 'Trace the pond edge.',
      [STEP_COMMITTED]: 'The water plan is settled.',
    },
    buttons: {
      [IDLE]: [marker('survey', 'Survey the valley')],
      [REVIEWING]: [marker('trace', 'Trace a pond'), marker('keep', 'Keep these dams')],
      [EDITING]: [marker('abandon', 'Abandon this pond')],
      [STEP_COMMITTED]: [],
    },
    Panel: null,
  })

  it('changes both halves with the state, off the definition alone', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/sess-1$/, {
        body: serverDocument({
          steps: {
            landform: {
              status: COMMITTED,
              revision: 1,
              features: featureCollection('zone-1'),
              provenance: { 'zone-1': 'generated' },
            },
          },
        }),
      }),
      route('GET', /\/steps\/water\/layers$/, { body: payloadWith(2) }),
    ])

    const ui = await renderShell({ definitions: [BOUNDARY_STEP, LANDFORM_STEP, INVENTED] })
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))
    await ui.open('water')

    // IDLE.
    expect(ui.find('step-water').dataset.chromeState).toBe(IDLE)
    expect(ui.instruction('water')).toBe('Nothing has been proposed for water yet.')
    expect(ui.buttons('water')).toEqual([['survey', 'Survey the valley']])

    // REVIEWING. Same step, same definition, different state -- both halves
    // moved, and the pair is TWO here.
    await ui.run((a) => a.loadLayers('water'))
    expect(ui.find('step-water').dataset.chromeState).toBe(REVIEWING)
    expect(ui.instruction('water')).toBe('Pick the dams worth building.')
    expect(ui.buttons('water')).toEqual([
      ['trace', 'Trace a pond'],
      ['keep', 'Keep these dams'],
    ])

    // EDITING. The pair is ONE here, and the banner renders one -- it does not
    // pad the row with a disabled placeholder.
    await ui.arm('draw')
    expect(ui.find('step-water').dataset.chromeState).toBe(EDITING)
    expect(ui.instruction('water')).toBe('Trace the pond edge.')
    expect(ui.buttons('water')).toEqual([['abandon', 'Abandon this pond']])

    // AND THE BUTTONS ARE THE DEFINITION'S OWN FUNCTIONS.
    await ui.click('abandon-water')
    expect(SEEN).toEqual(['abandon'])

    await ui.unmount()
  })

  it('declares the pair as a LIST, and refuses more than two', () => {
    // A step that declares three has no banner that could render them, so it
    // fails at definition time rather than by overflowing a row.
    expect(() =>
      defineStep({
        id: 'water',
        status: () => NOT_STARTED,
        commit: { run: () => 'committed' },
        buttons: { [IDLE]: [marker('a', 'A'), marker('b', 'B'), marker('c', 'C')] },
      })
    ).toThrow(/at most 2/)

    // ...and a key that is not a machine state is a bar that would silently
    // render nothing, which is indistinguishable from a step with nothing to
    // say. So it is refused, naming the key.
    expect(() =>
      defineStep({
        id: 'water',
        status: () => NOT_STARTED,
        commit: { run: () => 'committed' },
        instructions: { reviewng: 'typo' },
      })
    ).toThrow(/'reviewng'/)

    // THE TWO SHIPPED STEPS DECLARE ONLY MACHINE STATES, and the counts are
    // the spec's: boundary offers two in both of its hands-on states, and
    // landform offers one while a ring is going down.
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      for (const key of Object.keys(definition.instructions)) {
        expect(MACHINE_STATES).toContain(key)
      }
      for (const key of Object.keys(definition.buttons)) {
        expect(MACHINE_STATES).toContain(key)
      }
    }
    expect(BOUNDARY_STEP.buttons[EDITING]).toHaveLength(2)
    expect(BOUNDARY_STEP.buttons[REVIEWING]).toHaveLength(2)
    expect(LANDFORM_STEP.buttons[REVIEWING]).toHaveLength(2)
    expect(LANDFORM_STEP.buttons[EDITING]).toHaveLength(1)
  })

  it('resolves the state by the arming, and only where the arming is the question', () => {
    // THE ONE RULE THAT STANDS BETWEEN THE MACHINE AND THE CHROME. The
    // machine's reviewing/editing split is "is there a draft to discard"; the
    // chrome's is "are you authoring right now". See chromeState.js.
    expect(chromeStateFor({ machineState: EDITING, armed: null })).toBe(REVIEWING)
    expect(chromeStateFor({ machineState: REVIEWING, armed: 'draw' })).toBe(EDITING)
    expect(chromeStateFor({ machineState: IDLE, armed: 'draw' })).toBe(EDITING)
    expect(chromeStateFor({ machineState: IDLE, armed: null })).toBe(IDLE)

    // A JOB RUNNING, A REQUEST IN FLIGHT, OR A COMMITTED STEP beats a leftover
    // arming: those states are not about the user's hands at all.
    for (const state of [GENERATING, COMMITTING, STEP_COMMITTED]) {
      expect(chromeStateFor({ machineState: state, armed: 'draw' })).toBe(state)
    }
  })
})

/* ===========================================================================
   4. NO STEP ID IN THE SHELL
   =========================================================================== */

describe('4. the shell names no step', () => {
  it('holds no step id in any of the six new files, or in the machine', () => {
    // THE F2 ASSERTION, EXTENDED. The claim the schema makes is that a step's
    // differences are DECLARED; the check is that the generic code has no id
    // to branch on. Prose is stripped first -- these files explain at length
    // why boundary is shaped as it is, and a file that explains itself must
    // not fail for it.
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
      const code = codeOf(file)
      for (const stepId of [...STEP_ORDER, BOUNDARY_STEP_ID]) {
        expect(code).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
      }
      // Nor a payload key, which is a step id by another name.
      for (const payloadKey of ['suggested_zones', 'eligible_union', 'exclusion_layers', 'zones']) {
        expect(code).not.toContain(payloadKey)
      }
    }
  })

  it('leaves no panel column behind to hold one', () => {
    // The frame and the two step bodies are DELETED, not merely unmounted: a
    // file left on disk is a second implementation of the shell waiting to be
    // picked up by whoever migrates the next step.
    expect(existsSync(path.join(HERE, 'StepPanel.jsx'))).toBe(false)
    expect(existsSync(path.join(HERE, 'panels'))).toBe(false)
    expect(existsSync(path.join(SRC, 'AcreageChip.jsx'))).toBe(false)
  })
})

/* ===========================================================================
   5. TAB OVERFLOW
   =========================================================================== */

describe('5. the tab strip past its cap', () => {
  it('renders "+N more", expands on it, and holds three rows', async () => {
    const many = TAB_COLUMNS * TAB_ROWS_MAX + 5
    const payload = payloadWith(many)
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: payload }),
    ])

    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    const strip = () => ui.find('tabs-landform')
    expect(strip().dataset.tabCount).toBe(String(many))
    expect(strip().dataset.expanded).toBe('false')

    // COLLAPSED IS ONE ROW: the cap's worth of tabs, then the "+N more" that
    // fills the row's last cell.
    const shown = () => [...strip().querySelectorAll('[data-tab-id]')]
    expect(shown()).toHaveLength(COLLAPSED_TAB_CAP)
    const more = ui.find('tabs-more-landform')
    expect(more.textContent).toBe(`+${many - COLLAPSED_TAB_CAP} more`)

    // EXPANDED SHOWS THEM ALL, in a box three rows tall that SCROLLS. It does
    // not wrap into a fourth row: three is the cap, and a strip that grew a
    // row per handful of zones would eat the map it is describing.
    await ui.click('tabs-more-landform')
    expect(strip().dataset.expanded).toBe('true')
    expect(shown()).toHaveLength(many)
    expect(strip().className).toContain('chrome-tabs--expanded')
    expect(ui.find('tabs-more-landform')).toBeNull()

    // The CSS is where "three rows, then scroll" is actually enforced, so the
    // rule is asserted rather than assumed.
    const css = cssCode()
    expect(css).toMatch(/\.chrome-tabs--expanded \.chrome-tabs__list \{[^}]*overflow-y: auto/)
    expect(css).toMatch(/\.chrome-tabs--expanded \.chrome-tabs__list \{[^}]*max-height: calc\(3 \*/)
    expect(css).toMatch(new RegExp(`grid-template-columns: repeat\\(${TAB_COLUMNS},`))

    // And it collapses again.
    await ui.click('tabs-fewer-landform')
    expect(shown()).toHaveLength(COLLAPSED_TAB_CAP)

    await ui.unmount()
  })
})

/* ===========================================================================
   6. THE MAP FILLS THE VIEWPORT
   =========================================================================== */

describe('6. the map fills the viewport height', () => {
  it('gives the stage the viewport and puts every region inside it', async () => {
    const css = cssCode()

    // THE FIXED HEIGHT IS GONE. It was clamp(20rem, 60vh, 38rem), which capped
    // the map at 38rem however tall the screen was, with a panel column under
    // it taking up to another 70vh.
    expect(css).not.toContain('clamp(20rem, 60vh, 38rem)')
    expect(css).not.toContain('.status-panel')
    expect(css).not.toContain('.map-wrapper')

    // The stage takes the viewport, less a small gap, with a floor for a short
    // screen. dvh rather than vh so a mobile toolbar cannot push the action
    // banner off the bottom.
    expect(css).toMatch(/\.map-stage \{[\s\S]*?height: max\(34rem, calc\(100dvh - var\(--space-6\)\)\)/)

    // NO CHROME SITS OUTSIDE IT. The five regions are one absolutely
    // positioned overlay on the stage, so the map's height is not a function
    // of how much chrome there is.
    expect(css).toMatch(/\.chrome \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/)

    const app = appCode()
    // The wizard is rendered INSIDE the stage, beside the map rather than
    // below it in the document.
    expect(app).toMatch(/<div className="map-stage">[\s\S]*<WizardShell \/>[\s\S]*<\/div>/)
    expect(app).not.toContain('status-panel')
    expect(app).not.toContain('tool__frame')

    // And every region is a descendant of the one overlay.
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
    ])
    const ui = await renderShell()
    const chrome = ui.container.querySelector('.chrome')
    for (const region of ['step-rail', `step-${BOUNDARY_STEP_ID}`, `banner-${BOUNDARY_STEP_ID}`]) {
      expect(chrome.contains(ui.find(region))).toBe(true)
    }
    // The detail panel is not in the document at all with nothing selected --
    // see the deletions suite. When it is, it is inside the same overlay.
    expect(ui.find(`detail-${BOUNDARY_STEP_ID}`)).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   7. THE THREE DELETIONS
   =========================================================================== */

describe('7. the three deletions', () => {
  it('renders no second set of boundary controls', async () => {
    // App.jsx used to render its own "Undo Last Point" / "Finish Boundary"
    // beside the wizard's, wired to the same arming register -- two boundary
    // UIs on one screen. F3 moved ring ownership to the wizard and left these;
    // F4 deleted the spike's zone state but not these.
    const app = appCode()
    for (const gone of [
      'Undo Last Point',
      'Finish Boundary',
      'Undo last point',
      'Finish boundary',
      'Start Drawing Boundary',
      'Redraw',
      'handleUndoLastPoint',
      'handleFinishDrawing',
      'handleStartDrawing',
    ]) {
      expect(app).not.toContain(gone)
    }

    // ONE SET SURVIVES, and it is the wizard's, declared by the step.
    installFetch([route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() })])
    const ui = await renderShell()
    await ui.click(`draw-${BOUNDARY_STEP_ID}`)
    const labels = [...ui.container.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels.filter((l) => l === 'Undo last point')).toHaveLength(1)
    expect(labels.filter((l) => l === 'Finish boundary')).toHaveLength(1)
    await ui.unmount()
  })

  it('mounts no AccessPointTool, and holds no access point', () => {
    const app = appCode()
    expect(app).not.toContain('AccessPointTool')
    expect(app).not.toContain('accessPoint')
    expect(app).not.toContain('access_point')

    // NOTHING ANYWHERE MOUNTS IT. The component itself is kept on disk on
    // purpose -- it is the ROADS step's input, and roads is a later branch --
    // but no file imports it, so it is on no map.
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('AccessPointTool.jsx')) continue
      if (file.endsWith('.test.jsx')) continue
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '[^']*AccessPointTool\.jsx'/)
    }
  })

  it('closes the legacy arming door, which now has no callers', () => {
    // Assembled, so this file is inside its own sweep.
    const DOOR = 'arm' + 'LegacyGesture'
    const cursor = codeOf('WizardCursor.jsx')
    expect(cursor).not.toContain(DOOR)
    expect(cursor).not.toContain('legacyGesture')

    for (const file of sourceFiles(SRC)) {
      expect(stripProse(readFileSync(file, 'utf8'))).not.toContain(`${DOOR}(`)
    }
  })
})

/* ===========================================================================
   8. THE 80% ADVISORY
   =========================================================================== */

describe('8. the ceiling advisory', () => {
  it('appears in the instruction bar when the selection trips it, and not before', async () => {
    // FOUR ZONES OF 2.5 ACRES over a 12-acre parcel: all four is 10 acres,
    // 83% of the parcel, which is past the advisory. Three is 62.5%, which is
    // not. The chip the figure used to be printed under is gone; the advisory
    // is not, because it is the only part of that block that asked the user to
    // reconsider something.
    const payload = payloadWith(4, { totalAcres: 12 })
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: payload }),
    ])

    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    // The draft seeds with everything selected -- the payload IS the
    // recommendation -- so it trips immediately.
    const totals = totalsFor(payload, new Set(['zone-1', 'zone-2', 'zone-3', 'zone-4']), [])
    expect(totals.pctOfParcel).toBeGreaterThan(CEILING_ADVISORY_PCT)
    // THE ADVISORY CARRIES THE FIGURE. It said "this much" while a `% of
    // parcel` column sat above it in the panel column's totals block; the
    // block is gone, so the sentence names the number and sets it in the data
    // face. See style.test.jsx for the typography of it.
    expect(ui.text('notice-ceiling-landform')).toBe(
      'Selecting 83.3% of the parcel leaves little room for water, roads, and trees.'
    )
    expect(ui.find('notice-ceiling-landform').querySelector('.measure').textContent).toBe('83.3')

    // Take one out and it goes: advisory, and live against the current
    // selection rather than against the recommendation the server sent.
    await ui.run((a) => a.toggleSelection('landform', 'zone-4'))
    expect(ui.find('notice-ceiling-landform')).toBeNull()

    // IT IS ADVISORY AND NEVER BLOCKING. The 80% figure was always a design
    // judgment about leaving room for water, roads and trees; having handed
    // that judgment to the user, taking it back at the gate would be
    // incoherent.
    await ui.run((a) => a.toggleSelection('landform', 'zone-4'))
    expect(ui.find('notice-ceiling-landform')).not.toBeNull()
    expect(ui.find('commit-landform').disabled).toBe(false)

    await ui.unmount()
  })

  it('also carries the checks that did not run, which the caveat used to', async () => {
    const payload = payloadWith(1)
    payload.exclusion_layers = [
      { type: 'hydric', label: 'wet (hydric) soil', data_available: false, geometry_wgs84: null },
    ]
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: payload }),
    ])

    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    // It changes what the eligible highlight MEANS -- ground that was never
    // tested is drawn exactly like ground that passed -- so losing it with the
    // panel column would have been losing a safety statement, not a readout.
    expect(ui.text('notice-unavailable-hydric-landform')).toContain(
      'wet ground has not been excluded'
    )
    expect(ui.text('notice-unavailable-hydric-landform')).toContain('Walk those areas')

    await ui.unmount()
  })
})

/** Every .js/.jsx file under src/. */
function sourceFiles(root) {
  const { readdirSync, statSync } = require('node:fs')
  const found = []
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (/\.jsx?$/.test(entry)) found.push(full)
  }
  return found
}
