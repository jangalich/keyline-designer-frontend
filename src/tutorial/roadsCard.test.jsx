/**
 * roadsCard.test.jsx
 *
 * THE ROADS STEP'S CARD, and what it added to the shared farm.
 *
 *   1. the roads entry registers one card, and the shipped shell opens it on
 *      arrival at roads;
 *   2. the copy is the spec's, verbatim, "along your boundary line" in
 *      weight -- and the cap it states is the step's;
 *   3. the diagram names what the real step names: its banner, button for
 *      button and state for state, and its tabs;
 *   4. the scene's two new layers: access points in two states on the
 *      map's marker tokens, farm tracks on the map's road treatment;
 *   5. THE SELECTION MODEL, read off the timeline: the markers stay while
 *      focus moves, only the focused network's lines are drawn, the tick is
 *      the focus, and a drawn track never unwinds;
 *   6. the boundary, landform and water cards are unchanged on the same
 *      parcel;
 *   7. with no motion, the card is a finished diagram;
 *   8. the treatment: one period, no colour literals, oxide only on the
 *      pulses and the primary button.
 *
 * What only a real engine can answer -- the tokens resolving, the frames as
 * drawn, nothing running under reduced motion, the fit at 380px -- is in
 * roadsCard.browser.test.jsx.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { zoneMark } from '../ProductionHatchPattern.jsx'
import { COMMITTED, NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import {
  MAX_ROAD_NETWORKS,
  ROADS_STEP,
  STEP_DEFINITIONS,
  registryProposalFeatures,
  roadNetworkName,
} from '../wizard/stepDefinitions'
import { EDITING, IDLE, REVIEWING } from '../wizard/useStepMachine'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { BoundaryAnimation } from './boundaryCard.jsx'
import {
  ACCESS_POINTS,
  ACCESS_POINT_STATES,
  PARCEL,
  PARCEL_PATH,
  ROAD_NETWORKS,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SURVEY_AREAS,
  SceneAccessPoints,
  SceneFarmTracks,
} from './farmScene.jsx'
import { LandformReadAnimation, LandformSetAnimation } from './landformCards.jsx'
import { SEEN_KEY, resetTutorialPrefsForTests } from './prefs.js'
import {
  ROADS_BLOCKS,
  ROADS_CARD,
  ROADS_LABELS,
  ROADS_TABS,
  RoadsAnimation,
  TAB_CLICK,
} from './roadsCard.jsx'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor, cardsOf } from './stepCards.js'
import { WaterAnimation } from './waterCard.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')
const FIXTURES = path.join(HERE, '..', 'fixtures')

/** The spec's copy. A rewrite fails here. */
const TITLE = 'Access starts on the boundary'
const EMPHASIS = 'along your boundary line'
const BODY =
  'Add an access point and click along your boundary line to place it, then generate a network from it. ' +
  'You can place up to three and compare them, but only one is committed.'

/** The spec's geometry. */
const POINTS = [
  ['1', 150, 57],
  ['2', 240, 60],
]
const NETWORKS = {
  1: {
    main: 'M 150 57 C 164 74, 186 82, 196 102 C 204 120, 202 138, 196 152',
    branch: 'M 198 130 C 210 140, 218 154, 220 170',
  },
  2: {
    main: 'M 240 60 C 238 88, 232 112, 222 134 C 214 152, 210 166, 208 178',
    branch: 'M 224 128 C 234 138, 240 148, 240 158',
  },
}

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ===========================================================================
   Stylesheet helpers
   =========================================================================== */

const decl = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function slice(from, to) {
  const start = APP_CSS.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const end = to ? APP_CSS.indexOf(to, start) : APP_CSS.length
  expect(end, to).toBeGreaterThan(start)
  return APP_CSS.slice(start, end)
}

/** The roads layers this branch adds to the farm's section. */
const SCENE_CSS = decl(slice("/* --- The farm's roads", '/* --- 6. Landform'))
/** The roads card's own section, to the end. */
const CARD_CSS = decl(slice('/* --- 8. Roads'))
/** Every line this branch adds to App.css. */
const ROADS_CSS = SCENE_CSS + CARD_CSS

function rulesOf(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body.trim()])
}

function propsOf(body) {
  const out = {}
  for (const line of (body ?? '').split(';')) {
    const [prop, ...rest] = line.split(':')
    if (rest.length) out[prop.trim()] = rest.join(':').trim()
  }
  return out
}

const BASE_RULES = rulesOf(decl(APP_CSS).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, ''))

/** Every base declaration for a selector in the whole stylesheet, merged in order, outside @media. */
function baseFor(selector) {
  const out = {}
  for (const [s, body] of BASE_RULES) {
    if (s.split(',').map((x) => x.trim()).includes(selector)) Object.assign(out, propsOf(body))
  }
  return out
}

