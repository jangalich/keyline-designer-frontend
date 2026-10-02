/**
 * ReportPage.jsx  —  THE REPORT PAGE: WHAT THE SITE DATA REPORT IS, THREE
 * PAGES OF THE USER'S OWN, AND THE PLACE THE REST IS GOT.
 *
 * The route /report?session=…, reached from the delivery card and from a
 * link. It replaced the report overlay (a modal over the map stage) at this
 * branch, and the reasons are two.
 *
 * THE OVERLAY WAS A TABLE OF CONTENTS, and a table of contents does not
 * sell anything. It listed eight sections and what was in them, and never
 * said what the report IS or what assembling it by hand would cost. The
 * eight rows flattened the figures that argue hardest -- the seasonal water
 * table, the road-construction ratings, site index by species, design storm
 * depths -- into a list where nothing stood out.
 *
 * AND THIS IS WHERE THE TRANSACTION WILL HAPPEN. A checkout wants its own
 * URL: linkable, it survives a refresh, the back button behaves, and a
 * payment provider expects a return URL. A modal hosting a transaction is
 * fighting its container. docs/frontend-design-guide.md records the rule
 * this is the first case of.
 *
 *
 * WHAT THE PAGE SAYS, IN THIS ORDER
 *
 *   1. WHAT IT IS. Two sentences, in the honest frame: the desk study a
 *      consultant assembles before a site visit, a day's work across four
 *      public services, compiled for this parcel in under a minute.
 *   2. FOUR NAMED FIGURES, not eight section summaries: the ones that are
 *      specific, checkable, and absent from the interactive map.
 *   3. THE USER'S OWN LANDFORM PAGES, generated on arrival. Three of the
 *      report's twenty-four, from their own land, free -- and said plainly.
 *      Landform is the one section built entirely from data the session
 *      already holds (the DEM and its derivations), so these come off the
 *      same machinery as the paid pages with no network call: the reader is
 *      not shown a demonstration, they are holding part of their report.
 *   4. THE CONTENTS, as the overlay listed them -- supporting detail now,
 *      not the main event.
 *   5. THE FOOT: room for the price and the purchase action. Until payment
 *      lands, the action generates the report as it always has, with its
 *      progress bar and its download; the row's two ends are the price's
 *      and the purchase's, and nothing here says "buy".
 *
 *
 * THE PAGE IS A LAYER OVER THE WIZARD, NOT A REPLACEMENT FOR IT (App.jsx).
 * The wizard page and its map stay mounted underneath, inert and hidden
 * from assistive tech, with the document scroll locked so its position
 * survives. Going back is this layer leaving: no hydration (the session
 * provider is above both pages), no map fit (ResumeFit fires once, on the
 * resume landing, and a layer leaving is not that), no tiles refetched.
 * The alternative -- swapping components per route -- remounts the map at
 * the default view with the design off screen.
 *
 * THE RESUME PATH IS THE WIZARD'S. The session provider reads ?session=
 * off the URL on mount whatever the pathname, so a bookmark, a refresh and
 * a return from a payment provider all hydrate through the one path. This
 * page reads the store's resume state and says what it finds: loading, a
 * design, no design on this link, or a server that did not answer.
 *
 * THE WAIT FOR THE PAGES HAS NO PROGRESS BAR. Measured at about two
 * seconds on the server (landform_pages.py); the page's own text is
 * readable while they come, and one quiet line marks the slots. The full
 * report's wait keeps its bar: that one is a minute of fetches and reports
 * its own count.
 *
 * FOCUS. On arrival FROM THE WIZARD it moves to the page's heading, so a
 * keyboard user starts at the top of the new page rather than on the card's
 * button under the layer; on leaving it goes back to that button. A direct
 * load is a fresh document, and the browser's own starting point is the
 * right one -- moving focus there would draw a focus ring round the title
 * for a person who has pressed nothing.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import {
  REPORT_EXPIRED,
  REPORT_FAILED_STATUS,
  REPORT_READY_STATUS,
  REPORT_WORKING,
  readSessionIdFromUrl,
  selectReport,
  selectReportIsOffered,
  selectResumeState,
  selectSessionError,
  selectSessionId,
  useSession,
} from '../session/SessionStore'
import { SampleView } from '../ReportSamples.jsx'
import ReportProgress from '../wizard/shell/ReportProgress.jsx'
import { WIZARD_PATH, navigate, withCurrentSearch } from '../router.jsx'
import { PAGES_FAILED, PAGES_READY, useLandformPages } from './landformPages.js'

export const PAGE_TITLE = 'Your site data report'
export const DOCUMENT_TITLE = 'Your site data report — Keyline Designer'
export const BACK_LABEL = 'Back to your design'

/**
 * 1. WHAT IT IS. The honest frame, and the cost of doing it by hand. No
 * exclusivity is claimed: it is public data and the value is the assembly,
 * which is more credible to a consultant who knows where it comes from than
 * anything that implies otherwise.
 */
