/**
 * reportSamples.test.jsx
 *
 * THE THREE SAMPLE PAGES IN "THE REPORT", AND THE MAXIMISED VIEW.
 *
 * What is asserted is the part a stylesheet cannot carry and a screenshot
 * cannot prove: which pages are in the slots and what they are called, that
 * every image has an alt that says what the page shows, and the keyboard path
 * through the maximised view -- focus in, Tab held, Escape out, focus back to
 * the thumbnail that opened it. The geometry (a Letter page at 390px, the
 * legibility floor at desktop width) is reportSamples.browser.test.jsx's, in
 * a real engine.
 *
 * THE VIEW IS PORTALLED TO <body>, so the queries below read the document
 * rather than the component's own container.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import ReportSamples, {
  FULL_HEIGHT,
  FULL_WIDTH,
  OPEN_HINT,
  REPORT_PAGE_COUNT,
  SAMPLE_CAPTION,
  SAMPLE_PAGES,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  viewTitle,
} from './ReportSamples.jsx'
import { CLOSE_LABEL } from './tutorial/TutorialOverlay.jsx'

const mounted = new Set()

async function render() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const ui = {
    container,
    q: (id) => document.querySelector(`[data-testid="${id}"]`),
    view: () => document.querySelector('[data-testid="sample-view"]'),
    dialog: () => document.querySelector('[role="dialog"]'),
    opener: (id) => container.querySelector(`[data-testid="sample-open-${id}"]`),
    async press(id) {
      const el = ui.q(id)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    /** A key, dispatched where focus is, as a keyboard would. */
    async key(key, init = {}) {
      await React.act(async () => {
        const target = document.activeElement ?? document.body
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
      })
    },
    async unmount() {
      mounted.delete(ui)
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.add(ui)
  await React.act(async () => root.render(<ReportSamples />))
  return ui
}

afterEach(async () => {
  for (const ui of [...mounted]) await ui.unmount()
})

describe('1. the slots', () => {
  it('holds the climate, water and layout pages, labelled II, IV and VIII, in the report’s order', async () => {
    const ui = await render()
    const captions = [...ui.container.querySelectorAll('.sample figcaption')].map((f) => f.textContent)
    expect(captions).toEqual(['II · Climate', 'IV · Water & hydrology', 'VIII · The layout'])
    expect(SAMPLE_PAGES.map((s) => s.page)).toEqual([3, 11, 19])
    // The placeholders are gone from this section.
    expect(ui.container.querySelector('.sample-slot')).toBeNull()
    expect(ui.container.textContent).not.toMatch(/to come/)
    await ui.unmount()
  })

  it('gives every thumbnail an alt that says what the page shows', async () => {
    const ui = await render()
    const thumbs = [...ui.container.querySelectorAll('.sample__thumb')]
    expect(thumbs).toHaveLength(3)
    for (const [i, img] of thumbs.entries()) {
      const alt = img.getAttribute('alt')
      expect(alt).toBe(SAMPLE_PAGES[i].alt)
      // Not a slot number, and long enough to describe something.
      expect(alt).not.toMatch(/^sample page \d/i)
      expect(alt.split(' ').length).toBeGreaterThan(12)
      // Sized, so the slot holds its height before a lazy image arrives.
      expect(img.getAttribute('width')).toBe(String(THUMB_WIDTH))
      expect(img.getAttribute('height')).toBe(String(THUMB_HEIGHT))
      expect(img.getAttribute('loading')).toBe('lazy')
      // The thumbnail, not the full render, is what sits in the slot.
      expect(img.getAttribute('src')).toBe(SAMPLE_PAGES[i].thumb)
      expect(img.getAttribute('src')).not.toBe(SAMPLE_PAGES[i].full)
    }
    // Each is a real <button>, named by the alt plus what pressing it does.
    for (const sample of SAMPLE_PAGES) {
      const button = ui.opener(sample.id)
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('aria-haspopup')).toBe('dialog')
      expect(button.textContent.trim()).toBe(OPEN_HINT)
    }
    await ui.unmount()
  })

  it('says the pages are from the report for the author’s own land', async () => {
    const ui = await render()
    const note = ui.container.querySelector('.sample-note')
    expect(note.textContent).toBe(SAMPLE_CAPTION)
    expect(SAMPLE_CAPTION).toMatch(/my own/)
    expect(SAMPLE_CAPTION).toMatch(/Allegheny County, Pennsylvania/)
    await ui.unmount()
  })
})