/**
 * ONE ELEMENT'S TIMELINE, off the stylesheet: its keyframes' stops, each
 * with the properties it sets, in order -- and whether the rule runs them on
 * a hard cut (step-end) or through them (linear).
 */
const TIMELINES = new Map()

function timelineFor(selector) {
  if (!TIMELINES.has(selector)) TIMELINES.set(selector, readTimeline(selector))
  return TIMELINES.get(selector)
}

function readTimeline(selector) {
  const rule = baseFor(selector)
  const name = rule['animation-name']
  expect(name, `${selector} is animated`).toBeTruthy()
  const start = CARD_CSS.indexOf(`@keyframes ${name} `)
  expect(start, `@keyframes ${name}`).toBeGreaterThan(-1)
  const block = CARD_CSS.slice(start).match(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/)[1]
  const stops = []
  for (const [selectors, body] of rulesOf(block)) {
    for (const stop of selectors.split(',')) stops.push({ at: parseFloat(stop), props: propsOf(body) })
  }
  stops.sort((a, b) => a.at - b.at)
  return { name, stops, cut: rule['animation-timing-function'] === 'step-end' }
}

/**
 * A property's value at `t` percent of the loop, as the engine resolves it:
 * on a cut, the last stop at or before `t` that sets it; otherwise
 * interpolated between the stops either side. Unset before the first stop
 * falls back to the resting frame -- the base rule.
 */
function valueAt(selector, prop, t) {
  const { stops, cut } = timelineFor(selector)
  const setting = stops.filter((s) => prop in s.props)
  const before = [...setting].reverse().find((s) => s.at <= t)
  const after = setting.find((s) => s.at > t)
  const num = (s) => parseFloat(s.props[prop])
  if (!before) return parseFloat(baseFor(selector)[prop] ?? '1')
  if (cut || !after) return num(before)
  return num(before) + ((num(after) - num(before)) * (t - before.at)) / (after.at - before.at)
}

const opacityAt = (selector, t) => valueAt(selector, 'opacity', t)
const shown = (selector, t) => opacityAt(selector, t) > 0

/** Every tenth of a percent of the loop: one frame at 16s is about 0.1%. */
const SAMPLES = Array.from({ length: 1000 }, (_, i) => i / 10)

/* ===========================================================================
   Harness
   =========================================================================== */

const mounted = new Set()

async function mount(element) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const handle = {
    container,
    async unmount() {
      mounted.delete(handle)
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.add(handle)
  await React.act(async () => root.render(element))
  return handle
}

const find = (id) => document.querySelector(`[data-testid="${id}"]`)

async function renderCard() {
  const stage = document.createElement('div')
  document.body.appendChild(stage)
  return mount(
    <StepCard container={stage} card={ROADS_CARD} auto onAutoChange={() => {}} onDismiss={() => {}} onClose={() => {}} />
  )
}

function serverDocument(steps) {
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

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  resetTutorialPrefsForTests()
  window.history.replaceState({}, '', '/')
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const handle of [...mounted]) await handle.unmount()
  document.body.innerHTML = ''
})

/* ===========================================================================
   1. Registered, and rendered
   =========================================================================== */

