/**
 * ReportSamples.jsx
 *
 * THREE PAGES FROM A REAL REPORT, in the "The report" section, and the
 * maximised view a press on any of them opens.
 *
 * THE PAGES ARE THE AUTHOR'S OWN. The report they come from was generated on
 * 30 September 2026 for the author's own land in Allegheny County,
 * Pennsylvania, with every data source answering. Using that property rather
 * than an anonymous one says the tool is used by the person who built it, and
 * invites scrutiny rather than deflecting it. The caption says so.
 *
 * WHY THESE THREE. They show different things, which matters more than three
 * good-looking pages: a chart (climate), a dense data page (water), and the
 * photographic deliverable (the layout over aerial photography). Someone
 * looking at all three sees that the report is designed, that it is
 * substantial, and that it ends with their property. If the set is ever
 * revised, three table pages would argue much less than these do.
 *
 * THE IMAGES ARE STATIC ASSETS, rendered once from the PDF and committed --
 * see src/assets/README.md for the source, the pages, the resolution and the
 * encoding. Two sizes per page: a thumbnail for the slot, and a 150 dpi render
 * of the Letter page for the maximised view. Only the thumbnails load with the
 * section, and lazily; the full page loads on maximise, over the thumbnail
 * scaled up as a placeholder until it arrives.
 *
 * THE MAXIMISED VIEW is a modal dialogue portalled to <body>, on the report
 * overlay's arrangement: focus moves in on open and is held there (Tab wraps;
 * trapTab is shared with the tutorial and the report overlay), Escape, the ×
 * and a press on the dim all close it, and focus goes back to the thumbnail
 * that opened it. The page scroll is locked under it.
 *
 * THE PAGE IS SHOWN AT A LEGIBLE WIDTH, AND SCROLLS. A US Letter page fitted
 * to a landscape screen's height is about 620px wide, and at that width the
 * water page's table figures -- 8.75pt in the PDF, the smallest type that has
 * to be read -- are under 9px. So the page never renders narrower than 48rem
 * where the screen allows it (figures at 11px), fits the screen's height only
 * where that gives more, and the panel scrolls for the rest. On a phone it is
 * a full-width render that scrolls, and pinch zoom works on top of that.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CLOSE_LABEL, trapTab } from './tutorial/TutorialOverlay.jsx'
import climateThumb from './assets/report/page-03-climate-thumb.webp'
import climateFull from './assets/report/page-03-climate.webp'
import waterThumb from './assets/report/page-11-water-thumb.webp'
import waterFull from './assets/report/page-11-water.webp'
import layoutThumb from './assets/report/page-19-layout-thumb.webp'
import layoutFull from './assets/report/page-19-layout.webp'

/** How many pages the source report runs to; the view's title counts against it. */
export const REPORT_PAGE_COUNT = 25

/** Pixel size of the full renders: 150 dpi of 8.5 × 11 in. */
export const FULL_WIDTH = 1275
export const FULL_HEIGHT = 1650

/** Pixel size of the thumbnails. */
export const THUMB_WIDTH = 480
export const THUMB_HEIGHT = 621

/**
 * THE THREE PAGES, IN THE REPORT'S ORDER. `label` is the slot's caption and
 * the report's own section numbering; `alt` says what the page shows, for the
 * thumbnail and the full page alike.
 */
export const SAMPLE_PAGES = Object.freeze([
  Object.freeze({
    id: 'climate',
    label: 'II · Climate',
    page: 3,
    alt:
      'Climate page: a water-balance chart of monthly precipitation against potential ' +
      'evaporation, with surplus and deficit shaded, above winter and summer wind roses.',
    thumb: climateThumb,
    full: climateFull,
  }),
  Object.freeze({
    id: 'water',
    label: 'IV · Water & hydrology',
    page: 11,
    alt:
      'Water and hydrology page: nine key figures, a table of wet ground by terrain, ' +
      'hydric soil and mapped wetland, a land-cover table for the parcel and the area ' +
      'draining onto it, and the FEMA flood zone.',
    thumb: waterThumb,
    full: waterFull,
  }),
  Object.freeze({
    id: 'layout',
    label: 'VIII · The layout',
    page: 19,
    alt:
      'The layout page: production blocks, tree zones, roads, water survey areas, fencing ' +
      'and a suggested structure site drawn over an aerial photograph of the parcel, with ' +
      'contours, streams, a scale bar and a legend.',
    thumb: layoutThumb,
    full: layoutFull,
  }),
])

