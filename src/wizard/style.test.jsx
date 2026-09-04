/**
 * style.test.jsx
 *
 * THE VISUAL SYSTEM, ASSERTED RATHER THAN REVIEWED.
 *
 * The shell was written against the token names and then read as generic
 * anyway, for two reasons neither of which a person reviewing the stylesheet
 * would have flagged: the one accent was absent from the chrome entirely (the
 * forward move was an --ink fill, which is every UI kit's default), and the
 * display face had nowhere to land (the panel column carried Bitter on its
 * <h3> titles, and the shell renders no heading element at all, so deleting
 * that markup took the titling voice with it).
 *
 * Both are the kind of thing that comes back. So they are tests.
 *
 * WHY THIS RUNS IN jsdom AND WHAT THAT COSTS. jsdom applies no stylesheet, so
 * these cannot read a computed font-family off a rendered node. What they read
 * instead is the STYLESHEET -- parsed, resolved through :root, and matched
 * against the class names the components actually emit. That catches every
 * failure mode this branch has actually had (a rule naming a class nothing
 * renders, a face never referenced, a literal below :root, two oxide buttons in
 * one state) and does not catch cascade order. The browser check that does
 * catch cascade is a manual one, and its output is in the branch report.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import {
  BOUNDARY_STEP,
  BOUNDARY_STEP_ID,
  COMMIT_BUTTON,
  GENERATE_BUTTON,
  LANDFORM_STEP,
  ROADS_STEP,
  STEP_DEFINITIONS,
  registryProposalFeatures,
} from './stepDefinitions'
import {
  COMMITTING,
  EDITING,
  GENERATING,
  IDLE,
  LOADING,
  MACHINE_STATES,
  REVIEWING,
  STEP_COMMITTED,
} from './useStepMachine'
import { resetStepCatalog } from './stepCatalog.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..')

const FOUNDATION = readFileSync(path.join(SRC, 'index.css'), 'utf8')
const COMPONENTS = readFileSync(path.join(SRC, 'App.css'), 'utf8')

/** A stylesheet with its comments removed -- prose may name what it replaced. */
const decl = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The declaration block of the first rule whose selector matches `selector`
 * exactly, comments stripped.
 */
function ruleFor(css, selector) {
  const source = decl(css)
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  return match ? match[2] : null
}

/** Every property/value pair a rule sets. */
function propsOf(block) {
  const out = {}
  for (const line of (block ?? '').split(';')) {
    const [prop, ...rest] = line.split(':')
    if (rest.length) out[prop.trim()] = rest.join(':').trim()
  }
  return out
}

/* ===========================================================================
   Harness -- enough of a render to read what class names actually appear
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const RING = [
  [40.7, -74.01],
  [40.7, -74.0],
  [40.71, -74.0],
]

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

const PAYLOAD = {
  eligible_union: null,
  exclusion_layers: [
    { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
  ],
  suggested_zones: {
    type: 'FeatureCollection',
    features: ['zone-1', 'zone-2'].map((id) => ({
      type: 'Feature',
      id,
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-74.01, 40.7], [-74.0, 40.7], [-74.0, 40.71], [-74.01, 40.7]]],
      },
    })),
  },
  zones: [
    { id: 0, feature_id: 'zone-1', rank: 1, area_acres: 2.5, score: 81, slope_min_pct: 2, slope_max_pct: 8, aspect_available: false, dominant_aspect: null },
    { id: 1, feature_id: 'zone-2', rank: 2, area_acres: 1.2, score: 64, slope_min_pct: 3, slope_max_pct: 11, aspect_available: false, dominant_aspect: null },
  ],
  scales: {
    bands: { poor: [0, 40], fair: [40, 60], good: [60, 80], excellent: [80, 100] },
    band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
  },
  summary: { total_acres: 100, eligible_acres: 50 },
}

function installFetch(routes) {
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const method = init.method ?? 'GET'
    const url = new URL(rawUrl)
    const route = routes.find((r) => r.method === method && r.pattern.test(url.pathname))
    if (!route) throw new Error(`no route for ${method} ${url.pathname}`)
    return { ok: true, status: route.status ?? 200, json: async () => route.body }
  })
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
    get cursor() {
      return cursor
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    /** Every class name present anywhere in the rendered document. */
    classes() {
      const seen = new Set()
      for (const el of container.querySelectorAll('*')) {
        for (const name of el.classList) seen.add(name)
      }
      return seen
    },
    /** The banner's buttons as [key, tone] pairs. */
    tones(stepId) {
      const actions = container.querySelector(`[data-testid="actions-${stepId}"]`)
      return [...(actions?.querySelectorAll('button') ?? [])].map((b) => [
        b.dataset.testid.replace(`-${stepId}`, ''),
        b.dataset.tone,
      ])
    },
    async run(fn) {
      await React.act(async () => fn(session.actions, cursor))
    },
    async click(id) {
      const el = container.querySelector(`[data-testid="${id}"]`)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  // The catalogued step order is cached for the life of the module (one
  // fetch per page); a test's answer must not leak into the next one's.
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => vi.restoreAllMocks())

