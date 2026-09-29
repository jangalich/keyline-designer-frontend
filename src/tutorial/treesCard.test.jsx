/**
 * treesCard.test.jsx
 *
 * THE TREES STEP'S CARD, the tree-zone layer it adds to the shared farm, and
 * the production hatch's correction.
 *
 *   1. the trees entry registers one card, and the shipped shell opens it on
 *      the generate press;
 *   2. the copy is the spec's, verbatim, with nothing set in weight;
 *   3. the diagram names what the real step names: its buttons and its tabs;
 *   4. THE TWO CROPS: the tree mark is a hatch on --tree with no stroke, at
 *      production's spacing and weight on the mirrored rise -- and both crops
 *      are held to the map's own rows, so either drifting fails here;
 *   5. the production hatch renders at the corrected spacing and weight in
 *      every card that uses it;
 *   6. the geometry, and the boundary, landform, water and roads cards on
 *      the same parcel;
 *   7. the timeline: a drawn edge never unwinds, the untick takes the zone
 *      off the map and dims its tab;
 *   8. with no motion, the card is a finished diagram;
 *   9. the treatment: one period, no colour literals, oxide only on the
 *      pulse and the commit button.
 *
 * What only a real engine can answer -- the tokens resolving, nothing running
 * under reduced motion, the fit at 380px, and the two hatches told apart
 * where they sit near each other -- is in treesCard.browser.test.jsx.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { zoneMark, zoneTreatmentSpec } from '../ProductionHatchPattern.jsx'
import { COMMITTED, NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { STEP_DEFINITIONS, TREES_STEP, registryProposalFeatures } from '../wizard/stepDefinitions'
import { REVIEWING } from '../wizard/useStepMachine'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { BoundaryAnimation } from './boundaryCard.jsx'
import {
  ACCESS_POINTS,
  CROP_HATCHES,
  HATCH_PITCH,
  PARCEL,
  PARCEL_PATH,
  ROAD_NETWORKS,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SURVEY_AREAS,
  SceneTreeZones,
  TREE_ZONES,
  TreeHatch,
} from './farmScene.jsx'
import { LandformReadAnimation, LandformSetAnimation } from './landformCards.jsx'
import { SEEN_KEY, resetTutorialPrefsForTests } from './prefs.js'
import { RoadsAnimation } from './roadsCard.jsx'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor, cardsOf } from './stepCards.js'
import {
  BANNER,
  TREES_CARD,
  TREES_LABELS,
  TREES_TABS,
  TreesAnimation,
  UNTICK_CLICK,
  WINDBREAK_CORNERS,
  WINDBREAK_POINTS,
} from './treesCard.jsx'
import { WaterAnimation } from './waterCard.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')
const FIXTURES = path.join(HERE, '..', 'fixtures')

/** The spec's copy. A rewrite fails here. */
const TITLE = 'Marginal areas for tree crops'
const BODY = "Draw your own to add one, untick any you don't want, then commit."

/** The spec's geometry. */
const ZONE_1 =
  'M 216 74 C 242 66, 272 76, 290 92 C 302 102, 294 114, 276 116 C 256 118, 240 110, 224 104 C 210 98, 206 86, 216 74 Z'
const ZONE_2 =
  'M 104 184 C 112 208, 132 228, 158 238 C 184 248, 214 242, 236 228 C 226 236, 200 236, 176 228 C 152 220, 134 206, 124 186 C 118 176, 110 176, 104 184 Z'
const WINDBREAK = '100,74 144,65 147,78 103,87'

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

/** The tree-zone layer this branch adds to the farm's section. */
const SCENE_CSS = decl(slice("/* --- The farm's tree zones", '/* --- 6. Landform'))
/** The trees card's own section, to the end. */
const CARD_CSS = decl(slice('/* --- 9. Trees'))
/** Every rule this branch adds to App.css. */
const TREES_CSS = SCENE_CSS + CARD_CSS

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