describe('1. the roads entry registers one card', () => {
  it('is the registry entry for roads, one card in the one-card shape', () => {
    const entry = cardFor(STEP_CARDS, 'roads')
    expect(entry).toBe(ROADS_CARD)
    expect(STEP_CARDS.filter((e) => e.stepId === 'roads')).toHaveLength(1)
    expect(entry.cards).toBeUndefined()
    expect(cardsOf(entry)).toEqual([ROADS_CARD])
    expect(entry.Animation).toBe(RoadsAnimation)
  })

  it('opens by itself on "Add access point", not on arrival, through the shipped shell and registry', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary', 'landform', 'water']))
    const doc = serverDocument({ landform: { status: COMMITTED }, water: { status: COMMITTED } })
    globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
      const url = new URL(rawUrl)
      if (url.pathname === '/api/steps') {
        return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
      }
      if (url.pathname.startsWith('/api/sessions/') && (init.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => doc }
      }
      // THE GENERATE: accepted, and its job held running -- the wait the
      // card opens into.
      if (url.pathname.endsWith(`/steps/roads/generate`) && init.method === 'POST') {
        return { ok: true, status: 202, json: async () => ({ job_id: 'job-1', status: 'running' }) }
      }
      if (url.pathname.startsWith('/api/jobs/')) return new Promise(() => {})
      return { ok: false, status: 404, json: async () => ({}) }
    })
    let session = null
    let cursor = null
    function Probe() {
      session = useSession()
      cursor = useWizardCursor()
      return null
    }
    // No StepCardRegistry provider: this is the production registry.
    await mount(
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <Probe />
          <div className="map-stage">
            <WizardShell />
          </div>
        </WizardCursorProvider>
      </SessionProvider>
    )
    await React.act(async () => {
      await session.actions.resume('sess-1')
    })
    expect(cursor.cursorStepId).toBe('roads')
    // Arrived: nothing, until "Add access point" is pressed -- before the
    // point is placed, since the card is about where it goes.
    expect(find('tutorial-step-card')).toBeNull()
    await React.act(async () => find('access-roads').click())
    expect(cursor.armed).toBe('draw')
    const card = find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('roads')
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--roads')).not.toBeNull()
    // One card: no pager dots.
    expect(find('tutorial-step-dots')).toBeNull()
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

describe('2. the copy', () => {
  it('says exactly the spec, "along your boundary line" set in weight', async () => {
    expect(ROADS_CARD.title).toBe(TITLE)
    expect(ROADS_CARD.body).toBe(BODY)
    expect(ROADS_CARD.emphasis).toBe(EMPHASIS)
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    const body = find('tutorial-step-body')
    expect(body.textContent).toBe(BODY)
    const strong = body.querySelectorAll('strong.tutorial__em')
    expect(strong).toHaveLength(1)
    expect(strong[0].textContent).toBe(EMPHASIS)
  })

  it('states the cap the step enforces: "up to three" is MAX_ROAD_NETWORKS', () => {
    expect(MAX_ROAD_NETWORKS).toBe(3)
    expect(ROADS_STEP.accumulate.max).toBe(3)
    expect(BODY).toContain('up to three')
  })
})

/* ===========================================================================
   3. What the real step names
   =========================================================================== */

describe('3. the banner and the tabs are the real step', () => {
  const machine = (inputs = {}) => ({ draft: { inputs }, reachable: true, context: {}, canGenerate: true })
  const labelOf = (button, m = machine()) => (typeof button.label === 'function' ? button.label({ machine: m }) : button.label)

  it('holds each banner in the diagram to the button set the step declares for that state', async () => {
    const handle = await mount(<RoadsAnimation />)
    const banner = (state) => {
      const group = handle.container.querySelector(`[data-banner="${state}"]`)
      return [...group.querySelectorAll('.tutorial-anim__commit-button, .tutorial-anim__draw-button')].map((g) => ({
        label: g.querySelector(':scope > text').textContent,
        tone: g.classList.contains('tutorial-anim__commit-button') ? 'primary' : 'secondary',
      }))
    }
    const declared = (state) =>
      ROADS_STEP.buttons[state].map((b) => ({
        label: b.key === 'commit' ? ROADS_STEP.commit.label({ committableCount: 1 }) : labelOf(b),
        tone: b.tone,
      }))

    // NOTHING GENERATED: one button, and it is the primary.
    expect(banner('idle')).toEqual(declared(IDLE))
    expect(banner('idle')).toEqual([{ label: 'Add access point', tone: 'primary' }])
    // ARMED -- chromeState reads an armed tool as `editing`: Cancel beside Generate.
    expect(banner('armed')).toEqual(declared(EDITING))
    expect(banner('armed')).toEqual([
      { label: 'Cancel', tone: 'secondary' },
      { label: 'Generate network', tone: 'primary' },
    ])
    // A NETWORK TO LOOK AT: "Add access point", now secondary, beside the commit.
    expect(banner('reviewing')).toEqual(declared(REVIEWING))
    expect(banner('reviewing')).toEqual([
      { label: 'Add access point', tone: 'secondary' },
      { label: 'Commit this network', tone: 'primary' },
    ])
    // Generating: no buttons, the working line.
    expect(banner('generating')).toEqual([])
    expect(handle.container.querySelector('[data-banner="generating"] text').textContent).toBe(ROADS_LABELS.working)
    const banners = readFileSync(path.join(HERE, '..', 'wizard', 'shell', 'ActionBanner.jsx'), 'utf8')
    expect(banners).toContain(`'${ROADS_LABELS.working}'`)
  })

  it('never shows two primaries at once, and never more than two buttons', async () => {
    const handle = await mount(<RoadsAnimation />)
    for (const group of handle.container.querySelectorAll('[data-banner]')) {
      expect(group.querySelectorAll('.tutorial-anim__commit-button').length).toBeLessThanOrEqual(1)
      expect(group.querySelectorAll('.tutorial-anim__commit-button, .tutorial-anim__draw-button').length).toBeLessThanOrEqual(2)
    }
  })

  it('names the tabs as roadNetworkName() does', async () => {
    const payload = { networks: ROAD_NETWORKS.map((n) => ({ network_id: n.id })) }
    expect(ROADS_TABS.map((t) => t.name)).toEqual(ROAD_NETWORKS.map((n) => roadNetworkName(payload, n.id)))
    const handle = await mount(<RoadsAnimation />)
    const names = [...handle.container.querySelectorAll('.tutorial-anim__tab .tutorial-anim__name')].map((t) => t.textContent)
    expect(names).toEqual(['Road Network 1', 'Road Network 2'])
  })

  it('clicks Network 1 on its body, clear of its checkbox: the tab body is a focus on this step', () => {
    const [first] = ROADS_TABS
    expect(TAB_CLICK.x).toBeGreaterThan(first.x + 7 + 11)
    expect(TAB_CLICK.x).toBeLessThan(first.x + first.width)
    expect(ROADS_STEP.selection).toEqual({ mode: 'radio', follows: 'focus' })
  })
})

/* ===========================================================================
   4. The scene's new layers
   =========================================================================== */

describe('4. access points and farm tracks, as the map draws them', () => {
  it('holds both access points and both networks to the spec', () => {
    expect(ACCESS_POINTS.map(({ id, x, y }) => [id, x, y])).toEqual(POINTS)
    for (const network of ROAD_NETWORKS) {
      expect(Object.fromEntries(network.branches.map((b) => [b.id, b.d]))).toEqual(NETWORKS[network.id])
      expect(network.accessPoint).toBe(network.id)
      // Each network starts at its own access point.
      const point = ACCESS_POINTS.find((p) => p.id === network.accessPoint)
      expect(network.branches[0].d.startsWith(`M ${point.x} ${point.y} `)).toBe(true)
    }
  })

  it('puts each access point on the boundary line: the first on A to B, the second on B to C', () => {
    const [a, b, c] = PARCEL
    const off = ({ x, y }, p, q) => {
      const t = ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2)
      const px = p.x + t * (q.x - p.x)
      const py = p.y + t * (q.y - p.y)
      return { t, distance: Math.hypot(x - px, y - py) }
    }
    const first = off(ACCESS_POINTS[0], a, b)
    const second = off(ACCESS_POINTS[1], b, c)
    for (const { t, distance } of [first, second]) {
      expect(t).toBeGreaterThan(0)
      expect(t).toBeLessThan(1)
      // Within a stroke's width of the ring: on the line, as the tool snaps it.
      expect(distance).toBeLessThan(2)
    }
  })

  it('draws a marker in each of the map two states, on two layers, as the map has them', async () => {
    expect(ACCESS_POINT_STATES).toEqual(['pending', 'generated'])
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <SceneAccessPoints state="pending" />
        <SceneAccessPoints state="generated" />
      </svg>
    )
    const pending = handle.container.querySelector('[data-layer="access-points-pending"]')
    const generated = handle.container.querySelector('[data-layer="access-points"]')
    expect([...pending.querySelectorAll('circle')].map((c) => c.dataset.state)).toEqual(['pending', 'pending'])
    expect([...generated.querySelectorAll('circle')].map((c) => c.dataset.point)).toEqual(['1', '2'])
    for (const circle of handle.container.querySelectorAll('circle')) {
      for (const attr of ['fill', 'stroke', 'style']) expect(circle.hasAttribute(attr), attr).toBe(false)
    }
    // THE MAP'S MARKER, TOKEN FOR TOKEN: solid ochre in a halo ring; pending
    // is paper inside a dashed ochre ring.
    const map = baseFor('.access-point-marker')
    const mapPending = baseFor('.access-point-marker--pending')
    expect(map.background).toBe('var(--ochre)')
    expect(map.border).toBe('2px solid var(--halo)')
    expect(baseFor('.farm-scene__access-point--generated')).toMatchObject({ fill: map.background, stroke: 'var(--halo)' })
    expect(mapPending).toMatchObject({ background: 'var(--paper)', 'border-color': 'var(--ochre)', 'border-style': 'dashed' })
    const scenePending = baseFor('.farm-scene__access-point--pending')
    expect(scenePending).toMatchObject({ fill: mapPending.background, stroke: mapPending['border-color'] })
    expect(scenePending['stroke-dasharray']).toBeTruthy()
    // Ochre is the marker's own token and not the accent.
    expect(ROADS_CSS).not.toMatch(/--oxide/)
    expect(() => SceneAccessPoints({ state: 'focused' })).toThrow(/pending or generated/)
  })

  it("draws a track as the map's `road` treatment does: one stroke in --road per branch, no casing", async () => {
    expect(ROAD_NETWORKS.every((n) => n.treatment === 'road')).toBe(true)
    // The map's row for the treatment is a line on --road...
    expect(zoneMark('road')).not.toBeNull()
    expect(zoneMark('road').kind).toBe('line')
    const table = readFileSync(path.join(HERE, '..', 'ProductionHatchPattern.jsx'), 'utf8')
    expect(table).toMatch(/\{ treatment: 'road', kind: 'line', token: '--road' \}/)
    // ...and the scene's track is what that token is declared to be, a plain
    // stroke. (App.css may not name --road itself: roads.test section 15.)
    const tokens = readFileSync(path.join(HERE, '..', 'index.css'), 'utf8')
    const road = tokens.match(/--road:\s*([^;]+);/)[1].trim()
    const track = baseFor('.farm-scene__track')
    expect(track.stroke).toBe(road)
    expect(track.fill).toBe('none')
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <SceneFarmTracks />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="tracks"]')
    const groups = [...layer.querySelectorAll('[data-network]')]
    expect(groups.map((g) => g.dataset.network)).toEqual(['1', '2'])
    for (const group of groups) {
      expect(group.dataset.treatment).toBe('road')
      // Two paths, one per branch: no casing pass under either.
      const paths = [...group.querySelectorAll('path')]
      expect(paths.map((p) => p.dataset.branch)).toEqual(['main', 'branch'])
      for (const p of paths) {
        expect(p.getAttribute('class')).toBe(`farm-scene__track farm-scene__track--${p.dataset.branch}`)
        expect(p.getAttribute('pathLength')).toBe('1')
      }
    }
    expect(SCENE_CSS).not.toMatch(/casing|--halo[^;]*;[^}]*track/)
  })

  it('keeps the scene free of timeline: no keyframes, no animation, no card classes', () => {
    const scene = readFileSync(path.join(HERE, 'farmScene.jsx'), 'utf8')
    expect(scene).not.toMatch(/animation|keyframes|tutorial-anim__/)
    expect(SCENE_CSS).not.toMatch(/animation|@keyframes/)
  })

  it('stacks the settled context in the order it was decided: Block 1, then the water area, both settled', async () => {
    const handle = await mount(<RoadsAnimation />)
    const layers = [...handle.container.querySelectorAll('[data-layer]')].map((l) => l.dataset.layer)
    expect(layers.indexOf('blocks')).toBeLessThan(layers.indexOf('survey-embankment'))
    expect(layers.indexOf('survey-embankment')).toBeLessThan(layers.indexOf('tracks'))
    expect(layers.indexOf('tracks')).toBeLessThan(layers.indexOf('access-points'))
    expect(layers).not.toContain('survey-excavated')
    for (const id of ['blocks', 'survey-embankment']) {
      const layer = handle.container.querySelector(`[data-layer="${id}"]`)
      expect(layer.classList.contains('farm-scene__layer--settled'), id).toBe(true)
    }
    expect(ROADS_BLOCKS.map((b) => b.id)).toEqual(['1'])
    expect(handle.container.querySelector('.farm-scene__block-hatch').getAttribute('d')).toBe(SUGGESTED_BLOCKS[0].d)
    expect(handle.container.querySelector('.farm-scene__survey--embankment').getAttribute('d')).toBe(SURVEY_AREAS.embankment.d)
  })
})

