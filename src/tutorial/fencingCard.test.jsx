/**
 * fencingCard.test.jsx
 *
 * THE FENCING STEP'S CARD, and the fence layer it adds to the shared farm.
 *
 *   1. the fencing entry registers one card, and the shipped shell opens it
 *      on the generate press;
 *   2. the copy is the spec's, verbatim, its last sentence in weight -- and
 *      the recommendation is this card's alone;
 *   3. the diagram names what the real step names: its one button and its
 *      three tabs;
 *   4. THE FENCE LAYER: dashed, uncased, at the map's `fence` row;
 *   5. THE REVEAL PAINTS NOTHING OVER THE MAP: a mask per fence, no
 *      ground-coloured stroke anywhere on the layer, the visible dash static;
 *   6. THE PERIMETER IS NOT THE PARCEL: a hull inside it, apart from it;
 *   7. every step card and the orientation card render, on the same parcel;
 *   8. the timeline: fence, then tab, three times; the cursor off the frame
 *      until the commit; nothing unticked;
 *   9. with no motion, the card is a finished diagram;
 *  10. the treatment: one period, no colour literals, oxide only on the
 *      commit button.
 *
 * What only a real engine can answer -- the tokens resolving, the pixels
 * under a fence before it draws, nothing running under reduced motion, the
 * fit and the fence-to-boundary gap at 380px -- is in
 * fencingCard.browser.test.jsx.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { zoneMark } from '../ProductionHatchPattern.jsx'
import { COMMITTED, NOT_STARTED, SessionProvider, useSession } from '../session/SessionStore'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { FENCING_STEP, STEP_DEFINITIONS, registryProposalFeatures } from '../wizard/stepDefinitions'
import { REVIEWING } from '../wizard/useStepMachine'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { CARDS } from './cards.jsx'
import { FENCES, PARCEL, PARCEL_PATH, SCENE_VIEWBOX, SceneFences } from './farmScene.jsx'
import {
  BANNER,
  FENCING_BLOCKS,
  FENCING_CARD,
  FENCING_EMPHASIS,
  FENCING_LABELS,
  FENCING_TABS,
  FENCING_TREE_ZONES,
  FencingAnimation,
} from './fencingCard.jsx'
import { SEEN_KEY, resetTutorialPrefsForTests } from './prefs.js'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor, cardsOf } from './stepCards.js'
import { ORIENTATION_BODY, ORIENTATION_TITLE, OrientationCard } from './TutorialGate.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')

/** The spec's copy. A rewrite fails here. */
const TITLE = 'Fencing to protect committed features'
const BODY =
  'Fence lines around the workable perimeter, water areas, and tree zones. Recommended to commit all three types.'
const EMPHASIS = 'Recommended to commit all three types'

/** The spec's parcel, A to G. A card that moves a corner fails here. */
const SPEC_PARCEL = [
  ['A', 96, 66],
  ['B', 196, 48],
  ['C', 286, 72],
  ['D', 330, 148],
  ['E', 300, 232],
  ['F', 170, 250],
  ['G', 92, 186],
]

/** The backend's tab labels (fencing.py, FENCE_TYPE_LABELS), by wire key. */
const BACKEND_LABELS = {
  boundary: 'Boundary fencing',
  water_zone_exclusion: 'Water area fencing',
  tree_zone_exclusion: 'Tree zone fencing',
}

/**
 * THE TOKENS A GROUND IS PAINTED IN: the scene's stock, the field wash, the
 * chrome's paper, the rule, and the map's halo. A stroke in any of these on
 * the fence layer is the "slide a ground-coloured stroke away" reveal -- a
 * failure invisible on bare stock and a pale band over a hatch.
 */
const GROUND_TOKENS = ['--stock', '--field', '--paper', '--rule', '--halo', '--ground']

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

/** The fence layer this branch adds to the farm's section. */
const SCENE_CSS = decl(slice("/* --- The farm's fences", '/* --- 6. Landform'))
/** The fencing card's own section, to the end. */
const CARD_CSS = decl(slice('/* --- 10. Fencing'))
/** Every rule this branch adds to App.css. */
const FENCING_CSS = SCENE_CSS + CARD_CSS

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

