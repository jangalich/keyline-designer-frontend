/**
 * waiting.test.jsx
 *
 * THE CYCLING PHRASES IN THE INSTRUCTION BAR, and the claims they are allowed
 * to make -- which is none.
 *
 * WHAT THIS SUITE IS ACTUALLY GUARDING. The phrases are unverifiable by
 * construction: they turn on a timer over a request that reports no progress,
 * so no assertion here can check that a phrase is TRUE. What can be checked,
 * and is, is that they never say anything that could be false -- no layer, no
 * step, no position in a sequence -- and that they are bounded by the state
 * that produced them: they arrive only when a wait has lasted, they stop the
 * moment the request answers either way, and they never sit on top of a
 * failure notice.
 *
 * THE OTHER HALF IS THE THRESHOLD. Past it the copy stops implying steady
 * progress and says so, and the assertion that matters there is a NEGATIVE
 * one: it is still the direction, in the direction's slot, with no error tone
 * anywhere near it and the request still in flight.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import {
  BOUNDARY_RING_INPUT,
  BOUNDARY_STEP_ID,
  STEP_DEFINITIONS,
  registryProposalFeatures,
} from './stepDefinitions'
import { COMMITTING, GENERATING, MACHINE_STATES } from './useStepMachine'
import {
  LONG,
  LONG_WAIT_LINE,
  LONG_WAIT_MS,
  PHRASE,
  PHRASE_INTERVAL_MS,
  WAIT_PHRASES,
  useWaitingLine,
} from './shell/WaitingLine.jsx'
import { resetStepCatalog } from './stepCatalog.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const RING = [
  [40.7, -74.01],
  [40.7, -74.0],
  [40.71, -74.0],
]

/** The backend's own layer pair: a stable `type`, display prose in `label`. */
const FAILED_LAYER = { type: 'canopy', label: 'tree canopy height' }

function serverDocument() {
  const steps = {}
  for (const stepId of [...STEP_ORDER].sort()) steps[stepId] = { status: NOT_STARTED }
  return {
    schema_version: 1,
    session_id: 'sess-1',
    document_revision: 0,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: [[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.71]],
    step_order: [...STEP_ORDER],
    steps,
  }
}

/**
 * A fetch whose POST /api/sessions is held open until the test releases it.
 *
 * The state under test EXISTS ONLY WHILE A REQUEST IS OUT -- shell.test.jsx's
 * section 9 makes the same point and holds the same route for the same reason.
 * Here the wait is not merely observed but ADVANCED, so the request has to
 * stay out across as much simulated time as the case needs.
 */
/**
 * A fetch that answers the boundary commit at once and HOLDS the generate.
 *
 * The generate is the longer of the two waits and it enters the shell by a
 * different door -- the store's job table rather than the machine's own
 * pending flag -- so it is worth driving once through the shipped path rather
 * than only through the hook.
 *
 * THE SUBMIT IS WHAT IS HELD, and nothing is ever polled. `generate` marks the
 * step generating BEFORE its first await (SessionStore's JOB_STARTED comment
 * says so and roads.test.jsx measures it), so a POST that never answers parks
 * the shell in `generating` with no job id and no poll cycle to wind forward.
 */
function installHeldGenerate() {
  let release = null
  const held = new Promise((resolve) => {
    release = resolve
  })

  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    if (url.pathname === '/api/sessions' && method === 'POST') {
      return { ok: true, status: 201, json: async () => serverDocument() }
    }
    if (url.pathname.endsWith('/generate') && method === 'POST') {
      await held
      return { ok: true, status: 202, json: async () => ({ job_id: 'job-1' }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })

  return () => release()
}

function installHeldSession(settle) {
  let release = null
  const held = new Promise((resolve) => {
    release = resolve
  })

  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    if (url.pathname === '/api/sessions' && (init.method ?? 'GET') === 'POST') {
      await held
      const { status, body } = settle()
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }
    // Whatever the step the commit advanced to asks for next: an empty
    // payload is enough, because nothing past the boundary is under test here.
    return { ok: true, status: 200, json: async () => ({}) }
  })

  return () => release()
}