/** One element's keyframes, off the trees section: its stops, in order, and whether it cuts. */
function timelineFor(selector) {
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

/** A property's value at `t` percent, as the engine resolves it (see roadsCard.test.jsx). */
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
    <StepCard container={stage} card={TREES_CARD} auto onAutoChange={() => {}} onDismiss={() => {}} onClose={() => {}} />
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

describe('1. the trees entry registers one card', () => {
  it('is the registry entry for trees, one card in the one-card shape, firing by the default rule', () => {
    const entry = cardFor(STEP_CARDS, 'trees')
    expect(entry).toBe(TREES_CARD)
    expect(STEP_CARDS.filter((e) => e.stepId === 'trees')).toHaveLength(1)
    expect(entry.cards).toBeUndefined()
    expect(cardsOf(entry)).toEqual([TREES_CARD])
    expect(entry.Animation).toBe(TreesAnimation)
    // No moment of its own: trees generates, so the generate press.
    expect(entry.firesOn).toBeUndefined()
  })

  it('opens by itself on "Generate tree zones", through the shipped shell and registry', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary', 'landform', 'water', 'roads']))
    const doc = serverDocument({
      landform: { status: COMMITTED },
      water: { status: COMMITTED },
      roads: { status: COMMITTED },
    })
    globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
      const url = new URL(rawUrl)
      if (url.pathname === '/api/steps') {
        return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
      }
      if (url.pathname.startsWith('/api/sessions/') && (init.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => doc }
      }
      if (url.pathname.endsWith('/steps/trees/generate') && init.method === 'POST') {
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
    expect(cursor.cursorStepId).toBe('trees')
    expect(find('tutorial-step-card')).toBeNull()
    await React.act(async () => find('generate-trees').click())
    const card = find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('trees')
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--trees')).not.toBeNull()
    expect(find('tutorial-step-dots')).toBeNull()
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

describe('2. the copy', () => {
  it('says exactly the spec, with nothing set in weight', async () => {
    expect(TREES_CARD.title).toBe(TITLE)
    expect(TREES_CARD.body).toBe(BODY)
    expect(TREES_CARD.emphasis).toBeUndefined()
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    const body = find('tutorial-step-body')
    expect(body.textContent).toBe(BODY)
    expect(body.querySelectorAll('strong, em, b')).toHaveLength(0)
  })
})

/* ===========================================================================
   3. What the real step names
   =========================================================================== */

describe('3. the buttons and the tabs are the real step', () => {
  it("draws the reviewing pair TREES_STEP declares: its draw button beside its commit, the commit primary", async () => {
    const machine = { draft: { inputs: {} }, reachable: true, context: {}, canGenerate: true }
    const declared = TREES_STEP.buttons[REVIEWING].map((b) => ({
      label:
        b.key === 'commit'
          ? TREES_STEP.commit.label({ committableCount: 2 })
          : typeof b.label === 'function'
            ? b.label({ machine })
            : b.label,
      tone: b.tone,
    }))
    const handle = await mount(<TreesAnimation />)
    const drawn = [...handle.container.querySelectorAll('.tutorial-anim__draw-button, .tutorial-anim__commit-button')].map(
      (g) => ({
        label: g.querySelector(':scope > text').textContent,
        tone: g.classList.contains('tutorial-anim__commit-button') ? 'primary' : 'secondary',
      })
    )
    expect(drawn).toEqual(declared)
    expect(drawn).toEqual([
      { label: TREES_LABELS.draw, tone: 'secondary' },
      { label: TREES_LABELS.commit, tone: 'primary' },
    ])
  })

  it('names the tabs as TREES_STEP.tabs does: the generated zones by rank, then the drawn one', async () => {
    const tabs = TREES_STEP.tabs({
      proposals: { zones: [{ feature_id: 'a', rank: 1 }, { feature_id: 'b', rank: 2 }] },
      draft: { selectedFeatureIds: [], drawnFeatures: [{ id: 'drawn-x', properties: {} }] },
    })
    expect(TREES_TABS.map((t) => t.name)).toEqual(tabs.map((t) => t.name))
    const handle = await mount(<TreesAnimation />)
    const names = [...handle.container.querySelectorAll('.tutorial-anim__tab .tutorial-anim__name')].map((t) => t.textContent)
    expect(names).toEqual(['Zone 1', 'Zone 2', 'Drawn 1'])
  })

  it("unticks Zone 2 on its checkbox, and presses each button on its own face", () => {
    const zone2 = TREES_TABS[1]
    expect(UNTICK_CLICK.x).toBeGreaterThanOrEqual(zone2.x + 7)
    expect(UNTICK_CLICK.x).toBeLessThanOrEqual(zone2.x + 18)
    expect(UNTICK_CLICK.y).toBeGreaterThanOrEqual(270)
    expect(UNTICK_CLICK.y).toBeLessThanOrEqual(281)
    const at = (t) => {
      const { stops } = timelineFor('.tutorial-anim__cursor--trees')
      const stop = [...stops].reverse().find((s) => s.at <= t && s.props.transform)
      return stop.props.transform.match(/-?[\d.]+/g).map(Number)
    }
    expect(at(9)).toEqual([BANNER.draw.x + BANNER.draw.width / 2, BANNER.y + 14])
    expect(at(58)).toEqual([UNTICK_CLICK.x, UNTICK_CLICK.y])
    expect(at(78)).toEqual([BANNER.commit.x + BANNER.commit.width / 2, BANNER.y + 14])
  })
})

/* ===========================================================================
   4. The two crops
   =========================================================================== */

describe('4. the tree mark is production, mirrored', () => {
  const MAP = { production: zoneTreatmentSpec('production'), tree: zoneTreatmentSpec('tree') }

  it("holds the scene's two hatches to the map's two rows: one spacing, one weight, opposite rises", () => {
    // The map's own pairing, read off its table: if the MAP's crops drift
    // apart, this fails before the scene is even looked at.
    expect(MAP.tree.kind).toBe('hatch')
    expect(MAP.production.kind).toBe('hatch')
    expect(MAP.tree.spacing).toBe(MAP.production.spacing)
    expect(MAP.tree.weight).toBe(MAP.production.weight)
    expect([MAP.production.rise, MAP.tree.rise]).toEqual(['up', 'down'])
    expect(MAP.tree.token).toBe('--tree')
    expect(MAP.production.token).toBe('--oxide')

    // And the scene's: the pitch is the map's spacing, and both crops' rules
    // take their weight from one rule in the stylesheet.
    expect(HATCH_PITCH).toBe(MAP.production.spacing)
    expect(HATCH_PITCH).toBe(MAP.tree.spacing)
    for (const crop of ['production', 'tree']) {
      expect(CROP_HATCHES[crop].rise).toBe(MAP[crop].rise)
      expect(baseFor(`.${CROP_HATCHES[crop].line}`)['stroke-width'], crop).toBe(String(MAP[crop].weight))
    }
    const weights = rulesOf(decl(APP_CSS))
      .filter(([s, body]) => /farm-scene__(hatch|tree)-line/.test(s) && /stroke-width/.test(body))
      .map(([s]) => s)
    expect(weights).toEqual(['.farm-scene__hatch-line,\n.farm-scene__tree-line'])
    // Mirrored, not merely different: equal and opposite angles.
    expect(CROP_HATCHES.tree.angle).toBe(-CROP_HATCHES.production.angle)
  })

  it('renders both hatches in one diagram at one pitch, rising and falling, each rule classed and uncoloured', async () => {
    const handle = await mount(<TreesAnimation />)
    const [production, tree] = handle.container.querySelectorAll('defs > pattern')
    for (const pattern of [production, tree]) {
      expect(pattern.getAttribute('width')).toBe(String(HATCH_PITCH))
      expect(pattern.getAttribute('height')).toBe(String(HATCH_PITCH))
      expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse')
      const lines = pattern.querySelectorAll('line')
      expect(lines).toHaveLength(1)
      expect(lines[0].getAttribute('y2')).toBe(String(HATCH_PITCH))
      for (const attr of ['stroke', 'stroke-width', 'fill', 'style']) expect(lines[0].hasAttribute(attr), attr).toBe(false)
    }
    // "/" is rotate(45) in SVG's y-down frame; "\" is its mirror.
    expect(production.getAttribute('patternTransform')).toBe('rotate(45)')
    expect(tree.getAttribute('patternTransform')).toBe('rotate(-45)')
    expect(production.querySelector('line').getAttribute('class')).toBe('farm-scene__hatch-line')
    expect(tree.querySelector('line').getAttribute('class')).toBe('farm-scene__tree-line')
  })

  it('strokes the tree rule in --tree and fills a zone with the hatch alone: no stroke, no wash beneath', async () => {
    expect(baseFor('.farm-scene__tree-line').stroke).toBe('var(--tree)')
    expect(baseFor('.farm-scene__tree-zone')).toEqual({ fill: 'var(--farm-tree-hatch)', stroke: 'none' })
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <defs>
          <TreeHatch id="t1" />
        </defs>
        <SceneTreeZones hatch="t1" />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="tree-zones"]')
    const zones = [...layer.children]
    expect(zones.map((z) => z.tagName.toLowerCase())).toEqual(['path', 'path'])
    for (const zone of zones) {
      expect(zone.getAttribute('class')).toBe('farm-scene__tree-zone')
      expect(zone.style.getPropertyValue('--farm-tree-hatch')).toBe('url(#t1)')
      expect(zone.dataset.treatment).toBe('tree')
      expect(zone.dataset.mark).toBe(zoneTreatmentSpec('tree').kind)
    }
    // The map's own resolution of the row: a paint server and NO stroke.
    expect(zoneTreatmentSpec('tree').kind).toBe('hatch')
    expect(zoneMark('tree').kind).toBe('pattern')
    expect(zoneMark('tree').stroke).toBeNull()
  })

  it('draws the windbreak on the same hatch and the same rule as a generated zone', async () => {
    const handle = await mount(<TreesAnimation />)
    const windbreak = handle.container.querySelector('.tutorial-anim__windbreak')
    const zone = handle.container.querySelector('[data-layer="tree-zones"] [data-zone="1"]')
    expect(windbreak.classList.contains('farm-scene__tree-zone')).toBe(true)
    expect(windbreak.style.getPropertyValue('--farm-tree-hatch')).toBe(zone.style.getPropertyValue('--farm-tree-hatch'))
  })
})

/* ===========================================================================
   5. The production hatch, corrected, everywhere
   =========================================================================== */

describe('5. the production hatch renders at spacing 8, weight 1, in every card that uses it', () => {
  it.each([
    ['landform, card one', LandformReadAnimation],
    ['landform, card two', LandformSetAnimation],
    ['water', WaterAnimation],
    ['roads', RoadsAnimation],
    ['trees', TreesAnimation],
  ])('%s', async (_, Animation) => {
    const handle = await mount(<Animation />)
    const line = handle.container.querySelector('.farm-scene__hatch-line')
    const pattern = line.closest('pattern')
    expect(pattern.getAttribute('width')).toBe('8')
    expect(pattern.getAttribute('height')).toBe('8')
    expect(line.getAttribute('y2')).toBe('8')
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(45)')
  })

  it('weighs every production rule at 1, and nothing restates it', () => {
    expect(baseFor('.farm-scene__hatch-line')['stroke-width']).toBe('1')
    expect(baseFor('.farm-scene__hatch-line').stroke).toBe('var(--oxide)')
    const restated = BASE_RULES.filter(([s, body]) => /farm-scene__hatch-line/.test(s) && /stroke-width/.test(body))
    expect(restated).toHaveLength(1)
  })
})

/* ===========================================================================
   6. The geometry, and the earlier cards on the same parcel
   =========================================================================== */

describe('6. the geometry, on the same parcel', () => {
  it('holds the tree zones and the windbreak to the spec', () => {
    expect(TREE_ZONES.map(({ id, d }) => [id, d])).toEqual([
      ['1', ZONE_1],
      ['2', ZONE_2],
    ])
    expect(WINDBREAK_POINTS).toBe(WINDBREAK)
    expect(WINDBREAK_CORNERS.map(({ x, y }) => [x, y])).toEqual([
      [100, 74],
      [144, 65],
      [147, 78],
      [103, 87],
    ])
  })

  it('draws the generated zones organic and the windbreak straight, never smoothed', async () => {
    const handle = await mount(<TreesAnimation />)
    for (const zone of handle.container.querySelectorAll('[data-layer="tree-zones"] > *')) {
      expect(zone.tagName.toLowerCase()).toBe('path')
      expect(zone.getAttribute('d')).toMatch(/ C /)
    }
    const windbreak = handle.container.querySelector('.tutorial-anim__windbreak')
    expect(windbreak.tagName.toLowerCase()).toBe('polygon')
    expect(windbreak.getAttribute('points')).toBe(WINDBREAK)
  })

  it('stacks three commitments beneath, in the order they were decided, all settled', async () => {
    const handle = await mount(<TreesAnimation />)
    const layers = [...handle.container.querySelectorAll('svg > [data-layer]')].map((g) => g.dataset.layer)
    const order = ['blocks', 'survey-embankment', 'tracks', 'access-points', 'tree-zones']
    expect(layers.filter((id) => order.includes(id))).toEqual(order)
    for (const id of order.slice(0, 4)) {
      const layer = handle.container.querySelector(`[data-layer="${id}"]`)
      expect(layer.classList.contains('farm-scene__layer--settled'), id).toBe(true)
    }
    expect(handle.container.querySelector('[data-layer="tree-zones"]').classList.contains('farm-scene__layer--settled')).toBe(false)
    // One of each: Block 1, the embankment area, network 1 and its point.
    expect([...handle.container.querySelectorAll('[data-layer="blocks"] [data-block]')].map((b) => b.dataset.block)).toEqual(['1'])
    expect(handle.container.querySelector('.farm-scene__block-hatch').getAttribute('d')).toBe(SUGGESTED_BLOCKS[0].d)
    expect(handle.container.querySelector('[data-layer="survey-embankment"] path').getAttribute('d')).toBe(
      SURVEY_AREAS.embankment.d
    )
    const network = handle.container.querySelector('[data-layer="tracks"] [data-network]')
    expect(network.dataset.network).toBe('1')
    expect([...network.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(
      ROAD_NETWORKS[0].branches.map((b) => b.d)
    )
    const point = handle.container.querySelector('[data-layer="access-points"] [data-point]')
    expect(point.dataset.point).toBe('1')
    expect([point.getAttribute('cx'), point.getAttribute('cy')]).toEqual([String(ACCESS_POINTS[0].x), String(ACCESS_POINTS[0].y)])
    expect(point.dataset.state).toBe('generated')
  })

  it('keeps the parcel where boundary put it, and draws the trees card on it', async () => {
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
    const handle = await mount(<TreesAnimation />)
    expect(handle.container.querySelector('.farm-scene__parcel').getAttribute('d')).toBe(PARCEL_PATH)
    expect(handle.container.querySelector('svg').getAttribute('viewBox')).toBe(SCENE_VIEWBOX)
  })

  it('renders the boundary card as main does', () => {
    const main = readFileSync(path.join(FIXTURES, 'boundary-card.svg'), 'utf8').trim()
    const now = renderToStaticMarkup(<BoundaryAnimation />)
    const unwrapped = now.replace(/<g class="farm-scene__stand">((?:<circle[^>]*><\/circle>)*)<\/g>/, '$1')
    expect(unwrapped).toBe(main)
  })

  // THE HATCH IS THE ONE THING THAT MOVED: the fixtures were regenerated
  // with the production pattern at 8 where it was 7, and nothing else.
  it.each([
    ['landform-read-card.svg', LandformReadAnimation],
    ['landform-set-card.svg', LandformSetAnimation],
    ['water-card.svg', WaterAnimation],
  ])('renders %s as its fixture does, at the corrected pitch', (fixture, Animation) => {
    const main = readFileSync(path.join(FIXTURES, fixture), 'utf8').trim()
    expect(main).toMatch(/class="farm-scene__hatch" width="8" height="8"/)
    expect(main).not.toMatch(/width="7"/)
    expect(renderToStaticMarkup(<Animation />)).toBe(main)
  })

  it('draws the roads card on the same land, its network and markers where roads put them', async () => {
    const handle = await mount(<RoadsAnimation />)
    expect(handle.container.querySelector('.farm-scene__parcel').getAttribute('d')).toBe(PARCEL_PATH)
    const tracks = [...handle.container.querySelectorAll('[data-layer="tracks"] path')].map((p) => p.getAttribute('d'))
    expect(tracks).toEqual(ROAD_NETWORKS.flatMap((n) => n.branches.map((b) => b.d)))
  })
})

/* ===========================================================================
   7. The timeline
   =========================================================================== */

describe('7. the timeline', () => {
  const segments = [1, 2, 3, 4].map((n) => `.tutorial-anim__segment--trees-${n}`)

  it('never unwinds a drawn edge: every dash offset only falls, and is pinned at 0 once drawn', () => {
    for (const selector of segments) {
      const { stops } = timelineFor(selector)
      const offsets = stops.filter((s) => 'stroke-dashoffset' in s.props)
      const drawnAt = offsets.find((s) => parseFloat(s.props['stroke-dashoffset']) === 0).at
      for (const stop of offsets) {
        if (stop.at >= drawnAt) expect(stop.props['stroke-dashoffset'], `${selector} @ ${stop.at}%`).toBe('0')
      }
      let last = Infinity
      for (const t of SAMPLES) {
        const value = valueAt(selector, 'stroke-dashoffset', t)
        expect(value, `${selector} @ ${t}%`).toBeLessThanOrEqual(last)
        last = value
      }
    }
    // pathLength="1" on every edge, and the dash is the edge's own length.
    expect(baseFor('.tutorial-anim__segment')['stroke-dasharray']).toBe('1')
  })

  it('draws each edge in turn, then fills the windbreak and adds its ticked tab on the close', () => {
    const drawn = segments.map((s) => SAMPLES.find((t) => valueAt(s, 'stroke-dashoffset', t) === 0))
    expect(drawn).toEqual([...drawn].sort((a, b) => a - b))
    const filled = SAMPLES.find((t) => valueAt('.tutorial-anim__windbreak', 'opacity', t) > 0)
    const tabbed = SAMPLES.find((t) => valueAt('.tutorial-anim__tab--trees-drawn-1', 'opacity', t) > 0)
    expect(filled).toBeGreaterThanOrEqual(drawn[3])
    expect(tabbed).toBeGreaterThanOrEqual(drawn[3])
    // Ticked from the moment it exists: the drawn tab's tick has no timeline.
    expect(baseFor('.tutorial-anim__tick--trees-drawn-1')['animation-name']).toBeUndefined()
  })

  it('unticks Zone 2: its tick goes, it leaves the map on a cut, and its tab dims', () => {
    expect(timelineFor('.tutorial-anim__zone--trees-2').cut).toBe(true)
    const tickGone = SAMPLES.find((t) => valueAt('.tutorial-anim__tick--trees-2', 'opacity', t) === 0)
    const zoneGone = SAMPLES.find((t) => valueAt('.tutorial-anim__zone--trees-2', 'opacity', t) === 0)
    const pulse = SAMPLES.find((t) => valueAt('.tutorial-anim__pulse--trees', 'opacity', t) > 0)
    expect(pulse).toBeGreaterThan(55)
    expect(tickGone).toBeGreaterThan(pulse - 1)
    expect(zoneGone).toBeGreaterThan(pulse - 1)
    expect(zoneGone - tickGone).toBeLessThan(2)
    // Before the untick both zones are on the map; after, only Zone 1.
    expect(valueAt('.tutorial-anim__zone--trees-2', 'opacity', 50)).toBe(1)
    expect(valueAt('.tutorial-anim__zone--trees-2', 'opacity', 70)).toBe(0)
    expect(valueAt('.tutorial-anim__tab--trees-2', 'opacity', 70)).toBe(0.45)
    expect(baseFor('.tutorial-anim__zone--trees-1')['animation-name']).toBeUndefined()
  })

  it('presses commit after everything else, and the press is on the commit button', () => {
    const commit = timelineFor('.tutorial-anim__commit-button--trees').stops.find((s) => /0\.94/.test(s.props.transform ?? ''))
    expect(commit.at).toBeGreaterThan(70)
    expect(baseFor('.tutorial-anim__commit-button--trees')['animation-name']).toBe('tutorial-trees-commit-button')
    expect(baseFor('.tutorial-anim__draw-button--trees')['animation-name']).toBe('tutorial-trees-draw-button')
  })
})

/* ===========================================================================
   8. With no motion
   =========================================================================== */

describe('8. with no motion, the card is a finished diagram', () => {
  it('rests with the windbreak drawn and ticked, Zone 2 off the map and its tab dimmed', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    for (const visible of [
      '.tutorial-anim__windbreak',
      '.tutorial-anim__tab--trees-drawn-1',
      '.tutorial-anim__tick--trees-drawn-1',
      '.tutorial-anim__zone--trees-1',
      '.tutorial-anim__tick--trees-1',
    ]) {
      expect(baseFor(visible).opacity, visible).toBeUndefined()
      expect(svg.querySelector(visible), visible).not.toBeNull()
    }
    for (const selector of ['.tutorial-anim__segment--trees', '.tutorial-anim__corner--trees']) {
      expect(baseFor(selector).opacity, selector).toBeUndefined()
      expect(svg.querySelectorAll(selector), selector).toHaveLength(4)
    }
    // The edges rest drawn: the shared rule's offset is 0.
    expect(baseFor('.tutorial-anim__segment')['stroke-dashoffset']).toBe('0')
    for (const hidden of ['.tutorial-anim__zone--trees-2', '.tutorial-anim__tick--trees-2', '.tutorial-anim__pulse', '.tutorial-anim__cursor']) {
      expect(baseFor(hidden).opacity, hidden).toBe('0')
    }
    expect(svg.querySelector('.tutorial-anim__tab--trees-2')).not.toBeNull()
    expect(baseFor('.tutorial-anim__tab--trees-2').opacity).toBe('0.45')
    // The copy is the other half of a card with nothing running.
    expect(find('tutorial-step-body').textContent).toBe(BODY)
  })

  it('switches every trees animation off under reduced motion, after its own rules; the cursor goes by the shared rule', () => {
    const media = CARD_CSS.slice(CARD_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.tutorial-anim--trees \*\s*\{\s*animation:\s*none;?\s*\}/)
    for (const [selector, body] of rulesOf(CARD_CSS.slice(0, CARD_CSS.indexOf('@media')))) {
      if (!/animation-name/.test(body)) continue
      for (const s of selector.split(',')) expect(s.trim(), s).toMatch(/^\.[a-z0-9_-]+$/i)
    }
    expect(decl(APP_CSS)).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
    expect(TREES_CSS).not.toMatch(/tutorial-anim__cursor\s*\{[^}]*display/)
  })
})

/* ===========================================================================
   9. The treatment
   =========================================================================== */

describe('9. the treatment', () => {
  it('runs on one period, 13s, every stop a percentage, no durations or delays of its own', () => {
    expect(propsOf(rulesOf(CARD_CSS).find(([s]) => s === '.tutorial-anim--trees')[1])['--loop']).toBe('13s')
    expect(TREES_CSS).not.toMatch(/animation-(duration|delay)/)
    expect(TREES_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)
    const keyframes = CARD_CSS.match(/@keyframes tutorial-trees[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThanOrEqual(15)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
  })

  it('names no colour: zero hex literals in the new CSS and the new modules', () => {
    expect(TREES_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(TREES_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const [, body] of rulesOf(TREES_CSS)) {
      for (const [prop, value] of Object.entries(propsOf(body))) {
        if (!/^(color|background|fill|stroke)$/.test(prop)) continue
        if (/^(none|transparent)$/.test(value)) continue
        expect(value, prop).toMatch(/^var\(--/)
      }
    }
    for (const file of ['farmScene.jsx', 'treesCard.jsx', 'stepCards.js']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('keeps oxide to the click pulse and the commit button, through the shared rules; --tree is the mark', async () => {
    expect(TREES_CSS).not.toMatch(/--oxide/)
    const handle = await mount(<TreesAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__pulse')).toHaveLength(1)
    expect(handle.container.querySelectorAll('.tutorial-anim__commit-button')).toHaveLength(1)
    expect(baseFor('.tutorial-anim__pulse').stroke).toBe('var(--oxide)')
    expect(baseFor('.tutorial-anim__commit-button rect').fill).toBe('var(--oxide)')
    expect(baseFor('.tutorial-anim__draw-button rect').fill).toBe('var(--paper)')
    const tree = rulesOf(TREES_CSS).filter(([, body]) => /--tree\b/.test(body)).map(([s]) => s)
    expect(tree).toEqual(['.farm-scene__tree-line'])
  })

  it('sets nothing in the data face: there are no measured values on this card', async () => {
    expect(TREES_CSS).not.toMatch(/--font-data/)
    const handle = await mount(<TreesAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__value')).toHaveLength(0)
  })

  it('keeps the tabs and buttons inside the frame, and apart', async () => {
    const handle = await mount(<TreesAnimation />)
    const boxes = [...handle.container.querySelectorAll('.tutorial-anim__tab-card, .tutorial-anim__draw-button rect, .tutorial-anim__commit-button rect')].map(
      (rect) => ['x', 'y', 'width', 'height'].map((a) => Number(rect.getAttribute(a)))
    )
    for (const [x, y, w, h] of boxes) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(400)
      expect(y + h).toBeLessThanOrEqual(300)
    }
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart = a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]
        expect(apart, `${a} / ${b}`).toBe(true)
      }
    }
  })

  it('gives each diagram its own pattern ids, so two on one page never cross', async () => {
    const handle = await mount(
      <>
        <TreesAnimation />
        <TreesAnimation />
      </>
    )
    const ids = [...handle.container.querySelectorAll('pattern')].map((p) => p.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })
})