export const PAGE_LEDE = [
  'This is the desk study a consultant assembles before a site visit: a day’s work across ' +
    'Web Soil Survey, the National Map, NOAA and the NHD viewer, compiled for this parcel in ' +
    'under a minute.',
  'Twenty-four pages of public survey data, every figure specific to your land or its region, ' +
    'laid out in maps, charts and tables you can hand to a contractor.',
]

/**
 * 2. THE FOUR FIGURES. Specific, checkable, and not on the interactive map.
 * Each is a name and one line about what it says; the name is what carries
 * weight, so the list is four names rather than four paragraphs.
 */
export const KEY_FIGURES = Object.freeze([
  Object.freeze({
    id: 'water-table',
    name: 'The seasonal water table, month by month',
    body: 'How high the water sits under each soil in every month of the year, from the soil survey.',
  }),
  Object.freeze({
    id: 'road-ratings',
    name: 'The soil survey’s road-construction ratings',
    body: 'Whether each soil will carry a lane, and what limits it.',
  }),
  Object.freeze({
    id: 'site-index',
    name: 'Site index by species',
    body: 'What each tree species grows to on this soil, by the survey’s own measure.',
  }),
  Object.freeze({
    id: 'design-storms',
    name: 'Design storm depths',
    body: 'How much rain the storms a swale or a spillway is sized for drop here, from NOAA Atlas 14.',
  }),
])

export const FIGURES_HEADING = 'Four figures you will not find on the map'

/** 3. THE USER'S OWN PAGES. Said plainly: three of twenty-four, theirs, free. */
export const OWN_PAGES_HEADING = 'Three of its pages, from your land'
export const OWN_PAGES_BODY =
  'These are three of the report’s twenty-four pages, generated just now from your own land, ' +
  'and free: the Landform section, built from the same elevation model the map reads. The rest ' +
  'of the report is the other twenty-one.'
export const OWN_PAGES_WAITING = 'Making your Landform pages from your land…'
export const OWN_PAGES_LOADING_DESIGN = 'Loading your design…'
export const OWN_PAGES_FAILED =
  'Your Landform pages could not be made right now. Nothing about your design has changed. ' +
  'Try again in a moment.'

/** 4. THE CONTENTS' HEADING. The list itself is REPORT_CONTENTS, unchanged. */
export const CONTENTS_HEADING = 'What the report contains'

/**
 * THE SECTIONS, IN THE DOCUMENT'S ORDER, ENDING ON THE DESIGN -- the
 * overlay's list, as it read. Each line is a list of runs; a run marked
 * `strong` is one of the three the interactive map does not give. Parts
 * rather than markup, so the copy is data a test can read and the emphasis
 * is structural. The sources-and-methods back matter is not listed:
 * naming it invites the thought that some of the document is bookkeeping.
 */
