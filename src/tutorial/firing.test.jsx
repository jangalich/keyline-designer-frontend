/**
 * firing.test.jsx
 *
 * WHEN A STEP'S CARD OPENS BY ITSELF, against a FIXTURE registry, so the
 * rules are tested apart from whichever cards have shipped. The rules as a
 * pure function first, then through the shipped shell, where the help
 * control launches them: on the generate press for a step that has one, on
 * arrival for the one step that does not (boundary). Then the help control
 * against the SHIPPED registry, one step at a time.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import captured from '../fixtures/landform-session.json'
import { COMMITTED, GENERATED, NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { JOB_DONE, JOB_FAILED, JOB_RUNNING } from '../session/jobs'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import {
  ACCESS_POINT_INPUT,
  BOUNDARY_STEP,
  STEP_DEFINITIONS,
  registryProposalFeatures,
} from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { ON_ARM, ON_ARRIVAL, ON_GENERATE, anyJobRunning, shouldAutoFire } from './firing.js'
import { AUTO_KEY, SEEN_KEY, readPrefs, resetTutorialPrefsForTests } from './prefs.js'
import { AUTO_LABEL } from './StepCard.jsx'
import { STEP_CARDS } from './stepCards.js'
import { StepCardRegistry, TutorialReady } from './TutorialContext.jsx'

const FIXTURE = Object.freeze([
  Object.freeze({ stepId: 'boundary', title: 'Fixture: boundary', body: 'Draw the line.' }),
  Object.freeze({ stepId: 'landform', title: 'Fixture: landform', body: 'Read the ground.' }),
])

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ===========================================================================
   1. The rules
   =========================================================================== */

describe('1. the rules, as a function', () => {
  // Boundary: no generate, so it fires on arrival.
  const base = {
    registry: FIXTURE,
    stepId: 'boundary',
    prefs: { seen: [], auto: true },
    status: NOT_STARTED,
    jobRunning: false,
    somethingOpen: false,
    trigger: ON_ARRIVAL,
    generates: false,
  }
  // Landform: a generate, so it fires on the press.
  const pressed = { ...base, stepId: 'landform', trigger: ON_GENERATE, generates: true }

  it('fires on a not_started step absent from seen, with auto on', () => {
    expect(shouldAutoFire(base)).toBe(true)
    expect(shouldAutoFire({ ...pressed, prefs: { seen: ['orientation', 'boundary'], auto: true } })).toBe(true)
  })

  it('a step with a generate fires on the press and never on arrival', () => {
    expect(shouldAutoFire({ ...pressed, trigger: ON_ARRIVAL })).toBe(false)
    expect(shouldAutoFire(pressed)).toBe(true)
  })

  it('a step with no generate fires on arrival and has no press to fire on', () => {
    expect(BOUNDARY_STEP.generate == null).toBe(true)
    expect(shouldAutoFire(base)).toBe(true)
    expect(shouldAutoFire({ ...base, trigger: ON_GENERATE })).toBe(false)
  })

  it('a card that declares firesOn: arm fires on arming and on nothing else -- the shipped roads card does', () => {
    const armed = { ...pressed, registry: [{ stepId: 'landform', title: 't', body: 'b', firesOn: ON_ARM }], trigger: ON_ARM }
    expect(shouldAutoFire(armed)).toBe(true)
    expect(shouldAutoFire({ ...armed, trigger: ON_GENERATE })).toBe(false)
    expect(shouldAutoFire({ ...armed, trigger: ON_ARRIVAL })).toBe(false)
    // A card that declares nothing does not fire on arming.
    expect(shouldAutoFire({ ...pressed, trigger: ON_ARM })).toBe(false)
    expect(STEP_CARDS.find((card) => card.stepId === 'roads').firesOn).toBe(ON_ARM)
    expect(STEP_CARDS.filter((card) => card.firesOn != null).map((card) => card.stepId)).toEqual(['roads'])
  })

  it('does not fire when seen contains the step id', () => {
    expect(shouldAutoFire({ ...base, prefs: { seen: ['boundary'], auto: true } })).toBe(false)
    expect(shouldAutoFire({ ...pressed, prefs: { seen: ['landform'], auto: true } })).toBe(false)
  })

  it('does not fire when auto is false', () => {
    expect(shouldAutoFire({ ...base, prefs: { seen: [], auto: false } })).toBe(false)
    expect(shouldAutoFire({ ...pressed, prefs: { seen: [], auto: false } })).toBe(false)
  })

  it('does not fire on generated or committed -- the reopen case', () => {
    for (const rule of [base, pressed]) {
      expect(shouldAutoFire({ ...rule, status: GENERATED })).toBe(false)
      expect(shouldAutoFire({ ...rule, status: COMMITTED })).toBe(false)
      expect(shouldAutoFire({ ...rule, status: undefined })).toBe(false)
    }
  })

  it('does not fire while another job is running -- the pressed step\'s own job is not another', () => {
    expect(shouldAutoFire({ ...base, jobRunning: true })).toBe(false)
    expect(shouldAutoFire({ ...pressed, jobRunning: true })).toBe(false)
    expect(anyJobRunning({ jobs: {} })).toBe(false)
    expect(anyJobRunning({ jobs: { a: { stepId: 'landform', status: JOB_DONE } } })).toBe(false)
    expect(anyJobRunning({ jobs: { a: { stepId: 'landform', status: JOB_RUNNING } } })).toBe(true)
    expect(anyJobRunning({ jobs: { a: { stepId: 'landform', status: JOB_RUNNING } } }, 'landform')).toBe(false)
    expect(anyJobRunning({ jobs: { a: { stepId: 'water', status: JOB_RUNNING } } }, 'landform')).toBe(true)
  })

  it('does not fire while anything else is open', () => {
    expect(shouldAutoFire({ ...base, somethingOpen: true })).toBe(false)
    expect(shouldAutoFire({ ...pressed, somethingOpen: true })).toBe(false)
  })

  it('does not fire for a step with no card -- and the shipped registry carries boundary, landform, water, roads, trees and fencing', () => {
    expect(shouldAutoFire({ ...pressed, stepId: 'structures' })).toBe(false)
    expect(STEP_CARDS.map((card) => card.stepId)).toEqual(['boundary', 'landform', 'water', 'roads', 'trees', 'fencing'])
    expect(shouldAutoFire({ ...pressed, registry: STEP_CARDS, stepId: 'structures' })).toBe(false)
  })
})