/** One element's keyframes, off the fencing section: its stops, in order. */
function timelineFor(selector) {
  const name = baseFor(selector)['animation-name']
  expect(name, `${selector} is animated`).toBeTruthy()
  const start = CARD_CSS.indexOf(`@keyframes ${name} `)
  expect(start, `@keyframes ${name}`).toBeGreaterThan(-1)
  const block = CARD_CSS.slice(start).match(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/)[1]
  const stops = []
  for (const [selectors, body] of rulesOf(block)) {
    for (const stop of selectors.split(',')) stops.push({ at: parseFloat(stop), props: propsOf(body) })
  }
  stops.sort((a, b) => a.at - b.at)
  return { name, stops }
}

/** A property's value at `t` percent, linearly between stops, as the engine resolves it. */
function valueAt(selector, prop, t) {
  const { stops } = timelineFor(selector)
  const setting = stops.filter((s) => prop in s.props)
  const before = [...setting].reverse().find((s) => s.at <= t)
  const after = setting.find((s) => s.at > t)
  const num = (s) => parseFloat(s.props[prop])
  if (!before) return parseFloat(baseFor(selector)[prop] ?? '1')
  if (!after) return num(before)
  return num(before) + ((num(after) - num(before)) * (t - before.at)) / (after.at - before.at)
}

const SAMPLES = Array.from({ length: 1000 }, (_, i) => i / 10)

/* ===========================================================================
   Geometry helpers
   =========================================================================== */

/** A path's vertices: every coordinate pair its commands name, controls included. */
function pairsOf(d) {
  const numbers = d.match(/-?\d+(\.\d+)?/g).map(Number)
  const pairs = []
  for (let i = 0; i < numbers.length; i += 2) pairs.push([numbers[i], numbers[i + 1]])
  return pairs
}

