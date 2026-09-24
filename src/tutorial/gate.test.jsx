/**
 * gate.test.jsx
 *
 * THE ENTRY GATE, ON THE SHIPPED PAGE. App.jsx is rendered whole -- its
 * providers, the address field, the stage, the shell's mount condition --
 * with Leaflet's own components stood in for, since jsdom cannot lay a map
 * out and nothing here is about the map. The map layer stack and the
 * recentring hook are stubbed for the same reason.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mapProps = []

vi.mock('react-leaflet', () => ({
  MapContainer: (props) => {
    mapProps.push(props)
    return (
      <div className="leaflet-container" data-testid="map">
        {props.children}
      </div>
    )
  },
  TileLayer: () => null,
  ZoomControl: () => null,
  AttributionControl: () => null,
}))
vi.mock('../MapRecenter.jsx', () => ({ default: () => null }))
vi.mock('../map/MapLayerStack.jsx', () => ({ default: () => null }))

import App, { DEFAULT_VIEW } from '../App.jsx'
import { ADDRESS_PLACEHOLDER } from '../AddressSearch.jsx'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { ORIENTATION_ID, SEEN_KEY, readPrefs, resetTutorialPrefsForTests } from './prefs.js'
import { StepCardRegistry } from './TutorialContext.jsx'
import {
  GATED_ADDRESS_PLACEHOLDER,
  ORIENTATION_BODY,
  ORIENTATION_TITLE,
  TUTORIAL_START_LABEL,
} from './TutorialGate.jsx'

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

function installFetch() {
  globalThis.fetch = vi.fn(async (rawUrl) => {
    const url = new URL(rawUrl)
    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
}

/** Every region the shell would put on the map. */
const CHROME = [
  '.chrome',
  '[data-testid="wizard"]',
  '[data-testid="step-rail"]',
  '.chrome-bar',
  '.chrome-banner',
  '.chrome__bottom',
  '[data-testid="tutorial-help"]',
]

const mounted = new Set()

async function renderApp({ registry } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  installFetch()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const handle = {
    async unmount() {
      mounted.delete(handle)
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.add(handle)
  const app = registry ? (
    <StepCardRegistry cards={registry}>
      <App />
    </StepCardRegistry>
  ) : (
    <App />
  )
  await React.act(async () => root.render(app))

  const find = (id) => container.querySelector(`[data-testid="${id}"]`)
  return {
    container,
    find,
    input: () => container.querySelector('.address-input'),
    goButton: () => container.querySelector('.search-row button'),
    chrome: () => CHROME.filter((selector) => container.querySelector(selector) != null),
    orientation: () => find('tutorial-orientation-card'),
    async click(id) {
      const el = find(id)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    async key(key) {
      await React.act(async () => {
        const target = document.activeElement ?? document.body
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      })
    },
    unmount: handle.unmount,
  }
}

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  resetTutorialPrefsForTests()
  window.history.replaceState({}, '', '/')
  mapProps.length = 0
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const handle of [...mounted]) await handle.unmount()
})