/* ===========================================================================
   Harness: the shipped shell, a fixture registry, and the store's own resume
   =========================================================================== */

function serverDocument({ steps = {}, revision = 0 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  return {
    schema_version: 1,
    session_id: 'sess-1',
    document_revision: revision,
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

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body })

/**
 * The job the backend is running, held open until the test says how it ends:
 * `land()` answers the poll `done` with a result, `fail()` answers it
 * `failed`. Until then every poll hangs, which is the thirty to sixty seconds
 * the card is there to fill.
 */
function heldJob() {
  let answer
  const settled = new Promise((resolve) => {
    answer = resolve
  })
  const submits = []
  return {
    submits,
    poll: () => settled,
    land(stepId, payload) {
      answer(
        ok({
          job_id: `job-${submits.length}`,
          status: JOB_DONE,
          result: { payload, document: serverDocument({ steps: { [stepId]: { status: GENERATED } }, revision: 1 }) },
        })
      )
    },
    fail() {
      answer(
        ok({
          job_id: `job-${submits.length}`,
          status: JOB_FAILED,
          error: { error: 'Elevation did not respond.', failed_layer: { type: 'dem', label: 'Elevation' } },
        })
      )
    },
  }
}

function installFetch(document = serverDocument(), job = heldJob()) {
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/steps') {
      return ok({ step_order: [...STEP_ORDER] })
    }
    const generate = url.pathname.match(/^\/api\/sessions\/[^/]+\/steps\/([^/]+)\/generate$/)
    if (generate && method === 'POST') {
      job.submits.push(generate[1])
      return ok({ job_id: `job-${job.submits.length}`, status: JOB_RUNNING }, 202)
    }
    if (url.pathname.startsWith('/api/jobs/')) return job.poll()
    if (url.pathname.startsWith('/api/sessions/') && method === 'GET') {
      return ok(document)
    }
    // Anything else a step might ask for on arrival: an empty, harmless answer.
    return { ok: false, status: 404, json: async () => ({}) }
  })
  return job
}