export const REPORT_CONTENTS = Object.freeze([
  {
    id: 'overview',
    name: 'Site overview',
    lines: ['where the parcel sits in the surrounding landscape, buildings, power'],
  },
  {
    id: 'climate',
    name: 'Climate',
    lines: [
      'frost dates, the monthly balance of rainfall against evaporation, design ' +
        'storm depths, seasonal wind, severe weather',
    ],
  },
  {
    id: 'landform',
    name: 'Landform',
    lines: ['contours, slope classes, valleys and ridges, keypoints and keylines, a valley profile'],
  },
  {
    id: 'water',
    name: 'Water',
    lines: [
      'streams, wetlands, flood zone, ',
      { strong: 'the seasonal water table month by month' },
      ', wet ground measured three ways',
    ],
  },
  {
    id: 'access',
    name: 'Access',
    lines: [
      'road frontage, which edges you can drive onto, ',
      { strong: 'what the soil survey says about building a lane' },
    ],
  },
  {
    id: 'trees',
    name: 'Trees',
    lines: [
      'canopy extent and height, forest type, ',
      { strong: 'what each species yields on this soil' },
    ],
  },
  {
    id: 'soils',
    name: 'Soils',
    lines: [
      'every map unit mapped and tabled, texture, pH, organic matter, depth to ' +
        'bedrock, capability, bedrock geology',
    ],
  },
  {
    id: 'design',
    name: 'The design',
    lines: ['your layout over aerial photography, and a record of every choice you committed'],
  },
])

/** 5. THE ACTION, until the purchase replaces it. */
export const REPORT_LABEL = 'Generate the report'
export const REPORT_WORKING_LABEL = 'Making your report…'
export const DOWNLOAD_LABEL = 'Download the PDF'
export const NOT_OFFERED_COPY =
  'The report is generated from a finished design. Every step has to be committed first.'

/**
 * THE FAILURE COPY. Say what happened; ask for something only when there is
 * something to ask for.
 */
export const REPORT_FAILURE_COPY = Object.freeze({
  // ACTIONABLE, so it names the action -- the backend's `reopen_and_recommit`,
  // in this client's own words.
  [REPORT_EXPIRED]:
    'This session has been open a while and its working data has expired. ' +
    'Your design is safe. Reopen any step, commit it again, and the report ' +
    'will generate.',
  // NOT ACTIONABLE, so it asks for nothing. Read this for what it must never
  // acquire: "try again", "retry", "check your connection", "make sure", or
  // anything that puts the cause inside the user's design.
  default:
    'The report could not be made. Something outside your design did not ' +
    'answer. Nothing about your design is wrong and nothing about it has ' +
    'changed.',
})

/** `failed_layer.reason` values, as session_report sends them. */
export const SOURCE_UNAVAILABLE = 'source_unavailable'
export const NO_DATA_FOR_PARCEL = 'no_data_for_parcel'

/**
 * A NAMED SOURCE THAT DID NOT ANSWER, in the session-creation path's shape:
 * name the source, place the fault upstream, say the design is untouched.
 * The reason decides the last sentence: an outage passes, so it says to try
 * again in a moment; a source with no coverage for this land will say the
 * same thing tomorrow, so that copy says so and asks for nothing.
 */
function sourceFailureCopy({ label, reason }) {
  if (reason === NO_DATA_FOR_PARCEL) {
    return (
      `The public ${label} do not cover this land, so the report cannot be ` +
      'made for it. That is a gap in the record, not an outage. Your design ' +
      'is unaffected.'
    )
  }
  return (
    `The ${label} source did not respond, so the report could not be made. ` +
    'It is a public dataset and goes down from time to time. Your design is ' +
    'unaffected. Try again in a moment.'
  )
}

export function reportFailureCopy(failure) {
  if (failure?.failedLayer?.label) return sourceFailureCopy(failure.failedLayer)
  return REPORT_FAILURE_COPY[failure?.kind] ?? REPORT_FAILURE_COPY.default
}

/** A size worth reading, or null when the server did not send one. */
function readableSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * THE PAGE'S OWN STATES, derived from the store's resume state and the URL.
 *
 *   loading   a session id is known and the document has not landed
 *   absent    no session id on this link, or the server does not hold it
 *   error     the resume failed for a reason that is not a 404
 *   ready     a document is in the store
 */
