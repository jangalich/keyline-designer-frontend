/**
 * BoundaryPanel.jsx
 *
 * The boundary step's own body. Everything generic -- the header, the state,
 * the commit button, the error surface, the collapse -- belongs to StepPanel;
 * what is here is only what is true of drawing a boundary.
 *
 * IT DOES NOT DRAW THE MAP. The ring is held in the step's draft under the
 * `ring` input (BOUNDARY_RING_INPUT), and the existing DrawTool writes it
 * there through `onRingChange`. Wiring DrawTool to that callback is F3's --
 * the map layer stack and tool arming -- and until then this panel reports the
 * ring and App.jsx's spike keeps its own drawing exactly as it is.
 */

import { BOUNDARY_RING_INPUT, ringOf } from '../stepDefinitions'
import { STEP_COMMITTED } from '../useStepMachine'

export default function BoundaryPanel({ machine }) {
  const { machineState, draft, actions, stepId } = machine
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
      {ring.length > 0 ? (
        <button
          type="button"
          className="step-panel__secondary"
          data-testid="boundary-clear"
          // Delete and redraw is the whole edit vocabulary -- there is no
          // vertex editing anywhere in this app.
          onClick={() => actions.setDraftInput(stepId, BOUNDARY_RING_INPUT, [])}
        >
          Clear and redraw
        </button>
      ) : null}
    </div>
  )
}