const mounted = new Set()

/**
 * `registry: null` mounts NO registry provider: the shipped STEP_CARDS.
 * `ready` wraps the shell in the gate's READY, as App does.
 */
async function renderShell({ registry = FIXTURE, document, ready } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const job = installFetch(document)
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
  const handle = {
    async unmount() {
      mounted.delete(handle)
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.add(handle)

  const tree = (isReady) => {
    const shell = (
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <Probe />
          <div className="map-stage" data-testid="stage">
            {isReady === undefined ? (
              <WizardShell />
            ) : (
              <TutorialReady ready={isReady}>
                <WizardShell />
              </TutorialReady>
            )}
          </div>
        </WizardCursorProvider>
      </SessionProvider>
    )
    return registry === null ? shell : <StepCardRegistry cards={registry}>{shell}</StepCardRegistry>
  }

  await React.act(async () => {
    root.render(tree(ready))
  })

  const find = (id) => window.document.querySelector(`[data-testid="${id}"]`)
  return {
    find,
    job,
    stepCard: () => find('tutorial-step-card'),
    deck: () => find('tutorial-card'),
    get cursor() {
      return cursor
    },
    get state() {
      return session.state
    },
    async click(id) {
      const el = find(id)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    async resume() {
      await React.act(async () => {
        await session.actions.resume('sess-1')
      })
    },
    async open(stepId) {
      await React.act(async () => cursor.open(stepId))
    },
    async run(fn) {
      await React.act(async () => {
        fn(session.actions, cursor)
      })
    },
    async setReady(isReady) {
      await React.act(async () => root.render(tree(isReady)))
    },
    /** Let the poll's answer reach the store. */
    async settle() {
      for (let i = 0; i < 5; i += 1) await React.act(async () => new Promise((r) => setTimeout(r, 0)))
    },
    unmount: handle.unmount,
  }
}

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  resetTutorialPrefsForTests()
  window.history.replaceState({}, '', '/')
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const handle of [...mounted]) await handle.unmount()
})

const seen = () => readPrefs().seen

/** A session with the boundary committed and landform not started, landform's card unseen. */
async function atLandform(options = {}) {
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary']))
  const ui = await renderShell({ document: serverDocument(), ...options })
  await ui.resume()
  expect(ui.cursor.cursorStepId).toBe('landform')
  expect(ui.cursor.statuses.get('landform')).toBe(NOT_STARTED)
  return ui
}

/* ===========================================================================
   2. Through the shell
   =========================================================================== */