/** Under the three slots. The report is for the author's own property, and says so. */
export const SAMPLE_CAPTION =
  'Pages from the report for my own 35 acres in Allegheny County, Pennsylvania.'

/** The visually hidden tail of each thumbnail's name: what pressing it does. */
export const OPEN_HINT = 'View at full size.'

/** The maximised view's title: the section, and where the page sits in the report. */
export function viewTitle(sample) {
  return `${sample.label} · page ${sample.page} of ${REPORT_PAGE_COUNT}`
}

export default function ReportSamples() {
  const [openId, setOpenId] = useState(null)
  // The thumbnail that opened the view, so focus can go back to it. A ref to
  // the ELEMENT rather than an index, which is what the view's cleanup needs.
  const openerRef = useRef(null)
  const open = SAMPLE_PAGES.find((sample) => sample.id === openId) ?? null

  return (
    <>
      <div className="sample-row">
        {SAMPLE_PAGES.map((sample) => (
          <figure className="sample" key={sample.id}>
            <button
              type="button"
              className="sample__open"
              aria-haspopup="dialog"
              aria-expanded={openId === sample.id}
              data-testid={`sample-open-${sample.id}`}
              onClick={(event) => {
                openerRef.current = event.currentTarget
                setOpenId(sample.id)
              }}
            >
              <img
                className="sample__thumb"
                src={sample.thumb}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                loading="lazy"
                decoding="async"
                alt={sample.alt}
              />
              <span className="visually-hidden"> {OPEN_HINT}</span>
            </button>
            <figcaption className="eyebrow">{sample.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="sample-note">{SAMPLE_CAPTION}</p>
      {open ? <SampleView sample={open} onClose={() => setOpenId(null)} returnTo={openerRef} /> : null}
    </>
  )
}

/**
 * The maximised page. Focus lands on the scroller, so the arrow keys move the
 * page the moment it opens; Tab goes on to the × and wraps.
 */
export function SampleView({ sample, onClose, returnTo }) {
  const scrollRef = useRef(null)
  const titleId = useId()

  // FOCUS IN, THE PAGE SCROLL LOCKED, AND BOTH UNDONE ON THE WAY OUT -- the
  // report overlay's arrangement. The cleanup runs on every way this leaves
  // the tree.
  useLayoutEffect(() => {
    const opener = returnTo?.current ?? document.activeElement
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    scrollRef.current?.focus({ preventScroll: true })
    return () => {
      root.style.overflow = previousOverflow
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [returnTo])

  // THE KEYS, ON THE DOCUMENT: Escape closes wherever focus has gone; Tab is
  // held inside the panel.
  const close = useCallback(() => onClose?.(), [onClose])
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        trapTab(event, scrollRef.current?.closest('.sample-view__panel'))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  return createPortal(
    <div className="sample-view" data-testid="sample-view" data-page={sample.id}>
      <div className="sample-view__backdrop" data-testid="sample-view-backdrop" onClick={close} />
      <div className="sample-view__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sample-view__head">
          <p className="sample-view__title eyebrow" id={titleId}>
            {viewTitle(sample)}
          </p>
          <button
            type="button"
            className="sample-view__close"
            aria-label={CLOSE_LABEL}
            data-testid="sample-view-close"
            onClick={close}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {/* A scroll region in the tab order, so the keyboard can move the
            page; labelled by the title so it is not an anonymous stop. */}
        <div
          ref={scrollRef}
          className="sample-view__scroll"
          tabIndex={0}
          role="region"
          aria-labelledby={titleId}
          data-testid="sample-view-scroll"
        >
          <img
            className="sample-view__page"
            src={sample.full}
            width={FULL_WIDTH}
            height={FULL_HEIGHT}
            decoding="async"
            alt={sample.alt}
            // The thumbnail, already in the cache, scaled up under the full
            // page until it arrives -- so the panel is never an empty box.
            style={{ backgroundImage: `url(${sample.thumb})` }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
