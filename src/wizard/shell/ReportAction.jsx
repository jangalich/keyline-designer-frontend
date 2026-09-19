/**
 * ReportAction.jsx  —  THE ONE THING YOU CAN DO WITH A FINISHED DESIGN.
 *
 * Press it, wait, download a PDF.
 *
 *
 * WHERE IT LIVES, AND WHY IT IS NOT IN THE ACTION BANNER
 *
 * The banner is STEP-SCOPED CHROME. Everything in it is declared by the
 * cursor step's own definition for the machine state that step is in, and it
 * changes completely when the cursor moves -- that is what lets six steps
 * share one shell. Generating a report is a SESSION-SCOPED action: it is
 * about the whole design, it is the same action whichever step the cursor
 * happens to be on, and putting it in the banner would mean either declaring
 * it on all six steps (six copies of one action) or on the last one (a
 * session action reachable only from the fencing step).
 *
 * THE RAIL IS THE ONE COMPONENT THAT IS ABOUT THE WHOLE SESSION. It shows
 * every step at once and it is the only region that persists unchanged across
 * the cursor. So this sits below its rows, where the thing it is about ends.
 *
 * IT IS NOT A ROW, AND THAT IS ENFORCED BY SHAPE RATHER THAN BY CAREFUL CSS.
 * It is outside the <ol> the rail renders its steps into, so the rail's list
 * is seven <li>s whatever this is doing. The help control in the corner has
 * the same history in reverse -- it WAS a row of the rail, "and read as an
 * eighth step" (App.css) -- and the lesson it left is the one applied here:
 * something below the steps that looks like a step will be read as one. So
 * this takes the action buttons' treatment (an oxide primary, cased) rather
 * than a row's, and sits under a rule that closes the list.
 *
 *
 * WHEN IT APPEARS: A DERIVATION, NEVER A FLAG
 *
 * `selectReportIsOffered` -- every step in the document's own `step_order`
 * reading `committed`. That is the same condition the rail already computes
 * for its all-done state and the same one that leaves the banner offering
 * only a reopen; this READS it rather than adding a second notion of
 * "finished".
 *
 * WHICH IS WHY REOPENING ANY STEP TAKES IT AWAY, with nothing here noticing.
 * A reopen cascades every step below it back to `not_started` in the document
 * the server sends back, so the condition is false on the next hydrate and
 * this renders nothing. A `designComplete` flag set when the last step
 * commits would look identical on a finished design and would SURVIVE that
 * reopen, because a reopen is not where it would be written. The test for
 * this is not "does the button appear"; it is "does reopening a MIDDLE step
 * remove it", which only the derivation passes.
 *
 *
 * THE WAIT
 *
 * The longest in the product, so it gets the cycling phrases every other wait
 * in this shell gets, from the same hook, with its own set and its own
 * threshold (WaitingLine.jsx's REPORTING). The phrases claim nothing about
 * which stage is running because nothing reports stages.
 *
 *
 * THE TWO FAILURES READ DIFFERENTLY BECAUSE THEY ARE DIFFERENT
 *
 *   EXPIRED     The session's working data is gone. The committed design is
 *               intact -- it is in the Design Document -- and reopening a
 *               step and committing it again rebuilds what expired. So the
 *               copy SAYS THAT: it is the one report failure with an action
 *               behind it.
 *
 *   UNAVAILABLE Something outside the design did not answer. There is no
 *               different attempt to make, so the copy does not invite one:
 *               no "try again", no "check your connection", nothing that
 *               sends someone back through their design looking for a
 *               mistake they did not make. It says what happened and that
 *               the design is unharmed.
 *
 * NEITHER IS AN ERROR ABOUT THE DESIGN, and the copy is written so that
 * neither can be read as one. The button stays where it is in both cases --
 * present, pressable, saying the same thing it said before. That is not an
 * invitation to retry; it is the absence of a punishment for having pressed.
 *
 * THE SERVER'S OWN SENTENCE IS NOT WHAT IS RENDERED. It is carried (the store
 * keeps it) and it is the right thing for a log, but the wording of this UI
 * is this repository's -- the same rule that keeps step TITLES here and not
 * on the wire.
 *
 *
 * THE DOWNLOAD IS A LINK THE USER CLICKS, NOT AN AUTOMATIC SAVE
 *
 * The obvious alternative is to start the download the moment the job
 * resolves, and it is worse on three counts. A save triggered without a
 * gesture is what popup blockers exist to stop, and a blocked one fails
 * silently. A person who walked away during a wait this long comes back to a
 * dialogue with no context, or to nothing at all if it timed out. And a
 * dismissed dialogue is unrecoverable if the link was never shown.
 *
 * A LINK IS RE-CLICKABLE, and the server is built for that: the report is
 * held by id and the same URL serves the same bytes any number of times, by
 * design and under test. So the wait ends in something to look at and press,
 * which is also the only arrangement in which the size is worth showing.
 *
 * `download` ON THE ANCHOR IS A HINT AND NOT THE MECHANISM. It is
 * cross-origin (the API is a different origin in every deployment), so the
 * attribute is ignored and the filename comes from the server's
 * Content-Disposition, which carries it for exactly this reason.
 */