/* ===========================================================================
   1. THE THREE FACES
   =========================================================================== */

describe('1. the three faces', () => {
  it('declares all three, self-hosted, and gives each a token', () => {
    for (const family of ['Bitter', 'Source Serif 4', 'IBM Plex Mono']) {
      expect(FOUNDATION).toMatch(new RegExp(`font-family: '${family}'`))
    }
    // Self-hosted: no request leaves the app for a face. Comments stripped --
    // the foundation says out loud that it makes no such request, and a file
    // that records the fact must not fail for recording it.
    expect(decl(FOUNDATION)).not.toContain('fonts.googleapis.com')
    expect(decl(FOUNDATION)).not.toContain('fonts.gstatic.com')
    expect(decl(FOUNDATION)).toContain("url('./fonts/")

    const root = propsOf(ruleFor(FOUNDATION, ':root'))
    expect(root['--font-display']).toContain('Bitter')
    expect(root['--font-prose']).toContain('Source Serif 4')
    expect(root['--font-data']).toContain('IBM Plex Mono')
  })

  it('applies each face to its declared role, and never a literal family', () => {
    // A component naming a family directly is a face outside the system --
    // the token is the only way a role is expressed.
    for (const [, value] of Object.entries(propsOf(decl(COMPONENTS)))) {
      expect(value).not.toMatch(/Bitter|Source Serif|IBM Plex/)
    }
    for (const family of ['Bitter', 'Source Serif', 'IBM Plex']) {
      expect(decl(COMPONENTS)).not.toContain(family)
    }

    const face = (selector) => propsOf(ruleFor(COMPONENTS, selector))['font-family']

    // DISPLAY: titling, and it lives in the RAIL. The panel column set its
    // step titles as <h3>, which the reset draws in Bitter; the shell renders
    // no heading element and should not grow one just to give that rule
    // something to bite on. The rail is where titling belongs instead --
    // the one piece of chrome that persists across every state and every step
    // and whose job is naming where you are. The instruction bar was the other
    // candidate and is the wrong one: its sentence changes with the machine
    // state, so a title set there would rewrite itself while you work.
    expect(face('.chrome-rail__name')).toBe('var(--font-display)')
    expect(face('.chrome-bar__direction')).toBe('var(--font-prose)')
    expect(propsOf(ruleFor(FOUNDATION, 'h1,\nh2,\nh3,\nh4,\nh5,\nh6'))['font-family']).toBe(
      'var(--font-display)'
    )

    // AND IT IS A VOICE, NOT A FONT SWAP. Bitter applied uniformly at 12px
    // down a column of small labels is a font change; the CURRENT step set at
    // titling size with the rest as a contents list beside it is the printed
    // form this interface is modelled on. The size step is the assertion.
    const railName = propsOf(ruleFor(COMPONENTS, '.chrome-rail__name'))
    const railCursor = propsOf(
      ruleFor(COMPONENTS, '.chrome-rail__step--cursor .chrome-rail__name')
    )
    expect(railName['font-weight']).toBe('600')
    expect(railName['font-size']).toBe('var(--text-xs)')
    expect(railCursor['font-size']).toBe('var(--text-base)')
    expect(railCursor.color).toBe('var(--ink)')

    // The shell still renders no heading, which is the point: a heading is a
    // claim about document structure, and six <h3>s inside a <nav> would say
    // six sections start there.
    for (const file of ['WizardShell.jsx', path.join('shell', 'StepRail.jsx')]) {
      expect(readFileSync(path.join(HERE, file), 'utf8')).not.toMatch(/<h[1-6][\s>]/)
    }

    // PROSE: the instruction, the notices, the buttons -- everything written
    // rather than measured.
    for (const selector of [
      '.chrome-bar__direction',
      '.chrome-bar__notice',
      '.chrome-banner__button',
      '.chrome-banner__confirm',
      '.chrome-banner__confirm-cost',
      '.chrome-banner__reset-list',
      '.chrome-detail__caution-label',
      // A band name or an aspect is pipeline-derived but is not a
      // MEASUREMENT: no decimal to hold still, nothing to line up with. Prose.
      '.chrome-detail__value',
    ]) {
      expect(face(selector)).toBe('var(--font-prose)')
    }

    // The detail panel's title is the SECOND place the display face lands, and
    // the one place a heading is honest: it names a section with content under
    // it, where the rail names places to go.
    expect(face('.chrome-detail__name')).toBe('var(--font-display)')

    // THE THIRD IS THE CONFIRMATION'S QUESTION. "Reopen landform?" NAMES a
    // thing and asks about it; the sentence under it describes what happens.
    // The dialogue had neither face -- it inherited one sans stack for the
    // whole card -- which is the same defect the shell shipped with and the
    // reason this list is a list rather than a pair.
    expect(face('.chrome-banner__confirm-question')).toBe('var(--font-display)')

    // DATA: every measured value, and the eyebrow labels.
    for (const selector of [
      '.chrome-tab',
      '.chrome-tab__name',
      '.chrome-rail__index',
      '.chrome-rail__status',
      '.chrome-detail__label',
      '.measure',
    ]) {
      expect(face(selector)).toBe('var(--font-data)')
    }
  })
})

