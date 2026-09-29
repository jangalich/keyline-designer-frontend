/**
 * waterCard.test.jsx
 *
 * THE WATER STEP'S CARD, and what it added to the shared farm.
 *
 *   1. the water entry registers one card, and the shipped shell opens it on
 *      arrival at water;
 *   2. the copy is the spec's, verbatim, its second sentence in weight;
 *   3. the two survey marks are two KINDS -- a tint and a dot field -- each
 *      on its own token, as the map's zoneMark() has them;
 *   4. the blocks are settled context here, Block 1 only, and the landform
 *      cards still draw the active treatment;
 *   5. the boundary and landform cards are unchanged on the same parcel;
 *   6. with no motion, the card is a finished diagram;
 *   7. the treatment: one period, no colour literals, the data face on the
 *      figures, oxide only on the pulse and the commit, no running total.
 *
 * What only a real engine can answer -- the tokens resolving, nothing
 * running under reduced motion, the fit at 380px -- is in
 * waterCard.browser.test.jsx.
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
import { STEP_DEFINITIONS, WATER_STEP, registryProposalFeatures } from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import { BoundaryAnimation } from './boundaryCard.jsx'
import {
  PARCEL,
  PARCEL_PATH,
  SCENE_VIEWBOX,
  STIPPLE_PITCH,
  SUGGESTED_BLOCKS,
  SURVEY_AREAS,
  SceneSurveyEmbankment,
  SceneSurveyExcavated,
  SurveyStipple,
} from './farmScene.jsx'
import { LandformReadAnimation, LandformSetAnimation } from './landformCards.jsx'
import { SEEN_KEY, resetTutorialPrefsForTests } from './prefs.js'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor, cardsOf } from './stepCards.js'
import {
  EMBANKMENT_CLICK,
  WATER_CARD,
  WATER_COMMIT_LABEL,
  WATER_READINGS,
  WaterAnimation,
} from './waterCard.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')

/** The spec's copy. A rewrite fails here. */
const TITLE = 'Two kinds of water survey areas'
const EMPHASIS = 'These can overlap and can be committed together or alone.'
const BODY =
  'A solid tint marks ground suited to an embankment pond; a dot field marks ground suited to an excavated one. ' +
  EMPHASIS

/** The spec's two survey areas. */
const EMBANKMENT_D =
  'M 138 172 C 152 160, 178 162, 188 174 C 198 185, 191 201, 172 205 C 152 209, 136 200, 133 187 C 131 179, 132 175, 138 172 Z'
const EXCAVATED_D =
  'M 172 156 C 188 146, 212 150, 220 164 C 228 178, 219 192, 200 195 C 181 198, 167 188, 164 175 C 162 166, 166 159, 172 156 Z'

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

/** The survey marks this branch adds to the farm's section. */
const SURVEY_CSS = decl(slice("/* --- The farm's survey areas", '/* --- 6. Landform'))
/** The water card's own section, to the end. */
const CARD_CSS = decl(slice('/* --- 7. Water'))
/** Every line this branch adds to App.css. */
const WATER_CSS = SURVEY_CSS + CARD_CSS

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