describe('the gate, on a first arrival', () => {
  it('mounts the map and no wizard chrome at all while the orientation card is open', async () => {
    const ui = await renderApp()
    expect(ui.find('map')).not.toBeNull()
    expect(ui.orientation()).not.toBeNull()
    expect(ui.chrome()).toEqual([])
    // The card is in the map's stage, where every tutorial card is.
    expect(ui.container.querySelector('.map-stage').contains(ui.orientation())).toBe(true)
  })

  it('opens the map on the named default view, not the continental US', async () => {
    await renderApp()
    const props = mapProps[mapProps.length - 1]
    expect(props.center).toEqual(DEFAULT_VIEW.center)
    expect(props.zoom).toBe(DEFAULT_VIEW.zoom)
    expect(DEFAULT_VIEW.zoom).toBeGreaterThanOrEqual(15)
    expect(typeof DEFAULT_VIEW.name).toBe('string')
  })

  it('disables the address field, and its placeholder names the start button', async () => {
    const ui = await renderApp()
    expect(ui.input().disabled).toBe(true)
    expect(ui.goButton().disabled).toBe(true)
    expect(ui.input().placeholder).toContain(TUTORIAL_START_LABEL)
    expect(ui.input().placeholder).toBe(`Click ${TUTORIAL_START_LABEL} to search an address`)
    expect(GATED_ADDRESS_PLACEHOLDER).toBe(ui.input().placeholder)
    // Named, never located.
    expect(ui.input().placeholder).not.toMatch(/\b(below|above|under|beneath|left|right)\b/i)
  })

  it('says the copy verbatim and offers exactly one control: the start button', async () => {
    const ui = await renderApp()
    const card = ui.orientation()
    expect(ORIENTATION_TITLE).toBe('How this works')
    expect(ui.find('tutorial-orientation-title').textContent).toBe('How this works')
    const paragraphs = [...card.querySelectorAll('[data-testid="tutorial-orientation-body"]')].map((p) => p.textContent)
    expect(paragraphs).toEqual([
      "You'll work through seven steps, one at a time.",
      "The steps sit down the left, and what to do next runs across the top. The tabs along the bottom list what each step turns up, their measurements open on the right, and the actions for the step you're on are at the bottom right.",
    ])
    expect(paragraphs).toEqual([...ORIENTATION_BODY])
    const controls = [...card.querySelectorAll('button, input, a, [tabindex]:not([tabindex="-1"])')]
    expect(controls).toHaveLength(1)
    expect(controls[0].textContent).toBe(TUTORIAL_START_LABEL)
    expect(TUTORIAL_START_LABEL).toBe('Get started')
    // The deck's overview animation, reused.
    expect(ui.find('tutorial-orientation-figure').querySelectorAll('.tutorial-anim__region')).toHaveLength(5)
    // Focus moves into the card, onto its one control.
    expect(card.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(ui.find('tutorial-start'))
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.getAttribute('aria-modal')).toBe('true')
  })

  it('has no way out but through: not Esc, not the backdrop', async () => {
    const ui = await renderApp()
    await ui.key('Escape')
    expect(ui.orientation()).not.toBeNull()
    await ui.click('tutorial-orientation-backdrop')
    expect(ui.orientation()).not.toBeNull()
    expect(ui.chrome()).toEqual([])
    expect(readPrefs().seen).toEqual([])
  })

  it('on the button: mounts the chrome, enables the field, restores the placeholder, and opens nothing with an empty registry', async () => {
    const ui = await renderApp({ registry: [] })
    await ui.click('tutorial-start')

    expect(ui.orientation()).toBeNull()
    expect(ui.chrome()).toEqual(CHROME)
    expect(ui.input().disabled).toBe(false)
    expect(ui.goButton().disabled).toBe(false)
    expect(ui.input().placeholder).toBe(ADDRESS_PLACEHOLDER)
    expect(readPrefs().seen).toEqual([ORIENTATION_ID])
    expect(JSON.parse(window.localStorage.getItem(SEEN_KEY))).toEqual([ORIENTATION_ID])

    // THE BOUNDARY SLOT: with an empty registry nothing opens --
    // no step card, and not the deck either -- and that is not an error.
    expect(ui.find('tutorial-step-card')).toBeNull()
    expect(ui.find('tutorial-card')).toBeNull()
  })

  it('on the button, with a boundary card registered, the boundary card arrives in the same place', async () => {
    const ui = await renderApp({
      registry: [{ stepId: 'boundary', title: 'Fixture: boundary', body: 'Draw the line.' }],
    })
    expect(ui.find('tutorial-step-card')).toBeNull()
    await ui.click('tutorial-start')
    const card = ui.find('tutorial-step-card')
    expect(card).not.toBeNull()
    expect(card.dataset.step).toBe('boundary')
    // The same overlay, in the same stage.
    expect(card.closest('.tutorial').parentElement).toBe(ui.container.querySelector('.map-stage'))
  })
})

