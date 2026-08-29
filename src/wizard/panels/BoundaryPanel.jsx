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

import { useToolArming } from '../WizardCursor.jsx'
import { BOUNDARY_RING_INPUT, ringOf } from '../stepDefinitions'
import { STEP_COMMITTED } from '../useStepMachine'

export default function BoundaryPanel({ machine }) {
  const { machineState, draft, actions, stepId } = machine
  const { armed, arm, disarm } = useToolArming()
  const ring = ringOf(draft)

  if (machineState === STEP_COMMITTED) {
    return (
      <p className="step-panel__line" data-testid="boundary-committed">
        Boundary set — {ring.length || 'the drawn'} outline is this session’s parcel.
      </p>
    )
  }

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