describe('2. through the shell, with a fixture registry', () => {
  it('boundary fires on arrival at a not_started step absent from seen, with auto on', async () => {
    const ui = await renderShell()
    expect(ui.cursor.cursorStepId).toBe('boundary')
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('boundary')
    expect(ui.find('tutorial-step-title').textContent).toBe('Fixture: boundary')
    // Focus is in the card; the deck is not open.
    expect(ui.stepCard().contains(window.document.activeElement)).toBe(true)
    expect(ui.deck()).toBeNull()
  })

  it('does not fire when seen contains the step id', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary']))
    const ui = await renderShell()
    expect(ui.stepCard()).toBeNull()
  })

  it('does not fire when auto is false', async () => {
    window.localStorage.setItem(AUTO_KEY, 'false')
    const ui = await renderShell()
    expect(ui.stepCard()).toBeNull()
  })

  it('does not fire on a generated step, nor on a committed one reopened', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['boundary']))
    const ui = await renderShell({
      document: serverDocument({ steps: { landform: { status: GENERATED } } }),
    })
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.statuses.get('landform')).toBe(GENERATED)
    expect(ui.stepCard()).toBeNull()

    // Back to the boundary, which a session makes committed: a fresh arrival
    // at a step absent from seen, and still nothing.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([]))
    await ui.open('boundary')
    expect(ui.cursor.cursorStepId).toBe('boundary')
    expect(ui.cursor.statuses.get('boundary')).toBe(COMMITTED)
    expect(ui.stepCard()).toBeNull()
  })

  it('an auto-opened card, dismissed, marks its step seen -- every way out', async () => {
    for (const way of ['tutorial-step-close', 'tutorial-step-done', 'tutorial-step-backdrop']) {
      window.localStorage.clear()
      resetTutorialPrefsForTests()
      const ui = await renderShell()
      expect(ui.stepCard(), way).not.toBeNull()
      expect(seen()).toEqual([])
      await ui.click(way)
      expect(ui.stepCard(), way).toBeNull()
      expect(seen(), way).toEqual(['boundary'])
      await ui.unmount()
    }
  })

  it('a manually opened card does not mark its step seen, and opens whatever seen and auto say', async () => {
    window.localStorage.setItem(AUTO_KEY, 'false')
    const ui = await renderShell()
    expect(ui.stepCard()).toBeNull()

    ui.find('tutorial-help').focus()
    await ui.click('tutorial-help')
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('boundary')
    await ui.click('tutorial-step-close')
    expect(ui.stepCard()).toBeNull()
    expect(seen()).toEqual([])
    // Focus back on the control that opened it.
    expect(window.document.activeElement).toBe(ui.find('tutorial-help'))

    // And with the step already seen, the help still opens it.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['boundary']))
    await ui.click('tutorial-help')
    expect(ui.stepCard()).not.toBeNull()
  })

  it('the help control opens the deck on a step with no card', async () => {
    const ui = await renderShell({ registry: [FIXTURE[1]] })
    expect(ui.stepCard()).toBeNull()
    await ui.click('tutorial-help')
    expect(ui.stepCard()).toBeNull()
    expect(ui.deck()).not.toBeNull()
  })

  it('the foot is one row: the auto checkbox, ticked, beside Got it -- and no link to the deck', async () => {
    const ui = await renderShell()
    const box = ui.find('tutorial-step-auto')
    expect(box.type).toBe('checkbox')
    expect(box.checked).toBe(true)
    expect(box.closest('label').textContent).toBe(AUTO_LABEL)
    expect(AUTO_LABEL).toBe('Show these tips automatically')
    expect(box.closest('.tutorial__nav')).toBe(ui.find('tutorial-step-done').parentElement)
    expect(ui.find('tutorial-step-deck')).toBeNull()
    expect(ui.stepCard().textContent).not.toContain('How the map works')
  })

  it('the checkbox writes auto, and unticking it suppresses every later step', async () => {
    const ui = await renderShell({ document: serverDocument() })
    expect(ui.stepCard()).not.toBeNull()
    await ui.click('tutorial-step-auto')
    expect(window.localStorage.getItem(AUTO_KEY)).toBe('false')
    expect(readPrefs().auto).toBe(false)
    expect(ui.find('tutorial-step-auto').checked).toBe(false)
    await ui.click('tutorial-step-close')

    // The next step, arrived at through a resume: not_started, unseen, with a
    // card -- and nothing opens, on arrival or on the press.
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.statuses.get('landform')).toBe(NOT_STARTED)
    expect(ui.stepCard()).toBeNull()
    await ui.click('generate-landform')
    expect(ui.job.submits).toEqual(['landform'])
    expect(ui.stepCard()).toBeNull()

    // Ticking it again, on the step's card opened by hand, turns it back on.
    await ui.click('tutorial-help')
    await ui.click('tutorial-step-auto')
    expect(window.localStorage.getItem(AUTO_KEY)).toBe('true')
  })

  it('...and left ticked, the same next step fires on its generate press, not on arrival', async () => {
    const ui = await renderShell({ document: serverDocument() })
    await ui.click('tutorial-step-close')
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.stepCard()).toBeNull()
    await ui.click('generate-landform')
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('landform')
  })

  it('does not fire while another dialogue is open', async () => {
    const other = window.document.createElement('div')
    other.setAttribute('role', 'dialog')
    window.document.body.appendChild(other)
    try {
      const ui = await renderShell()
      expect(ui.stepCard()).toBeNull()
    } finally {
      other.remove()
    }
  })

  it('does not fire for a resuming person before the document says where they are', async () => {
    // A session id in storage: the boundary reads not_started for the first
    // frame, and is committed by the time the document lands.
    window.localStorage.setItem('keyline.sessionId', 'sess-1')
    const ui = await renderShell({ registry: [FIXTURE[0]] })
    expect(ui.stepCard()).toBeNull()
  })
})

/* ===========================================================================
   3. The generate press
   =========================================================================== */

