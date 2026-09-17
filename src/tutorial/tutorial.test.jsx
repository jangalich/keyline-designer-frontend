/**
 * tutorial.test.jsx
 *
 * THE TUTORIAL OVERLAY: when it opens by itself, how it is driven, what it
 * says, and what it looks like with no motion at all.
 *
 * WHAT IS ASSERTED AND WHERE. The behaviour -- auto-open after tiles, the
 * help control, dots, arrows, Esc, focus -- is driven through the SHIPPED
 * shell (WizardShell, with the rail mounting the help control) in jsdom, so
 * the launcher is exercised where it actually lives. The copy is asserted
 * against the strings of the spec, character for character, so a rewrite
 * fails rather than drifts. The treatment -- one accent, one period, no
 * literal, the resting frame under reduced motion -- is asserted off the
 * parsed stylesheet, as style.test.jsx does for the rest of the chrome,
 * because jsdom applies no stylesheet and computes no animation.
 *
 * TILES ARE SIMULATED THE WAY LEAFLET MARKS THEM. The launcher reads the
 * first paint off Leaflet's own `leaflet-tile-loaded` class (see
 * TutorialHelp); the harness adds exactly that class to a tile element and
 * nothing else, so the test holds the contract the launcher depends on.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SESSION_STORAGE_KEY, SessionProvider } from '../session/SessionStore'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import { STEP_DEFINITIONS, registryProposalFeatures } from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider } from '../wizard/WizardCursor.jsx'
import { CARDS } from './cards.jsx'
import { HELP_LABEL, TUTORIAL_DISMISSED_KEY } from './TutorialHelp.jsx'
import { BACK_LABEL, CLOSE_LABEL, DONE_LABEL, NEXT_LABEL } from './TutorialOverlay.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..')
const COMPONENTS = readFileSync(path.join(SRC, 'App.css'), 'utf8')

/** The spec's copy, verbatim. The cards must say exactly this. */
const COPY = [
  {
    title: "What you're looking at",
    body:
      'Everything sits on top of the map. Five places, and they stay where they are: the steps down the left, what to do next across the top, the measurements on the right, the tabs along the bottom, and the buttons for this step at the bottom right.',
  },
  {
    title: 'Draw your own',
    body:
      'Click to place each corner. Click the first corner to close. Available on the boundary, on production blocks, and on tree zones.',
  },
  {
    title: 'Click to read',
    body:
      'Click a feature on the map, or its tab along the bottom, to see its measurements. This opens the panel on the right and changes nothing else.',
  },
  {
    title: 'Tick what you want',
    body:
      "A tab's checkbox controls whether that feature is drawn on the map. Untick it and it disappears; tick it and it comes back. What's on the map when you commit is what gets committed.",
  },
]

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ===========================================================================
   Stylesheet helpers -- the same reading style.test.jsx makes
   =========================================================================== */

const decl = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The tutorial's own section of App.css, comments stripped. */
const TUTORIAL_CSS = (() => {
  const start = COMPONENTS.indexOf('/* --- The tutorial ---')
  expect(start).toBeGreaterThan(-1)
  return decl(COMPONENTS.slice(start))
})()

function ruleFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|[,}])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  return match ? match[2] : null
}

function propsOf(block) {
  const out = {}
  for (const line of (block ?? '').split(';')) {
    const [prop, ...rest] = line.split(':')
    if (rest.length) out[prop.trim()] = rest.join(':').trim()
  }
  return out
}

/** Every `selector { body }` pair in a stylesheet fragment, keyframes included. */
function rulesOf(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [
    selector.trim(),
    body.trim(),
  ])
}

/* ===========================================================================
   Harness
   =========================================================================== */

function installFetch() {
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    if (url.pathname === '/api/steps') {
      return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    }
    throw new Error(`no route for ${init.method ?? 'GET'} ${url.pathname}`)
  })
}

/** A tile pane the way Leaflet builds one, with one tile not yet loaded. */
function mountTilePane() {
  const pane = document.createElement('div')
  pane.className = 'leaflet-pane leaflet-tile-pane'
  const tile = document.createElement('img')
  tile.className = 'leaflet-tile'
  pane.appendChild(tile)
  document.body.appendChild(pane)
  return { pane, tile }
}

const mounted = new Set()

