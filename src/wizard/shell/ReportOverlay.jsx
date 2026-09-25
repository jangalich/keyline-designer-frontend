/**
 * ReportOverlay.jsx  —  WHAT THE SITE DATA REPORT IS, AND THE PLACE IT IS MADE.
 *
 * Opened from the delivery card (DeliveryPanel.jsx). It says what the
 * document contains, and it is where generation runs: press, wait, take the
 * file.
 *
 *
 * WHAT IT CARRIES, AND WHAT IT DOES NOT
 *
 * ONE LINE ABOUT WHAT THE REPORT IS, THEN ITS SECTIONS, AND IT ENDS ON THE
 * DESIGN. The sources-and-methods back matter is two pages of twenty-three
 * and is not listed: naming it invites the thought that some of the
 * document is bookkeeping, and anyone who cares about provenance finds it.
 *
 * THREE PHRASES ARE SET IN WEIGHT -- the seasonal water table, the soil
 * survey's ratings for a lane, and what each species yields on this soil.
 * None of them is on the interactive map, and all three take real effort to
 * assemble by hand. If the copy is edited, they stay prominent.
 *
 * NO EXCLUSIVITY IS CLAIMED. It is public data and the value is the
 * assembly; the lede says so, which is more credible to a consultant who
 * knows where it comes from than anything that implies otherwise.
 *
 * NO PREVIEW, NO PLACEHOLDER, NO EMPTY FRAME. Sample pages from the reference
 * property are planned for a section under the map; when that exists this
 * links to it. Until then the contents stand alone.
 *
 * ROOM FOR A PRICE, AND NOTHING THAT IMPLIES ONE. The foot is a row: its
 * trailing edge holds the action, its leading edge holds the one line of
 * state (the wait, the failure, what the file is). A price and a purchase
 * would take that row's two ends without the layout moving. Nothing here
 * says "buy", and the action generates as it always has.
 *
 *
 * BEHAVIOUR
 *
 * A MODAL DIALOGUE OVER THE MAP, PORTALLED INTO THE STAGE, the tutorial's
 * arrangement: the dim covers the map and its chrome and nothing beyond.
 * Focus moves in on open and is held there (Tab wraps; see trapTab); Escape,
 * the ×, and a click on the dim all close it, and focus goes back to the
 * control that opened it.
 *
 * CLOSING DOES NOT CANCEL. The report is the store's, not this component's:
 * a person can close this mid-wait and come back to it, and the delivery card
 * says the report is under way while they are gone.
 *
 *
 * THE WAIT -- the cycling phrases every long wait in this shell gets, from
 * the same hook, with the report's own set (WaitingLine.jsx's REPORTING).
 *
 *
 * THE FAILURES ARE TOLD APART BY THE KEY THE PAYLOAD CARRIES
 *
 *   A NAMED SOURCE  `failed_layer {type, label, reason}` -- Daymet is the one
 *                   required report-time layer today. The label is the
 *                   backend's display prose and is shown verbatim, as the
 *                   session-creation path shows it; the reason says whether
 *                   waiting can help (`source_unavailable`) or not
 *                   (`no_data_for_parcel`), and the copy follows it.
 *   EXPIRED         the session's working data is gone and a recommit
 *                   rebuilds it -- the one failure with an action behind it.
 *   ANYTHING ELSE   something outside the design did not answer. Nothing to
 *                   ask for, so the copy asks for nothing.
 *
 * NONE IS AN ERROR ABOUT THE DESIGN, and every sentence says so. The button
 * stays pressable in all three -- not an invitation, the absence of a
 * punishment for having pressed.
 *
 * THE SERVER'S OWN SENTENCE IS NOT RENDERED. It is carried for a log; the
 * wording of this UI is this repository's.
 *
 *
 * THE DOWNLOAD IS A LINK THE USER CLICKS, NOT AN AUTOMATIC SAVE: a save
 * without a gesture is what popup blockers stop, silently, and a person who
 * walked away during the wait comes back to something to look at and press.
 * `download` on the anchor is a hint -- the API is cross-origin, so the name
 * the file saves under (site-data-report.pdf) is the server's
 * Content-Disposition.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import {
  REPORT_EXPIRED,
  REPORT_FAILED_STATUS,
  REPORT_READY_STATUS,
  REPORT_WORKING,
  selectReport,
  useSession,
} from '../../session/SessionStore'
import { trapTab } from '../../tutorial/TutorialOverlay.jsx'
import WaitingLine, { REPORTING, useWaitingLine } from './WaitingLine.jsx'

export const OVERLAY_TITLE = 'Your site data report'

/** The one line about what the report is. */
export const OVERLAY_LEDE =
  'Twenty-three pages, compiled for this parcel from public survey data — the ' +
  'desk study a consultant assembles before designing anything.'

/**
 * THE SECTIONS, IN THE DOCUMENT'S ORDER, ENDING ON THE DESIGN.
 *
 * Each line is a list of runs; a run marked `strong` is one of the three the
 * interactive map does not give (see the docblock). Parts rather than markup,
 * so the copy is data a test can read and the emphasis is structural.
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

/** What the action says, for a design that has never been reported on. */
export const REPORT_LABEL = 'Generate the report'
export const REPORT_WORKING_LABEL = 'Making your report…'
export const DOWNLOAD_LABEL = 'Download the PDF'
export const CLOSE_LABEL = 'Close'

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
 *
 * THE REASON DECIDES THE LAST SENTENCE. An outage passes, so -- exactly as
 * the session-creation notice does -- it says to try again in a moment. A
 * source with no coverage for this land will say the same thing tomorrow, so
 * that copy says so plainly and asks for nothing. A reason this client does
 * not know reads as the outage, which is the backend's own default.
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