/* ===========================================================================
   5. The selection model, on the timeline
   =========================================================================== */

describe('5. the selection model', () => {
  const NETWORK = (id) => `.tutorial-anim__network--roads-${id}`
  const MARKER = (id) => `.tutorial-anim__access--generated-${id}`
  const TICK = (id) => `.tutorial-anim__tick--roads-${id}`
  const RING = (id) => `.tutorial-anim__mark--roads-${id}`
  const TAB_MARK = (id) => `.tutorial-anim__tab-mark--roads-${id}`
  const TAB = (id) => `.tutorial-anim__tab--roads-${id}`
  const ids = ['1', '2']
  const focusedAt = (t) => ids.filter((id) => shown(RING(id), t))
  const drawingAt = (t) =>
    ids.some((id) =>
      ['main', 'branch'].some((b) => {
        const offset = valueAt(`.tutorial-anim__track--roads-${id}-${b}`, 'stroke-dashoffset', t)
        return offset > 0 && offset < 1
      })
    )

  it('keeps both markers drawn while focus moves between networks -- the markers are not tied to focus', () => {
    // Every instant from the second generate to the reset: whichever network
    // is focused, and whether any is, both markers are on the map.
    const window = SAMPLES.filter((t) => t >= 63 && t < 97)
    const focuses = new Set(window.map((t) => focusedAt(t).join()))
    expect(focuses).toEqual(new Set(['2', '1']))
    for (const t of window) {
      for (const id of ids) expect(shown(MARKER(id), t), `marker ${id} at ${t}%`).toBe(true)
    }
    // AND WHILE NOTHING IS FOCUSED -- the tool armed for the second point --
    // the first marker is still there. A marker tied to focus fails here.
    const blurred = SAMPLES.filter((t) => t >= 40 && t < 63)
    for (const t of blurred) {
      expect(focusedAt(t), `nothing focused at ${t}%`).toEqual([])
      expect(shown(MARKER('1'), t), `marker 1 at ${t}%`).toBe(true)
    }
    // Once placed, a marker never leaves before the loop resets.
    for (const id of ids) {
      const { stops } = timelineFor(MARKER(id))
      const after = stops.filter((s) => s.at > 0 && s.at < 97)
      expect(after.map((s) => s.props.opacity), `marker ${id}`).toEqual(['1'])
    }
  })

  it('draws only the focused network: the other one is off the map', () => {
    for (const t of SAMPLES) {
      const drawn = ids.filter((id) => shown(NETWORK(id), t))
      expect(drawn.length, `networks at ${t}%`).toBeLessThanOrEqual(1)
      // Outside the moments a network is being routed, what is drawn is what
      // is focused, exactly.
      if (!drawingAt(t) && !(t >= 26 && t < 33) && !(t >= 56 && t < 63)) {
        expect(drawn, `at ${t}%`).toEqual(focusedAt(t))
      }
    }
    // The frame the spec screenshots: both markers, network 2 focused, network 1 absent.
    expect(focusedAt(66)).toEqual(['2'])
    expect(shown(NETWORK('1'), 66)).toBe(false)
    expect(shown(NETWORK('2'), 66)).toBe(true)
    expect(ids.every((id) => shown(MARKER(id), 66))).toBe(true)
    // And after Network 1's tab is clicked, the other way round.
    expect(focusedAt(76)).toEqual(['1'])
    expect(shown(NETWORK('1'), 76)).toBe(true)
    expect(shown(NETWORK('2'), 76)).toBe(false)
  })

  it('puts the tick on one tab at most, and it is the focused one: it has no timeline of its own', () => {
    for (const id of ids) {
      // The tick, the tab mark and the marker ring run ONE set of keyframes.
      const focus = timelineFor(RING(id)).name
      expect(timelineFor(TICK(id)).name).toBe(focus)
      expect(timelineFor(TAB_MARK(id)).name).toBe(focus)
      expect(focus).toBe(`tutorial-roads-focus-${id}`)
    }
    // The landform tick's keyframes are nowhere on this card.
    expect(CARD_CSS).not.toMatch(/tutorial-(tick|landform)-/)
    for (const t of SAMPLES) {
      const ticked = ids.filter((id) => shown(TICK(id), t))
      expect(ticked.length, `ticks at ${t}%`).toBeLessThanOrEqual(1)
      expect(ticked, `at ${t}%`).toEqual(focusedAt(t))
      // A tick is only ever on a tab that is there.
      for (const id of ticked) expect(shown(TAB(id), t), `tab ${id} at ${t}%`).toBe(true)
    }
    // Exactly one whenever a network is on the map and not being routed.
    for (const t of SAMPLES.filter((t) => (t >= 33 && t < 40) || (t >= 63 && t < 97))) {
      expect(ids.filter((id) => shown(TICK(id), t)), `at ${t}%`).toHaveLength(1)
    }
    // The tick moves at the tab click and nowhere else after the second generate.
    expect(focusedAt(71.4)).toEqual(['2'])
    expect(focusedAt(71.5)).toEqual(['1'])
  })

  it('switches every show and hide on a hard cut, never a fade', () => {
    const cuts = [
      NETWORK('1'), NETWORK('2'), MARKER('1'), MARKER('2'), TICK('1'), TICK('2'), RING('1'), RING('2'),
      TAB_MARK('1'), TAB_MARK('2'), TAB('1'), TAB('2'),
      '.tutorial-anim__banner--roads-idle', '.tutorial-anim__banner--roads-armed',
      '.tutorial-anim__banner--roads-working', '.tutorial-anim__banner--roads-reviewing',
      '.tutorial-anim__disabled--roads', '.tutorial-anim__armed',
    ]
    for (const selector of cuts) {
      expect(timelineFor(selector).cut, selector).toBe(true)
      expect(baseFor(selector)['animation-timing-function'], selector).toBe('step-end')
    }
    // A pending marker's arrival and departure are within one frame at 16s.
    for (const id of ids) {
      const { stops } = timelineFor(`.tutorial-anim__access--pending-${id}`)
      for (let i = 1; i < stops.length; i += 1) {
        const [a, b] = [stops[i - 1], stops[i]]
        if ('opacity' in a.props && 'opacity' in b.props && a.props.opacity !== b.props.opacity) {
          expect(b.at - a.at, `pending ${id} ${a.at}->${b.at}`).toBeLessThanOrEqual(0.1 + 1e-9)
        }
      }
    }
  })

  it('never unwinds a drawn track: every dash offset only falls, and is pinned once drawn', () => {
    for (const id of ids) {
      for (const branch of ['main', 'branch']) {
        const selector = `.tutorial-anim__track--roads-${id}-${branch}`
        const offsets = timelineFor(selector).stops.map((s) => parseFloat(s.props['stroke-dashoffset']))
        for (let i = 1; i < offsets.length; i += 1) expect(offsets[i], selector).toBeLessThanOrEqual(offsets[i - 1])
        expect(offsets[offsets.length - 1], selector).toBe(0)
        // No other property moves a track; hiding is its network group's.
        for (const stop of timelineFor(selector).stops) expect(Object.keys(stop.props)).toEqual(['stroke-dashoffset'])
      }
      // The loop resets a network while it is off the map, never in view.
      const draw = timelineFor(`.tutorial-anim__track--roads-${id}-main`).stops
      const start = draw.filter((s) => s.props['stroke-dashoffset'] === '1').at(-1).at
      expect(shown(NETWORK(id), start - 0.1), `network ${id} before its draw`).toBe(false)
      expect(shown(NETWORK(id), 99.9), `network ${id} at the loop's end`).toBe(false)
    }
  })

  it('blurs on "Add access point": network 1 leaves and its tab unticks the instant it is pressed', () => {
    // WizardCursor's arm() blurs, and on a focus-bound step the blur takes
    // the selection with it (roads.test.jsx section 2b). The diagram shows it.
    expect(shown('.tutorial-anim__banner--roads-armed', 40)).toBe(true)
    expect(shown('.tutorial-anim__banner--roads-reviewing', 39.9)).toBe(true)
    expect(shown(NETWORK('1'), 39.9)).toBe(true)
    expect(shown(NETWORK('1'), 40)).toBe(false)
    expect(shown(TICK('1'), 40)).toBe(false)
    expect(shown(MARKER('1'), 40)).toBe(true)
  })
})

