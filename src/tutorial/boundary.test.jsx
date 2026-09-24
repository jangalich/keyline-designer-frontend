/**
 * boundary.test.jsx
 *
 * THE BOUNDARY STEP'S CARD and THE FARM every step card draws on.
 *
 *   1. the card is registered, and the shipped shell opens it on arrival;
 *   2. its copy is the spec's, verbatim, emphasis included;
 *   3. the scene renders every layer, each on its own, and the parcel ring
 *      is the spec's table to the unit;
 *   4. with no motion, the card is a finished diagram.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/SessionStore'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { STEP_DEFINITIONS, registryProposalFeatures } from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider } from '../wizard/WizardCursor.jsx'
import { BOUNDARY_CARD, BoundaryAnimation } from './boundaryCard.jsx'
import {
  BUILDING,
  FarmScene,
  LAND_LAYERS,
  PARCEL,
  PARCEL_PATH,
  ROAD_PATH,
  SCENE_VIEWBOX,
  STREAM_PATH,
  SceneGround,
  SceneRoad,
  SceneStream,
  SceneWoodlot,
  WOODLOT_PATH,
} from './farmScene.jsx'
import { resetTutorialPrefsForTests } from './prefs.js'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor } from './stepCards.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')

/** The spec's copy. A rewrite fails here. */
const TITLE = 'Draw your whole property'
const BODY =
  'Search your address, zoom in, then click each corner of your property line. ' +
  'Include the woods, the wet ground and the road — those are what the tool reads to ' +
  'place trees, water and access.'
const EMPHASIS = 'Include the woods, the wet ground and the road'

/** The spec's parcel table. */
const TABLE = [
  ['A', 96, 66],
  ['B', 196, 48],
  ['C', 286, 72],
  ['D', 330, 148],
  ['E', 300, 232],
  ['F', 170, 250],
  ['G', 92, 186],
]

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ===========================================================================
   Stylesheet helpers
   =========================================================================== */

const decl = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The lines this branch adds: from the farm's section to the reduced-motion block. */
const BOUNDARY_CSS = (() => {
  const start = APP_CSS.indexOf("/* --- The step cards' farm")
  const end = APP_CSS.indexOf('/* REDUCED MOTION: every diagram lands')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return decl(APP_CSS.slice(start, end))
})()

const TUTORIAL_CSS = decl(APP_CSS.slice(APP_CSS.indexOf('/* --- The tutorial ---')))

function rulesOf(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body.trim()])
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

/* ===========================================================================
   1. Registered, and rendered
   =========================================================================== */

