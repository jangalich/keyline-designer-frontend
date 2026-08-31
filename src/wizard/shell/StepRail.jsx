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
 * BEFORE A SESSION EXISTS IT IS THE SAME RAIL, FROM GET /api/steps. It used
 * to be one row long -- the boundary alone -- on the grounds that the client
 * does not know the pipeline until a document tells it, and that a hardcoded
 * list here would be the second copy of STEP_ORDER both sides of this
 * codebase refuse to keep. The constraint was real; the conclusion was not.
 * The answer to "we must not hold a second copy" is to ASK THE SIDE THAT
 * OWNS IT, and the backend now serves that constant on a route of its own
 * (session_api's /api/steps), under the same key a document carries it under.
 * So the rail has one rendering and two sources for its order, never two
 * lists -- see stepCatalog.jsx and wizardStepOrder.
 *
 * WHAT THE USER GETS BACK is the shape of the whole job while they are still
 * drawing the boundary: six steps ahead, dimmed, saying they are not yet
 * reachable. The old rail showed one row during the boundary step and seven
 * after the first commit, which read as the pipeline appearing out of nowhere
 * rather than as progress through something that was always there.
 *
 * NOT YET REACHABLE IS A TREATMENT, NOT A DISABLED STATE. The rows stay
 * buttons and stay clickable: a click on the rail OPENS a step and does
 * nothing else, and opening a step you cannot start yet gets you the
 * instruction bar saying which step has to be committed first -- which is a
 * better answer to "why can I not do this" than a control that does not
 * respond. The reachability comes from the cursor provider, which derives it
 * once over the same order this renders (see WizardCursor); the rail does not
 * recompute it per row and does not own the rule.
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

/**
 * What one row's status column says.
 *
 * THREE FACTS, IN THE ORDER THEY MATTER TO SOMEONE READING THE RAIL.
 *
 *   'not built yet'  A step in the pipeline this build has no chrome for --
 *                    water through fencing. It is the most specific thing
 *                    true of that row and it outranks the others, because it
 *                    is the one that will still be true after every step
 *                    before it is committed. This is exactly what those rows
 *                    said before this branch, unchanged.
 *
 *   'not yet'        A step that is built and that you cannot get to, because
 *                    something before it is not committed. New, and only
 *                    because the rows it applies to are new: before this
 *                    branch nothing unreachable was ever on screen.
 *
 *   done / ready     A step you can act on, as it always read.
 *
 * The empty string is a real answer -- a reachable, not_started step is the
 * one you are being asked to do, and the rail already says so by marking it
 * the cursor.
 */
function statusWord({ registered, reachable, status }) {
  if (!registered) return 'not built yet'
  if (!reachable) return 'not yet'
  return STATUS_WORDS[status] ?? ''
}

export default function StepRail() {
  const { state } = useSession()
  const { order, definitions, cursorStepId, open, reachable } = useWizardCursor()

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
          const isReachable = reachable.has(stepId)

          return (
            <li
              key={stepId}
              className="chrome-rail__item"
              data-step-id={stepId}
              data-step-status={status}
              data-step-reachable={isReachable ? 'true' : 'false'}
              data-cursor={isCursor ? 'true' : 'false'}
            >
              <button
                type="button"
                className={
                  'chrome-rail__step' +
                  (isCursor ? ' chrome-rail__step--cursor' : '') +
                  (isReachable ? '' : ' chrome-rail__step--ahead')
                }
                aria-current={isCursor ? 'step' : undefined}
                data-testid={`rail-${stepId}`}
                onClick={() => open(stepId)}
              >
                <span className="chrome-rail__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="chrome-rail__name">{definition?.title ?? stepId}</span>
                <span className="chrome-rail__status">
                  {statusWord({ registered, reachable: isReachable, status })}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
