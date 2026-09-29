/**
 * landformCards.test.jsx
 *
 * THE LANDFORM STEP'S TWO CARDS, and what they added to the shared farm.
 *
 *   1. the landform entry registers two cards, and the step card pages
 *      between them with the deck's own row;
 *   2. both cards' copy is the spec's, verbatim, emphasis included;
 *   3. the scene still holds the boundary parcel where it was, and the
 *      boundary card renders what it rendered on main;
 *   4. the hatch pattern renders, and its stroke is the oxide token --
 *      in the stylesheet here, and resolved in a real engine below;
 *   5. with no motion, both cards are finished diagrams;
 *   6. the treatment: one period per card, no colour literals, the data
 *      face on numerals and nothing else, and a fit inside the frame.
 *
 * What only a real engine can answer -- the stroke resolving, nothing
 * running under reduced motion, the fit at 380px -- is in
 * landformCards.browser.test.jsx.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOUNDARY_CARD, BoundaryAnimation } from './boundaryCard.jsx'
import { BlockHatch, HATCH_PITCH, PARCEL, PARCEL_PATH, SCENE_VIEWBOX, SUGGESTED_BLOCKS, SceneBlocks } from './farmScene.jsx'
import {
  BLOCK_READINGS,
  DRAWN_CORNERS,
  LANDFORM_CARD,
  LandformReadAnimation,
  LandformSetAnimation,
  SET_TOTALS,
} from './landformCards.jsx'
import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor, cardsOf } from './stepCards.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_CSS = readFileSync(path.join(HERE, '..', 'App.css'), 'utf8')
const INDEX_CSS = readFileSync(path.join(HERE, '..', 'index.css'), 'utf8')

/** The spec's copy. A rewrite fails here. */
const READ_TITLE = 'Read before you choose'
const READ_BODY =
  'Click a block on the map, or its tab along the bottom, to see more information about its ground. ' +
  'Click open ground to clear it.'
const SET_TITLE = 'Build the set'
const SET_EMPHASIS = "What's on the map when you commit is what goes into your design."
const SET_BODY =
  'Draw your own to add a block to the set. Untick a block and it leaves the map; tick it and it comes back. ' +
  SET_EMPHASIS

/** The spec's three suggested blocks. */
const BLOCKS = [
  'M 112 104 C 114 86, 140 78, 162 84 C 182 90, 187 118, 178 134 C 170 150, 136 153, 122 142 C 112 134, 110 120, 112 104 Z',
  'M 190 102 C 194 86, 221 83, 237 93 C 251 101, 249 129, 239 141 C 227 155, 199 149, 191 135 C 185 125, 187 112, 190 102 Z',
  'M 122 172 C 124 158, 152 150, 170 158 C 184 164, 185 190, 177 200 C 167 212, 136 211, 126 199 C 120 191, 120 180, 122 172 Z',
]

/* ===========================================================================
   Stylesheet helpers
   =========================================================================== */

const decl = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The lines this branch adds to App.css: from the blocks' section to the end. */
const LANDFORM_CSS = (() => {
  const start = APP_CSS.indexOf("/* --- The farm's blocks")
  expect(start).toBeGreaterThan(-1)
  return decl(APP_CSS.slice(start))
})()

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