/* ===========================================================================
   6. The other cards, unchanged
   =========================================================================== */

describe('6. the boundary, landform and water cards, on the same parcel', () => {
  it('keeps the parcel where boundary put it', () => {
    expect(PARCEL.map(({ id, x, y }) => [id, x, y])).toEqual([
      ['A', 96, 66],
      ['B', 196, 48],
      ['C', 286, 72],
      ['D', 330, 148],
      ['E', 300, 232],
      ['F', 170, 250],
      ['G', 92, 186],
    ])
    expect(PARCEL_PATH).toBe('M 96 66 L 196 48 L 286 72 L 330 148 L 300 232 L 170 250 L 92 186 Z')
  })

  it('renders the boundary card as main does', () => {
    const main = readFileSync(path.join(FIXTURES, 'boundary-card.svg'), 'utf8').trim()
    const now = renderToStaticMarkup(<BoundaryAnimation />)
    const unwrapped = now.replace(/<g class="farm-scene__stand">((?:<circle[^>]*><\/circle>)*)<\/g>/, '$1')
    expect(unwrapped).toBe(main)
  })

  // Rendered from cabaf44, the main this branch starts from.
  it.each([
    ['landform-read-card.svg', LandformReadAnimation],
    ['landform-set-card.svg', LandformSetAnimation],
    ['water-card.svg', WaterAnimation],
  ])('renders %s as main does', (fixture, Animation) => {
    const main = readFileSync(path.join(FIXTURES, fixture), 'utf8').trim()
    expect(renderToStaticMarkup(<Animation />)).toBe(main)
  })

  it('draws the roads card on the same land: its parcel ring is the parcel path', async () => {
    const handle = await mount(<RoadsAnimation />)
    expect(handle.container.querySelector('.farm-scene__parcel').getAttribute('d')).toBe(PARCEL_PATH)
    expect(handle.container.querySelector('.tutorial-anim__armed').getAttribute('d')).toBe(PARCEL_PATH)
    expect(handle.container.querySelector('svg').getAttribute('viewBox')).toBe(SCENE_VIEWBOX)
  })
})