/** The element the overlay is placed in: the map's stage, as the tutorial's is. */
const STAGE_SELECTOR = '.map-stage'

export default function ReportOverlay({ onClose, returnTo }) {
  const { state, actions } = useSession()
  const report = selectReport(state)
  const cardRef = useRef(null)
  const titleId = useId()
  const ledeId = useId()
  // Called unconditionally, because it holds timers; it answers null for any
  // key it has no phrases for, so a report that is not working costs nothing.
  const waiting = useWaitingLine(report.status === REPORT_WORKING ? REPORTING : null)

  const working = report.status === REPORT_WORKING
  const failed = report.status === REPORT_FAILED_STATUS
  const ready = report.status === REPORT_READY_STATUS && report.download?.url
  const size = ready ? readableSize(report.download.sizeBytes) : null

  // FOCUS IN, AND BACK OUT TO THE OPENER. Restored from the cleanup, which
  // runs on every way this leaves the tree -- including the design stopping
  // being complete underneath it.
  useLayoutEffect(() => {
    const opener = returnTo?.current ?? document.activeElement
    cardRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [returnTo])

  // THE KEYS, ON THE DOCUMENT: Escape closes wherever focus has gone; Tab is
  // held inside the card.
  const close = useCallback(() => onClose?.(), [onClose])
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        trapTab(event, cardRef.current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  const container = returnTo?.current?.closest(STAGE_SELECTOR) ?? document.body

  return createPortal(
    <div className="report-overlay" data-testid="report-overlay">
      <div className="report-overlay__backdrop" data-testid="report-backdrop" onClick={close} />
      <div
        ref={cardRef}
        className="report-overlay__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ledeId}
        tabIndex={-1}
        data-testid="report-dialog"
        data-status={report.status}
      >
        <button
          type="button"
          className="report-overlay__close"
          aria-label={CLOSE_LABEL}
          data-testid="report-close"
          onClick={close}
        >
          <span aria-hidden="true">×</span>
        </button>

        <h2 className="report-overlay__title" id={titleId}>
          {OVERLAY_TITLE}
        </h2>
        <p className="report-overlay__lede" id={ledeId} data-testid="report-lede">
          {OVERLAY_LEDE}
        </p>

        <dl className="report-overlay__contents" data-testid="report-contents">
          {REPORT_CONTENTS.map((section) => (
            <div key={section.id} className="report-overlay__section" data-section={section.id}>
              <dt className="report-overlay__section-name">{section.name}</dt>
              <dd className="report-overlay__section-body">
                {section.lines.map((run, index) =>
                  typeof run === 'string' ? (
                    <span key={index}>{run}</span>
                  ) : (
                    <strong key={index} className="report-overlay__key" data-testid="report-key-line">
                      {run.strong}
                    </strong>
                  )
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="report-overlay__foot" data-testid="report-action">
          {/* THE LEADING EDGE: one line of state, or nothing. */}
          <div className="report-overlay__state">
            {working ? (
              /* `role="status"` so the fact is announced once when the wait
                 begins; the cycling phrases inside are aria-hidden by
                 WaitingLine itself. */
              <p className="report-overlay__note" role="status" data-testid="report-waiting">
                <span className="chrome-banner__pulse" aria-hidden="true" />
                <span>
                  {waiting ? (
                    <WaitingLine waiting={waiting} stepId="report" />
                  ) : (
                    /* No duration: nothing here knows how long is left. */
                    'This is the longest wait in the app.'
                  )}
                </span>
              </p>
            ) : null}
            {ready ? (
              <p className="report-overlay__note" data-testid="report-ready-note">
                {size ? `PDF, ${size}. ` : 'PDF. '}Take it now — the link is not kept.
              </p>
            ) : null}
            {failed ? (
              <p
                className="report-overlay__note report-overlay__note--failed"
                role="status"
                data-testid="report-failure"
                data-failure={report.failure?.kind ?? 'unavailable'}
                data-failed-layer={report.failure?.failedLayer?.type ?? undefined}
              >
                {reportFailureCopy(report.failure)}
              </p>
            ) : null}
          </div>

          {/* THE TRAILING EDGE: the one action. */}
          {ready ? (
            <a
              className="chrome-banner__button chrome-banner__button--primary report-overlay__action"
              data-tone="primary"
              data-testid="report-download"
              href={report.download.url}
              download={report.download.filename}
            >
              {DOWNLOAD_LABEL}
            </a>
          ) : (
            <button
              type="button"
              className="chrome-banner__button chrome-banner__button--primary report-overlay__action"
              data-tone="primary"
              data-testid="report-generate"
              disabled={working}
              onClick={() => {
                // THE PRESS DISABLES THIS BUTTON, and a disabled button drops
                // focus to <body> -- out of the dialogue. Focus goes to the
                // card instead, so the keyboard stays inside it for the wait.
                cardRef.current?.focus({ preventScroll: true })
                actions.generateReport()
              }}
            >
              {working ? REPORT_WORKING_LABEL : REPORT_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>,
    container
  )
}