/* ===========================================================================
   2. EVERY MEASURED NUMBER IS MONO, WITH TABULAR FIGURES
   =========================================================================== */

describe('2. measured values', () => {
  it('sets the data face AND tabular-nums explicitly on the tab strip', () => {
    // EXPLICITLY, not assumed. IBM Plex Mono is monospaced, but its OpenType
    // default for figures is not guaranteed to be the tabular set, and
    // proportional figures inside a monospaced face is a real combination.
    const tab = propsOf(ruleFor(COMPONENTS, '.chrome-tab'))
    expect(tab['font-family']).toBe('var(--font-data)')
    expect(tab['font-variant-numeric']).toBe('tabular-nums')

    // And restated on the value column itself, which is the one that has to
    // hold a decimal point still down a row of tabs.
    const value = propsOf(ruleFor(COMPONENTS, '.chrome-tab__value'))
    expect(value['font-variant-numeric']).toBe('tabular-nums')
    expect(value['text-align']).toBe('right')

    // The floor that keeps the decimal from sliding as the number changes. It
    // moved onto the tab's BODY when the tab grew a checkbox and an × -- the tab
    // is the row holding those; the body is the figures.
    const body = propsOf(ruleFor(COMPONENTS, '.chrome-tab__body'))
    expect(body['grid-template-columns']).toBe('minmax(6ch, max-content) auto')
    expect(body['font-variant-numeric']).toBe('tabular-nums')

    // The same grid in the detail panel, so a figure there lines up with the
    // same figure in the tab that opened it.
    for (const selector of ['.chrome-detail__fields', '.chrome-detail__cautions']) {
      expect(propsOf(ruleFor(COMPONENTS, selector))['grid-template-columns']).toBe(
        'minmax(6ch, max-content) auto'
      )
    }

    // Anything else carrying a figure carries the same pair.
    for (const selector of ['.measure', '.chrome-rail__index']) {
      expect(propsOf(ruleFor(COMPONENTS, selector))['font-variant-numeric']).toBe('tabular-nums')
    }
  })

  it('sets a measured figure mid-sentence in the data face, not as prose', async () => {
    // THE ADVISORY IS THE FIRST CONSUMER OF `.measure` IN THE NEW SHELL, and
    // it is the reason the utility had to come back at all. It used to read
    // "Selecting this much leaves little room", because a `% of parcel` column
    // sat an inch above it in the totals block. The block went with the panel
    // column; the sentence now carries the figure, and the figure is set like
    // every other measured value rather than dissolving into the prose.
    const payload = structuredClone(PAYLOAD)
    payload.summary.total_acres = 4 // 3.7 selected acres over 4 -> past the 80%
    installFetch([
      { method: 'POST', pattern: /^\/api\/sessions$/, status: 201, body: serverDocument() },
      { method: 'GET', pattern: /\/steps\/landform\/layers$/, body: payload },
    ])
    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    const advisory = ui.find('notice-ceiling-landform')
    expect(advisory).not.toBeNull()
    expect(advisory.textContent).toContain('% of the parcel leaves little room')

    // The number is inside .measure; the words around it are not.
    const figure = advisory.querySelector('.measure')
    expect(figure).not.toBeNull()
    expect(figure.textContent).toMatch(/^\d+\.\d$/)
    expect(advisory.textContent).toContain(figure.textContent)

    await ui.unmount()
  })

  it('puts every figure the strip prints inside the value column', async () => {
    installFetch([
      { method: 'POST', pattern: /^\/api\/sessions$/, status: 201, body: serverDocument() },
      { method: 'GET', pattern: /\/steps\/landform\/layers$/, body: PAYLOAD },
    ])
    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    // NO BARE DIGIT ANYWHERE IN A TAB. Every numeral the strip renders is
    // either in a .chrome-tab__value (a measurement) or in the .chrome-tab__name
    // (the rank), and both are the data face. A figure that escaped into a
    // prose span is what this catches.
    for (const tab of ui.container.querySelectorAll('.chrome-tab__body')) {
      for (const child of tab.children) {
        if (!/\d/.test(child.textContent)) continue
        expect(
          child.classList.contains('chrome-tab__value') ||
            child.classList.contains('chrome-tab__name')
        ).toBe(true)
      }
    }

    // ...and the figures are the payload's, at the pipeline's own one decimal.
    const values = [...ui.find('tab-zone-1').querySelectorAll('.chrome-tab__value')]
    expect(values.map((v) => v.textContent)).toEqual(['2.5', '81.0'])

    await ui.unmount()
  })
})

