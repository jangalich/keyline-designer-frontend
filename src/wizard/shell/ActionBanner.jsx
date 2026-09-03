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
 * BUT "NO BUTTONS" IS NOT "NOTHING TO SAY", and conflating the two is what put
 * an empty white square in the corner during every commit. A state with a
 * request in flight has something to report and no control to report it with,
 * so it gets a line instead of a button; a state with neither gets no card at
 * all. See WORKING below and the guard beneath it.
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
import { COMMITTING, GENERATING, LOADING } from '../useStepMachine'

/**
 * THE THREE STATES THAT OFFER NOTHING BECAUSE SOMETHING IS IN FLIGHT, and what
 * the card says while they last.
 *
 * THIS SET IS NOT A LIST TO KEEP IN AGREEMENT WITH ANYTHING -- it is exactly
 * the set of states that declare `[]` buttons, and they declare `[]` for one
 * reason: a request is out and there is nothing to press until it answers.
 * `loading` gets it from documentStep's factory default, `generating` and
 * `committing` from every step that has them. No step declares an empty list
 * for any other reason, and a step that wanted to would be declaring a state
 * with no way out of it.
 *
 * WHY THE CARD STAYS AND DOES NOT EMPTY. The banner is where machine state is
 * reported, and `committing` is the machine state that most needs reporting:
 * the commit is the one action here that talks to a server, takes real time,
 * and can come back having done nothing. Before this, clicking Commit removed
 * the button and left the card's padding and hairline drawn around nothing --
 * a small white square in the corner, which says neither "working" nor
 * "finished" and reads as a rendering fault. The button unmounted; the region
 * did not.
 *
 * THE COPY IS THE MACHINE'S, NOT THE STEP'S. What is happening in these three
 * states is the same fact for all six steps, exactly as the instruction bar's
 * `loading` sentence is -- so a per-step declaration would be six rewrites of
 * three words, and the shell would be naming steps to do it.
 */
const WORKING = Object.freeze({
  [LOADING]: 'Fetching…',
  [GENERATING]: 'Generating…',
  [COMMITTING]: 'Committing…',
})

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
  const working = WORKING[chromeState] ?? null

  /**
   * NOTHING TO OFFER, NOTHING IN FLIGHT, NOTHING TO CONFIRM -> NO CARD.
   *
   * The other half of the empty-box fix, and the reason it is a rule rather
   * than a patch on `committing`. A region draws a surface and a hairline
   * because it has something to say; one with no buttons, no working line and
   * no dialogue has nothing, and an empty bordered box in the corner of a map
   * is the same defect wherever it comes from. Every state reachable today
   * either declares buttons or is one of the three above -- so this returns
   * null for no case that currently exists, and for every case a seventh state
   * or a fourth step definition could introduce. The detail panel takes the
   * same posture and its docblock makes the same argument: absent beats empty.
   */
  if (!buttons.length && !working && !pending && !machine.confirmingReopen) return null

  return (
    <div className="chrome-banner" data-testid={`banner-${stepId}`}>
      {working ? (
        /* A LINE THAT SAYS WHAT IS HAPPENING, in the space the buttons had.
           `role="status"` so it is announced rather than silently swapped in,
           which is the same treatment the instruction bar's direction takes. */
        <p className="chrome-banner__working" data-testid={`working-${stepId}`} role="status">
          <span className="chrome-banner__pulse" aria-hidden="true" />
          {working}
        </p>
      ) : null}
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