describe('1. the boundary card is registered', () => {
  it('is the registry entry for boundary, in the entry shape', () => {
    const card = cardFor(STEP_CARDS, 'boundary')
    expect(card).toBe(BOUNDARY_CARD)
    expect(Object.keys(card).sort()).toEqual(['Animation', 'body', 'stepId', 'title'])
    expect(card.Animation).toBe(BoundaryAnimation)
    // One entry per step.
    expect(STEP_CARDS.filter((entry) => entry.stepId === 'boundary')).toHaveLength(1)
  })

  it('opens by itself on arrival at the boundary, through the shipped shell and registry', async () => {
    globalThis.fetch = vi.fn(async (rawUrl) => {
      const url = new URL(rawUrl)
      if (url.pathname === '/api/steps') {
        return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    // No StepCardRegistry provider: this is the production registry.
    await mount(
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <div className="map-stage">
            <WizardShell />
          </div>
        </WizardCursorProvider>
      </SessionProvider>
    )
    const card = find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('boundary')
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--boundary')).not.toBeNull()
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

async function renderCard() {
  const stage = document.createElement('div')
  document.body.appendChild(stage)
  const handle = await mount(
    <StepCard
      container={stage}
      card={BOUNDARY_CARD}
      auto
      onAutoChange={() => {}}
      onDismiss={() => {}}
      onClose={() => {}}
      onOpenDeck={() => {}}
    />
  )
  const unmount = handle.unmount
  handle.unmount = async () => {
    await unmount()
    stage.remove()
  }
  return handle
}

describe('2. the copy', () => {
  it('says exactly the spec, title and body', async () => {
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(TITLE)
    expect(find('tutorial-step-body').textContent).toBe(BODY)
  })

  it('emphasises the clause that is the reason for the card, inline and only that', async () => {
    await renderCard()
    const body = find('tutorial-step-body')
    const emphasis = body.querySelectorAll('strong')
    expect(emphasis).toHaveLength(1)
    expect(emphasis[0].textContent).toBe(EMPHASIS)
    // Inline: inside the paragraph, between the two halves of the sentence.
    expect(emphasis[0].parentElement).toBe(body)
    expect(body.firstChild.textContent.endsWith('property line. ')).toBe(true)
    expect(body.lastChild.textContent.startsWith(' — those are')).toBe(true)
  })

  it('carries the address as context and the acreage as its one reading', async () => {
    await renderCard()
    const figure = find('tutorial-step-figure')
    expect(figure.querySelector('.tutorial-anim__address-text').textContent).toBe('237 Montour Dr, Jones Mills, PA')
    expect(figure.querySelector('.tutorial-anim__value').textContent).toBe('21.6 ac traced')
    expect(figure.querySelectorAll('.tutorial-anim__value')).toHaveLength(1)
  })
})

/* ===========================================================================
   3. The scene
   =========================================================================== */

async function renderSvg(children) {
  const handle = await mount(<svg viewBox={SCENE_VIEWBOX}>{children}</svg>)
  return handle.container.querySelector('svg')
}

describe('3. the farm scene', () => {
  it('is drawn in a 0 0 400 300 frame', () => {
    expect(SCENE_VIEWBOX).toBe('0 0 400 300')
  })

  it("holds the parcel ring to the spec's table, A to G", () => {
    expect(PARCEL.map(({ id, x, y }) => [id, x, y])).toEqual(TABLE)
    expect(PARCEL_PATH).toBe('M 96 66 L 196 48 L 286 72 L 330 148 L 300 232 L 170 250 L 92 186 Z')
  })

  it("holds the road, stream, woodlot and building to the spec's geometry", () => {
    expect(ROAD_PATH).toBe('M -20 40 C 90 16, 230 20, 420 52')
    expect(STREAM_PATH).toBe('M 316 92 C 282 128, 268 140, 246 168 S 196 214, 150 246')
    expect(WOODLOT_PATH).toBe(
      'M 300 96 C 330 130, 322 176, 296 208 C 268 236, 236 226, 232 196 C 228 166, 262 120, 300 96 Z'
    )
    expect(BUILDING).toEqual({ x: 158, y: 76, width: 18, height: 12 })
  })

  it('renders every layer, each in its own group, each with its own class', async () => {
    const svg = await renderSvg(
      <>
        <SceneGround />
        <FarmScene />
      </>
    )
    const layers = [...svg.querySelectorAll('[data-layer]')].map((g) => g.dataset.layer)
    expect(layers).toEqual(['ground', 'road', 'open', 'stream', 'woodlot', 'building', 'labels'])
    expect(LAND_LAYERS.map(({ id }) => id)).toEqual(layers.slice(1))
    for (const id of layers) {
      const g = svg.querySelector(`[data-layer="${id}"]`)
      expect(g.classList.contains('farm-scene__layer'), id).toBe(true)
      expect(g.classList.contains(`farm-scene__layer--${id}`), id).toBe(true)
    }

    expect(svg.querySelector('.farm-scene__road-band').getAttribute('d')).toBe(ROAD_PATH)
    expect(svg.querySelector('.farm-scene__stream').getAttribute('d')).toBe(STREAM_PATH)
    expect(svg.querySelector('.farm-scene__woodmass').getAttribute('d')).toBe(WOODLOT_PATH)
    expect(svg.querySelector('.farm-scene__open').getAttribute('d')).toBe(PARCEL_PATH)
    const building = svg.querySelector('.farm-scene__building')
    expect(['x', 'y', 'width', 'height'].map((a) => Number(building.getAttribute(a)))).toEqual([158, 76, 18, 12])
    expect([...svg.querySelectorAll('.farm-scene__label')].map((t) => t.textContent)).toEqual([
      'ROAD',
      'WOODS',
      'STREAM',
    ])
  })

  it('renders any layer on its own, and restyles one without redrawing it', async () => {
    const svg = await renderSvg(
      <>
        <SceneStream tone="prominent" />
        <SceneWoodlot tone="subdued" />
        <SceneRoad className="extra" />
      </>
    )
    expect([...svg.querySelectorAll('[data-layer]')].map((g) => g.dataset.layer)).toEqual(['stream', 'woodlot', 'road'])
    expect(svg.querySelector('[data-layer="stream"]').classList.contains('farm-scene__layer--prominent')).toBe(true)
    expect(svg.querySelector('[data-layer="woodlot"]').classList.contains('farm-scene__layer--subdued')).toBe(true)
    expect(svg.querySelector('[data-layer="road"]').classList.contains('extra')).toBe(true)
    // The same geometry, whatever the tone.
    expect(svg.querySelector('.farm-scene__stream').getAttribute('d')).toBe(STREAM_PATH)
  })

  it('tones the whole scene by layer id', async () => {
    const svg = await renderSvg(<FarmScene tones={{ stream: 'prominent', road: 'subdued' }} />)
    expect(svg.querySelector('[data-layer="stream"]').classList.contains('farm-scene__layer--prominent')).toBe(true)
    expect(svg.querySelector('[data-layer="road"]').classList.contains('farm-scene__layer--subdued')).toBe(true)
    expect(svg.querySelector('[data-layer="woodlot"]').className.baseVal).toBe('farm-scene__layer farm-scene__layer--woodlot')
  })

  it('holds no motion: no keyframes are keyed to the scene', () => {
    const scene = readFileSync(path.join(HERE, 'farmScene.jsx'), 'utf8')
    expect(scene).not.toMatch(/animation|keyframes|tutorial-anim__/)
    for (const [selector, body] of rulesOf(BOUNDARY_CSS)) {
      if (/farm-scene/.test(selector)) expect(body, selector).not.toMatch(/animation/)
    }
  })

  it('the boundary card traces exactly the scene parcel, corner for corner', async () => {
    const svg = await renderSvg(<BoundaryAnimation />)
    const inner = svg.querySelector('svg.tutorial-anim--boundary')
    expect(inner.getAttribute('viewBox')).toBe(SCENE_VIEWBOX)
    const corners = [...inner.querySelectorAll('.tutorial-anim__corner')].map((c) => [
      Number(c.getAttribute('cx')),
      Number(c.getAttribute('cy')),
    ])
    expect(corners).toEqual(TABLE.map(([, x, y]) => [x, y]))
    const segments = [...inner.querySelectorAll('.tutorial-anim__segment')]
    expect(segments.map((s) => [...s.classList].find((c) => /--[a-g]{2}$/.test(c)).slice(-2))).toEqual([
      'ab',
      'bc',
      'cd',
      'de',
      'ef',
      'fg',
      'ga',
    ])
  })
})

/* ===========================================================================
   4. Motion, and none
   =========================================================================== */

describe('4. the animation, and reduced motion', () => {
  it('is a finished diagram in the markup: the ring closed, the wash in, the acreage shown', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.classList.contains('tutorial-anim')).toBe(true)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('.tutorial-anim__segment')).toHaveLength(7)
    expect(svg.querySelectorAll('.tutorial-anim__corner')).toHaveLength(7)
    expect(svg.querySelector('.tutorial-anim__wash').getAttribute('d')).toBe(PARCEL_PATH)
    expect(svg.textContent).toContain('21.6 ac traced')
  })

  it('rests on that frame: nothing the card draws rests hidden but the cursor and the snap ring', () => {
    const hidden = rulesOf(BOUNDARY_CSS)
      .filter(([selector]) => !selector.startsWith('@') && !/^\d/.test(selector))
      .filter(([, body]) => /(^|;)\s*(opacity|fill-opacity|stroke-opacity):\s*0\s*(;|$)/.test(body) || /display:\s*none/.test(body))
      .map(([selector]) => selector)
    expect(hidden).toEqual(['.tutorial-anim__snap'])
    // The zoom rests zoomed in, the segments drawn, the corners full size.
    // Every base rule for a selector, joined: a selector's look and its
    // animation-name are stated in two rules.
    const base = {}
    for (const [selector, body] of rulesOf(BOUNDARY_CSS).filter(([s]) => s.startsWith('.'))) {
      base[selector] = `${base[selector] ?? ''} ${body}`
    }
    expect(base['.tutorial-anim__zoom--boundary']).toMatch(/transform-origin/)
    expect(base['.tutorial-anim__zoom--boundary']).not.toMatch(/transform:/)
    expect(base['.tutorial-anim__wash']).toMatch(/opacity: 0\.16/)
  })

  it('switches every animation in the card off under reduced motion and hides the cursor', () => {
    const reduced = TUTORIAL_CSS.slice(TUTORIAL_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.tutorial-anim \*\s*\{\s*animation:\s*none;?\s*\}/)
    expect(reduced).toMatch(/\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
  })

  it('runs on one 10s period, every stop a percentage, no delays', () => {
    const loop = rulesOf(TUTORIAL_CSS).find(([s]) => s === '.tutorial-anim--boundary')
    expect(loop[1]).toBe('--loop: 10s;')
    expect(BOUNDARY_CSS).not.toMatch(/animation-(duration|delay)/)
    const keyframes = BOUNDARY_CSS.match(/@keyframes tutorial-boundary[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBe(21)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
  })

  it('scales the land and not the chrome', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    const zoom = svg.querySelector('.tutorial-anim__zoom--boundary')
    expect(zoom.querySelector('.farm-scene')).not.toBeNull()
    expect(zoom.querySelector('.tutorial-anim__wash')).not.toBeNull()
    for (const chrome of ['.tutorial-anim__address', '.tutorial-anim__zoom-control', '.tutorial-anim__cursor']) {
      expect(svg.querySelector(chrome), chrome).not.toBeNull()
      expect(zoom.contains(svg.querySelector(chrome)), chrome).toBe(false)
    }
  })
})

/* ===========================================================================
   5. The treatment
   =========================================================================== */

describe('5. the treatment', () => {
  it('names no colour: no hex literal in the new CSS or the new modules', () => {
    expect(BOUNDARY_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(BOUNDARY_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const file of ['farmScene.jsx', 'boundaryCard.jsx']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('uses oxide for the snap ring and for nothing else it adds', () => {
    const oxide = rulesOf(BOUNDARY_CSS)
      .filter(([, body]) => /--oxide/.test(body))
      .map(([selector]) => selector)
    expect(oxide).toEqual(['.tutorial-anim__snap'])
  })

  it('sets the acreage, and only the acreage, in the data face with tabular figures', () => {
    expect(BOUNDARY_CSS).not.toMatch(/--font-data/)
    // The data face comes from the shared value rule.
    const value = rulesOf(TUTORIAL_CSS).find(([s]) => s === '.tutorial-anim__value')[1]
    expect(value).toMatch(/font-family: var\(--font-data\)/)
    expect(value).toMatch(/font-variant-numeric: tabular-nums/)
  })
})