describe('3. a card fires on the generate press', () => {
  it('fires on the press, not on arrival -- and marks the step seen as it opens', async () => {
    const ui = await atLandform()
    // Arrived: nothing.
    expect(ui.stepCard()).toBeNull()
    expect(seen()).toEqual(['orientation', 'boundary'])

    await ui.click('generate-landform')
    expect(ui.job.submits).toEqual(['landform'])
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('landform')
    expect(ui.find('tutorial-step-title').textContent).toBe('Fixture: landform')
    expect(seen()).toEqual(['orientation', 'boundary', 'landform'])
    // The waiting starts behind it: the banner says so.
    expect(ui.find('working-landform')).not.toBeNull()
  })

  it('dismissing does not wait for the job: the wait carries on behind it', async () => {
    const ui = await atLandform()
    await ui.click('generate-landform')
    expect(ui.stepCard()).not.toBeNull()
    await ui.click('tutorial-step-close')
    expect(ui.stepCard()).toBeNull()
    expect(ui.find('working-landform')).not.toBeNull()
    expect(ui.state.jobs['job-1']?.status ?? Object.values(ui.state.jobs)[0].status).toBe(JOB_RUNNING)
  })

  it('the job landing does not close the card: its results arrive behind it', async () => {
    const ui = await atLandform()
    await ui.click('generate-landform')
    expect(ui.stepCard()).not.toBeNull()
    ui.job.land('landform', captured.payload)
    await ui.settle()
    expect(ui.cursor.statuses.get('landform')).toBe(GENERATED)
    expect(ui.find('working-landform')).toBeNull()
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('landform')
  })

  it('a failed job closes an open card', async () => {
    const ui = await atLandform()
    await ui.click('generate-landform')
    expect(ui.stepCard()).not.toBeNull()
    ui.job.fail()
    await ui.settle()
    expect(ui.stepCard()).toBeNull()
    expect(ui.find('working-landform')).toBeNull()
  })

  it('does not fire on a second generate of the same step', async () => {
    const ui = await atLandform()
    await ui.click('generate-landform')
    expect(ui.stepCard()).not.toBeNull()
    // The first attempt fails, closing the card; the retry is a second press.
    ui.job.fail()
    await ui.settle()
    expect(ui.stepCard()).toBeNull()
    expect(ui.find('generate-landform')).not.toBeNull()
    await ui.click('generate-landform')
    expect(ui.job.submits).toEqual(['landform', 'landform'])
    expect(ui.stepCard()).toBeNull()
  })

  it('does not fire when the step id is in the seen list', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary', 'landform']))
    const ui = await renderShell({ document: serverDocument() })
    await ui.resume()
    await ui.click('generate-landform')
    expect(ui.job.submits).toEqual(['landform'])
    expect(ui.stepCard()).toBeNull()
  })

  it('does not fire when auto is off', async () => {
    window.localStorage.setItem(AUTO_KEY, 'false')
    const ui = await atLandform()
    await ui.click('generate-landform')
    expect(ui.job.submits).toEqual(['landform'])
    expect(ui.stepCard()).toBeNull()
    expect(seen()).toEqual(['orientation', 'boundary'])
  })

  it('does not fire on a reopened step -- a regenerate of work already done', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary']))
    const ui = await renderShell({
      document: serverDocument({ steps: { landform: { status: GENERATED } } }),
    })
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.statuses.get('landform')).toBe(GENERATED)
    // The store's generate is what every generate button calls.
    await ui.run((actions) => actions.generate('landform', {}))
    expect(ui.job.submits).toEqual(['landform'])
    expect(ui.stepCard()).toBeNull()
    expect(seen()).toEqual(['orientation', 'boundary'])
  })

  it('boundary still fires at the gate hand-over, and has no generate path', async () => {
    const ui = await renderShell({ ready: false })
    expect(ui.cursor.cursorStepId).toBe('boundary')
    // Held while the gate hands over...
    expect(ui.stepCard()).toBeNull()
    // ...and there when the chrome has settled.
    await ui.setReady(true)
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('boundary')
    // No generate: not declared, and not a button.
    expect(ui.cursor.definitions.get('boundary').generate == null).toBe(true)
    expect(ui.find('generate-boundary')).toBeNull()
  })
})

