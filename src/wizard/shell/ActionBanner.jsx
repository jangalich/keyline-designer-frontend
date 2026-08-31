/**
 * ActionBanner.jsx  —  REGION E, a card in the bottom-right corner.
 *
 * SIZED TO ITS BUTTONS. It was a full-width band whose contents were one or
 * two right-aligned buttons, so nine tenths of it was empty sheet over the
 * map. The card is drawn around what was already there; the corner is where
 * the pointer was already travelling. It shares the bottom row with the tab
 * strip and holds that corner against it -- see App.css.
 *
 *
 * WHAT THE STATE OFFERS, AND NOTHING ELSE. The banner renders the list the
 * cursor step's `buttons` declares for the state it is in, in order, and knows
 * nothing about any of them beyond the five fields stepButton() defines.
 *
 * A LIST, NOT A PAIR, AND THE DIFFERENCE IS LOAD-BEARING. Boundary's editing
 * and reviewing states each offer two; landform's editing offers one, because
 * a ring going down has no forward move to name -- it is closed on the map by
 * clicking its first corner, and the only thing a banner can add is the way
 * out. A banner written for two would have had to render an empty slot or a
 * disabled placeholder, and both of those are a control that does nothing.
 * An empty list is a real answer too: a request in flight offers nothing.
 *
 * TWO CONFIRMATIONS, AND THEY ARE NOT THE SAME MECHANISM ON PURPOSE.
 *
 *   THE REOPEN's is the MACHINE's, because the cost it has to name -- which
 *   downstream steps will lose work -- is the store's answer
 *   (selectStepsResetByReopen), recomputed against the document each time. A
 *   sentence a definition could write would be a guess about a document it has
 *   not seen.
 *
 *   EVERY OTHER ONE is the button's own `confirm`, held here. The boundary's
 *   "start a different property" is the only current use, and what it costs is
 *   a sentence its own definition can write because it reads the same store.
 *
 * THE COMMIT'S AUTO-ADVANCE IS NOT HERE. It is in COMMIT_BUTTON, which every
 * step shares -- see stepDefinitions. There is no "Next step" button in this
 * banner and there is not meant to be.
 */

import { useState } from 'react'

import { useWizardCursor } from '../WizardCursor.jsx'

/** A step id as a person reads it, from its definition when we have one. */
function titleFor(stepId, definitions) {
  return definitions?.get(stepId)?.title ?? stepId
}

export default function ActionBanner({ machine, chromeState, definitions }) {
  const { arm, disarm, armed, advance } = useWizardCursor()
  // Which button is waiting on its own confirmation, or null. One at a time:
  // a banner holds at most two buttons and a confirmation covers the banner.
  const [confirming, setConfirming] = useState(null)

  const { definition, stepId } = machine
  const buttons = definition.buttons[chromeState] ?? EMPTY

  // Everything a button is handed. Assembled once, so a button reads the same
  // world the bar above it is describing.
  const chrome = { machine, arm, disarm, armed, advance }

  const pending = confirming ? buttons.find((button) => button.key === confirming) : null

  return (
    <div className="chrome-banner" data-testid={`banner-${stepId}`}>
      <div className="chrome-banner__actions" data-testid={`actions-${stepId}`}>
        {buttons.map((button) => {
          const enabled = button.enabled(chrome)
          return (
            <button
              key={button.key}
              type="button"
              className={`chrome-banner__button chrome-banner__button--${button.tone}`}
              data-testid={`${button.key}-${stepId}`}
              data-tone={button.tone}
              disabled={!enabled}
              title={enabled ? undefined : button.blocked(chrome) ?? undefined}
              onClick={() =>
                button.confirm ? setConfirming(button.key) : button.run(chrome)
              }
            >
              {button.label(chrome)}
            </button>
          )
        })}
      </div>

      {/* A BUTTON THAT NAMES WHAT IT COSTS BEFORE IT ACTS. */}
      {pending ? (
        <div
          className="chrome-banner__confirm"
          role="dialog"
          aria-modal="true"
          data-testid={`${pending.key}-confirm-${stepId}`}
        >
          <p data-testid={`${pending.key}-confirm-title-${stepId}`}>{pending.confirm.title}</p>
          <p data-testid={`${pending.key}-confirm-cost-${stepId}`}>
            {pending.confirm.body(chrome)}
          </p>
          <button
            type="button"
            data-testid={`${pending.key}-confirm-yes-${stepId}`}
            onClick={() => {
              setConfirming(null)
              pending.run(chrome)
            }}
          >
            {pending.confirm.yes}
          </button>
          <button
            type="button"
            data-testid={`${pending.key}-confirm-no-${stepId}`}
            onClick={() => setConfirming(null)}
          >
            {pending.confirm.no}
          </button>
        </div>
      ) : null}

      {/* THE REOPEN CONFIRMATION NAMES EXACTLY WHAT IT COSTS, and the names
          come from the store -- ONLY the downstream steps that actually HOLD
          work, never the full downstream list. Naming steps the user has never
          reached reads as a threat to work that does not exist, and trains
          them to click through the warning that will one day be real. */}
      {machine.confirmingReopen ? (
        <div
          className="chrome-banner__confirm"
          role="dialog"
          aria-modal="true"
          data-testid={`reopen-confirm-${stepId}`}
        >
          <p data-testid={`reopen-confirm-title-${stepId}`}>
            {definition.reopen?.confirmTitle ?? `Reopen ${definition.title}?`}
          </p>
          {machine.stepsResetByReopen.length ? (
            <p data-testid={`reopen-resets-${stepId}`}>
              This will discard the work in{' '}
              {machine.stepsResetByReopen.map((id) => titleFor(id, definitions)).join(', ')}.
            </p>
          ) : (
            <p data-testid={`reopen-resets-${stepId}`}>
              No later step holds work yet, so nothing else will be discarded.
            </p>
          )}
          <ul data-testid={`reopen-reset-list-${stepId}`}>
            {machine.stepsResetByReopen.map((id) => (
              <li key={id} data-testid={`reopen-reset-${id}`}>
                {titleFor(id, definitions)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid={`reopen-confirm-yes-${stepId}`}
            onClick={machine.confirmReopen}
          >
            Reopen this step
          </button>
          <button
            type="button"
            data-testid={`reopen-confirm-no-${stepId}`}
            onClick={machine.cancelReopen}
          >
            Keep it as it is
          </button>
        </div>
      ) : null}
    </div>
  )
}

const EMPTY = Object.freeze([])