async function renderShell() {
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
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
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
    get actions() {
      return session.actions
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    /** The phrase on screen right now, or null. */
    phrase: () => container.querySelector(`[data-testid="waiting-phrase-${BOUNDARY_STEP_ID}"]`)?.textContent ?? null,
    /** 'phrase' | 'long' | null -- what the direction slot is currently doing. */
    waiting: () => container.querySelector('[data-waiting]')?.dataset.waiting ?? null,
    direction: () =>
      container.querySelector(`[data-testid="instruction-${BOUNDARY_STEP_ID}"]`),
    async run(fn) {
      await React.act(async () => fn(session.actions, cursor))
    },
    async tick(ms) {
      await React.act(async () => {
        vi.advanceTimersByTime(ms)
      })
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

/** Draw a ring and press Commit WITHOUT waiting for the held request. */
async function pressCommit(ui) {
  await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))
  const button = ui.find(`commit-${BOUNDARY_STEP_ID}`)
  expect(button).not.toBeNull()
  await React.act(async () => {
    button.click()
    await Promise.resolve()
  })
  expect(ui.find(`step-${BOUNDARY_STEP_ID}`).dataset.stepState).toBe(COMMITTING)
}

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. THE PHRASES RENDER WHILE THE COMMIT IS OUT, AND THEY CYCLE
   =========================================================================== */

describe('1. a commit in flight cycles phrases through the direction', () => {
  it('holds the declared instruction until the wait has lasted, then turns over', async () => {
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)

    // THE FIRST INTERVAL IS THE GRACE, and this is where a wait too short for
    // any of this is protected: the declared line stands alone, and a commit
    // that answers inside it never shows a phrase at all.
    expect(ui.waiting()).toBeNull()
    expect(ui.direction().textContent).toBe('Creating the session…')

    // THE PHRASES, ONE PER INTERVAL, IN THE DIRECTION'S OWN SLOT.
    const seen = []
    for (let i = 0; i < WAIT_PHRASES[COMMITTING].length; i += 1) {
      await ui.tick(PHRASE_INTERVAL_MS)
      expect(ui.waiting()).toBe(PHRASE)
      seen.push(ui.phrase())
    }
    expect(seen).toEqual([...WAIT_PHRASES[COMMITTING]])

    // AND THEY LOOP rather than running out, because a wait can outlast the
    // list and an empty bar at the end would be worse than the start again.
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.phrase()).toBe(WAIT_PHRASES[COMMITTING][0])

    // EXACTLY ONE IS VISIBLE. The others are in the document to hold the slot's
    // width still; `visibility` is what hides them, so the box does not resize
    // four times while the request travels.
    const stack = ui.container.querySelectorAll('.chrome-bar__waiting-phrase')
    expect(stack).toHaveLength(WAIT_PHRASES[COMMITTING].length)
    expect([...stack].filter((el) => el.dataset.current === 'true')).toHaveLength(1)

    // NOT ANNOUNCED FOUR TIMES. The live region's phrase stack is hidden from
    // assistive technology; the banner says "Committing…" once, and does.
    expect(ui.container.querySelector('.chrome-bar__waiting').getAttribute('aria-hidden')).toBe('true')
    expect(ui.text(`working-${BOUNDARY_STEP_ID}`).trim()).toBe('Committing…')

    await React.act(async () => {
      release()
      await Promise.resolve()
    })
    await ui.unmount()
  })

  it('shows nothing at all for a commit that answers inside the first interval', async () => {
    // THE OTHER HALF OF THE SAME RULE, said where it can fail: a phrase that
    // flashes for a moment is noise, and no step had to declare itself fast
    // for this to hold.
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)

    await ui.tick(PHRASE_INTERVAL_MS - 1)
    expect(ui.waiting()).toBeNull()

    await React.act(async () => {
      release()
      await Promise.resolve()
    })
    expect(ui.waiting()).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   2. THEY STOP WHEN THE COMMIT RESOLVES -- EITHER WAY
   =========================================================================== */

describe('2. the phrases end with the request', () => {
  it('stops on a commit that lands', async () => {
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.waiting()).toBe(PHRASE)

    await React.act(async () => {
      release()
      await Promise.resolve()
    })

    // NOT MERELY A DIFFERENT PHRASE: no waiting line anywhere in the shell.
    expect(ui.waiting()).toBeNull()
    // AND NO TIMER LEFT RUNNING BEHIND IT -- said as a lapsed one would fail
    // it, by advancing well past several more intervals.
    await ui.tick(PHRASE_INTERVAL_MS * 5)
    expect(ui.waiting()).toBeNull()

    await ui.unmount()
  })

  it('stops on a commit that does not land', async () => {
    const release = installHeldSession(() => ({
      status: 500,
      body: { error: 'boom', failed_layer: FAILED_LAYER },
    }))
    const ui = await renderShell()
    await pressCommit(ui)
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.waiting()).toBe(PHRASE)

    await React.act(async () => {
      release()
      await Promise.resolve()
    })

    expect(ui.waiting()).toBeNull()
    await ui.tick(PHRASE_INTERVAL_MS * 5)
    expect(ui.waiting()).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   3. PAST THE THRESHOLD THE COPY CHANGES, AND IT IS NOT AN ERROR
   =========================================================================== */

describe('3. a wait that runs long says so', () => {
  it('changes the copy past the threshold, as a direction and not as a failure', async () => {
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)

    // IN REAL SECONDS, NOT IN UNITS OF THE CONSTANT. A test that ticks
    // `LONG_WAIT_MS` forward proves the threshold is honoured and proves
    // nothing about where it is -- and where it is, is the decision.
    //
    // STILL AN ORDINARY WAIT AT TWENTY-FOUR SECONDS: the phrases are cycling,
    // because a commit that has taken sixteen is slow and not stuck.
    await ui.tick(24000)
    expect(ui.waiting()).toBe(PHRASE)

    // PAST TWENTY-FIVE, THE COPY ACKNOWLEDGES THE WAIT.
    await ui.tick(2000)
    expect(ui.waiting()).toBe(LONG)
    expect(ui.text(`waiting-long-${BOUNDARY_STEP_ID}`)).toBe(
      'Still working. Some data sources are slow today.'
    )

    // AND THE CYCLING IS OVER: phrases that keep turning over would go on
    // implying a steady progress that has plainly stopped.
    expect(ui.phrase()).toBeNull()
    await ui.tick(PHRASE_INTERVAL_MS * 3)
    expect(ui.waiting()).toBe(LONG)

    // IT IS NOT AN ERROR STATE, said four ways, because that is the whole
    // claim of this test:
    //   the machine is still committing -- nothing was cancelled or failed,
    expect(ui.find(`step-${BOUNDARY_STEP_ID}`).dataset.stepState).toBe(COMMITTING)
    //   the line is the DIRECTION, not a notice with an error tone,
    expect(ui.find(`waiting-long-${BOUNDARY_STEP_ID}`).closest('.chrome-bar__direction')).not.toBeNull()
    expect(ui.container.querySelector('.chrome-bar__notice--error')).toBeNull()
    expect(ui.find(`notices-${BOUNDARY_STEP_ID}`)).toBeNull()
    //   the banner still reports the request as running, with no button back,
    expect(ui.text(`working-${BOUNDARY_STEP_ID}`).trim()).toBe('Committing…')
    expect(ui.find(`commit-${BOUNDARY_STEP_ID}`)).toBeNull()
    //   and the copy offers no retry and admits no fault.
    const line = ui.text(`waiting-long-${BOUNDARY_STEP_ID}`)
    expect(line).not.toMatch(/error|failed|sorry|try again|retry|cancel/i)

    // THE REQUEST IS STILL THE ONE THAT DECIDES. It lands, late, and the step
    // commits exactly as it would have at eight seconds.
    await React.act(async () => {
      release()
      await Promise.resolve()
    })
    expect(ui.waiting()).toBeNull()
    expect(ui.state.sessionId).toBe('sess-1')

    await ui.unmount()
  })
})

/* ===========================================================================
   4. A FAILED COMMIT STILL REPORTS ITS FAILURE
   =========================================================================== */

describe('4. the failure notice is untouched by any of this', () => {
  it('names the source that did not answer, after a wait long enough to have cycled', async () => {
    const release = installHeldSession(() => ({
      status: 500,
      body: { error: 'boom', failed_layer: FAILED_LAYER },
    }))
    const ui = await renderShell()
    await pressCommit(ui)

    // A LONG WAIT FIRST, and past the threshold at that -- the case where the
    // bar has been saying "Still working." for a while and then the answer is
    // a failure. Both the phrases and the long-wait line must give way to it.
    await ui.tick(LONG_WAIT_MS[COMMITTING] + PHRASE_INTERVAL_MS)
    expect(ui.waiting()).toBe(LONG)

    await React.act(async () => {
      release()
      await Promise.resolve()
    })

    // THE NOTICE IS THE BACKEND'S OWN, WORD FOR WORD, and it is the whole of
    // what the bar says now.
    const notice = ui.text(`commit-failed-${BOUNDARY_STEP_ID}`)
    expect(notice).toContain('The tree canopy height source did not respond.')
    expect(notice).toContain('public datasets that go down from time to time')
    expect(notice).toContain('kept exactly as you drew it')
    expect(ui.waiting()).toBeNull()

    // AND THE WAY BACK IS THE BUTTON, RETURNED. The ring survived, so the
    // commit is pressable again.
    expect(ui.find(`commit-${BOUNDARY_STEP_ID}`)).not.toBeNull()
    expect(ui.state.drafts[BOUNDARY_STEP_ID].inputs[BOUNDARY_RING_INPUT]).toEqual(RING)

    await ui.unmount()
  })
})

/* ===========================================================================
   5. REDUCED MOTION
   =========================================================================== */

/** A matchMedia that answers `matches` for the reduce query and nothing else. */
function installMotionPreference(reduce) {
  window.matchMedia = vi.fn((query) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

describe('5. reduced motion holds the line still', () => {
  it('shows one phrase and does not turn it over, and still says when the wait runs long', async () => {
    installMotionPreference(true)
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)

    // THE LINE STILL ARRIVES. The setting is about movement, not about
    // information -- the same posture the pulse takes in App.css, where
    // reduced motion stops the animation and keeps the dot.
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.waiting()).toBe(PHRASE)
    expect(ui.phrase()).toBe(WAIT_PHRASES[COMMITTING][0])

    // AND IT DOES NOT MOVE AGAIN, across the whole of an ordinary commit.
    for (let i = 0; i < 6; i += 1) {
      await ui.tick(PHRASE_INTERVAL_MS)
      expect(ui.phrase()).toBe(WAIT_PHRASES[COMMITTING][0])
    }

    // THE THRESHOLD IS NOT MOTION AND IS NOT SUPPRESSED. What changes there is
    // a fact about the wait, and a person who has turned animation off needs
    // it more than anyone: nothing else on their screen is moving.
    await ui.tick(LONG_WAIT_MS[COMMITTING])
    expect(ui.waiting()).toBe(LONG)
    expect(ui.text(`waiting-long-${BOUNDARY_STEP_ID}`)).toBe(LONG_WAIT_LINE[COMMITTING])

    await React.act(async () => {
      release()
      await Promise.resolve()
    })
    await ui.unmount()
  })

  it('cycles when the preference is not set, which is what the case above is measured against', async () => {
    installMotionPreference(false)
    const release = installHeldSession(() => ({ status: 201, body: serverDocument() }))
    const ui = await renderShell()
    await pressCommit(ui)

    await ui.tick(PHRASE_INTERVAL_MS)
    const first = ui.phrase()
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.phrase()).not.toBe(first)

    await React.act(async () => {
      release()
      await Promise.resolve()
    })
    await ui.unmount()
  })
})

/* ===========================================================================
   6. NO PHRASE NAMES A LAYER, A STEP, OR A POSITION IN A SEQUENCE
   =========================================================================== */

/**
 * THE VOCABULARY A PHRASE MAY NOT CONTAIN, and where each entry comes from.
 *
 * THE STEPS are the wizard's own ids and titles. A phrase carrying one would
 * read as a step report -- and the shell would be naming a step to say it,
 * which is the thing shell.test.jsx's section 4 exists to prevent.
 *
 * THE LAYERS are the backend's, in the two spellings that reach this client:
 * the snake_case fetch names in parcel_data.FETCH_LAYERS, and the display
 * `label` prose on the {type, label} pair a failure carries. A phrase quoting
 * either would be claiming to know which fetch is running, which nothing here
 * knows.
 *
 * THE POSITIONS are the words and figures that turn four phrases into a
 * numbered list. This is the entry that matters most, because it is the one a
 * later edit reaches for: "first", "then", "next", "step 2", "3 of 12", "40%".
 */
const FORBIDDEN = {
  'a step': [...STEP_ORDER, BOUNDARY_STEP_ID, 'boundary', 'landform', 'fencing'],
  'a layer': [
    'dem',
    'soil_components',
    'farmland_classification',
    'erosion_factor',
    'saturated_hydraulic_conductivity',
    'soil_geometries',
    'water_features',
    'farm_roads',
    'climate_summary',
    'canopy_height',
    'imagery_summary',
    'irradiance',
    'elevation data',
    'tree canopy height',
    'suggested_zones',
    'eligible_union',
    'exclusion_layers',
  ],
  'a position in a sequence': [
    'first',
    'second',
    'third',
    'last',
    'final',
    'finally',
    'then',
    'next',
    'after that',
    'now ',
    'almost',
    'nearly done',
    'remaining',
    'of 12',
    'step',
  ],
}

describe('6. the phrases claim nothing', () => {
  it('names no layer, no step and no position in a sequence', () => {
    const lines = [
      ...Object.values(WAIT_PHRASES).flatMap((set) => [...set]),
      ...Object.values(LONG_WAIT_LINE),
    ]
    expect(lines.length).toBeGreaterThan(0)

    for (const line of lines) {
      const text = line.toLowerCase()
      for (const [kind, words] of Object.entries(FORBIDDEN)) {
        for (const word of words) {
          expect(text, `"${line}" names ${kind}: "${word}"`).not.toContain(word)
        }
      }
      // NO FIGURE OF ANY KIND. A percentage, a count or a countdown is a
      // progress readout, and there is no progress to read.
      expect(text, `"${line}" carries a figure`).not.toMatch(/\d|%/)
      // NOR A DURATION, which is the same claim in words: nothing here knows
      // how long the request has left.
      expect(text).not.toMatch(/\b(seconds?|minutes?|moment|soon|shortly)\b/)
    }
  })

  it('writes them as the copy rules ask: sentence case, active, plain', () => {
    for (const line of Object.values(WAIT_PHRASES).flatMap((set) => [...set])) {
      // Sentence case: the first word carries the only capital, and nothing
      // shouts.
      const [head, ...rest] = line.split(' ')
      expect(head[0]).toBe(head[0].toUpperCase())
      for (const word of rest) expect(word).toBe(word.toLowerCase())
      expect(line).not.toBe(line.toUpperCase())
      // A phrase, not a sentence: no full stop, no ellipsis borrowed from the
      // declared instruction it replaces.
      expect(line).not.toMatch(/[.…]/)
    }
    // The long-wait lines ARE sentences, and are punctuated as such.
    for (const line of Object.values(LONG_WAIT_LINE)) {
      expect(line.startsWith('Still working.')).toBe(true)
      expect(line.endsWith('.')).toBe(true)
    }
  })

  it('declares a set for the two waiting states and for no other', () => {
    // A PHRASE SET IS A CLAIM THAT THE STATE CAN LAST. `loading` is a single
    // GET, `idle`, `reviewing`, `editing` and `committed` are not waits at
    // all, and a set declared for any of them would put phrases over a screen
    // the user is working on.
    expect(Object.keys(WAIT_PHRASES).sort()).toEqual([COMMITTING, GENERATING].sort())
    expect(Object.keys(LONG_WAIT_MS).sort()).toEqual(Object.keys(WAIT_PHRASES).sort())
    expect(Object.keys(LONG_WAIT_LINE).sort()).toEqual(Object.keys(WAIT_PHRASES).sort())
    for (const state of Object.keys(WAIT_PHRASES)) {
      expect(MACHINE_STATES).toContain(state)
      expect(WAIT_PHRASES[state].length).toBeGreaterThanOrEqual(4)
    }
    // THE TWO THRESHOLDS DIFFER BECAUSE THE TWO WAITS DO. A generate is a
    // compute pass measured in tens of seconds by jobs.js's own note, so the
    // commit's threshold would fire in the middle of every ordinary one.
    expect(LONG_WAIT_MS[GENERATING]).toBeGreaterThan(LONG_WAIT_MS[COMMITTING])

    // THE THREE NUMBERS, PINNED. They are judgements about measured waits --
    // commits at eight to ten seconds and one at thirty-five, generates at
    // thirty to sixty -- so they are written down where a change to one has to
    // be argued for rather than noticed later on a slow afternoon.
    expect(PHRASE_INTERVAL_MS).toBe(2000)
    expect(LONG_WAIT_MS[COMMITTING]).toBe(25000)
    expect(LONG_WAIT_MS[GENERATING]).toBe(75000)
  })
})

/* ===========================================================================
   7. THE GENERATE GETS THE SAME TREATMENT, AND ITS OWN COPY
   ===========================================================================
   A generate is the longer of the two waits -- thirty to sixty seconds over
   the elevation grid, and jobs.js backs its poll off to five-second intervals
   on the strength of it -- with exactly as little to report: `pollJob` answers
   running, done or failed and carries no progress in any of them.

   THE HOOK RATHER THAN THE SHELL, for this one. Driving a real job to a
   running state is landform.test.jsx's and roads.test.jsx's work and is
   thoroughly done there; what is unproven here is that the same wait treatment
   arrives for `generating` and brings the generate's own words rather than the
   commit's.
   =========================================================================== */

function renderHook(chromeState) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let value = null

  function Probe({ state }) {
    value = useWaitingLine(state)
    return null
  }

  return {
    async render(state = chromeState) {
      await React.act(async () => root.render(<Probe state={state} />))
      return value
    },
    async tick(ms) {
      await React.act(async () => {
        vi.advanceTimersByTime(ms)
      })
      return value
    },
    get value() {
      return value
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

describe('7. generating waits the same way, in its own words', () => {
  it('cycles the generate set and holds its own threshold', async () => {
    const hook = renderHook(GENERATING)
    await hook.render()
    expect(hook.value).toBeNull()

    await hook.tick(PHRASE_INTERVAL_MS)
    expect(hook.value.kind).toBe(PHRASE)
    expect(hook.value.text).toBe(WAIT_PHRASES[GENERATING][0])
    expect(WAIT_PHRASES[COMMITTING]).not.toContain(hook.value.text)

    await hook.tick(PHRASE_INTERVAL_MS)
    expect(hook.value.text).toBe(WAIT_PHRASES[GENERATING][1])

    // THE COMMIT'S THRESHOLD PASSES AND NOTHING HAPPENS, which is the point of
    // the two numbers: an ordinary generate is longer than a slow commit.
    await hook.tick(LONG_WAIT_MS[COMMITTING])
    expect(hook.value.kind).toBe(PHRASE)

    await hook.tick(LONG_WAIT_MS[GENERATING])
    expect(hook.value.kind).toBe(LONG)
    expect(hook.value.text).toBe(LONG_WAIT_LINE[GENERATING])

    await hook.unmount()
  })

  it('cycles the generate set in the shipped shell, with a submit held open', async () => {
    const release = installHeldGenerate()
    const ui = await renderShell()

    // A SESSION FIRST, because a generate needs one -- the boundary's own
    // commit, through the same door test 1 presses.
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))
    await React.act(async () => {
      ui.find(`commit-${BOUNDARY_STEP_ID}`).click()
      await Promise.resolve()
    })
    await React.act(async () => {})
    expect(ui.state.sessionId).toBe('sess-1')

    // THE GENERATE, ISSUED AND NOT AWAITED: the state under test exists only
    // while the submit is out.
    await React.act(async () => {
      // NOT THROUGH THE HARNESS'S `run`, which wraps its own act(): the point
      // is to leave the request in flight, and a nested act is a warning
      // rather than a wait.
      ui.actions.generate('landform', {})
      await Promise.resolve()
    })
    expect(ui.find('step-landform').dataset.stepState).toBe(GENERATING)

    // THE GRACE HOLDS HERE TOO, and then the GENERATE's own phrases -- not the
    // commit's, which is the half of this that a shared set would fail.
    expect(ui.waiting()).toBeNull()
    await ui.tick(PHRASE_INTERVAL_MS)
    expect(ui.waiting()).toBe(PHRASE)
    const shown = ui.text('waiting-phrase-landform')
    expect(WAIT_PHRASES[GENERATING]).toContain(shown)
    expect(WAIT_PHRASES[COMMITTING]).not.toContain(shown)

    // AND THE COMMIT'S THRESHOLD DOES NOT FIRE ON A GENERATE, because an
    // ordinary generate outlasts it.
    await ui.tick(LONG_WAIT_MS[COMMITTING])
    expect(ui.waiting()).toBe(PHRASE)

    release()
    await ui.unmount()
  })

  it('gives a state that is not a wait no line at all, however long it lasts', async () => {
    const hook = renderHook('reviewing')
    await hook.render()
    await hook.tick(LONG_WAIT_MS[GENERATING] * 2)
    expect(hook.value).toBeNull()
    await hook.unmount()
  })
})
