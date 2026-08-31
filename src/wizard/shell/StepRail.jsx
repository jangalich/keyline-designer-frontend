/**
 * StepRail.jsx  —  REGION A, the left edge.
 *
 * EVERY STEP THE DOCUMENT KNOWS ABOUT, IN THE ORDER IT RUNS, WITH ITS STATUS.
 * It is the only region that shows more than the step in hand, and that is
 * what it is for: the map is the document now, so the rail is the only place
 * the shape of the whole pipeline is visible.
 *
 * THE ORDER COMES OFF `step_order` (wizardStepOrder -> the store's
 * stepOrderFrom), never off `Object.keys(document.steps)`. Flask serialises
 * that object alphabetically -- fencing, landform, roads, structures, trees,
 * water -- so reading the keys would give six real step ids in a stable order
 * that is not the pipeline's, and nothing would throw.
 *
 * BEFORE A SESSION EXISTS THE RAIL IS ONE STEP LONG, and that is the honest
 * length rather than a gap to paper over. The client does not know the
 * pipeline until a document tells it; a hardcoded list here so the rail could
 * show a fuller table of contents would be the second copy of STEP_ORDER that
 * both sides of this codebase refuse to keep.
 *
 * A STEP IN THE ORDER WITH NO DEFINITION IS NAMED, NOT HIDDEN. water through
 * fencing are in every document's `step_order` and have no registry entry in
 * this branch. Dropping them would make the rail silently shorter than the
 * pipeline; claiming them would mean inventing chrome for payloads nobody has
 * seen. So they appear, in order, saying what they are.
 *
 * NO HOOK PER ROW. The rail reads each step's status straight off the store
 * through the step's own `status(state)` -- it never runs a step machine. A
 * hook per row would be a hook count that changes with `step_order`, which is
 * a rules-of-hooks violation waiting for the first document with a different
 * length; and every one of those machines would seed a draft for a step the
 * user is not on.
 *
 * A CLICK OPENS, AND OPENS ONLY. It moves the cursor and touches nothing else
 * -- the same posture a click on committed geometry takes. What a committed
 * step offers once it is open is that step's own business: the banner renders
 * whatever its definition declares for `committed`, which for most steps is an
 * "Edit this step" that names what a reopen costs and for the boundary is a
 * sentence saying it cannot be reopened at all. Reopening on the rail click
 * itself would hand someone a cascade they asked for by navigating.
 */

import { COMMITTED, GENERATED, selectStepStatus, useSession } from '../../session/SessionStore'
import { useWizardCursor } from '../WizardCursor.jsx'

/** What each status says on a row, in the terms the rail is read in. */
const STATUS_WORDS = {
  [COMMITTED]: 'done',
  [GENERATED]: 'ready',
}

export default function StepRail() {
  const { state } = useSession()
  const { order, definitions, cursorStepId, open } = useWizardCursor()

  return (
    <nav className="chrome-rail" aria-label="Design steps" data-testid="step-rail">
      <ol className="chrome-rail__list" data-testid="wizard-order">
        {order.map((stepId, index) => {
          const definition = definitions.get(stepId)
          // The step's own reader when it has one -- boundary's status is
          // whether a session exists, which no document carries. The store's
          // selector otherwise, which reads a step the document has never
          // carried as not_started.
          const status = definition ? definition.status(state) : selectStepStatus(state, stepId)
          const isCursor = stepId === cursorStepId
          const registered = definition != null

          return (
            <li
              key={stepId}
              className="chrome-rail__item"
              data-step-id={stepId}
              data-step-status={status}
              data-cursor={isCursor ? 'true' : 'false'}
            >
              <button
                type="button"
                className={`chrome-rail__step${isCursor ? ' chrome-rail__step--cursor' : ''}`}
                aria-current={isCursor ? 'step' : undefined}
                data-testid={`rail-${stepId}`}
                onClick={() => open(stepId)}
              >
                <span className="chrome-rail__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="chrome-rail__name">{definition?.title ?? stepId}</span>
                <span className="chrome-rail__status">
                  {registered ? STATUS_WORDS[status] ?? '' : 'not built yet'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