export const PAGE_LOADING = 'loading'
export const PAGE_ABSENT = 'absent'
export const PAGE_ERROR = 'error'
export const PAGE_READY = 'ready'

export function pageStateFor({ resume, sessionId, error, linkedSessionId }) {
  if (sessionId) return PAGE_READY
  if (resume === 'loading') return PAGE_LOADING
  if (resume === 'absent') return PAGE_ABSENT
  if (error) return PAGE_ERROR
  // `idle` with a session on the link: the provider's resume effect has not
  // dispatched yet. Without one, there is nothing to wait for.
  return linkedSessionId ? PAGE_LOADING : PAGE_ABSENT
}

export const ABSENT_TITLE = 'There is no design on this link.'
export const ABSENT_BODY =
  'A report page belongs to a design. This link names none, or names one the server no ' +
  'longer holds. Start on the map and the report will be a step away once the design is done.'
export const ABSENT_ACTION = 'Go to the map'
export const ERROR_TITLE = 'The server did not answer.'
export const ERROR_BODY =
  'Your design could not be loaded just now. Nothing about it has changed. Try again in a moment.'

export default function ReportPage() {
  const { state, actions } = useSession()
  const sessionId = selectSessionId(state)
  const resume = selectResumeState(state)
  const sessionError = selectSessionError(state)
  const report = selectReport(state)
  const offered = selectReportIsOffered(state)
  const pageState = pageStateFor({
    resume,
    sessionId,
    error: sessionError,
    linkedSessionId: readSessionIdFromUrl(),
  })
  const own = useLandformPages(sessionId)
  const headingRef = useRef(null)
  const titleId = useId()

  // FOCUS IN ON ARRIVAL, BACK OUT TO THE OPENER ON LEAVING; the document
  // title says which page this is; the page beneath stops scrolling. All
  // undone from the cleanup, which runs on every way this leaves the tree.
  useLayoutEffect(() => {
    const opener = document.activeElement
    const previousTitle = document.title
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    document.title = DOCUMENT_TITLE
    if (window.history.state?.from === 'wizard') headingRef.current?.focus({ preventScroll: true })
    return () => {
      root.style.overflow = previousOverflow
      document.title = previousTitle
      if (opener && typeof opener.focus === 'function' && opener.isConnected && opener !== document.body) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  const back = useCallback((event) => {
    event.preventDefault()
    // THE WIZARD IS ONE STEP BACK when this page was reached from it, and
    // the history entry says so (DeliveryPanel marks it). Then back is the
    // browser's own back, which keeps the history honest. A direct load has
    // no such entry, and the link goes to the wizard with the session along.
    if (window.history.state?.from === 'wizard') window.history.back()
    else navigate(withCurrentSearch(WIZARD_PATH))
  }, [])

  return (
    <div className="report-page" data-testid="report-page" data-state={pageState}>
      <nav className="report-page__nav shell shell--prose">
        <a
          className="report-page__back"
          href={withCurrentSearch(WIZARD_PATH)}
          onClick={back}
          data-testid="report-back"
        >
          <span aria-hidden="true">← </span>
          {BACK_LABEL}
        </a>
        <span className="report-page__mark">Keyline Designer</span>
      </nav>

      <main className="report-page__body shell shell--prose" aria-labelledby={titleId}>
        <h1 className="report-page__title" id={titleId} ref={headingRef} tabIndex={-1}>
          {PAGE_TITLE}
        </h1>

        {pageState === PAGE_ABSENT ? (
          <Notice title={ABSENT_TITLE} body={ABSENT_BODY} testid="report-absent">
            <a
              className="chrome-banner__button chrome-banner__button--primary report-page__action"
              data-tone="primary"
              href={WIZARD_PATH}
              data-testid="report-absent-action"
              onClick={(event) => {
                event.preventDefault()
                navigate(WIZARD_PATH)
              }}
            >
              {ABSENT_ACTION}
            </a>
          </Notice>
        ) : null}
        {pageState === PAGE_ERROR ? <Notice title={ERROR_TITLE} body={ERROR_BODY} testid="report-error" /> : null}

        {/* 1. What it is. */}
        {PAGE_LEDE.map((sentence, index) => (
          <p
            key={index}
            className={index === 0 ? 'report-page__lede' : 'report-page__lede-tail'}
            data-testid={index === 0 ? 'report-lede' : undefined}
          >
            {sentence}
          </p>
        ))}

        {/* 2. Four named figures. */}
        <section className="report-page__section" aria-labelledby={`${titleId}-figures`}>
          <h2 className="report-page__heading" id={`${titleId}-figures`}>
            {FIGURES_HEADING}
          </h2>
          <ul className="report-page__figures" data-testid="report-figures">
            {KEY_FIGURES.map((figure) => (
              <li key={figure.id} className="report-page__figure" data-figure={figure.id}>
                <strong className="report-page__figure-name">{figure.name}</strong>
                <span className="report-page__figure-body">{figure.body}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. The user's own Landform pages. */}
        <section className="report-page__section" aria-labelledby={`${titleId}-own`}>
          <h2 className="report-page__heading" id={`${titleId}-own`}>
            {OWN_PAGES_HEADING}
          </h2>
          <p className="report-page__own-body">{OWN_PAGES_BODY}</p>
          <OwnPages pageState={pageState} own={own} />
        </section>

        {/* 4. The contents. */}
        <section className="report-page__section" aria-labelledby={`${titleId}-contents`}>
          <h2 className="report-page__heading" id={`${titleId}-contents`}>
            {CONTENTS_HEADING}
          </h2>
          <dl className="report-page__contents" data-testid="report-contents">
            {REPORT_CONTENTS.map((section) => (
              <div key={section.id} className="report-page__contents-row" data-section={section.id}>
                <dt className="report-page__section-name">{section.name}</dt>
                <dd className="report-page__section-body">
                  {section.lines.map((run, index) =>
                    typeof run === 'string' ? (
                      <span key={index}>{run}</span>
                    ) : (
                      <strong key={index} className="report-page__key" data-testid="report-key-line">
                        {run.strong}
                      </strong>
                    )
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 5. THE FOOT: THE PRICE'S ROW. Its leading edge holds the one line of
            state (the wait, the failure, what the file is); its trailing edge
            holds the action. A price takes the leading edge and a purchase
            the trailing one without the layout moving. Until then the action
            generates, as it always has. */}
        {pageState === PAGE_READY ? (
          <Foot report={report} offered={offered} generate={actions.generateReport} />
        ) : null}
      </main>
    </div>
  )
}

function Notice({ title, body, testid, children }) {
  return (
    <div className="report-page__notice" role="status" data-testid={testid}>
      <p className="report-page__notice-title">{title}</p>
      <p className="report-page__notice-body">{body}</p>
      {children}
    </div>
  )
}

/**
 * The three slots. Filled with the user's pages when they have come; three
 * page-shaped frames and one line while they are coming, or while the
 * design itself is still loading; one line when they could not be made.
 * The slots are the marketing page's sample slots (ReportSamples.jsx, App.css
 * .sample-*), so a page here reads as a page there does, and a press on one
 * opens the same maximised view.
 */
function OwnPages({ pageState, own }) {
  const [openNumber, setOpenNumber] = useState(null)
  const openerRef = useRef(null)
  const pages = own.status === PAGES_READY && pageState === PAGE_READY ? own.pages : null
  const open = pages?.find((page) => page.number === openNumber) ?? null

  if (pageState === PAGE_ABSENT || pageState === PAGE_ERROR) return null

  if (pages) {
    return (
      <>
        <div className="sample-row report-page__pages" data-testid="own-pages" data-status="ready">
          {pages.map((page) => (
            <figure className="sample" key={page.number}>
              <button
                type="button"
                className="sample__open"
                aria-haspopup="dialog"
                aria-expanded={openNumber === page.number}
                data-testid={`own-page-open-${page.number}`}
                onClick={(event) => {
                  openerRef.current = event.currentTarget
                  setOpenNumber(page.number)
                }}
              >
                <img
                  className="sample__thumb"
                  src={page.thumbUrl}
                  width={page.thumbWidth}
                  height={page.thumbHeight}
                  decoding="async"
                  alt={page.alt}
                  data-testid={`own-page-${page.number}`}
                />
                <span className="visually-hidden"> View at full size.</span>
              </button>
              <figcaption className="eyebrow">{page.label}</figcaption>
            </figure>
          ))}
        </div>
        {open ? (
          <SampleView
            sample={{
              id: `own-${open.number}`,
              label: open.label,
              title: open.label,
              alt: open.alt,
              thumb: open.thumbUrl,
              full: open.url,
            }}
            onClose={() => setOpenNumber(null)}
            returnTo={openerRef}
          />
        ) : null}
      </>
    )
  }

  if (own.status === PAGES_FAILED && pageState === PAGE_READY) {
    return (
      <p className="report-page__pages-note report-page__pages-note--failed" role="status" data-testid="own-pages-failed">
        {OWN_PAGES_FAILED}
      </p>
    )
  }

  // COMING. No bar: the server reports no progress and the wait is seconds.
  // The frames hold the slots' height so nothing below jumps when the pages
  // land; the line says what is happening, once.
  return (
    <>
      <div className="sample-row report-page__pages" data-testid="own-pages" data-status="pending" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div className="sample report-page__slot" key={n} />
        ))}
      </div>
      <p className="report-page__pages-note" role="status" data-testid="own-pages-waiting">
        {pageState === PAGE_LOADING ? OWN_PAGES_LOADING_DESIGN : OWN_PAGES_WAITING}
      </p>
    </>
  )
}

/** The foot: state on the left, the action on the right. */
function Foot({ report, offered, generate }) {
  const working = report.status === REPORT_WORKING
  const failed = report.status === REPORT_FAILED_STATUS
  const ready = report.status === REPORT_READY_STATUS && report.download?.url
  const size = ready ? readableSize(report.download.sizeBytes) : null

  return (
    <div className="report-page__foot" data-testid="report-action" data-status={report.status}>
      <div className="report-page__state">
        {working ? (
          <div className="report-page__progress" data-testid="report-waiting">
            <ReportProgress progress={report.progress} />
          </div>
        ) : null}
        {failed && report.progress?.total ? (
          <div className="report-page__progress" data-testid="report-stopped">
            <ReportProgress progress={report.progress} failed />
          </div>
        ) : null}
        {ready ? (
          <p className="report-page__note" data-testid="report-ready-note">
            {size ? `PDF, ${size}. ` : 'PDF. '}Take it now — the link is not kept.
          </p>
        ) : null}
        {failed ? (
          <p
            className="report-page__note report-page__note--failed"
            role="status"
            data-testid="report-failure"
            data-failure={report.failure?.kind ?? 'unavailable'}
            data-failed-layer={report.failure?.failedLayer?.type ?? undefined}
          >
            {reportFailureCopy(report.failure)}
          </p>
        ) : null}
        {!offered && !working && !ready && !failed ? (
          <p className="report-page__note" data-testid="report-not-offered">
            {NOT_OFFERED_COPY}
          </p>
        ) : null}
      </div>

      {ready ? (
        <a
          className="chrome-banner__button chrome-banner__button--primary report-page__action"
          data-tone="primary"
          data-testid="report-download"
          href={report.download.url}
          download={report.download.filename}
        >
          {DOWNLOAD_LABEL}
        </a>
      ) : offered || working ? (
        <button
          type="button"
          className="chrome-banner__button chrome-banner__button--primary report-page__action"
          data-tone="primary"
          data-testid="report-generate"
          disabled={working}
          onClick={() => generate()}
        >
          {working ? REPORT_WORKING_LABEL : REPORT_LABEL}
        </button>
      ) : null}
    </div>
  )
}