/** Every base declaration for a selector in the whole stylesheet, merged in order, outside @media. */
function baseFor(selector) {
  const out = {}
  const css = decl(APP_CSS).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')
  for (const [s, body] of rulesOf(css)) {
    if (s.split(',').map((x) => x.trim()).includes(selector)) Object.assign(out, propsOf(body))
  }
  return out
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

async function renderCard() {
  const stage = document.createElement('div')
  document.body.appendChild(stage)
  return mount(
    <StepCard container={stage} card={WATER_CARD} auto onAutoChange={() => {}} onDismiss={() => {}} onClose={() => {}} />
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

describe('1. the water entry registers one card', () => {
  it('is the registry entry for water, one card in the one-card shape', () => {
    const entry = cardFor(STEP_CARDS, 'water')
    expect(entry).toBe(WATER_CARD)
    expect(STEP_CARDS.filter((e) => e.stepId === 'water')).toHaveLength(1)
    expect(entry.cards).toBeUndefined()
    expect(cardsOf(entry)).toEqual([WATER_CARD])
    expect(entry.Animation).toBe(WaterAnimation)
  })

  it('opens by itself on the water generate press, not on arrival, through the shipped shell and registry', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(['orientation', 'boundary', 'landform']))
    const doc = serverDocument({ landform: { status: COMMITTED } })
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
      if (url.pathname.endsWith(`/steps/water/generate`) && init.method === 'POST') {
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
    expect(cursor.cursorStepId).toBe('water')
    // Arrived: nothing, until the generate is pressed.
    expect(find('tutorial-step-card')).toBeNull()
    await React.act(async () => find('generate-water').click())
    const card = find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('water')
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--water')).not.toBeNull()
    // One card: no pager dots.
    expect(find('tutorial-step-dots')).toBeNull()
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

describe('2. the copy', () => {
  it('says exactly the spec, its second sentence set in weight', async () => {
    expect(WATER_CARD.title).toBe(TITLE)
    expect(WATER_CARD.body).toBe(BODY)
    expect(WATER_CARD.emphasis).toBe(EMPHASIS)
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    const body = find('tutorial-step-body')
    expect(body.textContent).toBe(BODY)
    const strong = body.querySelectorAll('strong.tutorial__em')
    expect(strong).toHaveLength(1)
    expect(strong[0].textContent).toBe(EMPHASIS)
  })

  it("names what the real step names: its tabs, its panel's first two rows, its commit button", async () => {
    const handle = await mount(<WaterAnimation />)
    const tabs = [...handle.container.querySelectorAll('.tutorial-anim__tab .tutorial-anim__name')].map((t) => t.textContent)
    expect(tabs).toEqual(['Embankment 1', 'Excavated 1'])
    const rows = [...handle.container.querySelectorAll('.tutorial-anim__panel--water .tutorial-anim__reading')].map((r) =>
      [...r.children].map((c) => c.textContent)
    )
    expect(rows).toEqual([
      ['2.1', 'survey acres'],
      ['57', '/100 score'],
    ])
    expect(WATER_READINGS.map((r) => r.label)).toEqual(['survey acres', '/100 score'])
    expect(handle.container.querySelector('.tutorial-anim__commit-label').textContent).toBe(WATER_COMMIT_LABEL)
    // The step's own label with areas ticked, not a paraphrase of it.
    expect(WATER_STEP.commit.label({ committableCount: 1 })).toBe(WATER_COMMIT_LABEL)
  })
})

/* ===========================================================================
   3. The survey marks
   =========================================================================== */

describe('3. two kinds of mark, each on its own token', () => {
  it('holds both areas to the spec, overlapping', () => {
    expect(SURVEY_AREAS.embankment.d).toBe(EMBANKMENT_D)
    expect(SURVEY_AREAS.excavated.d).toBe(EXCAVATED_D)
  })

  it("draws each as the map's zoneMark() does: embankment a tint, excavated a stipple", () => {
    expect(SURVEY_AREAS.embankment.mark).toBe(zoneMark(SURVEY_AREAS.embankment.treatment).kind)
    expect(SURVEY_AREAS.excavated.mark).toBe(zoneMark(SURVEY_AREAS.excavated.treatment).kind)
    expect(SURVEY_AREAS.embankment.mark).toBe('tint')
    expect(SURVEY_AREAS.excavated.mark).toBe('stipple')
  })

  it('renders embankment as a flat tint: a fill in its token, no pattern, outlined in the same', async () => {
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <SceneSurveyEmbankment />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="survey-embankment"]')
    const shape = layer.querySelector('path')
    expect(shape.dataset.mark).toBe('tint')
    expect(shape.getAttribute('d')).toBe(EMBANKMENT_D)
    expect(shape.style.getPropertyValue('--farm-stipple')).toBe('')
    expect(layer.querySelector('pattern')).toBeNull()
    const rule = baseFor('.farm-scene__survey--embankment')
    expect(rule.fill).toBe('var(--survey-embankment)')
    expect(rule.stroke).toBe('var(--survey-embankment)')
    expect(Number(rule['fill-opacity'])).toBeLessThan(1)
  })

  it('renders excavated as a dot field: a pattern of dots in its token, outlined in the same, no casing', async () => {
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <defs>
          <SurveyStipple id="s1" />
        </defs>
        <SceneSurveyExcavated stipple="s1" />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="survey-excavated"]')
    const shape = layer.querySelector('path')
    expect(shape.dataset.mark).toBe('stipple')
    expect(shape.getAttribute('d')).toBe(EXCAVATED_D)
    expect(shape.style.getPropertyValue('--farm-stipple')).toBe('url(#s1)')
    expect(baseFor('.farm-scene__survey--excavated').fill).toBe('var(--farm-stipple)')
    expect(baseFor('.farm-scene__survey--excavated').stroke).toBe('var(--survey-excavated)')

    const pattern = handle.container.querySelector('pattern#s1')
    expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse')
    expect(pattern.getAttribute('width')).toBe(String(STIPPLE_PITCH))
    const dots = [...pattern.children]
    // One dot per tile: a regular lattice, and nothing else -- no ring.
    expect(dots.map((d) => d.tagName.toLowerCase())).toEqual(['circle'])
    expect(dots[0].getAttribute('class')).toBe('farm-scene__stipple-dot')
    for (const attr of ['fill', 'stroke', 'style']) expect(dots[0].hasAttribute(attr), attr).toBe(false)
    expect(baseFor('.farm-scene__stipple-dot').fill).toBe('var(--survey-excavated)')
    expect(baseFor('.farm-scene__stipple-dot').stroke).toBe('none')
  })

  it('would fail if the two became one kind: different fills, different tokens', () => {
    const tint = baseFor('.farm-scene__survey--embankment')
    const field = baseFor('.farm-scene__survey--excavated')
    // One is filled with a colour, the other with a pattern.
    expect(tint.fill).toMatch(/^var\(--survey-/)
    expect(field.fill).not.toMatch(/^var\(--survey-/)
    expect(tint.fill).not.toBe(field.fill)
    expect(tint.stroke).not.toBe(field.stroke)
    expect(SURVEY_AREAS.embankment.mark).not.toBe(SURVEY_AREAS.excavated.mark)
  })

  it('draws the dot field beneath the tint, so the wash reads through where they overlap', async () => {
    const handle = await mount(<WaterAnimation />)
    const layers = [...handle.container.querySelectorAll('[data-layer]')].map((l) => l.dataset.layer)
    expect(layers.indexOf('survey-excavated')).toBeLessThan(layers.indexOf('survey-embankment'))
    expect(layers.indexOf('blocks')).toBeLessThan(layers.indexOf('survey-excavated'))
  })

  it('clicks the embankment area where the dot field is not', () => {
    // Inside the embankment area's box and outside the excavated area's.
    const box = (d) => {
      const n = d.match(/-?\d+(\.\d+)?/g).map(Number)
      const xs = n.filter((_, i) => i % 2 === 0)
      const ys = n.filter((_, i) => i % 2 === 1)
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
    }
    const emb = box(EMBANKMENT_D)
    const exc = box(EXCAVATED_D)
    const { x, y } = EMBANKMENT_CLICK
    expect(x > emb.x0 && x < emb.x1 && y > emb.y0 && y < emb.y1).toBe(true)
    expect(x < exc.x0).toBe(true)
    // And the two boxes overlap, which is the card's point.
    expect(emb.x1 > exc.x0 && exc.y1 > emb.y0).toBe(true)
  })
})

/* ===========================================================================
   4. Blocks, settled
   =========================================================================== */

describe('4. the settled-context variant', () => {
  it('draws Block 1 alone, on the settled tone, which quietens it and takes it out of reach', async () => {
    const handle = await mount(<WaterAnimation />)
    const layer = handle.container.querySelector('[data-layer="blocks"]')
    expect(layer.classList.contains('farm-scene__layer--settled')).toBe(true)
    const blocks = [...layer.querySelectorAll('.farm-scene__block')]
    expect(blocks.map((b) => b.dataset.block)).toEqual(['1'])
    expect(blocks[0].querySelector('.farm-scene__block-hatch').getAttribute('d')).toBe(SUGGESTED_BLOCKS[0].d)
    const settled = baseFor('.farm-scene__layer--settled')
    expect(Number(settled.opacity)).toBeLessThan(1)
    expect(settled['pointer-events']).toBe('none')
  })

  it('leaves the landform cards on the active treatment: all three blocks, no settled tone', async () => {
    const handle = await mount(
      <>
        <LandformReadAnimation />
        <LandformSetAnimation />
      </>
    )
    const layers = [...handle.container.querySelectorAll('[data-layer="blocks"]')]
    expect(layers).toHaveLength(2)
    for (const layer of layers) {
      expect(layer.getAttribute('class')).toBe('farm-scene__layer farm-scene__layer--blocks')
      expect([...layer.querySelectorAll('.farm-scene__block')].map((b) => b.dataset.block)).toEqual(['1', '2', '3'])
    }
  })
})

/* ===========================================================================
   5. The boundary and landform cards, unchanged
   =========================================================================== */

describe('5. the other cards, on the same parcel', () => {
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
    const main = readFileSync(path.join(HERE, '..', 'fixtures', 'boundary-card.svg'), 'utf8').trim()
    const now = renderToStaticMarkup(<BoundaryAnimation />)
    const unwrapped = now.replace(/<g class="farm-scene__stand">((?:<circle[^>]*><\/circle>)*)<\/g>/, '$1')
    expect(unwrapped).toBe(main)
  })

  it('draws the water card on the same land: its parcel ring is the parcel path', async () => {
    const handle = await mount(<WaterAnimation />)
    expect(handle.container.querySelector('.farm-scene__parcel').getAttribute('d')).toBe(PARCEL_PATH)
    expect(handle.container.querySelector('svg').getAttribute('viewBox')).toBe(SCENE_VIEWBOX)
  })
})

/* ===========================================================================
   6. Resting frame, and reduced motion
   =========================================================================== */

describe('6. with no motion, the card is a finished diagram', () => {
  it('rests with the embankment area read and the excavated area off the map', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('.tutorial-anim__mark--water').getAttribute('d')).toBe(EMBANKMENT_D)

    for (const shown of [
      '.tutorial-anim__mark--water',
      '.tutorial-anim__tab-mark--water',
      '.tutorial-anim__panel--water',
      '.tutorial-anim__reading--water-1',
      '.tutorial-anim__reading--water-2',
      '.tutorial-anim__tick--water-embankment',
    ]) {
      expect(baseFor(shown).opacity, shown).toBeUndefined()
    }
    for (const hidden of ['.tutorial-anim__survey--water-excavated', '.tutorial-anim__tick--water-excavated', '.tutorial-anim__pulse']) {
      expect(baseFor(hidden).opacity, hidden).toBe('0')
    }
    expect(baseFor('.tutorial-anim__tab--water-excavated').opacity).toBe('0.45')
    // The excavated layer is the one the resting rule hides.
    expect(svg.querySelector('[data-layer="survey-excavated"]').classList.contains('tutorial-anim__survey--water-excavated')).toBe(true)
  })

  it('switches every water animation off under reduced motion, after its own rules; the cursor goes by the shared rule', () => {
    const media = CARD_CSS.slice(CARD_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.tutorial-anim--water \*\s*\{\s*animation:\s*none;?\s*\}/)
    // Every rule that names an animation is single-class, so the media rule outranks it by order.
    for (const [selector, body] of rulesOf(CARD_CSS.slice(0, CARD_CSS.indexOf('@media')))) {
      if (!/animation-name/.test(body)) continue
      for (const s of selector.split(',')) expect(s.trim(), s).toMatch(/^\.[a-z0-9_-]+$/i)
    }
    expect(decl(APP_CSS)).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
    expect(WATER_CSS).not.toMatch(/tutorial-anim__cursor\s*\{[^}]*display/)
  })
})

/* ===========================================================================
   7. The treatment
   =========================================================================== */

describe('7. the treatment', () => {
  it('runs on one period, 13s, every stop a percentage, no durations or delays of its own', () => {
    expect(propsOf(rulesOf(CARD_CSS).find(([s]) => s === '.tutorial-anim--water')[1])['--loop']).toBe('13s')
    expect(WATER_CSS).not.toMatch(/animation-(duration|delay)/)
    expect(WATER_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)
    const keyframes = CARD_CSS.match(/@keyframes tutorial-water[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThanOrEqual(10)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
    // The scene's rules carry no timeline.
    expect(SURVEY_CSS).not.toMatch(/animation|@keyframes/)
    expect(readFileSync(path.join(HERE, 'farmScene.jsx'), 'utf8')).not.toMatch(/animation|keyframes|tutorial-anim__/)
  })

  it('names no colour: zero hex literals in the new CSS and the new module', () => {
    expect(WATER_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(WATER_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const [, body] of rulesOf(WATER_CSS)) {
      for (const [prop, value] of Object.entries(propsOf(body))) {
        if (!/^(color|background|fill|stroke)$/.test(prop)) continue
        if (/^(none|transparent)$/.test(value)) continue
        expect(value, prop).toMatch(/^var\(--/)
      }
    }
    for (const file of ['farmScene.jsx', 'waterCard.jsx', 'stepCards.js']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('keeps oxide to the click pulses and the commit button, through the shared rules', async () => {
    expect(WATER_CSS).not.toMatch(/--oxide/)
    const handle = await mount(<WaterAnimation />)
    expect(handle.container.querySelectorAll('.tutorial-anim__pulse')).toHaveLength(2)
    expect(handle.container.querySelectorAll('.tutorial-anim__commit-button rect')).toHaveLength(1)
    expect(baseFor('.tutorial-anim__pulse').stroke).toBe('var(--oxide)')
    expect(baseFor('.tutorial-anim__commit-button rect').fill).toBe('var(--oxide)')
    // The survey marks are their own tokens, not accents.
    expect(SURVEY_CSS).toMatch(/--survey-embankment/)
    expect(SURVEY_CSS).toMatch(/--survey-excavated/)
  })

  it('sets the acreage and score in the data face, and nothing else there', async () => {
    expect(WATER_CSS).not.toMatch(/--font-data/)
    expect(baseFor('.tutorial-anim__value')['font-family']).toBe('var(--font-data)')
    expect(baseFor('.tutorial-anim__value')['font-variant-numeric']).toBe('tabular-nums')
    const handle = await mount(<WaterAnimation />)
    const values = [...handle.container.querySelectorAll('.tutorial-anim__value')].map((v) => v.textContent)
    expect(values).toEqual(['2.1', '57'])
    for (const text of handle.container.querySelectorAll('text, tspan')) {
      if (text.querySelector('tspan')) continue
      const isValue = text.classList.contains('tutorial-anim__value')
      if (/\d/.test(text.textContent) && /^[\d.]+$/.test(text.textContent)) expect(isValue, text.textContent).toBe(true)
      if (/[a-z]/i.test(text.textContent)) expect(isValue, text.textContent).toBe(false)
    }
  })

  it('carries no running total: overlapping areas do not sum', async () => {
    const handle = await mount(<WaterAnimation />)
    expect(handle.container.querySelector('.tutorial-anim__total, .tutorial-anim__totals')).toBeNull()
    expect(handle.container.textContent).not.toMatch(/ ac\b|areas ·/)
  })

  it('keeps the tabs, panel and button inside the frame', async () => {
    const handle = await mount(<WaterAnimation />)
    for (const rect of handle.container.querySelectorAll('.tutorial-anim__tab-card, .tutorial-anim__panel rect, .tutorial-anim__commit-button rect')) {
      const right = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))
      const bottom = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))
      expect(right).toBeLessThanOrEqual(400)
      expect(bottom).toBeLessThanOrEqual(300)
    }
  })

  it('gives each diagram its own pattern ids, so two on one page never cross', async () => {
    const handle = await mount(
      <>
        <WaterAnimation />
        <WaterAnimation />
      </>
    )
    const ids = [...handle.container.querySelectorAll('pattern')].map((p) => p.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
  })
})