describe('the hand-over, in sequence', () => {
  /** An animate() whose every motion finishes only when the test says so. */
  function controlledMotion() {
    const pending = []
    const original = window.HTMLElement.prototype.animate
    window.HTMLElement.prototype.animate = function animate() {
      let finish
      const finished = new Promise((resolve) => {
        finish = resolve
      })
      pending.push({ element: this, finish })
      return { finished, cancel() {} }
    }
    return {
      pending,
      restore: () => {
        window.HTMLElement.prototype.animate = original
      },
      async finishAll() {
        const batch = pending.splice(0)
        await React.act(async () => {
          for (const motion of batch) motion.finish()
          await Promise.resolve()
        })
      },
    }
  }

  it('the card leaves, then the chrome mounts and settles, then the field goes live -- not overlapping', async () => {
    const motion = controlledMotion()
    try {
      const ui = await renderApp()
      await ui.click('tutorial-start')

      // 1. The card is leaving: still there, nothing else has moved.
      expect(ui.orientation()).not.toBeNull()
      expect(motion.pending.some((m) => m.element === ui.orientation())).toBe(true)
      expect(ui.chrome()).toEqual([])
      expect(ui.input().disabled).toBe(true)

      // 2. It has gone; the chrome is in and settling; the field waits.
      await motion.finishAll()
      expect(ui.orientation()).toBeNull()
      expect(ui.chrome()).toEqual(CHROME)
      expect(motion.pending.some((m) => m.element === ui.container.querySelector('.chrome'))).toBe(true)
      expect(ui.input().disabled).toBe(true)
      expect(ui.input().placeholder).toBe(GATED_ADDRESS_PLACEHOLDER)

      // 3. Settled: the field is live.
      await motion.finishAll()
      expect(ui.input().disabled).toBe(false)
      expect(ui.input().placeholder).toBe(ADDRESS_PLACEHOLDER)
    } finally {
      motion.restore()
    }
  })

  it('the boundary card waits for the chrome to settle', async () => {
    const motion = controlledMotion()
    try {
      const ui = await renderApp({
        registry: [{ stepId: 'boundary', title: 'Fixture: boundary', body: 'Draw the line.' }],
      })
      await ui.click('tutorial-start')
      await motion.finishAll()
      expect(ui.chrome()).toEqual(CHROME)
      expect(ui.find('tutorial-step-card')).toBeNull()
      await motion.finishAll()
      expect(ui.find('tutorial-step-card')).not.toBeNull()
    } finally {
      motion.restore()
    }
  })

  it('under prefers-reduced-motion it is a straight cut', async () => {
    const motion = controlledMotion()
    const original = window.matchMedia
    window.matchMedia = (query) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {} })
    try {
      const ui = await renderApp()
      await ui.click('tutorial-start')
      expect(motion.pending).toEqual([])
      expect(ui.orientation()).toBeNull()
      expect(ui.chrome()).toEqual(CHROME)
      expect(ui.input().disabled).toBe(false)
    } finally {
      window.matchMedia = original
      motion.restore()
    }
  })
})

describe('a returning person', () => {
  it('skips the gate entirely when orientation is already seen', async () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([ORIENTATION_ID]))
    const ui = await renderApp()
    expect(ui.orientation()).toBeNull()
    expect(ui.chrome()).toEqual(CHROME)
    expect(ui.input().disabled).toBe(false)
    expect(ui.input().placeholder).toBe(ADDRESS_PLACEHOLDER)
    expect(ui.find('tutorial-card')).toBeNull()
  })

  it('who dismissed the old deck is not re-taught', async () => {
    window.localStorage.setItem('keyline.tutorial.dismissed', '1')
    const ui = await renderApp({
      registry: [{ stepId: 'boundary', title: 'Fixture: boundary', body: 'Draw the line.' }],
    })
    expect(ui.orientation()).toBeNull()
    expect(ui.chrome()).toEqual(CHROME)
    // auto is off: the boundary card does not open by itself.
    expect(ui.find('tutorial-step-card')).toBeNull()
    expect(window.localStorage.getItem('keyline.tutorial.dismissed')).toBeNull()
  })
})