describe('2. the maximised view', () => {
  it('opens the full render of the pressed page, in a labelled modal dialogue', async () => {
    const ui = await render()
    expect(ui.view()).toBeNull()
    await ui.press('sample-open-water')
    const dialog = ui.dialog()
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(title.textContent).toBe(viewTitle(SAMPLE_PAGES[1]))
    expect(title.textContent).toBe(`IV · Water & hydrology · page 11 of ${REPORT_PAGE_COUNT}`)

    const img = dialog.querySelector('img')
    expect(img.getAttribute('src')).toBe(SAMPLE_PAGES[1].full)
    expect(img.getAttribute('alt')).toBe(SAMPLE_PAGES[1].alt)
    expect(img.getAttribute('width')).toBe(String(FULL_WIDTH))
    expect(img.getAttribute('height')).toBe(String(FULL_HEIGHT))
    // The thumbnail is under it while it loads.
    expect(img.style.backgroundImage).toContain(SAMPLE_PAGES[1].thumb)

    expect(ui.opener('water').getAttribute('aria-expanded')).toBe('true')
    expect(ui.opener('climate').getAttribute('aria-expanded')).toBe('false')
    // The page scroll is locked under it.
    expect(document.documentElement.style.overflow).toBe('hidden')
    await ui.unmount()
  })

  it('takes focus, holds Tab inside, closes on Escape, and returns focus to the thumbnail', async () => {
    const ui = await render()
    const opener = ui.opener('climate')
    opener.focus()
    await ui.press('sample-open-climate')
    const dialog = ui.dialog()
    const scroll = ui.q('sample-view-scroll')
    const close = dialog.querySelector(`[aria-label="${CLOSE_LABEL}"]`)
    expect(document.activeElement, 'focus moves in, onto the scroller').toBe(scroll)

    // TAB IS HELD. The panel's controls in document order are the × and then
    // the scroller, so Tab off the scroller (the last) wraps to the × (the
    // first), and shift+Tab off the × wraps back to the scroller. The moves
    // BETWEEN them are the browser's own sequential focus, which jsdom does
    // not perform; the wraps are the part trapTab does, and the part tested.
    await ui.key('Tab')
    expect(document.activeElement).toBe(close)
    await ui.key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(scroll)
    await ui.key('Tab')
    expect(document.activeElement).toBe(close)

    // ESCAPE CLOSES, AND FOCUS GOES BACK TO THE THUMBNAIL THAT OPENED IT.
    await ui.key('Escape')
    expect(ui.view(), 'Escape closes the view').toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(opener.getAttribute('aria-expanded')).toBe('false')
    expect(document.documentElement.style.overflow).toBe('')
    await ui.unmount()
  })

  it('closes from the × and from the dim, back to the thumbnail each time', async () => {
    const ui = await render()
    await ui.press('sample-open-layout')
    await ui.press('sample-view-close')
    expect(ui.view()).toBeNull()
    expect(document.activeElement).toBe(ui.opener('layout'))

    await ui.press('sample-open-layout')
    await ui.press('sample-view-backdrop')
    expect(ui.view()).toBeNull()
    expect(document.activeElement).toBe(ui.opener('layout'))
    await ui.unmount()
  })

  it('shows one page at a time: opening another replaces it', async () => {
    const ui = await render()
    await ui.press('sample-open-climate')
    expect(ui.view().dataset.page).toBe('climate')
    // Close, then open another; the view is the other page's.
    await ui.key('Escape')
    await ui.press('sample-open-layout')
    expect(document.querySelectorAll('[data-testid="sample-view"]')).toHaveLength(1)
    expect(ui.view().dataset.page).toBe('layout')
    expect(ui.dialog().querySelector('img').getAttribute('src')).toBe(SAMPLE_PAGES[2].full)
    await ui.unmount()
  })
})
