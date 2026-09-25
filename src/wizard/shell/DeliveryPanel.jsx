/**
 * DeliveryPanel.jsx  —  WHAT THE ACTION AREA SAYS WHEN THE DESIGN IS DONE.
 *
 * The bottom-right corner is where every step's controls have lived, so it is
 * where a person's attention already is when the last step commits. On a
 * finished design it becomes the delivery state: it says the design is
 * complete, and it offers one action -- opening the site data report.
 *
 *
 * WHY HERE AND NOT UNDER THE RAIL, WHERE THE REPORT BUTTON USED TO BE
 *
 * The rail is a progress indicator: steps, each committed in order. The
 * report is not another one of them -- it is what happens when the sequence
 * is finished -- and a button hung below the rail's last row read as a step
 * that had lost its number. It is also the moment the product changes
 * character: everything before it is free and exploratory, and this is the
 * document. And a finished design used to simply stop; nothing said so.
 *
 * THE MAP STAYS AS IT IS BEHIND IT, showing the finished layout. That is the
 * right thing to be looking at while deciding whether to take the document
 * of it, so this is a card in the corner and not a sheet over the map.
 *
 *
 * WHEN IT APPEARS: A DERIVATION, NEVER A FLAG
 *
 * `selectReportIsOffered` -- every step in the document's own `step_order`
 * reading `committed`. Reopening any step cascades every step below it back
 * to `not_started` in the document the server returns, so the condition goes
 * false on the next hydrate and this card goes with it, with nothing here
 * noticing. A `designComplete` flag written when the last step committed
 * would survive that reopen.
 *
 * ON THE LAST STEP, AND ONLY WHILE NOTHING IS BEING EDITED. WizardShell's
 * StepChrome decides that (it holds the cursor and the machine); this
 * component still refuses to render on an unfinished design, so it cannot be
 * mounted into one by mistake. Opening another step from the rail shows that
 * step's own chrome alone: a finish state present everywhere would dilute it.
 *
 * THE STEP'S OWN "Edit this step" STAYS BENEATH IT, DEMOTED. Removing it
 * would leave no way back into the last step except reopening an earlier one,
 * which cascades. So two controls exist and one action reads: the card's is a
 * full-width oxide primary at the body size, and the reopen under it drops to
 * the smallest control in the shell, in muted ink, with a gap between them
 * (App.css, .chrome__actions--delivering).
 *
 *
 * THE WORDING. "See your site data report" names the artifact rather than
 * the machinery, and "see" is honestly what the next step does: it opens a
 * description of the document, and generation is a second, deliberate press
 * inside it.
 */

import { useCallback, useId, useRef, useState } from 'react'

import {
  REPORT_FAILED_STATUS,
  REPORT_READY_STATUS,
  REPORT_WORKING,
  selectReport,
  selectReportIsOffered,
  useSession,
} from '../../session/SessionStore'
import ReportOverlay from './ReportOverlay.jsx'

export const DELIVERY_TITLE = 'Your design is complete.'
export const DELIVERY_BODY = 'Every step is committed. The map shows the finished layout.'
export const DELIVERY_LABEL = 'See your site data report'

/**
 * WHAT THE CARD SAYS ABOUT A REPORT ALREADY ASKED FOR, while the overlay is
 * closed. One line, in the data face -- machine state, like the banner's
 * working line -- and the detail is in the overlay, one press away.
 */
const REPORT_STATE_LINE = Object.freeze({
  [REPORT_WORKING]: 'Your report is being made.',
  [REPORT_READY_STATUS]: 'Your report is ready to download.',
  [REPORT_FAILED_STATUS]: 'The last report could not be made.',
})

export default function DeliveryPanel() {
  const { state } = useSession()
  const offered = selectReportIsOffered(state)
  const report = selectReport(state)
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const titleId = useId()
  const close = useCallback(() => setOpen(false), [])

  if (!offered) return null

  const stateLine = REPORT_STATE_LINE[report.status] ?? null

  return (
    <section
      className="chrome-delivery"
      aria-labelledby={titleId}
      data-testid="delivery"
      data-status={report.status}
    >
      <h3 className="chrome-delivery__title" id={titleId}>
        {DELIVERY_TITLE}
      </h3>
      <p className="chrome-delivery__body">{DELIVERY_BODY}</p>
      {stateLine ? (
        <p className="chrome-delivery__state" data-testid="delivery-state">
          {report.status === REPORT_WORKING ? (
            <span className="chrome-banner__pulse" aria-hidden="true" />
          ) : null}
          {stateLine}
        </p>
      ) : null}
      <button
        ref={button}
        type="button"
        className="chrome-banner__button chrome-banner__button--primary chrome-delivery__action"
        data-tone="primary"
        data-testid="report-open"
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen(true)}
      >
        {DELIVERY_LABEL}
      </button>
      {open ? <ReportOverlay onClose={close} returnTo={button} /> : null}
    </section>
  )
}