/* ===========================================================================
   3. NO COLOUR LITERAL BELOW :root
   =========================================================================== */

describe('3. tokens only', () => {
  it('has no colour literal in the component stylesheet', () => {
    // THE RULE IS ABOUT COLOUR. `#` also opens an id selector and an SVG
    // fragment reference, so the match is a hash followed by hex digits --
    // which is what a literal is and what neither of the others can be.
    const literals = COMPONENTS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(literals).toEqual([])

    // Nor rgb()/hsl(), which is the same rule written the long way round.
    expect(decl(COMPONENTS)).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)

    // Every colour the components set is a token reference.
    for (const [prop, value] of Object.entries(propsOf(decl(COMPONENTS)))) {
      if (!/^(color|background|background-color|border-color|outline-color|fill|stroke)$/.test(prop)) continue
      if (/^(none|transparent|inherit|currentColor|0)$/.test(value)) continue
      expect(value).toMatch(/var\(--/)
    }
  })

  it('reads its Leaflet tokens rather than defining new ones', () => {
    // Leaflet cannot resolve var() in the options it takes, so map components
    // read the same tokens off the document. That pattern stays; what it must
    // not become is a second palette.
    const readers = ['map/layers.jsx', 'DrawTool.jsx', 'ZoneDrawTool.jsx', 'ProductionHatchPattern.jsx']
    for (const file of readers) {
      const source = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    }
  })
})

/* ===========================================================================
   4. ONE OXIDE PER STATE
   =========================================================================== */

