/**
 * permanence.test.jsx
 *
 * THE SCALE OF PERMANENCE LADDER, AS MARKUP AND STATE.
 *
 * What is asserted is what the brief fixes and a stylesheet cannot carry: the
 * eight rungs in order with their copy, each header a real button wired to
 * its body, Climate open on load, rungs opening independently, a closed body
 * still in the document, and no link out of the ladder. The geometry -- the
 * tint column's even steps with rungs open, 390px, the keyboard path in a
 * real engine -- is permanence.browser.test.jsx's.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import ScaleOfPermanence, { AXIS_BOTTOM, AXIS_TOP, INITIALLY_OPEN, RUNGS } from './ScaleOfPermanence.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMPONENTS = readFileSync(path.join(HERE, 'App.css'), 'utf8')
const FOUNDATION = readFileSync(path.join(HERE, 'index.css'), 'utf8')
const SOURCE = readFileSync(path.join(HERE, 'ScaleOfPermanence.jsx'), 'utf8')

const mounted = new Set()

async function render() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const ui = {
    container,
    toggle: (id) => container.querySelector(`[data-testid="rung-toggle-${id}"]`),
    body: (id) => container.querySelector(`[data-testid="rung-body-${id}"]`),
    async press(id) {
      await React.act(async () => ui.toggle(id).click())
    },
    openIds: () => RUNGS.filter((r) => ui.toggle(r.id).getAttribute('aria-expanded') === 'true').map((r) => r.id),
    async unmount() {
      mounted.delete(ui)
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.add(ui)
  await React.act(async () => root.render(<ScaleOfPermanence />))
  return ui
}

afterEach(async () => {
  for (const ui of [...mounted]) await ui.unmount()
})

describe('1. the rungs', () => {
  it('holds the eight factors, most permanent first, each numbered with its name and spine', async () => {
    const ui = await render()
    const rungs = [...ui.container.querySelectorAll('.permanence__rung')]
    expect(rungs.map((li) => li.querySelector('.permanence__name').textContent)).toEqual([
      'Climate',
      'Landform',
      'Water',
      'Access',
      'Trees',
      'Buildings',
      'Fencing',
      'Soil',
    ])
    expect(rungs.map((li) => li.querySelector('.permanence__number').textContent)).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8']
    )
    expect(rungs[0].querySelector('.permanence__spine').textContent).toBe(
      'Rainfall, temperature, wind and humidity are fixed.'
    )
    expect(rungs[7].querySelector('.permanence__spine').textContent).toBe(
      'Soil comes last because it is the most improvable factor.'
    )
    for (const rung of RUNGS) {
      expect(ui.body(rung.id).textContent).toBe(rung.body)
    }
  })

  it('steps the tint down the ladder, 0.92 to 0.13', async () => {
    expect(RUNGS.map((r) => r.tint)).toEqual([0.92, 0.79, 0.66, 0.54, 0.43, 0.33, 0.23, 0.13])
    const ui = await render()
    const tints = [...ui.container.querySelectorAll('.permanence__tint')].map((el) => Number(el.style.opacity))
    expect(tints).toEqual(RUNGS.map((r) => r.tint))
  })

  it('labels the axis above and below', async () => {
    const ui = await render()
    const axes = [...ui.container.querySelectorAll('.permanence__axis')].map((el) => el.textContent)
    expect(axes).toEqual([AXIS_TOP, AXIS_BOTTOM])
    expect(AXIS_TOP).toBe('harder to change')
    expect(AXIS_BOTTOM).toBe('easier to change')
  })

  it('links nowhere', async () => {
    const ui = await render()
    expect(ui.container.querySelector('a')).toBeNull()
    expect(ui.container.querySelector('[href]')).toBeNull()
  })
})

describe('2. each header is a real button wired to its body', () => {
  it('is a <button> with aria-expanded and aria-controls naming its body', async () => {
    const ui = await render()
    for (const rung of RUNGS) {
      const button = ui.toggle(rung.id)
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.hasAttribute('aria-expanded')).toBe(true)
      const controls = button.getAttribute('aria-controls')
      expect(controls).toBeTruthy()
      expect(document.getElementById(controls)).toBe(ui.body(rung.id))
      // Inside a heading, so the eight names are in the outline under the section's h2.
      expect(button.parentElement.tagName).toBe('H3')
    }
  })
})

describe('3. opening and closing', () => {
  it('starts with Climate open and the other seven closed', async () => {
    expect(INITIALLY_OPEN).toEqual(['climate'])
    const ui = await render()
    expect(ui.openIds()).toEqual(['climate'])
    expect(ui.body('climate').hasAttribute('hidden')).toBe(false)
    for (const rung of RUNGS.slice(1)) expect(ui.body(rung.id).hasAttribute('hidden')).toBe(true)
  })

  it('opens rungs independently, more than one at a time, and closes them again', async () => {
    const ui = await render()
    await ui.press('water')
    await ui.press('soil')
    expect(ui.openIds()).toEqual(['climate', 'water', 'soil'])
    await ui.press('climate')
    expect(ui.openIds()).toEqual(['water', 'soil'])
    expect(ui.body('climate').hasAttribute('hidden')).toBe(true)
    await ui.press('water')
    await ui.press('soil')
    expect(ui.openIds()).toEqual([])
  })

  it('keeps a closed body in the document, hidden until found rather than removed', async () => {
    const ui = await render()
    const body = ui.body('trees')
    expect(body.isConnected).toBe(true)
    expect(body.textContent).toBe(RUNGS[4].body)
    expect(body.getAttribute('hidden')).toBe('until-found')
    // And never by a stylesheet's display: none.
    expect(COMPONENTS).not.toMatch(/\.permanence__body[^{]*\{[^}]*display:\s*none/)
  })

  it('opens a rung when find-in-page reveals its body', async () => {
    const ui = await render()
    await React.act(async () => ui.body('fencing').dispatchEvent(new Event('beforematch')))
    expect(ui.openIds()).toEqual(['climate', 'fencing'])
  })
})

describe('4. tokens', () => {
  it('declares --terrain in the foundation, at the report’s value', () => {
    expect(FOUNDATION).toMatch(/--terrain: #7a5c3a;/)
  })

  it('draws the tint in --terrain and the hairlines in --rule, with no colour literal', () => {
    const block = (selector) => {
      const source = COMPONENTS.replace(/\/\*[\s\S]*?\*\//g, '')
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return source.match(new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))?.[2] ?? ''
    }
    expect(block('.permanence__tint')).toMatch(/background:\s*var\(--terrain\)/)
    expect(block('.permanence__rung')).toMatch(/border-top:\s*var\(--hairline\)/)
    expect(block('.permanence__number')).toMatch(/font-family:\s*var\(--font-data\)/)
    expect(block('.permanence__number')).toMatch(/color:\s*var\(--ink-muted\)/)
    expect(block('.permanence__name')).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(block('.permanence__name')).toMatch(/color:\s*var\(--ink\)/)
    expect(block('.permanence__spine')).toMatch(/font-family:\s*var\(--font-prose\)/)
    expect(block('.permanence__spine')).toMatch(/color:\s*var\(--ink-muted\)/)
    expect(block('.permanence__head:hover .permanence__name')).toMatch(/color:\s*var\(--oxide\)/)
    // The component sets an opacity inline and nothing that is a colour.
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/)
  })
})