function insideParcel([x, y]) {
  let inside = false
  for (let i = 0, j = PARCEL.length - 1; i < PARCEL.length; j = i++) {
    const { x: xi, y: yi } = PARCEL[i]
    const { x: xj, y: yj } = PARCEL[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance from a point to the parcel's nearest edge. */
function toParcel([x, y]) {
  let best = Infinity
  for (let i = 0; i < PARCEL.length; i++) {
    const a = PARCEL[i]
    const b = PARCEL[(i + 1) % PARCEL.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy))
  }
  return best
}

/** Points along a straight-edged ring, every unit or so. */
function alongRing(pairs) {
  const out = []
  for (let i = 0; i < pairs.length; i++) {
    const [ax, ay] = pairs[i]
    const [bx, by] = pairs[(i + 1) % pairs.length]
    const n = Math.ceil(Math.hypot(bx - ax, by - ay))
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
  }
  return out
}

function shoelace(pairs) {
  let sum = 0
  for (let i = 0; i < pairs.length; i++) {
    const [ax, ay] = pairs[i]
    const [bx, by] = pairs[(i + 1) % pairs.length]
    sum += ax * by - bx * ay
  }
  return Math.abs(sum) / 2
}

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

async function renderCard(card = FENCING_CARD) {
  const stage = document.createElement('div')
  document.body.appendChild(stage)
  return mount(<StepCard container={stage} card={card} auto onAutoChange={() => {}} onDismiss={() => {}} onClose={() => {}} />)
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

describe('1. the fencing entry registers one card', () => {
  it('is the registry entry for fencing, one card in the one-card shape, firing by the default rule', () => {
    const entry = cardFor(STEP_CARDS, 'fencing')
    expect(entry).toBe(FENCING_CARD)
    expect(STEP_CARDS.filter((e) => e.stepId === 'fencing')).toHaveLength(1)
    expect(entry.cards).toBeUndefined()
    expect(cardsOf(entry)).toEqual([FENCING_CARD])
    expect(entry.Animation).toBe(FencingAnimation)
    // No moment of its own: fencing generates, so the generate press.
    expect(entry.firesOn).toBeUndefined()
    // The last step, and the last card.
    expect(STEP_CARDS[STEP_CARDS.length - 1]).toBe(FENCING_CARD)
  })

  it('opens by itself on "Generate fencing", through the shipped shell and registry', async () => {
    window.localStorage.setItem(
      SEEN_KEY,
      JSON.stringify(['orientation', 'boundary', 'landform', 'water', 'roads', 'trees'])
    )
    const doc = serverDocument({
      landform: { status: COMMITTED },
      water: { status: COMMITTED },
      roads: { status: COMMITTED },
      trees: { status: COMMITTED },
      structures: { status: COMMITTED },
    })
    globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
      const url = new URL(rawUrl)
      if (url.pathname === '/api/steps') {
        return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
      }
      if (url.pathname.startsWith('/api/sessions/') && (init.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => doc }
      }
      if (url.pathname.endsWith('/steps/fencing/generate') && init.method === 'POST') {
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
    expect(cursor.cursorStepId).toBe('fencing')
    expect(find('tutorial-step-card')).toBeNull()
    await React.act(async () => find('generate-fencing').click())
    const card = find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('fencing')
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--fencing')).not.toBeNull()
    expect(find('tutorial-step-dots')).toBeNull()
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

describe('2. the copy', () => {
  it('says exactly the spec, its last sentence set in weight', async () => {
    expect(FENCING_CARD.title).toBe(TITLE)
    expect(FENCING_CARD.body).toBe(BODY)
    expect(FENCING_CARD.emphasis).toBe(EMPHASIS)
    expect(FENCING_EMPHASIS).toBe(EMPHASIS)
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    const body = find('tutorial-step-body')
    expect(body.textContent).toBe(BODY)
    const weight = body.querySelectorAll('strong, em, b')
    expect(weight).toHaveLength(1)
    expect(weight[0].textContent).toBe(EMPHASIS)
  })

  it('is the only card that recommends: no other card, step or deck, gives advice', () => {
    const every = [...STEP_CARDS.flatMap(cardsOf), ...CARDS]
    const advising = every.filter((card) => /recommend/i.test(`${card.title} ${card.body}`))
    expect(advising).toEqual([FENCING_CARD])
  })
})

/* ===========================================================================
   3. What the real step names
   =========================================================================== */

describe('3. the button and the tabs are the real step', () => {
  it("draws the one button FENCING_STEP's reviewing state offers, under its committable label", async () => {
    expect(FENCING_STEP.tools).toEqual(['select'])
    expect(FENCING_STEP.buttons[REVIEWING].map((b) => b.key)).toEqual(['commit'])
    expect(FENCING_STEP.commit.label({ committableCount: 3 })).toBe(FENCING_LABELS.commit)
    expect(FENCING_LABELS.commit).toBe('Commit fencing')
    const handle = await mount(<FencingAnimation />)
    const svg = handle.container.querySelector('svg')
    expect([...svg.querySelectorAll('.tutorial-anim__commit-button text')].map((t) => t.textContent)).toEqual([
      'Commit fencing',
    ])
    // NO GESTURE: nothing to draw, nothing to delete, no click on the map.
    expect(svg.querySelectorAll('.tutorial-anim__draw-button')).toHaveLength(0)
    expect(svg.querySelectorAll('.tutorial-anim__pulse')).toHaveLength(0)
    expect(svg.querySelectorAll('.tutorial-anim__corner, .tutorial-anim__segment')).toHaveLength(0)
  })

  it("tabs the three types by the names FENCING_STEP's tabs carry from the backend, in its order", async () => {
    const proposals = {
      fence_types: Object.entries(BACKEND_LABELS).map(([fence_type, label]) => ({
        fence_type,
        label,
        generated: true,
        candidate: true,
        total_length_ft: 1000,
        feature_ids: [`${fence_type}-1`],
      })),
    }
    const real = FENCING_STEP.tabs({ proposals, draft: { selectedFeatureIds: [] } }).map((tab) => tab.name)
    expect(FENCING_TABS.map((tab) => tab.name)).toEqual(real)
    expect(real).toEqual(['Boundary fencing', 'Water area fencing', 'Tree zone fencing'])
    const handle = await mount(<FencingAnimation />)
    const tabs = [...handle.container.querySelectorAll('.tutorial-anim__tab')]
    expect(tabs.map((tab) => tab.querySelector('text').textContent)).toEqual(real)
    // EACH TAB IS ITS FENCE'S: the same id, in the same order.
    expect(tabs.map((tab) => tab.dataset.fence)).toEqual(FENCES.map((fence) => fence.id))
    expect(FENCES.map((fence) => fence.fenceType)).toEqual(Object.keys(BACKEND_LABELS))
  })

  it('keeps the tabs and the button inside the frame, and apart', () => {
    for (const { x, width } of FENCING_TABS) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + width).toBeLessThanOrEqual(400)
    }
    for (let i = 1; i < FENCING_TABS.length; i++) {
      expect(FENCING_TABS[i].x).toBeGreaterThan(FENCING_TABS[i - 1].x + FENCING_TABS[i - 1].width)
    }
    expect(BANNER.commit.x + BANNER.commit.width).toBeLessThanOrEqual(400)
    expect(BANNER.y + BANNER.height).toBeLessThan(262)
  })
})

/* ===========================================================================
   4. The fence layer
   =========================================================================== */

describe('4. the fence layer is the map’s fence mark: dashed, uncased', () => {
  it('draws the mark row’s weight and dash, in the row’s own token, with no casing', () => {
    const mark = zoneMark('fence')
    expect(mark.kind).toBe('line')
    const line = baseFor('.farm-scene__fence')
    expect(line.stroke).toBe('var(--fence)')
    expect(Number(line['stroke-width'])).toBe(mark.weight)
    expect(line['stroke-dasharray'].split(/[\s,]+/)).toEqual(mark.dash.split(','))
    expect(line.fill).toBe('none')
    // NO CASING, and nothing in the layer's CSS that would draw one.
    expect(SCENE_CSS).not.toMatch(/casing|--halo/)
    expect(SCENE_CSS).not.toMatch(/animation|@keyframes/)
  })

  it('renders one path per fence and nothing else painted: no casing pass, no second line', async () => {
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <SceneFences />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="fences"]')
    expect(layer.classList.contains('farm-scene__layer')).toBe(true)
    const painted = [...layer.querySelectorAll('*')].filter((el) => !el.closest('defs'))
    expect(painted.map((el) => el.getAttribute('class'))).toEqual(['farm-scene__fence', 'farm-scene__fence', 'farm-scene__fence'])
    expect(painted.map((el) => el.dataset.fence)).toEqual(['boundary', 'water', 'tree'])
    for (const path_ of painted) {
      expect(path_.dataset.treatment).toBe('fence')
      expect(path_.dataset.mark).toBe('line')
      expect(path_.hasAttribute('mask')).toBe(false)
    }
    expect(FENCES.every((fence) => fence.treatment === 'fence' && fence.mark === 'line')).toBe(true)
  })

  it('in the card, draws the three fences over the whole settled design', async () => {
    const handle = await mount(<FencingAnimation />)
    const svg = handle.container.querySelector('svg')
    const layers = [...svg.querySelectorAll('[data-layer]')].map((el) => el.dataset.layer)
    // Every commitment so far, settled, in the order it was decided; then the fences over them.
    const settled = ['blocks', 'survey-embankment', 'tracks', 'access-points', 'tree-zones']
    for (const id of settled) {
      expect(svg.querySelector(`[data-layer="${id}"]`).classList.contains('farm-scene__layer--settled'), id).toBe(true)
    }
    expect(layers.indexOf('fences')).toBeGreaterThan(Math.max(...settled.map((id) => layers.indexOf(id))))
    expect(layers.indexOf('fences')).toBe(layers.length - 1)
    expect([...svg.querySelectorAll('[data-layer="blocks"] [data-block]')].map((b) => b.dataset.block)).toEqual(
      FENCING_BLOCKS.map((b) => b.id)
    )
    expect([...svg.querySelectorAll('[data-layer="tree-zones"] [data-zone]')].map((z) => z.dataset.zone)).toEqual(
      FENCING_TREE_ZONES.map((z) => z.id)
    )
    expect(FENCING_TREE_ZONES.map((z) => z.id)).toEqual(['1', 'drawn-1'])
    expect(svg.querySelectorAll('[data-layer="fences"] .farm-scene__fence')).toHaveLength(3)
  })
})

/* ===========================================================================
   5. The reveal paints nothing
   =========================================================================== */

describe('5. the reveal paints nothing over the map', () => {
  it('draws each fence through a mask of its own, and every painted element on the layer is a fence line', async () => {
    const handle = await mount(<FencingAnimation />)
    const layer = handle.container.querySelector('[data-layer="fences"]')
    const masks = [...layer.querySelectorAll('mask')]
    expect(masks).toHaveLength(3)
    const fences = [...layer.querySelectorAll('.farm-scene__fence')]
    for (const [i, fence] of fences.entries()) {
      const id = fence.getAttribute('mask').match(/^url\(#(.+)\)$/)[1]
      const mask = layer.querySelector(`mask[id="${id}"]`)
      expect(mask, fence.dataset.fence).not.toBeNull()
      expect(mask).toBe(masks[i])
      // The mask's one stroke runs the fence's own path, normalised.
      const reveal = mask.querySelector('path')
      expect(reveal.getAttribute('d')).toBe(fence.getAttribute('d'))
      expect(reveal.getAttribute('pathLength')).toBe('1')
      expect(reveal.classList.contains('farm-scene__fence-reveal')).toBe(true)
      expect(reveal.classList.contains(`tutorial-anim__fence-reveal--${fence.dataset.fence}`)).toBe(true)
    }
    // OUTSIDE THE MASKS, ONLY THE THREE LINES: nothing laid over them, under them or beside them.
    const painted = [...layer.querySelectorAll('*')].filter((el) => !el.closest('mask') && el.tagName !== 'defs')
    expect(painted.every((el) => el.classList.contains('farm-scene__fence'))).toBe(true)
    expect(painted).toHaveLength(3)
  })

  it('has no ground-coloured stroke on the fence layer: every paint it names is the fence token', () => {
    const classes = ['.farm-scene__fence', '.farm-scene__fence-reveal', '.farm-scene__fence-mask']
    for (const selector of classes) {
      const rule = baseFor(selector)
      for (const prop of ['stroke', 'fill', 'color']) {
        if (!(prop in rule)) continue
        expect(`${selector} ${prop}: ${rule[prop]}`).toMatch(/: (none|var\(--fence\))$/)
      }
    }
    for (const token of GROUND_TOKENS) expect(FENCING_CSS, token).not.toContain(`var(${token})`)
    // An alpha mask: the reveal's colour is only its coverage, never a paint.
    expect(baseFor('.farm-scene__fence-mask')['mask-type']).toBe('alpha')
    // Nothing in the card's section restyles a fence line's paint either.
    for (const [selector, body] of rulesOf(CARD_CSS)) {
      if (!/fence/.test(selector)) continue
      expect(propsOf(body), selector).not.toHaveProperty('stroke')
      expect(propsOf(body), selector).not.toHaveProperty('fill')
    }
  })

  it('reveals by the mask’s dash offset; the visible line’s dash never moves', () => {
    const reveal = baseFor('.farm-scene__fence-reveal')
    expect(reveal['stroke-dasharray']).toBe('1')
    expect(reveal['stroke-dashoffset']).toBe('0')
    // Wide enough to clear the dashed line and its round caps.
    expect(Number(reveal['stroke-width'])).toBeGreaterThanOrEqual(4 * Number(baseFor('.farm-scene__fence')['stroke-width']))
    // THE ONLY ANIMATED DASH OFFSETS ARE THE MASKS'.
    const keyframes = CARD_CSS.match(/@keyframes tutorial-fencing[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    const offsetNames = keyframes.filter((k) => /stroke-dashoffset/.test(k)).map((k) => k.match(/@keyframes (\S+)/)[1])
    expect(offsetNames.sort()).toEqual([
      'tutorial-fencing-reveal-boundary',
      'tutorial-fencing-reveal-tree',
      'tutorial-fencing-reveal-water',
    ])
    for (const fence of ['boundary', 'water', 'tree']) {
      expect(baseFor(`.tutorial-anim__fence-reveal--${fence}`)['animation-name']).toBe(`tutorial-fencing-reveal-${fence}`)
      expect(baseFor(`.tutorial-anim__fence--${fence}`)['animation-name']).toBeUndefined()
    }
    expect(FENCING_CSS).not.toMatch(/stroke-dasharray\s*:[^;]*;[^}]*animation/)
    expect(baseFor('.farm-scene__fence')['stroke-dashoffset']).toBeUndefined()
  })
})

/* ===========================================================================
   6. The perimeter is not the parcel
   =========================================================================== */

describe('6. the perimeter fence is a hull inside the parcel, not the parcel', () => {
  const perimeter = FENCES.find((fence) => fence.id === 'boundary')
  const vertices = pairsOf(perimeter.d)

  it('is its own geometry: not the parcel path, and none of its corners is a parcel corner', () => {
    expect(PARCEL.map(({ id, x, y }) => [id, x, y])).toEqual(SPEC_PARCEL)
    expect(perimeter.d).not.toBe(PARCEL_PATH)
    expect(perimeter.d).not.toContain(PARCEL_PATH.slice(2, 12))
    for (const [x, y] of vertices) {
      for (const corner of PARCEL) expect(Math.hypot(x - corner.x, y - corner.y), `${x},${y} vs ${corner.id}`).toBeGreaterThan(4)
    }
    expect(vertices.length).not.toBe(PARCEL.length)
  })

  it('lies wholly inside the parcel, apart from its edge everywhere, and well inside on the south and east', () => {
    const ring = alongRing(vertices)
    for (const p of ring) {
      expect(insideParcel(p), `${p} is inside the parcel`).toBe(true)
      // THE GAP THAT MUST READ AT 380px: never closer than 4 units anywhere.
      expect(toParcel(p), `${p} clears the parcel edge`).toBeGreaterThanOrEqual(4)
    }
    // SOUTH AND EAST, the distinction the card teaches: open ground between
    // fence and property line, not a fence along it.
    const southEast = vertices.filter(([x, y]) => y > 150 || x > 250)
    expect(southEast.length).toBeGreaterThanOrEqual(4)
    const clearances = southEast.map(toParcel)
    expect(Math.max(...clearances)).toBeGreaterThan(30)
    expect(clearances.filter((c) => c > 20).length).toBeGreaterThanOrEqual(3)
    // AND IT ENCLOSES MUCH LESS THAN THE PARCEL: a hull of what is committed.
    const parcelArea = shoelace(PARCEL.map(({ x, y }) => [x, y]))
    expect(shoelace(vertices) / parcelArea).toBeLessThan(0.7)
  })

  it('keeps the spec’s south and east verbatim; only the north was pulled in off the boundary', () => {
    expect(perimeter.d).toContain('L 302 108 L 226 174 L 198 196 L 170 212 L 130 194 L 106 112 Z')
  })

  it('draws the water and tree fences on the spec’s geometry', () => {
    expect(FENCES.find((fence) => fence.id === 'water').d).toBe(
      'M 130 168 C 146 152, 182 154, 194 170 C 206 186, 196 208, 172 212 C 148 216, 128 204, 126 188 C 125 178, 126 172, 130 168 Z'
    )
    expect(FENCES.find((fence) => fence.id === 'tree').d).toBe(
      'M 210 70 C 240 60, 276 71, 296 89 C 310 101, 300 120, 278 122 C 255 125, 236 116, 220 109 C 204 102, 200 82, 210 70 Z'
    )
  })
})

/* ===========================================================================
   7. Every card, on the same parcel
   =========================================================================== */

describe('7. every step card and the orientation card render, on the same parcel', () => {
  it('renders all six step entries’ cards, each drawing the parcel at the spec’s coordinates', async () => {
    expect(STEP_CARDS.map((entry) => entry.stepId)).toEqual(['boundary', 'landform', 'water', 'roads', 'trees', 'fencing'])
    const cards = STEP_CARDS.flatMap(cardsOf)
    expect(cards).toHaveLength(7)
    for (const card of cards) {
      const handle = await renderCard(card)
      expect(find('tutorial-step-title').textContent, card.title).toBe(card.title)
      expect(find('tutorial-step-body').textContent, card.title).toBe(card.body)
      const svg = find('tutorial-step-figure').querySelector('svg')
      expect(svg.getAttribute('viewBox'), card.title).toBe(SCENE_VIEWBOX)
      // THE PARCEL: the settled ring, or on boundary the wash under the traced ring.
      const ring = svg.querySelector('.farm-scene__parcel, .tutorial-anim__wash')
      expect(ring, card.title).not.toBeNull()
      expect(ring.getAttribute('d'), card.title).toBe(PARCEL_PATH)
      await handle.unmount()
      document.body.innerHTML = ''
    }
    expect(PARCEL_PATH).toBe(`M ${SPEC_PARCEL.map(([, x, y]) => `${x} ${y}`).join(' L ')} Z`)
  })

  it('renders the orientation card with its copy and its figure', async () => {
    await mount(<OrientationCard onStart={() => {}} />)
    expect(find('tutorial-orientation-title').textContent).toBe(ORIENTATION_TITLE)
    expect([...document.querySelectorAll('[data-testid="tutorial-orientation-body"]')].map((p) => p.textContent)).toEqual([
      ...ORIENTATION_BODY,
    ])
    expect(find('tutorial-orientation-figure').querySelector('svg.tutorial-anim')).not.toBeNull()
  })
})

/* ===========================================================================
   8. The timeline
   =========================================================================== */

describe('8. the timeline', () => {
  const FENCE_IDS = ['boundary', 'water', 'tree']
  const reveal = (id) => `.tutorial-anim__fence-reveal--${id}`
  const tab = (id) => `.tutorial-anim__tab--fencing-${id}`

  it('opens bare: no fence uncovered and no tab, with the settled design already there', () => {
    for (const id of FENCE_IDS) {
      expect(valueAt(reveal(id), 'stroke-dashoffset', 0)).toBe(1)
      expect(valueAt(tab(id), 'opacity', 0)).toBe(0)
    }
    for (const selector of ['.farm-scene__layer--settled', '.farm-scene__parcel']) {
      expect(baseFor(selector)['animation-name'], selector).toBeUndefined()
    }
  })

  it('draws the fences in turn -- perimeter, water, tree -- each tab landing as its fence closes', () => {
    const drawn = (id) => SAMPLES.find((t) => valueAt(reveal(id), 'stroke-dashoffset', t) === 0)
    const started = (id) => SAMPLES.find((t) => valueAt(reveal(id), 'stroke-dashoffset', t) < 1)
    const shown = (id) => SAMPLES.find((t) => valueAt(tab(id), 'opacity', t) >= 1)
    for (let i = 0; i < FENCE_IDS.length; i++) {
      const id = FENCE_IDS[i]
      expect(started(id), id).toBeLessThan(drawn(id))
      // Its tab arrives as it closes, not before it starts.
      expect(shown(id), id).toBeGreaterThanOrEqual(drawn(id))
      expect(shown(id) - drawn(id), id).toBeLessThanOrEqual(4)
      if (i > 0) expect(started(id), id).toBeGreaterThan(shown(FENCE_IDS[i - 1]))
    }
  })

  it('never un-draws a fence: once its offset reaches 0 it stays there to the end of the loop', () => {
    for (const id of FENCE_IDS) {
      const at = SAMPLES.find((t) => valueAt(reveal(id), 'stroke-dashoffset', t) === 0)
      for (const t of SAMPLES.filter((s) => s >= at)) expect(valueAt(reveal(id), 'stroke-dashoffset', t), `${id} at ${t}`).toBe(0)
      for (let i = 1; i < SAMPLES.length; i++) {
        expect(valueAt(reveal(id), 'stroke-dashoffset', SAMPLES[i])).toBeLessThanOrEqual(
          valueAt(reveal(id), 'stroke-dashoffset', SAMPLES[i - 1])
        )
      }
    }
  })

  it('keeps the cursor off the frame until every fence is in, then presses Commit fencing', () => {
    const lastTab = SAMPLES.find((t) => valueAt(tab('tree'), 'opacity', t) >= 1)
    const cursor = '.tutorial-anim__cursor--fencing'
    for (const t of SAMPLES.filter((s) => s <= lastTab)) expect(valueAt(cursor, 'opacity', t), `cursor at ${t}`).toBe(0)
    // THE PRESS lands on the commit button, while the cursor is on it.
    const { stops } = timelineFor('.tutorial-anim__pointer--fencing')
    const pressed = stops.filter((s) => s.props.transform === 'scale(0.82)').map((s) => s.at)
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toBeGreaterThan(lastTab)
    const on = timelineFor(cursor).stops.filter((s) => /translate\(340px, 236px\)/.test(s.props.transform ?? ''))
    expect(on.map((s) => s.at)).toEqual([84, 90])
    expect(pressed[0]).toBeGreaterThan(84)
    expect(pressed[0]).toBeLessThan(90)
    const { commit } = BANNER
    expect(340).toBeGreaterThan(commit.x)
    expect(340).toBeLessThan(commit.x + commit.width)
    expect(236).toBeGreaterThan(BANNER.y)
    expect(236).toBeLessThan(BANNER.y + BANNER.height)
    // And before the press, off the frame: not a pointer drifting through the reveals.
    const first = timelineFor(cursor).stops[0]
    expect(first.props.transform).toMatch(/translate\((4\d\d)px, (\d+)px\)/)
    const [, x] = first.props.transform.match(/translate\((\d+)px/)
    expect(Number(x)).toBeGreaterThanOrEqual(400)
  })

  it('unticks nothing: every tab carries its tick, and no keyframe takes one away', async () => {
    const handle = await mount(<FencingAnimation />)
    for (const t of handle.container.querySelectorAll('.tutorial-anim__tab')) {
      expect(t.querySelector('.tutorial-anim__tick'), t.dataset.fence).not.toBeNull()
    }
    expect(CARD_CSS).not.toMatch(/tick/)
  })
})

/* ===========================================================================
   9. Reduced motion
   =========================================================================== */

describe('9. with no motion, the card is a finished diagram', () => {
  it('rests with all three fences drawn, all three tabs present and ticked, the cursor hidden', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg.tutorial-anim--fencing')
    // The resting frame is the markup under the base rules.
    expect(baseFor('.farm-scene__fence-reveal')['stroke-dashoffset']).toBe('0')
    for (const id of ['boundary', 'water', 'tree']) {
      expect(baseFor(`.tutorial-anim__tab--fencing-${id}`).opacity, id).toBeUndefined()
      expect(baseFor(`.tutorial-anim__fence--${id}`).opacity, id).toBeUndefined()
      expect(svg.querySelector(`.tutorial-anim__tab--fencing-${id} .tutorial-anim__tick`), id).not.toBeNull()
    }
    expect(baseFor('.tutorial-anim__fences').opacity).toBeUndefined()
    expect(svg.querySelectorAll('.farm-scene__fence')).toHaveLength(3)
    expect(baseFor('.tutorial-anim__cursor').opacity).toBe('0')
    // The copy is the other half of a card with nothing running.
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-body').textContent).toBe(BODY)
  })

  it('switches every fencing animation off under reduced motion, after its own rules; the cursor goes by the shared rule', () => {
    const media = CARD_CSS.slice(CARD_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.tutorial-anim--fencing \*\s*\{\s*animation:\s*none;?\s*\}/)
    for (const [selector, body] of rulesOf(CARD_CSS.slice(0, CARD_CSS.indexOf('@media')))) {
      if (!/animation-name/.test(body)) continue
      for (const s of selector.split(',')) expect(s.trim(), s).toMatch(/^\.[a-z0-9_-]+$/i)
    }
    expect(decl(APP_CSS)).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
    expect(FENCING_CSS).not.toMatch(/tutorial-anim__cursor\s*\{[^}]*display/)
  })
})

/* ===========================================================================
   10. The treatment
   =========================================================================== */

describe('10. the treatment', () => {
  it('runs on one period, 12s, every stop a percentage, no durations or delays of its own', () => {
    expect(propsOf(rulesOf(CARD_CSS).find(([s]) => s === '.tutorial-anim--fencing')[1])['--loop']).toBe('12s')
    expect(FENCING_CSS).not.toMatch(/animation-(duration|delay)/)
    expect(FENCING_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)
    const keyframes = CARD_CSS.match(/@keyframes tutorial-fencing[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThanOrEqual(10)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
    // The scene's module carries no timeline.
    expect(readFileSync(path.join(HERE, 'farmScene.jsx'), 'utf8')).not.toMatch(/animation|keyframes|tutorial-anim__/)
  })

  it('names no colour: zero hex literals in the new CSS and the new modules', () => {
    expect(FENCING_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(FENCING_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const [, body] of rulesOf(FENCING_CSS)) {
      for (const [prop, value] of Object.entries(propsOf(body))) {
        if (!/^(color|background|fill|stroke)$/.test(prop)) continue
        if (/^(none|transparent)$/.test(value)) continue
        expect(value, prop).toMatch(/^var\(--/)
      }
    }
    for (const file of ['farmScene.jsx', 'fencingCard.jsx', 'stepCards.js']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('keeps oxide to the commit button, through the shared rule; the fence is ink and no accent', async () => {
    expect(FENCING_CSS).not.toMatch(/--oxide/)
    const handle = await mount(<FencingAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__commit-button')).toHaveLength(1)
    expect(baseFor('.tutorial-anim__commit-button rect').fill).toBe('var(--oxide)')
    expect(handle.container.querySelectorAll('.tutorial-anim__pulse')).toHaveLength(0)
    const tokens = readFileSync(path.join(HERE, '..', 'index.css'), 'utf8')
    expect(tokens).toMatch(/^\s*--fence:\s*var\(--ink\);/m)
  })

  it('sets nothing in the data face: there are no measured values on this card', async () => {
    expect(FENCING_CSS).not.toMatch(/--font-data/)
    const handle = await mount(<FencingAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__value')).toHaveLength(0)
  })
})