describe('4. one accent per state', () => {
  it('gives the forward move oxide, and nothing else in the chrome any', () => {
    const primary = propsOf(ruleFor(COMPONENTS, '.chrome-banner__button--primary'))
    expect(primary.background).toBe('var(--oxide)')
    expect(primary.color).toBe('var(--on-oxide)')

    // The secondary is a surface, not a second accent.
    const secondary = propsOf(ruleFor(COMPONENTS, '.chrome-banner__button'))
    expect(secondary.background).toBe('var(--paper)')
    expect(secondary.color).toBe('var(--ink)')

    // GREEN IS NEVER A CONTROL. Chrome floats on aerial photography of
    // farmland, which is green across the whole frame; --field is map geometry
    // and the legend, and a control drawn in it half-disappears against canopy.
    const chrome = decl(COMPONENTS).slice(decl(COMPONENTS).indexOf('.chrome {'))
    const chromeBlock = chrome.slice(0, chrome.indexOf('.map-tools'))
    expect(chromeBlock).not.toContain('--field')
    expect(chromeBlock).not.toContain('--eligible')
  })

  /**
   * THE DIALOGUE'S CONTROLS ARE THE BANNER'S CONTROLS, AND THAT IS THE FIX.
   *
   * WHAT SHIPPED. `.chrome-banner__confirm button` -- an ELEMENT selector
   * inside the dialogue -- restated the outlined treatment for both answers.
   * Two identically weighted buttons is a confirmation that will not say which
   * answer is which, and it is worse here than anywhere else in this shell:
   * one of these two discards work and the other keeps it. It also passed
   * every check in this file, because every check in this file reads a rule
   * that exists rather than the rule that WINS.
   *
   * So the rule is gone, the dialogue's buttons carry .chrome-banner__button
   * like every other control in this card, and the tone modifier decides the
   * weighting once for both rows. The computed fills are asserted in
   * layout.test.jsx, in an engine that resolves a cascade.
   */
  it('leaves the confirmation no button rule of its own', () => {
    const source = decl(COMPONENTS)
    expect(source).not.toMatch(/\.chrome-banner__confirm\s+button\s*\{/)

    // The dialogue's row is a row, and the buttons in it are the banner's.
    const actions = propsOf(ruleFor(COMPONENTS, '.chrome-banner__confirm-actions'))
    expect(actions.display).toBe('flex')
    expect(actions['justify-content']).toBe('flex-end')

    // AND THE MARKUP EMITS THE PAIR. One tone each, and they are not the same
    // tone -- the source is read for the class strings rather than the render,
    // because the state that shows this card is a committed step with a
    // downstream one holding work, which is wizard.test.jsx's fixture and not
    // this file's.
    const banner = readFileSync(path.join(HERE, 'shell', 'ActionBanner.jsx'), 'utf8')
    const tones = banner.match(/chrome-banner__button--(primary|secondary)/g) ?? []
    expect(tones).toContain('chrome-banner__button--primary')
    expect(tones).toContain('chrome-banner__button--secondary')
  })

  it('gives every state that offers a forward move EXACTLY one, and no state two', () => {
    // THE UPPER BOUND ALONE DOES NOT BITE. "At most one oxide" is what the
    // shipped regression already satisfied: the forward move was an --ink fill,
    // so every state had ZERO and the test passed. The bound that catches it is
    // the lower one, and it needs a non-circular answer to "does this state
    // offer a forward move" -- which cannot be `is a button primary`.
    //
    // IT IS ANSWERED BY IDENTITY. COMMIT_BUTTON and GENERATE_BUTTON are the two
    // shared forward moves every step reuses, frozen and comparable by
    // reference. A state whose list contains either MUST render exactly one
    // oxide, and it must be that button -- so a step that demoted its own
    // commit fails here naming the state.
    // ROADS IS IN THE LOOP NOW, and its absence is how the rule drifted: its
    // `reviewing` offered "Add access point" in the accent BESIDE the commit,
    // which is two forward moves in one state and exactly what the upper
    // bound below refuses. Nothing caught it, because this loop named two
    // steps and a third had been written since.
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP, ROADS_STEP]) {
      for (const state of MACHINE_STATES) {
        const buttons = definition.buttons[state] ?? []
        const primary = buttons.filter((b) => b.tone === 'primary')
        expect(primary.length).toBeLessThanOrEqual(1)

        const shared = buttons.find((b) => b === COMMIT_BUTTON || b === GENERATE_BUTTON)
        if (shared) {
          expect(primary).toEqual([shared])
        }
      }
    }
  })

  it('accounts for every state, so a lost oxide cannot hide in an unlisted one', () => {
    // THE TABLE IS THE SPEC. Identity covers the two shared buttons; a step's
    // OWN forward move -- boundary has two, because a boundary is drawn rather
    // than proposed -- is only knowable from the step. So every (step, state)
    // pair is listed with the count it must render, and each zero says why it
    // is a zero. An unlisted pair fails: adding a state without deciding what
    // it offers is exactly how the accent goes missing again.
    const EXPECTED = {
      [BOUNDARY_STEP_ID]: {
        // The tool IS the forward move: a boundary is drawn, not proposed, so
        // there is nothing else to move toward from an empty step.
        [IDLE]: 1,
        // Finish moves you to reviewing; undo is the escape beside it.
        [EDITING]: 1,
        // Commit. The pair the design guide names as the case to check.
        [REVIEWING]: 1,
        // A request in flight offers nothing to press.
        [COMMITTING]: 0,
        // No forward move exists: the boundary cannot be reopened, and the way
        // on from a committed step is the next step, which the rail carries.
        // The one button here ends the session and is an escape.
        [STEP_COMMITTED]: 0,
        // Unreachable -- boundary declares no generate.
        [GENERATING]: 0,
        // Unreachable too: `loading` is a `generated` step waiting for its
        // payload, and boundary's status is whether a session exists. It
        // declares nothing for the state and therefore offers nothing.
        [LOADING]: 0,
      },
      landform: {
        [IDLE]: 1,
        // A job is running. Nothing to press, and nothing to urge.
        [GENERATING]: 0,
        // THE PAYLOAD IS NOT HERE, and the zero is the whole reason the state
        // exists. An oxide commit over a step whose proposals are still in
        // flight is a decision the user cannot see being recorded, and the
        // contract's `min_features=0` makes it a legal one. See LOADING.
        [LOADING]: 0,
        [REVIEWING]: 1,
        // ONE BUTTON, AND IT IS AN ESCAPE. A ring going down is closed on the
        // MAP by clicking its first corner; the banner has no forward move to
        // offer and does not invent one.
        [EDITING]: 0,
        [COMMITTING]: 0,
        // Reopen is a move backwards into finished work.
        [STEP_COMMITTED]: 0,
      },
    }

    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      const table = EXPECTED[definition.id]
      expect(Object.keys(table).sort()).toEqual([...MACHINE_STATES].sort())
      for (const state of MACHINE_STATES) {
        const primary = (definition.buttons[state] ?? []).filter((b) => b.tone === 'primary')
        expect({ state, oxide: primary.length }).toEqual({ state, oxide: table[state] })
      }
    }

    // AND THE ACCENT IS ACTUALLY IN USE. A definition whose every state came
    // out zero would satisfy every rule above and be the shipped regression
    // exactly; at least one state per step has to carry it.
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      const states = MACHINE_STATES.filter(
        (state) => (definition.buttons[state] ?? []).some((b) => b.tone === 'primary')
      )
      expect(states.length).toBeGreaterThan(0)
    }
  })

  it('shows at most one, in the states actually rendered', async () => {
    installFetch([
      { method: 'POST', pattern: /^\/api\/sessions$/, status: 201, body: serverDocument() },
      { method: 'GET', pattern: /\/steps\/landform\/layers$/, body: PAYLOAD },
    ])
    const ui = await renderShell()

    /**
     * Count the oxide actually in the document, and hold it to `expected`.
     *
     * ON THE RENDERED BUTTON, not on the declaration -- the declaration is
     * checked above, and what shipped broken was the RULE that draws it. A
     * `tone="primary"` with no oxide rule behind it passes every check that
     * reads the definition and is precisely the regression.
     */
    const oxideCount = (stepId, expected) => {
      const tones = ui.tones(stepId)
      const marked = ui.container.querySelectorAll(
        `[data-testid="actions-${stepId}"] .chrome-banner__button--primary`
      )
      expect({ where: stepId, oxide: marked.length }).toEqual({ where: stepId, oxide: expected })
      expect(tones.filter(([, tone]) => tone === 'primary')).toHaveLength(expected)
      return tones
    }

    // BOUNDARY, IDLE: the tool IS the forward move here.
    expect(oxideCount(BOUNDARY_STEP_ID, 1)).toEqual([['draw', 'primary']])

    // BOUNDARY, EDITING: the undo is the escape, the finish moves you on.
    await ui.click(`draw-${BOUNDARY_STEP_ID}`)
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, 'ring', RING))
    expect(oxideCount(BOUNDARY_STEP_ID, 1)).toEqual([
      ['undo', 'secondary'],
      ['finish', 'primary'],
    ])

    // BOUNDARY, REVIEWING -- the pair named in the design guide as the case
    // to check. Clear and redraw is not a forward move and is not oxide.
    await ui.click(`finish-${BOUNDARY_STEP_ID}`)
    expect(oxideCount(BOUNDARY_STEP_ID, 1)).toEqual([
      ['redraw', 'secondary'],
      ['commit', 'primary'],
    ])

    await ui.click(`commit-${BOUNDARY_STEP_ID}`)

    // LANDFORM, IDLE.
    expect(oxideCount('landform', 1)).toEqual([['generate', 'primary']])

    // LANDFORM, REVIEWING.
    await ui.run((a) => a.loadLayers('landform'))
    expect(oxideCount('landform', 1)).toEqual([
      ['draw', 'secondary'],
      ['commit', 'primary'],
    ])

    // LANDFORM, EDITING: one button, and it is an escape -- so NO oxide at
    // all. "At most one" is the rule; a state with no forward move has none.
    await ui.run((_a, cursor) => cursor.arm('draw'))
    expect(oxideCount('landform', 0)).toEqual([['cancel', 'secondary']])

    await ui.unmount()
  })
})