import {
  REPORT_EXPIRED,
  REPORT_FAILED_STATUS,
  REPORT_READY_STATUS,
  REPORT_WORKING,
  selectReport,
  selectReportIsOffered,
  useSession,
} from '../../session/SessionStore'
import WaitingLine, { REPORTING, useWaitingLine } from './WaitingLine.jsx'

/** What the button says, for a design that has never been reported on. */
export const REPORT_LABEL = 'Generate report'

/**
 * THE FAILURE COPY, AND THE ONE RULE IT IS WRITTEN UNDER: say what happened,
 * and ask for something only when there is something to ask for.
 */
export const REPORT_FAILURE_COPY = Object.freeze({
  // ACTIONABLE, so it names the action. "Reopen a step and commit it again"
  // is the remedy the backend names too (`remedy: "reopen_and_recommit"`),
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

export function reportFailureCopy(failure) {
  return REPORT_FAILURE_COPY[failure?.kind] ?? REPORT_FAILURE_COPY.default
}

/** A size worth reading, or null when the server did not send one. */
function readableSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function ReportAction() {
  const { state, actions } = useSession()
  const offered = selectReportIsOffered(state)
  const report = selectReport(state)
  // THE HOOK IS CALLED UNCONDITIONALLY, above the early return, because it
  // holds timers: a conditional call would be a hook count that changes with
  // the document, which is the rules-of-hooks violation the rail's own
  // no-hook-per-row note is written against. It answers null for any key it
  // has no phrases for, so a report that is not working costs nothing.
  const waiting = useWaitingLine(report.status === REPORT_WORKING ? REPORTING : null)

  if (!offered) return null

  const working = report.status === REPORT_WORKING
  const failed = report.status === REPORT_FAILED_STATUS
  const ready = report.status === REPORT_READY_STATUS && report.download?.url
  const size = ready ? readableSize(report.download.sizeBytes) : null

  return (
    <div className="chrome-rail__report" data-testid="report-action" data-status={report.status}>
      {ready ? (
        <>
          {/* THE LINK IS THE PRIMARY once there is one: the wait is over and
              the only thing left to do is take the file. */}
          <a
            className="chrome-banner__button chrome-banner__button--primary chrome-rail__report-button"
            data-tone="primary"
            data-testid="report-download"
            href={report.download.url}
            download={report.download.filename}
          >
            Download your report
          </a>
          <p className="chrome-rail__report-note" data-testid="report-ready-note">
            {size ? `PDF, ${size}. ` : 'PDF. '}Take it now — the link is not kept.
          </p>
        </>
      ) : (
        <button
          type="button"
          className="chrome-banner__button chrome-banner__button--primary chrome-rail__report-button"
          data-tone="primary"
          data-testid="report-generate"
          disabled={working}
          onClick={() => actions.generateReport()}
        >
          {working ? 'Making your report…' : REPORT_LABEL}
        </button>
      )}

      {working && (
        /* THE SAME LINE THE INSTRUCTION BAR SHOWS, in this region's own slot.
           `role="status"` so the fact is announced once when the wait begins;
           the cycling phrases inside are aria-hidden by WaitingLine itself,
           for its own documented reason. */
        <p className="chrome-rail__report-note" role="status" data-testid="report-waiting">
          {waiting ? (
            <WaitingLine waiting={waiting} stepId="report" />
          ) : (
            /* WHAT STANDS BEFORE THE FIRST PHRASE HAS EARNED ITS PLACE --
               the instruction bar's declared line, in this region's terms.
               NO DURATION IN IT, for WaitingLine's own reason: nothing here
               knows how long the request has left. */
            'This is the longest wait in the app.'
          )}
        </p>
      )}

      {failed && (
        <p
          className="chrome-rail__report-note chrome-rail__report-note--failed"
          role="status"
          data-testid="report-failure"
          data-failure={report.failure?.kind ?? 'unavailable'}
        >
          {reportFailureCopy(report.failure)}
        </p>
      )}
    </div>
  )
}
