/**
 * firing.test.jsx
 *
 * WHEN A STEP'S CARD OPENS BY ITSELF, against a FIXTURE registry, so the
 * rules are tested apart from whichever cards have shipped. The rules as a pure function first, then through the
 * shipped shell, where the help control launches them.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMMITTED, GENERATED, NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { JOB_DONE, JOB_RUNNING } from '../session/jobs'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { STEP_DEFINITIONS, registryProposalFeatures } from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { anyJobRunning, shouldAutoFire } from './firing.js'
import { AUTO_KEY, SEEN_KEY, readPrefs, resetTutorialPrefsForTests } from './prefs.js'
import { AUTO_LABEL } from './StepCard.jsx'
import { STEP_CARDS } from './stepCards.js'
import { StepCardRegistry } from './TutorialContext.jsx'

const FIXTURE = Object.freeze([
  Object.freeze({ stepId: 'boundary', title: 'Fixture: boundary', body: 'Draw the line.' }),
  Object.freeze({ stepId: 'landform', title: 'Fixture: landform', body: 'Read the ground.' }),
])

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ===========================================================================
   1. The rules
   =========================================================================== */

describe('1. the rules, as a function', () => {
  const base = {
    registry: FIXTURE,
    stepId: 'boundary',
    prefs: { seen: [], auto: true },
    status: NOT_STARTED,
    jobRunning: false,
    somethingOpen: false,
  }

  it('fires on a not_started step absent from seen, with auto on', () => {
    expect(shouldAutoFire(base)).toBe(true)
    expect(shouldAutoFire({ ...base, stepId: 'landform', prefs: { seen: ['orientation', 'boundary'], auto: true } })).toBe(true)
  })

  it('does not fire when seen contains the step id', () => {
    expect(shouldAutoFire({ ...base, prefs: { seen: ['boundary'], auto: true } })).toBe(false)
  })

  it('does not fire when auto is false', () => {
    expect(shouldAutoFire({ ...base, prefs: { seen: [], auto: false } })).toBe(false)
  })

  it('does not fire on generated or committed -- the reopen case', () => {
    expect(shouldAutoFire({ ...base, status: GENERATED })).toBe(false)
    expect(shouldAutoFire({ ...base, status: COMMITTED })).toBe(false)
    expect(shouldAutoFire({ ...base, status: undefined })).toBe(false)
  })

  it('does not fire while a job is running', () => {
    expect(shouldAutoFire({ ...base, jobRunning: true })).toBe(false)
    expect(anyJobRunning({ jobs: {} })).toBe(false)
    expect(anyJobRunning({ jobs: { a: { stepId: 'landform', status: JOB_DONE } } })).toBe(false)
    expect(anyJobRunning({ jobs: { a: { stepId: 'landform', status: JOB_RUNNING } } })).toBe(true)
  })

  it('does not fire while anything else is open', () => {
    expect(shouldAutoFire({ ...base, somethingOpen: true })).toBe(false)
  })

  it('does not fire for a step with no card -- and the shipped registry carries boundary', () => {
    expect(shouldAutoFire({ ...base, stepId: 'water' })).toBe(false)
    expect(STEP_CARDS.map((card) => card.stepId)).toEqual(['boundary'])
    expect(shouldAutoFire({ ...base, registry: STEP_CARDS, stepId: 'water' })).toBe(false)
  })
})

/* ===========================================================================
   Harness: the shipped shell, a fixture registry, and the store's own resume
   =========================================================================== */

function serverDocument({ steps = {} } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  return {
    schema_version: 1,
    session_id: 'sess-1',
    document_revision: 0,
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

function installFetch(document = serverDocument()) {
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    if (url.pathname.startsWith('/api/sessions/') && (init.method ?? 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => document }
    }
    // Anything else a step might ask for on arrival: an empty, harmless answer.
    return { ok: false, status: 404, json: async () => ({}) }
  })
}

const mounted = new Set()

async function renderShell({ registry = FIXTURE, document } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  installFetch(document)
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

  await React.act(async () => {
    root.render(
      <StepCardRegistry cards={registry}>
        <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
          <WizardCursorProvider definitions={STEP_DEFINITIONS}>
            <Probe />
            <div className="map-stage" data-testid="stage">
              <WizardShell />
            </div>
          </WizardCursorProvider>
        </SessionProvider>
      </StepCardRegistry>
    )
  })

  const find = (id) => window.document.querySelector(`[data-testid="${id}"]`)
  return {
    find,
    stepCard: () => find('tutorial-step-card'),
    deck: () => find('tutorial-card'),
    get cursor() {
      return cursor
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

/* ===========================================================================
   2. Through the shell
   =========================================================================== */

describe('2. through the shell, with a fixture registry', () => {
  it('fires on arrival at a not_started step absent from seen, with auto on', async () => {
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
    // card -- and nothing opens.
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.statuses.get('landform')).toBe(NOT_STARTED)
    expect(ui.stepCard()).toBeNull()

    // Ticking it again, on the step's card opened by hand, turns it back on.
    await ui.click('tutorial-help')
    await ui.click('tutorial-step-auto')
    expect(window.localStorage.getItem(AUTO_KEY)).toBe('true')
  })

  it('...and left ticked, the same next step does fire', async () => {
    const ui = await renderShell({ document: serverDocument() })
    await ui.click('tutorial-step-close')
    await ui.resume()
    expect(ui.cursor.cursorStepId).toBe('landform')
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