/* ===========================================================================
   5. FOCUS, AND THE REST OF THE QUALITY FLOOR
   =========================================================================== */

describe('5. the quality floor', () => {
  it('gives every interactive element a visible focus ring', async () => {
    // The ring is declared once, on :focus-visible, in the foundation.
    const ring = propsOf(ruleFor(FOUNDATION, ':focus-visible'))
    expect(ring.outline).toBe('2px solid var(--oxide)')
    expect(ring['outline-offset']).toBe('2px')

    // NOTHING BELOW IT TAKES IT AWAY. A component may restate the ring -- an
    // oxide ring on an oxide fill is invisible, and a clipped container needs
    // it inset -- but `outline: none` anywhere is the floor going.
    expect(decl(COMPONENTS)).not.toMatch(/outline:\s*(none|0)\b/)

    // The two restatements, and both are still rings.
    expect(propsOf(ruleFor(COMPONENTS, '.chrome-banner__button--primary:focus-visible'))[
      'outline-color'
    ]).toBe('var(--ink)')
    expect(
      propsOf(
        ruleFor(COMPONENTS, '.chrome-rail__step:focus-visible,\n.chrome-detail__toggle:focus-visible')
      )['outline-offset']
    ).toBe('-3px')

    // AND EVERY CONTROL THE SHELL RENDERS IS A REAL <button>, which is what
    // makes one declaration enough. A div with an onClick takes no focus and
    // no ring, and would pass a stylesheet check while failing a keyboard.
    installFetch([
      { method: 'POST', pattern: /^\/api\/sessions$/, status: 201, body: serverDocument() },
      { method: 'GET', pattern: /\/steps\/landform\/layers$/, body: PAYLOAD },
    ])
    const ui = await renderShell()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.loadLayers('landform'))

    const interactive = [...ui.container.querySelectorAll('[onclick], button, a, [tabindex]')]
    expect(interactive.length).toBeGreaterThan(0)
    for (const el of interactive) {
      expect(el.tagName).toBe('BUTTON')
      expect(el.disabled || el.tabIndex >= 0).toBe(true)
    }

    await ui.unmount()
  })

  it('sets box-sizing globally and respects prefers-reduced-motion', () => {
    expect(propsOf(ruleFor(FOUNDATION, '*,\n*::before,\n*::after'))['box-sizing']).toBe(
      'border-box'
    )
    expect(decl(FOUNDATION)).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('gives every floating region its own opaque surface', () => {
    // Chrome no longer sits on stock below the map -- it floats on aerial
    // photography, which is an arbitrary frame of green and brown. Nothing is
    // legible against that on its own; this is the same reasoning that puts
    // halo casing under map linework.
    //
    // EVERY CARD, AND A CARD IS WHAT CARRIES CONTENT. The rail, the
    // instruction card, the detail panel and the action card each hold text
    // directly and each carry --paper. .chrome-tabs is NOT in this list any
    // more and its absence is the assertion below: it holds tabs, and a tab
    // carries its own surface, so a surface on the strip was a sheet behind
    // cards.
    for (const selector of ['.chrome-rail', '.chrome-bar', '.chrome-detail', '.chrome-banner']) {
      const surface = propsOf(ruleFor(COMPONENTS, selector))
      expect(surface.background).toBe('var(--paper)')
    }

    // THE STRIP IS A LAYOUT, NOT A SURFACE. It sets no background and no
    // border, and each of the three things it can place -- a tab, an unchecked
    // tab, the "+N more" -- carries --stock and a hairline of its own. The
    // "+N more" is the one that had to change: it was transparent, which
    // worked only while there was a strip behind it to be transparent against.
    const strip = propsOf(ruleFor(COMPONENTS, '.chrome-tabs'))
    expect(strip.background).toBeUndefined()
    expect(strip.border).toBeUndefined()
    expect(strip['border-top']).toBeUndefined()
    for (const selector of ['.chrome-tab', '.chrome-tab--more']) {
      expect(propsOf(ruleFor(COMPONENTS, selector)).background).toBe('var(--stock)')
    }
    expect(propsOf(ruleFor(COMPONENTS, '.chrome-tab')).border).toBe('var(--hairline)')

    // THERE IS NO EXCEPTION ANY MORE, AND THE CREDIT IS THE ONE THAT CHANGED.
    //
    // This assertion used to require the opposite: `background: none` and a
    // glyph-carried halo, on the argument that a credit is a licensing
    // requirement rather than a control and "a panel behind it would give it
    // the standing of the chrome that carries the work." That was an argument
    // about STANDING made while the credit sat alone in the bottom-right
    // corner over the imagery.
    //
    // It is in the top-left card gap now, in a row with the instruction bar
    // and above the rail. A haloed line floating bare between two cards does
    // not read as lower standing there; it reads as the one region that
    // failed to get its background. So it takes the same three the others
    // take, and its lower standing is carried the way this system carries it
    // everywhere else -- by size and by ink.
    //
    // MATCHED TO LEAFLET'S OWN SELECTOR. Its rule is
    // `.leaflet-container .leaflet-control-attribution`, which outranks a bare
    // class -- a rule that used one lost the cascade silently, so the white box
    // on screen was Leaflet's the whole time. The specificity is part of the
    // assertion.
    const credit = propsOf(ruleFor(COMPONENTS, '.leaflet-container .leaflet-control-attribution'))
    expect(credit.background).toBe('var(--paper)')
    expect(credit.border).toBe('var(--hairline)')
    expect(credit['border-radius']).toBe('var(--radius)')
    // STILL NOT A CONTROL: muted ink, the smallest size in the scale, no
    // accent anywhere in it.
    expect(credit.color).toBe('var(--ink-muted)')
    expect(credit['font-size']).toBe('var(--text-xs)')
    expect(ruleFor(COMPONENTS, '.leaflet-container .leaflet-control-attribution')).not.toContain(
      '--oxide'
    )
    // The overlay itself is NOT a surface: it spans the whole map and must let
    // every gesture through.
    expect(propsOf(ruleFor(COMPONENTS, '.chrome'))['pointer-events']).toBe('none')
  })
})

/* ===========================================================================
   6. COPY
   =========================================================================== */

describe('6. copy', () => {
  it('is sentence case, and no control shouts', () => {
    // TITLE CASE WAS THE LEGACY SET'S TELL. App.jsx's deleted boundary
    // controls were "Undo Last Point" / "Finish Boundary"; the design guide
    // is sentence case throughout, so the wizard's are too.
    const labels = []
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      for (const state of MACHINE_STATES) {
        for (const button of definition.buttons[state] ?? []) {
          const label = button.label({
            machine: { commitLabel: 'Commit zones', definition, canCommit: true },
          })
          labels.push(label)
        }
      }
    }
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      // Every word after the first is lower case, unless it is a proper noun
      // -- and none of these are.
      const [, ...rest] = label.split(' ')
      for (const word of rest) expect(word).toBe(word.toLowerCase())
      expect(label).not.toBe(label.toUpperCase())
    }
  })

  it('says what happened and what to do, without raw exception text', () => {
    for (const definition of [BOUNDARY_STEP, LANDFORM_STEP]) {
      for (const line of Object.values(definition.instructions)) {
        expect(line).not.toMatch(/\b(Error|error:|undefined|null|4\d\d|5\d\d)\b/)
        // Not an internal identifier: a layer key or a step id in a sentence
        // is the client leaking its own vocabulary at the user.
        expect(line).not.toMatch(/suggested_zones|eligible_union|exclusion_layers|feature_id/)
      }
    }
  })
})