/* ===========================================================================
   7. Resting frame, and reduced motion
   =========================================================================== */

describe('7. with no motion, the card is a finished diagram', () => {
  it('rests with both markers placed, network 1 drawn and focused, network 2 off the map with its tab unticked', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')

    for (const visible of [
      '.tutorial-anim__access--generated-1',
      '.tutorial-anim__access--generated-2',
      '.tutorial-anim__network--roads-1',
      '.tutorial-anim__mark--roads-1',
      '.tutorial-anim__tab-mark--roads-1',
      '.tutorial-anim__tick--roads-1',
      '.tutorial-anim__tab--roads-1',
      '.tutorial-anim__banner--roads-reviewing',
    ]) {
      expect(baseFor(visible).opacity, visible).toBeUndefined()
      expect(svg.querySelector(visible), visible).not.toBeNull()
    }
    for (const hidden of [
      '.tutorial-anim__network--roads-2',
      '.tutorial-anim__mark--roads-2',
      '.tutorial-anim__tab-mark--roads-2',
      '.tutorial-anim__tick--roads-2',
      '.tutorial-anim__access--pending-1',
      '.tutorial-anim__access--pending-2',
      '.tutorial-anim__banner--roads-idle',
      '.tutorial-anim__banner--roads-armed',
      '.tutorial-anim__banner--roads-working',
      '.tutorial-anim__armed',
      '.tutorial-anim__pulse',
      '.tutorial-anim__cursor',
    ]) {
      expect(baseFor(hidden).opacity, hidden).toBe('0')
    }
    // Network 2's tab is present, quiet as an unticked tab is.
    expect(svg.querySelector('.tutorial-anim__tab--roads-2')).not.toBeNull()
    expect(baseFor('.tutorial-anim__tab--roads-2').opacity).toBe('0.55')
    // Every track rests drawn: no base offset, so the offset is 0.
    expect(baseFor('.farm-scene__track')['stroke-dashoffset']).toBeUndefined()
  })

  it('switches every roads animation off under reduced motion, after its own rules; the cursor goes by the shared rule', () => {
    const media = CARD_CSS.slice(CARD_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.tutorial-anim--roads \*\s*\{\s*animation:\s*none;?\s*\}/)
    // Every rule that names an animation is single-class, so the media rule outranks it by order.
    for (const [selector, body] of rulesOf(CARD_CSS.slice(0, CARD_CSS.indexOf('@media')))) {
      if (!/animation-name/.test(body)) continue
      for (const s of selector.split(',')) expect(s.trim(), s).toMatch(/^\.[a-z0-9_-]+$/i)
    }
    expect(decl(APP_CSS)).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
    expect(ROADS_CSS).not.toMatch(/tutorial-anim__cursor\s*\{[^}]*display/)
  })
})

