/**
 * BoundaryPanel.jsx
 *
 * The boundary step's own body. Everything generic -- the header, the state,
 * the commit button, the error surface, the collapse -- belongs to StepPanel;
 * what is here is only what is true of drawing a boundary.
 *
 * IT STILL DOES NOT DRAW THE MAP. What it does now is ARM: the buttons below
 * put one of the step's two declared tools -- 'draw', 'delete' -- into the
 * arming register, and the map stack mounts the components behind them. The
 * ring itself is the step's draft input (BOUNDARY_RING_INPUT), which DrawTool
 * writes through the register's `draw` gesture and this panel reads back.
 *
 * THERE IS NO `isDrawing` HERE, AND THAT IS THE POINT. The panel asks the
 * register what is armed rather than keeping its own flag, so the panel's
 * label and the map's behaviour cannot disagree -- and two tools cannot be
 * armed at once because the register holds one value.
 */

import { useState } from 'react'

import { selectStepsHoldingWork, useSessionSelector } from '../../session/SessionStore'
import { useToolArming } from '../WizardCursor.jsx'
import { BOUNDARY_RING_INPUT, ringOf } from '../stepDefinitions'
import { STEP_COMMITTED } from '../useStepMachine'

/**
 * A COMMITTED BOUNDARY, AND THE ONE ACTION THAT CAN UNDO IT.
 *
 * The boundary is not editable and there is no endpoint that would make it so:
 * every committed step's geometry was measured against this parcel, so a
 * different parcel is a different SESSION rather than a cascade within one.
 * That is why BOUNDARY_STEP declares `reopen: null`, and it is correct.
 *
 * BUT THE HONEST AFFORDANCE IS NOT "NO BUTTON". Someone who wants a different
 * property needs a way to get one, and the way is to start again -- so the
 * button exists and SAYS WHAT IT COSTS BEFORE IT ACTS. It used to be App.jsx's
 * "Redraw", which called clearSession() on the click: a user who had generated
 * and committed landform lost that work to a button labelled with a verb about
 * drawing.
 *
 * The confirmation names the steps that actually HOLD work, the same rule the
 * reopen warning follows and for the same reason. When nothing does, it says
 * that instead -- an unqualified "you will lose everything" over an empty
 * session is the warning that teaches people to click through.
 */
function CommittedBoundary({ ring, actions }) {
  const [confirming, setConfirming] = useState(false)
  const holdingWork = useSessionSelector(selectStepsHoldingWork)

  return (
    <div className="step-panel__body">
      <p className="step-panel__line" data-testid="boundary-committed">
        Boundary set — {ring.length || 'the drawn'} outline is this session’s parcel.
      </p>

      {confirming ? (
        <div
          className="step-panel__confirm"
          role="dialog"
          aria-modal="true"
          data-testid="boundary-restart-confirm"
        >
          <p data-testid="boundary-restart-title">Start a different property?</p>
          <p data-testid="boundary-restart-cost">
            {holdingWork.length
              ? 'The boundary cannot be moved — every step was measured against it — so this ' +
                'ends the session and discards the work in ' +
                holdingWork.join(', ') +
                '.'
              : 'The boundary cannot be moved — every step is measured against it — so this ' +
                'ends the session and starts a new one. No step holds work yet, so nothing ' +
                'else will be discarded.'}
          </p>
          <button
            type="button"
            data-testid="boundary-restart-yes"
            onClick={() => {
              setConfirming(false)
              // The store drops the document and every draft with it, which
              // puts the wizard's cursor back on the boundary step.
              actions.clearSession()
            }}
          >
            End this session and start again
          </button>
          <button
            type="button"
            data-testid="boundary-restart-no"
            onClick={() => setConfirming(false)}
          >
            Keep this property
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="step-panel__secondary"
          data-testid="boundary-restart"
          onClick={() => setConfirming(true)}
        >
          Start a different property
        </button>
      )}
    </div>
  )
}

export default function BoundaryPanel({ machine }) {
  const { machineState, draft, actions, stepId } = machine
  const { armed, arm, disarm } = useToolArming()
  const ring = ringOf(draft)

  if (machineState === STEP_COMMITTED) return <CommittedBoundary ring={ring} actions={actions} />

  return (
    <div className="step-panel__body">
      <p className="step-panel__line" data-testid="boundary-ring-count">
        {ring.length === 0
          ? 'No points placed yet.'
          : `${ring.length} point${ring.length === 1 ? '' : 's'} placed.`}
      </p>

      {armed === 'draw' ? (
        <button
          type="button"
          className="step-panel__secondary"
          data-testid="boundary-finish"
          // Disarming IS finishing. There is no separate "finished" flag to
          // set: a closed ring with nothing placing into it is what finished
          // means, and both the map and this panel derive it from the register.
          onClick={disarm}
          disabled={ring.length < 3}
        >
          Finish boundary
        </button>
      ) : (
        <button
          type="button"
          className="step-panel__secondary"
          data-testid="boundary-draw"
          onClick={() => arm('draw')}
        >
          {ring.length ? 'Add more points' : 'Draw the boundary'}
        </button>
      )}

      {ring.length > 0 ? (
        <button
          type="button"
          className="step-panel__secondary"
          data-testid="boundary-clear"
          // Delete and redraw is the whole edit vocabulary -- there is no
          // vertex editing anywhere in this app. Same call the map's `delete`
          // gesture makes, so the two affordances are one action.
          onClick={() => {
            disarm()
            actions.setDraftInput(stepId, BOUNDARY_RING_INPUT, [])
          }}
        >
          Clear and redraw
        </button>
      ) : null}
    </div>
  )
}