async function renderShell() {
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

  await React.act(async () => {
    root.render(
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          {/* The stage App.jsx puts the chrome in: the overlay lives inside it. */}
          <div className="map-stage" data-testid="stage">
            <WizardShell />
          </div>
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  const find = (id) => document.querySelector(`[data-testid="${id}"]`)

  return {
    container,
    find,
    dialog: () => find('tutorial-card'),
    stage: () => container.querySelector('[data-testid="stage"]'),
    help: () => container.querySelector('[data-testid="tutorial-help"]'),
    title: () => find('tutorial-title')?.textContent,
    async click(id) {
      const el = find(id)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    async key(key, init = {}) {
      await React.act(async () => {
        const target = document.activeElement ?? document.body
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
      })
    },
    /** Leaflet's mark on a painted tile, and a tick for the observer. */
    async paintTiles() {
      const { tile } = mountTilePane()
      await React.act(async () => {
        tile.classList.add('leaflet-tile-loaded')
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    unmount: handle.unmount,
  }
}

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const handle of [...mounted]) await handle.unmount()
  for (const pane of document.querySelectorAll('.leaflet-tile-pane')) pane.remove()
})

/* ===========================================================================
   1. AUTO-OPEN, EXACTLY ONCE
   =========================================================================== */

describe('1. auto-open', () => {
  it('opens once, with no dismissal on record, after the tiles paint and not before', async () => {
    const ui = await renderShell()

    // NOT ON MOUNT. Nothing has painted; there is nothing to teach over.
    expect(ui.dialog()).toBeNull()

    // AND NOT BY SCROLLING THE PAGE TO ITSELF. Taking focus must not drag a
    // reader at the top of the page down to the map.
    const focus = vi.spyOn(window.HTMLElement.prototype, 'focus')
    await ui.paintTiles()
    expect(ui.dialog()).not.toBeNull()
    expect(focus).toHaveBeenCalled()
    for (const call of focus.mock.calls) expect(call[0]).toEqual({ preventScroll: true })
    focus.mockRestore()
    // At card 1.
    expect(ui.title()).toBe(COPY[0].title)

    // Closing writes the preference, beside the session id's key.
    await ui.click('tutorial-close')
    expect(ui.dialog()).toBeNull()
    expect(TUTORIAL_DISMISSED_KEY).toBe('keyline.tutorial.dismissed')
    expect(window.localStorage.getItem(TUTORIAL_DISMISSED_KEY)).not.toBeNull()

    // ONCE. Another paint in the same page does not bring it back.
    await ui.paintTiles()
    expect(ui.dialog()).toBeNull()
    await ui.unmount()

    // Nor a fresh mount on a later visit: the key is the memory.
    const again = await renderShell()
    await again.paintTiles()
    expect(again.dialog()).toBeNull()
    await again.unmount()
  })

  it('does not auto-open when the dismissal key is set', async () => {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    await ui.paintTiles()
    expect(ui.dialog()).toBeNull()
    // The help control is still the way in.
    expect(ui.help()).not.toBeNull()
    await ui.unmount()
  })

  it('does not auto-open for a user resuming a session', async () => {
    // A session id in storage is what a resume reads: not a first session.
    window.localStorage.setItem(SESSION_STORAGE_KEY, 'sess-existing')
    const stored = await renderShell()
    await stored.paintTiles()
    expect(stored.dialog()).toBeNull()
    await stored.unmount()

    // And a session in the URL is an explicit instruction to open one.
    window.localStorage.clear()
    window.history.replaceState({}, '', '/?session=sess-linked')
    const linked = await renderShell()
    await linked.paintTiles()
    expect(linked.dialog()).toBeNull()
    await linked.unmount()
  })

  it('is not session state: nothing about it is written anywhere but localStorage', () => {
    const store = readFileSync(path.join(SRC, 'session', 'SessionStore.jsx'), 'utf8')
    expect(store).not.toContain('tutorial')
    const cursor = readFileSync(path.join(SRC, 'wizard', 'WizardCursor.jsx'), 'utf8')
    expect(cursor).not.toContain('tutorial')
    const definitions = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    expect(definitions).not.toContain('tutorial')
  })
})

/* ===========================================================================
   2. THE HELP CONTROL
   =========================================================================== */

describe('2. the help control', () => {
  it('is its own control on the chrome, not a row of the rail, and opens the overlay at card 1', async () => {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    const help = ui.help()

    expect(help.tagName).toBe('BUTTON')
    expect(help.getAttribute('aria-label')).toBe(HELP_LABEL)
    expect(HELP_LABEL).toBe('How the map works')

    // A DIRECT CHILD OF THE OVERLAY, beside the regions and inside none of
    // them -- least of all the rail, where it read as an eighth step.
    const chrome = ui.container.querySelector('.chrome')
    expect(help.parentElement).toBe(chrome)
    const rail = ui.container.querySelector('[data-testid="step-rail"]')
    expect(rail.contains(help)).toBe(false)
    expect(readFileSync(path.join(SRC, 'wizard', 'shell', 'StepRail.jsx'), 'utf8')).not.toContain('Tutorial')

    // IN THE BOTTOM-LEFT CORNER, with the action buttons' casing: the
    // bottom row's gutter track, at the area's start and end edges.
    const rule = propsOf(ruleFor(decl(COMPONENTS), '.chrome-help'))
    expect(rule['grid-area']).toBe('bottom')
    expect(rule['justify-self']).toBe('start')
    expect(rule['align-self']).toBe('end')
    expect(rule['box-shadow']).toBe('var(--casing-control)')
    expect(rule.background).toBe('var(--paper)')
    expect(rule.border).toBe('var(--hairline)')
    expect(rule['border-radius']).toBe('50%')
    expect(rule).not.toHaveProperty('outline')

    await ui.click('tutorial-help')
    expect(ui.dialog()).not.toBeNull()
    expect(ui.title()).toBe(COPY[0].title)
    expect(help.getAttribute('aria-expanded')).toBe('true')

    // AND THE OVERLAY IS IN THE MAP: inside the stage, over the chrome, and
    // not on the page around it.
    expect(ui.stage().contains(ui.dialog())).toBe(true)
    expect(ui.find('tutorial').parentElement).toBe(ui.stage())
    await ui.unmount()
  })

  it('stows the card into the control on close, and closes at once where nothing animates', async () => {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()

    // jsdom has no animate(): the close is immediate (every other test here
    // relies on that). With one, the card runs a motion toward the control
    // and the close waits for it.
    const calls = []
    let finish = null
    const finished = new Promise((resolve) => {
      finish = resolve
    })
    const original = window.HTMLElement.prototype.animate
    window.HTMLElement.prototype.animate = function animate(keyframes, options) {
      calls.push({ element: this, keyframes, options })
      return { finished, cancel() {} }
    }
    // Give the card and the control a place to measure from.
    const rect = (x, y, w, h) => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h })
    ui.help().getBoundingClientRect = () => rect(20, 700, 32, 32)
    ui.help().focus()
    await ui.click('tutorial-help')
    ui.dialog().getBoundingClientRect = () => rect(400, 160, 480, 470)

    try {
      window.localStorage.removeItem(TUTORIAL_DISMISSED_KEY)
      await ui.click('tutorial-close')
      // Not gone yet: the motion is running. The preference is already
      // written, though: the user decided, and a reload mid-motion keeps it.
      expect(ui.dialog()).not.toBeNull()
      expect(window.localStorage.getItem(TUTORIAL_DISMISSED_KEY)).not.toBeNull()
      const card = calls.find((c) => c.element === ui.dialog())
      expect(card).toBeDefined()
      // Toward the control's centre (36, 716) from the card's (640, 395).
      const end = card.keyframes[card.keyframes.length - 1]
      expect(end.transform).toContain('translate(-604px, 321px)')
      expect(end.transform).toContain('scale(')
      expect(end.opacity).toBe(0)
      // The control takes it with a pulse.
      expect(calls.some((c) => c.element === ui.help())).toBe(true)

      await React.act(async () => {
        finish()
        await finished
      })
      expect(ui.dialog()).toBeNull()
      expect(document.activeElement).toBe(ui.help())
    } finally {
      window.HTMLElement.prototype.animate = original
    }
    await ui.unmount()
  })

  it('moves focus into the card on open, and back to the control on close', async () => {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    const help = ui.help()
    help.focus()
    expect(document.activeElement).toBe(help)

    await ui.click('tutorial-help')
    const dialog = ui.dialog()
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)

    await ui.click('tutorial-close')
    expect(ui.dialog()).toBeNull()
    expect(document.activeElement).toBe(help)

    // The same on the keyboard's way out.
    await ui.click('tutorial-help')
    expect(ui.dialog()).not.toBeNull()
    await ui.key('Escape')
    expect(ui.dialog()).toBeNull()
    expect(document.activeElement).toBe(help)
    await ui.unmount()
  })
})

/* ===========================================================================
   3. DRIVING IT
   =========================================================================== */

describe('3. paging and closing', () => {
  async function openViaHelp() {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    await ui.click('tutorial-help')
    return ui
  }

  it('pages with the dots, which are buttons that mark the current card', async () => {
    const ui = await openViaHelp()
    const dots = [...document.querySelectorAll('[data-testid="tutorial-dots"] button')]
    expect(dots).toHaveLength(CARDS.length)
    expect(dots[0].getAttribute('aria-current')).toBe('true')

    await ui.click('tutorial-dot-3')
    expect(ui.title()).toBe(COPY[2].title)
    expect(ui.find('tutorial-dot-3').getAttribute('aria-current')).toBe('true')
    expect(ui.find('tutorial-dot-1').getAttribute('aria-current')).toBeNull()

    await ui.click('tutorial-dot-1')
    expect(ui.title()).toBe(COPY[0].title)
    await ui.unmount()
  })

  it('pages with the arrow keys, and stops at either end', async () => {
    const ui = await openViaHelp()
    await ui.key('ArrowLeft')
    expect(ui.title()).toBe(COPY[0].title)
    await ui.key('ArrowRight')
    expect(ui.title()).toBe(COPY[1].title)
    await ui.key('ArrowRight')
    await ui.key('ArrowRight')
    expect(ui.title()).toBe(COPY[3].title)
    await ui.key('ArrowRight')
    expect(ui.title()).toBe(COPY[3].title)
    await ui.key('ArrowLeft')
    expect(ui.title()).toBe(COPY[2].title)
    await ui.unmount()
  })

  it('pages with Back and Next; the last card reads Got it and closes', async () => {
    const ui = await openViaHelp()
    const back = ui.find('tutorial-back')
    const next = ui.find('tutorial-next')
    expect(back.textContent).toBe(BACK_LABEL)
    expect(back.disabled).toBe(true)
    expect(next.textContent).toBe(NEXT_LABEL)

    await ui.click('tutorial-next')
    expect(ui.title()).toBe(COPY[1].title)
    expect(ui.find('tutorial-back').disabled).toBe(false)
    await ui.click('tutorial-back')
    expect(ui.title()).toBe(COPY[0].title)

    for (let i = 1; i < CARDS.length; i += 1) await ui.click('tutorial-next')
    expect(ui.title()).toBe(COPY[3].title)
    expect(ui.find('tutorial-next').textContent).toBe(DONE_LABEL)
    await ui.click('tutorial-next')
    expect(ui.dialog()).toBeNull()
    await ui.unmount()
  })

  it('closes on Esc, on the ×, and on the backdrop -- and offers no Skip', async () => {
    const ui = await openViaHelp()
    await ui.key('Escape')
    expect(ui.dialog()).toBeNull()

    await ui.click('tutorial-help')
    await ui.click('tutorial-backdrop')
    expect(ui.dialog()).toBeNull()

    await ui.click('tutorial-help')
    const close = ui.find('tutorial-close')
    expect(close.getAttribute('aria-label')).toBe(CLOSE_LABEL)
    const labels = [...ui.dialog().querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent
    )
    expect(labels.filter((l) => /skip/i.test(l))).toEqual([])
    await ui.click('tutorial-close')
    expect(ui.dialog()).toBeNull()
    await ui.unmount()
  })

  it('holds Tab inside the card, and every control in it is a real button', async () => {
    const ui = await openViaHelp()
    const dialog = ui.dialog()
    const controls = [...dialog.querySelectorAll('[onclick], button, a, [tabindex]')]
    for (const el of controls) {
      if (el === dialog) continue
      expect(el.tagName).toBe('BUTTON')
    }
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')]
    focusable[focusable.length - 1].focus()
    await ui.key('Tab')
    expect(document.activeElement).toBe(focusable[0])
    await ui.key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
    await ui.unmount()
  })

  it('is the only thing that takes pointer events while it is up', () => {
    // A fixed, full-viewport layer above the page, with a full backdrop under
    // the card: every click that is not on the card is on the backdrop.
    const overlay = propsOf(ruleFor(TUTORIAL_CSS, '.tutorial'))
    expect(overlay.position).toBe('absolute')
    expect(overlay.inset).toBe('0')
    expect(Number(overlay['z-index'])).toBeGreaterThan(400)
    const backdrop = propsOf(ruleFor(TUTORIAL_CSS, '.tutorial__backdrop'))
    expect(backdrop.position).toBe('absolute')
    expect(backdrop.inset).toBe('0')
    expect(backdrop.background).toBe('var(--scrim)')
  })
})

/* ===========================================================================
   4. THE COPY
   =========================================================================== */

describe('4. the copy', () => {
  it('renders all four cards verbatim', async () => {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    await ui.click('tutorial-help')
    expect(CARDS).toHaveLength(COPY.length)
    for (let i = 0; i < COPY.length; i += 1) {
      await ui.click(`tutorial-dot-${i + 1}`)
      expect(ui.find('tutorial-title').textContent).toBe(COPY[i].title)
      expect(ui.find('tutorial-body').textContent).toBe(COPY[i].body)
    }
    await ui.unmount()
  })

  it('names regions by position, never by internal name', () => {
    for (const { title, body } of CARDS) {
      for (const text of [title, body]) {
        expect(text).not.toMatch(/StepRail|InstructionBar|DetailPanel|TabStrip|ActionBanner|chrome|rail|banner|strip/)
      }
    }
  })
})

/* ===========================================================================
   5. THE DIAGRAMS, WITH NO MOTION
   =========================================================================== */

describe('5. reduced motion', () => {
  it('lands every diagram on its resting frame and hides the cursor', () => {
    const reduced = TUTORIAL_CSS.slice(TUTORIAL_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.tutorial-anim \*\s*\{\s*animation:\s*none;?\s*\}/)
    expect(reduced).toMatch(/\.tutorial-anim__cursor\s*\{\s*display:\s*none;?\s*\}/)
  })

  it('draws every diagram finished in the markup: nothing in it rests hidden but the cursor and the leaders', async () => {
    // WHAT MAKES A CARD LEGIBLE WITHOUT MOTION is that the base rule for
    // every animated element is the finished state. The only base rules
    // allowed to hide anything are the cursor's and the transient leaders'.
    const hidden = rulesOf(TUTORIAL_CSS)
      .filter(([selector]) => !selector.startsWith('@') && !/^\d/.test(selector))
      .filter(([, body]) => /(^|;)\s*opacity:\s*0\s*(;|$)/.test(body) || /display:\s*none/.test(body))
      .map(([selector]) => selector)
    // (The cursor's selector appears twice: once resting hidden, once under
    // reduced motion; the claim is about WHICH selectors, not how often.)
    expect([...new Set(hidden)].sort()).toEqual(['.tutorial-anim__cursor', '.tutorial-anim__leader'].sort())

    // AND THE RESTING CONTENT IS IN THE DOM of every card, which is what a
    // reader with animations off is looking at: the ring's acreage, the
    // panel's figures, both tabs ticked with the commit, five regions.
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
    const ui = await renderShell()
    await ui.click('tutorial-help')

    const figure = () => ui.find('tutorial-figure')
    expect(figure().querySelectorAll('.tutorial-anim__region')).toHaveLength(5)

    await ui.click('tutorial-dot-2')
    expect(figure().querySelectorAll('.tutorial-anim__corner')).toHaveLength(5)
    expect(figure().querySelector('.tutorial-anim__ring')).not.toBeNull()
    expect(figure().textContent).toContain('4.0')
    expect(figure().textContent).toContain('acres')

    await ui.click('tutorial-dot-3')
    expect(figure().querySelectorAll('.tutorial-anim__block')).toHaveLength(3)
    expect(figure().querySelectorAll('.tutorial-anim__tab')).toHaveLength(3)
    expect(figure().querySelector('.tutorial-anim__mark')).not.toBeNull()
    expect(figure().querySelector('.tutorial-anim__tab-mark')).not.toBeNull()
    expect(figure().querySelector('.tutorial-anim__panel')).not.toBeNull()
    expect(figure().textContent).toContain('42.4')
    expect(figure().textContent).toContain('/100 score')
    // The three clicks: block, bare ground, tab -- the mark and the panel go
    // out and come back once between the first click and the last.
    const markStart = TUTORIAL_CSS.indexOf('@keyframes tutorial-read-mark')
    const mark = TUTORIAL_CSS.slice(markStart, TUTORIAL_CSS.indexOf('@keyframes', markStart + 1))
    expect(mark.match(/opacity: 1/g)).toHaveLength(2)
    expect(mark.match(/opacity: 0/g)).toHaveLength(3)
    expect(ruleFor(TUTORIAL_CSS, '.tutorial-anim__tab-mark--read')).toContain('tutorial-read-mark')

    await ui.click('tutorial-dot-4')
    expect(figure().querySelectorAll('.tutorial-anim__block')).toHaveLength(2)
    expect(figure().querySelectorAll('.tutorial-anim__tick')).toHaveLength(2)
    expect(figure().querySelector('.tutorial-anim__commit')).not.toBeNull()

    // THE ZONES ARE THE MAP'S: every block is hatched from a pattern in its
    // own diagram, in the map's tokens (oxide rising for production, tree
    // falling for trees), and its outline is a curve, not a polygon.
    for (const card of [2, 3, 4]) {
      await ui.click(`tutorial-dot-${card}`)
      const patterns = [...figure().querySelectorAll('pattern')]
      expect(patterns.length, `card ${card} defines its hatch`).toBeGreaterThan(0)
      for (const block of figure().querySelectorAll('.tutorial-anim__block, .tutorial-anim__ring')) {
        const ref = block.getAttribute('fill')
        expect(ref).toMatch(/^url\(#tutorial-hatch-/)
        expect(patterns.map((p) => p.id)).toContain(ref.slice(5, -1))
      }
      for (const block of figure().querySelectorAll('.tutorial-anim__block')) {
        expect(block.tagName.toLowerCase()).toBe('path')
        expect(block.getAttribute('d')).toMatch(/C/)
      }
    }
    expect(propsOf(ruleFor(TUTORIAL_CSS, '.tutorial-anim__hatch--production')).stroke).toBe('var(--oxide)')
    expect(propsOf(ruleFor(TUTORIAL_CSS, '.tutorial-anim__hatch--tree')).stroke).toBe('var(--tree)')
    expect(propsOf(ruleFor(TUTORIAL_CSS, '.tutorial-anim__screen')).fill).toBe('var(--rule)')
    // Spacing 8, weight 1: the map's own.
    expect(propsOf(ruleFor(TUTORIAL_CSS, '.tutorial-anim__hatch'))['stroke-width']).toBe('1')
    await ui.click('tutorial-dot-3')
    expect(figure().querySelector('pattern').getAttribute('width')).toBe('8')

    // Every card that shows a gesture carries a cursor glyph to hide -- the
    // overview shows none, it has no gesture -- and every diagram is marked
    // decorative: the copy above it is what a screen reader gets.
    for (let i = 1; i <= CARDS.length; i += 1) {
      await ui.click(`tutorial-dot-${i}`)
      expect(figure().querySelector('.tutorial-anim__cursor') != null).toBe(i !== 1)
      expect(figure().querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    }
    await ui.unmount()
  })

  it('runs every element of a card on one period, stated as percentages', () => {
    // ONE duration, declared once for everything a diagram draws; no element
    // sets its own, and none is delayed -- a delay is a second period.
    const durations = rulesOf(TUTORIAL_CSS).filter(([, body]) => /animation-duration/.test(body))
    expect(durations.map(([selector]) => selector)).toEqual(['.tutorial-anim *'])
    expect(propsOf(durations[0][1])['animation-duration']).toBe('var(--loop)')
    expect(TUTORIAL_CSS).not.toMatch(/animation-delay/)
    // Nor a shorthand carrying a time of its own.
    expect(TUTORIAL_CSS).not.toMatch(/animation:\s*[^;]*\d+m?s/)

    // Every keyframe selector is a percentage of that period.
    const keyframes = TUTORIAL_CSS.match(/@keyframes[^{]+\{[\s\S]*?\}\s*\}/g) ?? []
    expect(keyframes.length).toBeGreaterThan(20)
    for (const block of keyframes) {
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
      for (const [selector] of rulesOf(inner)) {
        for (const stop of selector.split(',')) expect(stop.trim()).toMatch(/^\d+(\.\d+)?%$/)
      }
    }
  })
})

/* ===========================================================================
   6. THE TREATMENT
   =========================================================================== */

describe('6. the treatment', () => {
  it('names no colour: no hex literal, no rgb(), in the new CSS or the new components', () => {
    expect(TUTORIAL_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(TUTORIAL_CSS).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
    for (const file of ['cards.jsx', 'animations.jsx', 'TutorialOverlay.jsx', 'TutorialHelp.jsx']) {
      const source = readFileSync(path.join(HERE, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // A pattern reference is a paint server in the same tree, not a colour.
        .replace(/url\(#tutorial-hatch-[a-z-]+\)/g, 'url()')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], file).toEqual([])
      expect(source, file).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/)
      // No colour and no face set inline: the tokens live in the stylesheet.
      // The one inline fill is the hatch reference, allowed above.
      expect(source, file).not.toMatch(/\b(stroke|color|fontFamily)=/)
      expect(source.match(/\bfill=(?!\{?[`"]url\()/g) ?? [], file).toEqual([])
    }
    for (const [prop, value] of Object.entries(propsOf(TUTORIAL_CSS.replace(/[^{}]+\{|\}/g, ';')))) {
      if (!/^(color|background|background-color|border-color|outline-color|fill|stroke)$/.test(prop)) continue
      if (/^(none|transparent|inherit|currentColor|0)$/.test(value)) continue
      expect(value, prop).toMatch(/var\(--/)
    }
  })

  it('gives oxide to the forward control and nothing else in the card', () => {
    const oxide = rulesOf(TUTORIAL_CSS)
      .filter(([, body]) => /--oxide/.test(body))
      .map(([selector]) => selector)
    expect(oxide.length).toBeGreaterThan(0)
    // THE ONE EXCEPTION IS THE MAP'S OWN MARK: a production block is hatched
    // in --oxide on the real map, and a diagram of one is hatched the same
    // way. It is a mark on ground inside the diagram, never a control.
    const mapMarks = ['.tutorial-anim__hatch--production', '.tutorial-anim__block--production']
    for (const selector of oxide) {
      if (mapMarks.includes(selector)) continue
      expect(selector).toMatch(/^\.tutorial__button--primary/)
    }
    for (const selector of ['.tutorial__dot', '.tutorial__close', '.tutorial__button']) {
      expect(ruleFor(TUTORIAL_CSS, selector)).not.toContain('--oxide')
    }
    // The help control is not oxide either.
    expect(ruleFor(decl(COMPONENTS), '.chrome-help')).not.toContain('--oxide')
    // The diagrams' own commit button is ink, not a second accent.
    expect(ruleFor(TUTORIAL_CSS, 'rect.tutorial-anim__solid,\n.tutorial-anim__commit rect')).toContain('var(--ink)')
  })

  it('sets the data face with tabular figures on measured values, and on nothing else', () => {
    const value = propsOf(ruleFor(TUTORIAL_CSS, '.tutorial-anim__value'))
    expect(value['font-family']).toBe('var(--font-data)')
    expect(value['font-variant-numeric']).toBe('tabular-nums')
    const mono = rulesOf(TUTORIAL_CSS)
      .filter(([, body]) => /--font-data/.test(body))
      .map(([selector]) => selector)
    expect(mono).toEqual(['.tutorial-anim__value'])
    // Value left, label right, as the real panel prints them.
    const animations = readFileSync(path.join(HERE, 'animations.jsx'), 'utf8')
    expect(animations).toMatch(/tutorial-anim__value[\s\S]*?tutorial-anim__label/)
  })

  it('is a card: opaque surface, hairline, radius, and a visible ring on every control', () => {
    const card = propsOf(ruleFor(TUTORIAL_CSS, '.tutorial__card'))
    expect(card.background).toBe('var(--paper)')
    expect(card.border).toBe('var(--hairline)')
    expect(card['border-radius']).toBe('var(--radius)')
    // Fits a narrow viewport: never wider than the frame, never taller.
    expect(card.width).toContain('100%')
    expect(card['max-height']).toBe('100%')
    expect(TUTORIAL_CSS).not.toMatch(/outline:\s*(none|0)\b/)
    expect(propsOf(ruleFor(TUTORIAL_CSS, '.tutorial__button--primary:focus-visible'))['outline-color']).toBe('var(--ink)')
    // The help control's ring is restated ROUND, never removed.
    const help = propsOf(ruleFor(decl(COMPONENTS), '.chrome-help:focus-visible'))
    expect(help['border-radius']).toBe('50%')
    expect(help).not.toHaveProperty('outline')
  })
})