/* ===========================================================================
   8. The treatment
   =========================================================================== */

describe('8. the treatment', () => {
  it('runs on one period, 16s, every stop a percentage, no durations or delays of its own', () => {
    expect(propsOf(rulesOf(CARD_CSS).find(([s]) => s === '.tutorial-anim--roads')[1])['--loop']).toBe('16s')
    expect(ROADS_CSS).not.toMatch(/animation-(duration|delay)/)
    expect(ROADS_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)
    const keyframes = CARD_CSS.match(/@keyframes tutorial-roads[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThanOrEqual(20)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
  })

  it('names no colour: zero hex literals in the new CSS and the new modules', () => {
    expect(ROADS_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(ROADS_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const [, body] of rulesOf(ROADS_CSS)) {
      for (const [prop, value] of Object.entries(propsOf(body))) {
        if (!/^(color|background|fill|stroke)$/.test(prop)) continue
        if (/^(none|transparent)$/.test(value)) continue
        expect(value, prop).toMatch(/^var\(--/)
      }
    }
    for (const file of ['farmScene.jsx', 'roadsCard.jsx', 'stepCards.js']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('keeps oxide to the click pulses and the primary button, through the shared rules', async () => {
    expect(ROADS_CSS).not.toMatch(/--oxide/)
    const handle = await mount(<RoadsAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__pulse')).toHaveLength(3)
    expect(baseFor('.tutorial-anim__pulse').stroke).toBe('var(--oxide)')
    expect(baseFor('.tutorial-anim__commit-button rect').fill).toBe('var(--oxide)')
    // The disabled face over the generate button is paper, not oxide.
    expect(baseFor('.tutorial-anim__disabled rect').fill).toBe('var(--paper)')
    // The lit boundary and the markers are the access point's token.
    expect(baseFor('.tutorial-anim__armed').stroke).toBe('var(--ochre)')
  })

  it('sets nothing in the data face: there are no measured values on this card', async () => {
    expect(ROADS_CSS).not.toMatch(/--font-data/)
    const handle = await mount(<RoadsAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__value')).toHaveLength(0)
  })

  it('keeps the tabs and buttons inside the frame', async () => {
    const handle = await mount(<RoadsAnimation />)
    for (const rect of handle.container.querySelectorAll('.tutorial-anim__tab-card, .tutorial-anim__banner rect')) {
      const right = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))
      const bottom = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))
      expect(right).toBeLessThanOrEqual(400)
      expect(bottom).toBeLessThanOrEqual(300)
    }
  })

  it('gives each diagram its own pattern ids, so two on one page never cross', async () => {
    const handle = await mount(
      <>
        <RoadsAnimation />
        <RoadsAnimation />
      </>
    )
    const ids = [...handle.container.querySelectorAll('pattern')].map((p) => p.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