/* ===========================================================================
   4. The help control, against the shipped registry
   =========================================================================== */

describe('4. the help control opens the active step\'s card', () => {
  // Auto off and nothing seen but the orientation, so nothing opens by itself
  // and a step that help wrongly marked seen would show in the list.
  const SESSION = {
    boundary: { steps: {}, sessioned: false },
    landform: { steps: {} },
    water: { steps: { landform: { status: COMMITTED } } },
    roads: { steps: { landform: { status: COMMITTED }, water: { status: COMMITTED } } },
    trees: {
      steps: { landform: { status: COMMITTED }, water: { status: COMMITTED }, roads: { status: COMMITTED } },
    },
    structures: {
      steps: {
        landform: { status: COMMITTED },
        water: { status: COMMITTED },
        roads: { status: COMMITTED },
        trees: { status: COMMITTED },
      },
    },
  }

  async function at(stepId) {
    const { steps, sessioned = true } = SESSION[stepId]
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation']))
    window.localStorage.setItem(AUTO_KEY, 'false')
    const ui = await renderShell({ registry: null, document: serverDocument({ steps }) })
    if (sessioned) await ui.resume()
    expect(ui.cursor.cursorStepId).toBe(stepId)
    expect(ui.stepCard()).toBeNull()
    return ui
  }

  for (const stepId of ['boundary', 'landform', 'water', 'roads', 'trees']) {
    it(`on ${stepId}: its own card, not the deck -- and the step is not marked seen`, async () => {
      const ui = await at(stepId)
      const before = seen()
      await ui.click('tutorial-help')
      expect(ui.deck()).toBeNull()
      expect(ui.stepCard()).not.toBeNull()
      expect(ui.stepCard().dataset.step).toBe(stepId)
      expect(seen()).toEqual(before)
      await ui.click('tutorial-step-close')
      expect(ui.stepCard()).toBeNull()
      expect(seen()).toEqual(before)
      expect(seen()).not.toContain(stepId)
    })
  }

  it('on structures, which has no card: the deck', async () => {
    const ui = await at('structures')
    await ui.click('tutorial-help')
    expect(ui.stepCard()).toBeNull()
    expect(ui.deck()).not.toBeNull()
  })
})

/* ===========================================================================
   5. The shipped registry, pressed
   =========================================================================== */

describe('5. roads, through the shipped registry', () => {
  async function atRoads(seenList = ['orientation', 'boundary', 'landform', 'water']) {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seenList))
    const ui = await renderShell({
      registry: null,
      document: serverDocument({ steps: { landform: { status: COMMITTED }, water: { status: COMMITTED } } }),
    })
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('roads')
    expect(ui.stepCard()).toBeNull()
    return ui
  }

  it('fires on "Add access point", before the point is placed, and marks roads seen', async () => {
    const ui = await atRoads()
    await ui.click('access-roads')
    expect(ui.cursor.armed).toBe('draw')
    expect(ui.stepCard()).not.toBeNull()
    expect(ui.stepCard().dataset.step).toBe('roads')
    expect(seen()).toContain('roads')
    // Dismissed, the tool is still armed: the next click places the point.
    await ui.click('tutorial-step-close')
    expect(ui.stepCard()).toBeNull()
    expect(ui.cursor.armed).toBe('draw')
  })

  it('does not fire again on "Generate network", nor on a second "Add access point"', async () => {
    const ui = await atRoads()
    await ui.click('access-roads')
    await ui.click('tutorial-step-close')
    await ui.run((actions) => actions.setDraftInput('roads', ACCESS_POINT_INPUT, [-74.01, 40.705]))
    await ui.click('generate-roads')
    expect(ui.job.submits).toEqual(['roads'])
    expect(ui.stepCard()).toBeNull()
  })

  it('does not fire on arming when roads is seen, or when auto is off', async () => {
    const ui = await atRoads(['orientation', 'boundary', 'landform', 'water', 'roads'])
    await ui.click('access-roads')
    expect(ui.cursor.armed).toBe('draw')
    expect(ui.stepCard()).toBeNull()
    await ui.unmount()

    window.localStorage.setItem(AUTO_KEY, 'false')
    const off = await atRoads()
    await off.click('access-roads')
    expect(off.stepCard()).toBeNull()
  })
})