/** Every base declaration for a selector, merged. */
function baseFor(selector) {
  const out = {}
  const base = LANDFORM_CSS.slice(0, LANDFORM_CSS.indexOf('@media'))
  for (const [s, body] of rulesOf(base)) {
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
const click = async (id) => React.act(async () => find(id).click())
const key = async (k) =>
  React.act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

async function renderCard(card = LANDFORM_CARD, handlers = {}) {
  const stage = document.createElement('div')
  document.body.appendChild(stage)
  return mount(
    <StepCard
      container={stage}
      card={card}
      auto
      onAutoChange={() => {}}
      onDismiss={handlers.onDismiss ?? (() => {})}
      onClose={handlers.onClose ?? (() => {})}
    />
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const handle of [...mounted]) await handle.unmount()
  document.body.innerHTML = ''
})

/* ===========================================================================
   1. Registered, and paged
   =========================================================================== */

describe('1. the landform entry registers two cards', () => {
  it('is the registry entry for landform, holding two cards in order', () => {
    const entry = cardFor(STEP_CARDS, 'landform')
    expect(entry).toBe(LANDFORM_CARD)
    expect(STEP_CARDS.filter((e) => e.stepId === 'landform')).toHaveLength(1)
    const cards = cardsOf(entry)
    expect(cards.map((c) => c.id)).toEqual(['read', 'set'])
    expect(cards.map((c) => c.Animation)).toEqual([LandformReadAnimation, LandformSetAnimation])
  })

  it('leaves the one-card shape as it was: boundary is its own single card', () => {
    const boundary = cardFor(STEP_CARDS, 'boundary')
    expect(boundary).toBe(BOUNDARY_CARD)
    expect(Object.keys(boundary).sort()).toEqual(['Animation', 'body', 'stepId', 'title'])
    expect(cardsOf(boundary)).toEqual([boundary])
    expect(cardsOf(null)).toEqual([])
  })

  it("pages between them with the deck's row: dots, Back, Next, then Got it", async () => {
    const onDismiss = vi.fn()
    const onClose = vi.fn()
    await renderCard(LANDFORM_CARD, { onDismiss, onClose })

    // The deck's own row, not a second one.
    const nav = find('tutorial-step-dots').closest('.tutorial__nav')
    expect(nav).not.toBeNull()
    expect(nav.contains(find('tutorial-step-back'))).toBe(true)
    expect(nav.contains(find('tutorial-step-next'))).toBe(true)
    expect(find('tutorial-step-dots').querySelectorAll('.tutorial__dot')).toHaveLength(2)
    // One way forward: the paged card has no separate Got it at its foot.
    expect(find('tutorial-step-done')).toBeNull()

    expect(find('tutorial-step-title').textContent).toBe(READ_TITLE)
    expect(find('tutorial-step-card').dataset.card).toBe('read')
    expect(find('tutorial-step-back').disabled).toBe(true)
    expect(find('tutorial-step-next').textContent).toBe('Next')
    expect(find('tutorial-step-dot-1').getAttribute('aria-current')).toBe('true')
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--landform-read')).not.toBeNull()

    await click('tutorial-step-next')
    expect(find('tutorial-step-title').textContent).toBe(SET_TITLE)
    expect(find('tutorial-step-card').dataset.card).toBe('set')
    expect(find('tutorial-step-dot-2').getAttribute('aria-current')).toBe('true')
    expect(find('tutorial-step-next').textContent).toBe('Got it')
    expect(find('tutorial-step-figure').querySelector('svg.tutorial-anim--landform-set')).not.toBeNull()

    await click('tutorial-step-back')
    expect(find('tutorial-step-title').textContent).toBe(READ_TITLE)
    await key('ArrowRight')
    expect(find('tutorial-step-title').textContent).toBe(SET_TITLE)
    await key('ArrowLeft')
    expect(find('tutorial-step-title').textContent).toBe(READ_TITLE)
    await click('tutorial-step-dot-2')
    expect(find('tutorial-step-title').textContent).toBe(SET_TITLE)
    expect(onDismiss).not.toHaveBeenCalled()

    // Got it on the last card is the one close.
    await click('tutorial-step-next')
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the auto checkbox at the foot of a paged card', async () => {
    await renderCard()
    const auto = find('tutorial-step-auto')
    expect(auto.closest('.tutorial__nav--foot')).not.toBeNull()
    expect(auto.checked).toBe(true)
  })
})

/* ===========================================================================
   2. The copy
   =========================================================================== */

describe('2. the copy', () => {
  it('says exactly the spec on card one', async () => {
    const [read] = cardsOf(LANDFORM_CARD)
    expect(read.title).toBe(READ_TITLE)
    expect(read.body).toBe(READ_BODY)
    await renderCard()
    expect(find('tutorial-step-title').textContent).toBe(READ_TITLE)
    expect(find('tutorial-step-body').textContent).toBe(READ_BODY)
    expect(find('tutorial-step-body').querySelector('strong')).toBeNull()
  })

  it('says exactly the spec on card two, its third sentence set in weight', async () => {
    const [, set] = cardsOf(LANDFORM_CARD)
    expect(set.title).toBe(SET_TITLE)
    expect(set.body).toBe(SET_BODY)
    expect(set.emphasis).toBe(SET_EMPHASIS)
    await renderCard()
    await click('tutorial-step-next')
    const body = find('tutorial-step-body')
    expect(body.textContent).toBe(SET_BODY)
    const strong = body.querySelectorAll('strong.tutorial__em')
    expect(strong).toHaveLength(1)
    expect(strong[0].textContent).toBe(SET_EMPHASIS)
    // "commit" appears once in the rule, and once in the whole body.
    expect(SET_EMPHASIS.match(/commit/g)).toHaveLength(1)
    expect(SET_BODY.match(/commit/g)).toHaveLength(1)
  })
})

/* ===========================================================================
   3. The scene, and the boundary card
   =========================================================================== */

describe('3. the scene still holds boundary where it was', () => {
  it('exports the parcel at its original coordinates', () => {
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

  it("renders the boundary card as main did: the one difference is the west stand's own group", () => {
    // src/fixtures/boundary-card.svg is BoundaryAnimation rendered on main
    // (6697373). The stand's canopies now sit in a <g> of their own so a
    // card can leave them out; unwrap it and the markup is main's, byte for
    // byte -- same elements, same order, same attributes.
    const main = readFileSync(path.join(HERE, '..', 'fixtures', 'boundary-card.svg'), 'utf8').trim()
    const now = renderToStaticMarkup(<BoundaryAnimation />)
    expect(now).toMatch(/<g class="farm-scene__stand">/)
    const unwrapped = now.replace(/<g class="farm-scene__stand">((?:<circle[^>]*><\/circle>)*)<\/g>/, '$1')
    expect(unwrapped).toBe(main)
  })

  it('holds the three suggested blocks to the spec, organic, and leaves them no timeline', () => {
    expect(SUGGESTED_BLOCKS.map((b) => b.d)).toEqual(BLOCKS)
    for (const { d } of SUGGESTED_BLOCKS) expect(d).toMatch(/ C /)
    const scene = readFileSync(path.join(HERE, 'farmScene.jsx'), 'utf8')
    expect(scene).not.toMatch(/animation|keyframes|tutorial-anim__/)
    for (const [selector, body] of rulesOf(LANDFORM_CSS)) {
      if (/^\.farm-scene/.test(selector)) expect(body, selector).not.toMatch(/animation/)
    }
  })

  it("draws each block as two stacked shapes, wash beneath and hatch above, on its diagram's own pattern", async () => {
    const handle = await mount(
      <svg viewBox={SCENE_VIEWBOX}>
        <defs>
          <BlockHatch id="h1" />
        </defs>
        <SceneBlocks hatch="h1" tone="settled" />
      </svg>
    )
    const layer = handle.container.querySelector('[data-layer="blocks"]')
    expect(layer.classList.contains('farm-scene__layer--settled')).toBe(true)
    const blocks = [...layer.querySelectorAll('.farm-scene__block')]
    expect(blocks.map((b) => b.dataset.block)).toEqual(['1', '2', '3'])
    for (const [i, block] of blocks.entries()) {
      const [base, hatch] = block.children
      expect(base.getAttribute('class')).toBe('farm-scene__block-base')
      expect(hatch.getAttribute('class')).toBe('farm-scene__block-hatch')
      expect(base.getAttribute('d')).toBe(BLOCKS[i])
      expect(hatch.getAttribute('d')).toBe(BLOCKS[i])
      expect(block.style.getPropertyValue('--farm-hatch')).toBe('url(#h1)')
    }
    // The settled variant is a restyle: quiet, and not a thing to click.
    expect(baseFor('.farm-scene__layer--settled')).toEqual({ opacity: '0.5', 'pointer-events': 'none' })
  })

  it("draws the user's block with straight edges, never smoothed", async () => {
    await renderCard()
    await click('tutorial-step-next')
    const drawn = find('tutorial-step-figure').querySelector('.tutorial-anim__drawn')
    const shapes = [...drawn.children]
    expect(shapes.map((s) => s.tagName.toLowerCase())).toEqual(['polygon', 'polygon'])
    expect(shapes[0].getAttribute('points')).toBe('186,158 226,152 228,180 190,186')
    expect(DRAWN_CORNERS.map(({ x, y }) => [x, y])).toEqual([
      [186, 158],
      [226, 152],
      [228, 180],
      [190, 186],
    ])
  })
})

/* ===========================================================================
   4. The hatch
   =========================================================================== */

describe('4. the hatch pattern', () => {
  it('renders: diagonal at 45 degrees, a 7-unit pitch, one rule with a class and no colour', async () => {
    await renderCard()
    const pattern = find('tutorial-step-figure').querySelector('pattern')
    expect(pattern).not.toBeNull()
    expect(HATCH_PITCH).toBe(7)
    expect(pattern.getAttribute('width')).toBe('7')
    expect(pattern.getAttribute('height')).toBe('7')
    expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse')
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(45)')
    const lines = pattern.querySelectorAll('line')
    expect(lines).toHaveLength(1)
    expect(lines[0].getAttribute('class')).toBe('farm-scene__hatch-line')
    for (const attr of ['stroke', 'fill', 'style']) expect(lines[0].hasAttribute(attr), attr).toBe(false)
    // Every block in the diagram points at this pattern.
    for (const block of find('tutorial-step-figure').querySelectorAll('.farm-scene__block')) {
      expect(block.style.getPropertyValue('--farm-hatch')).toBe(`url(#${pattern.id})`)
    }
  })

  it("strokes the rule with the oxide token, and fills the hatch shape with the pattern", () => {
    expect(baseFor('.farm-scene__hatch-line').stroke).toBe('var(--oxide)')
    expect(baseFor('.farm-scene__block-hatch').fill).toBe('var(--farm-hatch)')
    // No outline on either shape, as on the map, for suggested and drawn blocks alike.
    expect(baseFor('.farm-scene__block-base').stroke).toBe('none')
    expect(baseFor('.farm-scene__block-hatch').stroke).toBe('none')
    expect(INDEX_CSS).toMatch(/--oxide:\s*#[0-9a-f]{6}/i)
  })

  it('gives each diagram its own pattern id, so two on one page never cross', async () => {
    const handle = await mount(
      <>
        <LandformReadAnimation />
        <LandformSetAnimation />
      </>
    )
    const ids = [...handle.container.querySelectorAll('pattern')].map((p) => p.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
  })
})

/* ===========================================================================
   5. Resting frames, and reduced motion
   =========================================================================== */

describe('5. with no motion, both cards are finished diagrams', () => {
  it('card one rests with Block 3 read: its mark, its tab mark and its figures shown; Block 1 hidden', async () => {
    await renderCard()
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('.farm-scene__block')).toHaveLength(3)
    expect(svg.querySelectorAll('.tutorial-anim__tab')).toHaveLength(3)
    expect(svg.querySelector('.tutorial-anim__mark--landform-3').getAttribute('d')).toBe(BLOCKS[2])
    const body3 = svg.querySelector('.tutorial-anim__panel-body--3')
    expect([...body3.querySelectorAll('.tutorial-anim__value')].map((v) => v.textContent)).toEqual(['1.9', '25.6', '9.4'])
    const body1 = svg.querySelector('.tutorial-anim__panel-body--1')
    expect([...body1.querySelectorAll('.tutorial-anim__value')].map((v) => v.textContent)).toEqual(['4.0', '42.4', '11.9'])

    for (const shown of ['.tutorial-anim__mark--landform-3', '.tutorial-anim__tab-mark--landform-3', '.tutorial-anim__panel-body--3', '.tutorial-anim__panel--landform']) {
      expect(baseFor(shown).opacity, shown).toBeUndefined()
    }
    for (const hidden of ['.tutorial-anim__mark--landform-1', '.tutorial-anim__tab-mark--landform-1', '.tutorial-anim__panel-body--1', '.tutorial-anim__pulse']) {
      expect(baseFor(hidden).opacity, hidden).toBe('0')
    }
  })

  it('card two rests with the drawn block in, Block 2 out, and the total at 3 blocks · 7.4 ac', async () => {
    await renderCard()
    await click('tutorial-step-next')
    const svg = find('tutorial-step-figure').querySelector('svg')
    expect(svg.querySelectorAll('.tutorial-anim__segment--landform')).toHaveLength(4)
    expect(svg.querySelectorAll('.tutorial-anim__corner--landform')).toHaveLength(4)
    expect(svg.querySelectorAll('.tutorial-anim__tab')).toHaveLength(4)
    expect([...svg.querySelectorAll('.tutorial-anim__total')].map((t) => t.textContent)).toEqual(SET_TOTALS)
    expect(SET_TOTALS).toEqual(['3 blocks · 8.6 ac', '4 blocks · 10.1 ac', '3 blocks · 7.4 ac'])

    for (const shown of ['.tutorial-anim__drawn', '.tutorial-anim__tab--set-4', '.tutorial-anim__total--3', '.tutorial-anim__segment--set-1', '.tutorial-anim__corner--set-1']) {
      expect(baseFor(shown).opacity, shown).toBeUndefined()
    }
    for (const hidden of [".tutorial-anim--landform-set .farm-scene__block[data-block='2']", '.tutorial-anim__tick--set-2', '.tutorial-anim__total--1', '.tutorial-anim__total--2']) {
      expect(baseFor(hidden).opacity, hidden).toBe('0')
    }
    expect(baseFor('.tutorial-anim__tab--set-2').opacity).toBe('0.45')
  })

  it('switches every landform animation off under reduced motion, block 2 included, and hides the cursor', () => {
    const media = LANDFORM_CSS.slice(LANDFORM_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.tutorial-anim--landform \*,\s*\.tutorial-anim--landform-set \.farm-scene__block\[data-block='2'\]\s*\{\s*animation:\s*none;?\s*\}/)
    // The cursor goes by the diagrams' shared rule, which nothing here overrides.
    const tutorial = decl(APP_CSS)
    expect(tutorial).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
    expect(LANDFORM_CSS).not.toMatch(/tutorial-anim__cursor\s*\{[^}]*display/)
  })
})

/* ===========================================================================
   6. The treatment
   =========================================================================== */

describe('6. the treatment', () => {
  it('runs each card on one period, 11s and 14s, every stop a percentage, no durations or delays of its own', () => {
    expect(propsOf(rulesOf(LANDFORM_CSS).find(([s]) => s === '.tutorial-anim--landform-read')[1])['--loop']).toBe('11s')
    expect(propsOf(rulesOf(LANDFORM_CSS).find(([s]) => s === '.tutorial-anim--landform-set')[1])['--loop']).toBe('14s')
    expect(LANDFORM_CSS).not.toMatch(/animation-(duration|delay)/)
    expect(LANDFORM_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)
    const keyframes = LANDFORM_CSS.match(/@keyframes tutorial-landform[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThan(20)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
  })

  it('names no colour: zero hex literals in the new CSS and the new modules', () => {
    expect(LANDFORM_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(LANDFORM_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const [prop, value] of Object.entries(propsOf(LANDFORM_CSS.replace(/[^{}]+\{|\}/g, ';')))) {
      if (!/^(color|background|fill|stroke)$/.test(prop)) continue
      if (/^(none|transparent)$/.test(value)) continue
      expect(value, prop).toMatch(/var\(--/)
    }
    for (const file of ['farmScene.jsx', 'landformCards.jsx', 'StepCard.jsx', 'stepCards.js', 'cards-harness.html']) {
      const source = readFileSync(path.join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(fill|stroke|color|fontFamily)=/)
    }
  })

  it('keeps oxide to the hatch, the click pulses and the commit button', () => {
    const oxide = rulesOf(LANDFORM_CSS)
      .filter(([, body]) => /--oxide/.test(body))
      .map(([selector]) => selector)
    expect(oxide).toEqual(['.farm-scene__hatch-line', '.tutorial-anim__pulse', '.tutorial-anim__commit-button rect'])
  })

  it('sets every acreage, score, slope and running total in the data face, and nothing else', async () => {
    // The data face is the shared value rule; nothing this branch adds names it.
    expect(LANDFORM_CSS).not.toMatch(/--font-data/)
    const numerals = new Set([
      ...Object.values(BLOCK_READINGS).flatMap((r) => Object.values(r)),
      ...SET_TOTALS,
    ])
    const handle = await mount(
      <>
        <LandformReadAnimation />
        <LandformSetAnimation />
      </>
    )
    const values = [...handle.container.querySelectorAll('.tutorial-anim__value')].map((v) => v.textContent)
    for (const value of values) expect(numerals.has(value), value).toBe(true)
    for (const numeral of numerals) expect(values, numeral).toContain(numeral)
    // Every figure-bearing text is a value; names and labels are not.
    for (const text of handle.container.querySelectorAll('text, tspan')) {
      if (text.querySelector('tspan')) continue
      const isValue = text.classList.contains('tutorial-anim__value')
      if (/^\d+(\.\d+)?$/.test(text.textContent) || / ac$/.test(text.textContent)) expect(isValue, text.textContent).toBe(true)
      if (/^(Block \d|acres|score|slope %|ac|Draw a block|Commit blocks)$/.test(text.textContent)) {
        expect(isValue, text.textContent).toBe(false)
      }
    }
  })

  it('reads value left, label right, as the real panel does', async () => {
    const handle = await mount(<LandformReadAnimation />)
    for (const row of handle.container.querySelectorAll('.tutorial-anim__reading')) {
      const [value, label] = row.children
      expect(value.getAttribute('class')).toBe('tutorial-anim__value')
      expect(label.getAttribute('class')).toBe('tutorial-anim__label')
      expect(Number(label.getAttribute('x'))).toBeGreaterThan(Number(row.getAttribute('x')))
    }
  })

  it('keeps the tab strip, total and buttons inside the frame', async () => {
    const handle = await mount(
      <>
        <LandformReadAnimation />
        <LandformSetAnimation />
      </>
    )
    for (const rect of handle.container.querySelectorAll('.tutorial-anim__tab-card, .tutorial-anim__draw-button rect, .tutorial-anim__commit-button rect')) {
      const right = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'))
      const bottom = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))
      expect(right).toBeLessThanOrEqual(400)
      expect(bottom).toBeLessThanOrEqual(300)
    }
  })
})
